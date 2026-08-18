/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

/**
 * Teste de Testing Library da tela de transacoes (TASK-007 - fecha a Fase
 * 2, Criterio de aceite #3, #4, #5, #6). Ambiente `jsdom` via docblock no
 * topo do arquivo (mesmo padrao de tests/unit/app/bancos-page.test.tsx,
 * TASK-005).
 *
 * `@/lib/transactions` e mockada PARCIALMENTE: `listTransactions` e
 * `listAccountsForFilter` (as duas funcoes que tocam o Postgres) sao
 * mockadas, mas `transactionsQuerySchema`/`DEFAULT_PAGE_SIZE` continuam
 * REAIS (via `importOriginal`) - a pagina usa o MESMO schema Zod da rota
 * para nao quebrar com uma URL digitada a mao (`?startDate=lixo`), com
 * fallback gracioso para o filtro padrao em vez de lancar (mesmo espirito
 * do "nao quebrar" do Criterio de aceite #1/#6).
 *
 * `app/transacoes/page.tsx` e um Server Component (funcao async, SEM "use
 * client" - busca os dados direto de `lib/transactions.ts`, sem endpoint
 * HTTP intermediario, mesmo padrao de app/bancos/page.tsx da TASK-005).
 * Testado chamando a funcao async diretamente e renderizando o elemento
 * resultante (tecnica ja usada em tests/unit/app/bancos-page.test.tsx).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim, ver secao 5 do TASK-007.md):
 *
 *   app/transacoes/page.tsx
 *     export default async function TransacoesPage({ searchParams }: {
 *       searchParams: Promise<{ [key: string]: string | string[] | undefined }>
 *     }): Promise<JSX.Element>
 *
 * Deve:
 *   - `await searchParams`, parsear com `transactionsQuerySchema.safeParse`;
 *     se invalido, usar o filtro padrao (`{ page: 1, limit: DEFAULT_PAGE_SIZE }`)
 *     em vez de lancar;
 *   - chamar `listTransactions(query)` e `listAccountsForFilter()`;
 *   - renderizar um FORM com `method="GET"` contendo:
 *     - um `<select>` associado a um `<label>` com texto "Conta" (accessivel
 *       via `getByLabelText(/conta/i)`), com uma `<option>` por conta de
 *       `listAccountsForFilter()`, valor pre-selecionado = `query.accountId`;
 *     - um `<input type="date">` associado a um `<label>` "Data inicial",
 *       `defaultValue` = `query.startDate`;
 *     - um `<input type="date">` associado a um `<label>` "Data final",
 *       `defaultValue` = `query.endDate`;
 *     - um botao de submit (Filtrar);
 *   - para CADA transacao, uma linha com `data-testid="transaction-row-<id>"`
 *     e `data-status="<status>"`, contendo data, descricao, valor COM SINAL
 *     explicito (`-` para negativo, `+` para positivo - nao so a ausencia
 *     de sinal), o nome da conta (`accountName`), o `method` e a `category`
 *     JA RESOLVIDA (o dado que chega de `listTransactions` - a pagina so
 *     exibe, a resolucao override->Pluggy e responsabilidade de `lib/transactions.ts`,
 *     Criterio de aceite #2);
 *   - quando `status === "PENDING"`, a linha mostra um indicador textual
 *     "Pendente" visivel; quando `"POSTED"`, esse indicador NAO aparece
 *     (Criterio de aceite #5);
 *   - uma navegacao de paginacao (`<nav aria-label="Paginação">`) com links
 *     acessiveis por nome "Anterior"/"Próxima", presentes/ausentes conforme
 *     `page`/`total`/`limit` (Criterio de aceite #4 - a pagina NUNCA
 *     despeja mais linhas do que `listTransactions` devolveu);
 *   - mensagem de estado vazio quando `transactions.length === 0`.
 */

const { listTransactionsMock, listAccountsForFilterMock } = vi.hoisted(() => ({
  listTransactionsMock: vi.fn(),
  listAccountsForFilterMock: vi.fn(),
}));

