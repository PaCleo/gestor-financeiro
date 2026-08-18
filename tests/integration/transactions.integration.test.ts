import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../setup/reset-db";
import { buildAccount, buildBankItem, buildTransaction } from "../fixtures/db";

/**
 * Testes de integracao de `listTransactions`/`listAccountsForFilter`
 * (lib/transactions.ts, TASK-007 - Tela de transacoes com filtros, fecha a
 * Fase 2). Batem no Postgres REAL de teste (gestor_test) - nenhum mock de
 * Prisma aqui (DT-004: `vi.spyOn(prisma, ...)` e engolido pelo Proxy de
 * `lib/db.ts`; a unica forma confiavel de testar uma query e contra o banco
 * de verdade). Nenhuma chamada a Pluggy acontece nesta tela - os dados ja
 * estao sincronizados no Postgres (Fase 2 anterior, TASK-006); esta task so
 * LE o que ja esta la.
 *
 * Este e o arquivo mais importante da task para dois criterios:
 *   - Criterio de aceite #4 (paginacao REAL): insere 432 transacoes - o
 *     numero exato do Item real (docs/PREMISSA.md secao 11) - para que uma
 *     query SEM limite (que passaria despercebida com poucos dados de
 *     teste) seja forcada a falhar aqui.
 *   - Atencao a fuso do prompt: os testes de periodo verificam
 *     explicitamente os instantes de fronteira (23:59:59 UTC do ultimo dia,
 *     00:00:00 UTC do primeiro dia de fora) para provar que o filtro de
 *     data nao corta a esmo por causa de fuso horario.
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

describe("listTransactions - categoria efetiva contra o Postgres real (Criterio de aceite #2, DT-010, escopo desta task)", () => {
  it("transacao com categoryOverride preenchido mostra o OVERRIDE, nao a category da Pluggy", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        category: "Online shopping",
        categoryOverride: "Presentes",
      }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 50 });

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].category).toBe("Presentes");
  });

  it("transacao SEM categoryOverride (null) mostra a category da Pluggy", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        category: "Housing",
        categoryOverride: null,
      }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 50 });

    expect(result.transactions[0].category).toBe("Housing");
  });

  it("transacao sem category NEM categoryOverride mostra null, sem placeholder", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, { category: null, categoryOverride: null }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 50 });

    expect(result.transactions[0].category).toBeNull();
  });
});

describe("listTransactions - filtro por conta (secao 2 e Criterio de aceite #1/#3)", () => {
  it("com accountId, retorna SOMENTE as transacoes daquela conta, mesmo com outra conta tendo transacoes", async () => {
    const accountA = await createAccountWithBankItem({ name: "Conta A" });
    const accountB = await createAccountWithBankItem({ name: "Conta B" });
    await prisma.transaction.create({
      data: buildTransaction(accountA.id, { description: "Tx A1" }),
    });
    await prisma.transaction.create({
      data: buildTransaction(accountA.id, { description: "Tx A2" }),
    });
    await prisma.transaction.create({
      data: buildTransaction(accountB.id, { description: "Tx B1" }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({
      accountId: accountA.id,
      page: 1,
      limit: 50,
    });

    expect(result.transactions).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.transactions.every((t) => t.accountId === accountA.id)).toBe(
      true,
    );
  });

  it("sem filtro de conta, retorna transacoes de TODAS as contas", async () => {
    const accountA = await createAccountWithBankItem();
    const accountB = await createAccountWithBankItem();
    await prisma.transaction.create({ data: buildTransaction(accountA.id) });
    await prisma.transaction.create({ data: buildTransaction(accountB.id) });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 50 });

    expect(result.total).toBe(2);
  });

  it("accountId que NAO existe no banco -> rejeita com AccountNotFoundError, sem quebrar (ponto de atencao do prompt: 'conta inexistente' -> 400 na rota, nao 500)", async () => {
    const { listTransactions, AccountNotFoundError } = await import(
      "@/lib/transactions"
    );

    await expect(
      listTransactions({ accountId: "conta-que-nao-existe", page: 1, limit: 50 }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});

describe("listTransactions - filtro por periodo, com atencao ao FUSO na comparacao de datas (secao 2 e Criterio de aceite #1/#3)", () => {
  it("o ultimo instante do ultimo dia do intervalo (23:59:59 UTC) e INCLUIDO; o primeiro instante do dia seguinte e EXCLUIDO", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        date: new Date("2026-07-31T23:59:59.000Z"),
        description: "Ultimo instante DENTRO do intervalo",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        date: new Date("2026-08-01T00:00:00.000Z"),
        description: "Primeiro instante FORA do intervalo",
      }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      page: 1,
      limit: 50,
    });

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe(
      "Ultimo instante DENTRO do intervalo",
    );
  });

  it("o primeiro instante do primeiro dia do intervalo (00:00:00 UTC) e INCLUIDO; o ultimo instante do dia anterior e EXCLUIDO", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        date: new Date("2026-07-01T00:00:00.000Z"),
        description: "Primeiro instante DENTRO do intervalo",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        date: new Date("2026-06-30T23:59:59.000Z"),
        description: "Ultimo instante ANTES do intervalo",
      }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      page: 1,
      limit: 50,
    });

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe(
      "Primeiro instante DENTRO do intervalo",
    );
  });

  it("so startDate (sem endDate) -> traz tudo a partir daquele dia, sem teto superior", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, { date: new Date("2026-07-01T00:00:00.000Z") }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, { date: new Date("2030-01-01T00:00:00.000Z") }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, { date: new Date("2020-01-01T00:00:00.000Z") }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ startDate: "2026-07-01", page: 1, limit: 50 });

    expect(result.total).toBe(2);
  });

  it("so endDate (sem startDate) -> traz tudo ate aquele dia, sem piso inferior", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, { date: new Date("2020-01-01T00:00:00.000Z") }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, { date: new Date("2026-07-31T23:59:59.000Z") }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, { date: new Date("2030-01-01T00:00:00.000Z") }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ endDate: "2026-07-31", page: 1, limit: 50 });

    expect(result.total).toBe(2);
  });
});

describe("listTransactions - paginacao REAL: NAO retorna a tabela inteira (Criterio de aceite #4)", () => {
  it(
    "com 432 transacoes no banco (o numero exato do Item real, docs/PREMISSA.md secao 11), a resposta traz SOMENTE DEFAULT_PAGE_SIZE por pagina - a prova central de que take/skip (ou cursor) sao aplicados de verdade, nao so em memoria depois de buscar tudo",
    async () => {
      const account = await createAccountWithBankItem();
      const TOTAL = 432;
      for (let i = 0; i < TOTAL; i += 1) {
        await prisma.transaction.create({
          data: buildTransaction(account.id, {
            pluggyTransactionId: `tx-pagina-${i}`,
            date: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
          }),
        });
      }

      const { listTransactions, DEFAULT_PAGE_SIZE } = await import(
        "@/lib/transactions"
      );
      const result = await listTransactions({ page: 1, limit: DEFAULT_PAGE_SIZE });

      expect(result.total).toBe(TOTAL);
      expect(result.transactions).toHaveLength(DEFAULT_PAGE_SIZE);
      expect(result.transactions.length).toBeLessThan(TOTAL);
    },
    30000,
  );

  it(
    "a segunda pagina traz um conjunto DIFERENTE de transacoes da primeira (skip aplicado de verdade - pega o bug de 'take sem skip', que devolveria a mesma pagina sempre)",
    async () => {
      const account = await createAccountWithBankItem();
      const TOTAL = 120;
      for (let i = 0; i < TOTAL; i += 1) {
        await prisma.transaction.create({
          data: buildTransaction(account.id, {
            pluggyTransactionId: `tx-skip-${i}`,
            date: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
          }),
        });
      }

      const { listTransactions } = await import("@/lib/transactions");
      const firstPage = await listTransactions({ page: 1, limit: 50 });
      const secondPage = await listTransactions({ page: 2, limit: 50 });

      expect(firstPage.transactions).toHaveLength(50);
      expect(secondPage.transactions).toHaveLength(50);

      const firstIds = new Set(firstPage.transactions.map((t) => t.id));
      const secondIds = new Set(secondPage.transactions.map((t) => t.id));
      const intersection = [...firstIds].filter((id) => secondIds.has(id));
      expect(intersection).toHaveLength(0);
    },
    30000,
  );

  it("respeita um limit customizado menor que DEFAULT_PAGE_SIZE, mantendo total correto", async () => {
    const account = await createAccountWithBankItem();
    for (let i = 0; i < 10; i += 1) {
      await prisma.transaction.create({
        data: buildTransaction(account.id, { pluggyTransactionId: `tx-limit-${i}` }),
      });
    }

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 3 });

    expect(result.transactions).toHaveLength(3);
    expect(result.total).toBe(10);
    expect(result.limit).toBe(3);
    expect(result.page).toBe(1);
  });
});

describe("listTransactions - ordenacao por data decrescente por padrao (Criterio de aceite #6)", () => {
  it("as transacoes vem da mais recente para a mais antiga, mesmo inseridas fora de ordem no banco", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-meio",
        date: new Date("2026-07-15T00:00:00.000Z"),
        description: "Meio",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-antiga",
        date: new Date("2026-07-01T00:00:00.000Z"),
        description: "Antiga",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-recente",
        date: new Date("2026-07-31T00:00:00.000Z"),
        description: "Recente",
      }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 50 });

    expect(result.transactions.map((t) => t.description)).toEqual([
      "Recente",
      "Meio",
      "Antiga",
    ]);
  });
});

describe("listTransactions - status PENDING e POSTED sao ambos retornados, sem filtro implicito por status (Criterio de aceite #5)", () => {
  it("uma transacao PENDING e uma POSTED aparecem as duas, cada uma com o status correto preservado", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-pending",
        status: "PENDING",
        description: "Compra pendente",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-posted",
        status: "POSTED",
        description: "Compra fechada",
      }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 50 });

    const pending = result.transactions.find((t) => t.description === "Compra pendente");
    const posted = result.transactions.find((t) => t.description === "Compra fechada");
    expect(pending?.status).toBe("PENDING");
    expect(posted?.status).toBe("POSTED");
  });
});

describe("listTransactions - amount preservado com precisao decimal, incluindo zero e negativo (borda)", () => {
  it("amount negativo, positivo e zero (borda) sao devolvidos exatamente como persistidos", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-neg",
        amount: "-123.45",
        description: "Negativa",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-pos",
        amount: "500.00",
        description: "Positiva",
      }),
    });
    await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: "tx-zero",
        amount: "0.00",
        description: "Zero",
      }),
    });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 50 });

    const byDescription = (d: string) =>
      result.transactions.find((t) => t.description === d);
    expect(Number(byDescription("Negativa")?.amount)).toBeCloseTo(-123.45);
    expect(Number(byDescription("Positiva")?.amount)).toBeCloseTo(500);
    expect(Number(byDescription("Zero")?.amount)).toBeCloseTo(0);
  });
});

describe("listTransactions - nao reintroduz PII na resposta (defesa em profundidade, secao 2 - 'nenhum campo de PII')", () => {
  it("cada item devolvido expoe SOMENTE os campos esperados - nenhum paymentData/taxNumber/documentNumber cru", async () => {
    const account = await createAccountWithBankItem();
    await prisma.transaction.create({ data: buildTransaction(account.id) });

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 50 });

    const keys = Object.keys(result.transactions[0]).sort();
    expect(keys).toEqual(
      [
        "accountId",
        "accountName",
        "amount",
        "category",
        "date",
        "description",
        "id",
        "method",
        "status",
      ].sort(),
    );
  });
});

describe("listAccountsForFilter - contas disponiveis para o filtro (Criterio de aceite #3)", () => {
  it("devolve id e name de cada Account existente no banco", async () => {
    await createAccountWithBankItem({ name: "Conta Corrente" });
    await createAccountWithBankItem({ name: "Cartao" });

    const { listAccountsForFilter } = await import("@/lib/transactions");
    const accounts = await listAccountsForFilter();

    expect(accounts.map((a) => a.name).sort()).toEqual(["Cartao", "Conta Corrente"]);
    expect(accounts.every((a) => typeof a.id === "string" && a.id.length > 0)).toBe(
      true,
    );
  });

  it("sem nenhuma Account no banco, devolve array vazio (nao lanca)", async () => {
    const { listAccountsForFilter } = await import("@/lib/transactions");
    await expect(listAccountsForFilter()).resolves.toEqual([]);
  });
});
