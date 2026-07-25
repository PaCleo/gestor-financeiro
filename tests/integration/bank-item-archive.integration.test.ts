import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../setup/reset-db";
import { buildAccount, buildBankItem, buildTransaction } from "../fixtures/db";

/**
 * Testes de integracao de `archiveBankItem`/`listActiveBankItems`
 * (lib/bank-item.ts, TASK-005 - resolve o DT-002). Batem no Postgres real
 * de teste (gestor_test), com SOMENTE `@/lib/pluggy` mockado (nenhuma
 * chamada de rede a Pluggy e possivel).
 *
 * Este e o arquivo mais importante da task: o Criterio de aceite #3 exige
 * que a ORDEM (Pluggy primeiro, banco depois) seja realmente verificada, e
 * a unica prova que vale e consultar o Postgres DE VERDADE depois de uma
 * falha simulada da Pluggy - nao basta o mock de chamada ter sido
 * verificado (isso ja e feito em
 * tests/unit/lib/bank-item-archive.test.ts). Aqui, se `deleteItemFromPluggy`
 * falhar, o teste researcha o `BankItem` no banco e prova que `archivedAt`
 * continua `null` - o banco nunca some da listagem enquanto ainda
 * compartilha dados com a Pluggy.
 *
 * NOTA (revisao pos-aprovacao da TASK-005): este arquivo mocka
 * `@/lib/pluggy` inteiro, entao nao constroi o objeto de erro cru da
 * Pluggy - o shape REAL de "Item ja nao existe" (`{ code: 404,
 * codeDescription: 'ITEM_NOT_FOUND' }`, sem `statusCode`) e a traducao
 * desse shape em sucesso e responsabilidade de `deleteItemFromPluggy`,
 * coberta em detalhe (e onde o bug de deteccao via `statusCode` foi
 * encontrado e exposto) em tests/unit/lib/pluggy.test.ts. Aqui testamos
 * `archiveBankItem` na fronteira certa: como ele reage quando
 * `deleteItemFromPluggy` resolve ou rejeita, nao como esse resolve/rejeita
 * e decidido internamente.
 */

const { deleteItemFromPluggyMock } = vi.hoisted(() => ({
  deleteItemFromPluggyMock: vi.fn(),
}));

vi.mock("@/lib/pluggy", () => ({
  deleteItemFromPluggy: deleteItemFromPluggyMock,
}));

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

describe("archiveBankItem - a ordem e obrigatoria e verificada no Postgres real (Criterio de aceite #3, o mais importante da task)", () => {
  it("quando deleteItemFromPluggy falha, o BankItem PERSISTE com archivedAt null no banco - nada muda localmente", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    deleteItemFromPluggyMock.mockRejectedValueOnce(
      new Error("Pluggy indisponivel (simulado)"),
    );

    const { archiveBankItem } = await import("@/lib/bank-item");

    await expect(archiveBankItem(bankItem.id)).rejects.toThrow();

    // A prova real: reconsultar o Postgres, nao confiar no retorno da
    // funcao. Se a implementacao arquivasse localmente ANTES de chamar a
    // Pluggy (ordem errada), esta linha pegaria o bug mesmo que o
    // resultado da chamada estivesse "certo".
    const reloaded = await prisma.bankItem.findUniqueOrThrow({
      where: { id: bankItem.id },
    });
    expect(reloaded.archivedAt).toBeNull();
  });

  it("quando deleteItemFromPluggy tem sucesso, o BankItem passa a ter archivedAt preenchido no banco", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);

    const { archiveBankItem } = await import("@/lib/bank-item");
    const before = new Date();
    await archiveBankItem(bankItem.id);

    const reloaded = await prisma.bankItem.findUniqueOrThrow({
      where: { id: bankItem.id },
    });
    expect(reloaded.archivedAt).not.toBeNull();
    expect((reloaded.archivedAt as Date).getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
  });

  it("deleteItemFromPluggy e chamado com o pluggyItemId do BankItem correto, mesmo com varios BankItems no banco", async () => {
    const targetBankItem = await prisma.bankItem.create({
      data: buildBankItem(),
    });
    const otherBankItem = await prisma.bankItem.create({
      data: buildBankItem(),
    });
    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);

    const { archiveBankItem } = await import("@/lib/bank-item");
    await archiveBankItem(targetBankItem.id);

    expect(deleteItemFromPluggyMock).toHaveBeenCalledWith(
      targetBankItem.pluggyItemId,
    );
    expect(deleteItemFromPluggyMock).not.toHaveBeenCalledWith(
      otherBankItem.pluggyItemId,
    );

    const reloadedOther = await prisma.bankItem.findUniqueOrThrow({
      where: { id: otherBankItem.id },
    });
    expect(reloadedOther.archivedAt).toBeNull();
  });
});

