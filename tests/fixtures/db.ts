/**
 * Fixtures de dados para os testes de integracao do schema Prisma (TASK-001).
 * Seguem exatamente os campos do rascunho de modelo de dados da secao 5 de
 * docs/PREMISSA.md. Cada factory aceita overrides parciais para os cenarios
 * de borda (amount negativo/zero, pluggyTransactionId nulo, etc).
 */

let uniqueCounter = 0;

/** Gera um sufixo unico por chamada, para nao colidir `@unique` entre testes. */
function uniqueSuffix(): string {
  uniqueCounter += 1;
  return `${Date.now()}-${uniqueCounter}`;
}

export function buildBankItem(overrides: Record<string, unknown> = {}) {
  return {
    pluggyItemId: `item-${uniqueSuffix()}`,
    institution: "Banco Teste",
    status: "UPDATED",
    ...overrides,
  };
}

export function buildAccount(
  bankItemId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    pluggyAccountId: `account-${uniqueSuffix()}`,
    bankItemId,
    name: "Banco Teste Conta Corrente",
    type: "CHECKING",
    ...overrides,
  };
}

export function buildTransaction(
  accountId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    pluggyTransactionId: `tx-${uniqueSuffix()}`,
    accountId,
    date: new Date("2026-07-15T12:00:00.000Z"),
    description: "Supermercado",
    amount: "-123.45",
    category: "Alimentação",
    source: "PLUGGY",
    method: "DEBIT",
    ...overrides,
  };
}

export function buildRecurringBill(overrides: Record<string, unknown> = {}) {
  return {
    name: "Aluguel",
    amount: "1500.00",
    dueDay: 5,
    method: "PIX",
    ...overrides,
  };
}

export function buildRecurringBillInstance(
  recurringBillId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    recurringBillId,
    month: "2026-07",
    status: "PENDING",
    ...overrides,
  };
}
