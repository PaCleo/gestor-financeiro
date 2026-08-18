import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/category-rules/route.ts (TASK-008 - Criterio
 * de aceite #3/#4).
 *
 * `@/lib/category-rules` e mockada INTEIRAMENTE (mesmo padrao de
 * app/api/items/route.ts, TASK-004) - a rota deve ser uma casca fina que
 * valida o corpo com Zod (reaproveitando `categoryRuleInputSchema`) e chama
 * `upsertCategoryRule`/`listCategoryRules`, traduzindo para `ApiResponse<T>`.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/api/category-rules/route.ts
 *     export async function POST(request: Request): Promise<Response>
 *     export async function GET(): Promise<Response>
 *
 * POST deve:
 *   - parsear o corpo com `categoryRuleInputSchema` de `@/lib/category-rules`
 *     ({ document: string min 1, category: string min 1, label?: string
 *     min 1}) - corpo ausente/invalido -> 400 em ApiResponse<T>, SEM chamar
 *     `upsertCategoryRule`;
 *   - com corpo valido, chamar `upsertCategoryRule({ document, category,
 *     label })` e responder 200 (ou 201) com `{ success: true, data: {
 *     id, label, category } }` RECONSTRUIDO campo a campo (nunca `data:
 *     result` cru) - o documento NUNCA aparece na resposta, nem mesmo se
 *     `upsertCategoryRule` devolver um campo extra por engano (defesa em
 *     profundidade, mesmo padrao de app/api/items/route.ts);
 *   - qualquer erro capturado -> 500 generico em ApiResponse<T>, sem vazar
 *     mensagem/stack do erro original;
 *   - nunca chamar console.*.
 *
 * GET deve:
 *   - chamar `listCategoryRules()` e responder 200 com `{ success: true,
 *     data: [...] }` - cada item reconstruido campo a campo (id/label/
 *     category), nunca document/documentHash;
 *   - erro -> 500 generico;
 *   - nunca chamar console.*.
 */

const { upsertCategoryRuleMock, listCategoryRulesMock } = vi.hoisted(() => ({
  upsertCategoryRuleMock: vi.fn(),
  listCategoryRulesMock: vi.fn(),
}));

// Mesmo padrao de tests/unit/api/transactions-route.test.ts (TASK-007):
// `importOriginal` preserva o `categoryRuleInputSchema` REAL (a validacao
// Zod acontece de verdade aqui - e o unico jeito de testar o Criterio 3,
// "valida com Zod"), so `upsertCategoryRule`/`listCategoryRules` sao
// mockados.
vi.mock("@/lib/category-rules", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/category-rules")>();
  return {
    ...actual,
    upsertCategoryRule: upsertCategoryRuleMock,
    listCategoryRules: listCategoryRulesMock,
  };
});

// CPF/CNPJ fabricados para teste - formato valido, NUNCA um documento real.
// So existem para provar que a checagem de substrings abaixo tem poder de
// deteccao real (o unico teste que os usa injeta esse valor DE VERDADE no
// corpo da requisicao/no mock - licao do DT-011).
const FAKE_CPF = "123.456.789-00";
const FAKE_CNPJ = "12.345.678/0001-95";

const FORBIDDEN_SUBSTRINGS = [
  FAKE_CPF,
  FAKE_CNPJ,
  "123456789",
  "12345678000195",
  "documentHash",
  "document",
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
  "node_modules",
];

function buildPersistedRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-cuid-1",
    label: "Mercado do bairro",
    category: "Mercado",
    ...overrides,
  };
}

