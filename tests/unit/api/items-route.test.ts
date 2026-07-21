import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/items/route.ts (TASK-004 - Criterio de
 * aceite #1 e #2).
 *
 * `lib/bank-item.ts` e mockada inteiramente (`vi.mock("@/lib/bank-item",
 * ...)`) - a rota deve ser uma casca fina que so valida o corpo com Zod e
 * chama `upsertBankItem` de `lib/bank-item.ts`, traduzindo o
 * resultado/erro para `ApiResponse<T>`. A validacao Zod acontece de
 * verdade aqui (nao e mockada) - e o unico jeito de testar o Criterio 1
 * ("valida o corpo com Zod").
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/api/items/route.ts
 *     export async function POST(request: Request): Promise<Response>
 *
 * POST deve:
 *   - parsear o corpo com Zod: `{ pluggyItemId: string }`, exigindo formato
 *     UUID (a Pluggy usa UUID para o id do Item) - corpo ausente, sem
 *     `pluggyItemId`, com `pluggyItemId` que nao e string, ou com formato
 *     nao-UUID -> 400 em ApiResponse<T>, SEM chamar `upsertBankItem`;
 *   - com um `pluggyItemId` valido, chamar
 *     `upsertBankItem(pluggyItemId)` de `lib/bank-item.ts` e responder
 *     201 com `{ success: true, data: <retorno de upsertBankItem> }`;
 *   - qualquer erro capturado de `upsertBankItem` (PluggyConfigError,
 *     PluggyItemFetchError, ou qualquer coisa inesperada) -> 500 generico
 *     em ApiResponse<T>, sem vazar mensagem/stack do erro original (mesmo
 *     padrao de app/api/connect-token/route.ts da TASK-003);
 *   - nunca chamar console.*.
 *
 * DADO/QUANDO/ENTAO cobertos (secao 2 do TASK-004.md):
 *   - pluggyItemId valido -> 201, BankItem persistido (via lib mockada)
 *   - pluggyItemId ja existente -> nao duplica (testado a nivel de
 *     integracao em tests/integration/bank-item-creation.integration.test.ts
 *     e tests/integration/api/items.integration.test.ts - este arquivo so
 *     prova que a rota REPASSA o pluggyItemId para upsertBankItem)
 *   - payload invalido (sem pluggyItemId, ou nao-UUID) -> 400, sem persistir
 *   - Pluggy fora do ar -> erro tratado, sem vazar detalhe do SDK
 *   - taxNumber/PII no payload resolvido por upsertBankItem -> nao vaza na
 *     resposta HTTP (defesa em profundidade, mesmo padrao reforcado na
 *     revisao pos-aprovacao da TASK-003 - DT-011)
 */

const { upsertBankItemMock } = vi.hoisted(() => ({
  upsertBankItemMock: vi.fn(),
}));

vi.mock("@/lib/bank-item", () => ({
  upsertBankItem: upsertBankItemMock,
}));

const VALID_PLUGGY_ITEM_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

// CPF fabricado para teste - formato valido, NUNCA um CPF real. So existe
// para provar que a checagem de substrings abaixo tem poder de deteccao
// real (o unico teste que a usa injeta esse valor DE VERDADE no payload
// mockado de upsertBankItem - licao do DT-011/TASK-003).
const FAKE_CPF = "123.456.789-00";

const FORBIDDEN_SUBSTRINGS = [
  FAKE_CPF,
  "taxNumber",
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
  "node_modules",
];

function buildPersistedBankItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "bankitem-cuid-123",
    pluggyItemId: VALID_PLUGGY_ITEM_ID,
    institution: "Banco Teste",
    status: "UPDATED",
    executionStatus: "SUCCESS",
    state: "OK",
    ...overrides,
  };
}

