/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Teste de Testing Library do formulario de novo lancamento manual (TASK-009
 * - Criterio de aceite #7, secao 3 "DADO valor, data, descricao, metodo,
 * categoria e uma conta manual QUANDO crio"). Ambiente `jsdom` via docblock,
 * mesmo padrao de add-category-rule-form.test.tsx (TASK-008).
 *
 * `fetch` global e mockado via `vi.stubGlobal` - nenhuma chamada de rede
 * real acontece.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   components/entries/AddEntryForm.tsx
 *     "use client"
 *     export function AddEntryForm(props: {
 *       accounts: Array<{ id: string; name: string }>;
 *       onCreated?: () => void;
 *     }): JSX.Element
 *
 * Deve:
 *   - renderizar campos rotulados "Valor", "Direção" (select entrada/saida),
 *     "Data", "Descrição", "Método" (select PIX/TED/DEBIT/CREDIT/CASH),
 *     "Categoria" (opcional) e "Conta" (select com uma <option> por item de
 *     `accounts`), e um botao "Adicionar lançamento";
 *   - ao submeter, chamar `POST /api/entries` com JSON `{ amount, direction,
 *     date, description, method, category, accountId }` (category omitido
 *     quando vazio) e mostrar estado de carregando ("Salvando...") ate a
 *     resposta chegar;
 *   - sucesso (`body.success === true`): mostra confirmacao, LIMPA os
 *     campos de texto (valor/data/descricao/categoria voltam ao estado
 *     inicial) e chama `onCreated` se fornecido;
 *   - falha (HTTP nao-2xx OU `body.success === false` OU rejeicao de rede):
 *     mostra mensagem de erro GENERICA (nunca `body.error` bruto) e MANTEM
 *     os valores digitados;
 *   - nunca chama console.log/warn/error em nenhum caminho.
 */

const ACCOUNTS = [{ id: "acc-dinheiro", name: "Dinheiro" }];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText(/valor/i), "50");
  await userEvent.selectOptions(screen.getByLabelText(/direção|direcao/i), "saida");
  const dateInput = screen.getByLabelText(/^data$/i) as HTMLInputElement;
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, "2026-08-10");
  await userEvent.type(screen.getByLabelText(/descrição|descricao/i), "Pix para o mercado");
  await userEvent.selectOptions(screen.getByLabelText(/método|metodo/i), "PIX");
  await userEvent.selectOptions(screen.getByLabelText(/^conta$/i), "acc-dinheiro");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AddEntryForm - estado inicial (Criterio de aceite #7)", () => {
  it("renderiza todos os campos e o botao de submeter", async () => {
    const { AddEntryForm } = await import("@/components/entries/AddEntryForm");
    render(<AddEntryForm accounts={ACCOUNTS} />);

    expect(screen.getByLabelText(/valor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/direção|direcao/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^data$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/descrição|descricao/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/método|metodo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/categoria/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^conta$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /adicionar lan[cç]amento/i }),
    ).toBeInTheDocument();
  });

  it("o select de conta lista uma option para cada conta recebida via props", async () => {
    const { AddEntryForm } = await import("@/components/entries/AddEntryForm");
    render(
      <AddEntryForm
        accounts={[
          { id: "acc-1", name: "Dinheiro" },
          { id: "acc-2", name: "Conta manual extra" },
        ]}
      />,
    );

    const select = screen.getByLabelText(/^conta$/i);
    expect(within(select).getByText("Dinheiro")).toBeInTheDocument();
    expect(within(select).getByText("Conta manual extra")).toBeInTheDocument();
  });
});

