import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../setup/reset-db";
import { buildAccount, buildBankItem, buildCreditCardBill } from "../fixtures/db";

/**
 * Testes de integracao de `listBills`/`listBillsByCard` (lib/bills.ts,
 * TASK-011 - Fatura do cartao, fecha a Fase 5) e do proprio model
 * `CreditCardBill` no Postgres REAL de teste (gestor_test) - sem mock de
 * Prisma (DT-004). Nenhuma chamada a Pluggy acontece aqui: os dados ja
 * estao sincronizados (a sincronizacao ponta a ponta, incluindo dedup contra
 * o SDK mockado, esta na extensao de tests/integration/sync.integration.test.ts).
 *
 * `resetDatabase` (TRUNCATE ... CASCADE em BankItem/Account/...) ja limpa
 * `CreditCardBill` sozinho, gracas a FK `CreditCardBill.account -> Account`
 * (TRUNCATE CASCADE do Postgres propaga independente da politica de
 * `onDelete` da FK).
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

async function createCreditCardAccount(overrides: Record<string, unknown> = {}) {
  const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
  return prisma.account.create({
    data: buildAccount(bankItem.id, { type: "CREDIT_CARD", ...overrides }),
  });
}

async function createCheckingAccount(overrides: Record<string, unknown> = {}) {
  const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
  return prisma.account.create({
    data: buildAccount(bankItem.id, { type: "CHECKING", ...overrides }),
  });
}

describe("model CreditCardBill - unicidade de pluggyBillId no Postgres real (Criterio de aceite #1/#4, 'a dedup e sagrada')", () => {
  it("rejeita uma segunda CreditCardBill com o MESMO pluggyBillId (violacao de constraint unica)", async () => {
    const account = await createCreditCardAccount();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(account.id, { pluggyBillId: "bill-unico" }),
    });

    await expect(
      prisma.creditCardBill.create({
        data: buildCreditCardBill(account.id, { pluggyBillId: "bill-unico" }),
      }),
    ).rejects.toThrow();

    expect(
      await prisma.creditCardBill.count({ where: { pluggyBillId: "bill-unico" } }),
    ).toBe(1);
  });

  it("grava e le totalAmount/minimumPaymentAmount com precisao Decimal, sem erro de arredondamento (valores reais: 3408.84/511.32)", async () => {
    const account = await createCreditCardAccount();
    const bill = await prisma.creditCardBill.create({
      data: buildCreditCardBill(account.id, {
        totalAmount: "3408.84",
        minimumPaymentAmount: "511.32",
      }),
    });

    const reloaded = await prisma.creditCardBill.findUniqueOrThrow({
      where: { id: bill.id },
    });
    expect(reloaded.totalAmount.toFixed(2)).toBe("3408.84");
    expect(reloaded.minimumPaymentAmount?.toFixed(2)).toBe("511.32");
  });

  it("minimumPaymentAmount aceita null (fatura sem minimo definido)", async () => {
    const account = await createCreditCardAccount();
    const bill = await prisma.creditCardBill.create({
      data: buildCreditCardBill(account.id, { minimumPaymentAmount: null }),
    });

    expect(bill.minimumPaymentAmount).toBeNull();
  });
});

describe("model CreditCardBill - onDelete: Cascade com Account (decisao registrada no schema, Criterio de aceite #1)", () => {
  it("excluir a Account exclui suas CreditCardBills junto (cascade)", async () => {
    const account = await createCreditCardAccount();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(account.id, { pluggyBillId: "bill-cascade" }),
    });
    expect(await prisma.creditCardBill.count()).toBe(1);

    await prisma.account.delete({ where: { id: account.id } });

    expect(await prisma.creditCardBill.count()).toBe(0);
  });
});

describe("listBills - contra o Postgres real, sem filtro (Criterio de aceite #7)", () => {
  it("lista as faturas de TODOS os cartoes, ordenadas por dueDate DECRESCENTE", async () => {
    const account = await createCreditCardAccount();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(account.id, {
        pluggyBillId: "bill-julho",
        dueDate: new Date("2026-07-10T00:00:00.000Z"),
      }),
    });
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(account.id, {
        pluggyBillId: "bill-agosto",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
      }),
    });

    const { listBills } = await import("@/lib/bills");
    const result = await listBills();

    expect(result.map((b) => b.pluggyBillId)).toEqual([
      "bill-agosto",
      "bill-julho",
    ]);
  });

  it("totalAmount/minimumPaymentAmount saem como STRING (Decimal, nunca number/float)", async () => {
    const account = await createCreditCardAccount();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(account.id, {
        totalAmount: "3408.84",
        minimumPaymentAmount: "511.32",
      }),
    });

    const { listBills } = await import("@/lib/bills");
    const [result] = await listBills();

    expect(typeof result.totalAmount).toBe("string");
    expect(result.totalAmount).toBe("3408.84");
    expect(typeof result.minimumPaymentAmount).toBe("string");
    expect(result.minimumPaymentAmount).toBe("511.32");
  });

  it("minimumPaymentAmount null persiste como null na saida (nunca a string 'null')", async () => {
    const account = await createCreditCardAccount();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(account.id, { minimumPaymentAmount: null }),
    });

    const { listBills } = await import("@/lib/bills");
    const [result] = await listBills();

    expect(result.minimumPaymentAmount).toBeNull();
  });

  it("nenhuma fatura no banco -> array vazio, sem lancar", async () => {
    const { listBills } = await import("@/lib/bills");
    await expect(listBills()).resolves.toEqual([]);
  });
});

describe("listBills - filtro por accountId contra o Postgres real (Criterio de aceite #7)", () => {
  it("filtra so as faturas do cartao informado, ignorando as de outro cartao", async () => {
    const cardA = await createCreditCardAccount();
    const cardB = await createCreditCardAccount();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cardA.id, { pluggyBillId: "bill-card-a" }),
    });
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cardB.id, { pluggyBillId: "bill-card-b" }),
    });

    const { listBills } = await import("@/lib/bills");
    const result = await listBills({ accountId: cardA.id });

    expect(result).toHaveLength(1);
    expect(result[0].pluggyBillId).toBe("bill-card-a");
  });

  it("accountId de uma conta que NAO existe -> rejeita com AccountNotFoundError", async () => {
    const { listBills, AccountNotFoundError } = await import("@/lib/bills");

    await expect(
      listBills({ accountId: "conta-inexistente-de-verdade" }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});

describe("listBillsByCard - agrupado por cartao contra o Postgres real (secao 2, Criterio de aceite #7)", () => {
  it("so lista contas do tipo CREDIT_CARD - uma conta CHECKING nunca aparece, mesmo existindo no banco", async () => {
    await createCheckingAccount({ name: "Conta Corrente" });
    const card = await createCreditCardAccount({ name: "Cartao Unico" });
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(card.id),
    });

    const { listBillsByCard } = await import("@/lib/bills");
    const result = await listBillsByCard();

    expect(result).toHaveLength(1);
    expect(result[0].accountName).toBe("Cartao Unico");
  });

  it("cartao sem NENHUMA fatura aparece com current=null e history=[] (estado vazio, sem quebrar)", async () => {
    await createCreditCardAccount({ name: "Cartao Recem-Conectado" });

    const { listBillsByCard } = await import("@/lib/bills");
    const [group] = await listBillsByCard();

    expect(group.current).toBeNull();
    expect(group.history).toEqual([]);
  });

  it("cartao com 13 faturas (o numero real de um cartao na sondagem): a de vencimento MAIS RECENTE vira current, as outras 12 viram history em ordem decrescente", async () => {
    const card = await createCreditCardAccount();
    for (let month = 1; month <= 13; month += 1) {
      await prisma.creditCardBill.create({
        data: buildCreditCardBill(card.id, {
          pluggyBillId: `bill-mes-${month}`,
          dueDate: new Date(Date.UTC(2025, month - 1, 10)),
        }),
      });
    }

    const { listBillsByCard } = await import("@/lib/bills");
    const [group] = await listBillsByCard();

    expect(group.current?.pluggyBillId).toBe("bill-mes-13");
    expect(group.history).toHaveLength(12);
    const historyDueDates = group.history.map((bill) => bill.dueDate.getTime());
    const sortedDescending = [...historyDueDates].sort((a, b) => b - a);
    expect(historyDueDates).toEqual(sortedDescending);
  });

  it("cartao com uma fatura sem minimo definido: current.minimumPaymentAmount e null", async () => {
    const card = await createCreditCardAccount();
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(card.id, { minimumPaymentAmount: null }),
    });

    const { listBillsByCard } = await import("@/lib/bills");
    const [group] = await listBillsByCard();

    expect(group.current?.minimumPaymentAmount).toBeNull();
  });

  it("nenhum cartao conectado (so contas BANK/CASH ou nenhuma conta): devolve array vazio", async () => {
    await createCheckingAccount();

    const { listBillsByCard } = await import("@/lib/bills");
    await expect(listBillsByCard()).resolves.toEqual([]);
  });

  it("varios cartoes, cada um com seu proprio historico independente", async () => {
    const cardA = await createCreditCardAccount({ name: "Cartao A" });
    const cardB = await createCreditCardAccount({ name: "Cartao B" });
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cardA.id, { pluggyBillId: "bill-a-1" }),
    });
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cardB.id, { pluggyBillId: "bill-b-1" }),
    });
    await prisma.creditCardBill.create({
      data: buildCreditCardBill(cardB.id, {
        pluggyBillId: "bill-b-2",
        dueDate: new Date("2026-09-10T00:00:00.000Z"),
      }),
    });

    const { listBillsByCard } = await import("@/lib/bills");
    const result = await listBillsByCard();

    const groupA = result.find((g) => g.accountName === "Cartao A");
    const groupB = result.find((g) => g.accountName === "Cartao B");
    expect(groupA?.current?.pluggyBillId).toBe("bill-a-1");
    expect(groupA?.history).toEqual([]);
    expect(groupB?.current?.pluggyBillId).toBe("bill-b-2");
    expect(groupB?.history.map((b) => b.pluggyBillId)).toEqual(["bill-b-1"]);
  });
});
