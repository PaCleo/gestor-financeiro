import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";

/**
 * Vitest globalSetup: roda UMA vez antes de toda a suite.
 *
 * Responsabilidade: garantir que o schema Prisma esteja aplicado no
 * database de teste (gestor_test) antes dos testes de integracao rodarem,
 * apontando explicitamente para DATABASE_URL do .env.test (nunca para o
 * banco de desenvolvimento).
 *
 * Tolerante a ausencia de `prisma/schema.prisma` / `prisma.config.ts`:
 * nesta fase (RED, antes da task do coder) eles ainda nao existem, e essa
 * funcao deve deixar os testes falharem com um erro claro de "modulo/tabela
 * nao encontrada", em vez de abortar a run inteira do Vitest com um erro
 * generico de setup.
 */
export default async function globalSetup() {
  config({ path: path.resolve(process.cwd(), ".env.test") });

  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const configPath = path.resolve(process.cwd(), "prisma.config.ts");

  if (!existsSync(schemaPath) || !existsSync(configPath)) {
    console.warn(
      "[tests/setup/global-setup] prisma/schema.prisma ou prisma.config.ts " +
        "ainda nao existem - pulando `prisma migrate deploy`. Os testes de " +
        "integracao devem falhar agora por falta de implementacao (RED " +
        "esperado); isso e normal antes da task do coder.",
    );
    return;
  }

  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: "inherit",
    });
  } catch (error) {
    console.warn(
      "[tests/setup/global-setup] `prisma migrate deploy` falhou contra o " +
        "database de teste. Os testes de integracao devem falhar com o " +
        "motivo real (ex.: schema invalido). Erro original:",
      error instanceof Error ? error.message : error,
    );
  }
}
