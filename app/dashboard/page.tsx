import {
  getCurrentMonthUTC,
  getMonthlySummary,
  monthQuerySchema,
  type CategorySummary,
} from "@/lib/dashboard";
import { formatBRL } from "@/lib/format";

/**
 * Pagina do dashboard (TASK-010, primeira task da Fase 5) - Server
 * Component (sem `"use client"`): busca `getMonthlySummary` direto de
 * `lib/dashboard.ts`, sem round-trip HTTP (mesmo padrao de
 * `app/transacoes/page.tsx` da TASK-007).
 *
 * `searchParams.month` e validado com o MESMO schema Zod da rota
 * (`monthQuerySchema`) - se ausente ou invalido, cai no mes CORRENTE em UTC
 * (`getCurrentMonthUTC`) em vez de quebrar (mesmo espirito "nao quebrar" do
 * Criterio de aceite #1/#6 da TASK-007, generalizado a esta tela).
 *
 * TASK-012 Parte 2 (apresentacao visual): so a RENDERIZACAO mudou - os
 * valores monetarios passam a ser formatados em R$ via `formatBRL`
 * (`lib/format.ts`) e os gastos por categoria ganham uma barra horizontal
 * proporcional. Nenhuma logica de `lib/dashboard.ts` foi tocada (Criterio
 * de aceite P6).
 */

/** Sinal explicito e formatado em R$: negativo usa `formatBRL` (o Intl ja poe o "-" antes de "R$"); positivo/zero ganham "+" antes de "R$". */
function formatSignedAmount(amount: string): string {
  return amount.startsWith("-") ? formatBRL(amount) : `+${formatBRL(amount)}`;
}

/** Largura proporcional (%) de `total` em relacao ao maior valor do conjunto renderizado; 0 para conjunto vazio/maior zero. */
function barWidthPercent(total: string, maxTotal: number): number {
  if (maxTotal <= 0) {
    return 0;
  }
  return (Number(total) / maxTotal) * 100;
}

function CategoryRow({
  item,
  index,
  maxTotal,
}: {
  item: CategorySummary;
  index: number;
  maxTotal: number;
}) {
  return (
    <li
      data-testid={`category-row-${index}`}
      className="flex flex-col gap-1 py-2"
    >
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-slate-700">{item.category}</span>
        <span className="font-medium text-slate-900">{formatBRL(item.total)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          data-testid={`category-bar-${index}`}
          className="h-full rounded-full bg-sky-500"
          style={{ width: `${barWidthPercent(item.total, maxTotal)}%` }}
        />
      </div>
    </li>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const rawParams = await searchParams;
  const parsedParams = monthQuerySchema.safeParse(rawParams);
  const month = parsedParams.success ? parsedParams.data.month : getCurrentMonthUTC();

  const summary = await getMonthlySummary(month);

  const maxTotal = summary.porCategoria.length
    ? Math.max(...summary.porCategoria.map((item) => Number(item.total)))
    : 0;

  const saldoColorClass = summary.saldo.startsWith("-")
    ? "text-red-600"
    : Number(summary.saldo) === 0
      ? "text-slate-700"
      : "text-emerald-600";

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="month" className="text-sm font-medium text-slate-700">
            Mês
          </label>
          <input
            id="month"
            name="month"
            type="month"
            defaultValue={month}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white"
        >
          Ver mês
        </button>
      </form>

      <section aria-label="Resumo do período" className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Receita</p>
          <p
            data-testid="dashboard-receita"
            className="mt-1 text-xl font-semibold text-emerald-600"
          >
            {formatBRL(summary.receita)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Despesa</p>
          <p
            data-testid="dashboard-despesa"
            className="mt-1 text-xl font-semibold text-red-600"
          >
            {formatBRL(summary.despesa)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Saldo</p>
          <p
            data-testid="dashboard-saldo"
            className={`mt-1 text-xl font-semibold ${saldoColorClass}`}
          >
            {formatSignedAmount(summary.saldo)}
          </p>
        </div>
      </section>

      <section aria-label="Gastos por categoria" className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Gastos por categoria</h2>
        {summary.porCategoria.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhum gasto no período.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {summary.porCategoria.map((item, index) => (
              <CategoryRow key={item.category} item={item} index={index} maxTotal={maxTotal} />
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Transferências excluídas"
        className="rounded-lg border border-slate-200 p-4"
      >
        <h2 className="text-lg font-semibold text-slate-900">Transferências excluídas</h2>
        <p className="mt-2 text-sm text-slate-700">
          Quantidade:{" "}
          <span data-testid="dashboard-transferencias-count">
            {summary.transferenciasExcluidas.count}
          </span>
        </p>
        <p className="text-sm text-slate-700">
          Total:{" "}
          <span data-testid="dashboard-transferencias-total">
            {formatBRL(summary.transferenciasExcluidas.total)}
          </span>
        </p>
      </section>
    </main>
  );
}
