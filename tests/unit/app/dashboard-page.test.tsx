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
 *
 * ATUALIZACAO DELIBERADA (TASK-012 Parte 2 - apresentacao visual, Criterio
 * de aceite P2/P3): a pagina passa a formatar os valores monetarios em R$
 * via `formatBRL` (`lib/format.ts`, ver `tests/unit/lib/format.test.ts`)
 * em vez de exibir a string crua do Decimal. Isso MUDA o texto esperado
 * nos testes de receita/despesa/saldo/categoria abaixo - e uma mudanca de
 * apresentacao intencional, NAO de logica (`getMonthlySummary` continua
 * mockada devolvendo os mesmos valores crus; so a RENDERIZACAO mudou). Os
 * `data-testid` (`dashboard-receita`, `dashboard-despesa`,
 * `dashboard-saldo`, `category-row-<n>`) sao mantidos como ancora de
 * regressao - so o CONTEUDO textual esperado foi atualizado.
 *
 * Contrato adicional assumido para o coder (Parte 2):
 *   - `formatSignedAmount(amount)` passa a combinar o sinal explicito com
 *     `formatBRL`: se `amount` comeca com "-", retorna `formatBRL(amount)`
 *     (o Intl ja formata o sinal negativo ANTES de "R$", ex.
 *     `formatBRL("-200.00") === "-R$ 200,00"`); caso contrario, retorna
 *     `"+" + formatBRL(amount)` (ex. `formatBRL("561.17")` vira
 *     `"+R$ 561,17"`, e `formatBRL("0.00")` vira `"+R$ 0,00"`).
 *   - `dashboard-receita`/`dashboard-despesa` passam a exibir
 *     `formatBRL(summary.receita)`/`formatBRL(summary.despesa)`.
 *   - Cada `category-row-<indice>` passa a exibir `formatBRL(item.total)`
 *     no lugar do valor cru (ver tambem o describe de barras proporcionais,
 *     Criterio de aceite P3, mais abaixo neste arquivo).
 *   - `dashboard-transferencias-count` continua com a contagem CRUA (numero
 *     inteiro, nao e valor monetario).
 *   - `dashboard-transferencias-total` passa a exibir
 *     `formatBRL(summary.transferenciasExcluidas.total)` (ajuste de
 *     consistencia pos-aprovacao da Parte 2 - a tela inteira usa R$; deixar
 *     esse unico total cru destoava do restante). `formatBRL` e o MESMO
 *     helper puro de `lib/format.ts` ja usado no resto desta pagina.
 *
 * TASK-014 (correcao: pagamento de fatura fora do gasto + gastos por
 * metodo, Criterio de aceite #5) - MUDANCA DELIBERADA DE CONTRATO: o mock
 * de `getMonthlySummary` (`buildSummary()` abaixo) ganha os DOIS campos
 * novos do shape ampliado de `MonthlySummary` (contrato completo em
 * tests/integration/dashboard.integration.test.ts) - `porMetodo` e
 * `pagamentosFaturaExcluidos`. Isso NAO enfraquece nenhum teste existente
 * (os testes anteriores continuam checando exatamente os mesmos
 * `data-testid`/textos de antes); e necessario porque a pagina agora LE
 * esses campos para renderizar as novas secoes abaixo - sem eles no mock,
 * a pagina quebraria com `undefined` em TODOS os testes desta suite, nao
 * so nos novos.
 *
 * Contrato adicional assumido para o coder (TASK-014):
 *   - Nova secao "Gastos por método", com 4 elementos `data-testid`
 *     (mesmo padrao `.card`/`.kpi-*` das secoes de receita/despesa/saldo):
 *     `dashboard-metodo-credito`, `dashboard-metodo-pix-ted`,
 *     `dashboard-metodo-debito`, `dashboard-metodo-dinheiro` - cada um
 *     exibindo `formatBRL(summary.porMetodo.<campo>)`.
 *   - Nova secao "Pagamentos de fatura excluídos" (mesmo espirito de
 *     transparencia da secao "Transferências excluídas" ja existente, MAS
 *     SEPARADA dela - Criterio de aceite #3), com dois `data-testid`:
 *     `dashboard-pagamentos-fatura-count` (contagem crua) e
 *     `dashboard-pagamentos-fatura-total`
 *     (`formatBRL(summary.pagamentosFaturaExcluidos.total)`).
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
    // TASK-014: campos novos do shape ampliado de MonthlySummary (ver
    // docblock no topo deste arquivo) - default com valores distintos
    // entre si para que os testes tenham poder de deteccao real contra uma
    // implementacao que confunda os 4 buckets entre si.
    porMetodo: { credito: "138.83", pixTed: "290.00", debito: "60.00", dinheiro: "45.50" },
    transferenciasExcluidas: { count: 4, total: "4800.00" },
    pagamentosFaturaExcluidos: { count: 1, total: "3408.84" },
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

describe("app/dashboard/page.tsx - resumo do mes: receita, despesa, saldo FORMATADOS em R$ (Criterio de aceite P2, TASK-012 Parte 2)", () => {
  it("exibe receita e despesa FORMATADAS em R$ (nao mais o valor cru do Decimal)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({ receita: "1500.00", despesa: "938.83" }),
    );

    await renderPage({ month: "2026-07" });

    // toHaveTextContent normaliza espacos (inclusive o NBSP que o Intl
    // pt-BR/BRL pode inserir entre "R$" e o numero) antes de comparar -
    // ver node_modules/@testing-library/jest-dom `normalize()` - por isso a
    // asserção com espaco comum abaixo e robusta ao caractere real usado.
    expect(screen.getByTestId("dashboard-receita")).toHaveTextContent("R$ 1.500,00");
    expect(screen.getByTestId("dashboard-despesa")).toHaveTextContent("R$ 938,83");
    // Prova que NAO e mais o valor cru: "1500.00"/"938.83" (com ponto) nao
    // aparecem mais no texto.
    expect(screen.getByTestId("dashboard-receita").textContent).not.toContain(
      "1500.00",
    );
    expect(screen.getByTestId("dashboard-despesa").textContent).not.toContain(
      "938.83",
    );
  });

  it("saldo POSITIVO e exibido com o sinal '+' EXPLICITO e formatado em R$ ('+R$ 561,17')", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary({ saldo: "561.17" }));

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-saldo")).toHaveTextContent("+R$ 561,17");
  });

  it("saldo NEGATIVO e exibido formatado em R$, com o '-' ANTES de 'R$' (sem duplicar nem virar '+-R$')", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary({ saldo: "-200.00" }));

    await renderPage({ month: "2026-07" });

    const saldoEl = screen.getByTestId("dashboard-saldo");
    expect(saldoEl).toHaveTextContent("-R$ 200,00");
    expect(saldoEl.textContent).not.toContain("+-");
    expect(saldoEl.textContent).not.toContain("--");
  });

  it("saldo ZERO nao lanca, nao mostra dois sinais e aparece formatado em R$ ('+R$ 0,00')", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary({ saldo: "0.00" }));

    await renderPage({ month: "2026-07" });

    const saldoEl = screen.getByTestId("dashboard-saldo");
    expect(saldoEl.textContent).not.toContain("+-");
    expect(saldoEl).toHaveTextContent("+R$ 0,00");
  });
});

