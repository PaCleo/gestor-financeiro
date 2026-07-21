import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/connect-token/route.ts (Criterio de aceite #1
 * e #2 da TASK-003).
 *
 * `lib/pluggy.ts` e mockada inteiramente - a rota deve ser uma casca fina
 * que so chama `createConnectToken` de `lib/pluggy.ts` e traduz o
 * resultado/erro para `ApiResponse<T>`. Nenhum teste deste arquivo toca a
 * `pluggy-sdk` real nem faz chamada de rede: se a rota bypassasse
 * `lib/pluggy.ts` e falasse com o SDK diretamente, os testes abaixo que
 * comparam o corpo da resposta com o valor exato devolvido pelo mock
 * (`createConnectTokenMock`) fracassariam, porque esse valor nunca seria
 * produzido por outro caminho.
 *
 * DADO/QUANDO/ENTAO cobertos (secao 2 do TASK-003.md):
 *   - CLIENT_ID/CLIENT_SECRET configurados -> 200 com
 *     { success: true, data: { accessToken } }
 *   - a mesma resposta contem SOMENTE accessToken - nada de CLIENT_ID,
 *     CLIENT_SECRET, API Key ou qualquer outro campo interno
 *   - CLIENT_ID/CLIENT_SECRET ausentes -> 500, success:false, mensagem
 *     generica, sem citar a variavel
 *   - Pluggy fora do ar (403/500/timeout) -> erro tratado em ApiResponse<T>,
 *     sem stack trace nem detalhe do SDK
 *   - clientUserId informado -> repassado a lib/pluggy.ts
 */

const { createConnectTokenMock } = vi.hoisted(() => ({
  createConnectTokenMock: vi.fn(),
}));

vi.mock("@/lib/pluggy", () => ({
  createConnectToken: createConnectTokenMock,
}));

const FAKE_CLIENT_ID = "fake-client-id-para-teste-nao-e-credencial-real";
const FAKE_CLIENT_SECRET = "fake-client-secret-para-teste-nao-e-credencial-real";

const FORBIDDEN_SUBSTRINGS = [
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  "CLIENT_ID",
  "CLIENT_SECRET",
  "X-API-KEY",
  "apiKey",
  "connect_token",
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
  "node_modules",
];

function postRequest(body?: unknown): Request {
  return new Request("http://localhost:3000/api/connect-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Constroi a Request com um corpo RAW (nao serializado via JSON.stringify) -
 * necessario para simular string vazia e JSON malformado, que nao tem
 * representacao como valor JS a ser passado para `postRequest`.
 */
function rawBodyRequest(rawBody: string): Request {
  return new Request("http://localhost:3000/api/connect-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

/**
 * Varredura manual do reviewer (TASK-003, revisao pos-aprovacao) sobre os
 * formatos de corpo que NAO devem quebrar a rota - vira regressao
 * automatizada aqui em vez de conhecimento perdido. `null` fica de fora
 * desta lista de proposito: e o formato que quebra (ver describe dedicado
 * abaixo) - JSON valido, mas `request.json()` resolve com `null` em vez de
 * rejeitar, entao o `.catch(() => ({}))` da rota nao dispara.
 */
const OTHER_BODY_FORMATS: Array<[string, () => Request]> = [
  ["ausente (sem corpo)", () => postRequest()],
  ["vazio (string vazia)", () => rawBodyRequest("")],
  ["JSON invalido (string malformada)", () => rawBodyRequest("{ isso nao e json valido")],
  ["numero", () => postRequest(42)],
  ["string", () => postRequest("so-uma-string")],
  ["array", () => postRequest([1, 2, 3])],
  ["objeto", () => postRequest({})],
];

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/connect-token - sucesso (Cenario 1 / Criterio 1)", () => {
  it("responde 200 com ApiResponse<{ accessToken }>", async () => {
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-abc-123" });

    const { POST } = await import("@/app/api/connect-token/route");
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { accessToken: "token-abc-123" },
    });
  });

  it("o corpo da resposta contem SOMENTE accessToken em data - nenhum outro campo, nenhuma credencial (Cenario 2 / Criterio 3)", async () => {
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-abc-123" });

    const { POST } = await import("@/app/api/connect-token/route");
    const response = await POST(postRequest({}));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(Object.keys(body).sort()).toEqual(["data", "success"]);
    expect(Object.keys(body.data)).toEqual(["accessToken"]);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });

  it("mesmo que lib/pluggy resolva com campos extras no payload (incluindo um valor com formato de credencial), a rota devolve APENAS accessToken em data (defesa em profundidade)", async () => {
    // Este e o UNICO teste do arquivo cujo payload mockado realmente contem
    // um valor com formato de credencial (FAKE_CLIENT_ID) - por isso a
    // checagem de FORBIDDEN_SUBSTRINGS abaixo tem poder de deteccao de
    // verdade aqui (nos outros testes de sucesso, o payload nunca contem
    // esses valores, entao a mesma checagem so provaria auisencia de
    // mecanismo, nao protecao - correcao pedida na revisao pos-aprovacao).
    createConnectTokenMock.mockResolvedValueOnce({
      accessToken: "token-abc-123",
      clientId: FAKE_CLIENT_ID,
      clientSecret: FAKE_CLIENT_SECRET,
      internalDebug: "nao-deveria-vazar",
    });

    const { POST } = await import("@/app/api/connect-token/route");
    const response = await POST(postRequest({}));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(Object.keys(body.data)).toEqual(["accessToken"]);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });

  it("repassa o clientUserId do corpo da requisicao para createConnectToken (Cenario 5 / Criterio 6)", async () => {
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-xyz" });

    const { POST } = await import("@/app/api/connect-token/route");
    await POST(postRequest({ clientUserId: "user-42" }));

    expect(createConnectTokenMock).toHaveBeenCalledWith("user-42");
  });

  it("funciona sem clientUserId no corpo (corpo vazio ou ausente)", async () => {
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-sem-user" });

    const { POST } = await import("@/app/api/connect-token/route");
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.accessToken).toBe("token-sem-user");
  });

  it("nao chama console.log/warn/error no caminho feliz (Criterio 8)", async () => {
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-abc-123" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/connect-token/route");
    await POST(postRequest({}));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("POST /api/connect-token - credenciais ausentes (Cenario 3 / Criterio 4)", () => {
  it("responde 500 com success:false e mensagem generica quando createConnectToken rejeita por config ausente - sem citar qual variavel falta", async () => {
    class FakePluggyConfigError extends Error {}
    createConnectTokenMock.mockRejectedValueOnce(
      new FakePluggyConfigError("Nao foi possivel gerar o token de conexao."),
    );

    const { POST } = await import("@/app/api/connect-token/route");
    const response = await POST(postRequest({}));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });
});

describe("POST /api/connect-token - falha da Pluggy (Cenario 4 / Criterio 5)", () => {
  it("responde 500 tratado, sem stack trace nem detalhe do SDK, quando createConnectToken rejeita com um erro de rede/timeout", async () => {
    const sdkError = new Error("connect ETIMEDOUT 200.1.2.3:443");
    sdkError.stack =
      "Error: connect ETIMEDOUT\n    at Object.<anonymous> (/app/node_modules/pluggy-sdk/dist/baseApi.js:99:20)";
    createConnectTokenMock.mockRejectedValueOnce(sdkError);

    const { POST } = await import("@/app/api/connect-token/route");
    const response = await POST(postRequest({}));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(rawBody).not.toContain("ETIMEDOUT");
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });

  it("responde 500 mesmo quando createConnectToken rejeita com um valor que nao e instancia de Error (formato de corpo HTTP do SDK real)", async () => {
    createConnectTokenMock.mockRejectedValueOnce({
      message: "Forbidden",
      statusCode: 403,
    });

    const { POST } = await import("@/app/api/connect-token/route");
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("responde 500 tratado quando createConnectToken rejeita simulando uma falha 500 da propria Pluggy", async () => {
    createConnectTokenMock.mockRejectedValueOnce(new Error("Internal Server Error"));

    const { POST } = await import("@/app/api/connect-token/route");
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("nao chama console.log/warn/error no caminho de erro (Criterio 8)", async () => {
    createConnectTokenMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/connect-token/route");
    await POST(postRequest({}));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

/**
 * Regressao automatizada da varredura manual feita pelo reviewer na revisao
 * pos-aprovacao da TASK-003: ele testou ausente, vazio, JSON invalido,
 * numero, string, array e objeto (todos tratados corretamente) e null
 * (unico que escapa). Isso transforma o achado dele em teste, em vez de
 * conhecimento perdido.
 */
describe("POST /api/connect-token - variedade de formatos de corpo (regressao automatizada da varredura do reviewer)", () => {
  it.each(OTHER_BODY_FORMATS)(
    "corpo %s: responde 200 tratado em ApiResponse<T>, sem lancar excecao nao tratada",
    async (_label, buildRequest) => {
      createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-abc-123" });

      const { POST } = await import("@/app/api/connect-token/route");
      const response = await POST(buildRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBe("token-abc-123");
    },
  );
});

describe("POST /api/connect-token - corpo null (bug encontrado na revisao pos-aprovacao)", () => {
  it("corpo JSON literal 'null' (JSON valido - request.json() RESOLVE com null, nao rejeita, entao .catch(()=>({})) nao dispara) responde 500 tratado em ApiResponse<T>, sem lancar excecao nao tratada para quem chama a rota", async () => {
    const { POST } = await import("@/app/api/connect-token/route");

    // NAO deve lancar / rejeitar de forma nao tratada: a rota precisa
    // devolver uma Response de erro em ApiResponse<T>, igual a qualquer
    // outro caminho de falha (mesmo padrao de app/api/health/route.ts, que
    // ja "nao confia cegamente" e sempre devolve uma Response tratada).
    const response = await POST(postRequest(null));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });
});
