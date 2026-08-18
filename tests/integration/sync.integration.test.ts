import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase, resetCategoryRuleTable } from "../setup/reset-db";
import { buildBankItem } from "../fixtures/db";
import {
  FAKE_ACCOUNT_HOLDER_CPF,
  FAKE_PAYER_CPF,
  FAKE_RECEIVER_CNPJ,
  buildMockPluggyAccountResponse,
  buildMockPluggyCreditCardAccountResponse,
  buildMockPluggyTransactionResponse,
  buildRealCreditCardPaymentTransaction,
  buildRealCreditCardPurchaseTransaction,
  buildTransactionWithPaymentData,
} from "../fixtures/pluggy";

/**
 * Testes de integracao de `syncBankItem`/`syncAllActiveBankItems`
 * (lib/sync.ts, TASK-006 - Sync de Accounts e Transactions, primeira task
 * da Fase 2). Batem no Postgres REAL de teste (gestor_test).
 *
 * DIFERENCA DELIBERADA em relacao a tests/unit/lib/sync.test.ts: aqui
 * mockamos SO `"pluggy-sdk"` (a fronteira mais baixa possivel - o mesmo
 * padrao de tests/unit/lib/pluggy.test.ts), NAO `@/lib/pluggy`. Isso faz o
 * codigo de producao REAL de `lib/pluggy.ts` (traducao/normalizacao de
 * campo, remocao de PII) rodar de verdade neste teste, ponta a ponta, ate
 * gravar no Postgres. E a UNICA forma de provar "o VALOR gravado no banco",
 * como o prompt desta task exige (licao do DT-011 - uma asserção de
 * nao-vazamento so vale alguma coisa se o payload testado pudesse conter o
 * valor proibido E a prova checar o dado persistido, nao so o retorno de
 * uma funcao em memoria).
 *
 * `@/lib/db` NAO e mockado (Postgres real via `prisma`, TRUNCATE entre
 * testes). Nenhuma chamada de rede real e possivel: o modulo real do SDK
 * (que usa `got` para bater em https://api.pluggy.ai) nunca e carregado.
 */

const {
  PluggyClientMock,
  fetchAccountsMock,
  fetchAllTransactionsMock,
  fetchTransactionsMock,
} = vi.hoisted(() => {
  const fetchAccountsMock = vi.fn();
  const fetchAllTransactionsMock = vi.fn();
  const fetchTransactionsMock = vi.fn();
  const PluggyClientMock = vi.fn().mockImplementation(function () {
    return {
      fetchAccounts: fetchAccountsMock,
      fetchAllTransactions: fetchAllTransactionsMock,
      fetchTransactions: fetchTransactionsMock,
    };
  });
  return {
    PluggyClientMock,
    fetchAccountsMock,
    fetchAllTransactionsMock,
    fetchTransactionsMock,
  };
});

vi.mock("pluggy-sdk", () => ({ PluggyClient: PluggyClientMock }));

const FAKE_CLIENT_ID = "fake-client-id-para-teste-nao-e-credencial-real";
const FAKE_CLIENT_SECRET =
  "fake-client-secret-para-teste-nao-e-credencial-real";
const ORIGINAL_CLIENT_ID = process.env.CLIENT_ID;
const ORIGINAL_CLIENT_SECRET = process.env.CLIENT_SECRET;

function restoreEnv() {
  if (ORIGINAL_CLIENT_ID === undefined) delete process.env.CLIENT_ID;
  else process.env.CLIENT_ID = ORIGINAL_CLIENT_ID;
  if (ORIGINAL_CLIENT_SECRET === undefined) delete process.env.CLIENT_SECRET;
  else process.env.CLIENT_SECRET = ORIGINAL_CLIENT_SECRET;
}

function pageResponse(results: unknown[]) {
  return { results, page: 1, total: results.length, totalPages: 1 };
}

beforeEach(async () => {
  await resetDatabase(prisma);
  vi.clearAllMocks();
  process.env.CLIENT_ID = FAKE_CLIENT_ID;
  process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
});

