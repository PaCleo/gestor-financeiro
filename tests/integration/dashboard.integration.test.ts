import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../setup/reset-db";
import {
  buildAccount,
  buildBankItem,
  buildCreditCardBill,
  buildTransaction,
} from "../fixtures/db";

/**
 * Testes de integracao de `getMonthlySummary` (lib/dashboard.ts, TASK-010 -
 * Dashboard: gastos por categoria + resumo do mes, primeira task da Fase 5).
 * Batem no Postgres REAL de teste (gestor_test) - nenhum mock de Prisma
 * aqui (DT-004: `vi.spyOn(prisma, ...)` e engolido pelo Proxy de
 * `lib/db.ts`).
 *
 * Este e o arquivo mais importante da task: prova o DT-018 (Criterio de
 * aceite #3, "sem esse teste a task nao fecha") contra dados que espelham
 * os reais (docs/PREMISSA.md secao 11 / docs/DEBITO-TECNICO.md DT-018) -
 * transferencias/pagamento de fatura entrando com AMBOS os sinais, ao lado
 * de receita e despesa reais.
 *
 * CONTRATO COMPLETO assumido para o coder (definido pelo qa nesta task):
 *
 *   lib/dashboard.ts
 *
 *     export const TRANSFER_CATEGORIES = [
 *       "Transfers",
 *       "Credit card payment",
 *       "Same person transfer",
 *       "Transfer - Cash",
 *     ] as const;
 *     // Categorias CRUAS da Pluggy observadas nos dados reais (DT-018). A
 *     // deteccao usa Transaction.category (CRUA), nunca categoryOverride/
 *     // categoryFromRule - Criterio de aceite #2. Vale para QUALQUER
 *     // Transaction, independente de `source` (nao ha guarda por source -
 *     // ver describe "manuais" abaixo, ultimo bloco).
 *
 *     export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
 *     export const monthQuerySchema = z.object({ month: z.string().regex(MONTH_REGEX) });
 *     export type DashboardQuery = z.infer<typeof monthQuerySchema>;
 *     export const NO_CATEGORY_LABEL = "Sem categoria";
 *     export function getCurrentMonthUTC(): string
 *     // (ver contrato completo destas 5 exportacoes em
 *     // tests/unit/lib/dashboard.test.ts - sao puras, testadas la)
 *
 *     export interface CategorySummary {
 *       category: string;   // categoria EFETIVA (resolveTransactionCategory),
 *                            // ou NO_CATEGORY_LABEL quando null - NUNCA null
 *       total: string;       // Decimal.toString() - soma dos GASTOS (valor
 *                             // absoluto, positivo) daquela categoria
 *     }
 *
 *     export interface MonthlySummary {
 *       month: string;                 // "YYYY-MM", o mes recebido (eco)
 *       receita: string;                // soma dos POSITIVOS nao-transferencia,
 *                                        // Decimal.toString(), sempre >= "0.00"
 *       despesa: string;                 // soma em VALOR ABSOLUTO dos NEGATIVOS
 *                                        // nao-transferencia, Decimal.toString(),
 *                                        // sempre >= "0.00" (nunca negativo)
 *       saldo: string;                    // receita - despesa, Decimal.toString()
 *                                        // (PODE ser negativo - Decimal.toString()
 *                                        // ja inclui o "-" quando negativo)
 *       porCategoria: CategorySummary[]; // SO gastos (negativos, nao-transferencia),
 *                                        // agrupados pela categoria EFETIVA,
 *                                        // DECRESCENTE por total gasto
 *       transferenciasExcluidas: {
 *         count: number;   // quantidade de Transaction excluidas por serem
 *                           // transferencia (categoria CRUA em TRANSFER_CATEGORIES)
 *         total: string;    // SOMA DOS VALORES ABSOLUTOS (nunca soma com sinal -
 *                           // perna-espelho de uma transferencia tende a
 *                           // cancelar para perto de zero se somada com sinal,
 *                           // o que frustraria a "transparencia" da secao 2:
 *                           // "expoe o total... para o usuario auditar" so
 *                           // faz sentido como volume movimentado, nao saldo
 *                           // liquido). Decimal.toString(), sempre >= "0.00"
 *       };
 *     }
 *
 *     export async function getMonthlySummary(month: string): Promise<MonthlySummary>
 *     // `month` no formato "YYYY-MM" JA VALIDADO pelo chamador (rota/pagina
 *     // via monthQuerySchema) - getMonthlySummary NAO revalida formato, mesmo
 *     // padrao de listTransactions(query) confiar em TransactionsQuery ja
 *     // parseada.
 *     //
 *     // Janela do mes em UTC (Criterio de aceite #5, MESMO CUIDADO DE FUSO
 *     // da TASK-007 - documentado aqui como convencao, nao escondido):
 *     //   ano = Number(month.slice(0,4)); mesIndex = Number(month.slice(5,7)) - 1;
 *     //   inicio = Date.UTC(ano, mesIndex, 1, 0, 0, 0, 0)          // dia 1, 00:00:00.000Z
 *     //   fim    = Date.UTC(ano, mesIndex + 1, 0, 23, 59, 59, 999) // ULTIMO dia do
 *     //            mes (dia 0 do mes seguinte = ultimo dia deste), 23:59:59.999Z
 *     //   where: { date: { gte: new Date(inicio), lte: new Date(fim) } }
 *     // CAVEAT documentado: a janela e UTC PURO - se o usuario estiver em um
 *     // fuso negativo (ex. America/Sao_Paulo, UTC-3), uma transacao as
 *     // 22:00 do ultimo dia local (01:00 UTC do dia seguinte) cai no mes
 *     // SEGUINTE neste calculo. Mesma convencao/mesmo caveat ja aceito na
 *     // TASK-007 (listTransactions) - nao resolvido aqui, so documentado.
 *     //
 *     // Passos (ATUALIZADO pela TASK-014 - passos 4 e 5 mudam, o resto
 *     // continua igual): 1) busca TODAS as Transaction no where acima (sem
 *     // paginacao), agora com SELECT AMPLIADO: alem de amount/category/
 *     // categoryOverride/categoryFromRule, tambem `date: true`, `method: true`
 *     // e `account: { select: { type: true } }` (necessarios para o
 *     // casamento de fatura e a classificacao por metodo abaixo); 1b) busca
 *     // TAMBEM `prisma.creditCardBill.findMany({ select: { totalAmount:
 *     // true, dueDate: true } })` - TODAS as faturas do sistema, SEM
 *     // filtro de mes nem de conta (uma fatura com `dueDate` no mes
 *     // SEGUINTE pode ter sido paga dentro da janela ainda no mes
 *     // consultado - ver describe "janela atravessa a borda do mes"
 *     // abaixo); 2) para cada linha de Transaction, `isTransfer =
 *     // TRANSFER_CATEGORIES includes row.category` (CRUA); 3) transferencia
 *     // -> conta em transferenciasExcluidas (count++, total += abs(amount)),
 *     // NAO entra em receita/despesa/porCategoria/porMetodo; 4) SENAO, se
 *     // `row.account.type !== "CREDIT_CARD"` E `isBillPayment({ amount:
 *     // row.amount.toString(), date: row.date }, bills)` (a funcao PURA de
 *     // lib/dashboard.ts, contrato completo em
 *     // tests/unit/lib/dashboard.test.ts) -> conta em
 *     // pagamentosFaturaExcluidos (count++, total += abs(amount)), NAO
 *     // entra em receita/despesa/porCategoria/porMetodo (MESMO TRATAMENTO
 *     // de transferencia, campo SEPARADO - Criterio de aceite #3, decisao
 *     // desta task); transacoes de conta CREDIT_CARD NUNCA passam por
 *     // `isBillPayment` (a checagem de tipo de conta e ANTES de chamar a
 *     // funcao pura); 5) SENAO, nao-transferencia/nao-pagamento-de-fatura
 *     // com amount > 0 -> soma em receita; 6) idem com amount < 0 -> soma
 *     // (abs) em despesa E no bucket de porCategoria da categoria EFETIVA
 *     // (resolveTransactionCategory de @/lib/transactions, ou
 *     // NO_CATEGORY_LABEL se null) E, via `classifyExpenseMethod({
 *     // accountType: row.account.type, method: row.method })`, no bucket
 *     // correspondente de `porMetodo` (se o resultado NAO for null - uma
 *     // classificacao null nao soma em nenhum bucket de porMetodo, mas
 *     // CONTINUA somando em despesa/porCategoria normalmente); 7) amount
 *     // === 0 -> nao entra em receita NEM despesa NEM porCategoria NEM
 *     // porMetodo (nem transferencia/pagamento de fatura, salvo se a
 *     // categoria crua for de transferencia ou o valor+janela casarem com
 *     // uma fatura - af entra no respectivo campo excluido com total +=
 *     // 0); 8) porCategoria ordenado DECRESCENTE por total (Number(total)
 *     // desc); 9) saldo = receita - despesa (aritmetica decimal exata,
 *     // nunca float/Number ao longo do caminho - usar Prisma.Decimal ou
 *     // equivalente, EM TODOS os campos novos tambem).
 */

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createAccountWithBankItem(overrides: Record<string, unknown> = {}) {
  const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
  return prisma.account.create({ data: buildAccount(bankItem.id, overrides) });
}

