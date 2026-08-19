/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

/**
 * Teste de Testing Library da tela de dashboard (TASK-010 - Fase 5,
 * Criterio de aceite #7). Ambiente `jsdom` via docblock no topo do arquivo
 * (mesmo padrao de tests/unit/app/transacoes-page.test.tsx, TASK-007).
 *
 * `@/lib/dashboard` e mockada PARCIALMENTE: so `getMonthlySummary` e
 * mockada; `monthQuerySchema` e `getCurrentMonthUTC` continuam REAIS (via
 * `importOriginal`) - a pagina usa o MESMO schema Zod da rota e o MESMO
 * helper de mes corrente, com fallback gracioso para o mes corrente quando
 * `searchParams.month` esta ausente/invalido (mesmo espirito "nao quebrar"
 * de TASK-007/#1/#6, generalizado a esta tela).
 *
 * `app/dashboard/page.tsx` e um Server Component (funcao async, SEM "use
 * client" - busca os dados direto de `lib/dashboard.ts`, sem endpoint HTTP
 * intermediario, mesmo padrao de app/transacoes/page.tsx da TASK-007).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/dashboard/page.tsx
 *     export default async function DashboardPage({ searchParams }: {
 *       searchParams: Promise<{ [key: string]: string | string[] | undefined }>
 *     }): Promise<JSX.Element>
 *
 * Deve:
 *   - `await searchParams`, parsear com `monthQuerySchema.safeParse`; se
 *     invalido/ausente, usar `getCurrentMonthUTC()` como mes efetivo (nao
 *     lancar);
 *   - chamar `getMonthlySummary(month)` exatamente uma vez;
 *   - renderizar um FORM com `method="GET"` contendo um
 *     `<input type="month">` associado a um `<label>` com texto "Mês"
 *     (acessivel via `getByLabelText(/m[eê]s/i)`), `defaultValue` = mes
 *     efetivo, e um botao de submit;
 *   - o RESUMO do mes com tres elementos com `data-testid`:
 *     `dashboard-receita` (valor cru de `summary.receita`, sem sinal - ja e
 *     sempre >= 0), `dashboard-despesa` (idem), `dashboard-saldo` (com
 *     SINAL EXPLICITO: `summary.saldo` ja vem com "-" quando negativo -
 *     Decimal.toString() - so precisa prefixar "+" quando NAO comeca com
 *     "-", mesmo `formatSignedAmount` de app/transacoes/page.tsx);
 *   - "Gastos por categoria": para CADA item de `summary.porCategoria`
 *     (NESSA ORDEM, sem reordenar - a ordenacao e responsabilidade de
 *     `lib/dashboard.ts`), um elemento com `data-testid="category-row-<indice>"`
 *     contendo o nome da categoria e o total; quando `porCategoria` e `[]`,
 *     uma mensagem de estado vazio "Nenhum gasto no período.";
 *   - "Transferências excluídas": dois elementos com `data-testid`
 *     `dashboard-transferencias-count` (contagem) e
 *     `dashboard-transferencias-total` (total, valor cru).
 */

const { getMonthlySummaryMock } = vi.hoisted(() => ({
  getMonthlySummaryMock: vi.fn(),
}));

vi.mock("@/lib/dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboard")>();
  return {
    ...actual,
    getMonthlySummary: getMonthlySummaryMock,
  };
});

function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    month: "2026-07",
    receita: "1500.00",
    despesa: "938.83",
    saldo: "561.17",
    porCategoria: [
      { category: "Housing", total: "800.00" },
      { category: "Online shopping", total: "138.83" },
    ],
    transferenciasExcluidas: { count: 4, total: "4800.00" },
    ...overrides,
  };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  const { default: DashboardPage } = await import("@/app/dashboard/page");
  render(await DashboardPage({ searchParams: Promise.resolve(searchParams) }));
}

afterEach(() => {
  // `globals: false` desativa o cleanup automatico do Testing Library -
  // mesmo padrao de connect-bank-button.test.tsx/transacoes-page.test.tsx.
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("app/dashboard/page.tsx - selecao de mes, default mes corrente (Criterio de aceite #7, secao 3)", () => {
  it("sem month em searchParams, usa o mes CORRENTE (UTC) como default e chama getMonthlySummary com ele", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T15:00:00.000Z"));
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({ month: "2026-08" }),
    );

    await renderPage();

    expect(getMonthlySummaryMock).toHaveBeenCalledWith("2026-08");
    expect(screen.getByLabelText(/m[eê]s/i)).toHaveValue("2026-08");
  });

  it("com ?month=2026-07 explicito, usa esse mes (nao o corrente) e pre-preenche o input", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary({ month: "2026-07" }));

    await renderPage({ month: "2026-07" });

    expect(getMonthlySummaryMock).toHaveBeenCalledWith("2026-07");
    expect(screen.getByLabelText(/m[eê]s/i)).toHaveValue("2026-07");
  });

  it("month invalido em searchParams (ex.: URL digitada a mao) NAO quebra a pagina - cai no mes corrente em vez de lancar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary({ month: "2026-03" }));

    await renderPage({ month: "isso-nao-e-um-mes" });

    expect(getMonthlySummaryMock).toHaveBeenCalledWith("2026-03");
  });

  it("renderiza um input type='month' associado ao label 'Mês' e um formulario GET", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary());

    await renderPage({ month: "2026-07" });

    const monthInput = screen.getByLabelText(/m[eê]s/i);
    expect(monthInput).toHaveAttribute("type", "month");
    expect(monthInput.closest("form")).toHaveAttribute("method", "GET");
  });

  it("chama getMonthlySummary exatamente uma vez por renderizacao", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary());

    await renderPage({ month: "2026-07" });

    expect(getMonthlySummaryMock).toHaveBeenCalledTimes(1);
  });
});

