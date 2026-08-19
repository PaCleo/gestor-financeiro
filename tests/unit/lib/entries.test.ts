import { describe, expect, it } from "vitest";

/**
 * Testes unitarios PUROS (sem I/O, sem Prisma) de `lib/entries.ts` (TASK-009
 * - Lancamentos manuais + conta Dinheiro, primeira task da Fase 3). Cobre so
 * a validacao Zod do corpo de `POST /api/entries` / `PATCH /api/entries/[id]`
 * - Criterio de aceite #2 da secao 4 do TASK-009.md.
 *
 * As funcoes que tocam o Prisma (`ensureCashAccount`, `createManualEntry`,
 * `updateManualEntry`, `deleteManualEntry`, `listManualEntries`,
 * `listManualAccounts`) sao testadas contra o Postgres REAL em
 * tests/integration/entries.integration.test.ts (mesmo padrao de
 * lib/transactions.ts: schema Zod puro aqui, tudo que bate no banco la -
 * DT-004, `vi.spyOn(prisma, ...)` e engolido pelo Proxy de `lib/db.ts`).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim; ver o contrato completo, com todas as funcoes de I/O,
 * no topo de tests/integration/entries.integration.test.ts):
 *
 *   lib/entries.ts
 *     export const ENTRY_METHODS = ["PIX", "TED", "DEBIT", "CREDIT", "CASH"] as const;
 *     export type EntryMethod = (typeof ENTRY_METHODS)[number];
 *
 *     export const ENTRY_DIRECTIONS = ["entrada", "saida"] as const;
 *     export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];
 *
 *     export const manualEntryInputSchema = z.object({
 *       amount: z.number().positive(),
 *       direction: z.enum(ENTRY_DIRECTIONS),
 *       date: z.iso.date(),           // "YYYY-MM-DD", mesmo formato de
 *                                      // lib/transactions.ts
 *       description: z.string().min(1),
 *       method: z.enum(ENTRY_METHODS),
 *       category: z.string().min(1).optional(),
 *       accountId: z.string().min(1),
 *     });
 *     export type ManualEntryInput = z.infer<typeof manualEntryInputSchema>;
 *
 * Reaproveitado, sem alteracao, pelo PATCH (edicao substitui o lancamento
 * inteiro - nao ha um schema "parcial" separado).
 */

describe("manualEntryInputSchema - payload valido (Criterio de aceite #2)", () => {
  it("aceita um payload completo com todos os campos, incluindo category opcional", async () => {
    const { manualEntryInputSchema } = await import("@/lib/entries");

    const result = manualEntryInputSchema.safeParse({
      amount: 123.45,
      direction: "saida",
      date: "2026-08-10",
      description: "Pix para o mercado",
      method: "PIX",
      category: "Alimentação",
      accountId: "account-cuid-1",
    });

    expect(result.success).toBe(true);
  });

  it("aceita um payload sem category (campo opcional)", async () => {
    const { manualEntryInputSchema } = await import("@/lib/entries");

    const result = manualEntryInputSchema.safeParse({
      amount: 50,
      direction: "entrada",
      date: "2026-08-10",
      description: "Dinheiro recebido",
      method: "CASH",
      accountId: "account-cuid-1",
    });

    expect(result.success).toBe(true);
  });
});