describe("getMonthlySummary - DT-018: transferencias EXCLUIDAS dos dois lados, receita e despesa REAIS entram (Criterio de aceite #3 - o eixo da task)", () => {
  it("com transferencias de AMBOS os sinais (positivo E negativo), nas 4 categorias reais, ao lado de uma receita real e dois gastos reais: as transferencias somem de receita/despesa e contam em transferenciasExcluidas; a receita real entra; os gastos reais entram em despesa e porCategoria", async () => {
    const account = await createAccountWithBankItem();
    const julho = (day: string) => new Date(`2026-07-${day}T12:00:00.000Z`);

    // As 4 categorias de transferencia/pagamento reais (DT-018), COM OS
    // DOIS SINAIS representados - se so um sinal fosse testado, uma
    // implementacao que so filtra `amount > 0` (em vez da categoria)
    // passaria por acidente. Total movimentado: 2000 + 2000 + 500 + 300 = 4800.
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-transfer-pos",
        category: "Transfers",
        amount: "2000.00",
        date: julho("10"),
        description: "Pagamento de fatura (perna espelho, positiva)",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-credit-card-payment-neg",
        category: "Credit card payment",
        amount: "-2000.00",
        date: julho("10"),
        description: "Pagamento de fatura (saida da conta corrente, negativa)",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-same-person-pos",
        category: "Same person transfer",
        amount: "500.00",
        date: julho("12"),
        description: "Transferencia entre contas proprias (entrada)",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-transfer-cash-neg",
        category: "Transfer - Cash",
        amount: "-300.00",
        date: julho("13"),
        description: "Transferencia para dinheiro (saida)",
      }),
    });

    // Receita REAL - deve entrar.
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-receita-real",
        category: "Non-recurring income",
        amount: "1500.00",
        date: julho("05"),
        description: "Reembolso nao recorrente",
      }),
    });

    // Gastos REAIS - devem entrar em despesa e porCategoria.
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-gasto-housing",
        category: "Housing",
        amount: "-800.00",
        date: julho("07"),
        description: "Aluguel",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-gasto-online-shopping",
        category: "Online shopping",
        amount: "-138.83",
        date: julho("08"),
        description: "Compra online",
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.month).toBe("2026-07");
    expect(summary.receita).toBe("1500.00");
    expect(summary.despesa).toBe("938.83");
    expect(summary.saldo).toBe("561.17");
    expect(summary.transferenciasExcluidas).toEqual({
      count: 4,
      total: "4800.00",
    });
    expect(summary.porCategoria).toEqual([
      { category: "Housing", total: "800.00" },
      { category: "Online shopping", total: "138.83" },
    ]);

    // Nenhuma categoria de transferencia vaza para porCategoria.
    const categoriasEmPorCategoria = summary.porCategoria.map((c) => c.category);
    for (const transferCategory of [
      "Transfers",
      "Credit card payment",
      "Same person transfer",
      "Transfer - Cash",
    ]) {
      expect(categoriasEmPorCategoria).not.toContain(transferCategory);
    }
  });
});

