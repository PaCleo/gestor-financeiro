import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios PUROS (sem I/O, sem Prisma) de `lib/dashboard.ts`
 * (TASK-010 - Dashboard: gastos por categoria + resumo do mes, primeira
 * task da Fase 5). Cobre so as pecas sem banco: a constante
 * `TRANSFER_CATEGORIES` (Criterio de aceite #2), o schema Zod
 * `monthQuerySchema` (Criterio de aceite #6) e o helper `getCurrentMonthUTC`
 * (Criterio de aceite #5/#7 - default de mes corrente).
 *
 * `getMonthlySummary` (a funcao que bate no Postgres) e testada contra o
 * banco REAL em tests/integration/dashboard.integration.test.ts - la esta o
 * CONTRATO COMPLETO de lib/dashboard.ts, no docblock do topo (mesmo padrao
 * de TASK-007/TASK-009: schema Zod puro aqui, tudo que toca o banco la -
 * DT-004, `vi.spyOn(prisma, ...)` e engolido pelo Proxy de `lib/db.ts`).
 *
 * Contrato assumido para as pecas puras cobertas aqui (o coder implementa
 * exatamente assim):
 *
 *   lib/dashboard.ts
 *     export const TRANSFER_CATEGORIES = [
 *       "Transfers",
 *       "Credit card payment",
 *       "Same person transfer",
 *       "Transfer - Cash",
 *     ] as const;
 *     // Categorias CRUAS da Pluggy (docs/DEBITO-TECNICO.md DT-018,
 *     // docs/PREMISSA.md secao 11) observadas nos dados reais. A deteccao
 *     // de transferencia usa a categoria CRUA (`Transaction.category`),
 *     // NUNCA a efetiva (categoryOverride/categoryFromRule) - Criterio de
 *     // aceite #2. Isso vale para QUALQUER `Transaction`, independente de
 *     // `source` (PLUGGY ou MANUAL) - nao ha guarda por `source` em lugar
 *     // nenhum: lancamentos manuais nunca caem nesse conjunto NA PRATICA
 *     // (nao tem categoria vinda da Pluggy), nao porque o codigo os isente
 *     // explicitamente (secao 3 do TASK-010.md, ultimo paragrafo).
 *
 *     export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
 *     // "YYYY-MM", mes de 01 a 12, zero-padded, ancorado (sem dia/hora).
 *
 *     export const monthQuerySchema = z.object({
 *       month: z.string().regex(MONTH_REGEX, "..."),
 *     });
 *     export type DashboardQuery = z.infer<typeof monthQuerySchema>;
 *     // `month` e OBRIGATORIO no schema (sem `.default(...)`) - tanto a
 *     // rota quanto a pagina decidem o que fazer quando ausente/invalido
 *     // (ver contrato da rota/pagina); o schema em si so valida FORMATO.
 *
 *     export const NO_CATEGORY_LABEL = "Sem categoria";
 *     // Rotulo de fallback quando a categoria EFETIVA (resolveTransactionCategory)
 *     // e null - usado no agrupamento de porCategoria (Criterio de aceite #4).
 *
 *     export function getCurrentMonthUTC(): string
 *     // "YYYY-MM" do mes corrente, calculado em UTC
 *     // (`new Date().getUTCFullYear()`/`getUTCMonth()`), NUNCA hora local
 *     // (getFullYear()/getMonth()) - mesmo cuidado de fuso do prompt desta
 *     // task e da TASK-007. Usado pela pagina como default quando
 *     // `searchParams.month` esta ausente ou invalido.
 */

describe("TRANSFER_CATEGORIES - constante documentada das categorias de transferencia/pagamento (Criterio de aceite #2, DT-018)", () => {
  it("contem EXATAMENTE as 4 categorias observadas nos dados reais, nenhuma a mais nem a menos", async () => {
    const { TRANSFER_CATEGORIES } = await import("@/lib/dashboard");

    expect([...TRANSFER_CATEGORIES].sort()).toEqual(
      [
        "Transfers",
        "Credit card payment",
        "Same person transfer",
        "Transfer - Cash",
      ].sort(),
    );
    expect(TRANSFER_CATEGORIES).toHaveLength(4);
  });
});

describe("monthQuerySchema - validacao Zod de 'month' (Criterio de aceite #6, formato YYYY-MM)", () => {
  it.each([["2026-01"], ["2026-08"], ["2026-12"], ["1999-06"], ["2100-12"]])(
    "%s -> valido",
    async (month) => {
      const { monthQuerySchema } = await import("@/lib/dashboard");
      const result = monthQuerySchema.safeParse({ month });
      expect(result.success).toBe(true);
    },
  );

  it.each([
    ["vazio", ""],
    ["mes 13 (acima do maximo)", "2026-13"],
    ["mes 00 (abaixo do minimo)", "2026-00"],
    ["mes sem zero-padding", "2026-1"],
    ["so o numero do mes, sem ano", "13"],
    ["separador errado (barra)", "2026/08"],
    ["com dia incluido (formato de data, nao de mes)", "2026-08-01"],
    ["com hora/timestamp embutido", "2026-08-01T00:00:00.000Z"],
    ["ano com 2 digitos", "26-08"],
    ["so o ano", "2026"],
    ["texto arbitrario", "nao-e-um-mes"],
    ["com espaco", " 2026-08"],
  ])("%s ('%s') -> invalido, rejeitado com erro Zod", async (_label, month) => {
    const { monthQuerySchema } = await import("@/lib/dashboard");
    const result = monthQuerySchema.safeParse({ month });
    expect(result.success).toBe(false);
  });

  it("month ausente do objeto -> invalido (campo obrigatorio, sem default no schema)", async () => {
    const { monthQuerySchema } = await import("@/lib/dashboard");
    const result = monthQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("month como numero (nao string) -> invalido, mesmo que o valor 'pareca' certo (202608)", async () => {
    const { monthQuerySchema } = await import("@/lib/dashboard");
    const result = monthQuerySchema.safeParse({ month: 202608 });
    expect(result.success).toBe(false);
  });
});

describe("getCurrentMonthUTC - mes corrente em UTC (Criterio de aceite #5/#7, cuidado com fuso da TASK-007)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("um instante de manha em UTC no meio do mes -> 'YYYY-MM' daquele mes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T10:00:00.000Z"));

    const { getCurrentMonthUTC } = await import("@/lib/dashboard");
    expect(getCurrentMonthUTC()).toBe("2026-07");
  });

  it("meses de um digito sao zero-padded (janeiro -> '01', nao '1')", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T12:00:00.000Z"));

    const { getCurrentMonthUTC } = await import("@/lib/dashboard");
    expect(getCurrentMonthUTC()).toBe("2026-01");
  });

  it("dezembro -> '12', sem virar Janeiro do ano seguinte por erro de indice de mes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-20T12:00:00.000Z"));

    const { getCurrentMonthUTC } = await import("@/lib/dashboard");
    expect(getCurrentMonthUTC()).toBe("2026-12");
  });

  it("o resultado sempre casa com monthQuerySchema (formato consistente entre os dois)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));

    const { getCurrentMonthUTC, monthQuerySchema } = await import(
      "@/lib/dashboard"
    );
    const result = monthQuerySchema.safeParse({ month: getCurrentMonthUTC() });
    expect(result.success).toBe(true);
  });
});
