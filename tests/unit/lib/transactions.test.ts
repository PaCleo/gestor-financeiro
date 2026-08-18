import { describe, expect, it } from "vitest";

/**
 * Testes unitarios de `lib/transactions.ts` (TASK-007 - Tela de transacoes
 * com filtros, fecha a Fase 2). Cobrem SOMENTE as duas coisas puras deste
 * arquivo - nenhum acesso a banco aqui (isso e testado ponta a ponta contra
 * o Postgres real em tests/integration/transactions.integration.test.ts,
 * conforme o Criterio de aceite #7: "a query testada contra o Postgres
 * real"):
 *
 *   1. `resolveTransactionCategory` - a resolucao da categoria efetiva
 *      (Criterio de aceite #2, DT-010: `categoryOverride ?? category`).
 *      **Escopo desta task**: SO a precedencia override->Pluggy. A regra
 *      por CPF/CNPJ (DT-019) e a TASK-008, fora de escopo aqui.
 *   2. `transactionsQuerySchema` - a validacao Zod dos parametros de
 *      `GET /api/transactions` (Criterio de aceite #1 e #6 do prompt desta
 *      task: datas invalidas, limites fora de faixa e paginacao devem virar
 *      erro de parse, nunca quebrar).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim, ver secao 5 do TASK-007.md):
 *
 *   lib/transactions.ts
 *     export const DEFAULT_PAGE_SIZE: number   // usado quando `limit` nao vem
 *     export const MAX_PAGE_SIZE: number        // teto aceito para `limit`
 *     export const transactionsQuerySchema: ZodSchema
 *       // z.object({ accountId?: string (nao vazio), startDate?: "YYYY-MM-DD",
 *       //   endDate?: "YYYY-MM-DD", page?: number inteiro >=1 (default 1),
 *       //   limit?: number inteiro entre 1 e MAX_PAGE_SIZE (default
 *       //   DEFAULT_PAGE_SIZE) }), com refine adicional: se startDate E
 *       //   endDate estiverem presentes, startDate <= endDate (formato
 *       //   string, comparacao lexicografica ISO funciona direto).
 *     export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>
 *     export function resolveTransactionCategory(transaction: {
 *       category: string | null;
 *       categoryOverride: string | null;
 *     }): string | null
 *       // return transaction.categoryOverride ?? transaction.category
 *       // (precedencia override -> Pluggy, DT-010, ESCOPO DESTA TASK - sem
 *       // regra de CPF/CNPJ, essa e a TASK-008/DT-019)
 */

describe("resolveTransactionCategory - categoria efetiva = categoryOverride ?? category (Criterio de aceite #2, DT-010, escopo desta task)", () => {
  it("com categoryOverride preenchido, mostra o override - nao a category da Pluggy", async () => {
    const { resolveTransactionCategory } = await import("@/lib/transactions");

    expect(
      resolveTransactionCategory({
        category: "Online shopping",
        categoryOverride: "Presentes de aniversario",
      }),
    ).toBe("Presentes de aniversario");
  });

  it("sem categoryOverride (null), mostra a category da Pluggy", async () => {
    const { resolveTransactionCategory } = await import("@/lib/transactions");

    expect(
      resolveTransactionCategory({ category: "Housing", categoryOverride: null }),
    ).toBe("Housing");
  });

  it("categoryOverride undefined (mesmo efeito de null para o operador ??) tambem cai para category", async () => {
    const { resolveTransactionCategory } = await import("@/lib/transactions");

    expect(
      resolveTransactionCategory({
        category: "Housing",
        categoryOverride: undefined as unknown as null,
      }),
    ).toBe("Housing");
  });

  it("ambos ausentes (category e categoryOverride null) -> null, sem lancar", async () => {
    const { resolveTransactionCategory } = await import("@/lib/transactions");

    expect(
      resolveTransactionCategory({ category: null, categoryOverride: null }),
    ).toBeNull();
  });

  it("categoryOverride string vazia PERMANECE como override (operador ?? so cai no fallback com null/undefined, nunca com falsy) - documenta o comportamento exato para nao ser trocado por || por engano", async () => {
    const { resolveTransactionCategory } = await import("@/lib/transactions");

    expect(
      resolveTransactionCategory({ category: "Housing", categoryOverride: "" }),
    ).toBe("");
  });
});

