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
 *
 * TASK-013 (sistema de design Fintech Premium): mais uma vez so a
 * apresentacao muda - KPI cards, barra de categoria com gradiente/glow
 * (classes `.card`/`.kpi-*`/`.cat-row`/`.track`/`.fill` de
 * `app/globals.css`). Todos os `data-testid` (`dashboard-receita`,
 * `dashboard-despesa`, `dashboard-saldo`, `category-row-<n>`,
 * `category-bar-<n>`, `dashboard-transferencias-count`,
 * `dashboard-transferencias-total`) e o texto formatado por `formatBRL`
 * continuam identicos (contrato de tests/unit/app/dashboard-page.test.tsx).
 *
 * TASK-014 (correcao: pagamento de fatura fora do gasto + gastos por
 * metodo): duas secoes novas, reutilizando os mesmos primitivos
 * (`.card`/`.kpi-*`) e `formatBRL` - "Gastos por método" (4 cards, um por
 * bucket de `summary.porMetodo`) e "Pagamentos de fatura excluídos"
 * (contagem + total de `summary.pagamentosFaturaExcluidos`, SEPARADA da
 * secao "Transferências excluídas" ja existente - Criterio de aceite #3).
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
    <li data-testid={`category-row-${index}`} className="cat-row">
      <span className="cat-name">{item.category}</span>
      <span className="track">
        <span
          data-testid={`category-bar-${index}`}
          className="fill"
          style={{ width: `${barWidthPercent(item.total, maxTotal)}%` }}
        />
      </span>
      <span className="cat-amt num">{formatBRL(item.total)}</span>
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
    ? "text-[var(--neg)]"
    : Number(summary.saldo) === 0
      ? "text-[var(--text-2)]"
      : "text-[var(--pos)]";

  return (
    <main className="flex flex-col gap-6">
      <div className="page-head flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Visão do mês</p>
          <h1>Dashboard</h1>
          <p>Quanto entrou, quanto saiu e para onde foi.</p>
        </div>

        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="month" className="field-label">
              Mês
            </label>
            <input
              id="month"
              name="month"
              type="month"
              defaultValue={month}
              className="field-input"
            />
          </div>
          <button type="submit" className="btn-primary">
            Ver mês
          </button>
        </form>
      </div>

      <section aria-label="Resumo do período" className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="kpi-label">
            <span className="kpi-dot" style={{ background: "var(--pos)" }} /> Receita
          </p>
          <p
            data-testid="dashboard-receita"
            className="kpi-value num text-[var(--pos)]"
          >
            {formatBRL(summary.receita)}
          </p>
        </div>
        <div className="card">
          <p className="kpi-label">
            <span className="kpi-dot" style={{ background: "var(--neg)" }} /> Despesa
          </p>
          <p data-testid="dashboard-despesa" className="kpi-value num">
            {formatBRL(summary.despesa)}
          </p>
        </div>
        <div className="card">
          <p className="kpi-label">
            <span className="kpi-dot" style={{ background: "var(--accent-bright)" }} />{" "}
            Saldo do mês
          </p>
          <p
            data-testid="dashboard-saldo"
            className={`kpi-value num ${saldoColorClass}`}
          >
            {formatSignedAmount(summary.saldo)}
          </p>
          <p className="kpi-sub">Receita menos despesa, sem transferências</p>
        </div>
      </section>

      <section aria-label="Gastos por categoria" className="card">
        <div className="card-head">
          <h2 className="card-title">Gastos por categoria</h2>
          <span className="eyebrow">{summary.porCategoria.length} categorias</span>
        </div>
        {summary.porCategoria.length === 0 ? (
          <p className="empty-text">Nenhum gasto no período.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {summary.porCategoria.map((item, index) => (
              <CategoryRow key={item.category} item={item} index={index} maxTotal={maxTotal} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Gastos por método" className="grid gap-4 sm:grid-cols-4">
        <div className="card">
          <p className="kpi-label">
            <span className="kpi-dot" style={{ background: "var(--accent-bright)" }} />{" "}
            Crédito
          </p>
          <p data-testid="dashboard-metodo-credito" className="kpi-value num">
            {formatBRL(summary.porMetodo.credito)}
          </p>
        </div>
        <div className="card">
          <p className="kpi-label">
            <span className="kpi-dot" style={{ background: "var(--accent-bright)" }} />{" "}
            Pix/TED
          </p>
          <p data-testid="dashboard-metodo-pix-ted" className="kpi-value num">
            {formatBRL(summary.porMetodo.pixTed)}
          </p>
        </div>
        <div className="card">
          <p className="kpi-label">
            <span className="kpi-dot" style={{ background: "var(--accent-bright)" }} />{" "}
            Débito
          </p>
          <p data-testid="dashboard-metodo-debito" className="kpi-value num">
            {formatBRL(summary.porMetodo.debito)}
          </p>
        </div>
        <div className="card">
          <p className="kpi-label">
            <span className="kpi-dot" style={{ background: "var(--accent-bright)" }} />{" "}
            Dinheiro
          </p>
          <p data-testid="dashboard-metodo-dinheiro" className="kpi-value num">
            {formatBRL(summary.porMetodo.dinheiro)}
          </p>
        </div>
      </section>

      <section aria-label="Transferências excluídas" className="card">
        <div className="card-head">
          <h2 className="card-title">Transferências excluídas</h2>
        </div>
        <p className="text-sm text-[var(--text-2)]">
          Quantidade:{" "}
          <span data-testid="dashboard-transferencias-count" className="num">
            {summary.transferenciasExcluidas.count}
          </span>
        </p>
        <p className="text-sm text-[var(--text-2)]">
          Total:{" "}
          <span data-testid="dashboard-transferencias-total" className="num">
            {formatBRL(summary.transferenciasExcluidas.total)}
          </span>
        </p>
      </section>

      <section aria-label="Pagamentos de fatura excluídos" className="card">
        <div className="card-head">
          <h2 className="card-title">Pagamentos de fatura excluídos</h2>
        </div>
        <p className="text-sm text-[var(--text-2)]">
          Quantidade:{" "}
          <span data-testid="dashboard-pagamentos-fatura-count" className="num">
            {summary.pagamentosFaturaExcluidos.count}
          </span>
        </p>
        <p className="text-sm text-[var(--text-2)]">
          Total:{" "}
          <span data-testid="dashboard-pagamentos-fatura-total" className="num">
            {formatBRL(summary.pagamentosFaturaExcluidos.total)}
          </span>
        </p>
      </section>
    </main>
  );
}