function postRequest(body?: unknown): Request {
  return new Request("http://localhost:3000/api/category-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function rawBodyRequest(rawBody: string): Request {
  return new Request("http://localhost:3000/api/category-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/category-rules - validacao (Criterio de aceite #3)", () => {
  it("corpo ausente -> 400, sem chamar upsertCategoryRule", async () => {
    const { POST } = await import("@/app/api/category-rules/route");
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(upsertCategoryRuleMock).not.toHaveBeenCalled();
  });

  it("JSON malformado -> 400 tratado, sem lancar excecao nao tratada", async () => {
    const { POST } = await import("@/app/api/category-rules/route");
    const response = await POST(rawBodyRequest("{ isso nao e json valido"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(upsertCategoryRuleMock).not.toHaveBeenCalled();
  });

  it.each([
    ["sem document", { category: "Mercado" }],
    ["document vazio", { document: "", category: "Mercado" }],
    ["document nao-string", { document: 12345678900, category: "Mercado" }],
    ["sem category", { document: FAKE_CNPJ }],
    ["category vazia", { document: FAKE_CNPJ, category: "" }],
    ["label vazio (quando presente)", { document: FAKE_CNPJ, category: "Mercado", label: "" }],
  ])("payload invalido (%s) -> 400, sem chamar upsertCategoryRule", async (_label, payload) => {
    const { POST } = await import("@/app/api/category-rules/route");
    const response = await POST(postRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(upsertCategoryRuleMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/category-rules - sucesso (Criterio de aceite #3)", () => {
  it("payload valido -> chama upsertCategoryRule e responde com ApiResponse<T> reconstruido (id/label/category)", async () => {
    upsertCategoryRuleMock.mockResolvedValueOnce(buildPersistedRule());

    const { POST } = await import("@/app/api/category-rules/route");
    const response = await POST(
      postRequest({ document: FAKE_CNPJ, category: "Mercado", label: "Mercado do bairro" }),
    );
    const body = await response.json();

    expect([200, 201]).toContain(response.status);
    expect(body).toEqual({
      success: true,
      data: { id: "rule-cuid-1", label: "Mercado do bairro", category: "Mercado" },
    });
    expect(upsertCategoryRuleMock).toHaveBeenCalledTimes(1);
    expect(upsertCategoryRuleMock).toHaveBeenCalledWith({
      document: FAKE_CNPJ,
      category: "Mercado",
      label: "Mercado do bairro",
    });
  });

  it("sem label, chama upsertCategoryRule sem label (opcional)", async () => {
    upsertCategoryRuleMock.mockResolvedValueOnce(
      buildPersistedRule({ label: null }),
    );

    const { POST } = await import("@/app/api/category-rules/route");
    await POST(postRequest({ document: FAKE_CNPJ, category: "Mercado" }));

    expect(upsertCategoryRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({ document: FAKE_CNPJ, category: "Mercado" }),
    );
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    upsertCategoryRuleMock.mockResolvedValueOnce(buildPersistedRule());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/category-rules/route");
    await POST(postRequest({ document: FAKE_CNPJ, category: "Mercado" }));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("POST /api/category-rules - O TESTE DE PII MAIS CRITICO DO ENDPOINT (Criterio de aceite #7): o documento cru NUNCA e ecoado na resposta HTTP", () => {
  it("o CNPJ enviado no corpo da requisicao (REALMENTE presente) NUNCA aparece no corpo bruto da resposta, mesmo em erro de upsertCategoryRule", async () => {
    upsertCategoryRuleMock.mockRejectedValueOnce(new Error("boom"));

    const { POST } = await import("@/app/api/category-rules/route");
    const response = await POST(
      postRequest({ document: FAKE_CNPJ, category: "Mercado" }),
    );
    const rawBody = await response.text();

    expect(rawBody).not.toContain(FAKE_CNPJ);
    expect(rawBody).not.toContain("12345678000195");
  });

  it("mesmo que upsertCategoryRule resolva com um campo extra 'document'/'documentHash' (defesa em profundidade), a resposta HTTP nao o contem", async () => {
    upsertCategoryRuleMock.mockResolvedValueOnce(
      buildPersistedRule({
        document: FAKE_CNPJ,
        documentHash: "hash-que-nao-deveria-vazar-mas-nao-e-pii-mesmo-assim",
      }),
    );

    const { POST } = await import("@/app/api/category-rules/route");
    const response = await POST(
      postRequest({ document: FAKE_CNPJ, category: "Mercado" }),
    );
    const rawBody = await response.text();

    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      if (forbidden === "document") continue; // a propria chave da requisicao contem "document"; checado explicitamente abaixo pelo valor bruto, nao pela substring generica
      expect(rawBody).not.toContain(forbidden);
    }
    const parsed = JSON.parse(rawBody);
    expect(Object.keys(parsed.data).sort()).toEqual(
      ["category", "id", "label"].sort(),
    );
  });
});

describe("POST /api/category-rules - erro tratado (sem vazar detalhe do erro original)", () => {
  it("responde 500 tratado, sem stack trace, quando upsertCategoryRule rejeita", async () => {
    const internalError = new Error("connection terminated unexpectedly");
    internalError.stack =
      "Error: connection terminated\n    at Object.<anonymous> (/app/node_modules/pg/lib/client.js:99:20)";
    upsertCategoryRuleMock.mockRejectedValueOnce(internalError);

    const { POST } = await import("@/app/api/category-rules/route");
    const response = await POST(
      postRequest({ document: FAKE_CNPJ, category: "Mercado" }),
    );
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(rawBody).not.toContain("connection terminated");
    expect(rawBody).not.toContain(".ts:");
    expect(rawBody).not.toContain(".js:");
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    upsertCategoryRuleMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/category-rules/route");
    await POST(postRequest({ document: FAKE_CNPJ, category: "Mercado" }));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("GET /api/category-rules - lista (Criterio de aceite #4)", () => {
  it("chama listCategoryRules e responde 200 com ApiResponse<T> - array de id/label/category", async () => {
    listCategoryRulesMock.mockResolvedValueOnce([
      buildPersistedRule({ id: "rule-1" }),
      buildPersistedRule({ id: "rule-2", label: null, category: "Farmácia" }),
    ]);

    const { GET } = await import("@/app/api/category-rules/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      id: "rule-1",
      label: "Mercado do bairro",
      category: "Mercado",
    });
  });

  it("lista vazia -> 200 com data: []", async () => {
    listCategoryRulesMock.mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/category-rules/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: [] });
  });

  it("mesmo que listCategoryRules devolva um item com documentHash (defesa em profundidade), a resposta HTTP nao o contem", async () => {
    listCategoryRulesMock.mockResolvedValueOnce([
      buildPersistedRule({ documentHash: "hash-nao-deveria-vazar-na-rota" }),
    ]);

    const { GET } = await import("@/app/api/category-rules/route");
    const response = await GET();
    const rawBody = await response.text();

    expect(rawBody).not.toContain("documentHash");
    expect(rawBody).not.toContain("hash-nao-deveria-vazar-na-rota");
  });

  it("erro em listCategoryRules -> 500 generico, sem vazar detalhe", async () => {
    listCategoryRulesMock.mockRejectedValueOnce(new Error("boom"));

    const { GET } = await import("@/app/api/category-rules/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("nao chama console.log/warn/error", async () => {
    listCategoryRulesMock.mockResolvedValueOnce([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { GET } = await import("@/app/api/category-rules/route");
    await GET();

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