vi.mock("@/lib/transactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/transactions")>();
  return {
    ...actual,
    listTransactions: listTransactionsMock,
    listAccountsForFilter: listAccountsForFilterMock,
  };
});

function buildTransactionItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    date: new Date("2026-07-15T12:00:00.000Z"),
    description: "Supermercado",
    amount: "-123.45",
    accountId: "acc-1",
    accountName: "Conta Corrente",
    method: "DEBIT",
    status: "POSTED",
    category: "Alimentação",
    ...overrides,
  };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  const { default: TransacoesPage } = await import("@/app/transacoes/page");
  render(await TransacoesPage({ searchParams: Promise.resolve(searchParams) }));
}

afterEach(() => {
  // `globals: false` desativa o cleanup automatico do Testing Library entre
  // testes - ver o mesmo comentario em connect-bank-button.test.tsx/TASK-005.
  cleanup();
  vi.clearAllMocks();
});

describe("app/transacoes/page.tsx - lista transacoes com data, descricao, valor com sinal, conta, metodo e categoria efetiva (secao 2, Criterio de aceite #3)", () => {
  it("renderiza uma linha por transacao com descricao, conta, metodo e categoria (ja resolvida por lib/transactions.ts)", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [
        buildTransactionItem({
          id: "tx-neg",
          description: "Supermercado Central",
          accountName: "Conta Corrente Principal",
          method: "DEBIT",
          category: "Alimentação",
        }),
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([
      { id: "acc-1", name: "Conta Corrente Principal" },
    ]);

    await renderPage();

    const row = screen.getByTestId("transaction-row-tx-neg");
    expect(within(row).getByText("Supermercado Central")).toBeInTheDocument();
    expect(within(row).getByText(/Conta Corrente Principal/)).toBeInTheDocument();
    expect(within(row).getByText(/DEBIT/)).toBeInTheDocument();
    expect(within(row).getByText(/Alimenta[cç][aã]o/)).toBeInTheDocument();
    // Data renderizada em algum lugar da linha (ano presente).
    expect(row.textContent).toContain("2026");
  });

  it("valor negativo e exibido com o sinal '-' explicito", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [
        buildTransactionItem({ id: "tx-neg", amount: "-45.90", description: "Debito" }),
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage();

    const row = screen.getByTestId("transaction-row-tx-neg");
    expect(row.textContent).toMatch(/-\s?4?\D?5/);
    expect(row.textContent).toContain("-45");
  });

  it("valor positivo e exibido com o sinal '+' EXPLICITO (nao so ausencia de sinal)", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [
        buildTransactionItem({ id: "tx-pos", amount: "230.00", description: "Estorno" }),
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage();

    const row = screen.getByTestId("transaction-row-tx-pos");
    expect(row.textContent).toContain("+230");
  });

  it("categoria ausente (null) mostra um placeholder, nunca a string 'null'/'undefined'", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [
        buildTransactionItem({ id: "tx-sem-categoria", category: null, method: null }),
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage();

    const row = screen.getByTestId("transaction-row-tx-sem-categoria");
    expect(row.textContent).not.toContain("null");
    expect(row.textContent).not.toContain("undefined");
  });

  it("chama listTransactions e listAccountsForFilter exatamente uma vez", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage();

    expect(listTransactionsMock).toHaveBeenCalledTimes(1);
    expect(listAccountsForFilterMock).toHaveBeenCalledTimes(1);
  });
});

describe("app/transacoes/page.tsx - PENDING e visualmente distinto de POSTED (Criterio de aceite #5)", () => {
  it("uma transacao PENDING mostra o indicador 'Pendente' e tem data-status='PENDING'; uma POSTED nao mostra esse indicador e tem data-status='POSTED'", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [
        buildTransactionItem({
          id: "tx-pending",
          status: "PENDING",
          description: "Compra no cartao (ainda nao fechou)",
        }),
        buildTransactionItem({
          id: "tx-posted",
          status: "POSTED",
          description: "Compra ja fechada",
        }),
      ],
      total: 2,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage();

    const pendingRow = screen.getByTestId("transaction-row-tx-pending");
    const postedRow = screen.getByTestId("transaction-row-tx-posted");

    expect(pendingRow).toHaveAttribute("data-status", "PENDING");
    expect(postedRow).toHaveAttribute("data-status", "POSTED");
    expect(within(pendingRow).getByText(/pendente/i)).toBeInTheDocument();
    expect(within(postedRow).queryByText(/pendente/i)).not.toBeInTheDocument();
  });
});

