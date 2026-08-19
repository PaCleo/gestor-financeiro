/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Teste de Testing Library do formulario de cadastro de regra de
 * categorizacao por CPF/CNPJ (TASK-008 - Criterio de aceite #9, secao 3 "DADO
 * um CPF/CNPJ e uma categoria QUANDO crio uma regra"). Ambiente `jsdom` via
 * docblock, mesmo padrao de connect-bank-button.test.tsx (TASK-005).
 *
 * `fetch` global e mockado via `vi.stubGlobal` - nenhuma chamada de rede
 * real acontece. Nenhum documento real (fabricado, formato valido) e usado.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   components/category-rules/AddCategoryRuleForm.tsx
 *     "use client"
 *     export function AddCategoryRuleForm(props?: {
 *       onCreated?: () => void;
 *     }): JSX.Element
 *
 * Deve:
 *   - renderizar 3 campos: "Documento (CPF/CNPJ)", "Categoria", "Rótulo
 *     (opcional)" e um botao "Adicionar regra";
 *   - ao submeter, chamar `POST /api/category-rules` com `{ document,
 *     category, label }` (JSON) - `label` pode ser omitido/vazio quando o
 *     campo nao foi preenchido - e mostrar um estado de carregando
 *     ("Salvando..." ou equivalente) ate a resposta chegar;
 *   - sucesso (`body.success === true`): mostra confirmacao, LIMPA os
 *     campos do formulario (o documento nao pode continuar visivel na tela
 *     depois de enviado - higiene de privacidade) e chama `onCreated` se
 *     fornecido;
 *   - falha (HTTP nao-2xx OU `body.success === false` OU rejeicao de rede):
 *     mostra mensagem de erro tratada e GENERICA (nunca `body.error` bruto)
 *     e MANTEM os valores digitados para o usuario tentar de novo;
 *   - NUNCA chama console.log/warn/error com o documento digitado, em
 *     nenhum momento do fluxo (privacidade - a regra de ouro da task).
 */

// CPF/CNPJ fabricados para teste - formato valido, NUNCA um documento real.
const FAKE_CNPJ = "12.345.678/0001-95";

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

describe("AddCategoryRuleForm - estado inicial (Criterio de aceite #9)", () => {
  it("renderiza os campos document/category/label e o botao de submeter", async () => {
    const { AddCategoryRuleForm } = await import(
      "@/components/category-rules/AddCategoryRuleForm"
    );
    render(<AddCategoryRuleForm />);

    expect(screen.getByLabelText(/documento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/categoria/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/r[oó]tulo/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /adicionar regra/i }),
    ).toBeInTheDocument();
  });
});

describe("AddCategoryRuleForm - submissao e estado de carregando", () => {
  it("preenche e submete -> chama POST /api/category-rules com document/category/label e mostra estado de carregando", async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);

    const { AddCategoryRuleForm } = await import(
      "@/components/category-rules/AddCategoryRuleForm"
    );
    render(<AddCategoryRuleForm />);

    await userEvent.type(screen.getByLabelText(/documento/i), FAKE_CNPJ);
    await userEvent.type(screen.getByLabelText(/categoria/i), "Mercado");
    await userEvent.type(
      screen.getByLabelText(/r[oó]tulo/i),
      "Mercado do bairro",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar regra/i }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/category-rules",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          document: FAKE_CNPJ,
          category: "Mercado",
          label: "Mercado do bairro",
        }),
      }),
    );
    expect(screen.getByText(/salvando/i)).toBeInTheDocument();

    resolveFetch(
      jsonResponse({
        success: true,
        data: { id: "rule-1", label: "Mercado do bairro", category: "Mercado" },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/salvando/i)).not.toBeInTheDocument(),
    );
  });
});

describe("AddCategoryRuleForm - sucesso (secao 3, 'DADO um CPF/CNPJ e uma categoria QUANDO crio uma regra')", () => {
  it("mostra confirmacao e LIMPA o campo de documento apos sucesso (higiene de privacidade)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { id: "rule-1", label: null, category: "Mercado" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { AddCategoryRuleForm } = await import(
      "@/components/category-rules/AddCategoryRuleForm"
    );
    render(<AddCategoryRuleForm />);

    const documentInput = screen.getByLabelText(
      /documento/i,
    ) as HTMLInputElement;
    await userEvent.type(documentInput, FAKE_CNPJ);
    await userEvent.type(screen.getByLabelText(/categoria/i), "Mercado");
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar regra/i }),
    );

    await waitFor(() =>
      expect(document.body.textContent).toMatch(
        /regra (adicionada|salva|cadastrada|criada)/i,
      ),
    );
    expect(
      (screen.getByLabelText(/documento/i) as HTMLInputElement).value,
    ).toBe("");
  });

  it("chama onCreated apos sucesso, quando fornecido", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { id: "rule-1", label: null, category: "Mercado" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();

    const { AddCategoryRuleForm } = await import(
      "@/components/category-rules/AddCategoryRuleForm"
    );
    render(<AddCategoryRuleForm onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText(/documento/i), FAKE_CNPJ);
    await userEvent.type(screen.getByLabelText(/categoria/i), "Mercado");
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar regra/i }),
    );

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });
});

describe("AddCategoryRuleForm - falha tratada, sem vazar detalhe do backend (secao 3)", () => {
  it("success:false -> mostra erro generico (nao o body.error bruto) e MANTEM os valores digitados", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: "detalhe interno que nao deveria vazar para o usuario",
        },
        500,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { AddCategoryRuleForm } = await import(
      "@/components/category-rules/AddCategoryRuleForm"
    );
    render(<AddCategoryRuleForm />);

    await userEvent.type(screen.getByLabelText(/documento/i), FAKE_CNPJ);
    await userEvent.type(screen.getByLabelText(/categoria/i), "Mercado");
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar regra/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/salvando/i)).not.toBeInTheDocument(),
    );

    expect(document.body.textContent).not.toContain(
      "detalhe interno que nao deveria vazar para o usuario",
    );
    expect(
      (screen.getByLabelText(/documento/i) as HTMLInputElement).value,
    ).toBe(FAKE_CNPJ);
  });

  it("fetch rejeita (rede fora do ar) -> mostra erro tratado, mantem o formulario disponivel", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { AddCategoryRuleForm } = await import(
      "@/components/category-rules/AddCategoryRuleForm"
    );
    render(<AddCategoryRuleForm />);

    await userEvent.type(screen.getByLabelText(/documento/i), FAKE_CNPJ);
    await userEvent.type(screen.getByLabelText(/categoria/i), "Mercado");
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar regra/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/salvando/i)).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain("Failed to fetch");
    expect(
      screen.getByRole("button", { name: /adicionar regra/i }),
    ).toBeInTheDocument();
  });
});

describe("AddCategoryRuleForm - o documento NUNCA e logado (regra de ouro da privacidade da task)", () => {
  it("nao chama console.log/warn/error em nenhum momento do fluxo, mesmo com um CPF/CNPJ real digitado", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { id: "rule-1", label: null, category: "Mercado" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { AddCategoryRuleForm } = await import(
      "@/components/category-rules/AddCategoryRuleForm"
    );
    render(<AddCategoryRuleForm />);

    await userEvent.type(screen.getByLabelText(/documento/i), FAKE_CNPJ);
    await userEvent.type(screen.getByLabelText(/categoria/i), "Mercado");
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar regra/i }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
