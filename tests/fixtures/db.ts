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
    // TASK-006: Account ganha `balance Decimal? @db.Decimal(14,2)`
    // (nullable, DT-013 - e tambem correto por natureza: uma Account
    // manual, sem pluggyAccountId, pode nao ter saldo conhecido). Default
    // `undefined` (mesmo truque de `archivedAt` na TASK-005): Prisma trata
    // uma chave com valor `undefined` como "nao informada", entao os
    // testes de TASK-001/002/005 que criam Account via este fixture SEM
    // saber desse campo novo continuam funcionando ANTES da migration
    // desta task existir (um valor concreto aqui quebraria a suite inteira
    // em RED, ja que o Prisma Client rejeita qualquer chave que a DMMF
    // atual nao reconhece - nao so a chave nova, a chamada toda). So
    // sobrescrito nos testes desta task que se importam com o valor (ver
    // tests/integration/schema.integration.test.ts).
    balance: undefined,
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
    // TASK-006: Transaction ganha `status String @default("POSTED")`
    // (DT-013). Default `undefined` aqui pelo MESMO motivo de
    // `Account.balance` acima - mesmo o schema definindo `@default("POSTED")`
    // no Postgres, o Prisma Client so aplica esse default quando a chave
    // fica de fora da chamada (`undefined` vira "nao informada"); um valor
    // concreto quebraria a suite inteira em RED, antes da migration desta
    // task existir. Sobrescrito nos testes desta task que se importam com
    // o valor (ex.: status PENDING).
    status: undefined,
    // TASK-008: Transaction ganha `categoryFromRule String?` (nullable,
    // DT-013 - regra de migration permanente: a tabela ja tem 432 linhas
    // reais). Mesmo truque de `status`/`balance` acima: `undefined` faz o
    // Prisma tratar a chave como "nao informada", entao os testes de
    // TASK-001 a TASK-007 que criam Transaction via este fixture SEM saber
    // desse campo novo continuam funcionando ANTES da migration desta task
    // existir. So sobrescrito nos testes desta task que se importam com o
    // valor (ver tests/integration/sync.integration.test.ts e
    // tests/integration/transactions.integration.test.ts).
    categoryFromRule: undefined,
    ...overrides,
  };
}

/**
 * TASK-008 (DT-019): fixture de `CategoryRule`. `documentHash` aqui e SEMPRE
 * um hash ja calculado pelo proprio teste (via `hashDocument` de
 * `@/lib/category-rules` - a UNICA fonte de hash, Criterio de aceite #2) -
 * este fixture nunca aceita um documento cru, para nao normalizar a pratica
 * de "montar a linha da tabela com o CPF/CNPJ direto" em nenhum teste.
 */
export function buildCategoryRule(overrides: Record<string, unknown> = {}) {
  return {
    documentHash: `hash-${uniqueSuffix()}`,
    category: "Mercado",
    label: "Mercado do bairro",
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
