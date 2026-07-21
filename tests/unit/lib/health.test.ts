import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de lib/health.ts (Criterio de aceite #6 da TASK-001:
 * "a verificacao de conectividade vive em lib/").
 *
 * Contrato esperado (definido aqui pelo qa, o coder deve implementar
 * exatamente esta assinatura):
 *
 *   export async function checkDatabaseConnection(): Promise<boolean>
 *
 * A funcao NUNCA deve rejeitar/lancar - qualquer falha de conexao vira
 * `false`. Isso é o que garante estruturalmente que a rota /api/health
 * jamais recebe (e portanto jamais pode vazar) a connection string,
 * credenciais ou stack trace do erro real do Postgres: o erro morre dentro
 * de checkDatabaseConnection.
 *
 * `lib/db.ts` é mockado para nao depender de um Postgres real neste teste
 * (é unitario, nao de integracao).
 */

const { queryRawMock } = vi.hoisted(() => ({ queryRawMock: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("checkDatabaseConnection", () => {
  it("resolve true quando a query de verificacao (SELECT 1) e bem-sucedida", async () => {
    queryRawMock.mockResolvedValueOnce([{ "?column?": 1 }]);

    const { checkDatabaseConnection } = await import("@/lib/health");

    await expect(checkDatabaseConnection()).resolves.toBe(true);
  });

  it("resolve false (sem lancar) quando a query falha com um erro contendo credenciais", async () => {
    queryRawMock.mockRejectedValueOnce(
      new Error(
        'Can\'t reach database server at `postgresql://postgres:S3cr3tPass@localhost:5432/gestor`',
      ),
    );

    const { checkDatabaseConnection } = await import("@/lib/health");

    await expect(checkDatabaseConnection()).resolves.toBe(false);
  });

  it("resolve false (sem lancar) quando a query falha com um erro sem mensagem (ex.: timeout)", async () => {
    queryRawMock.mockRejectedValueOnce(new Error());

    const { checkDatabaseConnection } = await import("@/lib/health");

    await expect(checkDatabaseConnection()).resolves.toBe(false);
  });
});
