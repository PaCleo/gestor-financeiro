import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de `archiveBankItem` e `listActiveBankItems`
 * (lib/bank-item.ts, TASK-005 - resolve o DT-002).
 *
 * `@/lib/db` (o Proxy do Prisma - DT-004, `vi.spyOn` nao funciona nele) e
 * `@/lib/pluggy` sao mockados INTEIRAMENTE (`vi.mock`), como manda o
 * DT-004. Isso torna este arquivo um teste PURO de orquestracao: nenhuma
 * chamada de rede, nenhum banco real - so a ORDEM e as CHAMADAS entre
 * `deleteItemFromPluggy` e `prisma.bankItem.update/findUnique`.
 *
 * O teste mais importante da task inteira vive aqui: a prova de que, se
 * `deleteItemFromPluggy` rejeitar, `prisma.bankItem.update` NUNCA e
 * chamado - nao so que o resultado final bate, mas que a ORDEM de fato
 * importa (ver tambem o teste de integracao equivalente, que consulta o
 * Postgres real, em
 * tests/integration/bank-item-archive.integration.test.ts).
 *
 * Contrato assumido (definido pelo qa nesta task - ver secao 5 do
 * TASK-005.md - o coder implementa exatamente assim):
 *
 *   lib/bank-item.ts
 *     export class BankItemNotFoundError extends Error {}
 *     export async function archiveBankItem(bankItemId: string): Promise<{
 *       id: string;
 *       pluggyItemId: string;
 *       archivedAt: Date;
 *     }>
 *     export async function listActiveBankItems(): Promise<Array<{
 *       id: string;
 *       pluggyItemId: string;
 *       institution: string;
 *       status: string;
 *       executionStatus: string;
 *       state: BankItemState;
 *       lastSyncAt: Date | null;
 *     }>>
 *
 * archiveBankItem deve, NESTA ORDEM:
 *   1. `prisma.bankItem.findUnique({ where: { id: bankItemId } })` - se
 *      `null`, rejeitar com `BankItemNotFoundError` SEM chamar
 *      `deleteItemFromPluggy`;
 *   2. se `archivedAt` ja estiver preenchido, retornar imediatamente (sem
 *      chamar `deleteItemFromPluggy` nem `prisma.bankItem.update`) -
 *      idempotencia (Criterio 5);
 *   3. senao, chamar `deleteItemFromPluggy(bankItem.pluggyItemId)`
 *      PRIMEIRO - se rejeitar, propagar o erro e NAO chamar
 *      `prisma.bankItem.update` (Criterio 3 - a ordem e obrigatoria);
 *   4. so entao `prisma.bankItem.update({ where: { id: bankItemId }, data:
 *      { archivedAt: <novo Date> } })` e retornar o resultado reconstruido
 *      campo a campo (nunca o objeto cru do Prisma).
 *
 * listActiveBankItems deve chamar `prisma.bankItem.findMany({ where: {
 * archivedAt: null } })` e devolver cada item reconstruido campo a campo,
 * com `state` calculado por `deriveBankItemState`.
 */

const { findUniqueMock, updateMock, findManyMock, deleteItemFromPluggyMock } =
  vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    updateMock: vi.fn(),
    findManyMock: vi.fn(),
    deleteItemFromPluggyMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: {
    bankItem: {
      findUnique: findUniqueMock,
      update: updateMock,
      findMany: findManyMock,
    },
  },
}));

vi.mock("@/lib/pluggy", () => ({
  deleteItemFromPluggy: deleteItemFromPluggyMock,
}));