function postRequest(body?: unknown): Request {
  return new Request("http://localhost:3000/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function rawBodyRequest(rawBody: string): Request {
  return new Request("http://localhost:3000/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/items - validacao com Zod (Criterio de aceite #1)", () => {
  it("corpo ausente -> 400 em ApiResponse<T>, sem chamar upsertBankItem", async () => {
    const { POST } = await import("@/app/api/items/route");
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(upsertBankItemMock).not.toHaveBeenCalled();
  });

  it("corpo JSON literal 'null' -> 400 tratado, sem lancar excecao nao tratada, sem chamar upsertBankItem", async () => {
    const { POST } = await import("@/app/api/items/route");
    const response = await POST(postRequest(null));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(upsertBankItemMock).not.toHaveBeenCalled();
  });

  it("JSON malformado -> 400 tratado, sem lancar excecao nao tratada", async () => {
    const { POST } = await import("@/app/api/items/route");
    const response = await POST(rawBodyRequest("{ isso nao e json valido"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(upsertBankItemMock).not.toHaveBeenCalled();
  });

  it("objeto sem pluggyItemId -> 400, sem chamar upsertBankItem", async () => {
    const { POST } = await import("@/app/api/items/route");
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(upsertBankItemMock).not.toHaveBeenCalled();
  });

  it.each([
    ["numero", { pluggyItemId: 12345 }],
    ["string vazia", { pluggyItemId: "" }],
    ["formato nao-UUID (texto qualquer)", { pluggyItemId: "not-a-uuid" }],
    ["formato nao-UUID (numerico)", { pluggyItemId: "12345" }],
    [
      "formato quase-UUID (um caractere a mais)",
      { pluggyItemId: "3fa85f64-5717-4562-b3fc-2c963f66afa6-x" },
    ],
    ["array", { pluggyItemId: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"] }],
    ["null", { pluggyItemId: null }],
  ])(
    "pluggyItemId invalido (%s) -> 400, sem chamar upsertBankItem",
    async (_label, payload) => {
      const { POST } = await import("@/app/api/items/route");
      const response = await POST(postRequest(payload));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(upsertBankItemMock).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/items - sucesso (Criterio de aceite #1)", () => {
  it("pluggyItemId valido -> 201 com ApiResponse<T> contendo o BankItem persistido", async () => {
    const persisted = buildPersistedBankItem();
    upsertBankItemMock.mockResolvedValueOnce(persisted);

    const { POST } = await import("@/app/api/items/route");
    const response = await POST(
      postRequest({ pluggyItemId: VALID_PLUGGY_ITEM_ID }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ success: true, data: persisted });
  });

  it("repassa o pluggyItemId do corpo da requisicao para upsertBankItem", async () => {
    upsertBankItemMock.mockResolvedValueOnce(buildPersistedBankItem());

    const { POST } = await import("@/app/api/items/route");
    await POST(postRequest({ pluggyItemId: VALID_PLUGGY_ITEM_ID }));

    expect(upsertBankItemMock).toHaveBeenCalledTimes(1);
    expect(upsertBankItemMock).toHaveBeenCalledWith(VALID_PLUGGY_ITEM_ID);
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    upsertBankItemMock.mockResolvedValueOnce(buildPersistedBankItem());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/items/route");
    await POST(postRequest({ pluggyItemId: VALID_PLUGGY_ITEM_ID }));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("POST /api/items - defesa contra vazamento de PII (Criterio de aceite #7, camada da rota)", () => {
  it("mesmo que upsertBankItem resolva com um campo extra parecido com PII (defesa em profundidade), a resposta HTTP nao o contem", async () => {
    // upsertBankItem NAO deveria devolver isso (a lib e responsavel por
    // nunca carregar taxNumber ate aqui - ver tests/integration/bank-item-creation.integration.test.ts),
    // mas simulamos essa contaminacao para provar que, MESMO SE a camada
    // de baixo falhar, a rota nao amplifica o vazamento repassando o
    // objeto cru (`data: result`) em vez de reconstrui-lo.
    upsertBankItemMock.mockResolvedValueOnce(
      buildPersistedBankItem({ taxNumber: FAKE_CPF }),
    );

    const { POST } = await import("@/app/api/items/route");
    const response = await POST(
      postRequest({ pluggyItemId: VALID_PLUGGY_ITEM_ID }),
    );
    const rawBody = await response.text();

    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });
});

describe("POST /api/items - erro tratado da Pluggy/upsertBankItem (sem vazar detalhe do SDK)", () => {
  it("responde 500 com success:false quando upsertBankItem rejeita com um erro de configuracao (PluggyConfigError simulado)", async () => {
    class FakePluggyConfigError extends Error {}
    upsertBankItemMock.mockRejectedValueOnce(
      new FakePluggyConfigError("Nao foi possivel gerar o token de conexao."),
    );

    const { POST } = await import("@/app/api/items/route");
    const response = await POST(
      postRequest({ pluggyItemId: VALID_PLUGGY_ITEM_ID }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("responde 500 tratado, sem stack trace, quando upsertBankItem rejeita com erro de rede/timeout", async () => {
    const sdkError = new Error("connect ETIMEDOUT 200.1.2.3:443");
    sdkError.stack =
      "Error: connect ETIMEDOUT\n    at Object.<anonymous> (/app/node_modules/pluggy-sdk/dist/baseApi.js:99:20)";
    upsertBankItemMock.mockRejectedValueOnce(sdkError);

    const { POST } = await import("@/app/api/items/route");
    const response = await POST(
      postRequest({ pluggyItemId: VALID_PLUGGY_ITEM_ID }),
    );
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(rawBody).not.toContain("ETIMEDOUT");
    expect(rawBody).not.toContain(".ts:");
    expect(rawBody).not.toContain(".js:");
  });

  it("responde 500 mesmo quando upsertBankItem rejeita com um valor que nao e instancia de Error", async () => {
    upsertBankItemMock.mockRejectedValueOnce({
      message: "Item not found",
      statusCode: 404,
    });

    const { POST } = await import("@/app/api/items/route");
    const response = await POST(
      postRequest({ pluggyItemId: VALID_PLUGGY_ITEM_ID }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    upsertBankItemMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/items/route");
    await POST(postRequest({ pluggyItemId: VALID_PLUGGY_ITEM_ID }));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