describe("manualEntryInputSchema - valor invalido (Criterio de aceite #2 e #6 do prompt: valor <= 0)", () => {
  it.each([
    ["zero", 0],
    ["negativo", -10],
  ])("amount %s -> invalido", (_label, amount) => {
    return import("@/lib/entries").then(({ manualEntryInputSchema }) => {
      const result = manualEntryInputSchema.safeParse({
        amount,
        direction: "saida",
        date: "2026-08-10",
        description: "Teste",
        method: "PIX",
        accountId: "account-cuid-1",
      });
      expect(result.success).toBe(false);
    });
  });

  it("amount ausente -> invalido", async () => {
    const { manualEntryInputSchema } = await import("@/lib/entries");
    const result = manualEntryInputSchema.safeParse({
      direction: "saida",
      date: "2026-08-10",
      description: "Teste",
      method: "PIX",
      accountId: "account-cuid-1",
    });
    expect(result.success).toBe(false);
  });

  it("amount nao-numerico (string) -> invalido", async () => {
    const { manualEntryInputSchema } = await import("@/lib/entries");
    const result = manualEntryInputSchema.safeParse({
      amount: "123.45",
      direction: "saida",
      date: "2026-08-10",
      description: "Teste",
      method: "PIX",
      accountId: "account-cuid-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("manualEntryInputSchema - data invalida (Criterio de aceite #2 e #6 do prompt)", () => {
  it.each([
    ["calendario inexistente (30 de fevereiro)", "2026-02-30"],
    ["mes invalido", "2026-13-01"],
    ["formato com horario embutido", "2026-08-10T00:00:00.000Z"],
    ["nao e uma data", "isso-nao-e-uma-data"],
    ["string vazia", ""],
  ])("date '%s' -> invalido", (_label, date) => {
    return import("@/lib/entries").then(({ manualEntryInputSchema }) => {
      const result = manualEntryInputSchema.safeParse({
        amount: 10,
        direction: "saida",
        date,
        description: "Teste",
        method: "PIX",
        accountId: "account-cuid-1",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("manualEntryInputSchema - descricao vazia (Criterio de aceite #2 e #6 do prompt)", () => {
  it("description vazia -> invalido", async () => {
    const { manualEntryInputSchema } = await import("@/lib/entries");
    const result = manualEntryInputSchema.safeParse({
      amount: 10,
      direction: "saida",
      date: "2026-08-10",
      description: "",
      method: "PIX",
      accountId: "account-cuid-1",
    });
    expect(result.success).toBe(false);
  });

  it("description ausente -> invalido", async () => {
    const { manualEntryInputSchema } = await import("@/lib/entries");
    const result = manualEntryInputSchema.safeParse({
      amount: 10,
      direction: "saida",
      date: "2026-08-10",
      method: "PIX",
      accountId: "account-cuid-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("manualEntryInputSchema - method fora do conjunto permitido (Criterio de aceite #2 e #6 do prompt)", () => {
  it.each(["BOLETO", "OTHER", "pix", "", "qualquer-coisa"])(
    "method '%s' -> invalido (fora de PIX/TED/DEBIT/CREDIT/CASH)",
    (method) => {
      return import("@/lib/entries").then(({ manualEntryInputSchema }) => {
        const result = manualEntryInputSchema.safeParse({
          amount: 10,
          direction: "saida",
          date: "2026-08-10",
          description: "Teste",
          method,
          accountId: "account-cuid-1",
        });
        expect(result.success).toBe(false);
      });
    },
  );

  it.each(["PIX", "TED", "DEBIT", "CREDIT", "CASH"])(
    "method '%s' -> valido",
    (method) => {
      return import("@/lib/entries").then(({ manualEntryInputSchema }) => {
        const result = manualEntryInputSchema.safeParse({
          amount: 10,
          direction: "saida",
          date: "2026-08-10",
          description: "Teste",
          method,
          accountId: "account-cuid-1",
        });
        expect(result.success).toBe(true);
      });
    },
  );
});

describe("manualEntryInputSchema - direction invalida (Criterio de aceite #2 e #4, e #6 do prompt)", () => {
  it.each(["saída", "SAIDA", "entrada ", "debito", "credito", ""])(
    "direction '%s' -> invalido (so 'entrada'/'saida' em minusculo, sem acento)",
    (direction) => {
      return import("@/lib/entries").then(({ manualEntryInputSchema }) => {
        const result = manualEntryInputSchema.safeParse({
          amount: 10,
          direction,
          date: "2026-08-10",
          description: "Teste",
          method: "PIX",
          accountId: "account-cuid-1",
        });
        expect(result.success).toBe(false);
      });
    },
  );

  it.each(["entrada", "saida"])("direction '%s' -> valido", (direction) => {
    return import("@/lib/entries").then(({ manualEntryInputSchema }) => {
      const result = manualEntryInputSchema.safeParse({
        amount: 10,
        direction,
        date: "2026-08-10",
        description: "Teste",
        method: "PIX",
        accountId: "account-cuid-1",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("manualEntryInputSchema - accountId ausente/vazio -> invalido", () => {
  it.each([
    ["ausente", undefined],
    ["vazio", ""],
  ])("accountId %s -> invalido", (_label, accountId) => {
    return import("@/lib/entries").then(({ manualEntryInputSchema }) => {
      const result = manualEntryInputSchema.safeParse({
        amount: 10,
        direction: "saida",
        date: "2026-08-10",
        description: "Teste",
        method: "PIX",
        accountId,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("manualEntryInputSchema - category vazia (quando presente) -> invalido", () => {
  it("category como string vazia -> invalido (o campo e opcional, mas nao pode ser vazio quando enviado)", async () => {
    const { manualEntryInputSchema } = await import("@/lib/entries");
    const result = manualEntryInputSchema.safeParse({
      amount: 10,
      direction: "saida",
      date: "2026-08-10",
      description: "Teste",
      method: "PIX",
      category: "",
      accountId: "account-cuid-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("ENTRY_METHODS/ENTRY_DIRECTIONS - constantes exportadas usadas pela UI", () => {
  it("ENTRY_METHODS contem exatamente PIX/TED/DEBIT/CREDIT/CASH", async () => {
    const { ENTRY_METHODS } = await import("@/lib/entries");
    expect([...ENTRY_METHODS].sort()).toEqual(
      ["PIX", "TED", "DEBIT", "CREDIT", "CASH"].sort(),
    );
  });

  it("ENTRY_DIRECTIONS contem exatamente entrada/saida", async () => {
    const { ENTRY_DIRECTIONS } = await import("@/lib/entries");
    expect([...ENTRY_DIRECTIONS].sort()).toEqual(["entrada", "saida"].sort());
  });
});