describe("transactionsQuerySchema - validacao Zod dos parametros de GET /api/transactions (Criterio de aceite #1 e #6 do prompt)", () => {
  it("objeto vazio e valido - defaults page=1 e limit=DEFAULT_PAGE_SIZE, sem accountId/startDate/endDate", async () => {
    const { transactionsQuerySchema, DEFAULT_PAGE_SIZE } = await import(
      "@/lib/transactions"
    );

    const result = transactionsQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(DEFAULT_PAGE_SIZE);
      expect(result.data.accountId).toBeUndefined();
      expect(result.data.startDate).toBeUndefined();
      expect(result.data.endDate).toBeUndefined();
    }
  });

  it("DEFAULT_PAGE_SIZE e MAX_PAGE_SIZE sao positivos e MENORES que 432 (o Item real) - prova, ja no nivel de constante, que a paginacao e real e nao despeja a tabela inteira (Criterio de aceite #4)", async () => {
    const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = await import(
      "@/lib/transactions"
    );

    expect(DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_PAGE_SIZE).toBeLessThan(432);
    expect(MAX_PAGE_SIZE).toBeGreaterThanOrEqual(DEFAULT_PAGE_SIZE);
    expect(MAX_PAGE_SIZE).toBeLessThan(432);
  });

  it("accountId/startDate/endDate/page/limit validos sao aceitos e preservados (page/limit coagidos de string para number - vem de query string)", async () => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");

    const result = transactionsQuerySchema.safeParse({
      accountId: "clx0000000000000000000aa",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      page: "2",
      limit: "10",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        accountId: "clx0000000000000000000aa",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        page: 2,
        limit: 10,
      });
    }
  });

  it.each([
    ["texto qualquer", "nao-e-uma-data"],
    ["mes invalido (13)", "2026-13-01"],
    ["dia invalido (30 de fevereiro)", "2026-02-30"],
    ["formato americano com barras", "07/01/2026"],
    ["so o ano", "2026"],
    ["com horario embutido", "2026-07-01T00:00:00.000Z"],
  ])("startDate invalida (%s) -> parse falha", async (_label, value) => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");
    expect(transactionsQuerySchema.safeParse({ startDate: value }).success).toBe(
      false,
    );
  });

  it.each([
    ["texto qualquer", "nao-e-uma-data"],
    ["mes invalido (13)", "2026-13-01"],
  ])("endDate invalida (%s) -> parse falha", async (_label, value) => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");
    expect(transactionsQuerySchema.safeParse({ endDate: value }).success).toBe(
      false,
    );
  });

  it("startDate posterior a endDate (intervalo invertido) -> parse falha", async () => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");

    const result = transactionsQuerySchema.safeParse({
      startDate: "2026-08-01",
      endDate: "2026-07-01",
    });

    expect(result.success).toBe(false);
  });

  it("startDate igual a endDate (um unico dia) -> valido", async () => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");

    expect(
      transactionsQuerySchema.safeParse({
        startDate: "2026-07-15",
        endDate: "2026-07-15",
      }).success,
    ).toBe(true);
  });

  it("so startDate, sem endDate -> valido (intervalo aberto no futuro)", async () => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");
    expect(
      transactionsQuerySchema.safeParse({ startDate: "2026-07-01" }).success,
    ).toBe(true);
  });

  it("so endDate, sem startDate -> valido (intervalo aberto no passado)", async () => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");
    expect(
      transactionsQuerySchema.safeParse({ endDate: "2026-07-31" }).success,
    ).toBe(true);
  });

  it.each([
    ["zero", "0"],
    ["negativa", "-1"],
    ["nao-inteira", "1.5"],
    ["nao-numerica", "abc"],
    ["array (query duplicada)", ["1", "2"]],
  ])("page invalida (%s) -> parse falha", async (_label, value) => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");
    expect(transactionsQuerySchema.safeParse({ page: value }).success).toBe(
      false,
    );
  });

  it.each([
    ["zero", "0"],
    ["negativo", "-1"],
    ["nao-inteiro", "1.5"],
    ["nao-numerico", "abc"],
    ["acima do maximo", "9999"],
  ])("limit invalido (%s) -> parse falha", async (_label, value) => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");
    expect(transactionsQuerySchema.safeParse({ limit: value }).success).toBe(
      false,
    );
  });

  it("limit exatamente no teto (MAX_PAGE_SIZE) -> valido", async () => {
    const { transactionsQuerySchema, MAX_PAGE_SIZE } = await import(
      "@/lib/transactions"
    );
    expect(
      transactionsQuerySchema.safeParse({ limit: String(MAX_PAGE_SIZE) })
        .success,
    ).toBe(true);
  });

  it("accountId vazio (string vazia) -> parse falha - um filtro de conta 'em branco' nao deveria ser enviado como accountId", async () => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");
    expect(transactionsQuerySchema.safeParse({ accountId: "" }).success).toBe(
      false,
    );
  });

  it("campos desconhecidos no objeto nao quebram o parse (parametros extras de URL sao ignorados, nao rejeitados)", async () => {
    const { transactionsQuerySchema } = await import("@/lib/transactions");
    const result = transactionsQuerySchema.safeParse({
      accountId: "acc-1",
      utm_source: "newsletter",
    });
    expect(result.success).toBe(true);
  });
});
