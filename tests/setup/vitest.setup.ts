import { config } from "dotenv";
// TASK-005: registra os matchers de `@testing-library/jest-dom`
// (`toBeInTheDocument`, `toBeDisabled`, etc.) em `expect` para os testes de
// componente (ambiente jsdom, via docblock `@vitest-environment jsdom` no
// topo de cada arquivo - ver vitest.config.ts). Import seguro para rodar em
// TODOS os arquivos, incluindo os 159 testes de ambiente "node": o modulo
// so chama `expect.extend(matchers)` na importacao, nao toca em `document`/
// `window` - nenhum teste de ambiente node invoca esses matchers, entao o
// import e um no-op inofensivo para eles.
import "@testing-library/jest-dom/vitest";

// Carrega .env.test ANTES de qualquer teste importar lib/db (ou qualquer
// outro modulo que leia process.env.DATABASE_URL na inicializacao).
// dotenv nao sobrescreve variaveis ja definidas no processo, entao rodar
// `npm test` via `dotenv -e .env.test -- vitest run` continua funcionando
// (este load aqui e apenas um fallback para quem rodar `vitest` direto).
config({ path: ".env.test" });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL nao definida para a suite de testes. Rode `docker compose up -d` " +
      "e confirme que .env.test existe na raiz do projeto.",
  );
}
