/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

/**
 * Teste de Testing Library da tela de faturas (TASK-011 - Fatura do cartao,
 * fecha a Fase 5, Criterio de aceite #7). Ambiente `jsdom` via docblock no
 * topo do arquivo (mesmo padrao de tests/unit/app/transacoes-page.test.tsx,
 * TASK-007, e tests/unit/app/bancos-page.test.tsx, TASK-005).
 *
 * `@/lib/bills` e mockada: `listBillsByCard` (a unica funcao que toca o
 * Postgres, usada pela pagina) e mockada por completo - nao precisa de
 * `importOriginal` aqui porque a pagina nao usa nenhum schema Zod (nao ha
 * filtro nesta tela, diferente de /transacoes - o filtro por conta vive so
 * na API route, Criterio de aceite #7).
 *
 * `app/faturas/page.tsx` e um Server Component (funcao async, SEM "use
 * client") - busca os dados direto de `lib/bills.ts`, sem round-trip HTTP
 * (mesmo padrao de app/transacoes/page.tsx e app/dashboard/page.tsx).
 * Testado chamando a funcao async diretamente e renderizando o elemento
 * resultante.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim, ver secao 5 do TASK-011.md):
 *
 *   app/faturas/page.tsx
 *     export default async function FaturasPage(): Promise<JSX.Element>
 *
 * Deve:
 *   - chamar `listBillsByCard()` (`@/lib/bills`);
 *   - para CADA cartao (`CardBillsGroup`), uma secao com
 *     `data-testid="card-<accountId>"` contendo o nome do cartao
 *     (`accountName`);
 *   - se `card.current` existir: mostra vencimento/total/minimo dessa
 *     fatura EM DESTAQUE, dentro de um container com
 *     `data-testid="current-bill-<accountId>"`; se `minimumPaymentAmount`
 *     for `null`, mostra um placeholder (nunca a string "null");
 *
 * ATUALIZACAO DELIBERADA (TASK-013 - consistencia visual, moeda em R$ em
 * todas as telas): `totalAmount`/`minimumPaymentAmount` passam a ser
 * exibidos FORMATADOS via `formatBRL` (`lib/format.ts`, mesmo helper puro
 * ja usado por app/dashboard/page.tsx desde TASK-012 Parte 2 e por
 * app/transacoes/page.tsx desde TASK-013) em vez do valor cru do Decimal
 * (`"3408.84"`).
 *   - se `card.current` for `null` (cartao sem NENHUMA fatura): mostra um
 *     estado vazio claro para aquele cartao, SEM lancar erro;
 *   - `card.history` vira uma lista de itens com
 *     `data-testid="history-bill-<billId>"`, na MESMA ordem recebida (a
 *     pagina nao reordena - `listBillsByCard` ja devolve decrescente por
 *     dueDate);
 *   - se `listBillsByCard()` devolver `[]` (nenhum cartao conectado): mostra
 *     uma mensagem de estado vazio geral da pagina.
 */

const { listBillsByCardMock } = vi.hoisted(() => ({
  listBillsByCardMock: vi.fn(),
}));

vi.mock("@/lib/bills", () => ({
  listBillsByCard: listBillsByCardMock,
}));

function buildBillItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "bill-1",
    pluggyBillId: "pluggy-bill-1",
    accountId: "acc-1",
    accountName: "Cartao Black",
    dueDate: new Date("2026-08-10T00:00:00.000Z"),
    totalAmount: "3408.84",
    minimumPaymentAmount: "511.32",
    ...overrides,
  };
}

function buildCardGroup(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acc-1",
    accountName: "Cartao Black",
    current: buildBillItem(),
    history: [],
    ...overrides,
  };
}

