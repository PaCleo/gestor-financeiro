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
    // TASK-004: BankItem ganhou o campo `executionStatus` (resolve o
    // DT-009 - Pluggy expoe dois campos de estado distintos). Default
    // neutro ("SUCCESS") para nao quebrar os testes de TASK-001/TASK-002
    // que criam BankItem via este fixture sem se importar com o novo
    // campo - eles continuam validos porque o valor default aqui e
    // sempre sobrescrevivel via `overrides`.
    executionStatus: "SUCCESS",
    // TASK-005: BankItem ganha `archivedAt DateTime?` (nullable, DT-013).
    // Default `undefined` (Prisma usa o default do schema = NULL) - so
    // sobrescrito nos poucos testes que precisam de um BankItem JA
    // arquivado (ver tests/integration/bank-item-archive.integration.test.ts).
    archivedAt: undefined,
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
