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
 *
 * TASK-014 (correcao: pagamento de fatura fora do gasto + gastos por
 * metodo): o DT-018 acima (exclusao por categoria CRUA) fica cego para um
 * pagamento de fatura que a Pluggy categoriza fora de `TRANSFER_CATEGORIES`
 * (caso real: -R$3.408,84 categorizado como "Loans and financing"). Esta
 * task acrescenta uma SEGUNDA deteccao, complementar: `isBillPayment` casa
 * um debito de conta NAO-cartao com `CreditCardBill.totalAmount` + janela de
 * `dueDate` (`BILL_PAYMENT_WINDOW_DAYS`). Tambem acrescenta
 * `classifyExpenseMethod`/`porMetodo` - um recorte adicional de gasto por
 * metodo (credito/Pix-TED/debito/dinheiro), sem substituir `despesa`.
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

/**
 * Tolerancia (em DIAS) da janela ao redor do `dueDate` de uma
 * `CreditCardBill` usada por `isBillPayment` (secao 2 do TASK-014.md: "ex.
 * +-10 dias"). Unica fonte da tolerancia - nao duplicada/hardcoded em outro
 * lugar.
 */
export const BILL_PAYMENT_WINDOW_DAYS = 10;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Deteccao PURA (sem I/O) do "pagamento de fatura = casar com a fatura"
 * (secao 2 do TASK-014.md, o eixo desta task - corrige o DT-018, que ficava
 * cego a um pagamento de fatura categorizado pela Pluggy fora do conjunto de
 * `TRANSFER_CATEGORIES`, ex. "Loans and financing"). Verdadeiro quando
 * EXISTE ao menos uma `bill` em `bills` tal que: (1) `transaction.amount` e
 * NEGATIVO (so debito conta - um credito/estorno de mesmo valor nao e
 * pagamento de fatura); (2) `|transaction.amount| === bill.totalAmount`
 * EXATO (aritmetica Decimal, nunca float/tolerancia de arredondamento); (3)
 * a `date` cai na janela SIMETRICA de `windowDays` dias ao redor do
 * `dueDate`, INCLUSIVA nos dois extremos.
 *
 * So responde "e pagamento de fatura?" (booleano) - NAO qual fatura
 * especifica foi paga (desempate entre faturas de mesmo valor e
 * irrelevante aqui; vincular a UMA fatura e o ciclo de fatura por cartao,
 * fora de escopo - TASK-015). `bills` vazio -> sempre `false`.
 *
 * Responsabilidade do CHAMADOR (nao desta funcao): so invocar para
 * transacoes de conta NAO-CARTAO (`Account.type !== "CREDIT_CARD"`) - esta
 * funcao pura nao conhece o tipo de conta, so compara valor/data.
 */
export function isBillPayment(
  transaction: { amount: string; date: Date },
  bills: { totalAmount: string; dueDate: Date }[],
  windowDays: number = BILL_PAYMENT_WINDOW_DAYS,
): boolean {
  const amount = new Prisma.Decimal(transaction.amount);
  if (!amount.isNegative()) {
    return false;
  }

  const valorAbsoluto = amount.abs();
  const janelaMs = windowDays * MS_POR_DIA;

  return bills.some((bill) => {
    const mesmoValor = valorAbsoluto.equals(new Prisma.Decimal(bill.totalAmount));
    if (!mesmoValor) {
      return false;
    }
    const distanciaMs = Math.abs(
      transaction.date.getTime() - bill.dueDate.getTime(),
    );
    return distanciaMs <= janelaMs;
  });
}

/** Bucket de gasto por metodo (Criterio de aceite #4, TASK-014); `null` = nao classificado. */
export type ExpenseMethod = "credito" | "pixTed" | "debito" | "dinheiro" | null;

/**
 * Classificacao PURA de gasto por metodo (Criterio de aceite #4,
 * TASK-014), por PRECEDENCIA (a ordem importa e e testada explicitamente):
 *   1. `accountType === "CREDIT_CARD"` -> "credito" SEMPRE, qualquer que
 *      seja `method` (uma transacao numa conta de cartao e gasto de credito
 *      por definicao);
 *   2. senao `accountType === "CASH"` -> "dinheiro" SEMPRE (a conta manual
 *      "Dinheiro" da TASK-009);
 *   3. senao `method === "PIX"` ou `"TED"` -> "pixTed";
 *   4. senao `method === "DEBIT"` -> "debito";
 *   5. qualquer outro caso -> `null` (nao classificado - nao entra em
 *      nenhum dos 4 buckets de `porMetodo`, mas CONTINUA contando em
 *      despesa/porCategoria - `porMetodo` e um recorte ADICIONAL).
 */
