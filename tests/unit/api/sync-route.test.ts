import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/sync/route.ts (TASK-006 - Criterio de
 * aceite #2: "POST /api/sync (casca fina) dispara o sync de todos os
 * BankItems ativos, em serie; logica em lib/ (ex. lib/sync.ts)").
 *
 * `lib/sync.ts` e mockada inteiramente (`vi.mock("@/lib/sync", ...)`) - a
 * rota deve ser uma casca fina que so chama `syncAllActiveBankItems` e
 * traduz o resultado/erro para `ApiResponse<T>`. Mesmo padrao de
 * tests/unit/api/items-route.test.ts (TASK-004).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/api/sync/route.ts
 *     export async function POST(request: Request): Promise<Response>
 *
 *   `request` nao e lido (POST /api/sync nao recebe corpo - dispara o sync
 *   de TODOS os BankItems ativos, sem parametro) - o parametro so existe
 *   para seguir a assinatura padrao de Route Handler do Next.js.
 *
 * POST deve:
 *   - chamar `syncAllActiveBankItems()` de `lib/sync.ts` e responder 200
 *     com `{ success: true, data: <retorno de syncAllActiveBankItems> }`;
 *   - qualquer erro NAO capturado por `syncAllActiveBankItems` (ela mesma
 *     ja captura falha por-item e devolve `{ status: "ERROR" }` no array -
 *     ver tests/unit/lib/sync.test.ts - entao um `throw` aqui so acontece
 *     por falha inesperada, ex. `listActiveBankItems` rejeitando) -> 500
 *     generico em ApiResponse<T>, sem vazar mensagem/stack do erro
 *     original;
 *   - nunca chamar console.*.
 */

const { syncAllActiveBankItemsMock } = vi.hoisted(() => ({
  syncAllActiveBankItemsMock: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  syncAllActiveBankItems: syncAllActiveBankItemsMock,
}));

const FORBIDDEN_SUBSTRINGS = [
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
  "node_modules",
];

function postRequest(): Request {
  return new Request("http://localhost:3000/api/sync", { method: "POST" });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/sync - sucesso (Criterio de aceite #2)", () => {
  it("chama syncAllActiveBankItems e responde 200 com ApiResponse<T> contendo o array de resultados", async () => {
    const syncResults = [
      { bankItemId: "item-1", status: "OK", accountsSynced: 2, transactionsSynced: 10 },
      { bankItemId: "item-2", status: "ERROR", error: "Nao foi possivel sincronizar." },
    ];
    syncAllActiveBankItemsMock.mockResolvedValueOnce(syncResults);

    const { POST } = await import("@/app/api/sync/route");
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: syncResults });
  });

  it("responde 200 mesmo com array vazio (nenhum BankItem ativo)", async () => {
    syncAllActiveBankItemsMock.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/sync/route");
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: [] });
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    syncAllActiveBankItemsMock.mockResolvedValueOnce([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/sync/route");
    await POST(postRequest());

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("POST /api/sync - erro inesperado nao capturado por syncAllActiveBankItems (sem vazar detalhe do SDK)", () => {
  it("responde 500 com success:false quando syncAllActiveBankItems rejeita", async () => {
    syncAllActiveBankItemsMock.mockRejectedValueOnce(
      new Error("listActiveBankItems falhou (Postgres fora do ar, simulado)"),
    );

    const { POST } = await import("@/app/api/sync/route");
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("responde 500 tratado, sem stack trace nem detalhe do SDK, quando a falha vem de rede/timeout", async () => {
    const sdkError = new Error("connect ETIMEDOUT 200.1.2.3:443");
    sdkError.stack =
      "Error: connect ETIMEDOUT\n    at Object.<anonymous> (/app/node_modules/pluggy-sdk/dist/baseApi.js:99:20)";
    syncAllActiveBankItemsMock.mockRejectedValueOnce(sdkError);

    const { POST } = await import("@/app/api/sync/route");
    const response = await POST(postRequest());
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
    expect(rawBody).not.toContain("ETIMEDOUT");
  });

  it("responde 500 mesmo quando syncAllActiveBankItems rejeita com um valor que nao e instancia de Error", async () => {
    syncAllActiveBankItemsMock.mockRejectedValueOnce({
      message: "Postgres connection refused",
      code: "ECONNREFUSED",
    });

    const { POST } = await import("@/app/api/sync/route");
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    syncAllActiveBankItemsMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/sync/route");
    await POST(postRequest());

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
