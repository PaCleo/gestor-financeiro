/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Teste de Testing Library do widget de conexao (TASK-005 - Criterio de
 * aceite #7, ambiente `jsdom` via docblock `@vitest-environment jsdom` no
 * topo deste arquivo - ver vitest.config.ts).
 *
 * `react-pluggy-connect` e mockado INTEIRAMENTE - o widget real abre um
 * iframe da Pluggy, o que nao faz sentido simular em teste. O mock abaixo
 * substitui `PluggyConnect` por um componente de teste que renderiza os
 * props recebidos (`connectToken`) e dois botoes que, ao serem clicados,
 * invocam `onSuccess`/`onError` com payloads controlados - a tecnica padrao
 * para testar callbacks de um widget de terceiro opaco.
 *
 * `fetch` global e mockado via `vi.stubGlobal` - nenhuma chamada de rede
 * real acontece.
 *
 * Contrato assumido (definido pelo qa nesta task - ver secao 5 do
 * TASK-005.md - o coder implementa exatamente assim):
 *
 *   components/bank-items/ConnectBankButton.tsx
 *     "use client"
 *     export function ConnectBankButton(): JSX.Element
 *
 * Deve, nesta ordem de estados:
 *   1. Renderizar um botao com o texto "Conectar banco".
 *   2. Ao clicar, chamar `POST /api/connect-token` e mostrar um estado de
 *      carregando (texto "Conectando..." em algum lugar da arvore) ate a
 *      resposta chegar.
 *   3. Se `POST /api/connect-token` falhar (HTTP nao-2xx OU
 *      `body.success === false`), mostrar uma mensagem de erro tratada e
 *      NAO renderizar o widget (`PluggyConnect`) - Cenario "conecta-token
 *      falhando".
 *   4. Se `POST /api/connect-token` tiver sucesso, renderizar
 *      `<PluggyConnect connectToken={accessToken} onSuccess={...}
 *      onError={...} />` com o `accessToken` retornado - **sem**
 *      `includeSandbox` (ADR 6, Criterio de aceite #10).
 *   5. `onSuccess(itemData)`: chamar `POST /api/items` com `{ pluggyItemId:
 *      itemData.item.id }`.
 *   6. `onError(error)`: mostrar uma mensagem de erro tratada e GENERICA -
 *      NUNCA `error.message` bruto do widget (que pode conter detalhe
 *      tecnico do banco/instituicao) - e uma forma de tentar de novo.
 */

vi.mock("react-pluggy-connect", () => ({
  PluggyConnect: (props: {
    connectToken: string;
    includeSandbox?: boolean;
    onSuccess: (data: { item: { id: string } }) => void;
    onError: (error: { message: string }) => void;
  }) => (
    <div data-testid="pluggy-connect-widget-mock">
      <span data-testid="connect-token-recebido">{props.connectToken}</span>
      <span data-testid="include-sandbox-recebido">
        {String(props.includeSandbox)}
      </span>
      <button
        type="button"
        onClick={() =>
          props.onSuccess({ item: { id: "item-uuid-vindo-do-widget" } })
        }
      >
        simular sucesso do widget
      </button>
      <button
        type="button"
        onClick={() =>
          props.onError({
            message:
              "INVALID_CREDENTIALS: detalhe tecnico interno que nao deveria vazar",
          })
        }
      >
        simular erro do widget
      </button>
    </div>
  ),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  // `@testing-library/react` faz cleanup automatico via `afterEach` GLOBAL,
  // mas `vitest.config.ts` usa `globals: false` (padrao do projeto desde a
  // TASK-001) - sem isso, componentes de testes anteriores continuam
  // montados no jsdom e quebram `getByRole`/`getByText` com "multiplos
  // elementos encontrados" no teste seguinte. Chamada explicita necessaria.
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ConnectBankButton - estado inicial e de carregando (Criterio de aceite #7)", () => {
  it("renderiza o botao 'Conectar banco' e nenhum widget antes do clique", async () => {
    const { ConnectBankButton } = await import(
      "@/components/bank-items/ConnectBankButton"
    );
    render(<ConnectBankButton />);

    expect(
      screen.getByRole("button", { name: /conectar banco/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("pluggy-connect-widget-mock"),
    ).not.toBeInTheDocument();
  });

  it("mostra um estado de carregando enquanto POST /api/connect-token esta em voo", async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);

    const { ConnectBankButton } = await import(
      "@/components/bank-items/ConnectBankButton"
    );
    render(<ConnectBankButton />);

    await userEvent.click(
      screen.getByRole("button", { name: /conectar banco/i }),
    );

    expect(screen.getByText(/conectando/i)).toBeInTheDocument();

    resolveFetch(
      jsonResponse({ success: true, data: { accessToken: "token-abc" } }),
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("pluggy-connect-widget-mock"),
      ).toBeInTheDocument(),
    );
  });
});

describe("ConnectBankButton - widget abre com o Connect Token de POST /api/connect-token (Criterio de aceite #7)", () => {
  it("chama POST /api/connect-token e abre o widget com o accessToken retornado, sem includeSandbox (ADR 6, Criterio 10)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { accessToken: "token-xyz-789" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { ConnectBankButton } = await import(
      "@/components/bank-items/ConnectBankButton"
    );
    render(<ConnectBankButton />);

    await userEvent.click(
      screen.getByRole("button", { name: /conectar banco/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("pluggy-connect-widget-mock"),
      ).toBeInTheDocument(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/connect-token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByTestId("connect-token-recebido")).toHaveTextContent(
      "token-xyz-789",
    );
    expect(screen.getByTestId("include-sandbox-recebido")).toHaveTextContent(
      "undefined",
    );
  });
});

describe("ConnectBankButton - o Connect Token nunca e logado nem persistido (Criterio de aceite #9)", () => {
  it("nao chama console.log/warn/error em nenhum momento do fluxo (busca do token, abertura do widget, sucesso)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { accessToken: "token-que-nao-pode-ser-logado" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { success: true, data: { id: "bankitem-1", pluggyItemId: "item-1" } },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { ConnectBankButton } = await import(
      "@/components/bank-items/ConnectBankButton"
    );
    render(<ConnectBankButton />);

    await userEvent.click(
      screen.getByRole("button", { name: /conectar banco/i }),
    );
    await waitFor(() => screen.getByTestId("pluggy-connect-widget-mock"));
    await userEvent.click(
      screen.getByRole("button", { name: /simular sucesso do widget/i }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("nao persiste o Connect Token em localStorage/sessionStorage", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { accessToken: "token-que-nao-pode-ser-persistido" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    // Espiona o prototipo global `Storage` (usado tanto por localStorage
    // quanto sessionStorage no jsdom) em vez de uma instancia especifica -
    // mais robusto ao ambiente de teste do que acessar `window.localStorage`
    // diretamente.
    const localStorageSetItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const { ConnectBankButton } = await import(
      "@/components/bank-items/ConnectBankButton"
    );
    render(<ConnectBankButton />);

    await userEvent.click(
      screen.getByRole("button", { name: /conectar banco/i }),
    );
    await waitFor(() => screen.getByTestId("pluggy-connect-widget-mock"));

    expect(localStorageSetItemSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("token-que-nao-pode-ser-persistido"),
    );

    localStorageSetItemSpy.mockRestore();
  });
});

describe("ConnectBankButton - onSuccess chama POST /api/items (Criterio de aceite #7)", () => {
  it("envia o itemId recebido no onSuccess do widget para POST /api/items", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { accessToken: "token-abc" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: true,
            data: { id: "bankitem-1", pluggyItemId: "item-uuid-vindo-do-widget" },
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { ConnectBankButton } = await import(
      "@/components/bank-items/ConnectBankButton"
    );
    render(<ConnectBankButton />);

    await userEvent.click(
      screen.getByRole("button", { name: /conectar banco/i }),
    );
    await waitFor(() =>
      screen.getByTestId("pluggy-connect-widget-mock"),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /simular sucesso do widget/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ pluggyItemId: "item-uuid-vindo-do-widget" }),
      }),
    );
  });
});

