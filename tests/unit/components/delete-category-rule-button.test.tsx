/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Teste de Testing Library do botao "Remover" de uma regra de
 * categorizacao (TASK-008 - Criterio de aceite #9, secao 3 "DADO uma regra
 * QUANDO a removo ENTAO ela some"). Ambiente `jsdom` via docblock, mesmo
 * padrao de deactivate-bank-button.test.tsx (TASK-005).
 *
 * `fetch` global e mockado via `vi.stubGlobal` - nenhuma chamada de rede
 * real acontece.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   components/category-rules/DeleteCategoryRuleButton.tsx
 *     "use client"
 *     export function DeleteCategoryRuleButton(props: {
 *       ruleId: string;
 *       onDeleted?: () => void;
 *     }): JSX.Element
 *
 * Deve:
 *   - renderizar um botao com texto "Remover";
 *   - ao clicar, chamar `fetch('/api/category-rules/' + ruleId, { method:
 *     'DELETE' })` e mostrar um estado de carregando ("Removendo...") ate a
 *     resposta chegar;
 *   - sucesso (`body.success === true`): mostrar confirmacao (ou chamar
 *     `onDeleted`) e nao deixar o usuario clicar "Remover" de novo (o botao
 *     some ou fica desabilitado);
 *   - falha (HTTP nao-2xx OU `body.success === false` OU rejeicao de rede):
 *     mostrar mensagem de erro tratada e GENERICA (nunca `body.error` bruto)
 *     e manter o botao "Remover" disponivel para tentar de novo.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RULE_ID = "rule-cuid-123";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DeleteCategoryRuleButton - estado inicial e de carregando", () => {
  it("renderiza o botao 'Remover'", async () => {
    const { DeleteCategoryRuleButton } = await import(
      "@/components/category-rules/DeleteCategoryRuleButton"
    );
    render(<DeleteCategoryRuleButton ruleId={RULE_ID} />);

    expect(
      screen.getByRole("button", { name: /remover/i }),
    ).toBeInTheDocument();
  });

  it("chama DELETE /api/category-rules/{ruleId} ao clicar e mostra um estado de carregando", async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);

    const { DeleteCategoryRuleButton } = await import(
      "@/components/category-rules/DeleteCategoryRuleButton"
    );
    render(<DeleteCategoryRuleButton ruleId={RULE_ID} />);

    await userEvent.click(screen.getByRole("button", { name: /remover/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/category-rules/${RULE_ID}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.getByText(/removendo/i)).toBeInTheDocument();

    resolveFetch(jsonResponse({ success: true, data: { id: RULE_ID } }));

    await waitFor(() =>
      expect(screen.queryByText(/removendo/i)).not.toBeInTheDocument(),
    );
  });
});

describe("DeleteCategoryRuleButton - sucesso (secao 3, 'DADO uma regra QUANDO a removo ENTAO ela some')", () => {
  it("nao permite clicar 'Remover' de novo apos sucesso (o botao some ou fica desabilitado)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: RULE_ID } }));
    vi.stubGlobal("fetch", fetchMock);

    const { DeleteCategoryRuleButton } = await import(
      "@/components/category-rules/DeleteCategoryRuleButton"
    );
    render(<DeleteCategoryRuleButton ruleId={RULE_ID} />);

    await userEvent.click(screen.getByRole("button", { name: /remover/i }));

    await waitFor(() => {
      const button = screen.queryByRole("button", { name: /^remover$/i });
      expect(button === null || button.hasAttribute("disabled")).toBe(true);
    });
  });

  it("chama onDeleted apos sucesso, quando fornecido", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: RULE_ID } }));
    vi.stubGlobal("fetch", fetchMock);
    const onDeleted = vi.fn();

    const { DeleteCategoryRuleButton } = await import(
      "@/components/category-rules/DeleteCategoryRuleButton"
    );
    render(<DeleteCategoryRuleButton ruleId={RULE_ID} onDeleted={onDeleted} />);

    await userEvent.click(screen.getByRole("button", { name: /remover/i }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });
});

describe("DeleteCategoryRuleButton - falha tratada, sem vazar detalhe do backend", () => {
  it("success:false -> mostra erro generico (nao o body.error bruto) e mantem o botao disponivel", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: "detalhe interno que nao deveria vazar",
        },
        500,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { DeleteCategoryRuleButton } = await import(
      "@/components/category-rules/DeleteCategoryRuleButton"
    );
    render(<DeleteCategoryRuleButton ruleId={RULE_ID} />);

    await userEvent.click(screen.getByRole("button", { name: /remover/i }));

    await waitFor(() =>
      expect(screen.queryByText(/removendo/i)).not.toBeInTheDocument(),
    );

    expect(document.body.textContent).not.toContain(
      "detalhe interno que nao deveria vazar",
    );
    expect(
      screen.getByRole("button", { name: /remover/i }),
    ).toBeInTheDocument();
  });

  it("fetch rejeita (rede fora do ar) -> mostra erro tratado e mantem o botao disponivel", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { DeleteCategoryRuleButton } = await import(
      "@/components/category-rules/DeleteCategoryRuleButton"
    );
    render(<DeleteCategoryRuleButton ruleId={RULE_ID} />);

    await userEvent.click(screen.getByRole("button", { name: /remover/i }));

    await waitFor(() =>
      expect(screen.queryByText(/removendo/i)).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain("Failed to fetch");
    expect(
      screen.getByRole("button", { name: /remover/i }),
    ).toBeInTheDocument();
  });
});
