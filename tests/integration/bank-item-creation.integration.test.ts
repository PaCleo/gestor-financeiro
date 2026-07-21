import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../setup/reset-db";

/**
 * Testes de integracao de `upsertBankItem` (TASK-004 - Persistir o BankItem
 * e modelar o estado do Item). Batem no Postgres real de teste (gestor_test),
 * como os testes de bank-item-deletion.integration.test.ts da TASK-002 -
 * mas aqui a funcao TAMBEM depende da Pluggy, entao mockamos `@/lib/pluggy`
 * inteiro (`fetchPluggyItem`) para nunca fazer nenhuma chamada de rede real,
 * enquanto o resto (Prisma, Postgres) e de verdade.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   lib/bank-item.ts
 *     export type BankItemState =
 *       "OK" | "SINCRONIZANDO" | "PRECISA_ACAO" | "ERRO" | "PARCIAL";
 *     export function deriveBankItemState(status, executionStatus): BankItemState
 *     export async function upsertBankItem(pluggyItemId: string): Promise<{
 *       id: string;
 *       pluggyItemId: string;
 *       institution: string;
 *       status: string;
 *       executionStatus: string;
 *       state: BankItemState;
 *     }>
 *
 * upsertBankItem deve:
 *   1. chamar `fetchPluggyItem(pluggyItemId)` de `lib/pluggy.ts` PRIMEIRO -
 *      se isso rejeitar, NENHUMA operacao de banco pode acontecer (Criterio
 *      de aceite #6: nada de registro parcial);
 *   2. com o resultado, fazer um UPSERT no BankItem por `pluggyItemId`
 *      (`@unique` no schema) - cria se nao existe, atualiza institution/
 *      status/executionStatus se ja existe (Criterio de aceite #5:
 *      idempotencia, sem estourar a constraint unica como erro 500);
 *   3. devolver o registro persistido MAIS o `state` computado por
 *      `deriveBankItemState(status, executionStatus)` - o `state` NAO e uma
 *      coluna no banco, so um campo calculado na resposta.
 *
 * Mapeamento -> docs/tasks/TASK-004.md secao 2/3:
 *   - Criterio 1: "persiste o BankItem com institution, status e
 *     executionStatus crus" -> describe "criacao"
 *   - Criterio 5: "idempotencia" -> describe "idempotencia"
 *   - Criterio 4: "PARTIAL_SUCCESS -> PARCIAL", "status PRECISA_ACAO",
 *     "valor desconhecido nao quebra" -> describes dedicados (a cobertura
 *     EXAUSTIVA de cada valor de status/executionStatus fica em
 *     tests/unit/lib/bank-item-state.test.ts, que testa a funcao pura
 *     `deriveBankItemState` isolada - aqui só confirmamos que o fluxo
 *     ponta a ponta com banco real preserva o mesmo comportamento)
 *   - Criterio 6: "falha da Pluggy nao deixa registro parcial" -> describe
 *     "falha da Pluggy"
 *   - Criterio 7: "taxNumber/PII nao persistida em nenhuma coluna" ->
 *     describe "PII"
 */

const { fetchPluggyItemMock } = vi.hoisted(() => ({
  fetchPluggyItemMock: vi.fn(),
}));

vi.mock("@/lib/pluggy", () => ({
  fetchPluggyItem: fetchPluggyItemMock,
}));

let uniqueCounter = 0;
function uniquePluggyItemId(): string {
  uniqueCounter += 1;
  return `pluggy-item-${Date.now()}-${uniqueCounter}`;
}

// CPF fabricado para teste - formato valido, NUNCA um CPF real. O payload
// real de PII vem de `Account.taxNumber` (docs/PREMISSA.md secao 11), que
// esta fora do escopo desta task (nenhuma Account e tocada aqui - ver
// TASK-004.md secao 4). Simulamos esse valor anexado ao retorno de
// `fetchPluggyItem` como defesa em profundidade: mesmo que a camada de
// `lib/pluggy.ts` falhasse em filtrar um campo assim (o que os testes de
// tests/unit/lib/pluggy.test.ts ja provam que NAO acontece), a camada de
// persistencia de `lib/bank-item.ts` tambem nao pode deixar esse valor
// chegar a nenhuma coluna. Licao do DT-011/TASK-003 aplicada: o payload
// mockado abaixo REALMENTE contem o CPF fabricado, entao a asserção de
// nao-vazamento tem poder de deteccao real.
const FAKE_CPF = "123.456.789-00";

beforeEach(async () => {
  await resetDatabase(prisma);
  vi.clearAllMocks();
});

afterEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("upsertBankItem - criacao (Cenario 1 / Criterio 1)", () => {
  it("persiste institution, status e executionStatus crus da Pluggy e retorna o registro com state calculado", async () => {
    const { upsertBankItem } = await import("@/lib/bank-item");
    const pluggyItemId = uniquePluggyItemId();
    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco Teste",
      status: "UPDATED",
      executionStatus: "SUCCESS",
    });

    const result = await upsertBankItem(pluggyItemId);

    expect(result.pluggyItemId).toBe(pluggyItemId);
    expect(result.institution).toBe("Banco Teste");
    expect(result.status).toBe("UPDATED");
    expect(result.executionStatus).toBe("SUCCESS");
    expect(result.state).toBe("OK");

    const row = await prisma.bankItem.findUnique({
      where: { pluggyItemId },
    });
    expect(row).not.toBeNull();
    expect(row?.institution).toBe("Banco Teste");
    expect(row?.status).toBe("UPDATED");
    expect(row?.executionStatus).toBe("SUCCESS");
  });

  it("chama fetchPluggyItem com o pluggyItemId recebido", async () => {
    const { upsertBankItem } = await import("@/lib/bank-item");
    const pluggyItemId = uniquePluggyItemId();
    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco Teste",
      status: "UPDATED",
      executionStatus: "SUCCESS",
    });

    await upsertBankItem(pluggyItemId);

    expect(fetchPluggyItemMock).toHaveBeenCalledWith(pluggyItemId);
  });
});

describe("upsertBankItem - idempotencia (Criterio de aceite #5)", () => {
  it("chamar duas vezes com o mesmo pluggyItemId deixa UM registro atualizado, sem estourar a constraint @unique como erro", async () => {
    const { upsertBankItem } = await import("@/lib/bank-item");
    const pluggyItemId = uniquePluggyItemId();

    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco A",
      status: "UPDATING",
      executionStatus: "ACCOUNTS_IN_PROGRESS",
    });
    const first = await upsertBankItem(pluggyItemId);

    const afterFirstCall = await prisma.bankItem.findMany({
      where: { pluggyItemId },
    });
    expect(afterFirstCall).toHaveLength(1);

    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco A",
      status: "UPDATED",
      executionStatus: "SUCCESS",
    });
    const second = await upsertBankItem(pluggyItemId);

    const afterSecondCall = await prisma.bankItem.findMany({
      where: { pluggyItemId },
    });
    expect(afterSecondCall).toHaveLength(1);
    expect(afterSecondCall[0].id).toBe(first.id);
    expect(second.id).toBe(first.id);
    expect(afterSecondCall[0].status).toBe("UPDATED");
    expect(afterSecondCall[0].executionStatus).toBe("SUCCESS");
    expect(second.state).toBe("OK");

    // Nao apenas "nao duplicou para esse pluggyItemId" - nenhum BankItem
    // orfao de nenhum outro tipo foi criado no processo.
    expect(await prisma.bankItem.count()).toBe(1);
  });
});

describe("upsertBankItem - PARTIAL_SUCCESS nunca vira OK, mesmo persistido (Criterio de aceite #4 - coracao da task)", () => {
  it("executionStatus PARTIAL_SUCCESS produz state PARCIAL e persiste o valor cru intacto", async () => {
    const { upsertBankItem } = await import("@/lib/bank-item");
    const pluggyItemId = uniquePluggyItemId();
    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco Teste",
      status: "UPDATED",
      executionStatus: "PARTIAL_SUCCESS",
    });

    const result = await upsertBankItem(pluggyItemId);

    expect(result.state).toBe("PARCIAL");
    expect(result.state).not.toBe("OK");

    const row = await prisma.bankItem.findUnique({ where: { pluggyItemId } });
    expect(row?.executionStatus).toBe("PARTIAL_SUCCESS");
  });
});

describe("upsertBankItem - status que exige acao do usuario (Criterio de aceite #4)", () => {
  it.each(["WAITING_USER_INPUT", "LOGIN_ERROR"])(
    "status %s produz state PRECISA_ACAO e persiste o valor cru",
    async (status) => {
      const { upsertBankItem } = await import("@/lib/bank-item");
      const pluggyItemId = uniquePluggyItemId();
      fetchPluggyItemMock.mockResolvedValueOnce({
        institution: "Banco Teste",
        status,
        executionStatus: "SUCCESS",
      });

      const result = await upsertBankItem(pluggyItemId);

      expect(result.state).toBe("PRECISA_ACAO");

      const row = await prisma.bankItem.findUnique({
        where: { pluggyItemId },
      });
      expect(row?.status).toBe(status);
    },
  );
});