describe("getMonthlySummary - a exclusao usa a categoria CRUA, NAO a efetiva (Criterio de aceite #2, distingue de uma implementacao que exclui por categoria efetiva)", () => {
  it("uma transferencia (categoria crua 'Transfers') recategorizada pelo usuario para 'Mercado' (categoryOverride) CONTINUA excluida - nao entra em despesa/receita, nao aparece como 'Mercado' em porCategoria, e ainda conta em transferenciasExcluidas", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-transfer-recategorizada",
        category: "Transfers",
        categoryOverride: "Mercado",
        amount: "-400.00",
        date: new Date("2026-07-15T12:00:00.000Z"),
        description: "Pagamento de fatura, recategorizado a mao pelo usuario",
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("0.00");
    expect(summary.receita).toBe("0.00");
    expect(summary.porCategoria).toEqual([]);
    expect(summary.transferenciasExcluidas).toEqual({
      count: 1,
      total: "400.00",
    });
  });

  it("o MESMO teste por contraste: uma transacao com categoria crua 'Housing' mas categoryOverride 'Transfers' (usuario recategorizou um gasto real COMO transferencia) passa a ser excluida - a categoria CRUA nao mudou de fato na Pluggy, mas a deteccao olha SO a crua, entao um override para uma string do conjunto tambem exclui (prova que a implementacao le category, nao categoryOverride, em ambas as direcoes)", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-housing-com-override-transfer",
        category: "Housing",
        categoryOverride: "Transfers",
        amount: "-250.00",
        date: new Date("2026-07-15T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    // categoria CRUA e "Housing" (fora do conjunto) - NAO e transferencia,
    // mesmo com o override apontando para "Transfers".
    expect(summary.transferenciasExcluidas).toEqual({ count: 0, total: "0.00" });
    expect(summary.despesa).toBe("250.00");
    expect(summary.porCategoria).toEqual([{ category: "Transfers", total: "250.00" }]);
  });
});

