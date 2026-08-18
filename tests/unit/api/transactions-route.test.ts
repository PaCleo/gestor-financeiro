import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/transactions/route.ts (TASK-007 - Criterio de
 * aceite #1: "GET /api/transactions (casca fina) com filtros por conta e
 * por periodo, e paginacao; a query vive em lib/ (ex. lib/transactions.ts),
 * validada com Zod nos parametros").
 *
 * `lib/transactions.ts` e mockada inteiramente (`vi.mock("@/lib/transactions",
 * ...)`) - a rota deve ser uma casca fina que so valida os query params com
 * Zod (schema exportado por lib/transactions.ts, reaproveitado aqui - NAO
 * reescrito na rota) e chama `listTransactions`, traduzindo o
 * resultado/erro para `ApiResponse<T>`. A validacao acontece de verdade
 * (schema real, nao mockado) - e o unico jeito de testar o Criterio 1
 * ("validada com Zod") e o ponto de atencao do prompt desta task ("datas
 * invalidas, conta inexistente, limites fora de faixa devem dar 400, nao
 * quebrar").
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim, ver secao 5 do TASK-007.md):
 *
 *   app/api/transactions/route.ts
 *     export async function GET(request: Request): Promise<Response>
 *
 * GET deve:
 *   - construir os query params crus a partir de `new URL(request.url).searchParams`
 *     (`Object.fromEntries(...)`) e parsear com `transactionsQuerySchema`
 *     (`@/lib/transactions`) - formato invalido (data, page, limit, accountId
 *     vazio, periodo invertido) -> 400 em ApiResponse<T>, SEM chamar
 *     `listTransactions`;
 *   - com os parametros validos, chamar `listTransactions(parsed)` e
 *     responder 200 com `{ success: true, data: <transactions>, meta: {
 *     total, page, limit } }` (o `meta` de `lib/api-response.ts` ja existe
 *     para exatamente este formato);
 *   - se `listTransactions` rejeitar com `AccountNotFoundError` (`@/lib/transactions`)
 *     -> 400 tratado (NAO 500) - "conta inexistente" e um erro do
 *     CHAMADOR, nao uma falha interna (ponto de atencao do prompt desta task);
 *   - qualquer outro erro de `listTransactions` -> 500 generico em
 *     ApiResponse<T>, sem vazar mensagem/stack do erro original;
 *   - nunca chamar console.*.
 */

const { listTransactionsMock, AccountNotFoundErrorMock } = vi.hoisted(() => {
  class AccountNotFoundErrorMock extends Error {
    constructor() {
      super("Conta nao encontrada.");
      this.name = "AccountNotFoundError";
    }
  }
  return { listTransactionsMock: vi.fn(), AccountNotFoundErrorMock };
});

vi.mock("@/lib/transactions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/transactions")>();
  return {
    ...actual,
    listTransactions: listTransactionsMock,
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
  return new Request(`http://localhost:3000/api/transactions${query}`);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/transactions - validacao Zod dos parametros (Criterio de aceite #1, ponto de atencao do prompt)", () => {
  it("sem query params -> 200, chama listTransactions com os defaults do schema", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [],
      total: 0,
      page: 1,
      limit: 50,
    });

    const { GET } = await import("@/app/api/transactions/route");
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: [],
      meta: { total: 0, page: 1, limit: 50 },
    });
    expect(listTransactionsMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["startDate invalida", "?startDate=nao-e-uma-data"],
    ["endDate invalida", "?endDate=2026-13-40"],
    ["periodo invertido (startDate > endDate)", "?startDate=2026-08-01&endDate=2026-07-01"],
    ["page zero", "?page=0"],
    ["page negativa", "?page=-1"],
    ["page nao numerica", "?page=abc"],
    ["limit zero", "?limit=0"],
    ["limit acima do maximo", "?limit=99999"],
    ["limit nao numerico", "?limit=abc"],
    ["accountId vazio", "?accountId="],
  ])("%s -> 400 em ApiResponse<T>, sem chamar listTransactions", async (_label, query) => {
    const { GET } = await import("@/app/api/transactions/route");
    const response = await GET(getRequest(query));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(listTransactionsMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/transactions - sucesso, filtros repassados de verdade para listTransactions (Criterio de aceite #1)", () => {
  it("repassa accountId/startDate/endDate/page/limit parseados (ja coagidos para number) para listTransactions", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [],
      total: 0,
      page: 2,
      limit: 10,
    });

    const { GET } = await import("@/app/api/transactions/route");
    await GET(
      getRequest(
        "?accountId=acc-1&startDate=2026-07-01&endDate=2026-07-31&page=2&limit=10",
      ),
    );

    expect(listTransactionsMock).toHaveBeenCalledWith({
      accountId: "acc-1",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      page: 2,
      limit: 10,
    });
  });

  it("responde 200 com ApiResponse<T[]> e meta {total, page, limit}", async () => {
    const transactions = [
      {
        id: "tx-1",
        date: new Date("2026-07-20T12:00:00.000Z").toISOString(),
        description: "Supermercado",
        amount: "-45.90",
        accountId: "acc-1",
        accountName: "Conta Corrente",
        method: "DEBIT",
        status: "POSTED",
        category: "Alimentação",
      },
    ];
    listTransactionsMock.mockResolvedValueOnce({
      transactions,
      total: 1,
      page: 1,
      limit: 50,
    });

    const { GET } = await import("@/app/api/transactions/route");
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ total: 1, page: 1, limit: 50 });
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    listTransactionsMock.mockResolvedValueOnce({
      transactions: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { GET } = await import("@/app/api/transactions/route");
    await GET(getRequest());

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("GET /api/transactions - conta inexistente -> 400 tratado, NAO 500 (ponto de atencao explicito do prompt desta task)", () => {
  it("quando listTransactions rejeita com AccountNotFoundError, responde 400 com success:false (nao 500)", async () => {
    listTransactionsMock.mockRejectedValueOnce(new AccountNotFoundErrorMock());

    const { GET } = await import("@/app/api/transactions/route");
    const response = await GET(getRequest("?accountId=conta-que-nao-existe"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });
});

describe("GET /api/transactions - erro inesperado (Postgres fora do ar) -> 500 tratado, sem vazar detalhe (caminho de erro)", () => {
  it("responde 500 com success:false quando listTransactions rejeita com um erro generico", async () => {
    listTransactionsMock.mockRejectedValueOnce(
      new Error("connection refused (Postgres fora do ar, simulado)"),
    );

    const { GET } = await import("@/app/api/transactions/route");
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

  it("responde 500 mesmo quando listTransactions rejeita com um valor que nao e instancia de Error", async () => {
    listTransactionsMock.mockRejectedValueOnce({
      message: "Postgres connection refused",
      code: "ECONNREFUSED",
    });

    const { GET } = await import("@/app/api/transactions/route");
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    listTransactionsMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { GET } = await import("@/app/api/transactions/route");
    await GET(getRequest());

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
