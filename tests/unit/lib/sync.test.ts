import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de lib/sync.ts (TASK-006 - Sync de Accounts e
 * Transactions, a primeira task da Fase 2).
 *
 * `@/lib/db` (Proxy do Prisma, DT-004 - `vi.spyOn` nao funciona nele),
 * `@/lib/pluggy` e `@/lib/bank-item` sao mockados INTEIRAMENTE (`vi.mock`)
 * - nenhuma chamada de rede real, nenhum banco real. Este arquivo prova a
 * ORQUESTRACAO (ordem de chamadas, mapeamento, guarda de arquivado) de
 * forma pura; a prova de PERSISTENCIA real (valores gravados no Postgres,
 * dedup por contagem, PII ausente por VALOR) fica em
 * tests/integration/sync.integration.test.ts - a mesma divisao de
 * responsabilidade de archiveBankItem/tests/unit/lib/bank-item-archive.test.ts
 * vs tests/integration/bank-item-archive.integration.test.ts.
 *
 * Contrato assumido (definido pelo qa nesta task - ver secao 5 do
 * TASK-006.md - o coder implementa exatamente assim):
 *
 *   lib/sync.ts
 *     export type PluggyRawAccountType = "BANK" | "CREDIT";
 *     export type PluggyRawAccountSubtype =
 *       "CHECKING_ACCOUNT" | "SAVINGS_ACCOUNT" | "CREDIT_CARD";
 *
 *     export function mapAccountType(type: string, subtype: string): string
 *     export function normalizeTransactionSign(accountType: string, amount: number): number
 *
 *     export class BankItemArchivedError extends Error {}
 *     export class BankItemNotFoundError extends Error {}
 *
 *     export async function syncBankItem(bankItemId: string): Promise<{
 *       bankItemId: string;
 *       accountsSynced: number;
 *       transactionsSynced: number;
 *     }>
 *
 *     export type SyncAllResult =
 *       | { bankItemId: string; status: "OK"; accountsSynced: number; transactionsSynced: number }
 *       | { bankItemId: string; status: "ERROR"; error: string };
 *     export async function syncAllActiveBankItems(): Promise<SyncAllResult[]>
 *
 * mapAccountType (Criterio de aceite #1):
 *   - ("BANK", "CHECKING_ACCOUNT") -> "CHECKING"
 *   - ("BANK", "SAVINGS_ACCOUNT") -> "SAVINGS"
 *   - ("CREDIT", "CREDIT_CARD") -> "CREDIT_CARD"
 *   - qualquer outra combinacao -> devolve o `subtype` cru (fallback seguro,
 *     nunca lanca - a Pluggy pode adicionar subtypes novos a qualquer
 *     momento, mesmo espirito de R6 de deriveBankItemState/TASK-004)
 *
 * normalizeTransactionSign (Criterio de aceite #3 - O CORACAO DA TASK,
 * resolve o DT-007):
 *   - accountType "BANK" -> amount inalterado (o sinal ja esta correto)
 *   - accountType "CREDIT" -> amount invertido (`-amount`) - uma compra
 *     positiva vira saida negativa; um pagamento de fatura negativo vira
 *     entrada positiva (convencao unica de inversao por CONTA, nao
 *     condicional ao `type` DEBIT/CREDIT da transacao, que e o MESMO
 *     "DEBIT" nos dois casos reais de compra/saida - ver secao 11 da
 *     PREMISSA)
 *   - qualquer outro accountType -> amount inalterado (fallback seguro)
 *
 * syncBankItem, NESTA ORDEM:
 *   1. `prisma.bankItem.findUnique({ where: { id: bankItemId } })` - se
 *      `null`, rejeita com `BankItemNotFoundError`;
 *   2. se `archivedAt` estiver preenchido, rejeita com
 *      `BankItemArchivedError` SEM chamar `fetchPluggyAccounts` nem
 *      `fetchPluggyAllTransactions` (Criterio de aceite #8);
 *   3. `fetchPluggyAccounts(bankItem.pluggyItemId)` (de `@/lib/pluggy`);
 *   4. para CADA account retornada, EM SERIE (nunca `Promise.all` - ADR 7
 *      da PREMISSA, 1 requisicao por vez):
 *      a. `prisma.account.upsert` por `pluggyAccountId` com
 *         `type: mapAccountType(rawAccount.type, rawAccount.subtype)` e
 *         `balance: rawAccount.balance`;
 *      b. `fetchPluggyAllTransactions(rawAccount.pluggyAccountId)` (de
 *         `@/lib/pluggy` - NUNCA o `fetchTransactions` deprecado, ja
 *         garantido dentro de `fetchPluggyAllTransactions` - ver
 *         tests/unit/lib/pluggy.test.ts);
 *      c. para CADA transacao retornada, EM SERIE, `prisma.transaction.upsert`
 *         por `pluggyTransactionId`, com `amount:
 *         normalizeTransactionSign(rawAccount.type, rawTx.amount)`,
 *         `category: rawTx.category` (cru, sem decisao - Criterio 9/DT-010),
 *         `method: rawTx.paymentMethod`, `status: rawTx.status`,
 *         `source: "PLUGGY"`;
 *   5. `prisma.bankItem.update({ data: { lastSyncAt: <novo Date> } })` -
 *      SO DEPOIS de todas as accounts/transactions sincronizadas;
 *   6. devolve `{ bankItemId, accountsSynced, transactionsSynced }`.
 *
 * syncAllActiveBankItems:
 *   - chama `listActiveBankItems()` (de `@/lib/bank-item`, reaproveita o
 *     filtro `archivedAt: null` ja testado na TASK-005);
 *   - para CADA item retornado, EM SERIE, chama `syncBankItem(item.id)`;
 *   - se `syncBankItem` rejeitar para um item, captura o erro (NAO
 *     interrompe os demais itens) e registra `{ status: "ERROR", error:
 *     <mensagem> }` para aquele item, continuando para o proximo.
 */

const {
  findUniqueMock,
  updateMock,
  accountUpsertMock,
  transactionUpsertMock,
  fetchPluggyAccountsMock,
  fetchPluggyAllTransactionsMock,
  listActiveBankItemsMock,
} = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  accountUpsertMock: vi.fn(),
  transactionUpsertMock: vi.fn(),
  fetchPluggyAccountsMock: vi.fn(),
  fetchPluggyAllTransactionsMock: vi.fn(),
  listActiveBankItemsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    bankItem: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
    account: {
      upsert: accountUpsertMock,
    },
    transaction: {
      upsert: transactionUpsertMock,
    },
  },
}));

