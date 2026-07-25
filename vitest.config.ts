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
    // Ambiente padrao continua "node" - os 159 testes existentes (unitarios
    // de lib/, rotas de API e integracao contra o Postgres real) dependem
    // disso e NAO usam DOM. A TASK-005 e a primeira com componentes React:
    // em vez de mudar o ambiente global (o que forcaria jsdom sobre toda a
    // suite, incluindo os testes de integracao que batem no Postgres),
    // cada arquivo de teste de componente declara seu proprio ambiente via
    // o docblock `/** @vitest-environment jsdom */` no topo do arquivo -
    // recurso nativo do Vitest (ver
    // node_modules/vitest/dist/chunks/cli-api.*.js, funcao
    // `detectCodeBlock`), resolvido por arquivo, sem afetar nenhum outro.
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
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
      // TASK-005: adiciona os componentes/paginas React desta task
      // (contrato da secao 5 do TASK-005.md) ao escopo de cobertura, ao
      // lado de lib/ e das API routes ja cobertas desde a TASK-001.
      include: [
        "lib/**/*.ts",
        "app/api/**/route.ts",
        "app/bancos/**/*.tsx",
        "components/**/*.tsx",
      ],
      exclude: ["**/*.d.ts", "**/*.test.ts", "**/*.test.tsx"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
