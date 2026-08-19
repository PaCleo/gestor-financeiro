import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/bills/route.ts (TASK-011 - Fatura do cartao,
 * fecha a Fase 5, Criterio de aceite #7: "GET /api/bills (casca fina, Zod
 * se houver filtro)").
 *
 * `lib/bills.ts` e mockada PARCIALMENTE (`vi.mock("@/lib/bills",
 * ...)` com `importOriginal`) - o schema `billsQuerySchema` (Zod real) e
 * reaproveitado pela rota tal-e-qual (nao reescrito ali), so `listBills` e
 * `AccountNotFoundError` sao mockados. Mesmo padrao de
 * tests/unit/api/transactions-route.test.ts (TASK-007) e
 * tests/unit/api/dashboard-route.test.ts (TASK-010).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim, ver secao 5 do TASK-011.md):
 *
 *   app/api/bills/route.ts
 *     export async function GET(request: Request): Promise<Response>
 *
 * GET deve:
 *   - construir os query params crus a partir de `new URL(request.url).searchParams`
 *     (`Object.fromEntries(...)`) e parsear com `billsQuerySchema`
 *     (`@/lib/bills`) - `accountId` vazio -> 400 em ApiResponse<T>, SEM
 *     chamar `listBills`;
 *   - com os parametros validos, chamar `listBills(parsed)` e responder 200
 *     com `{ success: true, data: <faturas> }` (sem `meta` - nao ha
 *     paginacao aqui, mesmo padrao de /api/dashboard);
 *   - se `listBills` rejeitar com `AccountNotFoundError` (`@/lib/bills`) ->
 *     400 tratado (NAO 500) - "conta inexistente" e erro do CHAMADOR, mesmo
 *     padrao de /api/transactions;
 *   - qualquer outro erro de `listBills` -> 500 generico em ApiResponse<T>,
 *     sem vazar mensagem/stack do erro original;
 *   - nunca chamar console.*.
 */

const { listBillsMock, AccountNotFoundErrorMock } = vi.hoisted(() => {
  class AccountNotFoundErrorMock extends Error {
    constructor() {
      super("Conta nao encontrada.");
      this.name = "AccountNotFoundError";
    }
  }
  return { listBillsMock: vi.fn(), AccountNotFoundErrorMock };
});

vi.mock("@/lib/bills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bills")>();
  return {
    ...actual,
    listBills: listBillsMock,
    AccountNotFoundError: AccountNotFoundErrorMock,
  };
});

const FORBIDDEN_SUBSTRINGS = [
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
  "node_modules",
];

function getRequest(query = ""): Request {
  return new Request(`http://localhost:3000/api/bills${query}`);
}

function buildBillListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "bill-1",
    pluggyBillId: "pluggy-bill-1",
    accountId: "acc-1",
    accountName: "Cartao Black",
    dueDate: new Date("2026-08-10T00:00:00.000Z").toISOString(),
    totalAmount: "3408.84",
    minimumPaymentAmount: "511.32",
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/bills - validacao Zod do parametro accountId (Criterio de aceite #7)", () => {
  it("sem query params -> 200, chama listBills com os defaults do schema (sem accountId)", async () => {
    listBillsMock.mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/bills/route");
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: [] });
    expect(listBillsMock).toHaveBeenCalledTimes(1);
  });

  it("accountId vazio -> 400 em ApiResponse<T>, sem chamar listBills", async () => {
    const { GET } = await import("@/app/api/bills/route");
    const response = await GET(getRequest("?accountId="));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(listBillsMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/bills - sucesso, filtro repassado de verdade para listBills (Criterio de aceite #7)", () => {
  it("repassa accountId parseado para listBills", async () => {
    listBillsMock.mockResolvedValueOnce([buildBillListItem()]);

    const { GET } = await import("@/app/api/bills/route");
    await GET(getRequest("?accountId=acc-1"));

    expect(listBillsMock).toHaveBeenCalledWith({ accountId: "acc-1" });
  });

  it("responde 200 com ApiResponse<T[]>, sem meta (nao ha paginacao aqui)", async () => {
    const bills = [buildBillListItem()];
    listBillsMock.mockResolvedValueOnce(bills);

    const { GET } = await import("@/app/api/bills/route");
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toBeUndefined();
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    listBillsMock.mockResolvedValueOnce([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { GET } = await import("@/app/api/bills/route");
    await GET(getRequest());

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("GET /api/bills - conta inexistente -> 400 tratado, NAO 500", () => {
  it("quando listBills rejeita com AccountNotFoundError, responde 400 com success:false", async () => {
    listBillsMock.mockRejectedValueOnce(new AccountNotFoundErrorMock());

    const { GET } = await import("@/app/api/bills/route");
    const response = await GET(getRequest("?accountId=conta-que-nao-existe"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });
});

describe("GET /api/bills - erro inesperado (Postgres fora do ar) -> 500 tratado, sem vazar detalhe (caminho de erro)", () => {
  it("responde 500 com success:false quando listBills rejeita com um erro generico", async () => {
    listBillsMock.mockRejectedValueOnce(
      new Error("connection refused (Postgres fora do ar, simulado)"),
    );

    const { GET } = await import("@/app/api/bills/route");
    const response = await GET(getRequest());
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(rawBody).not.toContain("connection refused");
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });

  it("responde 500 mesmo quando listBills rejeita com um valor que nao e instancia de Error", async () => {
    listBillsMock.mockRejectedValueOnce({
      message: "Postgres connection refused",
      code: "ECONNREFUSED",
    });

    const { GET } = await import("@/app/api/bills/route");
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    listBillsMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { GET } = await import("@/app/api/bills/route");
    await GET(getRequest());

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
