/**
 * Helper de teste (nao e producao): limpa as 5 tabelas do modelo de dados
 * entre os testes de integracao, garantindo estado limpo em cada `it`
 * (Criterio de aceite #5 da TASK-001).
 *
 * Recebe qualquer client com `$executeRawUnsafe` (a instancia real e o
 * singleton `prisma` exportado por `lib/db.ts`, escrito pelo coder) para
 * nao acoplar este helper a um import de `@prisma/client`.
 */
type RawExecutableClient = {
  $executeRawUnsafe: (query: string) => Promise<unknown>;
};

const ALL_TABLES = [
  "RecurringBillInstance",
  "Transaction",
  "Account",
  "RecurringBill",
  "BankItem",
] as const;

/**
 * TASK-008 (DT-019): `CategoryRule` e uma tabela NOVA e standalone (sem FK
 * de/para as demais 5). Deliberadamente NAO adicionada a `ALL_TABLES`
 * acima: `resetDatabase` e chamado pelo `beforeEach`/`afterEach` de TODOS os
 * testes de integracao ja existentes (bank-item, items, transactions,
 * schema) - se o TRUNCATE referenciasse uma tabela que so passa a existir
 * depois da migration desta task, os 405 testes ja verdes quebrariam em RED
 * pelo motivo ERRADO (tabela ausente) assim que este arquivo fosse
 * importado, antes mesmo do coder implementar a TASK-008. Os testes desta
 * task que usam `CategoryRule` chamam `resetCategoryRuleTable` a parte,
 * SOMENTE dentro do proprio describe/arquivo que precisa dela.
 */
export async function resetCategoryRuleTable(
  client: RawExecutableClient,
): Promise<void> {
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE "CategoryRule" RESTART IDENTITY CASCADE;',
  );
}

export async function resetDatabase(client: RawExecutableClient): Promise<void> {
  const quotedTables = ALL_TABLES.map((table) => `"${table}"`).join(", ");
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE;`,
  );
}