describe("app/transacoes/page.tsx - filtros de conta e periodo (Criterio de aceite #3 da secao 3)", () => {
  it("renderiza um seletor de conta com todas as contas de listAccountsForFilter, e campos de data inicial/final", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([
      { id: "acc-1", name: "Conta Corrente" },
      { id: "acc-2", name: "Cartao" },
    ]);

    await renderPage();

    const accountSelect = screen.getByLabelText(/conta/i);
    expect(within(accountSelect).getByText("Conta Corrente")).toBeInTheDocument();
    expect(within(accountSelect).getByText("Cartao")).toBeInTheDocument();
    expect(screen.getByLabelText(/data inicial/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data final/i)).toBeInTheDocument();
  });

  it("os filtros presentes na URL (searchParams) aparecem PRE-PREENCHIDOS no formulario e sao repassados a listTransactions", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([
      { id: "acc-1", name: "Conta Corrente" },
    ]);

    await renderPage({
      accountId: "acc-1",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    expect(screen.getByLabelText(/conta/i)).toHaveValue("acc-1");
    expect(screen.getByLabelText(/data inicial/i)).toHaveValue("2026-07-01");
    expect(screen.getByLabelText(/data final/i)).toHaveValue("2026-07-31");

    expect(listTransactionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-1",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      }),
    );
  });

  it("searchParams invalidos (ex.: startDate malformada digitada na URL) NAO quebram a pagina - cai no filtro padrao em vez de lancar", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage({ startDate: "isso-nao-e-uma-data" });

    expect(listTransactionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });
});

describe("app/transacoes/page.tsx - paginacao (Criterio de aceite #4, nunca despeja mais linhas do que listTransactions devolveu)", () => {
  it("mostra link 'Proxima' quando ha mais paginas, e NENHUM link 'Anterior' na primeira pagina", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: Array.from({ length: 50 }, (_, i) =>
        buildTransactionItem({ id: `tx-${i}`, description: `Tx ${i}` }),
      ),
      total: 432,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage();

    expect(screen.getAllByTestId(/^transaction-row-/)).toHaveLength(50);
    expect(screen.getByRole("link", { name: /pr[oó]xima/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /anterior/i })).not.toBeInTheDocument();
  });

  it("numa pagina do meio mostra 'Anterior' E 'Proxima'", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [buildTransactionItem({ id: "tx-meio" })],
      total: 432,
      page: 5,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage({ page: "5" });

    expect(screen.getByRole("link", { name: /anterior/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pr[oó]xima/i })).toBeInTheDocument();
  });

  it("na ULTIMA pagina (432/50 = 9 paginas), mostra 'Anterior' mas NAO 'Proxima'", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [buildTransactionItem({ id: "tx-ultima" })],
      total: 432,
      page: 9,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage({ page: "9" });

    expect(screen.getByRole("link", { name: /anterior/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pr[oó]xima/i })).not.toBeInTheDocument();
  });

  it("quando total cabe numa unica pagina, NAO mostra nem 'Anterior' nem 'Proxima'", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [buildTransactionItem({ id: "tx-unica" })],
      total: 1,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage();

    expect(screen.queryByRole("link", { name: /anterior/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pr[oó]xima/i })).not.toBeInTheDocument();
  });
});

describe("app/transacoes/page.tsx - estado vazio", () => {
  it("mostra uma mensagem de estado vazio quando nao ha transacoes", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    listAccountsForFilterMock.mockResolvedValueOnce([]);

    await renderPage();

    expect(
      screen.getByText(/nenhuma transa[cç][aã]o encontrada/i),
    ).toBeInTheDocument();
  });
});
