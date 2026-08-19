/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Teste de Testing Library da pagina de lancamentos manuais (TASK-009 -
 * Criterio de aceite #7). Ambiente `jsdom` via docblock. Mesmo padrao de
 * app/bancos/page.tsx (TASK-005) / app/categorias/page.tsx (TASK-008):
 * `@/lib/entries` e os componentes filhos (`AddEntryForm`, `EditEntryForm`,
 * `DeleteEntryButton` - ja cobertos em detalhe pelos proprios arquivos de
 * teste) sao mockados inteiramente - este arquivo isola a responsabilidade
 * PROPRIA da pagina: garantir a conta Dinheiro, buscar a lista e passar os
 * props certos para cada filho.
 *
 * `app/lancamentos/page.tsx` e um Server Component (funcao async, SEM "use
 * client").
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/lancamentos/page.tsx
 *     export default async function LancamentosPage(): Promise<JSX.Element>
 *
 * Deve:
 *   - chamar `ensureCashAccount()` (Criterio de aceite #1 - garante a conta
 *     Dinheiro antes de listar, para o formulario sempre ter pelo menos uma
 *     conta disponivel);
 *   - chamar `listManualEntries()` e `listManualAccounts()`;
 *   - renderizar `<AddEntryForm accounts={...} />`;
 *   - para cada lancamento manual, um `<EditEntryForm entry={...}
 *     accounts={...} />` e um `<DeleteEntryButton entryId={item.id} />`;
 *   - estado vazio quando `listManualEntries()` devolve `[]`.
 */

const { ensureCashAccountMock, listManualEntriesMock, listManualAccountsMock } =
  vi.hoisted(() => ({
    ensureCashAccountMock: vi.fn(),
    listManualEntriesMock: vi.fn(),
    listManualAccountsMock: vi.fn(),
  }));

vi.mock("@/lib/entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/entries")>();
  return {
    ...actual,
    ensureCashAccount: ensureCashAccountMock,
    listManualEntries: listManualEntriesMock,
    listManualAccounts: listManualAccountsMock,
  };
});

vi.mock("@/components/entries/AddEntryForm", () => ({
  AddEntryForm: ({ accounts }: { accounts: Array<{ id: string; name: string }> }) => (
    <div data-testid="add-entry-form-mock">
      {accounts.map((a) => (
        <span key={a.id}>{a.name}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/components/entries/EditEntryForm", () => ({
  EditEntryForm: ({ entry }: { entry: { id: string; description: string } }) => (
    <div data-testid={`edit-entry-form-mock-${entry.id}`}>{entry.description}</div>
  ),
}));

vi.mock("@/components/entries/DeleteEntryButton", () => ({
  DeleteEntryButton: ({ entryId }: { entryId: string }) => (
    <button type="button" data-testid={`delete-entry-mock-${entryId}`}>
      Excluir (mock)
    </button>
  ),
}));

function buildEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    date: new Date("2026-08-10T00:00:00.000Z"),
    description: "Pix para o mercado",
    amount: "-50.00",
    direction: "saida",
    accountId: "acc-dinheiro",
    accountName: "Dinheiro",
    method: "PIX",
    category: "Alimentação",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("app/lancamentos/page.tsx - garante a conta Dinheiro e lista os lancamentos manuais (Criterio de aceite #1 e #7)", () => {
  it("chama ensureCashAccount, listManualEntries e listManualAccounts exatamente uma vez", async () => {
    ensureCashAccountMock.mockResolvedValueOnce({
      id: "acc-dinheiro",
      name: "Dinheiro",
      type: "CASH",
    });
    listManualEntriesMock.mockResolvedValueOnce([]);
    listManualAccountsMock.mockResolvedValueOnce([
      { id: "acc-dinheiro", name: "Dinheiro" },
    ]);

    const { default: LancamentosPage } = await import("@/app/lancamentos/page");
    render(await LancamentosPage());

    expect(ensureCashAccountMock).toHaveBeenCalledTimes(1);
    expect(listManualEntriesMock).toHaveBeenCalledTimes(1);
    expect(listManualAccountsMock).toHaveBeenCalledTimes(1);
  });

  it("renderiza o formulario de novo lancamento com as contas de listManualAccounts", async () => {
    ensureCashAccountMock.mockResolvedValueOnce({
      id: "acc-dinheiro",
      name: "Dinheiro",
      type: "CASH",
    });
    listManualEntriesMock.mockResolvedValueOnce([]);
    listManualAccountsMock.mockResolvedValueOnce([
      { id: "acc-dinheiro", name: "Dinheiro" },
    ]);

    const { default: LancamentosPage } = await import("@/app/lancamentos/page");
    render(await LancamentosPage());

    const form = screen.getByTestId("add-entry-form-mock");
    expect(form.textContent).toContain("Dinheiro");
  });

  it("para cada lancamento manual, renderiza EditEntryForm e DeleteEntryButton", async () => {
    ensureCashAccountMock.mockResolvedValueOnce({
      id: "acc-dinheiro",
      name: "Dinheiro",
      type: "CASH",
    });
    listManualEntriesMock.mockResolvedValueOnce([
      buildEntry({ id: "entry-1", description: "Pix manual" }),
      buildEntry({ id: "entry-2", description: "Dinheiro recebido" }),
    ]);
    listManualAccountsMock.mockResolvedValueOnce([
      { id: "acc-dinheiro", name: "Dinheiro" },
    ]);

    const { default: LancamentosPage } = await import("@/app/lancamentos/page");
    render(await LancamentosPage());

    expect(screen.getByTestId("edit-entry-form-mock-entry-1").textContent).toBe(
      "Pix manual",
    );
    expect(screen.getByTestId("edit-entry-form-mock-entry-2").textContent).toBe(
      "Dinheiro recebido",
    );
    expect(screen.getByTestId("delete-entry-mock-entry-1")).toBeInTheDocument();
    expect(screen.getByTestId("delete-entry-mock-entry-2")).toBeInTheDocument();
  });

  it("mostra uma mensagem de estado vazio quando nao ha lancamentos manuais", async () => {
    ensureCashAccountMock.mockResolvedValueOnce({
      id: "acc-dinheiro",
      name: "Dinheiro",
      type: "CASH",
    });
    listManualEntriesMock.mockResolvedValueOnce([]);
    listManualAccountsMock.mockResolvedValueOnce([
      { id: "acc-dinheiro", name: "Dinheiro" },
    ]);

    const { default: LancamentosPage } = await import("@/app/lancamentos/page");
    render(await LancamentosPage());

    expect(
      screen.getByText(/nenhum lan[cç]amento manual/i),
    ).toBeInTheDocument();
  });
});
