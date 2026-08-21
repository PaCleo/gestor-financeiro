/**
 * Formatação de exibição (TASK-012 Parte 2 - apresentação visual, Critério
 * de aceite P1). `formatBRL` é um helper PURO, sem I/O, sem estado: não faz
 * nenhuma aritmética (a soma/subtração continua em `Decimal` em `lib/`),
 * só converte a string decimal (formato já produzido por
 * `Decimal.toString()` - 2 casas fixas, escala `@db.Decimal(14, 2)` no
 * schema Prisma) num texto em Real brasileiro para exibição. Pode ser
 * importado por Client Components (não toca `lib/db`).
 */

/** Formata uma string decimal (ex. "3408.84") como Real brasileiro (ex. "R$ 3.408,84"). */
export function formatBRL(decimalString: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(decimalString));
}