afterEach(async () => {
  await resetDatabase(prisma);
  restoreEnv();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("syncBankItem - Accounts persistidas, re-sync atualiza em vez de duplicar (Criterio de aceite #1)", () => {
  it("persiste pluggyAccountId/name/balance/type mapeado", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([
        buildMockPluggyAccountResponse({
          id: "acc-real-1",
          name: "Banco Teste Conta",
          balance: 5230.11,
        }),
      ]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const accounts = await prisma.account.findMany({
      where: { bankItemId: bankItem.id },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].pluggyAccountId).toBe("acc-real-1");
    expect(accounts[0].name).toBe("Banco Teste Conta");
    expect(accounts[0].type).toBe("CHECKING");
    expect(accounts[0].balance?.toFixed(2)).toBe("5230.11");
  });

  it("re-sincronizar ATUALIZA a Account existente em vez de duplicar", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([
        buildMockPluggyAccountResponse({
          id: "acc-real-2",
          name: "Nome antigo",
          balance: 100,
        }),
      ]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([]);
    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([
        buildMockPluggyAccountResponse({
          id: "acc-real-2",
          name: "Nome novo",
          balance: 999.5,
        }),
      ]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([]);
    await syncBankItem(bankItem.id);

    const accounts = await prisma.account.findMany({
      where: { bankItemId: bankItem.id },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("Nome novo");
    expect(accounts[0].balance?.toFixed(2)).toBe("999.50");
    expect(await prisma.account.count()).toBe(1);
  });
});

describe("syncBankItem - mapeamento de tipo de conta (Criterio de aceite #2 da secao 2)", () => {
  it("BANK/CHECKING_ACCOUNT vira CHECKING", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([
        buildMockPluggyAccountResponse({
          id: "acc-checking",
          type: "BANK",
          subtype: "CHECKING_ACCOUNT",
        }),
      ]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const account = await prisma.account.findUniqueOrThrow({
      where: { pluggyAccountId: "acc-checking" },
    });
    expect(account.type).toBe("CHECKING");
  });

  it("CREDIT/CREDIT_CARD vira CREDIT_CARD", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyCreditCardAccountResponse({ id: "acc-credit" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const account = await prisma.account.findUniqueOrThrow({
      where: { pluggyAccountId: "acc-credit" },
    });
    expect(account.type).toBe("CREDIT_CARD");
  });
});

describe("syncBankItem - normalizacao de sinal, PONTA A PONTA contra o Postgres real (Criterio de aceite #3, O CORACAO DA TASK, resolve o DT-007)", () => {
  it("conta corrente: DEBIT com amount JA negativo (-1806.01, valor real da sondagem) persiste negativo, sem alteracao", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([
        buildMockPluggyAccountResponse({ id: "acc-checking-sign", type: "BANK", subtype: "CHECKING_ACCOUNT" }),
      ]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildMockPluggyTransactionResponse({
        id: "tx-checking-sign",
        type: "DEBIT",
        amount: -1806.01,
      }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-checking-sign" },
    });
    expect(transaction.amount.toFixed(2)).toBe("-1806.01");
  });

  it("cartao: compra DEBIT com amount POSITIVO (+138.83, valor real da sondagem) persiste NEGATIVA - a prova central do DT-007", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyCreditCardAccountResponse({ id: "acc-credit-sign" })]),
    );
    // O mock traz a compra com amount POSITIVO (+138.83), exatamente como a
    // Pluggy devolve de verdade - NAO ja negativa. Se este teste passasse
    // com o mock ja negativo, ele nao provaria nada sobre a normalizacao.
    const rawPurchase = buildRealCreditCardPurchaseTransaction({
      id: "tx-credit-purchase-sign",
    });
    expect(rawPurchase.amount).toBeGreaterThan(0);
    fetchAllTransactionsMock.mockResolvedValueOnce([rawPurchase]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-credit-purchase-sign" },
    });
    expect(transaction.amount.toFixed(2)).toBe("-138.83");
    expect(transaction.amount.toNumber()).toBeLessThan(0);
  });

  it("cartao: pagamento de fatura com amount NEGATIVO na Pluggy (-500) persiste POSITIVO (convencao consistente de inversao por conta)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyCreditCardAccountResponse({ id: "acc-credit-payment" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildRealCreditCardPaymentTransaction({ id: "tx-credit-payment-sign" }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-credit-payment-sign" },
    });
    expect(transaction.amount.toFixed(2)).toBe("500.00");
    expect(transaction.amount.toNumber()).toBeGreaterThan(0);
  });
});

