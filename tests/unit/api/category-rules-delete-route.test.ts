import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/category-rules/[id]/route.ts (TASK-008 -
 * Criterio de aceite #4).
 *
 * `@/lib/category-rules` e mockada inteiramente (mesmo padrao de
 * app/api/items/[id]/route.ts, TASK-005) - a rota deve ser uma casca fina
 * que le o `id` do path (`params` e uma Promise nesta versao do Next) e
 * chama `deleteCategoryRule`, traduzindo para `ApiResponse<T>`.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/api/category-rules/[id]/route.ts
 *     export async function DELETE(
 *       request: Request,
 *       context: { params: Promise<{ id: string }> },
 *     ): Promise<Response>
 *
 * DELETE deve:
 *   - obter `id` de `await context.params`;
 *   - chamar `deleteCategoryRule(id)`;
 *   - sucesso -> 200 com `{ success: true, data: { id } }`;
 *   - `CategoryRuleNotFoundError` -> 404 em ApiResponse<T>, mensagem generica;
 *   - qualquer outro erro -> 500 em ApiResponse<T>, sem vazar stack/detalhe;
 *   - nunca chamar console.*.
 */

const { deleteCategoryRuleMock, CategoryRuleNotFoundErrorMock } = vi.hoisted(
  () => {
    class CategoryRuleNotFoundErrorMock extends Error {}
    return {
      deleteCategoryRuleMock: vi.fn(),
      CategoryRuleNotFoundErrorMock,
    };
  },
);

vi.mock("@/lib/category-rules", () => ({
  deleteCategoryRule: deleteCategoryRuleMock,
  CategoryRuleNotFoundError: CategoryRuleNotFoundErrorMock,
}));

const RULE_ID = "rule-cuid-123";

const FORBIDDEN_SUBSTRINGS = [
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
  "node_modules",
];

function deleteRequest(): Request {
  return new Request(`http://localhost:3000/api/category-rules/${RULE_ID}`, {
    method: "DELETE",
  });
}

function contextWithId(id: string) {
  return { params: Promise.resolve({ id }) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/category-rules/[id] - sucesso (Criterio de aceite #4)", () => {
  it("chama deleteCategoryRule com o id do path e responde 200 com ApiResponse<T>", async () => {
    deleteCategoryRuleMock.mockResolvedValueOnce(undefined);

    const { DELETE } = await import("@/app/api/category-rules/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(RULE_ID));
    const body = await response.json();

    expect(deleteCategoryRuleMock).toHaveBeenCalledTimes(1);
    expect(deleteCategoryRuleMock).toHaveBeenCalledWith(RULE_ID);
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { id: RULE_ID } });
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    deleteCategoryRuleMock.mockResolvedValueOnce(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { DELETE } = await import("@/app/api/category-rules/[id]/route");
    await DELETE(deleteRequest(), contextWithId(RULE_ID));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("DELETE /api/category-rules/[id] - regra inexistente -> 404", () => {
  it("responde 404 com ApiResponse<T> quando deleteCategoryRule rejeita com CategoryRuleNotFoundError", async () => {
    deleteCategoryRuleMock.mockRejectedValueOnce(
      new CategoryRuleNotFoundErrorMock("Regra nao encontrada."),
    );

    const { DELETE } = await import("@/app/api/category-rules/[id]/route");
    const response = await DELETE(
      deleteRequest(),
      contextWithId("id-que-nao-existe"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });
});

describe("DELETE /api/category-rules/[id] - erro inesperado -> tratado, sem vazar detalhe", () => {
  it("responde 500 com success:false quando deleteCategoryRule rejeita com um erro generico", async () => {
    const internalError = new Error("connection terminated unexpectedly");
    internalError.stack =
      "Error: connection terminated\n    at Object.<anonymous> (/app/node_modules/pg/lib/client.js:99:20)";
    deleteCategoryRuleMock.mockRejectedValueOnce(internalError);

    const { DELETE } = await import("@/app/api/category-rules/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(RULE_ID));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
    expect(rawBody).not.toContain("connection terminated");
  });

  it("responde 500 tratado mesmo quando deleteCategoryRule rejeita com um valor que nao e instancia de Error", async () => {
    deleteCategoryRuleMock.mockRejectedValueOnce({
      message: "Forbidden",
      statusCode: 403,
    });

    const { DELETE } = await import("@/app/api/category-rules/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(RULE_ID));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    deleteCategoryRuleMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { DELETE } = await import("@/app/api/category-rules/[id]/route");
    await DELETE(deleteRequest(), contextWithId(RULE_ID));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
