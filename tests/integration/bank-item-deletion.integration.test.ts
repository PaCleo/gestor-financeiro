import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../setup/reset-db";
import { buildAccount, buildBankItem, buildTransaction } from "../fixtures/db";

/**
 * Testes de integracao da politica de exclusao de BankItem (TASK-002).
 * Batem no Postgres real de teste (gestor_test), como os testes de
 * schema.integration.test.ts da TASK-001.
 *
 * Contrato assumido (definido pelo qa nesta task - ver secao 5 do
 * TASK-002.md - o coder implementa exatamente assim):
 *
 *   lib/bank-item.ts
 *     export class BankItemHasTransactionsError extends Error {}
 *     export async function deleteBankItem(bankItemId: string): Promise<void>
 *
 * deleteBankItem deve:
 *   - deletar o BankItem e suas Accounts (cascade) quando nenhuma Account
 *     tiver Transaction associada;
 *   - recusar a exclusao (sem apagar absolutamente nada - nem o BankItem,
 *     nem nenhuma Account, nem a Transaction) quando QUALQUER Account do
 *     BankItem tiver ao menos uma Transaction, lancando
 *     BankItemHasTransactionsError com mensagem util para o usuario que
 *     NAO vaza connection string, nome de constraint do Postgres, SQLSTATE
 *     ou qualquer outro detalhe interno do driver/Prisma.
 *
 * Mapeamento -> docs/tasks/TASK-002.md secao 2/3:
 *   - Cenario 1 / Criterio 3: "exclui o BankItem e suas Accounts..."
 *   - Cenario 2 / Criterio 2: "recusa a exclusao quando a Account tem..." e
 *     "recusa a exclusao mesmo quando so UMA das varias Accounts..."
 *   - Cenario 3 / Criterio 4: "lanca um erro de dominio nomeado..."
 *   - Criterio 1: "declara Account->Transaction como ON DELETE RESTRICT..."
 */

const FORBIDDEN_SUBSTRINGS = [
  "postgresql://",
  "postgres://",
  "Transaction_accountId_fkey",
  "violates foreign key constraint",
  "23503",
  "P2003",
  "DriverAdapterError",
  "driverAdapterError",
  "prisma.bankItem.delete",
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
];

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Politica de onDelete no Postgres (Criterio 1 da TASK-002)", () => {
  it("Account->BankItem e ON DELETE CASCADE e Transaction->Account e ON DELETE RESTRICT no catalogo do Postgres", async () => {
    // confdeltype e do tipo interno "char" do Postgres, que o driver
    // adapter do Prisma nao consegue desserializar diretamente - cast
    // explicito para text, como a mensagem de erro do Prisma recomenda.
    const constraints = await prisma.$queryRaw<
      { conname: string; confdeltype: string }[]
    >`
      SELECT conname, confdeltype::text AS confdeltype
      FROM pg_constraint
      WHERE contype = 'f'
        AND conname IN ('Account_bankItemId_fkey', 'Transaction_accountId_fkey')
    `;

    const byName = Object.fromEntries(
      constraints.map((c) => [c.conname, c.confdeltype]),
    );

    // confdeltype: 'c' = CASCADE, 'r' = RESTRICT (ver pg_constraint docs)
    expect(byName["Account_bankItemId_fkey"]).toBe("c");
    expect(byName["Transaction_accountId_fkey"]).toBe("r");
  });
});

describe("deleteBankItem - BankItem sem transacoes (Cenario 1)", () => {
  it("exclui o BankItem e suas Accounts em cascade quando nenhuma Account tem Transaction", async () => {
    const { deleteBankItem } = await import("@/lib/bank-item");

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account1 = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    const account2 = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });

    await expect(deleteBankItem(bankItem.id)).resolves.toBeUndefined();

    expect(
      await prisma.bankItem.findUnique({ where: { id: bankItem.id } }),
    ).toBeNull();
    expect(
      await prisma.account.findUnique({ where: { id: account1.id } }),
    ).toBeNull();
    expect(
      await prisma.account.findUnique({ where: { id: account2.id } }),
    ).toBeNull();
  });
});

describe("deleteBankItem - BankItem com transacoes: recusa e preserva os dados (Cenario 2)", () => {
  it("recusa a exclusao quando a Account tem ao menos uma Transaction e NAO apaga nada", async () => {
    const { deleteBankItem } = await import("@/lib/bank-item");

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    const transaction = await prisma.transaction.create({
      data: buildTransaction(account.id),
    });

    await expect(deleteBankItem(bankItem.id)).rejects.toThrow();

    const survivingBankItem = await prisma.bankItem.findUnique({
      where: { id: bankItem.id },
    });
    const survivingAccount = await prisma.account.findUnique({
      where: { id: account.id },
    });
    const survivingTransaction = await prisma.transaction.findUnique({
      where: { id: transaction.id },
    });

    expect(survivingBankItem).not.toBeNull();
    expect(survivingBankItem?.id).toBe(bankItem.id);
    expect(survivingAccount).not.toBeNull();
    expect(survivingAccount?.id).toBe(account.id);
    expect(survivingTransaction).not.toBeNull();
    expect(survivingTransaction?.id).toBe(transaction.id);
  });

  it("recusa a exclusao mesmo quando so UMA das varias Accounts do BankItem tem Transaction - nem a Account vazia e apagada", async () => {
    const { deleteBankItem } = await import("@/lib/bank-item");

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const emptyAccount = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    const accountWithTx = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    const transaction = await prisma.transaction.create({
      data: buildTransaction(accountWithTx.id),
    });

    await expect(deleteBankItem(bankItem.id)).rejects.toThrow();

    expect(
      await prisma.bankItem.findUnique({ where: { id: bankItem.id } }),
    ).not.toBeNull();
    expect(
      await prisma.account.findUnique({ where: { id: emptyAccount.id } }),
    ).not.toBeNull();
    expect(
      await prisma.account.findUnique({ where: { id: accountWithTx.id } }),
    ).not.toBeNull();
    expect(
      await prisma.transaction.findUnique({ where: { id: transaction.id } }),
    ).not.toBeNull();
  });

  it("lanca um erro de dominio nomeado (BankItemHasTransactionsError), com mensagem util, sem vazar detalhe interno do Postgres/Prisma (Cenario 3 / Criterio 4)", async () => {
    const { deleteBankItem, BankItemHasTransactionsError } = await import(
      "@/lib/bank-item"
    );

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    await prisma.transaction.create({ data: buildTransaction(account.id) });

    let caughtError: unknown;
    try {
      await deleteBankItem(bankItem.id);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(BankItemHasTransactionsError);
    expect(caughtError).toBeInstanceOf(Error);

    const message = (caughtError as Error).message;
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);

    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(message).not.toContain(forbidden);
    }
  });
});

describe("deleteBankItem - borda", () => {
  it("rejeita ao tentar excluir um BankItem inexistente", async () => {
    const { deleteBankItem } = await import("@/lib/bank-item");

    await expect(
      deleteBankItem("bank-item-que-nao-existe"),
    ).rejects.toThrow();
  });
});