describe("app/dashboard/page.tsx - resumo do mes: receita, despesa, saldo (Criterio de aceite #1/#7)", () => {
  it("exibe receita e despesa com os valores CRUS de getMonthlySummary (sem sinal - ja sao sempre >= 0)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({ receita: "1500.00", despesa: "938.83" }),
    );

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-receita")).toHaveTextContent("1500.00");
    expect(screen.getByTestId("dashboard-despesa")).toHaveTextContent("938.83");
  });

  it("saldo POSITIVO e exibido com o sinal '+' EXPLICITO", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary({ saldo: "561.17" }));

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-saldo")).toHaveTextContent("+561.17");
  });

  it("saldo NEGATIVO e exibido com o sinal '-' (ja presente na string, sem duplicar nem virar '+-')", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary({ saldo: "-200.00" }));

    await renderPage({ month: "2026-07" });

    const saldoEl = screen.getByTestId("dashboard-saldo");
    expect(saldoEl).toHaveTextContent("-200.00");
    expect(saldoEl.textContent).not.toContain("+-");
    expect(saldoEl.textContent).not.toContain("--");
  });

  it("saldo ZERO nao lanca e nao mostra dois sinais", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary({ saldo: "0.00" }));

    await renderPage({ month: "2026-07" });

    const saldoEl = screen.getByTestId("dashboard-saldo");
    expect(saldoEl.textContent).not.toContain("+-");
    expect(saldoEl.textContent).toContain("0.00");
  });
});

describe("app/dashboard/page.tsx - gastos por categoria (Criterio de aceite #4/#7)", () => {
  it("renderiza uma linha por categoria de porCategoria, NA MESMA ORDEM recebida (decrescente, ja ordenada por lib/dashboard.ts)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({
        porCategoria: [
          { category: "Housing", total: "800.00" },
          { category: "Online shopping", total: "138.83" },
          { category: "Sem categoria", total: "10.00" },
        ],
      }),
    );

    await renderPage({ month: "2026-07" });

    const row0 = screen.getByTestId("category-row-0");
    const row1 = screen.getByTestId("category-row-1");
    const row2 = screen.getByTestId("category-row-2");

    expect(within(row0).getByText(/Housing/)).toBeInTheDocument();
    expect(within(row0).getByText(/800\.00/)).toBeInTheDocument();
    expect(within(row1).getByText(/Online shopping/)).toBeInTheDocument();
    expect(within(row1).getByText(/138\.83/)).toBeInTheDocument();
    expect(within(row2).getByText(/Sem categoria/)).toBeInTheDocument();

    expect(screen.queryByTestId("category-row-3")).not.toBeInTheDocument();
  });

  it("porCategoria vazio ([]) mostra a mensagem de estado vazio 'Nenhum gasto no período.'", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary({ porCategoria: [] }));

    await renderPage({ month: "2026-07" });

    expect(
      screen.getByText(/nenhum gasto no per[ií]odo/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("category-row-0")).not.toBeInTheDocument();
  });
});

describe("app/dashboard/page.tsx - transferencias excluidas, transparencia (secao 2, DT-018)", () => {
  it("exibe a CONTAGEM e o TOTAL de transferencias excluidas, visiveis na tela", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({ transferenciasExcluidas: { count: 4, total: "4800.00" } }),
    );

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-transferencias-count")).toHaveTextContent(
      "4",
    );
    expect(screen.getByTestId("dashboard-transferencias-total")).toHaveTextContent(
      "4800.00",
    );
  });

  it("com ZERO transferencias excluidas, mostra contagem 0 e total 0.00 (nao esconde a linha)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({ transferenciasExcluidas: { count: 0, total: "0.00" } }),
    );

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-transferencias-count")).toHaveTextContent(
      "0",
    );
    expect(screen.getByTestId("dashboard-transferencias-total")).toHaveTextContent(
      "0.00",
    );
  });
});