describe("getMonthlySummary - porCategoria agrupa pela categoria EFETIVA (resolveTransactionCategory), decrescente por valor (Criterio de aceite #4)", () => {
  it("com override, regra e categoria crua todas presentes em transacoes diferentes, agrupa pela categoria EFETIVA de cada uma - o override MUDA o grupo em que o gasto aparece", async () => {
    const account = await createAccountWithBankItem();
    const julho = (day: string) => new Date(`2026-07-${day}T12:00:00.000Z`);

    // Efetiva = override "Presentes" (vence a category crua "Online shopping").
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-override-presentes",
        category: "Online shopping",
        categoryOverride: "Presentes",
        amount: "-120.00",
        date: julho("10"),
      }),
    });
    // Efetiva = category crua "Online shopping" (sem override) - mesma
    // categoria crua da transacao acima, mas grupo DIFERENTE por causa do
    // override da outra.
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-sem-override",
        category: "Online shopping",
        categoryOverride: null,
        amount: "-50.00",
        date: julho("11"),
      }),
    });
    // Efetiva = categoryFromRule "Aluguel" (vence a category crua "Housing").
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-categoria-da-regra",
        category: "Housing",
        categoryFromRule: "Aluguel",
        categoryOverride: null,
        amount: "-30.00",
        date: julho("12"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.porCategoria).toEqual([
      { category: "Presentes", total: "120.00" },
      { category: "Online shopping", total: "50.00" },
      { category: "Aluguel", total: "30.00" },
    ]);
  });

  it("duas transacoes na MESMA categoria efetiva somam no MESMO bucket, nao duplicam a categoria em porCategoria", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-mercado-1",
        category: "Supermarket",
        categoryOverride: "Mercado",
        amount: "-60.00",
        date: new Date("2026-07-05T12:00:00.000Z"),
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-mercado-2",
        category: "Groceries",
        categoryOverride: "Mercado",
        amount: "-40.00",
        date: new Date("2026-07-20T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.porCategoria).toEqual([{ category: "Mercado", total: "100.00" }]);
  });

  it("categoria efetiva NULL (sem category, sem override, sem regra) cai no rotulo NO_CATEGORY_LABEL ('Sem categoria'), nunca null/undefined cru", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-sem-categoria-nenhuma",
        category: null,
        categoryOverride: null,
        categoryFromRule: null,
        amount: "-75.00",
        date: new Date("2026-07-05T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary, NO_CATEGORY_LABEL } = await import(
      "@/lib/dashboard"
    );
    const summary = await getMonthlySummary("2026-07");

    expect(summary.porCategoria).toEqual([
      { category: NO_CATEGORY_LABEL, total: "75.00" },
    ]);
  });

  it("receita (positiva, nao-transferencia) NAO aparece em porCategoria - porCategoria e SO gastos", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-so-receita",
        category: "Non-recurring income",
        amount: "300.00",
        date: new Date("2026-07-05T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.porCategoria).toEqual([]);
    expect(summary.receita).toBe("300.00");
  });
});