vi.mock("@/lib/pluggy", () => ({
  fetchPluggyAccounts: fetchPluggyAccountsMock,
  fetchPluggyAllTransactions: fetchPluggyAllTransactionsMock,
}));

vi.mock("@/lib/bank-item", () => ({
  listActiveBankItems: listActiveBankItemsMock,
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

function buildSyncAccount(overrides: Record<string, unknown> = {}) {
  return {
    pluggyAccountId: "acc-1",
    name: "Conta Corrente",
    type: "BANK",
    subtype: "CHECKING_ACCOUNT",
    balance: 5230.11,
    ...overrides,
  };
}

function buildSyncTransaction(overrides: Record<string, unknown> = {}) {
  return {
    pluggyTransactionId: "tx-1",
    date: new Date("2026-07-20T12:00:00.000Z"),
    description: "Compra",
    amount: -100,
    type: "DEBIT",
    status: "POSTED",
    category: "Alimentação",
    paymentMethod: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("mapAccountType - traducao de tipo de conta (Criterio de aceite #1)", () => {
  it.each([
    ["BANK", "CHECKING_ACCOUNT", "CHECKING"],
    ["BANK", "SAVINGS_ACCOUNT", "SAVINGS"],
    ["CREDIT", "CREDIT_CARD", "CREDIT_CARD"],
  ])("mapAccountType(%s, %s) -> %s", async (type, subtype, expected) => {
    const { mapAccountType } = await import("@/lib/sync");

    expect(mapAccountType(type, subtype)).toBe(expected);
  });

  it("combinacao desconhecida nao lanca - devolve o subtype cru como fallback seguro", async () => {
    const { mapAccountType } = await import("@/lib/sync");

    expect(() => mapAccountType("BANK", "SOMETHING_NEW_2027")).not.toThrow();
    expect(mapAccountType("BANK", "SOMETHING_NEW_2027")).toBe(
      "SOMETHING_NEW_2027",
    );
  });
});

describe("normalizeTransactionSign - normalizacao de sinal por tipo de conta (Criterio de aceite #3, O CORACAO DA TASK, resolve o DT-007)", () => {
  it("conta corrente (BANK), saida DEBIT com amount JA negativo -> permanece negativo, sem alteracao", async () => {
    const { normalizeTransactionSign } = await import("@/lib/sync");

    // Valor real confirmado na sondagem (secao 11 da PREMISSA).
    expect(normalizeTransactionSign("BANK", -1806.01)).toBe(-1806.01);
  });

  it("conta corrente (BANK), entrada CREDIT com amount positivo -> permanece positivo", async () => {
    const { normalizeTransactionSign } = await import("@/lib/sync");

    expect(normalizeTransactionSign("BANK", 3000)).toBe(3000);
  });

  it("CARTAO (CREDIT), compra DEBIT com amount POSITIVO -> fica NEGATIVO no nosso modelo (a prova central do DT-007)", async () => {
    const { normalizeTransactionSign } = await import("@/lib/sync");

    // Se o mock trouxesse a compra ja negativa, este teste passaria mesmo
    // sem normalizacao nenhuma - por isso o input aqui e OBRIGATORIAMENTE
    // positivo (+138.83, valor real confirmado na sondagem).
    const rawPositiveCardPurchase = 138.83;
    expect(rawPositiveCardPurchase).toBeGreaterThan(0);

    const normalized = normalizeTransactionSign(
      "CREDIT",
      rawPositiveCardPurchase,
    );

    expect(normalized).toBe(-138.83);
    expect(normalized).toBeLessThan(0);
  });

  it("CARTAO (CREDIT), pagamento de fatura com amount NEGATIVO na Pluggy -> fica POSITIVO (convencao consistente de inversao por conta, nao condicional ao type da transacao)", async () => {
    const { normalizeTransactionSign } = await import("@/lib/sync");

    const normalized = normalizeTransactionSign("CREDIT", -500);

    expect(normalized).toBe(500);
    expect(normalized).toBeGreaterThan(0);
  });

  it("accountType desconhecido nao lanca - amount permanece inalterado (fallback seguro)", async () => {
    const { normalizeTransactionSign } = await import("@/lib/sync");

    expect(() => normalizeTransactionSign("INVESTMENT", 100)).not.toThrow();
    expect(normalizeTransactionSign("INVESTMENT", 100)).toBe(100);
  });
});

describe("syncBankItem - BankItem inexistente ou arquivado (Criterio de aceite #8)", () => {
  it("rejeita com BankItemNotFoundError quando o id nao existe, sem chamar fetchPluggyAccounts", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const { syncBankItem, BankItemNotFoundError } = await import(
      "@/lib/sync"
    );

    await expect(syncBankItem("id-inexistente")).rejects.toBeInstanceOf(
      BankItemNotFoundError,
    );
    expect(fetchPluggyAccountsMock).not.toHaveBeenCalled();
  });

  it("rejeita com BankItemArchivedError quando archivedAt esta preenchido, sem chamar fetchPluggyAccounts nem prisma.bankItem.update", async () => {
    findUniqueMock.mockResolvedValueOnce(
      buildMockBankItemRow({ archivedAt: new Date("2026-01-01T00:00:00.000Z") }),
    );

    const { syncBankItem, BankItemArchivedError } = await import(
      "@/lib/sync"
    );

    await expect(syncBankItem(BANK_ITEM_ID)).rejects.toBeInstanceOf(
      BankItemArchivedError,
    );
    expect(fetchPluggyAccountsMock).not.toHaveBeenCalled();
    expect(fetchPluggyAllTransactionsMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("syncBankItem - fluxo feliz: accounts e transactions em serie (Criterio de aceite #1/#2)", () => {
  it("persiste cada Account com o type mapeado e cada Transaction com o amount normalizado, atualiza lastSyncAt por ultimo", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    fetchPluggyAccountsMock.mockResolvedValueOnce([
      buildSyncAccount({ pluggyAccountId: "acc-1", type: "BANK", subtype: "CHECKING_ACCOUNT" }),
    ]);
    accountUpsertMock.mockResolvedValueOnce({ id: "internal-account-1" });
    fetchPluggyAllTransactionsMock.mockResolvedValueOnce([
      buildSyncTransaction({ pluggyTransactionId: "tx-1", amount: -50 }),
    ]);
    transactionUpsertMock.mockResolvedValueOnce({ id: "internal-tx-1" });
    updateMock.mockResolvedValueOnce(buildMockBankItemRow({ lastSyncAt: new Date() }));

    const { syncBankItem } = await import("@/lib/sync");
    const result = await syncBankItem(BANK_ITEM_ID);

    expect(result).toEqual({
      bankItemId: BANK_ITEM_ID,
      accountsSynced: 1,
      transactionsSynced: 1,
    });

    expect(accountUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pluggyAccountId: "acc-1" },
        create: expect.objectContaining({ type: "CHECKING" }),
        update: expect.objectContaining({ type: "CHECKING" }),
      }),
    );
    expect(fetchPluggyAllTransactionsMock).toHaveBeenCalledWith("acc-1");
    expect(transactionUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pluggyTransactionId: "tx-1" },
        create: expect.objectContaining({
          accountId: "internal-account-1",
          amount: -50,
        }),
      }),
    );

    // lastSyncAt so e atualizado DEPOIS de accounts/transactions - a ordem
    // e verificada via invocationCallOrder, nao so o resultado final.
    const transactionOrder = transactionUpsertMock.mock.invocationCallOrder[0];
    const updateOrder = updateMock.mock.invocationCallOrder[0];
    expect(transactionOrder).toBeLessThan(updateOrder);
  });

  it("chama fetchPluggyAccounts com o pluggyItemId do BankItem, nao o id interno", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    fetchPluggyAccountsMock.mockResolvedValueOnce([]);
    updateMock.mockResolvedValueOnce(buildMockBankItemRow());

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(BANK_ITEM_ID);

    expect(fetchPluggyAccountsMock).toHaveBeenCalledWith(PLUGGY_ITEM_ID);
  });

  it("normaliza o sinal por CONTA (CREDIT inverte) mesmo com type DEBIT identico ao da conta corrente - prova de integracao entre normalizeTransactionSign e o orquestrador", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    fetchPluggyAccountsMock.mockResolvedValueOnce([
      buildSyncAccount({ pluggyAccountId: "acc-credit", type: "CREDIT", subtype: "CREDIT_CARD" }),
    ]);
    accountUpsertMock.mockResolvedValueOnce({ id: "internal-credit-account" });
    fetchPluggyAllTransactionsMock.mockResolvedValueOnce([
      buildSyncTransaction({
        pluggyTransactionId: "tx-compra-cartao",
        type: "DEBIT",
        amount: 138.83, // POSITIVO na Pluggy - o payload real de uma compra.
      }),
    ]);
    transactionUpsertMock.mockResolvedValueOnce({ id: "internal-tx" });
    updateMock.mockResolvedValueOnce(buildMockBankItemRow());

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(BANK_ITEM_ID);

    expect(transactionUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ amount: -138.83 }),
      }),
    );
  });

  it("persiste category cru como vem, sem decisao (Criterio de aceite #9, investigacao do DT-010)", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    fetchPluggyAccountsMock.mockResolvedValueOnce([buildSyncAccount()]);
    accountUpsertMock.mockResolvedValueOnce({ id: "internal-account-1" });
    fetchPluggyAllTransactionsMock.mockResolvedValueOnce([
      buildSyncTransaction({ category: "Online shopping" }),
    ]);
    transactionUpsertMock.mockResolvedValueOnce({ id: "internal-tx-1" });
    updateMock.mockResolvedValueOnce(buildMockBankItemRow());

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(BANK_ITEM_ID);

    expect(transactionUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ category: "Online shopping" }),
      }),
    );
  });

  it("mapeia paymentMethod (ja extraido por fetchPluggyAllTransactions) para method, PIX/TED/BOLETO/OTHER (Criterio de aceite #7)", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    fetchPluggyAccountsMock.mockResolvedValueOnce([buildSyncAccount()]);
    accountUpsertMock.mockResolvedValueOnce({ id: "internal-account-1" });
    fetchPluggyAllTransactionsMock.mockResolvedValueOnce(
      ["PIX", "TED", "BOLETO", "OTHER"].map((paymentMethod, index) =>
        buildSyncTransaction({
          pluggyTransactionId: `tx-method-${index}`,
          paymentMethod,
        }),
      ),
    );
    transactionUpsertMock.mockResolvedValue({ id: "internal-tx" });
    updateMock.mockResolvedValueOnce(buildMockBankItemRow());

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(BANK_ITEM_ID);

    for (const [index, method] of ["PIX", "TED", "BOLETO", "OTHER"].entries()) {
      expect(transactionUpsertMock).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          create: expect.objectContaining({ method }),
        }),
      );
    }
  });

  it("varias accounts sao sincronizadas EM SERIE, nunca em paralelo (ADR 7 - accounts.length > 1)", async () => {
    findUniqueMock.mockResolvedValueOnce(buildMockBankItemRow());
    fetchPluggyAccountsMock.mockResolvedValueOnce([
      buildSyncAccount({ pluggyAccountId: "acc-1" }),
      buildSyncAccount({ pluggyAccountId: "acc-2" }),
    ]);
    accountUpsertMock
      .mockResolvedValueOnce({ id: "internal-account-1" })
      .mockResolvedValueOnce({ id: "internal-account-2" });
    fetchPluggyAllTransactionsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    updateMock.mockResolvedValueOnce(buildMockBankItemRow());

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(BANK_ITEM_ID);

    // A segunda conta so e processada (upsert + busca de transacoes) DEPOIS
    // que a primeira conta ja buscou suas transacoes - prova de que o
    // orquestrador nao dispara `Promise.all` sobre as accounts.
    const firstAccountUpsertOrder = accountUpsertMock.mock.invocationCallOrder[0];
    const firstAccountTxFetchOrder =
      fetchPluggyAllTransactionsMock.mock.invocationCallOrder[0];
    const secondAccountUpsertOrder = accountUpsertMock.mock.invocationCallOrder[1];

    expect(firstAccountUpsertOrder).toBeLessThan(firstAccountTxFetchOrder);
    expect(firstAccountTxFetchOrder).toBeLessThan(secondAccountUpsertOrder);
  });
});