describe("syncBankItem - paginacao: nenhuma transacao e truncada (Criterio de aceite #4, resolve o DT-008)", () => {
  it("650 transacoes (mais que a pagina de 500 da Pluggy) sao TODAS persistidas, e fetchTransactions (deprecado) nunca e chamado", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyCreditCardAccountResponse({ id: "acc-volume" })]),
    );
    const manyTransactions = Array.from({ length: 650 }, (_, index) =>
      buildRealCreditCardPurchaseTransaction({ id: `tx-volume-${index}` }),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce(manyTransactions);

    const { syncBankItem } = await import("@/lib/sync");
    const result = await syncBankItem(bankItem.id);

    expect(result.transactionsSynced).toBe(650);
    const account = await prisma.account.findUniqueOrThrow({
      where: { pluggyAccountId: "acc-volume" },
    });
    const persistedCount = await prisma.transaction.count({
      where: { accountId: account.id },
    });
    expect(persistedCount).toBe(650);
    expect(fetchTransactionsMock).not.toHaveBeenCalled();
  });
});

describe("syncBankItem - upsert por pluggyTransactionId: dedup sagrada e transicao PENDING -> POSTED (Criterio de aceite #5)", () => {
  it("sincronizar a mesma transacao duas vezes NAO duplica", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValue(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-dedup" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildMockPluggyTransactionResponse({ id: "tx-dedup", amount: -50 }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildMockPluggyTransactionResponse({ id: "tx-dedup", amount: -50 }),
    ]);
    await syncBankItem(bankItem.id);

    const matching = await prisma.transaction.findMany({
      where: { pluggyTransactionId: "tx-dedup" },
    });
    expect(matching).toHaveLength(1);
  });

  it("uma transacao PENDING que vira POSTED ATUALIZA o registro existente, nao duplica", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValue(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-pending" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildMockPluggyTransactionResponse({
        id: "tx-pending-to-posted",
        status: "PENDING",
        amount: -75,
      }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const afterFirstSync = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-pending-to-posted" },
    });
    expect(afterFirstSync.status).toBe("PENDING");

    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildMockPluggyTransactionResponse({
        id: "tx-pending-to-posted",
        status: "POSTED",
        amount: -75,
      }),
    ]);
    await syncBankItem(bankItem.id);

    const matching = await prisma.transaction.findMany({
      where: { pluggyTransactionId: "tx-pending-to-posted" },
    });
    expect(matching).toHaveLength(1);
    expect(matching[0].status).toBe("POSTED");
    expect(matching[0].id).toBe(afterFirstSync.id);
  });
});