describe("getMonthlySummary - recorte de mes, com atencao ao FUSO (Criterio de aceite #5, mesmo trap da TASK-007)", () => {
  it("transacoes de OUTRO mes nao entram - so as do mes pedido", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-junho",
        category: "Housing",
        amount: "-100.00",
        date: new Date("2026-06-15T12:00:00.000Z"),
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-julho",
        category: "Housing",
        amount: "-200.00",
        date: new Date("2026-07-15T12:00:00.000Z"),
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-agosto",
        category: "Housing",
        amount: "-300.00",
        date: new Date("2026-08-15T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("200.00");
  });

  it("o ULTIMO instante do mes (23:59:59.999 UTC do ultimo dia) e INCLUIDO", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-ultimo-instante-julho",
        category: "Housing",
        amount: "-50.00",
        date: new Date("2026-07-31T23:59:59.999Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("50.00");
  });

  it("o PRIMEIRO instante do mes SEGUINTE (00:00:00.000 UTC) e EXCLUIDO", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-primeiro-instante-agosto",
        category: "Housing",
        amount: "-50.00",
        date: new Date("2026-08-01T00:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("0.00");
  });

  it("o PRIMEIRO instante do mes (00:00:00.000 UTC do dia 1) e INCLUIDO", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-primeiro-instante-julho",
        category: "Housing",
        amount: "-50.00",
        date: new Date("2026-07-01T00:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("50.00");
  });

  it("o ULTIMO instante do mes ANTERIOR (23:59:59.999 UTC do ultimo dia de junho) e EXCLUIDO", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-ultimo-instante-junho",
        category: "Housing",
        amount: "-50.00",
        date: new Date("2026-06-30T23:59:59.999Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("0.00");
  });

  it("fevereiro (mes de 28/29 dias) recorta corretamente ate o ultimo dia real do mes", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-fim-fevereiro-2026",
        category: "Housing",
        amount: "-50.00",
        date: new Date("2026-02-28T23:59:59.999Z"),
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-inicio-marco-2026",
        category: "Housing",
        amount: "-999.00",
        date: new Date("2026-03-01T00:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-02");

    expect(summary.despesa).toBe("50.00");
  });
});

describe("getMonthlySummary - lancamentos MANUAIS entram normalmente (secao 3, nao sao transferencia)", () => {
  it("um lancamento MANUAL (source=MANUAL) negativo no mes entra em despesa e porCategoria, exatamente como um PLUGGY", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: null,
        source: "MANUAL",
        category: "Alimentação",
        amount: "-90.00",
        date: new Date("2026-07-10T12:00:00.000Z"),
        description: "Almoço pago em dinheiro",
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("90.00");
    expect(summary.porCategoria).toEqual([{ category: "Alimentação", total: "90.00" }]);
  });

  it("um lancamento MANUAL positivo entra em receita", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: null,
        source: "MANUAL",
        category: null,
        amount: "1000.00",
        date: new Date("2026-07-10T12:00:00.000Z"),
        description: "Adiantamento recebido em dinheiro",
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.receita).toBe("1000.00");
  });

  it("caso defensivo/teorico: um MANUAL cuja category crua COINCIDE com uma string de TRANSFER_CATEGORIES tambem e excluido - a deteccao NAO faz excecao por source (documentado: na pratica isso nunca acontece, manuais nao tem categoria vinda da Pluggy, mas o CODIGO nao pode depender disso)", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: null,
        source: "MANUAL",
        category: "Transfers",
        amount: "-500.00",
        date: new Date("2026-07-10T12:00:00.000Z"),
        description: "Lancamento manual com categoria digitada igual a uma de transferencia",
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("0.00");
    expect(summary.transferenciasExcluidas).toEqual({ count: 1, total: "500.00" });
  });
});

describe("getMonthlySummary - bordas (valor zero, mes sem nenhuma transacao, precisao decimal)", () => {
  it("transacao com amount ZERO (nao-transferencia) nao entra em receita, despesa NEM porCategoria", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-zero",
        category: "Housing",
        amount: "0.00",
        date: new Date("2026-07-10T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.receita).toBe("0.00");
    expect(summary.despesa).toBe("0.00");
    expect(summary.porCategoria).toEqual([]);
  });

  it("mes sem NENHUMA transacao devolve zeros e listas vazias, sem lancar (MUDANCA DELIBERADA DE CONTRATO na TASK-014: o objeto ganha porMetodo e pagamentosFaturaExcluidos, ambos zerados - nao e enfraquecimento, e o novo shape completo de MonthlySummary documentado no topo deste arquivo)", async () => {
    await createAccountWithBankItem();

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary).toEqual({
      month: "2026-07",
      receita: "0.00",
      despesa: "0.00",
      saldo: "0.00",
      porCategoria: [],
      porMetodo: { credito: "0.00", pixTed: "0.00", debito: "0.00", dinheiro: "0.00" },
      transferenciasExcluidas: { count: 0, total: "0.00" },
      pagamentosFaturaExcluidos: { count: 0, total: "0.00" },
    });
  });

  it("centavos sao preservados com precisao decimal exata (sem erro de ponto flutuante) somando varias transacoes fracionarias", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-frac-1",
        category: "Housing",
        amount: "-10.10",
        date: new Date("2026-07-01T12:00:00.000Z"),
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-frac-2",
        category: "Housing",
        amount: "-20.20",
        date: new Date("2026-07-02T12:00:00.000Z"),
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-frac-3",
        category: "Housing",
        amount: "-0.01",
        date: new Date("2026-07-03T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    // 10.10 + 20.20 + 0.01 = 30.31 EXATO - um somatorio via Number()/float
    // (0.1 + 0.2 = 0.30000000000000004 em IEEE754) provavelmente falharia
    // este teste com um valor tipo "30.309999999999999" ou similar.
    expect(summary.despesa).toBe("30.31");
  });
});

