import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de fail-fast de DATABASE_URL (Criterio de aceite #5 da TASK-002).
 *
 * DADO DATABASE_URL ausente ou string vazia QUANDO a aplicacao tenta obter
 * o client do banco ENTAO falha imediatamente com mensagem explicita
 * citando a variavel faltante.
 *
 * Deliberadamente NAO prescrevemos SE o guard roda no import do modulo
 * (`lib/db.ts` avaliado eager, como hoje) ou so no primeiro uso real do
 * client (design lazy, ex.: Proxy/getter) - isso e decisao do coder. O que
 * importa e o resultado observavel: tentar obter/usar o client sem
 * DATABASE_URL configurada falha de forma clara e citando a variavel,
 * SEM cair silenciosamente nos defaults de libpq (PGHOST/PGUSER locais) e
 * tentar conectar num destino nao intencional - esse era o problema
 * relatado na revisao da TASK-001 (`lib/db.ts:24`).
 *
 * ATENCAO (repetido na secao 5 do TASK-002.md para o coder): se o guard for
 * lancado no escopo top-level do modulo, importar `lib/db.ts` passa a
 * lancar synchronously. Isso pode quebrar `npm run build`, porque o Next
 * pode pre-renderizar/executar `GET /api/health` em build-time se a rota
 * for elegivel para otimizacao estatica (nao usa nenhuma API dinamica do
 * `Request`). Este teste roda via Vitest (import direto do modulo, fora do
 * pipeline de build do Next) e NAO substitui a verificacao manual do
 * Criterio 6 (`npm run build` sem DATABASE_URL no ambiente - ver secao 5).
 */

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

function restoreDatabaseUrl() {
  if (ORIGINAL_DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  }
}

afterEach(() => {
  restoreDatabaseUrl();
  vi.resetModules();
});

/**
 * Simula "a aplicacao tenta obter o client do banco": importa lib/db.ts e,
 * se o import nao lancou (design lazy), tenta efetivamente usar o client
 * com uma query minima. Retorna o erro capturado em qualquer um dos dois
 * pontos, ou `undefined` se nada falhou.
 */
async function attemptToObtainAndUseTheClient(): Promise<unknown> {
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.$queryRaw`SELECT 1`;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("lib/db.ts - fail-fast quando DATABASE_URL nao esta configurada", () => {
  it("falha citando DATABASE_URL na mensagem quando a variavel esta AUSENTE", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();

    const error = await attemptToObtainAndUseTheClient();

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/DATABASE_URL/);
  });

  it("falha citando DATABASE_URL na mensagem quando a variavel e uma STRING VAZIA", async () => {
    process.env.DATABASE_URL = "";
    vi.resetModules();

    const error = await attemptToObtainAndUseTheClient();

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/DATABASE_URL/);
  });
});
