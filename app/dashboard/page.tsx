import {
  getCurrentMonthUTC,
  getMonthlySummary,
  monthQuerySchema,
  type CategorySummary,
} from "@/lib/dashboard";

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
 */

/** Sinal explicito: negativo mantem o "-" ja presente na string do Decimal; positivo/zero ganham "+". */
function formatSignedAmount(amount: string): string {
  return amount.startsWith("-") ? amount : `+${amount}`;
}

function CategoryRow({ item, index }: { item: CategorySummary; index: number }) {
  return (
    <li data-testid={`category-row-${index}`}>
      <span>{item.category}</span>
      <span>{item.total}</span>
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

  return (
    <main>
      <h1>Dashboard</h1>

      <form method="GET">
        <label htmlFor="month">Mês</label>
        <input id="month" name="month" type="month" defaultValue={month} />
        <button type="submit">Ver mês</button>
      </form>

      <section aria-label="Resumo do período">
        <p>
          Receita: <span data-testid="dashboard-receita">{summary.receita}</span>
        </p>
        <p>
          Despesa: <span data-testid="dashboard-despesa">{summary.despesa}</span>
        </p>
        <p>
          Saldo:{" "}
          <span data-testid="dashboard-saldo">
            {formatSignedAmount(summary.saldo)}
          </span>
        </p>
      </section>

      <section aria-label="Gastos por categoria">
        <h2>Gastos por categoria</h2>
        {summary.porCategoria.length === 0 ? (
          <p>Nenhum gasto no período.</p>
        ) : (
          <ul>
            {summary.porCategoria.map((item, index) => (
              <CategoryRow key={item.category} item={item} index={index} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Transferências excluídas">
        <h2>Transferências excluídas</h2>
        <p>
          Quantidade:{" "}
          <span data-testid="dashboard-transferencias-count">
            {summary.transferenciasExcluidas.count}
          </span>
        </p>
        <p>
          Total:{" "}
          <span data-testid="dashboard-transferencias-total">
            {summary.transferenciasExcluidas.total}
          </span>
        </p>
      </section>
    </main>
  );
}
