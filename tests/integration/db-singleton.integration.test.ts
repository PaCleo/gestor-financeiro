import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes do singleton de Prisma Client em lib/db.ts (Criterio de aceite #4
 * da TASK-001: "Prisma Client exportado como singleton em lib/db.ts, sem
 * esgotar o pool no hot-reload do dev").
 *
 * Usa vi.resetModules() para simular o hot-reload do `next dev`: cada
 * `import("@/lib/db")` apos um reset força uma nova avaliacao do modulo,
 * exatamente como acontece quando o Next.js recarrega um arquivo em modo
 * dev. Uma implementacao ingenua (`export const prisma = new
 * PrismaClient()` sem cache em `globalThis`) criaria uma nova instancia a
 * cada reload e falharia este teste.
 */

afterEach(() => {
  vi.resetModules();
});

describe("lib/db.ts - singleton do Prisma Client", () => {
  it("exporta um client com a API padrao do Prisma (query/connect/disconnect)", async () => {
    const { prisma } = await import("@/lib/db");

    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe("function");
    expect(typeof prisma.$disconnect).toBe("function");
    expect(typeof prisma.$queryRaw).toBe("function");
  });

  it("mantem a mesma instancia entre reimportacoes (nao esgota o pool no hot-reload)", async () => {
    const firstImport = await import("@/lib/db");
    const firstPrismaInstance = firstImport.prisma;

    vi.resetModules();

    const secondImport = await import("@/lib/db");
    const secondPrismaInstance = secondImport.prisma;

    expect(secondPrismaInstance).toBe(firstPrismaInstance);
  });

  it("continua retornando a mesma instancia apos multiplos reloads consecutivos", async () => {
    const instances = [];

    for (let i = 0; i < 3; i += 1) {
      vi.resetModules();
      const mod = await import("@/lib/db");
      instances.push(mod.prisma);
    }

    expect(instances[0]).toBe(instances[1]);
    expect(instances[1]).toBe(instances[2]);
  });
});
