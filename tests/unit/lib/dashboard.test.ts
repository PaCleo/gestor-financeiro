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
 *
 * TASK-014 (correcao: pagamento de fatura fora do gasto + gastos por
 * metodo) acrescenta DUAS pecas PURAS novas (sem I/O, testadas aqui) -
 * `getMonthlySummary` PASSA A USAR as duas por dentro, mas isso e coberto
 * (a integracao completa, contra o Postgres real) em
 * tests/integration/dashboard.integration.test.ts, cujo docblock tem o
 * CONTRATO COMPLETO de como `getMonthlySummary` consulta `CreditCardBill` e
 * `Account.type` para usar as duas funcoes abaixo. Aqui so a logica pura:
 *
 *   lib/dashboard.ts
 *     export const BILL_PAYMENT_WINDOW_DAYS = 10;
 *     // Tolerancia (em DIAS) da janela ao redor do `dueDate` de uma
 *     // `CreditCardBill` (secao 2 do TASK-014.md: "ex. +-10 dias"). Usada
 *     // como default de `isBillPayment` abaixo - documentada aqui como a
 *     // ÚNICA fonte da tolerancia (nao duplicada/hardcoded em outro lugar).
 *
 *     export function isBillPayment(
 *       transaction: { amount: string; date: Date },
 *       bills: { totalAmount: string; dueDate: Date }[],
 *       windowDays: number = BILL_PAYMENT_WINDOW_DAYS,
 *     ): boolean
 *     // Deteccao do "pagamento de fatura = casar com a fatura" (secao 2 do
 *     // TASK-014.md). Verdadeiro quando EXISTE ao menos uma `bill` em
 *     // `bills` tal que:
 *     //   1. `transaction.amount` e NEGATIVO (SO debito - a decisao fala
 *     //      em "um debito"; um valor positivo NUNCA casa, mesmo com
 *     //      mesmo valor absoluto e mesma janela - e o gasto "pagamento de
 *     //      fatura" so faz sentido descontando uma SAIDA da conta
 *     //      corrente, nao um credito/estorno);
 *     //   2. `|transaction.amount| === bill.totalAmount` EXATO (aritmetica
 *     //      Decimal - `Prisma.Decimal(transaction.amount).abs().equals(
 *     //      Prisma.Decimal(bill.totalAmount))` - nunca `Number()`/float,
 *     //      nunca arredondamento/tolerancia de centavos);
 *     //   3. `|transaction.date.getTime() - bill.dueDate.getTime()| <=
 *     //      windowDays * 24 * 60 * 60 * 1000` (janela SIMETRICA em
 *     //      milissegundos, INCLUSIVA nos dois extremos - "ao redor do
 *     //      dueDate", nao so antes ou so depois).
 *     // Desempate: se MAIS DE UMA bill casar (mesmo valor, ambas dentro da
 *     // janela), o resultado e `true` de qualquer forma - a funcao so
 *     // responde "e pagamento de fatura?" (booleano), NAO qual fatura
 *     // especifica foi paga (vincular a transacao a UMA fatura e o ciclo
 *     // de fatura por cartao, fora de escopo - TASK-015, secao 5 do
 *     // TASK-014.md). `bills` vazio -> sempre `false`.
 *     // Responsabilidade do CHAMADOR (nao desta funcao): so invocar
 *     // `isBillPayment` para transacoes de conta NAO-CARTAO
 *     // (`Account.type !== "CREDIT_CARD"`) - a funcao pura nao conhece o
 *     // tipo de conta, so compara valor/data (ver o describe "conta
 *     // CREDIT_CARD nao entra na deteccao" no arquivo de integracao).
 *
 *     export type ExpenseMethod = "credito" | "pixTed" | "debito" | "dinheiro" | null;
 *
 *     export function classifyExpenseMethod(input: {
 *       accountType: string;
 *       method: string | null;
 *     }): ExpenseMethod
 *     // Classificacao de gasto por metodo (Criterio de aceite #4), por
 *     // PRECEDENCIA (nao mutuamente exclusiva por acaso - a ordem importa
 *     // e e testada explicitamente):
 *     //   1. `accountType === "CREDIT_CARD"` -> "credito" (SEMPRE, qualquer
 *     //      que seja `method` - uma transacao numa conta de cartao e
 *     //      gasto de credito por definicao, independente do `method` cru
 *     //      vindo da Pluggy, que raramente vem preenchido pra cartao);
 *     //   2. senao, `accountType === "CASH"` -> "dinheiro" (a conta manual
 *     //      "Dinheiro" da TASK-009 - qualquer lancamento nela e gasto em
 *     //      dinheiro, independente do `method` armazenado);
 *     //   3. senao, `method === "PIX"` ou `method === "TED"` -> "pixTed";
 *     //   4. senao, `method === "DEBIT"` -> "debito";
 *     //   5. qualquer outro caso (method null, "BOLETO", "DOC", "CREDIT"
 *     //      numa conta nao-cartao, etc.) -> `null` (NAO classificado -
 *     //      nao entra em nenhum dos 4 buckets de `porMetodo`, mas
 *     //      continua contando normalmente em `despesa`/`porCategoria` -
 *     //      `porMetodo` e um recorte ADICIONAL, nao substitui `despesa`).
 *
 *     export interface MethodSummary {
 *       credito: string;
 *       pixTed: string;
 *       debito: string;
 *       dinheiro: string;
 *     }
 *     // Cada campo e a soma (Decimal.toFixed(2), sempre >= "0.00") dos
 *     // GASTOS (valor absoluto dos negativos, mesma base de `despesa` -
 *     // exclui transferencias e pagamentos de fatura) classificados
 *     // naquele bucket por `classifyExpenseMethod`.
 *
 *     export interface MonthlySummary {
 *       // ...campos ja existentes (month/receita/despesa/saldo/porCategoria/
 *       // transferenciasExcluidas)...
 *       porMetodo: MethodSummary;
 *       pagamentosFaturaExcluidos: { count: number; total: string };
 *       // DECISAO DESTA TASK (Criterio de aceite #3 - "separado ou somado
 *       // as transferencias, decisao do coder, documentada"): SEPARADO de
 *       // `transferenciasExcluidas`, em campo proprio - cada um conta SO
 *       // a propria natureza (transferencia entre contas OU pagamento de
 *       // fatura casado por valor+janela), nunca somados um dentro do
 *       // outro. `total` e SOMA DOS VALORES ABSOLUTOS (mesma convencao de
 *       // `transferenciasExcluidas.total`), sempre >= "0.00".
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

describe("BILL_PAYMENT_WINDOW_DAYS - constante de tolerancia documentada (Criterio de aceite #1/#2, TASK-014)", () => {
  it("e 10 (dias) - o valor decidido na secao 2 do TASK-014.md ('ex. +-10 dias')", async () => {
    const { BILL_PAYMENT_WINDOW_DAYS } = await import("@/lib/dashboard");
    expect(BILL_PAYMENT_WINDOW_DAYS).toBe(10);
  });
});

describe("isBillPayment - deteccao PURA de pagamento de fatura (Criterio de aceite #1/#2, TASK-014, o eixo desta task)", () => {
  const dueDate = new Date("2026-08-10T00:00:00.000Z");

  it("debito EXATAMENTE no valor da fatura, na MESMA data do vencimento -> true", async () => {
    const { isBillPayment } = await import("@/lib/dashboard");
    const result = isBillPayment(
      { amount: "-3408.84", date: dueDate },
      [{ totalAmount: "3408.84", dueDate }],
    );
    expect(result).toBe(true);
  });

  it("debito no limite EXATO da janela (+10 dias do vencimento, windowDays default) -> true (janela inclusiva)", async () => {
    const { isBillPayment, BILL_PAYMENT_WINDOW_DAYS } = await import("@/lib/dashboard");
    const noLimite = new Date(
      dueDate.getTime() + BILL_PAYMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = isBillPayment(
      { amount: "-3408.84", date: noLimite },
      [{ totalAmount: "3408.84", dueDate }],
    );
    expect(result).toBe(true);
  });

  it("debito no limite EXATO da janela ANTES do vencimento (-10 dias) -> true (janela e simetrica, nao so 'apos')", async () => {
    const { isBillPayment, BILL_PAYMENT_WINDOW_DAYS } = await import("@/lib/dashboard");
    const noLimite = new Date(
      dueDate.getTime() - BILL_PAYMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = isBillPayment(
      { amount: "-3408.84", date: noLimite },
      [{ totalAmount: "3408.84", dueDate }],
    );
    expect(result).toBe(true);
  });

  it("1 milissegundo ALEM do limite da janela -> false (janela nao e 'aberta', tem fim exato)", async () => {
    const { isBillPayment, BILL_PAYMENT_WINDOW_DAYS } = await import("@/lib/dashboard");
    const foraDaJanela = new Date(
      dueDate.getTime() + BILL_PAYMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000 + 1,
    );
    const result = isBillPayment(
      { amount: "-3408.84", date: foraDaJanela },
      [{ totalAmount: "3408.84", dueDate }],
    );
    expect(result).toBe(false);
  });

  it("mesmo valor mas FORA da janela de data (bem alem, ex. 21 dias antes) -> false: nao e o pagamento DAQUELA fatura (Criterio de aceite #2, caso 2 dos 3)", async () => {
    const { isBillPayment } = await import("@/lib/dashboard");
    const foraDaJanela = new Date("2026-07-20T00:00:00.000Z");
    const result = isBillPayment(
      { amount: "-3408.84", date: foraDaJanela },
      [{ totalAmount: "3408.84", dueDate }],
    );
    expect(result).toBe(false);
  });

  it("dentro da janela mas com VALOR diferente -> false (nao e 'quase igual', e EXATO)", async () => {
    const { isBillPayment } = await import("@/lib/dashboard");
    const result = isBillPayment(
      { amount: "-500.00", date: dueDate },
      [{ totalAmount: "3408.84", dueDate }],
    );
    expect(result).toBe(false);
  });

  it("diferenca de 1 centavo NAO casa - precisao decimal exata, sem tolerancia de arredondamento", async () => {
    const { isBillPayment } = await import("@/lib/dashboard");
    const result = isBillPayment(
      { amount: "-3408.85", date: dueDate },
      [{ totalAmount: "3408.84", dueDate }],
    );
    expect(result).toBe(false);
  });

  it("valor POSITIVO (credito/estorno) com mesmo valor absoluto e mesma data -> false: SO debito conta como pagamento de fatura", async () => {
    const { isBillPayment } = await import("@/lib/dashboard");
    const result = isBillPayment(
      { amount: "3408.84", date: dueDate },
      [{ totalAmount: "3408.84", dueDate }],
    );
    expect(result).toBe(false);
  });

  it("lista de faturas VAZIA -> false, nunca lanca", async () => {
    const { isBillPayment } = await import("@/lib/dashboard");
    const result = isBillPayment({ amount: "-3408.84", date: dueDate }, []);
    expect(result).toBe(false);
  });

  it("casa com a SEGUNDA fatura da lista, mesmo a primeira nao casando (nao para na primeira e desiste)", async () => {
    const { isBillPayment } = await import("@/lib/dashboard");
    const outraFatura = {
      totalAmount: "900.00",
      dueDate: new Date("2026-08-05T00:00:00.000Z"),
    };
    const result = isBillPayment(
      { amount: "-3408.84", date: dueDate },
      [outraFatura, { totalAmount: "3408.84", dueDate }],
    );
    expect(result).toBe(true);
  });

  it("windowDays customizado (0) restringe a janela a SO a data exata do vencimento", async () => {
    const { isBillPayment } = await import("@/lib/dashboard");
    const umDiaDepois = new Date(dueDate.getTime() + 24 * 60 * 60 * 1000);
    const naDataExata = isBillPayment(
      { amount: "-3408.84", date: dueDate },
      [{ totalAmount: "3408.84", dueDate }],
      0,
    );
    const umDiaFora = isBillPayment(
      { amount: "-3408.84", date: umDiaDepois },
      [{ totalAmount: "3408.84", dueDate }],
      0,
    );
    expect(naDataExata).toBe(true);
    expect(umDiaFora).toBe(false);
  });
});

describe("classifyExpenseMethod - classificacao PURA de gasto por metodo (Criterio de aceite #4, TASK-014)", () => {
  it("conta CREDIT_CARD -> 'credito', mesmo sem method (Pluggy raramente preenche method em cartao)", async () => {
    const { classifyExpenseMethod } = await import("@/lib/dashboard");
    expect(
      classifyExpenseMethod({ accountType: "CREDIT_CARD", method: null }),
    ).toBe("credito");
  });

  it("conta CREDIT_CARD -> 'credito' MESMO com method='DEBIT' (accountType tem precedencia sobre method)", async () => {
    const { classifyExpenseMethod } = await import("@/lib/dashboard");
    expect(
      classifyExpenseMethod({ accountType: "CREDIT_CARD", method: "DEBIT" }),
    ).toBe("credito");
  });

  it("conta CASH -> 'dinheiro', mesmo sem method", async () => {
    const { classifyExpenseMethod } = await import("@/lib/dashboard");
    expect(classifyExpenseMethod({ accountType: "CASH", method: null })).toBe(
      "dinheiro",
    );
  });

  it("conta CASH -> 'dinheiro' MESMO com method='PIX' (CASH tem precedencia sobre method, distingue de um lancamento manual em conta Pix)", async () => {
    const { classifyExpenseMethod } = await import("@/lib/dashboard");
    expect(classifyExpenseMethod({ accountType: "CASH", method: "PIX" })).toBe(
      "dinheiro",
    );
  });

  it("conta CHECKING + method='PIX' -> 'pixTed'", async () => {
    const { classifyExpenseMethod } = await import("@/lib/dashboard");
    expect(
      classifyExpenseMethod({ accountType: "CHECKING", method: "PIX" }),
    ).toBe("pixTed");
  });

  it("conta CHECKING + method='TED' -> 'pixTed' (mesmo bucket de PIX)", async () => {
    const { classifyExpenseMethod } = await import("@/lib/dashboard");
    expect(
      classifyExpenseMethod({ accountType: "CHECKING", method: "TED" }),
    ).toBe("pixTed");
  });

  it("conta SAVINGS + method='TED' -> 'pixTed' (generaliza para qualquer conta nao-cartao/nao-CASH, nao so CHECKING)", async () => {
    const { classifyExpenseMethod } = await import("@/lib/dashboard");
    expect(
      classifyExpenseMethod({ accountType: "SAVINGS", method: "TED" }),
    ).toBe("pixTed");
  });

  it("conta CHECKING + method='DEBIT' -> 'debito'", async () => {
    const { classifyExpenseMethod } = await import("@/lib/dashboard");
    expect(
      classifyExpenseMethod({ accountType: "CHECKING", method: "DEBIT" }),
    ).toBe("debito");
  });

  it("conta CHECKING + method=null -> null (nao classificado - method PIX/TED/DEBIT nao veio da Pluggy)", async () => {
    const { classifyExpenseMethod } = await import("@/lib/dashboard");
    expect(
      classifyExpenseMethod({ accountType: "CHECKING", method: null }),
    ).toBeNull();
  });

  it.each([["BOLETO"], ["DOC"], ["CREDIT"]])(
    "conta CHECKING + method='%s' -> null (metodo fora dos 4 buckets)",
    async (method) => {
      const { classifyExpenseMethod } = await import("@/lib/dashboard");
      expect(classifyExpenseMethod({ accountType: "CHECKING", method })).toBeNull();
    },
  );
});
