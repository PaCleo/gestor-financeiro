import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/entries/[id]/route.ts (TASK-009 - Criterio de
 * aceite #3 e #5 da secao 4).
 *
 * `@/lib/entries` e mockada PARCIALMENTE: `manualEntryInputSchema` continua
 * REAL (via `importOriginal`) para a validacao do PATCH acontecer de
 * verdade; `updateManualEntry`/`deleteManualEntry` sao mockadas. A prova de
 * que a distincao MANUAL/PLUGGY acontece de fato por `source` (contra o
 * Postgres real) fica em tests/integration/entries.integration.test.ts -
 * aqui so verificamos que a rota TRADUZ cada erro de dominio para o status
 * HTTP certo.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/api/entries/[id]/route.ts
 *     export async function PATCH(
 *       request: Request,
 *       context: { params: Promise<{ id: string }> },
 *     ): Promise<Response>
 *     export async function DELETE(
 *       request: Request,
 *       context: { params: Promise<{ id: string }> },
 *     ): Promise<Response>
 *
 * PATCH deve:
 *   - obter `id` de `await context.params`;
 *   - parsear o corpo com `manualEntryInputSchema` - invalido -> 400, SEM
 *     chamar `updateManualEntry`;
 *   - corpo valido -> chama `updateManualEntry(id, parsedBody)` e responde
 *     200 com `{ success: true, data: {...} }` reconstruido;
 *   - `ManualEntryNotFoundError` -> 404;
 *   - `EntryAccountNotFoundError` -> 400;
 *   - `EntryAccountConnectedError` -> 400 (prevencao por convencao tambem
 *     vale na edicao, Criterio de aceite #3);
 *   - `ManualEntryNotEditableError` -> 403 (a transacao existe mas
 *     `source=PLUGGY` - dado importado nao se edita a mao, Criterio #5);
 *   - qualquer outro erro -> 500 generico;
 *   - nunca chama console.*.
 *
 * DELETE deve:
 *   - obter `id` de `await context.params`;
 *   - chamar `deleteManualEntry(id)`;
 *   - sucesso -> 200 com `{ success: true, data: { id } }`;
 *   - `ManualEntryNotFoundError` -> 404;
 *   - `ManualEntryNotEditableError` -> 403;
 *   - qualquer outro erro -> 500 generico;
 *   - nunca chama console.*.
 */

const { updateManualEntryMock, deleteManualEntryMock } = vi.hoisted(() => ({
  updateManualEntryMock: vi.fn(),
  deleteManualEntryMock: vi.fn(),
}));

vi.mock("@/lib/entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/entries")>();
  return {
    ...actual,
    updateManualEntry: updateManualEntryMock,
    deleteManualEntry: deleteManualEntryMock,
  };
});

const ENTRY_ID = "entry-cuid-123";

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
    description: "Pix editado",
    method: "PIX",
    category: "Alimentação",
    accountId: "account-cuid-1",
    ...overrides,
  };
}

function buildEntryResult(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    date: new Date("2026-08-10T00:00:00.000Z"),
    description: "Pix editado",
    amount: "-50.00",
    direction: "saida",
    accountId: "account-cuid-1",
    accountName: "Dinheiro",
    method: "PIX",
    category: "Alimentação",
    ...overrides,
  };
}

function patchRequest(body?: unknown): Request {
  return new Request(`http://localhost:3000/api/entries/${ENTRY_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function deleteRequest(): Request {
  return new Request(`http://localhost:3000/api/entries/${ENTRY_ID}`, {
    method: "DELETE",
  });
}

