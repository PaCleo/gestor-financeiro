import { prisma } from "@/lib/db";

/**
 * Verifica conectividade com o banco (Criterio de aceite #6 da TASK-001).
 *
 * Nunca relanca o erro: qualquer falha (credenciais invalidas, timeout,
 * connection string inacessivel) vira `false`. Essa e a garantia
 * estrutural de que a rota /api/health jamais recebe (e portanto jamais
 * pode vazar) a connection string, credenciais ou stack trace real do
 * Postgres - o erro morre aqui dentro.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