export function classifyExpenseMethod(input: {
  accountType: string;
  method: string | null;
}): ExpenseMethod {
  if (input.accountType === "CREDIT_CARD") {
    return "credito";
  }
  if (input.accountType === "CASH") {
    return "dinheiro";
  }
  if (input.method === "PIX" || input.method === "TED") {
    return "pixTed";
  }
  if (input.method === "DEBIT") {
    return "debito";
  }
  return null;
}

/** Soma dos gastos classificados em cada bucket de `classifyExpenseMethod` (mesma base de `despesa`: exclui transferencias e pagamentos de fatura). */
export interface MethodSummary {
  credito: string;
  pixTed: string;
  debito: string;
  dinheiro: string;
}

export interface MonthlySummary {
  month: string;
  receita: string;
  despesa: string;
  saldo: string;
  porCategoria: CategorySummary[];
  porMetodo: MethodSummary;
  transferenciasExcluidas: {
    count: number;
    total: string;
  };
  /**
   * TASK-014, Criterio de aceite #3: campo SEPARADO de
   * `transferenciasExcluidas` (decisao documentada na secao 6.3 do
   * TASK-014.md) - transferencia entre contas proprias e pagamento de
   * fatura casado por valor+janela sao naturezas de exclusao diferentes;
   * mante-los distintos preserva a granularidade de auditoria.
   */
  pagamentosFaturaExcluidos: {
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
      date: true,
      method: true,
      account: { select: { type: true } },
    },
  });

  // TASK-014: TODAS as faturas do sistema, SEM filtro de mes nem de conta -
  // uma fatura com dueDate no mes seguinte pode ter sido paga dentro da
  // janela ainda no mes consultado.
  const bills = await prisma.creditCardBill.findMany({
    select: { totalAmount: true, dueDate: true },
  });
  const billsForMatch = bills.map((bill) => ({
    totalAmount: bill.totalAmount.toString(),
    dueDate: bill.dueDate,
  }));

  let receita = new Prisma.Decimal(0);
  let despesa = new Prisma.Decimal(0);
  let transferCount = 0;
  let transferTotal = new Prisma.Decimal(0);
  let billPaymentCount = 0;
  let billPaymentTotal = new Prisma.Decimal(0);
  const porCategoriaMap = new Map<string, Prisma.Decimal>();
  const porMetodo: Record<Exclude<ExpenseMethod, null>, Prisma.Decimal> = {
    credito: new Prisma.Decimal(0),
    pixTed: new Prisma.Decimal(0),
    debito: new Prisma.Decimal(0),
    dinheiro: new Prisma.Decimal(0),
  };

  for (const row of rows) {
    if (isTransferCategory(row.category)) {
      transferCount += 1;
      transferTotal = transferTotal.plus(row.amount.abs());
      continue;
    }

    if (
      row.account.type !== "CREDIT_CARD" &&
      isBillPayment({ amount: row.amount.toString(), date: row.date }, billsForMatch)
    ) {
      billPaymentCount += 1;
      billPaymentTotal = billPaymentTotal.plus(row.amount.abs());
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

      const metodo = classifyExpenseMethod({
        accountType: row.account.type,
        method: row.method,
      });
      if (metodo !== null) {
        porMetodo[metodo] = porMetodo[metodo].plus(valorAbsoluto);
      }
    }
    // amount === 0: nao entra em receita, despesa, porCategoria nem porMetodo.
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
    porMetodo: {
      credito: porMetodo.credito.toFixed(2),
      pixTed: porMetodo.pixTed.toFixed(2),
      debito: porMetodo.debito.toFixed(2),
      dinheiro: porMetodo.dinheiro.toFixed(2),
    },
    transferenciasExcluidas: {
      count: transferCount,
      total: transferTotal.toFixed(2),
    },
    pagamentosFaturaExcluidos: {
      count: billPaymentCount,
      total: billPaymentTotal.toFixed(2),
    },
  };
}
