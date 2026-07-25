/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Teste de Testing Library do botao "Desativar" (TASK-005 - suporta o
 * Criterio de aceite #8: a pagina de bancos "permite... desativar").
 * Ambiente `jsdom` via docblock no topo do arquivo.
 *
 * `fetch` global e mockado via `vi.stubGlobal` - nenhuma chamada de rede
 * real acontece.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   components/bank-items/DeactivateBankButton.tsx
 *     "use client"
 *     export function DeactivateBankButton(props: {
 *       bankItemId: string;
 *     }): JSX.Element
 *
 * Deve:
 *   - renderizar um botao com texto "Desativar";
 *   - ao clicar, chamar `fetch('/api/items/' + bankItemId, { method:
 *     'DELETE' })` e mostrar um estado de carregando ("Desativando...")
 *     ate a resposta chegar;
 *   - sucesso (`body.success === true`): mostrar confirmacao (texto
 *     contendo "desativado") e nao deixar o usuario clicar "Desativar" de
 *     novo (o botao "Desativar" some ou fica desabilitado);
 *   - falha (HTTP nao-2xx OU `body.success === false` OU rejeicao de
 *     rede): mostrar mensagem de erro tratada e GENERICA (nunca
 *     `body.error` bruto do backend) e manter o botao "Desativar"
 *     disponivel para tentar de novo.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BANK_ITEM_ID = "bankitem-cuid-123";

afterEach(() => {
  // `globals: false` no vitest.config.ts desativa o cleanup automatico do
  // Testing Library entre testes - ver o mesmo comentario em
  // connect-bank-button.test.tsx.
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DeactivateBankButton - estado inicial e de carregando", () => {
  it("renderiza o botao 'Desativar'", async () => {
    const { DeactivateBankButton } = await import(
      "@/components/bank-items/DeactivateBankButton"
    );
    render(<DeactivateBankButton bankItemId={BANK_ITEM_ID} />);

    expect(
      screen.getByRole("button", { name: /desativar/i }),
    ).toBeInTheDocument();
  });

  it("chama DELETE /api/items/{bankItemId} ao clicar e mostra um estado de carregando", async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);

    const { DeactivateBankButton } = await import(
      "@/components/bank-items/DeactivateBankButton"
    );
    render(<DeactivateBankButton bankItemId={BANK_ITEM_ID} />);

    await userEvent.click(
      screen.getByRole("button", { name: /desativar/i }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/items/${BANK_ITEM_ID}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.getByText(/desativando/i)).toBeInTheDocument();

    resolveFetch(
      jsonResponse({
        success: true,
        data: {
          id: BANK_ITEM_ID,
          pluggyItemId: "item-1",
          archivedAt: new Date().toISOString(),
        },
      }),
    );

    await waitFor(() =>
      expect(screen.getByText(/desativado/i)).toBeInTheDocument(),
    );
  });
});

describe("DeactivateBankButton - sucesso", () => {
  it("mostra confirmacao e nao permite clicar 'Desativar' de novo", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          id: BANK_ITEM_ID,
          pluggyItemId: "item-1",
          archivedAt: new Date().toISOString(),
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { DeactivateBankButton } = await import(
      "@/components/bank-items/DeactivateBankButton"
    );
    render(<DeactivateBankButton bankItemId={BANK_ITEM_ID} />);

    await userEvent.click(
      screen.getByRole("button", { name: /desativar/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/desativado/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /^desativar$/i }),
    ).not.toBeInTheDocument();
  });
});

describe("DeactivateBankButton - falha tratada, sem vazar detalhe do backend", () => {
  it("quando a rota responde success:false, mostra erro generico (nao o body.error bruto) e mantem o botao disponivel", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error:
            "Nao foi possivel desativar este banco (detalhe interno do Pluggy que nao deveria vazar)",
        },
        500,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { DeactivateBankButton } = await import(
      "@/components/bank-items/DeactivateBankButton"
    );
    render(<DeactivateBankButton bankItemId={BANK_ITEM_ID} />);

    await userEvent.click(
      screen.getByRole("button", { name: /desativar/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/desativando/i)).not.toBeInTheDocument(),
    );

    expect(document.body.textContent).not.toContain(
      "detalhe interno do Pluggy que nao deveria vazar",
    );
    expect(
      screen.getByRole("button", { name: /desativar/i }),
    ).toBeInTheDocument();
  });

  it("quando fetch rejeita (rede fora do ar), mostra erro tratado e mantem o botao disponivel", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { DeactivateBankButton } = await import(
      "@/components/bank-items/DeactivateBankButton"
    );
    render(<DeactivateBankButton bankItemId={BANK_ITEM_ID} />);

    await userEvent.click(
      screen.getByRole("button", { name: /desativar/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/desativando/i)).not.toBeInTheDocument(),
    );

    expect(document.body.textContent).not.toContain("Failed to fetch");
    expect(
      screen.getByRole("button", { name: /desativar/i }),
    ).toBeInTheDocument();
  });
});