describe("app/dashboard/page.tsx - gastos por categoria (Criterio de aceite #4/#7, valores formatados em R$ - Criterio de aceite P2/P3)", () => {
  it("renderiza uma linha por categoria de porCategoria, NA MESMA ORDEM recebida (decrescente, ja ordenada por lib/dashboard.ts), com o total FORMATADO em R$", async () => {
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
    expect(within(row0).getByText(/R\$\s*800,00/)).toBeInTheDocument();
    expect(within(row1).getByText(/Online shopping/)).toBeInTheDocument();
    expect(within(row1).getByText(/R\$\s*138,83/)).toBeInTheDocument();
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

/**
 * Barras horizontais proporcionais (Criterio de aceite P3, TASK-012 Parte
 * 2). Contrato assumido para o coder: cada `category-row-<indice>` ganha um
 * elemento IRMAO/FILHO com `data-testid="category-bar-<indice>"` cujo estilo
 * inline `width` e uma porcentagem proporcional ao valor da categoria em
 * relacao ao MAIOR valor do conjunto `porCategoria` daquela renderizacao
 * (nao um valor global/hardcoded): `largura% = (total_da_categoria /
 * maior_total_do_conjunto) * 100`. A categoria de maior valor sempre fica em
 * 100%.
 *
 * Os testes abaixo leem `style.width` via `parseFloat` (tolerante a
 * diferencas de formatacao como "50%" vs "50.00%" - nao e o que se quer
 * travar aqui) e comparam o NUMERO, o que prova a PROPORCAO real. O segundo
 * teste usa valores (100/90/10) deliberadamente DIFERENTES do que um
 * "ranking por posicao" produziria (que daria algo como 100%/66%/33% para 3
 * itens) - isso tem poder de deteccao real contra uma implementacao que
 * despeja um valor fixo por posicao em vez de calcular a proporcao de fato.
 */
describe("app/dashboard/page.tsx - gastos por categoria como barras proporcionais (Criterio de aceite P3, TASK-012 Parte 2)", () => {
  function widthPercent(testId: string): number {
    const bar = screen.getByTestId(testId);
    return Number.parseFloat(bar.style.width);
  }

  it("a categoria de MAIOR valor tem a barra em 100% de largura; as demais, proporcionais (100/50/25 -> 100%/50%/25%)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({
        porCategoria: [
          { category: "Maior", total: "100.00" },
          { category: "Metade", total: "50.00" },
          { category: "Um quarto", total: "25.00" },
        ],
      }),
    );

    await renderPage({ month: "2026-07" });

    expect(widthPercent("category-bar-0")).toBeCloseTo(100, 5);
    expect(widthPercent("category-bar-1")).toBeCloseTo(50, 5);
    expect(widthPercent("category-bar-2")).toBeCloseTo(25, 5);
    expect(screen.getByTestId("category-bar-0").style.width.trim()).toMatch(/%$/);
  });

  it("prova a PROPORCAO real (nao apenas o ranking/posicao): 100/90/10 gera 100%/90%/10%, distinguindo de um calculo por posicao (que daria ~100%/66%/33%)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({
        porCategoria: [
          { category: "A", total: "100.00" },
          { category: "B", total: "90.00" },
          { category: "C", total: "10.00" },
        ],
      }),
    );

    await renderPage({ month: "2026-07" });

    expect(widthPercent("category-bar-0")).toBeCloseTo(100, 5);
    expect(widthPercent("category-bar-1")).toBeCloseTo(90, 5);
    expect(widthPercent("category-bar-2")).toBeCloseTo(10, 5);
  });

  it("com UMA UNICA categoria, a barra ocupa 100% mesmo sozinha (maior valor do conjunto e ela mesma)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({ porCategoria: [{ category: "Unica", total: "42.00" }] }),
    );

    await renderPage({ month: "2026-07" });

    expect(widthPercent("category-bar-0")).toBeCloseTo(100, 5);
  });

  it("categoria com valor ZERO ao lado de outra com valor positivo gera barra de 0% (sem NaN/Infinity)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({
        porCategoria: [
          { category: "Com gasto", total: "100.00" },
          { category: "Sem gasto", total: "0.00" },
        ],
      }),
    );

    await renderPage({ month: "2026-07" });

    expect(widthPercent("category-bar-0")).toBeCloseTo(100, 5);
    expect(widthPercent("category-bar-1")).toBeCloseTo(0, 5);
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
    // Formatado em R$ (toHaveTextContent normaliza o NBSP que o Intl
    // pt-BR/BRL pode inserir - mesmo cuidado dos outros valores desta
    // pagina, ver tests/unit/lib/format.test.ts).
    expect(screen.getByTestId("dashboard-transferencias-total")).toHaveTextContent(
      "R$ 4.800,00",
    );
    // Prova que NAO e mais o valor cru.
    expect(
      screen.getByTestId("dashboard-transferencias-total").textContent,
    ).not.toContain("4800.00");
  });

  it("com ZERO transferencias excluidas, mostra contagem 0 e total formatado 'R$ 0,00' (nao esconde a linha)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({ transferenciasExcluidas: { count: 0, total: "0.00" } }),
    );

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-transferencias-count")).toHaveTextContent(
      "0",
    );
    expect(screen.getByTestId("dashboard-transferencias-total")).toHaveTextContent(
      "R$ 0,00",
    );
  });
});