describe("getMonthlySummary - multiplas contas somam juntas (o dashboard e agregado, sem filtro de conta nesta task)", () => {
  it("gastos e receitas de contas DIFERENTES no mesmo mes entram somados no mesmo resumo", async () => {
    const accountA = await createAccountWithBankItem({ name: "Conta A" });
    const accountB = await createAccountWithBankItem({ name: "Conta B" });

    await prisma.transaction.create({
      data: buildTransaction(accountA.id, {
        pluggyTransactionId: "tx-conta-a",
        category: "Housing",
        amount: "-100.00",
        date: new Date("2026-07-05T12:00:00.000Z"),
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(accountB.id, {
        pluggyTransactionId: "tx-conta-b",
        category: "Housing",
        amount: "-50.00",
        date: new Date("2026-07-06T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("150.00");
    expect(summary.porCategoria).toEqual([{ category: "Housing", total: "150.00" }]);
  });
});

/**
 * TASK-014 - o EIXO desta task: casamento de pagamento de fatura por
 * valor+janela (Criterio de aceite #1/#2), substitui a exclusao por
 * categoria (DT-018 ficava cego para o pagamento real: um debito de
 * -R$3.408,84 categorizado pela Pluggy como "Loans and financing", que
 * NAO esta em TRANSFER_CATEGORIES). Usa `buildCreditCardBill` (mesmos
 * valores da sondagem real - dueDate 2026-08-10, total R$3.408,84).
 */
describe("getMonthlySummary - deteccao de pagamento de fatura por valor+janela (Criterio de aceite #1/#2, TASK-014 - substitui a lacuna do DT-018)", () => {
  it("CASO 1 dos 3: debito de conta corrente = total da fatura, DENTRO da janela do vencimento -> NAO entra em despesa, conta em pagamentosFaturaExcluidos (reproduz o caso real: categoria 'Loans and financing', valor -3408.84)", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD", name: "Cartão Gold" });
    const contaCorrente = await createAccountWithBankItem({ name: "Conta Corrente" });
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "3408.84",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-pagamento-fatura-real",
        category: "Loans and financing",
        amount: "-3408.84",
        date: new Date("2026-08-05T12:00:00.000Z"),
        description: "Pagamento de fatura do cartão Gold",
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.despesa).toBe("0.00");
    expect(summary.porCategoria).toEqual([]);
    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 1, total: "3408.84" });
  });

  it("CASO 2 dos 3: MESMO valor, mas FORA da janela de data -> conta normal como despesa (nao e o pagamento DAQUELA fatura)", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD" });
    const contaCorrente = await createAccountWithBankItem();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "3408.84",
      }),
    });
    // 21 dias antes do vencimento - bem fora da janela de +-10 dias.
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-mesmo-valor-fora-da-janela",
        category: "Loans and financing",
        amount: "-3408.84",
        date: new Date("2026-07-20T12:00:00.000Z"),
        description: "Debito coincidentemente igual ao total da fatura, mas fora da janela",
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary.despesa).toBe("3408.84");
    expect(summary.porCategoria).toEqual([
      { category: "Loans and financing", total: "3408.84" },
    ]);
    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 0, total: "0.00" });
  });

  it("CASO 3 dos 3: gasto REAL de 'Loans and financing' que NAO casa com nenhuma fatura (valor diferente) -> conta como despesa - a categoria inteira NAO e excluida, so o que casa com fatura", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD" });
    const contaCorrente = await createAccountWithBankItem();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "3408.84",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-loans-financing-real-sem-match",
        category: "Loans and financing",
        amount: "-500.00",
        date: new Date("2026-08-05T12:00:00.000Z"),
        description: "Parcela de emprestimo real, nao relacionada a fatura do cartao",
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.despesa).toBe("500.00");
    expect(summary.porCategoria).toEqual([
      { category: "Loans and financing", total: "500.00" },
    ]);
    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 0, total: "0.00" });
  });

  it("no limite EXATO da janela (+10 dias do vencimento) -> ainda casa (janela inclusiva nos dois extremos)", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD" });
    const contaCorrente = await createAccountWithBankItem();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "3408.84",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-no-limite-da-janela",
        category: "Loans and financing",
        amount: "-3408.84",
        date: new Date("2026-08-20T00:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 1, total: "3408.84" });
    expect(summary.despesa).toBe("0.00");
  });

  it("valor POSITIVO (credito/estorno) igual ao total da fatura, dentro da janela -> NAO e excluido de receita: SO debito conta como pagamento de fatura", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD" });
    const contaCorrente = await createAccountWithBankItem();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "3408.84",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-credito-mesmo-valor",
        category: "Non-recurring income",
        amount: "3408.84",
        date: new Date("2026-08-05T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.receita).toBe("3408.84");
    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 0, total: "0.00" });
  });

  it("um debito NA PROPRIA conta CREDIT_CARD, igual ao total da fatura e dentro da janela, NAO e excluido - a regra e SO para conta nao-cartao (a decisao fala em 'debito de conta nao-cartao')", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD" });
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "3408.84",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(cartao.id, {
        pluggyTransactionId: "tx-debito-na-propria-conta-cartao",
        category: "Loans and financing",
        amount: "-3408.84",
        date: new Date("2026-08-05T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.despesa).toBe("3408.84");
    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 0, total: "0.00" });
  });

  it("a janela ATRAVESSA a borda do mes: fatura com dueDate no mes SEGUINTE ao mes consultado ainda casa - prova que CreditCardBill e buscada SEM filtro de mes", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD" });
    const contaCorrente = await createAccountWithBankItem();
    // dueDate em julho; pagamento feito em junho, 5 dias antes - dentro da
    // janela de +-10 dias, mas em MES DIFERENTE do vencimento.
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        dueDate: new Date("2026-07-03T00:00:00.000Z"),
        totalAmount: "1200.00",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-pagamento-antecipado-mes-anterior",
        category: "Loans and financing",
        amount: "-1200.00",
        date: new Date("2026-06-28T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-06");

    expect(summary.despesa).toBe("0.00");
    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 1, total: "1200.00" });
  });

  it("duas faturas com o MESMO total; a transacao casa com a janela de SO uma delas -> ainda exclui uma unica vez (nao duplica a exclusao)", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD" });
    const contaCorrente = await createAccountWithBankItem();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        pluggyBillId: "bill-mes-1",
        dueDate: new Date("2026-06-10T00:00:00.000Z"),
        totalAmount: "800.00",
      }),
    });
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        pluggyBillId: "bill-mes-2",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "800.00",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-casa-so-com-a-segunda",
        category: "Loans and financing",
        amount: "-800.00",
        date: new Date("2026-08-08T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 1, total: "800.00" });
  });
});