describe("syncBankItem - PII: taxNumber e paymentData NAO sao persistidos, provado pelo VALOR gravado no Postgres (Criterio de aceite #6, resolve o DT-017)", () => {
  it("account.taxNumber (CPF fabricado, REALMENTE presente no payload) nunca aparece em nenhuma coluna da Account persistida", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([
        buildMockPluggyAccountResponse({
          id: "acc-pii",
          taxNumber: FAKE_ACCOUNT_HOLDER_CPF,
          owner: "Fulano de Tal",
        }),
      ]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const account = await prisma.account.findUniqueOrThrow({
      where: { pluggyAccountId: "acc-pii" },
    });
    // Esta e a asserção com poder de deteccao real (licao do DT-011): o
    // payload mockado REALMENTE continha o CPF fabricado, e verificamos o
    // VALOR persistido no Postgres, nao so os nomes de coluna.
    expect(JSON.stringify(account)).not.toContain(FAKE_ACCOUNT_HOLDER_CPF);
    expect(JSON.stringify(account)).not.toContain("Fulano de Tal");
  });

  it("transaction.paymentData (CPF do pagador e CNPJ do recebedor fabricados, REALMENTE presentes no payload) nunca aparecem em nenhuma coluna da Transaction persistida", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-pii-tx" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildTransactionWithPaymentData({ id: "tx-pii" }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-pii" },
    });
    const rawTransaction = JSON.stringify(transaction);
    expect(rawTransaction).not.toContain(FAKE_PAYER_CPF);
    expect(rawTransaction).not.toContain(FAKE_RECEIVER_CNPJ);
    expect(rawTransaction).not.toContain("Fulano de Tal Pagador");
    expect(rawTransaction).not.toContain("Loja Teste Recebedora");
    expect(rawTransaction).not.toContain("12345-6");
    // O UNICO dado derivado de paymentData que sobrevive e o metodo.
    expect(transaction.method).toBe("PIX");
  });
});

describe("syncBankItem - paymentData.paymentMethod mapeado para method (Criterio de aceite #7)", () => {
  it.each(["PIX", "TED", "BOLETO", "OTHER"])(
    "paymentMethod '%s' e persistido em method sem alteracao",
    async (paymentMethod) => {
      const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
      fetchAccountsMock.mockResolvedValueOnce(
        pageResponse([
          buildMockPluggyAccountResponse({ id: `acc-method-${paymentMethod}` }),
        ]),
      );
      fetchAllTransactionsMock.mockResolvedValueOnce([
        buildMockPluggyTransactionResponse({
          id: `tx-method-${paymentMethod}`,
          paymentData: { paymentMethod, boletoMetadata: null },
        }),
      ]);

      const { syncBankItem } = await import("@/lib/sync");
      await syncBankItem(bankItem.id);

      const transaction = await prisma.transaction.findUniqueOrThrow({
        where: { pluggyTransactionId: `tx-method-${paymentMethod}` },
      });
      expect(transaction.method).toBe(paymentMethod);
    },
  );

  it("sem paymentData (ex.: compra de cartao), method fica null", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyCreditCardAccountResponse({ id: "acc-no-payment-data" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildRealCreditCardPurchaseTransaction({
        id: "tx-no-payment-data",
        paymentData: undefined,
      }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-no-payment-data" },
    });
    expect(transaction.method).toBeNull();
  });
});

describe("syncBankItem - category persistida crua (Criterio de aceite #9, investigacao do DT-010)", () => {
  it('category preenchida ("Housing", como veio na sondagem real) e persistida sem alteracao', async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-category" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildMockPluggyTransactionResponse({
        id: "tx-category-housing",
        category: "Housing",
        categoryId: "17000000",
      }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-category-housing" },
    });
    expect(transaction.category).toBe("Housing");
  });

  it("category null e persistida como null (nao vira string vazia nem placeholder)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-category-null" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildMockPluggyTransactionResponse({
        id: "tx-category-null",
        category: null,
      }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-category-null" },
    });
    expect(transaction.category).toBeNull();
  });
});