describe("app/dashboard/page.tsx - cards de gasto por método (Criterio de aceite #5, TASK-014)", () => {
  it("exibe os 4 valores de porMetodo, cada um FORMATADO em R$, sem confundir um bucket com outro", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({
        porMetodo: { credito: "138.83", pixTed: "290.00", debito: "60.00", dinheiro: "45.50" },
      }),
    );

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-metodo-credito")).toHaveTextContent(
      "R$ 138,83",
    );
    expect(screen.getByTestId("dashboard-metodo-pix-ted")).toHaveTextContent(
      "R$ 290,00",
    );
    expect(screen.getByTestId("dashboard-metodo-debito")).toHaveTextContent(
      "R$ 60,00",
    );
    expect(screen.getByTestId("dashboard-metodo-dinheiro")).toHaveTextContent(
      "R$ 45,50",
    );
  });

  it("todos os 4 buckets ZERADOS ('0.00') nao lancam e mostram 'R$ 0,00' em cada card", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({
        porMetodo: { credito: "0.00", pixTed: "0.00", debito: "0.00", dinheiro: "0.00" },
      }),
    );

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-metodo-credito")).toHaveTextContent("R$ 0,00");
    expect(screen.getByTestId("dashboard-metodo-pix-ted")).toHaveTextContent("R$ 0,00");
    expect(screen.getByTestId("dashboard-metodo-debito")).toHaveTextContent("R$ 0,00");
    expect(screen.getByTestId("dashboard-metodo-dinheiro")).toHaveTextContent("R$ 0,00");
  });
});

