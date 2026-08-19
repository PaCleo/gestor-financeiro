import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/dashboard/route.ts (TASK-010 - Criterio de
 * aceite #6: "GET /api/dashboard?month=YYYY-MM casca fina, Zod (mes
 * invalido -> 400)").
 *
 * `lib/dashboard.ts` e mockada PARCIALMENTE (`vi.mock("@/lib/dashboard",
 * ...)` com `importOriginal`) - o schema `monthQuerySchema` (Zod real) e
 * reaproveitado pela rota tal-e-qual (nao reescrito ali), so
 * `getMonthlySummary` e mockada. Mesmo padrao de
 * tests/unit/api/transactions-route.test.ts (TASK-007).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/api/dashboard/route.ts
 *     export async function GET(request: Request): Promise<Response>
 *
 * GET deve:
 *   - construir os query params crus a partir de `new URL(request.url).searchParams`
 *     (`Object.fromEntries(...)`) e parsear com `monthQuerySchema`
 *     (`@/lib/dashboard`) - `month` ausente ou malformado (13, "2026-1",
 *     vazio, com dia incluido, etc.) -> 400 em ApiResponse<T>, SEM chamar
 *     `getMonthlySummary`;
 *   - com `month` valido, chamar `getMonthlySummary(parsed.data.month)` e
 *     responder 200 com `{ success: true, data: <MonthlySummary> }` (sem
 *     `meta` - o resumo mensal ja carrega tudo, nao ha paginacao aqui,
 *     diferente de /api/transactions);
 *   - qualquer erro de `getMonthlySummary` -> 500 generico em ApiResponse<T>,
 *     sem vazar mensagem/stack do erro original (mesma defesa de
 *     /api/transactions);
 *   - nunca chamar console.*.
 */

const { getMonthlySummaryMock } = vi.hoisted(() => ({
  getMonthlySummaryMock: vi.fn(),
}));

vi.mock("@/lib/dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboard")>();
  return {
    ...actual,
    getMonthlySummary: getMonthlySummaryMock,
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
  return new Request(`http://localhost:3000/api/dashboard${query}`);
}

function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    month: "2026-07",
    receita: "1500.00",
    despesa: "938.83",
    saldo: "561.17",
    porCategoria: [{ category: "Housing", total: "800.00" }],
    transferenciasExcluidas: { count: 4, total: "4800.00" },
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/dashboard - validacao Zod do parametro 'month' (Criterio de aceite #6)", () => {
  it.each([
    ["ausente (sem query string nenhuma)", ""],
    ["vazio", "?month="],
    ["mes 13 (acima do maximo)", "?month=2026-13"],
    ["mes 00 (abaixo do minimo)", "?month=2026-00"],
    ["mes sem zero-padding", "?month=2026-1"],
    ["so o numero 13, sem ano", "?month=13"],
    ["separador errado (barra)", "?month=2026/07"],
    ["com dia incluido (formato de data, nao de mes)", "?month=2026-07-01"],
    ["texto arbitrario", "?month=nao-e-um-mes"],
  ])("%s -> 400 em ApiResponse<T>, sem chamar getMonthlySummary", async (_label, query) => {
    const { GET } = await import("@/app/api/dashboard/route");
    const response = await GET(getRequest(query));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(getMonthlySummaryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/dashboard - sucesso, month repassado de verdade para getMonthlySummary (Criterio de aceite #6)", () => {
  it("com ?month=2026-07 valido, chama getMonthlySummary('2026-07') exatamente uma vez", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary());

    const { GET } = await import("@/app/api/dashboard/route");
    await GET(getRequest("?month=2026-07"));

    expect(getMonthlySummaryMock).toHaveBeenCalledTimes(1);
    expect(getMonthlySummaryMock).toHaveBeenCalledWith("2026-07");
  });

  it("responde 200 com ApiResponse<MonthlySummary> - o corpo inteiro do resumo, sem alteracao", async () => {
    const summary = buildSummary({
      porCategoria: [
        { category: "Housing", total: "800.00" },
        { category: "Online shopping", total: "138.83" },
      ],
    });
    getMonthlySummaryMock.mockResolvedValueOnce(summary);

    const { GET } = await import("@/app/api/dashboard/route");
    const response = await GET(getRequest("?month=2026-07"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: summary });
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    getMonthlySummaryMock.mockResolvedValueOnce(buildSummary());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { GET } = await import("@/app/api/dashboard/route");
    await GET(getRequest("?month=2026-07"));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("GET /api/dashboard - erro inesperado (Postgres fora do ar, ou Item LOGIN_ERROR/OUTDATED refletido em falha de leitura) -> 500 tratado, sem vazar detalhe", () => {
  it("responde 500 com success:false quando getMonthlySummary rejeita com um erro generico", async () => {
    getMonthlySummaryMock.mockRejectedValueOnce(
      new Error("connection refused (Postgres fora do ar, simulado)"),
    );

    const { GET } = await import("@/app/api/dashboard/route");
    const response = await GET(getRequest("?month=2026-07"));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(rawBody).not.toContain("connection refused");
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });

  it("responde 500 mesmo quando getMonthlySummary rejeita com um valor que nao e instancia de Error", async () => {
    getMonthlySummaryMock.mockRejectedValueOnce({
      message: "Postgres connection refused",
      code: "ECONNREFUSED",
    });

    const { GET } = await import("@/app/api/dashboard/route");
    const response = await GET(getRequest("?month=2026-07"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    getMonthlySummaryMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { GET } = await import("@/app/api/dashboard/route");
    await GET(getRequest("?month=2026-07"));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