describe("archiveBankItem - idempotencia no Postgres real (Criterio de aceite #5)", () => {
  it("desativar duas vezes nao quebra e preserva o archivedAt original", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);

    const { archiveBankItem } = await import("@/lib/bank-item");
    await archiveBankItem(bankItem.id);

    const afterFirst = await prisma.bankItem.findUniqueOrThrow({
      where: { id: bankItem.id },
    });
    expect(afterFirst.archivedAt).not.toBeNull();

    await expect(archiveBankItem(bankItem.id)).resolves.toBeDefined();

    const afterSecond = await prisma.bankItem.findUniqueOrThrow({
      where: { id: bankItem.id },
    });
    expect(afterSecond.archivedAt).toEqual(afterFirst.archivedAt);
    // deleteItemFromPluggy NAO deve ser chamado de novo na segunda vez -
    // o item ja esta arquivado, nao ha motivo para bater na Pluggy outra vez.
    expect(deleteItemFromPluggyMock).toHaveBeenCalledTimes(1);
  });
});

describe("archiveBankItem - BankItem inexistente (borda)", () => {
  it("rejeita ao tentar arquivar um id que nao existe no banco, sem chamar deleteItemFromPluggy", async () => {
    const { archiveBankItem, BankItemNotFoundError } = await import(
      "@/lib/bank-item"
    );

    await expect(
      archiveBankItem("bank-item-que-nao-existe"),
    ).rejects.toBeInstanceOf(BankItemNotFoundError);
    expect(deleteItemFromPluggyMock).not.toHaveBeenCalled();
  });
});

describe("listActiveBankItems - arquivados somem da listagem mas o registro e relacoes continuam na base (Criterio de aceite #6)", () => {
  it("um BankItem arquivado nao aparece em listActiveBankItems, mas o registro, suas Accounts e Transactions continuam intactos no banco", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    const transaction = await prisma.transaction.create({
      data: buildTransaction(account.id),
    });

    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);
    const { archiveBankItem, listActiveBankItems } = await import(
      "@/lib/bank-item"
    );
    await archiveBankItem(bankItem.id);

    const activeList = await listActiveBankItems();
    expect(activeList.map((item) => item.id)).not.toContain(bankItem.id);

    // O registro, a Account e a Transaction continuam na base - "arquivar"
    // NAO e "excluir". Consultado direto no Prisma, sem passar por
    // listActiveBankItems (que filtra de proposito).
    const survivingBankItem = await prisma.bankItem.findUnique({
      where: { id: bankItem.id },
    });
    const survivingAccount = await prisma.account.findUnique({
      where: { id: account.id },
    });
    const survivingTransaction = await prisma.transaction.findUnique({
      where: { id: transaction.id },
    });

    expect(survivingBankItem).not.toBeNull();
    expect(survivingBankItem?.archivedAt).not.toBeNull();
    expect(survivingAccount).not.toBeNull();
    expect(survivingAccount?.id).toBe(account.id);
    expect(survivingTransaction).not.toBeNull();
    expect(survivingTransaction?.id).toBe(transaction.id);
  });

  it("BankItems ativos (nao arquivados) continuam aparecendo em listActiveBankItems", async () => {
    const activeBankItem = await prisma.bankItem.create({
      data: buildBankItem(),
    });
    const archivedBankItem = await prisma.bankItem.create({
      data: buildBankItem(),
    });
    deleteItemFromPluggyMock.mockResolvedValueOnce(undefined);

    const { archiveBankItem, listActiveBankItems } = await import(
      "@/lib/bank-item"
    );
    await archiveBankItem(archivedBankItem.id);

    const activeList = await listActiveBankItems();
    const activeIds = activeList.map((item) => item.id);

    expect(activeIds).toContain(activeBankItem.id);
    expect(activeIds).not.toContain(archivedBankItem.id);
  });
});