describe("getMonthlySummary - pagamentosFaturaExcluidos e transferenciasExcluidas SEPARADOS, os dois transparentes (Criterio de aceite #3, decisao documentada desta task)", () => {
  it("uma transferencia (categoria 'Transfers') e um pagamento de fatura (casado por valor+janela) no MESMO mes contam CADA UM no proprio campo, nunca somados um dentro do outro", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD" });
    const contaCorrente = await createAccountWithBankItem();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "3408.84",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-pagamento-fatura-separado",
        category: "Loans and financing",
        amount: "-3408.84",
        date: new Date("2026-08-05T12:00:00.000Z"),
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-transferencia-separada",
        category: "Transfers",
        amount: "-600.00",
        date: new Date("2026-08-12T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 1, total: "3408.84" });
    expect(summary.transferenciasExcluidas).toEqual({ count: 1, total: "600.00" });
    expect(summary.despesa).toBe("0.00");
  });

  it("sem NENHUM pagamento de fatura no mes, pagamentosFaturaExcluidos e {count:0, total:'0.00'} (nao esconde o campo, mesmo zerado)", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-so-despesa-normal",
        category: "Housing",
        amount: "-100.00",
        date: new Date("2026-08-05T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.pagamentosFaturaExcluidos).toEqual({ count: 0, total: "0.00" });
  });
});

