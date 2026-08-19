import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTransactionCategory } from "@/lib/transactions";

/**
 * `lib/dashboard.ts` - TASK-010 (Dashboard: gastos por categoria + resumo do
 * mes, primeira task da Fase 5). Concentra a logica do DT-018
 * (docs/DEBITO-TECNICO.md, docs/PREMISSA.md secao 11): transferencias entre
 * contas proprias e pagamentos de fatura NAO sao receita nem despesa - sao
 * a perna-espelho de um movimento que ja aconteceu em outro lugar do
 * dinheiro do usuario, e some-lo como receita infla o numero em ~20x
 * (sondagem real: R$44 mil em vez de R$2,3 mil).
 *
 * Assim como `lib/transactions.ts`, esta camada so LE dados ja
 * sincronizados do Postgres - nunca chama a Pluggy.
 */

/**
 * Categorias CRUAS da Pluggy (docs/DEBITO-TECNICO.md DT-018, docs/PREMISSA.md
 * secao 11) observadas nos dados reais que representam transferencia entre
 * contas proprias ou pagamento de fatura de cartao. A deteccao usa a
 * categoria CRUA (`Transaction.category`), NUNCA a efetiva
 * (`categoryOverride`/`categoryFromRule`) - Criterio de aceite #2 do
 * TASK-010.md: se o usuario recategorizar uma transferencia via
 * regra/override, ela CONTINUA sendo transferencia para fins de total (a
 * natureza do movimento nao muda so porque o rotulo mudou). Vale para
 * QUALQUER `Transaction`, independente de `source` (PLUGGY ou MANUAL) - nao
 * ha guarda por `source`: lancamentos manuais nunca caem nesse conjunto NA
 * PRATICA (nao tem categoria vinda da Pluggy), nao porque o codigo os isente
 * explicitamente.
 */
export const TRANSFER_CATEGORIES = [
  "Transfers",
  "Credit card payment",
  "Same person transfer",
  "Transfer - Cash",
] as const;

const TRANSFER_CATEGORIES_SET: readonly string[] = TRANSFER_CATEGORIES;

/** "YYYY-MM", mes de 01 a 12, zero-padded, ancorado (sem dia/hora). */
export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const monthQuerySchema = z.object({
  month: z.string().regex(MONTH_REGEX, "Mes invalido. Use o formato YYYY-MM."),
});

export type DashboardQuery = z.infer<typeof monthQuerySchema>;

/**
 * Rotulo de fallback quando a categoria EFETIVA (`resolveTransactionCategory`)
 * e null - usado no agrupamento de `porCategoria` (Criterio de aceite #4).
 */
export const NO_CATEGORY_LABEL = "Sem categoria";

/**
 * "YYYY-MM" do mes corrente, calculado em UTC (`getUTCFullYear`/
 * `getUTCMonth`), NUNCA hora local - mesmo cuidado de fuso do TASK-010.md e
 * da TASK-007. Usado pela pagina como default quando `searchParams.month`
 * esta ausente ou invalido.
 */
export function getCurrentMonthUTC(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export interface CategorySummary {
  category: string;
  total: string;
}

export interface MonthlySummary {
  month: string;
  receita: string;
  despesa: string;
  saldo: string;
  porCategoria: CategorySummary[];
  transferenciasExcluidas: {
    count: number;
    total: string;
  };
}

function isTransferCategory(category: string | null): boolean {
  return category !== null && TRANSFER_CATEGORIES_SET.includes(category);
}

/**
 * Janela do mes em UTC (Criterio de aceite #5, MESMO CUIDADO DE FUSO da
 * TASK-007, documentado como convencao explicita - nao escondido):
 *   inicio = dia 1, 00:00:00.000Z
 *   fim    = ultimo dia do mes (dia 0 do mes seguinte), 23:59:59.999Z
 * CAVEAT: janela UTC PURA - um usuario em fuso negativo (ex.
 * America/Sao_Paulo, UTC-3) tem uma transacao das 22h locais do ultimo dia
 * (01h UTC do dia seguinte) caindo no mes SEGUINTE aqui. Mesma
 * convencao/mesmo caveat ja aceito na TASK-007 (`listTransactions`) - nao
 * resolvido, so documentado.
 */
function monthWindow(month: string): { inicio: Date; fim: Date } {
  const ano = Number(month.slice(0, 4));
  const mesIndex = Number(month.slice(5, 7)) - 1;
  const inicio = Date.UTC(ano, mesIndex, 1, 0, 0, 0, 0);
  const fim = Date.UTC(ano, mesIndex + 1, 0, 23, 59, 59, 999);
  return { inicio: new Date(inicio), fim: new Date(fim) };
}

/**
 * Resumo do mes (Criterio de aceite #1): despesa, receita, saldo, gastos
 * agrupados por categoria efetiva e transferencias excluidas (DT-018,
 * Criterio de aceite #3, o eixo desta task).
 *
 * `month` no formato "YYYY-MM" JA VALIDADO pelo chamador (rota/pagina via
 * `monthQuerySchema`) - esta funcao nao revalida formato, mesmo padrao de
 * `listTransactions(query)` confiar em `TransactionsQuery` ja parseada.
 *
 * Sem paginacao: o dashboard soma TUDO do mes, nao lista linha a linha.
 * Aritmetica DECIMAL exata (`Prisma.Decimal`) em todo o caminho - nunca
 * `Number()`/float, para preservar centavos exatamente.
 */
export async function getMonthlySummary(month: string): Promise<MonthlySummary> {
  const { inicio, fim } = monthWindow(month);

  const rows = await prisma.transaction.findMany({
    where: { date: { gte: inicio, lte: fim } },
    select: {
      amount: true,
      category: true,
      categoryOverride: true,
      categoryFromRule: true,
    },
  });

  let receita = new Prisma.Decimal(0);
  let despesa = new Prisma.Decimal(0);
  let transferCount = 0;
  let transferTotal = new Prisma.Decimal(0);
  const porCategoriaMap = new Map<string, Prisma.Decimal>();

  for (const row of rows) {
    if (isTransferCategory(row.category)) {
      transferCount += 1;
      transferTotal = transferTotal.plus(row.amount.abs());
      continue;
    }

    if (row.amount.gt(0)) {
      receita = receita.plus(row.amount);
      continue;
    }

    if (row.amount.lt(0)) {
      const valorAbsoluto = row.amount.abs();
      despesa = despesa.plus(valorAbsoluto);

      const categoria =
        resolveTransactionCategory({
          category: row.category,
          categoryOverride: row.categoryOverride,
          categoryFromRule: row.categoryFromRule,
        }) ?? NO_CATEGORY_LABEL;

      porCategoriaMap.set(
        categoria,
        (porCategoriaMap.get(categoria) ?? new Prisma.Decimal(0)).plus(
          valorAbsoluto,
        ),
      );
    }
    // amount === 0: nao entra em receita, despesa nem porCategoria.
  }

  const porCategoria: CategorySummary[] = [...porCategoriaMap.entries()]
    .sort((a, b) => b[1].comparedTo(a[1]))
    .map(([category, total]) => ({ category, total: total.toFixed(2) }));

  const saldo = receita.minus(despesa);

  return {
    month,
    receita: receita.toFixed(2),
    despesa: despesa.toFixed(2),
    saldo: saldo.toFixed(2),
    porCategoria,
    transferenciasExcluidas: {
      count: transferCount,
      total: transferTotal.toFixed(2),
    },
  };
}
