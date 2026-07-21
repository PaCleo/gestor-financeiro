import { config } from "dotenv";

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
