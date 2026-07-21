import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de app/api/health/route.ts, mockando lib/health.ts para
 * controlar deterministicamente os dois caminhos de resposta (Criterio de
 * aceite #6 e Cenarios 6/7 da TASK-001):
 *
 *   - DADO a aplicacao rodando QUANDO chamo GET /api/health
 *     ENTAO recebo 200 com { success: true, data: { database: "ok" } }
 *   - DADO o banco inacessivel QUANDO chamo GET /api/health
 *     ENTAO recebo 503 com success: false e uma mensagem que NAO vaza a
 *     connection string, credenciais nem stack trace
 *
 * A rota deve ser uma casca fina: toda a logica de conectividade vem de
 * `checkDatabaseConnection` (lib/health.ts), mockada aqui.
 */

const { checkDatabaseConnectionMock } = vi.hoisted(() => ({
  checkDatabaseConnectionMock: vi.fn(),
}));

vi.mock("@/lib/health", () => ({
  checkDatabaseConnection: checkDatabaseConnectionMock,
}));

const FORBIDDEN_SUBSTRINGS = [
  "postgresql://",
  "postgres://",
  "DATABASE_URL",
  "S3cr3tPass",
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
];

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("responde 200 com ApiResponse<{ database: 'ok' }> quando o banco esta ok", async () => {
    checkDatabaseConnectionMock.mockResolvedValueOnce(true);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://localhost:3000/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { database: "ok" },
    });
  });

  it("responde 503 com success:false quando o banco esta inacessivel", async () => {
    checkDatabaseConnectionMock.mockResolvedValueOnce(false);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://localhost:3000/api/health"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("a resposta de erro 503 nunca vaza connection string, credenciais ou stack trace", async () => {
    checkDatabaseConnectionMock.mockResolvedValueOnce(false);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://localhost:3000/api/health"));
    const rawBody = await response.text();

    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });

  it("responde 503 sem vazar detalhes mesmo se checkDatabaseConnection lancar uma excecao inesperada", async () => {
    checkDatabaseConnectionMock.mockRejectedValueOnce(
      new Error(
        'Connection refused at postgresql://postgres:S3cr3tPass@localhost:5432/gestor',
      ),
    );

    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://localhost:3000/api/health"));
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(rawBody).not.toContain(forbidden);
    }
  });
});