describe("syncAllActiveBankItems - dispara o sync de todos os BankItems ativos, em serie (Criterio de aceite #2)", () => {
  it("chama listActiveBankItems e sincroniza cada item retornado", async () => {
    listActiveBankItemsMock.mockResolvedValueOnce([
      { id: "item-1" },
      { id: "item-2" },
    ]);
    findUniqueMock
      .mockResolvedValueOnce(buildMockBankItemRow({ id: "item-1", pluggyItemId: "pluggy-1" }))
      .mockResolvedValueOnce(buildMockBankItemRow({ id: "item-2", pluggyItemId: "pluggy-2" }));
    fetchPluggyAccountsMock.mockResolvedValue([]);
    updateMock.mockResolvedValue(buildMockBankItemRow());

    const { syncAllActiveBankItems } = await import("@/lib/sync");
    const results = await syncAllActiveBankItems();

    expect(listActiveBankItemsMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { bankItemId: "item-1", status: "OK", accountsSynced: 0, transactionsSynced: 0 },
      { bankItemId: "item-2", status: "OK", accountsSynced: 0, transactionsSynced: 0 },
    ]);
  });

  it("processa os BankItems EM SERIE - o segundo so comeca depois que o primeiro terminou por completo (ADR 7)", async () => {
    listActiveBankItemsMock.mockResolvedValueOnce([
      { id: "item-1" },
      { id: "item-2" },
    ]);
    findUniqueMock
      .mockResolvedValueOnce(buildMockBankItemRow({ id: "item-1", pluggyItemId: "pluggy-1" }))
      .mockResolvedValueOnce(buildMockBankItemRow({ id: "item-2", pluggyItemId: "pluggy-2" }));
    fetchPluggyAccountsMock.mockResolvedValue([]);
    updateMock.mockResolvedValue(buildMockBankItemRow());

    const { syncAllActiveBankItems } = await import("@/lib/sync");
    await syncAllActiveBankItems();

    // O update de lastSyncAt do item-1 precisa acontecer ANTES do
    // findUnique/fetchPluggyAccounts do item-2 comecar.
    const firstUpdateOrder = updateMock.mock.invocationCallOrder[0];
    const secondFindUniqueOrder = findUniqueMock.mock.invocationCallOrder[1];
    expect(firstUpdateOrder).toBeLessThan(secondFindUniqueOrder);
  });

  it("um item que falha (Pluggy fora do ar / Item LOGIN_ERROR) nao interrompe a sincronizacao dos demais", async () => {
    listActiveBankItemsMock.mockResolvedValueOnce([
      { id: "item-com-falha" },
      { id: "item-ok" },
    ]);
    findUniqueMock
      .mockResolvedValueOnce(
        buildMockBankItemRow({ id: "item-com-falha", pluggyItemId: "pluggy-falha" }),
      )
      .mockResolvedValueOnce(
        buildMockBankItemRow({ id: "item-ok", pluggyItemId: "pluggy-ok" }),
      );
    fetchPluggyAccountsMock
      .mockRejectedValueOnce(new Error("PluggyAccountsFetchError simulado"))
      .mockResolvedValueOnce([]);
    updateMock.mockResolvedValue(buildMockBankItemRow());

    const { syncAllActiveBankItems } = await import("@/lib/sync");
    const results = await syncAllActiveBankItems();

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ bankItemId: "item-com-falha", status: "ERROR" });
    expect((results[0] as { error: string }).error.length).toBeGreaterThan(0);
    expect(results[1]).toEqual({
      bankItemId: "item-ok",
      status: "OK",
      accountsSynced: 0,
      transactionsSynced: 0,
    });
  });

  it("BankItems arquivados nunca chegam aqui porque listActiveBankItems ja os filtra (Criterio de aceite #8)", async () => {
    listActiveBankItemsMock.mockResolvedValueOnce([]);

    const { syncAllActiveBankItems } = await import("@/lib/sync");
    const results = await syncAllActiveBankItems();

    expect(results).toEqual([]);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(fetchPluggyAccountsMock).not.toHaveBeenCalled();
  });
});