function contextWithId(id: string) {
  return { params: Promise.resolve({ id }) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/entries/[id] - validacao Zod (Criterio de aceite #2)", () => {
  it("corpo invalido (amount <= 0) -> 400, sem chamar updateManualEntry", async () => {
    const { PATCH } = await import("@/app/api/entries/[id]/route");
    const response = await PATCH(
      patchRequest(buildValidPayload({ amount: 0 })),
      contextWithId(ENTRY_ID),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(updateManualEntryMock).not.toHaveBeenCalled();
  });

  it("corpo ausente -> 400, sem chamar updateManualEntry", async () => {
    const { PATCH } = await import("@/app/api/entries/[id]/route");
    const response = await PATCH(patchRequest(), contextWithId(ENTRY_ID));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(updateManualEntryMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/entries/[id] - sucesso", () => {
  it("payload valido -> chama updateManualEntry(id, dados) e responde 200 com ApiResponse<T> reconstruido", async () => {
    updateManualEntryMock.mockResolvedValueOnce(buildEntryResult());

    const { PATCH } = await import("@/app/api/entries/[id]/route");
    const response = await PATCH(
      patchRequest(buildValidPayload()),
      contextWithId(ENTRY_ID),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: ENTRY_ID, description: "Pix editado" });
    expect(updateManualEntryMock).toHaveBeenCalledWith(
      ENTRY_ID,
      expect.objectContaining({ description: "Pix editado" }),
    );
  });
});

describe("PATCH /api/entries/[id] - lancamento inexistente -> 404", () => {
  it("ManualEntryNotFoundError -> 404", async () => {
    const { ManualEntryNotFoundError } = await import("@/lib/entries");
    updateManualEntryMock.mockRejectedValueOnce(new ManualEntryNotFoundError());

    const { PATCH } = await import("@/app/api/entries/[id]/route");
    const response = await PATCH(
      patchRequest(buildValidPayload()),
      contextWithId("id-que-nao-existe"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe("PATCH /api/entries/[id] - prevencao por convencao ao editar (Criterio de aceite #3)", () => {
  it("EntryAccountConnectedError -> 400", async () => {
    const { EntryAccountConnectedError } = await import("@/lib/entries");
    updateManualEntryMock.mockRejectedValueOnce(
      new EntryAccountConnectedError(),
    );

    const { PATCH } = await import("@/app/api/entries/[id]/route");
    const response = await PATCH(
      patchRequest(buildValidPayload()),
      contextWithId(ENTRY_ID),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("EntryAccountNotFoundError -> 400", async () => {
    const { EntryAccountNotFoundError } = await import("@/lib/entries");
    updateManualEntryMock.mockRejectedValueOnce(
      new EntryAccountNotFoundError(),
    );

    const { PATCH } = await import("@/app/api/entries/[id]/route");
    const response = await PATCH(
      patchRequest(buildValidPayload()),
      contextWithId(ENTRY_ID),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

describe("PATCH /api/entries/[id] - transacao PLUGGY nao pode ser editada (Criterio de aceite #5)", () => {
  it("ManualEntryNotEditableError -> 403, mensagem generica", async () => {
    const { ManualEntryNotEditableError } = await import("@/lib/entries");
    updateManualEntryMock.mockRejectedValueOnce(
      new ManualEntryNotEditableError(),
    );

    const { PATCH } = await import("@/app/api/entries/[id]/route");
    const response = await PATCH(
      patchRequest(buildValidPayload()),
      contextWithId(ENTRY_ID),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
  });
});

describe("PATCH /api/entries/[id] - erro inesperado -> 500 tratado, sem vazar detalhe", () => {
  it("responde 500 sem stack trace", async () => {
    const internalError = new Error("connection terminated unexpectedly");
    internalError.stack =
      "Error: connection terminated\n    at Object.<anonymous> (/app/node_modules/pg/lib/client.js:99:20)";
    updateManualEntryMock.mockRejectedValueOnce(internalError);

    const { PATCH } = await import("@/app/api/entries/[id]/route");
    const response = await PATCH(
      patchRequest(buildValidPayload()),
      contextWithId(ENTRY_ID),
    );
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });

  it("nao chama console.log/warn/error", async () => {
    updateManualEntryMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { PATCH } = await import("@/app/api/entries/[id]/route");
    await PATCH(patchRequest(buildValidPayload()), contextWithId(ENTRY_ID));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("DELETE /api/entries/[id] - sucesso", () => {
  it("chama deleteManualEntry com o id do path e responde 200 com ApiResponse<T>", async () => {
    deleteManualEntryMock.mockResolvedValueOnce(undefined);

    const { DELETE } = await import("@/app/api/entries/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(ENTRY_ID));
    const body = await response.json();

    expect(deleteManualEntryMock).toHaveBeenCalledWith(ENTRY_ID);
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { id: ENTRY_ID } });
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    deleteManualEntryMock.mockResolvedValueOnce(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { DELETE } = await import("@/app/api/entries/[id]/route");
    await DELETE(deleteRequest(), contextWithId(ENTRY_ID));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("DELETE /api/entries/[id] - lancamento inexistente -> 404", () => {
  it("ManualEntryNotFoundError -> 404", async () => {
    const { ManualEntryNotFoundError } = await import("@/lib/entries");
    deleteManualEntryMock.mockRejectedValueOnce(new ManualEntryNotFoundError());

    const { DELETE } = await import("@/app/api/entries/[id]/route");
    const response = await DELETE(
      deleteRequest(),
      contextWithId("id-que-nao-existe"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe("DELETE /api/entries/[id] - transacao PLUGGY nao pode ser excluida (Criterio de aceite #5)", () => {
  it("ManualEntryNotEditableError -> 403", async () => {
    const { ManualEntryNotEditableError } = await import("@/lib/entries");
    deleteManualEntryMock.mockRejectedValueOnce(
      new ManualEntryNotEditableError(),
    );

    const { DELETE } = await import("@/app/api/entries/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(ENTRY_ID));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });
});

describe("DELETE /api/entries/[id] - erro inesperado -> 500 tratado, sem vazar detalhe", () => {
  it("responde 500 sem stack trace", async () => {
    const internalError = new Error("connection terminated unexpectedly");
    internalError.stack =
      "Error: connection terminated\n    at Object.<anonymous> (/app/node_modules/pg/lib/client.js:99:20)";
    deleteManualEntryMock.mockRejectedValueOnce(internalError);

    const { DELETE } = await import("@/app/api/entries/[id]/route");
    const response = await DELETE(deleteRequest(), contextWithId(ENTRY_ID));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });

  it("nao chama console.log/warn/error no caminho de erro", async () => {
    deleteManualEntryMock.mockRejectedValueOnce(new Error("boom"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { DELETE } = await import("@/app/api/entries/[id]/route");
    await DELETE(deleteRequest(), contextWithId(ENTRY_ID));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
