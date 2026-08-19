import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../setup/reset-db";
import { buildAccount, buildBankItem, buildTransaction } from "../fixtures/db";

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
 *     // Passos: 1) busca TODAS as Transaction no where acima (sem
 *     // paginacao - o dashboard soma TUDO do mes, nao lista linha a
 *     // linha); 2) para cada linha, `isTransfer = TRANSFER_CATEGORIES
 *     // includes row.category` (CRUA); 3) transferencia -> conta em
 *     // transferenciasExcluidas (count++, total += abs(amount)), NAO entra
 *     // em receita/despesa/porCategoria; 4) nao-transferencia com amount >
 *     // 0 -> soma em receita; 5) nao-transferencia com amount < 0 -> soma
 *     // (abs) em despesa E no bucket de porCategoria da categoria EFETIVA
 *     // (resolveTransactionCategory de @/lib/transactions, ou
 *     // NO_CATEGORY_LABEL se null); 6) amount === 0 -> nao entra em
 *     // receita NEM despesa NEM porCategoria (nem transferencia, salvo se
 *     // a categoria crua for de transferencia - af entra em
 *     // transferenciasExcluidas com total += 0); 7) porCategoria ordenado
 *     // DECRESCENTE por total (Number(total) desc); 8) saldo = receita -
 *     // despesa (aritmetica decimal exata, nunca float/Number ao longo do
 *     // caminho - usar Prisma.Decimal ou equivalente).
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

  it("mes sem NENHUMA transacao devolve zeros e listas vazias, sem lancar", async () => {
    await createAccountWithBankItem();

    const { getMonthlySummary } = await import("@/lib/dashboard");
    const summary = await getMonthlySummary("2026-07");

    expect(summary).toEqual({
      month: "2026-07",
      receita: "0.00",
      despesa: "0.00",
      saldo: "0.00",
      porCategoria: [],
      transferenciasExcluidas: { count: 0, total: "0.00" },
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