const BANK_ITEM_ID = "bankitem-cuid-123";
const PLUGGY_ITEM_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function buildMockBankItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BANK_ITEM_ID,
    pluggyItemId: PLUGGY_ITEM_ID,
    institution: "Banco Teste",
    status: "UPDATED",
    executionStatus: "SUCCESS",
    lastSyncAt: null,
    archivedAt: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("archiveBankItem - ordem obrigatoria: Pluggy primeiro, banco local depois (Criterio de aceite #3, o mais importante da task)", () => {
  it("chama deleteItemFromPluggy ANTES de prisma.bankItem.update (ordem verificada via invocationCallOrder, nao so o resultado final)", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);
    updateMock.mockResolvedValueOnce(
      buildMockBankItemRow({ archivedAt: new Date("2026-07-22T10:00:00.000Z") }),
    );

    const { archiveBankItem } = await import("@/lib/bank-item");
    await archiveBankItem(BANK_ITEM_ID);

    expect(deleteItemFromPluggyMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);

    const deleteOrder = deleteItemFromPluggyMock.mock.invocationCallOrder[0];
    const updateOrder = updateMock.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(updateOrder);
  });

  it("repassa o pluggyItemId correto (nao o id interno) para deleteItemFromPluggy", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);
    updateMock.mockResolvedValueOnce(buildMockBankItemRow({ archivedAt: new Date() }));

    const { archiveBankItem } = await import("@/lib/bank-item");
    await archiveBankItem(BANK_ITEM_ID);

    expect(deleteItemFromPluggyMock).toHaveBeenCalledWith(PLUGGY_ITEM_ID);
  });

  it("quando deleteItemFromPluggy rejeita, NUNCA chama prisma.bankItem.update - nada muda localmente", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    const pluggyError = new Error("Pluggy indisponivel (simulado)");
    deleteItemFromPluggyMock.mockRejectedValueOnce(pluggyError);

    const { archiveBankItem } = await import("@/lib/bank-item");

    await expect(archiveBankItem(BANK_ITEM_ID)).rejects.toThrow();

    expect(deleteItemFromPluggyMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("propaga o erro de deleteItemFromPluggy sem mascara-lo (a rota decide como traduzir)", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    class FakePluggyItemDeleteError extends Error {}
    const pluggyError = new FakePluggyItemDeleteError("falha simulada");
    deleteItemFromPluggyMock.mockRejectedValueOnce(pluggyError);

    const { archiveBankItem } = await import("@/lib/bank-item");

    let caughtError: unknown;
    try {
      await archiveBankItem(BANK_ITEM_ID);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBe(pluggyError);
  });
});

describe("archiveBankItem - Item ja nao existe na Pluggy (404 tratado como sucesso por deleteItemFromPluggy - Criterio 4)", () => {
  // NOTA (revisao pos-aprovacao da TASK-005): este arquivo mocka
  // `@/lib/pluggy` inteiro (deleteItemFromPluggyMock), entao NAO constroi o
  // objeto de erro cru da Pluggy - a traducao do shape real de "item nao
  // encontrado" (`{ code: 404, codeDescription: 'ITEM_NOT_FOUND' }`, SEM
  // `statusCode`) e responsabilidade exclusiva de `deleteItemFromPluggy`,
  // testada em detalhe em tests/unit/lib/pluggy.test.ts (onde o bug real
  // foi encontrado e corrigido: a implementacao checava `statusCode`, que o
  // SDK real nunca preenche). Aqui so testamos que `archiveBankItem`
  // reage corretamente quando essa camada de baixo RESOLVE - a fronteira
  // certa para este teste.
  it("quando deleteItemFromPluggy RESOLVE (mesmo tendo internamente tratado um 404), o arquivamento local acontece normalmente", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);
    const archivedAt = new Date("2026-07-22T12:00:00.000Z");
    updateMock.mockResolvedValueOnce(buildMockBankItemRow({ archivedAt }));

    const { archiveBankItem } = await import("@/lib/bank-item");
    const result = await archiveBankItem(BANK_ITEM_ID);

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: BANK_ITEM_ID },
      data: { archivedAt: expect.any(Date) },
    });
    expect(result.archivedAt).toEqual(archivedAt);
    expect(result.id).toBe(BANK_ITEM_ID);
    expect(result.pluggyItemId).toBe(PLUGGY_ITEM_ID);
  });
});