describe("upsertBankItem - valor desconhecido nao quebra o fluxo ponta a ponta (Criterio de aceite #4)", () => {
  it("status e executionStatus desconhecidos sao persistidos verbatim e produzem um state seguro (nunca OK), sem lancar", async () => {
    const { upsertBankItem } = await import("@/lib/bank-item");
    const pluggyItemId = uniquePluggyItemId();
    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco Teste",
      status: "STATUS_NOVO_DA_PLUGGY_2027",
      executionStatus: "EXECUCAO_NOVA_DA_PLUGGY_2027",
    });

    const result = await upsertBankItem(pluggyItemId);

    expect(result.state).not.toBe("OK");
    expect([
      "OK",
      "SINCRONIZANDO",
      "PRECISA_ACAO",
      "ERRO",
      "PARCIAL",
    ]).toContain(result.state);

    const row = await prisma.bankItem.findUnique({ where: { pluggyItemId } });
    expect(row?.status).toBe("STATUS_NOVO_DA_PLUGGY_2027");
    expect(row?.executionStatus).toBe("EXECUCAO_NOVA_DA_PLUGGY_2027");
  });
});

describe("upsertBankItem - falha da Pluggy nao deixa registro parcial (Criterio de aceite #6)", () => {
  it("fetchPluggyItem rejeitando ANTES de qualquer BankItem existir - nenhum registro orfao e criado", async () => {
    const { upsertBankItem } = await import("@/lib/bank-item");
    const pluggyItemId = uniquePluggyItemId();
    fetchPluggyItemMock.mockRejectedValueOnce(
      new Error("PluggyItemFetchError simulado - item nao encontrado"),
    );

    await expect(upsertBankItem(pluggyItemId)).rejects.toThrow();

    const row = await prisma.bankItem.findUnique({
      where: { pluggyItemId },
    });
    expect(row).toBeNull();
    expect(await prisma.bankItem.count()).toBe(0);
  });

  it("fetchPluggyItem rejeitando numa segunda chamada (atualizacao) preserva o registro original intacto - nao apaga nem corrompe", async () => {
    const { upsertBankItem } = await import("@/lib/bank-item");
    const pluggyItemId = uniquePluggyItemId();

    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco Original",
      status: "UPDATED",
      executionStatus: "SUCCESS",
    });
    const original = await upsertBankItem(pluggyItemId);

    fetchPluggyItemMock.mockRejectedValueOnce(
      new Error("PluggyItemFetchError simulado - falha na atualizacao"),
    );
    await expect(upsertBankItem(pluggyItemId)).rejects.toThrow();

    const row = await prisma.bankItem.findUnique({
      where: { pluggyItemId },
    });
    expect(row).not.toBeNull();
    expect(row?.id).toBe(original.id);
    expect(row?.institution).toBe("Banco Original");
    expect(row?.status).toBe("UPDATED");
    expect(row?.executionStatus).toBe("SUCCESS");
    expect(await prisma.bankItem.count()).toBe(1);
  });
});

describe("upsertBankItem - PII nao e persistida em nenhuma coluna (Criterio de aceite #7)", () => {
  it("mesmo que fetchPluggyItem resolva com um campo extra parecido com PII (defesa em profundidade), nenhuma coluna do BankItem grava esse valor", async () => {
    const { upsertBankItem } = await import("@/lib/bank-item");
    const pluggyItemId = uniquePluggyItemId();
    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco Teste",
      status: "UPDATED",
      executionStatus: "SUCCESS",
      // Campo que `fetchPluggyItem` (lib/pluggy.ts) NUNCA deveria devolver
      // de verdade (ver tests/unit/lib/pluggy.test.ts) - simulado aqui como
      // segunda camada de defesa, ja que este mock substitui o modulo
      // inteiro de lib/pluggy.ts.
      taxNumber: FAKE_CPF,
    } as unknown as { institution: string; status: string; executionStatus: string });

    const result = await upsertBankItem(pluggyItemId);

    expect(Object.keys(result).sort()).toEqual([
      "executionStatus",
      "id",
      "institution",
      "pluggyItemId",
      "state",
      "status",
    ]);
    expect(JSON.stringify(result)).not.toContain(FAKE_CPF);

    const row = await prisma.bankItem.findUnique({ where: { pluggyItemId } });
    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(FAKE_CPF);
    // Nenhuma coluna extra/estranha foi usada para "esconder" o dado -
    // as colunas do BankItem sao exatamente as do schema (nenhuma coluna
    // chamada taxNumber ou similar existe).
    expect(Object.keys(row as object).sort()).toEqual(
      ["executionStatus", "id", "institution", "lastSyncAt", "pluggyItemId", "status"].sort(),
    );
  });
});
