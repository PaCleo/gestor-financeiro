import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/items/[id]/route.ts (TASK-005 - Criterio de
 * aceite #2).
 *
 * `lib/bank-item.ts` e mockada inteiramente (`vi.mock("@/lib/bank-item",
 * ...)`) - a rota deve ser uma casca fina que so le o `id` do path
 * (`params`, que nesta versao do Next e uma Promise - ver
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md,
 * secao "Dynamic Route Segments") e chama `archiveBankItem`, traduzindo o
 * resultado/erro para `ApiResponse<T>`.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/api/items/[id]/route.ts
 *     export async function DELETE(
 *       request: Request,
 *       context: { params: Promise<{ id: string }> },
 *     ): Promise<Response>
 *
 * DELETE deve:
 *   - obter `id` de `await context.params`;
 *   - chamar `archiveBankItem(id)` de `lib/bank-item.ts`;
 *   - sucesso -> 200 com `{ success: true, data: { id, pluggyItemId,
 *     archivedAt } }`, reconstruido campo a campo (nunca `data: result` cru);
 *   - `BankItemNotFoundError` -> 404 em ApiResponse<T>, mensagem generica;
 *   - qualquer outro erro (falha da Pluggy traduzida por
 *     `archiveBankItem`/`deleteItemFromPluggy`, ou algo inesperado - a
 *     rota nao confia cegamente no tipo, mesmo padrao de
 *     app/api/items/route.ts da TASK-004) -> 500 em ApiResponse<T>, sem
 *     vazar stack/detalhe do erro original;
 *   - nunca chamar console.*.
 */

const { archiveBankItemMock, BankItemNotFoundErrorMock } = vi.hoisted(() => {
  class BankItemNotFoundErrorMock extends Error {}
  return {
    archiveBankItemMock: vi.fn(),
    BankItemNotFoundErrorMock,
  };
});

vi.mock("@/lib/bank-item", () => ({
  archiveBankItem: archiveBankItemMock,
  BankItemNotFoundError: BankItemNotFoundErrorMock,
}));

const BANK_ITEM_ID = "bankitem-cuid-123";
const PLUGGY_ITEM_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

// CPF fabricado para teste - formato valido, NUNCA um CPF real. So existe
// para provar que a checagem de substrings abaixo tem poder de deteccao
// real (licao do DT-011).
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

function buildArchivedBankItem(overrides: Record<string, unknown> = {}) {
  return {
    id: BANK_ITEM_ID,
    pluggyItemId: PLUGGY_ITEM_ID,
    archivedAt: new Date("2026-07-22T10:00:00.000Z"),
    ...overrides,
  };
}

function deleteRequest(): Request {
  return new Request(`http://localhost:3000/api/items/${BANK_ITEM_ID}`, {
    method: "DELETE",
  });
}

function contextWithId(id: string) {
  return { params: Promise.resolve({ id }) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/items/[id] - sucesso (Criterio de aceite #2)", () => {
  it("chama archiveBankItem com o id do path e responde 200 com ApiResponse<T> reconstruido", async () => {
    archiveBankItemMock.mockResolvedValueOnce(buildArchivedBankItem());

    const { DELETE } = await import("@/app/api/items/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(BANK_ITEM_ID));
    const body = await response.json();

    expect(archiveBankItemMock).toHaveBeenCalledTimes(1);
    expect(archiveBankItemMock).toHaveBeenCalledWith(BANK_ITEM_ID);
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(BANK_ITEM_ID);
    expect(body.data.pluggyItemId).toBe(PLUGGY_ITEM_ID);
    expect(typeof body.data.archivedAt).toBe("string");
    expect(new Date(body.data.archivedAt).toISOString()).toBe(
      body.data.archivedAt,
    );
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    archiveBankItemMock.mockResolvedValueOnce(buildArchivedBankItem());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { DELETE } = await import("@/app/api/items/[id]/route");
    await DELETE(deleteRequest(), contextWithId(BANK_ITEM_ID));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("DELETE /api/items/[id] - BankItem inexistente -> 404", () => {
  it("responde 404 com ApiResponse<T> quando archiveBankItem rejeita com BankItemNotFoundError", async () => {
    archiveBankItemMock.mockRejectedValueOnce(
      new BankItemNotFoundErrorMock("Banco nao encontrado"),
    );

    const { DELETE } = await import("@/app/api/items/[id]/route");
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

describe("DELETE /api/items/[id] - falha ao desativar (Pluggy indisponivel ou erro inesperado) -> tratada, sem vazar detalhe", () => {
  it("responde 500 com success:false quando archiveBankItem rejeita com um erro generico (Pluggy fora do ar, simulado)", async () => {
    const sdkError = new Error("connect ETIMEDOUT 200.1.2.3:443");
    sdkError.stack =
      "Error: connect ETIMEDOUT\n    at Object.<anonymous> (/app/node_modules/pluggy-sdk/dist/baseApi.js:99:20)";
    archiveBankItemMock.mockRejectedValueOnce(sdkError);

    const { DELETE } = await import("@/app/api/items/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(BANK_ITEM_ID));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(rawBody).not.toContain("ETIMEDOUT");
    expect(rawBody).not.toContain(".ts:");
    expect(rawBody).not.toContain(".js:");
  });

  it("responde 500 tratado mesmo quando archiveBankItem rejeita com um valor que nao e instancia de Error", async () => {
    archiveBankItemMock.mockRejectedValueOnce({
      message: "Forbidden",
      statusCode: 403,
    });

    const { DELETE } = await import("@/app/api/items/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(BANK_ITEM_ID));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    archiveBankItemMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { DELETE } = await import("@/app/api/items/[id]/route");
    await DELETE(deleteRequest(), contextWithId(BANK_ITEM_ID));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("DELETE /api/items/[id] - defesa contra vazamento de PII (camada da rota)", () => {
  it("mesmo que archiveBankItem resolva com um campo extra parecido com PII, a resposta HTTP nao o contem", async () => {
    archiveBankItemMock.mockResolvedValueOnce(
      buildArchivedBankItem({ taxNumber: FAKE_CPF }),
    );

    const { DELETE } = await import("@/app/api/items/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(BANK_ITEM_ID));
    const rawBody = await response.text();

    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });
});
