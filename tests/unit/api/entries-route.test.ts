import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/entries/route.ts (TASK-009 - Criterio de
 * aceite #2 e #3 da secao 4).
 *
 * `@/lib/entries` e mockada PARCIALMENTE: `manualEntryInputSchema`
 * continua REAL (via `importOriginal`, mesmo padrao de
 * app/api/category-rules/route.ts/TASK-008 e
 * tests/unit/api/transactions-route.test.ts/TASK-007) - a validacao Zod
 * acontece de verdade aqui; so `createManualEntry` e mockada.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/api/entries/route.ts
 *     export async function POST(request: Request): Promise<Response>
 *
 * POST deve:
 *   - parsear o corpo com `manualEntryInputSchema` - invalido/ausente/JSON
 *     malformado -> 400 em ApiResponse<T>, SEM chamar `createManualEntry`;
 *   - corpo valido -> chama `createManualEntry(parsedBody)` e responde
 *     200 ou 201 com `{ success: true, data: {...} }` RECONSTRUIDO campo a
 *     campo a partir do retorno de `createManualEntry` (id, date,
 *     description, amount, direction, accountId, accountName, method,
 *     category);
 *   - `EntryAccountNotFoundError` -> 400 (accountId nao existe -
 *     "conta inexistente" e erro do chamador, mesmo padrao de
 *     AccountNotFoundError em app/api/transactions);
 *   - `EntryAccountConnectedError` -> 400 (PREVENCAO POR CONVENCAO, Criterio
 *     de aceite #3 - o eixo da task);
 *   - qualquer outro erro -> 500 generico, sem vazar stack/detalhe;
 *   - nunca chama console.*.
 */

const { createManualEntryMock } = vi.hoisted(() => ({
  createManualEntryMock: vi.fn(),
}));

vi.mock("@/lib/entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/entries")>();
  return {
    ...actual,
    createManualEntry: createManualEntryMock,
  };
});

const FORBIDDEN_SUBSTRINGS = [
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
  "node_modules",
];

function buildValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    amount: 50,
    direction: "saida",
    date: "2026-08-10",
    description: "Pix para o mercado",
    method: "PIX",
    category: "Alimentação",
    accountId: "account-cuid-1",
    ...overrides,
  };
}

function buildEntryResult(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-cuid-1",
    date: new Date("2026-08-10T00:00:00.000Z"),
    description: "Pix para o mercado",
    amount: "-50.00",
    direction: "saida",
    accountId: "account-cuid-1",
    accountName: "Dinheiro",
    method: "PIX",
    category: "Alimentação",
    ...overrides,
  };
}

function postRequest(body?: unknown): Request {
  return new Request("http://localhost:3000/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function rawBodyRequest(rawBody: string): Request {
  return new Request("http://localhost:3000/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/entries - validacao Zod (Criterio de aceite #2)", () => {
  it("corpo ausente -> 400, sem chamar createManualEntry", async () => {
    const { POST } = await import("@/app/api/entries/route");
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(createManualEntryMock).not.toHaveBeenCalled();
  });

  it("JSON malformado -> 400 tratado, sem excecao nao tratada", async () => {
    const { POST } = await import("@/app/api/entries/route");
    const response = await POST(rawBodyRequest("{ isso nao e json valido"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(createManualEntryMock).not.toHaveBeenCalled();
  });

  it.each([
    ["amount zero", buildValidPayload({ amount: 0 })],
    ["amount negativo", buildValidPayload({ amount: -10 })],
    ["date invalida", buildValidPayload({ date: "2026-02-30" })],
    ["description vazia", buildValidPayload({ description: "" })],
    ["method fora do conjunto", buildValidPayload({ method: "BOLETO" })],
    ["direction invalida", buildValidPayload({ direction: "saída" })],
    ["accountId ausente", (() => {
      const payload = buildValidPayload();
      delete (payload as Record<string, unknown>).accountId;
      return payload;
    })()],
  ])("payload invalido (%s) -> 400, sem chamar createManualEntry", async (_label, payload) => {
    const { POST } = await import("@/app/api/entries/route");
    const response = await POST(postRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(createManualEntryMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/entries - sucesso (Criterio de aceite #2)", () => {
  it("payload valido -> chama createManualEntry com os dados parseados e responde com ApiResponse<T> reconstruido", async () => {
    createManualEntryMock.mockResolvedValueOnce(buildEntryResult());

    const { POST } = await import("@/app/api/entries/route");
    const response = await POST(postRequest(buildValidPayload()));
    const body = await response.json();

    expect([200, 201]).toContain(response.status);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: "entry-cuid-1",
      description: "Pix para o mercado",
      amount: "-50.00",
      direction: "saida",
      accountId: "account-cuid-1",
      accountName: "Dinheiro",
      method: "PIX",
      category: "Alimentação",
    });
    expect(createManualEntryMock).toHaveBeenCalledTimes(1);
    expect(createManualEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 50,
        direction: "saida",
        accountId: "account-cuid-1",
      }),
    );
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    createManualEntryMock.mockResolvedValueOnce(buildEntryResult());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/entries/route");
    await POST(postRequest(buildValidPayload()));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("POST /api/entries - prevencao por convencao: conta conectada (Criterio de aceite #3)", () => {
  it("EntryAccountConnectedError -> 400, mensagem generica (nao vaza detalhe interno)", async () => {
    const { EntryAccountConnectedError } = await import("@/lib/entries");
    createManualEntryMock.mockRejectedValueOnce(
      new EntryAccountConnectedError(),
    );

    const { POST } = await import("@/app/api/entries/route");
    const response = await POST(postRequest(buildValidPayload()));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
  });
});

describe("POST /api/entries - conta inexistente -> 400", () => {
  it("EntryAccountNotFoundError -> 400", async () => {
    const { EntryAccountNotFoundError } = await import("@/lib/entries");
    createManualEntryMock.mockRejectedValueOnce(
      new EntryAccountNotFoundError(),
    );

    const { POST } = await import("@/app/api/entries/route");
    const response = await POST(postRequest(buildValidPayload()));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

describe("POST /api/entries - erro inesperado -> 500 tratado, sem vazar detalhe", () => {
  it("responde 500 sem stack trace quando createManualEntry rejeita com erro generico", async () => {
    const internalError = new Error("connection terminated unexpectedly");
    internalError.stack =
      "Error: connection terminated\n    at Object.<anonymous> (/app/node_modules/pg/lib/client.js:99:20)";
    createManualEntryMock.mockRejectedValueOnce(internalError);

    const { POST } = await import("@/app/api/entries/route");
    const response = await POST(postRequest(buildValidPayload()));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
    expect(rawBody).not.toContain("connection terminated");
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    createManualEntryMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/entries/route");
    await POST(postRequest(buildValidPayload()));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
