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

export async function resetDatabase(client: RawExecutableClient): Promise<void> {
  const quotedTables = ALL_TABLES.map((table) => `"${table}"`).join(", ");
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE;`,
  );
}