describe("syncBankItem - BankItem arquivado e ignorado (Criterio de aceite #8)", () => {
  it("rejeita com BankItemArchivedError e NAO cria nenhuma Account/Transaction para um BankItem arquivado", async () => {
    const archivedBankItem = await prisma.bankItem.create({
      data: buildBankItem({ archivedAt: new Date("2026-01-01T00:00:00.000Z") }),
    });

    const { syncBankItem, BankItemArchivedError } = await import(
      "@/lib/sync"
    );

    await expect(syncBankItem(archivedBankItem.id)).rejects.toBeInstanceOf(
      BankItemArchivedError,
    );
    expect(fetchAccountsMock).not.toHaveBeenCalled();

    const accounts = await prisma.account.findMany({
      where: { bankItemId: archivedBankItem.id },
    });
    expect(accounts).toHaveLength(0);
    const reloaded = await prisma.bankItem.findUniqueOrThrow({
      where: { id: archivedBankItem.id },
    });
    expect(reloaded.lastSyncAt).toBeNull();
  });

  it("syncAllActiveBankItems ignora o BankItem arquivado mas sincroniza o ativo normalmente", async () => {
    const archivedBankItem = await prisma.bankItem.create({
      data: buildBankItem({ archivedAt: new Date("2026-01-01T00:00:00.000Z") }),
    });
    const activeBankItem = await prisma.bankItem.create({
      data: buildBankItem(),
    });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-active-only" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([]);

    const { syncAllActiveBankItems } = await import("@/lib/sync");
    const results = await syncAllActiveBankItems();

    expect(
      results.map((r: { bankItemId: string }) => r.bankItemId),
    ).not.toContain(archivedBankItem.id);
    expect(
      results.map((r: { bankItemId: string }) => r.bankItemId),
    ).toContain(activeBankItem.id);

    const archivedAccounts = await prisma.account.findMany({
      where: { bankItemId: archivedBankItem.id },
    });
    expect(archivedAccounts).toHaveLength(0);
    const reloadedArchived = await prisma.bankItem.findUniqueOrThrow({
      where: { id: archivedBankItem.id },
    });
    expect(reloadedArchived.lastSyncAt).toBeNull();

    const reloadedActive = await prisma.bankItem.findUniqueOrThrow({
      where: { id: activeBankItem.id },
    });
    expect(reloadedActive.lastSyncAt).not.toBeNull();
  });
});

describe("syncBankItem - lastSyncAt e atualizado apos sync bem-sucedido", () => {
  it("BankItem.lastSyncAt passa de null para uma data recente", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    expect(bankItem.lastSyncAt).toBeNull();
    fetchAccountsMock.mockResolvedValueOnce(pageResponse([]));

    const before = new Date();
    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const reloaded = await prisma.bankItem.findUniqueOrThrow({
      where: { id: bankItem.id },
    });
    expect(reloaded.lastSyncAt).not.toBeNull();
    expect((reloaded.lastSyncAt as Date).getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
  });
});

describe("syncBankItem - API da Pluggy fora do ar / Item LOGIN_ERROR-OUTDATED (caminho de erro)", () => {
  it("propaga um erro tratado quando fetchAccounts falha, sem criar nenhuma Account nem atualizar lastSyncAt", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockRejectedValueOnce({
      message: "Item credentials are outdated",
      code: 400,
      codeDescription: "ITEM_LOGIN_ERROR",
    });

    const { syncBankItem } = await import("@/lib/sync");

    await expect(syncBankItem(bankItem.id)).rejects.toThrow();

    const accounts = await prisma.account.findMany({
      where: { bankItemId: bankItem.id },
    });
    expect(accounts).toHaveLength(0);
    const reloaded = await prisma.bankItem.findUniqueOrThrow({
      where: { id: bankItem.id },
    });
    expect(reloaded.lastSyncAt).toBeNull();
  });
});

/**
 * TASK-008 (DT-019) - regras de categorizacao por CPF/CNPJ. `resetCategoryRuleTable`
 * (nao `resetDatabase`, que NAO inclui a tabela nova - ver o comentario em
 * tests/setup/reset-db.ts) limpa `CategoryRule` entre os `it`s deste bloco,
 * escopado localmente para nao quebrar os describes acima (TASK-006/007)
 * antes da migration desta task existir.
 */