describe("archiveBankItem - idempotencia (Criterio de aceite #5)", () => {
  it("quando o BankItem ja esta arquivado, retorna sem chamar deleteItemFromPluggy nem prisma.bankItem.update, preservando o archivedAt original", async () => {
    const originalArchivedAt = new Date("2026-01-05T08:30:00.000Z");
    findUniqueMock.mockResolvedValueOnce(
      buildMockBankItemRow({ archivedAt: originalArchivedAt }),
    );

    const { archiveBankItem } = await import("@/lib/bank-item");
    const result = await archiveBankItem(BANK_ITEM_ID);

    expect(deleteItemFromPluggyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(result.archivedAt).toEqual(originalArchivedAt);
  });

  it("chamar archiveBankItem duas vezes seguidas so chama deleteItemFromPluggy/update na primeira vez", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);
    const archivedAt = new Date("2026-07-22T09:00:00.000Z");
    updateMock.mockResolvedValueOnce(buildMockBankItemRow({ archivedAt }));

    const { archiveBankItem } = await import("@/lib/bank-item");
    const firstResult = await archiveBankItem(BANK_ITEM_ID);

    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow({ archivedAt }));
    const secondResult = await archiveBankItem(BANK_ITEM_ID);

    expect(deleteItemFromPluggyMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(secondResult.archivedAt).toEqual(firstResult.archivedAt);
  });
});

describe("archiveBankItem - BankItem inexistente", () => {
  it("rejeita com BankItemNotFoundError quando o id nao existe, sem chamar deleteItemFromPluggy", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const { archiveBankItem, BankItemNotFoundError } = await import(
      "@/lib/bank-item"
    );

    await expect(archiveBankItem("id-que-nao-existe")).rejects.toBeInstanceOf(
      BankItemNotFoundError,
    );
    expect(deleteItemFromPluggyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("archiveBankItem - retorno reconstruido campo a campo (defesa contra vazamento, mesmo padrao de upsertBankItem)", () => {
  it("retorna somente id/pluggyItemId/archivedAt mesmo se o registro do banco tiver outros campos", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);
    updateMock.mockResolvedValueOnce(
      buildMockBankItemRow({ archivedAt: new Date() }),
    );

    const { archiveBankItem } = await import("@/lib/bank-item");
    const result = await archiveBankItem(BANK_ITEM_ID);

    expect(Object.keys(result).sort()).toEqual([
      "archivedAt",
      "id",
      "pluggyItemId",
    ]);
  });
});

describe("listActiveBankItems - consulta somente BankItems ativos (Criterio de aceite #6, camada unitaria)", () => {
  it("chama prisma.bankItem.findMany filtrando archivedAt: null", async () => {
    findManyMock.mockResolvedValueOnce([]);

    const { listActiveBankItems } = await import("@/lib/bank-item");
    await listActiveBankItems();

    expect(findManyMock).toHaveBeenCalledWith({ where: { archivedAt: null } });
  });

  it("reconstroi cada item com o state derivado de status/executionStatus", async () => {
    findManyMock.mockResolvedValueOnce([
      buildMockBankItemRow({
        id: "item-1",
        status: "UPDATED",
        executionStatus: "SUCCESS",
      }),
      buildMockBankItemRow({
        id: "item-2",
        status: "LOGIN_ERROR",
        executionStatus: "INVALID_CREDENTIALS",
      }),
    ]);

    const { listActiveBankItems } = await import("@/lib/bank-item");
    const result = await listActiveBankItems();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("item-1");
    expect(result[0].state).toBe("OK");
    expect(result[1].id).toBe("item-2");
    expect(result[1].state).toBe("PRECISA_ACAO");
  });

  it("reconstroi cada item campo a campo (nao espalha o registro cru do Prisma)", async () => {
    findManyMock.mockResolvedValueOnce([buildMockBankItemRow()]);

    const { listActiveBankItems } = await import("@/lib/bank-item");
    const result = await listActiveBankItems();

    expect(Object.keys(result[0]).sort()).toEqual(
      [
        "executionStatus",
        "id",
        "institution",
        "lastSyncAt",
        "pluggyItemId",
        "state",
        "status",
      ].sort(),
    );
  });
});
