import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Singleton do Prisma Client (Criterio de aceite #4 da TASK-001).
 *
 * Prisma 7 exige um driver adapter explicito para o client em runtime (o
 * datasource `url` do schema.prisma so serve para o Prisma Migrate, via
 * prisma.config.ts). Usamos `@prisma/adapter-pg` apontando para
 * `DATABASE_URL`, seguindo o exemplo oficial gerado no client (ver
 * node_modules/.prisma/client/index.d.ts).
 *
 * Cache em `globalThis` (padrao Next.js oficial) evita esgotar o pool de
 * conexoes a cada hot-reload do `next dev`, onde os modulos sao
 * reavaliados mas o processo Node continua o mesmo.
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