describe("syncBankItem - regra de categorizacao por CPF/CNPJ (Criterio de aceite #6, DT-019, contra o Postgres real)", () => {
  afterEach(async () => {
    await resetCategoryRuleTable(prisma);
  });

  it("transacao cuja contraparte (receiver) casa com uma CategoryRule ja cadastrada recebe categoryFromRule = categoria da regra", async () => {
    const { hashDocument } = await import("@/lib/category-rules");
    await prisma.categoryRule.create({
      data: {
        documentHash: hashDocument(FAKE_RECEIVER_CNPJ),
        category: "Mercado",
        label: "Mercado do bairro",
      },
    });

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-regra-receiver" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildTransactionWithPaymentData({ id: "tx-regra-receiver" }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-regra-receiver" },
    });
    expect(transaction.categoryFromRule).toBe("Mercado");
  });

  it("transacao cuja contraparte (payer) casa com uma CategoryRule ja cadastrada recebe categoryFromRule = categoria da regra", async () => {
    const { hashDocument } = await import("@/lib/category-rules");
    await prisma.categoryRule.create({
      data: {
        documentHash: hashDocument(FAKE_PAYER_CPF),
        category: "Recebimento de pessoa física",
      },
    });

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-regra-payer" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildTransactionWithPaymentData({ id: "tx-regra-payer" }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-regra-payer" },
    });
    expect(transaction.categoryFromRule).toBe("Recebimento de pessoa física");
  });

  it("transacao sem contraparte que case com nenhuma regra recebe categoryFromRule = null (mesmo com outras regras cadastradas)", async () => {
    const { hashDocument } = await import("@/lib/category-rules");
    await prisma.categoryRule.create({
      data: {
        documentHash: hashDocument("00000000000"),
        category: "Categoria de outra regra qualquer",
      },
    });

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-sem-regra" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildTransactionWithPaymentData({ id: "tx-sem-regra-correspondente" }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-sem-regra-correspondente" },
    });
    expect(transaction.categoryFromRule).toBeNull();
  });

  it("transacao SEM paymentData (compra de cartao) recebe categoryFromRule = null, sem lancar", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyCreditCardAccountResponse({ id: "acc-sem-payment-data" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildRealCreditCardPurchaseTransaction({ id: "tx-cartao-sem-regra" }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-cartao-sem-regra" },
    });
    expect(transaction.categoryFromRule).toBeNull();
  });

  it("uma regra criada DEPOIS de um sync inicial passa a valer no RE-sync (consequencia aceita do DT-019 - nao retroativa isolada)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-regra-tardia" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildTransactionWithPaymentData({ id: "tx-regra-tardia" }),
    ]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    const beforeRule = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-regra-tardia" },
    });
    expect(beforeRule.categoryFromRule).toBeNull();

    // A regra so e criada AGORA, depois do primeiro sync.
    const { hashDocument } = await import("@/lib/category-rules");
    await prisma.categoryRule.create({
      data: {
        documentHash: hashDocument(FAKE_RECEIVER_CNPJ),
        category: "Mercado",
      },
    });

    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-regra-tardia" })]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildTransactionWithPaymentData({ id: "tx-regra-tardia" }),
    ]);
    await syncBankItem(bankItem.id);

    const afterRule = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-regra-tardia" },
    });
    expect(afterRule.categoryFromRule).toBe("Mercado");
    // Ainda a MESMA linha (upsert, nao duplicou).
    expect(afterRule.id).toBe(beforeRule.id);
  });
});