describe("AddEntryForm - submissao (secao 3, 'DADO valor, data, descricao, metodo, categoria e uma conta manual QUANDO crio')", () => {
  it("preenche e submete -> chama POST /api/entries com o JSON esperado e mostra estado de carregando", async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);

    const { AddEntryForm } = await import("@/components/entries/AddEntryForm");
    render(<AddEntryForm accounts={ACCOUNTS} />);

    await fillValidForm();
    await userEvent.type(screen.getByLabelText(/categoria/i), "Alimentação");
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar lan[cç]amento/i }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/entries");
    expect(init.method).toBe("POST");
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toMatchObject({
      amount: 50,
      direction: "saida",
      date: "2026-08-10",
      description: "Pix para o mercado",
      method: "PIX",
      category: "Alimentação",
      accountId: "acc-dinheiro",
    });
    expect(screen.getByText(/salvando/i)).toBeInTheDocument();

    resolveFetch(
      jsonResponse({
        success: true,
        data: {
          id: "entry-1",
          date: "2026-08-10T00:00:00.000Z",
          description: "Pix para o mercado",
          amount: "-50.00",
          direction: "saida",
          accountId: "acc-dinheiro",
          accountName: "Dinheiro",
          method: "PIX",
          category: "Alimentação",
        },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/salvando/i)).not.toBeInTheDocument(),
    );
  });

  it("sem categoria preenchida, o corpo enviado nao trava a submissao (category e opcional)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          id: "entry-2",
          date: "2026-08-10T00:00:00.000Z",
          description: "Pix para o mercado",
          amount: "-50.00",
          direction: "saida",
          accountId: "acc-dinheiro",
          accountName: "Dinheiro",
          method: "PIX",
          category: null,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { AddEntryForm } = await import("@/components/entries/AddEntryForm");
    render(<AddEntryForm accounts={ACCOUNTS} />);

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar lan[cç]amento/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe("AddEntryForm - sucesso", () => {
  it("mostra confirmacao, limpa o campo de descricao e chama onCreated", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          id: "entry-1",
          date: "2026-08-10T00:00:00.000Z",
          description: "Pix para o mercado",
          amount: "-50.00",
          direction: "saida",
          accountId: "acc-dinheiro",
          accountName: "Dinheiro",
          method: "PIX",
          category: "Alimentação",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();

    const { AddEntryForm } = await import("@/components/entries/AddEntryForm");
    render(<AddEntryForm accounts={ACCOUNTS} onCreated={onCreated} />);

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar lan[cç]amento/i }),
    );

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(document.body.textContent).toMatch(
      /lan[cç]amento (adicionado|salvo|criado)/i,
    );
    expect(
      (screen.getByLabelText(/descrição|descricao/i) as HTMLInputElement)
        .value,
    ).toBe("");
  });
});

describe("AddEntryForm - falha tratada, sem vazar detalhe do backend", () => {
  it("success:false -> mostra erro generico (nao body.error bruto) e MANTEM os valores digitados", async () => {
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

    const { AddEntryForm } = await import("@/components/entries/AddEntryForm");
    render(<AddEntryForm accounts={ACCOUNTS} />);

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar lan[cç]amento/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/salvando/i)).not.toBeInTheDocument(),
    );

    expect(document.body.textContent).not.toContain(
      "detalhe interno que nao deveria vazar para o usuario",
    );
    expect(
      (screen.getByLabelText(/descrição|descricao/i) as HTMLInputElement)
        .value,
    ).toBe("Pix para o mercado");
  });

  it("fetch rejeita (rede fora do ar) -> mostra erro tratado, mantem o formulario disponivel", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { AddEntryForm } = await import("@/components/entries/AddEntryForm");
    render(<AddEntryForm accounts={ACCOUNTS} />);

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar lan[cç]amento/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/salvando/i)).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain("Failed to fetch");
    expect(
      screen.getByRole("button", { name: /adicionar lan[cç]amento/i }),
    ).toBeInTheDocument();
  });
});

describe("AddEntryForm - nunca loga no console", () => {
  it("nao chama console.log/warn/error em nenhum momento do fluxo de sucesso", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          id: "entry-1",
          date: "2026-08-10T00:00:00.000Z",
          description: "Pix para o mercado",
          amount: "-50.00",
          direction: "saida",
          accountId: "acc-dinheiro",
          accountName: "Dinheiro",
          method: "PIX",
          category: "Alimentação",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { AddEntryForm } = await import("@/components/entries/AddEntryForm");
    render(<AddEntryForm accounts={ACCOUNTS} />);

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: /adicionar lan[cç]amento/i }),
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
