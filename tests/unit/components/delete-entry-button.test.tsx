/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Teste de Testing Library do botao "Excluir" de um lancamento manual
 * (TASK-009 - Criterio de aceite #7). Ambiente `jsdom` via docblock, mesmo
 * padrao de delete-category-rule-button.test.tsx (TASK-008).
 *
 * `fetch` global e mockado via `vi.stubGlobal`.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   components/entries/DeleteEntryButton.tsx
 *     "use client"
 *     export function DeleteEntryButton(props: {
 *       entryId: string;
 *       onDeleted?: () => void;
 *     }): JSX.Element
 *
 * Deve:
 *   - renderizar um botao com texto "Excluir";
 *   - ao clicar, chamar `fetch('/api/entries/' + entryId, { method:
 *     'DELETE' })` e mostrar estado de carregando ("Removendo...");
 *   - sucesso: nao deixar clicar "Excluir" de novo (some ou desabilita) e
 *     chama `onDeleted` se fornecido;
 *   - falha (HTTP nao-2xx OU `success:false` OU rejeicao de rede): mostra
 *     erro GENERICO (nunca `body.error` bruto) e mantem "Excluir" disponivel.
 */

const ENTRY_ID = "entry-cuid-123";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DeleteEntryButton - estado inicial e de carregando", () => {
  it("renderiza o botao 'Excluir'", async () => {
    const { DeleteEntryButton } = await import(
      "@/components/entries/DeleteEntryButton"
    );
    render(<DeleteEntryButton entryId={ENTRY_ID} />);

    expect(
      screen.getByRole("button", { name: /excluir/i }),
    ).toBeInTheDocument();
  });

  it("chama DELETE /api/entries/{entryId} ao clicar e mostra estado de carregando", async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);

    const { DeleteEntryButton } = await import(
      "@/components/entries/DeleteEntryButton"
    );
    render(<DeleteEntryButton entryId={ENTRY_ID} />);

    await userEvent.click(screen.getByRole("button", { name: /excluir/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/entries/${ENTRY_ID}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.getByText(/removendo/i)).toBeInTheDocument();

    resolveFetch(jsonResponse({ success: true, data: { id: ENTRY_ID } }));
    await waitFor(() =>
      expect(screen.queryByText(/removendo/i)).not.toBeInTheDocument(),
    );
  });
});

describe("DeleteEntryButton - sucesso", () => {
  it("nao permite clicar 'Excluir' de novo apos sucesso", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: ENTRY_ID } }));
    vi.stubGlobal("fetch", fetchMock);

    const { DeleteEntryButton } = await import(
      "@/components/entries/DeleteEntryButton"
    );
    render(<DeleteEntryButton entryId={ENTRY_ID} />);

    await userEvent.click(screen.getByRole("button", { name: /excluir/i }));

    await waitFor(() => {
      const button = screen.queryByRole("button", { name: /^excluir$/i });
      expect(button === null || button.hasAttribute("disabled")).toBe(true);
    });
  });

  it("chama onDeleted apos sucesso, quando fornecido", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: ENTRY_ID } }));
    vi.stubGlobal("fetch", fetchMock);
    const onDeleted = vi.fn();

    const { DeleteEntryButton } = await import(
      "@/components/entries/DeleteEntryButton"
    );
    render(<DeleteEntryButton entryId={ENTRY_ID} onDeleted={onDeleted} />);

    await userEvent.click(screen.getByRole("button", { name: /excluir/i }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });
});

describe("DeleteEntryButton - falha tratada, sem vazar detalhe do backend", () => {
  it("success:false -> mostra erro generico e mantem o botao disponivel", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: "detalhe interno que nao deveria vazar",
        },
        403,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { DeleteEntryButton } = await import(
      "@/components/entries/DeleteEntryButton"
    );
    render(<DeleteEntryButton entryId={ENTRY_ID} />);

    await userEvent.click(screen.getByRole("button", { name: /excluir/i }));

    await waitFor(() =>
      expect(screen.queryByText(/removendo/i)).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain(
      "detalhe interno que nao deveria vazar",
    );
    expect(
      screen.getByRole("button", { name: /excluir/i }),
    ).toBeInTheDocument();
  });

  it("fetch rejeita (rede fora do ar) -> mostra erro tratado e mantem o botao disponivel", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { DeleteEntryButton } = await import(
      "@/components/entries/DeleteEntryButton"
    );
    render(<DeleteEntryButton entryId={ENTRY_ID} />);

    await userEvent.click(screen.getByRole("button", { name: /excluir/i }));

    await waitFor(() =>
      expect(screen.queryByText(/removendo/i)).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain("Failed to fetch");
    expect(
      screen.getByRole("button", { name: /excluir/i }),
    ).toBeInTheDocument();
  });
});