/**
 * TASK-008 (DT-019) - O TESTE MAIS CRITICO DA TASK (Criterio de aceite #7).
 * Monta um `paymentData` com CPF e CNPJ fabricados que REALMENTE aparecem no
 * payload de entrada do sync (mesma tecnica de
 * "syncBankItem - PII" acima, DT-011/DT-017), sincroniza de verdade contra o
 * Postgres real, e prova por VALOR que:
 *   1. o documento que vem em `paymentData` (payer/receiver) NUNCA aparece
 *      em NENHUMA coluna de NENHUMA linha de Transaction (varredura de
 *      TODAS as linhas, nao so a que acabou de ser criada);
 *   2. `counterpartyDocumentHashes` (calculado por `fetchPluggyAllTransactions`)
 *      e composto de HASHES SHA-256 (64 hex chars), nao dos documentos -
 *      comparados com o hash CONHECIDO calculado por `hashDocument` (a MESMA
 *      funcao usada no cadastro de regras).
 *
 * ESCOPO HONESTO deste teste (correcao pos-aprovacao, 2026-08-18, achado do
 * coordenador apos sondagem real): a garantia provada aqui e ESPECIFICA do
 * VETOR `paymentData` - NAO "CPF/CNPJ nunca aparece em nenhuma coluna de
 * Transaction em qualquer circunstancia". Essa segunda afirmacao seria
 * FALSA: o DT-021 (descoberto na sondagem real desta mesma task) documenta
 * que a Pluggy embute CPF cru (em digitos) no texto livre de
 * `transaction.description` para algumas transacoes reais (ex. PIX
 * recebido, "RECEBIMENTO ... 00000000000 ... FULANO"), e a TASK-006 ja
 * persiste `description` como vem, sem scrub - isso e vetor PRE-EXISTENTE e
 * ORTOGONAL a esta task, fora de escopo resolver aqui. A fixture usada
 * abaixo (`buildTransactionWithPaymentData`) tem `description: "Pix
 * enviado"` - NUNCA contem o CPF/CNPJ fabricado - entao a asserção de
 * "nenhuma coluna contem o documento" e verdadeira PARA ESTE PAYLOAD (o
 * documento so existiria em `description` se a Pluggy o tivesse colocado
 * la, o que este teste nao simula). O que este teste prova de fato, com
 * poder de deteccao real: o documento presente em `payer`/`receiver` -
 * ONDE o DT-017/DT-019 promete que ele nunca sobrevive - de fato nao
 * sobrevive a lugar nenhum. Scrub de `description` (se decidido) e uma
 * task propria (ver DT-021 em docs/DEBITO-TECNICO.md).
 */
