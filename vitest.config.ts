import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/vitest.setup.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
    // Testes de integracao batem no Postgres real via Docker; precisam de
    // mais tempo que os 5s padrao do Vitest, principalmente na primeira
    // conexao/migration.
    testTimeout: 15000,
    hookTimeout: 30000,
    // Testes de integracao mexem no mesmo banco compartilhado (limpo entre
    // testes em beforeEach/afterEach) - rodar arquivos em serie evita
    // condicoes de corrida entre suites diferentes.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["lib/**/*.ts", "app/api/**/route.ts"],
      exclude: ["**/*.d.ts", "**/*.test.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
