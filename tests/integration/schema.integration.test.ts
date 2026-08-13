import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../setup/reset-db";
import {
  buildAccount,
  buildBankItem,
  buildRecurringBill,
  buildRecurringBillInstance,
  buildTransaction,
} from "../fixtures/db";

/**
 * Testes de integracao do schema Prisma + Postgres (TASK-001).
 * Batem no database real de teste (gestor_test, via docker-compose +
 * .env.test) atraves do singleton `prisma` de lib/db.ts.
 *
 * Mapeamento -> docs/tasks/TASK-001.md secao 2/3:
 *   - Cenario 1 / Criterio 1 e 2: "cria as 5 tabelas esperadas"
 *   - Criterio 2: "cria indices em Transaction.date e Transaction.accountId"
 *   - Criterio 2: "relaciona os 5 models entre si..."
 *   - Cenario 2 / Criterio 3: "rejeita uma segunda Transaction com o mesmo pluggyTransactionId"
 *   - Cenario 3 / Criterio 3: "aceita duas Transactions MANUAL sem pluggyTransactionId"
 *   - Cenario 4: "grava e le amount negativo (-1234.56) sem erro de arredondamento"
 *   - Cenario 5 / Criterio 2: "deleta as Accounts em cascade ao deletar o BankItem"
 *   - Edge cases pedidos no prompt do qa: amount 0, data invalida, FK inexistente
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

describe("Prisma schema + Postgres migrations", () => {
  it("cria as 5 tabelas esperadas (BankItem, Account, Transaction, RecurringBill, RecurringBillInstance)", async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    const tableNames = tables.map((t: { table_name: string }) => t.table_name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "BankItem",
        "Account",
        "Transaction",
        "RecurringBill",
        "RecurringBillInstance",
      ]),
    );
  });

  it("cria indices em Transaction.date e Transaction.accountId", async () => {
    // Consulta o catalogo (pg_index/pg_attribute) em vez de casar substring
    // no texto de pg_indexes.indexdef: o Postgres so cita identificadores
    // que exigem (ex.: "accountId", por causa da maiuscula) e nao cita os
    // que nao exigem (ex.: date, minusculo) - casar '"date"' contra o texto
    // de indexdef e insatisfazivel mesmo com o indice existindo. Resolvendo
    // os nomes de coluna via pg_attribute, a asserção fica robusta a quoting
    // e continua falhando de verdade se o indice for removido do schema.
    const indexedColumns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT DISTINCT a.attname AS column_name
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
      WHERE t.relname = 'Transaction' AND n.nspname = 'public'
    `;
    const columnNames = indexedColumns.map(
      (c: { column_name: string }) => c.column_name,
    );

    expect(columnNames).toContain("date");
    expect(columnNames).toContain("accountId");
  });

  it("relaciona os 5 models entre si via @relation explicitas", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    const transaction = await prisma.transaction.create({
      data: buildTransaction(account.id),
    });
    const recurringBill = await prisma.recurringBill.create({
      data: buildRecurringBill(),
    });
    const instance = await prisma.recurringBillInstance.create({
      data: buildRecurringBillInstance(recurringBill.id, {
        transactionId: transaction.id,
      }),
    });

    expect(account.bankItemId).toBe(bankItem.id);
    expect(transaction.accountId).toBe(account.id);
    expect(instance.recurringBillId).toBe(recurringBill.id);
    expect(instance.transactionId).toBe(transaction.id);
  });
});

describe("Transaction.pluggyTransactionId - deduplicacao (unique + nullable)", () => {
  it("rejeita uma segunda Transaction com o mesmo pluggyTransactionId", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    const duplicateId = `pluggy-dup-${Date.now()}`;

    await prisma.transaction.create({
      data: buildTransaction(account.id, { pluggyTransactionId: duplicateId }),
    });

    let caughtError: unknown;
    try {
      await prisma.transaction.create({
        data: buildTransaction(account.id, {
          pluggyTransactionId: duplicateId,
        }),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect((caughtError as { code?: string }).code).toBe("P2002");
  });

  it("aceita duas Transactions MANUAL sem pluggyTransactionId (NULL nao colide no indice unico)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });

    const tx1 = await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: undefined,
        source: "MANUAL",
      }),
    });
    const tx2 = await prisma.transaction.create({
      data: buildTransaction(account.id, {
        pluggyTransactionId: undefined,
        source: "MANUAL",
      }),
    });

    expect(tx1.pluggyTransactionId).toBeNull();
    expect(tx2.pluggyTransactionId).toBeNull();
    expect(tx1.id).not.toBe(tx2.id);
  });
});

describe("Transaction.amount - precisao decimal", () => {
  it("grava e le -1234.56 sem erro de arredondamento de ponto flutuante", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });

    const created = await prisma.transaction.create({
      data: buildTransaction(account.id, { amount: "-1234.56" }),
    });
    const found = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(found.amount.toFixed(2)).toBe("-1234.56");
  });

  it("aceita amount 0.00 (limite entre entrada e saida)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });

    const created = await prisma.transaction.create({
      data: buildTransaction(account.id, { amount: "0.00" }),
    });

    expect(created.amount.toFixed(2)).toBe("0.00");
  });
});

describe("BankItem -> Account cascade delete", () => {
  it("deleta as Accounts em cascade ao deletar o BankItem", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account1 = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    const account2 = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });

    await prisma.bankItem.delete({ where: { id: bankItem.id } });

    const remainingAccounts = await prisma.account.findMany({
      where: { bankItemId: bankItem.id },
    });
    expect(remainingAccounts).toHaveLength(0);

    const found1 = await prisma.account.findUnique({
      where: { id: account1.id },
    });
    const found2 = await prisma.account.findUnique({
      where: { id: account2.id },
    });
    expect(found1).toBeNull();
    expect(found2).toBeNull();
  });
});

describe("BankItem.archivedAt - coluna nullable no Postgres real (Criterio 1 da TASK-005, DT-013)", () => {
  it("a coluna archivedAt existe, e nullable e do tipo timestamp", async () => {
    const columns = await prisma.$queryRaw<
      { column_name: string; is_nullable: string; data_type: string }[]
    >`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'BankItem'
        AND column_name = 'archivedAt'
    `;

    expect(columns).toHaveLength(1);
    expect(columns[0].is_nullable).toBe("YES");
    expect(columns[0].data_type).toMatch(/timestamp/i);
  });

  it("um BankItem criado sem archivedAt persiste com o valor NULL (nao quebra insercao existente)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });

    expect(bankItem.archivedAt).toBeNull();
  });
});

describe("Edge cases de integridade", () => {
  it("rejeita Transaction com accountId inexistente (integridade referencial)", async () => {
    let caughtError: unknown;
    try {
      await prisma.transaction.create({
        data: buildTransaction("conta-que-nao-existe"),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect((caughtError as { code?: string }).code).toBe("P2003");
  });

  it("rejeita Transaction com uma data invalida", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });

    await expect(
      prisma.transaction.create({
        data: buildTransaction(account.id, {
          date: new Date("nao-e-uma-data-valida"),
        }),
      }),
    ).rejects.toThrow();
  });
});