describe("syncBankItem - TESTE DE PII CRITICO: o documento de paymentData jamais persistido em nenhuma coluna de Transaction (Criterio de aceite #7, DT-019 - vetor paymentData; o vetor description e o DT-021, fora de escopo desta task)", () => {
  afterEach(async () => {
    await resetCategoryRuleTable(prisma);
  });

  it("apos o sync, nenhum CPF/CNPJ fabricado vindo de paymentData (REALMENTE presente no payload de entrada, e ausente da description da fixture) aparece em NENHUMA linha/coluna de Transaction - varredura completa da tabela (DT-021: description e vetor separado, fora de escopo)", async () => {
    const { hashDocument } = await import("@/lib/category-rules");
    // Regra cadastrada para o CNPJ do recebedor, para provar que MESMO
    // quando a regra casa (e a categoria e persistida), o documento em si
    // continua fora da tabela.
    await prisma.categoryRule.create({
      data: {
        documentHash: hashDocument(FAKE_RECEIVER_CNPJ),
        category: "Mercado",
      },
    });

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([buildMockPluggyAccountResponse({ id: "acc-pii-critico" })]),
    );
    const rawTransaction = buildTransactionWithPaymentData({
      id: "tx-pii-critico",
    });
    // Confirma que o payload de ENTRADA REALMENTE contem os documentos
    // fabricados - senao a asserção de nao-vazamento abaixo passaria por
    // ausencia de mecanismo, nao por protecao (DT-011).
    expect(JSON.stringify(rawTransaction)).toContain(FAKE_PAYER_CPF);
    expect(JSON.stringify(rawTransaction)).toContain(FAKE_RECEIVER_CNPJ);
    // Confirma tambem o INVERSO, para a asserção final ser honesta (DT-021):
    // a `description` desta fixture (`buildMockPluggyTransactionResponse`
    // -> "Pix enviado") NAO contem os documentos fabricados. Ou seja, a
    // varredura abaixo prova que o documento de `paymentData` nunca
    // sobrevive a coluna nenhuma - ela NAO prova (nem tenta provar) que
    // `description` seria igualmente limpa se a Pluggy tivesse colocado um
    // CPF ali (caso real, documentado no DT-021, fora de escopo desta
    // task).
    expect(rawTransaction.description).not.toContain(FAKE_PAYER_CPF);
    expect(rawTransaction.description).not.toContain(FAKE_RECEIVER_CNPJ);
    fetchAllTransactionsMock.mockResolvedValueOnce([rawTransaction]);

    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    // Varredura de TODAS as linhas/colunas da tabela Transaction - nao so a
    // que acabou de ser criada (defesa contra um bug que gravasse o
    // documento em outra linha/coluna por engano). Honesto sobre o escopo
    // (DT-021, ver o comentario do describe acima): esta varredura prova a
    // ausencia do documento de `paymentData` em QUALQUER coluna, incluindo
    // `description` - mas so porque a `description` desta fixture nunca
    // continha o documento em primeiro lugar (confirmado acima). Isto NAO e
    // uma prova de que `description` estaria sempre limpa de CPF/CNPJ em
    // producao - o DT-021 documenta o caso real onde nao esta.
    const allTransactions = await prisma.transaction.findMany();
    const rawAllTransactions = JSON.stringify(allTransactions);
    expect(rawAllTransactions).not.toContain(FAKE_PAYER_CPF);
    expect(rawAllTransactions).not.toContain(FAKE_RECEIVER_CNPJ);
    expect(rawAllTransactions).not.toContain("12345678900");
    expect(rawAllTransactions).not.toContain("12345678000195");
    expect(rawAllTransactions).not.toContain("Fulano de Tal Pagador");
    expect(rawAllTransactions).not.toContain("Loja Teste Recebedora");

    // A categoria da regra FOI aplicada (prova que o casamento funcionou -
    // nao e so ausencia de dado por a regra nunca ter casado).
    const persisted = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-pii-critico" },
    });
    expect(persisted.categoryFromRule).toBe("Mercado");
  });

  it("a mesma varredura tambem cobre a tabela CategoryRule inteira - so o hash sobrevive, nunca o documento", async () => {
    const { upsertCategoryRule } = await import("@/lib/category-rules");
    await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
      label: "Mercado do bairro",
    });

    const allRules = await prisma.categoryRule.findMany();
    const rawAllRules = JSON.stringify(allRules);
    expect(rawAllRules).not.toContain(FAKE_RECEIVER_CNPJ);
    expect(rawAllRules).not.toContain("12345678000195");
    // O hash, por outro lado, DEVE estar la (documentHash e o unico traco
    // permitido do documento).
    expect(allRules).toHaveLength(1);
    expect(allRules[0].documentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("counterpartyDocumentHashes (calculado dentro de fetchPluggyAllTransactions, ANTES de qualquer persistencia) e composto de HASHES SHA-256, nao dos documentos - comparado com hashDocument (a MESMA fonte usada no cadastro)", async () => {
    const { hashDocument } = await import("@/lib/category-rules");
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildTransactionWithPaymentData({ id: "tx-hash-shape-direct" }),
    ]);

    const { fetchPluggyAllTransactions } = await import("@/lib/pluggy");
    const [rawResult] = await fetchPluggyAllTransactions("acc-hash-shape");

    expect(rawResult.counterpartyDocumentHashes).toEqual(
      expect.arrayContaining([
        hashDocument(FAKE_PAYER_CPF),
        hashDocument(FAKE_RECEIVER_CNPJ),
      ]),
    );
    for (const hash of rawResult.counterpartyDocumentHashes) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toContain(FAKE_PAYER_CPF.replace(/\D/g, ""));
      expect(hash).not.toContain(FAKE_RECEIVER_CNPJ.replace(/\D/g, ""));
    }
  });
});
