/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Teste de Testing Library do formulario de edicao de um lancamento manual
 * (TASK-009 - Criterio de aceite #7, secao 3 "DADO um lancamento MANUAL
 * QUANDO edito ENTAO funciona"). Ambiente `jsdom` via docblock.
 *
 * `fetch` global e mockado via `vi.stubGlobal`. Diferente de
 * `AddEntryForm`, este componente recebe um lancamento JA EXISTENTE e
 * mostra os campos PRE-PREENCHIDOS (o formulario e sempre visivel por
 * lancamento na lista - sem toggle "mostrar/esconder", mesmo espirito
 * minimalista dos demais componentes do projeto).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   components/entries/EditEntryForm.tsx
 *     "use client"
 *     export function EditEntryForm(props: {
 *       entry: {
 *         id: string;
 *         amount: string;      // valor absoluto, ex. "45.90"
 *         direction: "entrada" | "saida";
 *         date: string;        // "YYYY-MM-DD"
 *         description: string;
 *         method: string;      // um de PIX/TED/DEBIT/CREDIT/CASH
 *         category: string | null;
 *         accountId: string;
 *       };
 *       accounts: Array<{ id: string; name: string }>;
 *       onSaved?: () => void;
 *     }): JSX.Element
 *
 * Deve:
 *   - renderizar os MESMOS campos rotulados de `AddEntryForm`
 *     (Valor/Direção/Data/Descrição/Método/Categoria/Conta), todos
 *     PRE-PREENCHIDOS com os valores de `entry`;
 *   - um botao "Salvar alterações";
 *   - ao submeter, chamar `PATCH /api/entries/{entry.id}` com o JSON `{
 *     amount, direction, date, description, method, category, accountId }`
 *     atualizado, mostrando estado de carregando ("Salvando...");
 *   - sucesso: mostra confirmacao e chama `onSaved` se fornecido;
 *   - falha (HTTP nao-2xx OU `success:false` OU rejeicao de rede): mostra
 *     erro GENERICO (nunca `body.error` bruto) e mantem os valores editados
 *     no formulario;
 *   - nunca chama console.log/warn/error.
 */

const ENTRY_ID = "entry-cuid-1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    amount: "45.90",
    direction: "saida" as const,
    date: "2026-08-10",
    description: "Pix para o mercado",
    method: "PIX",
    category: "Alimentação",
    accountId: "acc-dinheiro",
    ...overrides,
  };
}

const ACCOUNTS = [{ id: "acc-dinheiro", name: "Dinheiro" }];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("EditEntryForm - estado inicial pre-preenchido (Criterio de aceite #7)", () => {
  it("renderiza os campos com os valores de entry ja preenchidos", async () => {
    const { EditEntryForm } = await import(
      "@/components/entries/EditEntryForm"
    );
    render(<EditEntryForm entry={buildEntry()} accounts={ACCOUNTS} />);

    expect(screen.getByLabelText(/valor/i)).toHaveValue(45.9);
    expect(screen.getByLabelText(/direção|direcao/i)).toHaveValue("saida");
    expect(screen.getByLabelText(/^data$/i)).toHaveValue("2026-08-10");
    expect(screen.getByLabelText(/descrição|descricao/i)).toHaveValue(
      "Pix para o mercado",
    );
    expect(screen.getByLabelText(/método|metodo/i)).toHaveValue("PIX");
    expect(screen.getByLabelText(/categoria/i)).toHaveValue("Alimentação");
    expect(screen.getByLabelText(/^conta$/i)).toHaveValue("acc-dinheiro");
    expect(
      screen.getByRole("button", { name: /salvar altera[cç][oõ]es/i }),
    ).toBeInTheDocument();
  });
});

describe("EditEntryForm - submissao (secao 3, 'DADO um lancamento MANUAL QUANDO edito ENTAO funciona')", () => {
  it("altera a descricao e submete -> chama PATCH /api/entries/{id} com o corpo atualizado", async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);

    const { EditEntryForm } = await import(
      "@/components/entries/EditEntryForm"
    );
    render(<EditEntryForm entry={buildEntry()} accounts={ACCOUNTS} />);

    const descriptionInput = screen.getByLabelText(/descrição|descricao/i);
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Pix editado");
    await userEvent.click(
      screen.getByRole("button", { name: /salvar altera[cç][oõ]es/i }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/entries/${ENTRY_ID}`);
    expect(init.method).toBe("PATCH");
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toMatchObject({
      description: "Pix editado",
      direction: "saida",
      accountId: "acc-dinheiro",
      method: "PIX",
    });
    expect(screen.getByText(/salvando/i)).toBeInTheDocument();

    resolveFetch(jsonResponse({ success: true, data: buildEntry({ description: "Pix editado" }) }));
    await waitFor(() =>
      expect(screen.queryByText(/salvando/i)).not.toBeInTheDocument(),
    );
  });

  it("sucesso chama onSaved", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ success: true, data: buildEntry() }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();

    const { EditEntryForm } = await import(
      "@/components/entries/EditEntryForm"
    );
    render(
      <EditEntryForm entry={buildEntry()} accounts={ACCOUNTS} onSaved={onSaved} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /salvar altera[cç][oõ]es/i }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});

describe("EditEntryForm - falha tratada, sem vazar detalhe do backend", () => {
  it("success:false -> mostra erro generico e mantem os valores editados", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: "esta conta esta conectada a um banco (detalhe interno)",
        },
        400,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { EditEntryForm } = await import(
      "@/components/entries/EditEntryForm"
    );
    render(<EditEntryForm entry={buildEntry()} accounts={ACCOUNTS} />);

    const descriptionInput = screen.getByLabelText(/descrição|descricao/i);
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Tentativa editada");
    await userEvent.click(
      screen.getByRole("button", { name: /salvar altera[cç][oõ]es/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/salvando/i)).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain(
      "esta conta esta conectada a um banco (detalhe interno)",
    );
    expect(
      (screen.getByLabelText(/descrição|descricao/i) as HTMLInputElement)
        .value,
    ).toBe("Tentativa editada");
  });

  it("fetch rejeita (rede fora do ar) -> mostra erro tratado, mantem o formulario disponivel", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { EditEntryForm } = await import(
      "@/components/entries/EditEntryForm"
    );
    render(<EditEntryForm entry={buildEntry()} accounts={ACCOUNTS} />);

    await userEvent.click(
      screen.getByRole("button", { name: /salvar altera[cç][oõ]es/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/salvando/i)).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain("Failed to fetch");
    expect(
      screen.getByRole("button", { name: /salvar altera[cç][oõ]es/i }),
    ).toBeInTheDocument();
  });
});

describe("EditEntryForm - nunca loga no console", () => {
  it("nao chama console.log/warn/error em nenhum momento do fluxo", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ success: true, data: buildEntry() }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { EditEntryForm } = await import(
      "@/components/entries/EditEntryForm"
    );
    render(<EditEntryForm entry={buildEntry()} accounts={ACCOUNTS} />);

    await userEvent.click(
      screen.getByRole("button", { name: /salvar altera[cç][oõ]es/i }),
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