async function renderPage() {
  const { default: FaturasPage } = await import("@/app/faturas/page");
  render(await FaturasPage());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("app/faturas/page.tsx - fatura atual em destaque (Criterio de aceite #7, secao 2)", () => {
  it("mostra o total, vencimento e minimo da fatura mais recente, dentro do container 'current-bill'", async () => {
    listBillsByCardMock.mockResolvedValueOnce([
      buildCardGroup({
        accountId: "acc-1",
        accountName: "Cartao Black",
        current: buildBillItem({
          dueDate: new Date("2026-08-10T00:00:00.000Z"),
          totalAmount: "3408.84",
          minimumPaymentAmount: "511.32",
        }),
      }),
    ]);

    await renderPage();

    const card = screen.getByTestId("card-acc-1");
    expect(within(card).getByText("Cartao Black")).toBeInTheDocument();
    const current = within(card).getByTestId("current-bill-acc-1");
    // toHaveTextContent normaliza espacos (inclusive o NBSP que o Intl
    // pt-BR/BRL pode inserir entre "R$" e o numero) antes de comparar -
    // mesma tecnica de tests/unit/app/dashboard-page.test.tsx (TASK-012
    // Parte 2).
    expect(current).toHaveTextContent("R$ 3.408,84");
    expect(current).toHaveTextContent("R$ 511,32");
    // Prova que NAO e mais o valor cru: "3408.84"/"511.32" (com ponto) nao
    // aparecem mais no texto.
    expect(current.textContent).not.toContain("3408.84");
    expect(current.textContent).not.toContain("511.32");
    expect(current.textContent).toContain("2026-08-10");
  });

  it("minimumPaymentAmount null mostra um placeholder, NUNCA a string 'null'", async () => {
    listBillsByCardMock.mockResolvedValueOnce([
      buildCardGroup({
        current: buildBillItem({ minimumPaymentAmount: null }),
      }),
    ]);

    await renderPage();

    const current = screen.getByTestId("current-bill-acc-1");
    expect(current.textContent).not.toContain("null");
  });

  it("chama listBillsByCard exatamente uma vez", async () => {
    listBillsByCardMock.mockResolvedValueOnce([]);

    await renderPage();

    expect(listBillsByCardMock).toHaveBeenCalledTimes(1);
  });
});

describe("app/faturas/page.tsx - historico decrescente por dueDate (Criterio de aceite #7, secao 2)", () => {
  it("renderiza uma linha de historico por fatura anterior, na ordem recebida de listBillsByCard (ja decrescente)", async () => {
    listBillsByCardMock.mockResolvedValueOnce([
      buildCardGroup({
        current: buildBillItem({ id: "bill-agosto", dueDate: new Date("2026-08-10T00:00:00.000Z") }),
        history: [
          buildBillItem({ id: "bill-julho", dueDate: new Date("2026-07-10T00:00:00.000Z"), totalAmount: "2900.00" }),
          buildBillItem({ id: "bill-junho", dueDate: new Date("2026-06-10T00:00:00.000Z"), totalAmount: "3100.00" }),
        ],
      }),
    ]);

    await renderPage();

    expect(screen.getByTestId("history-bill-bill-julho")).toBeInTheDocument();
    expect(screen.getByTestId("history-bill-bill-junho")).toBeInTheDocument();
    // A fatura ATUAL nao aparece duplicada no historico.
    expect(screen.queryByTestId("history-bill-bill-agosto")).not.toBeInTheDocument();
  });

  it("cartao sem historico (so a fatura atual) nao renderiza nenhum item de historico", async () => {
    listBillsByCardMock.mockResolvedValueOnce([buildCardGroup({ history: [] })]);

    await renderPage();

    expect(screen.queryAllByTestId(/^history-bill-/)).toHaveLength(0);
  });
});

describe("app/faturas/page.tsx - estado vazio por cartao (Criterio de aceite #7, secao 2)", () => {
  it("cartao SEM nenhuma fatura (current=null) mostra uma mensagem clara, sem lancar erro", async () => {
    listBillsByCardMock.mockResolvedValueOnce([
      buildCardGroup({
        accountId: "acc-sem-fatura",
        accountName: "Cartao Recem-Conectado",
        current: null,
        history: [],
      }),
    ]);

    await expect(renderPage()).resolves.not.toThrow();

    const card = screen.getByTestId("card-acc-sem-fatura");
    expect(within(card).queryByTestId("current-bill-acc-sem-fatura")).not.toBeInTheDocument();
    expect(card.textContent?.toLowerCase()).toMatch(/nenhuma fatura/);
  });
});

describe("app/faturas/page.tsx - estado vazio geral (nenhum cartao conectado)", () => {
  it("mostra uma mensagem de estado vazio quando listBillsByCard devolve []", async () => {
    listBillsByCardMock.mockResolvedValueOnce([]);

    await renderPage();

    expect(screen.queryByTestId(/^card-/)).not.toBeInTheDocument();
    expect(screen.getByText(/nenhum cart[aã]o/i)).toBeInTheDocument();
  });
});

describe("app/faturas/page.tsx - varios cartoes (secao 2, 'histórico por cartão')", () => {
  it("renderiza uma secao por cartao, cada uma com seu proprio destaque/historico independente", async () => {
    listBillsByCardMock.mockResolvedValueOnce([
      buildCardGroup({
        accountId: "acc-1",
        accountName: "Cartao A",
        current: buildBillItem({ id: "bill-a-atual", totalAmount: "100.00" }),
      }),
      buildCardGroup({
        accountId: "acc-2",
        accountName: "Cartao B",
        current: buildBillItem({ id: "bill-b-atual", totalAmount: "200.00" }),
      }),
    ]);

    await renderPage();

    const cardA = screen.getByTestId("card-acc-1");
    const cardB = screen.getByTestId("card-acc-2");
    expect(within(cardA).getByText("Cartao A")).toBeInTheDocument();
    expect(within(cardB).getByText("Cartao B")).toBeInTheDocument();
    expect(within(cardA).getByTestId("current-bill-acc-1")).toHaveTextContent("R$ 100,00");
    expect(within(cardB).getByTestId("current-bill-acc-2")).toHaveTextContent("R$ 200,00");
    // Prova que NAO e mais o valor cru: "100.00"/"200.00" (com ponto) nao
    // aparecem mais no texto.
    expect(within(cardA).getByTestId("current-bill-acc-1").textContent).not.toContain(
      "100.00",
    );
    expect(within(cardB).getByTestId("current-bill-acc-2").textContent).not.toContain(
      "200.00",
    );
  });
});