describe("app/dashboard/page.tsx - pagamentos de fatura excluídos, transparência SEPARADA de transferências (Criterio de aceite #3/#5, TASK-014)", () => {
  it("exibe a CONTAGEM e o TOTAL de pagamentosFaturaExcluidos, formatado em R$, em elementos DIFERENTES dos de transferenciasExcluidas", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({
        pagamentosFaturaExcluidos: { count: 1, total: "3408.84" },
        transferenciasExcluidas: { count: 4, total: "4800.00" },
      }),
    );

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-pagamentos-fatura-count")).toHaveTextContent(
      "1",
    );
    expect(screen.getByTestId("dashboard-pagamentos-fatura-total")).toHaveTextContent(
      "R$ 3.408,84",
    );
    // Continua distinto do card de transferencias (nao foi somado nele).
    expect(screen.getByTestId("dashboard-transferencias-count")).toHaveTextContent(
      "4",
    );
    expect(screen.getByTestId("dashboard-transferencias-total")).toHaveTextContent(
      "R$ 4.800,00",
    );
  });

  it("com ZERO pagamentos de fatura excluidos, mostra contagem 0 e total 'R$ 0,00' (nao esconde a linha)", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(
      buildSummary({ pagamentosFaturaExcluidos: { count: 0, total: "0.00" } }),
    );

    await renderPage({ month: "2026-07" });

    expect(screen.getByTestId("dashboard-pagamentos-fatura-count")).toHaveTextContent(
      "0",
    );
    expect(screen.getByTestId("dashboard-pagamentos-fatura-total")).toHaveTextContent(
      "R$ 0,00",
    );
  });
});
