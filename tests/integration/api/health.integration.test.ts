import { describe, expect, it } from "vitest";

/**
 * Teste de integracao ponta a ponta de GET /api/health (Cenario 6 da
 * TASK-001), sem nenhum mock: bate no Postgres real de teste (gestor_test,
 * via docker-compose + .env.test) atraves da rota completa.
 *
 * O caminho "banco inacessivel" (Cenario 7) e validado via mock em
 * tests/unit/api/health-route.test.ts - derrubar o container Postgres
 * compartilhado no meio desta suite quebraria os outros testes de
 * integracao que rodam no mesmo `npm test`.
 */
describe("GET /api/health (integracao real com Postgres)", () => {
  it("responde 200 com { success: true, data: { database: 'ok' } } com o banco de teste no ar", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://localhost:3000/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { database: "ok" },
    });
  });
});