describe("ConnectBankButton - onError mostra mensagem tratada, sem vazar detalhe tecnico (Criterio de aceite #7)", () => {
  it("mostra uma mensagem generica e uma opcao de tentar de novo, NUNCA o error.message bruto do widget", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { accessToken: "token-abc" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { ConnectBankButton } = await import(
      "@/components/bank-items/ConnectBankButton"
    );
    render(<ConnectBankButton />);

    await userEvent.click(
      screen.getByRole("button", { name: /conectar banco/i }),
    );
    await waitFor(() => screen.getByTestId("pluggy-connect-widget-mock"));

    await userEvent.click(
      screen.getByRole("button", { name: /simular erro do widget/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId("pluggy-connect-widget-mock"),
      ).not.toBeInTheDocument(),
    );

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toContain("INVALID_CREDENTIALS");
    expect(bodyText).not.toContain(
      "detalhe tecnico interno que nao deveria vazar",
    );

    // opcao de tentar de novo continua disponivel
    expect(
      screen.getByRole("button", { name: /conectar banco/i }),
    ).toBeInTheDocument();
  });
});

describe("ConnectBankButton - falha de POST /api/connect-token: o widget NAO abre (Criterio de aceite #7)", () => {
  it("quando /api/connect-token responde success:false, mostra erro tratado e nao renderiza PluggyConnect", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { success: false, error: "Nao foi possivel gerar o token." },
          500,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { ConnectBankButton } = await import(
      "@/components/bank-items/ConnectBankButton"
    );
    render(<ConnectBankButton />);

    await userEvent.click(
      screen.getByRole("button", { name: /conectar banco/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/conectando/i)).not.toBeInTheDocument(),
    );

    expect(
      screen.queryByTestId("pluggy-connect-widget-mock"),
    ).not.toBeInTheDocument();
    // alguma mensagem de erro deve estar visivel
    expect(document.body.textContent).toMatch(
      /n[aã]o foi poss[ií]vel|erro|tente novamente/i,
    );
  });

  it("quando /api/connect-token rejeita (rede fora do ar), mostra erro tratado e nao renderiza PluggyConnect", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { ConnectBankButton } = await import(
      "@/components/bank-items/ConnectBankButton"
    );
    render(<ConnectBankButton />);

    await userEvent.click(
      screen.getByRole("button", { name: /conectar banco/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/conectando/i)).not.toBeInTheDocument(),
    );

    expect(
      screen.queryByTestId("pluggy-connect-widget-mock"),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Failed to fetch");
  });
});