/**
 * TASK-014 (Criterio de aceite #4) - gasto por metodo: credito (contas
 * CREDIT_CARD), Pix/TED, debito, dinheiro. Usa contas de tipos diferentes
 * (CHECKING/CASH/CREDIT_CARD) e `Transaction.method` variados - a MESMA
 * base de `despesa` (exclui transferencias e pagamentos de fatura).
 */
describe("getMonthlySummary - porMetodo, gasto por metodo (Criterio de aceite #4, TASK-014)", () => {
  it("classifica gastos de contas/metodos variados nos 4 buckets corretos, cada bucket somando SO o que e dele", async () => {
    const contaCorrente = await createAccountWithBankItem({ name: "Conta Corrente" });
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD", name: "Cartão Gold" });
    const dinheiro = await createAccountWithBankItem({ type: "CASH", name: "Dinheiro" });

    // credito: compra no cartao (ja normalizada negativa, DT-007).
    await prisma.transaction.create({
      data: buildTransaction(cartao.id, {
        pluggyTransactionId: "tx-metodo-credito",
        category: "Online shopping",
        amount: "-138.83",
        method: null,
        date: new Date("2026-08-03T12:00:00.000Z"),
      }),
    });
    // pixTed: PIX na conta corrente.
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-metodo-pix",
        category: "Services",
        amount: "-90.00",
        method: "PIX",
        date: new Date("2026-08-04T12:00:00.000Z"),
      }),
    });
    // pixTed: TED na conta corrente (mesmo bucket de PIX).
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-metodo-ted",
        category: "Services",
        amount: "-200.00",
        method: "TED",
        date: new Date("2026-08-05T12:00:00.000Z"),
      }),
    });
    // debito: DEBIT na conta corrente.
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-metodo-debito",
        category: "Supermarket",
        amount: "-60.00",
        method: "DEBIT",
        date: new Date("2026-08-06T12:00:00.000Z"),
      }),
    });
    // dinheiro: lancamento manual na conta Dinheiro (CASH).
    await prisma.transaction.create({
      data: buildTransaction(dinheiro.id, {
        pluggyTransactionId: null,
        source: "MANUAL",
        category: null,
        amount: "-45.50",
        method: "CASH",
        date: new Date("2026-08-07T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.porMetodo).toEqual({
      credito: "138.83",
      pixTed: "290.00",
      debito: "60.00",
      dinheiro: "45.50",
    });
    // despesa continua sendo a soma de TUDO, independente do metodo.
    expect(summary.despesa).toBe("534.33");
  });

  it("duas transacoes no MESMO bucket somam juntas (nao pega so a ultima)", async () => {
    const contaCorrente = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-pix-1",
        amount: "-50.00",
        method: "PIX",
        date: new Date("2026-08-01T12:00:00.000Z"),
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-pix-2",
        amount: "-25.00",
        method: "TED",
        date: new Date("2026-08-02T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.porMetodo.pixTed).toBe("75.00");
  });

  it("um gasto com method NULL (sem paymentData) e conta CHECKING nao entra em NENHUM dos 4 buckets, mas continua contando em despesa", async () => {
    const contaCorrente = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-metodo-nulo",
        category: "Housing",
        amount: "-300.00",
        method: null,
        date: new Date("2026-08-01T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.porMetodo).toEqual({
      credito: "0.00",
      pixTed: "0.00",
      debito: "0.00",
      dinheiro: "0.00",
    });
    expect(summary.despesa).toBe("300.00");
  });

  it("um pagamento de fatura EXCLUIDO (casado por valor+janela) NAO entra em porMetodo, mesmo tendo method preenchido", async () => {
    const cartao = await createAccountWithBankItem({ type: "CREDIT_CARD" });
    const contaCorrente = await createAccountWithBankItem();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cartao.id, {
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "3408.84",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-pagamento-fatura-com-method",
        category: "Loans and financing",
        amount: "-3408.84",
        method: "DEBIT",
        date: new Date("2026-08-05T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.porMetodo.debito).toBe("0.00");
  });

  it("receita (positiva) NAO entra em porMetodo - porMetodo e SO gasto, mesma convencao de porCategoria", async () => {
    const contaCorrente = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(contaCorrente.id, {
        pluggyTransactionId: "tx-receita-nao-conta-metodo",
        category: "Non-recurring income",
        amount: "1000.00",
        method: "PIX",
        date: new Date("2026-08-01T12:00:00.000Z"),
      }),
    });

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-08");

    expect(summary.porMetodo).toEqual({
      credito: "0.00",
      pixTed: "0.00",
      debito: "0.00",
      dinheiro: "0.00",
    });
  });
});
