import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Singleton *lazy* do Prisma Client.
 *
 * TASK-001 (Criterio de aceite #4): cache em `globalThis` (padrao Next.js
 * oficial) evita esgotar o pool de conexoes a cada hot-reload do
 * `next dev`, onde os modulos sao reavaliados mas o processo Node continua
 * o mesmo.
 *
 * TASK-002 (Criterios de aceite #5 e #6): Prisma 7 exige um driver adapter
 * explicito para o client em runtime (o datasource `url` do schema.prisma
 * so serve para o Prisma Migrate, via prisma.config.ts) - usamos
 * `@prisma/adapter-pg` apontando para `DATABASE_URL`. Se essa variavel
 * estiver ausente ou vazia, queremos falhar alto com uma mensagem clara em
 * vez de deixar o `pg` tentar os defaults de libpq (PGHOST/PGUSER locais) e
 * falhar de forma confusa (`SASL: SCRAM-SERVER-FIRST-MESSAGE: client
 * password must be a string`, confirmado empiricamente).
 *
 * Essa validacao PRECISA ser preguicosa (lazy): `next build` executa o
 * modulo `lib/db.ts` na fase de "collect page data" mesmo sem nenhuma
 * requisicao real acontecer (confirmado empiricamente pelo qa: um `throw`
 * incondicional dentro de `createPrismaClient()` quebra `npm run build`
 * mesmo sem `DATABASE_URL` nunca ser efetivamente necessaria em build-time).
 * Por isso o client real so e criado (e a variavel so e validada) no
 * primeiro acesso a uma propriedade/metodo de `prisma`, via `Proxy` - o
 * `import` do modulo em si nunca lanca.
 */

function assertDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL nao esta configurada (ausente ou vazia). Defina essa " +
        "variavel de ambiente antes de acessar o banco de dados - veja " +
        ".env.example.",
    );
  }
  return databaseUrl;
}

let realClient: PrismaClient | undefined;

/** Cria (uma unica vez) o PrismaClient real, validando DATABASE_URL antes. */
function getRealClient(): PrismaClient {
  if (!realClient) {
    const adapter = new PrismaPg({ connectionString: assertDatabaseUrl() });
    realClient = new PrismaClient({ adapter });
  }
  return realClient;
}

/**
 * Proxy que adia a criacao/validacao do client real ate o primeiro acesso a
 * uma propriedade (`prisma.$queryRaw`, `prisma.bankItem`, etc.) - o objeto
 * em si e leve e nunca lanca so por ser importado/criado.
 */
function createLazyPrismaClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      const client = getRealClient();
      const value = Reflect.get(client as object, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
    has(_target, prop) {
      return Reflect.has(getRealClient() as object, prop);
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createLazyPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
