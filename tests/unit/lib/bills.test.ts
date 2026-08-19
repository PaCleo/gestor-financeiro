import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de `lib/bills.ts` (TASK-011 - Fatura do cartao, fecha a
 * Fase 5). `@/lib/db` (Proxy do Prisma, DT-004 - `vi.spyOn` nao funciona
 * nele) e mockado INTEIRAMENTE - nenhum banco real aqui. A prova de
 * PERSISTENCIA/CONSULTA real (dedup por contagem, valores no Postgres) fica
 * em tests/integration/bills.integration.test.ts e na extensao de
 * tests/integration/sync.integration.test.ts - mesma divisao de
 * responsabilidade de lib/sync.ts (unit vs integration).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim, ver secao 5 do TASK-011.md):
 *
 *   lib/bills.ts
 *     export async function syncCreditCardBills(
 *       accountId: string,
 *       rawBills: PluggyRawBill[],
 *     ): Promise<number>
 *       // upsert por pluggyBillId, EM SERIE; devolve a contagem de faturas
 *       // processadas (rawBills.length).
 *
 *     export class AccountNotFoundError extends Error {}
 *       // "Conta nao encontrada." - accountId com formato valido mas
 *       // inexistente na tabela Account.
 *
 *     export const billsQuerySchema: ZodSchema
 *       // z.object({ accountId?: string (nao vazio) })
 *     export type BillsQuery = z.infer<typeof billsQuerySchema>
 *
 *     export interface CreditCardBillListItem {
 *       id: string;
 *       pluggyBillId: string;
 *       accountId: string;
 *       accountName: string;
 *       dueDate: Date;
 *       totalAmount: string;
 *       minimumPaymentAmount: string | null;
 *     }
 *
 *     export async function listBills(query?: BillsQuery): Promise<CreditCardBillListItem[]>
 *       // sem accountId: lista TODAS as faturas, ordenadas por dueDate
 *       // desc; com accountId: verifica que a Account existe (senao
 *       // AccountNotFoundError) e filtra so as faturas daquela conta.
 *       // totalAmount/minimumPaymentAmount saem como STRING (Decimal.toString()),
 *       // nunca number (mesmo padrao de listTransactions - Decimal, sem
 *       // erro de float).
 *
 *     export interface CardBillsGroup {
 *       accountId: string;
 *       accountName: string;
 *       current: CreditCardBillListItem | null;
 *       history: CreditCardBillListItem[];
 *     }
 *
 *     export async function listBillsByCard(): Promise<CardBillsGroup[]>
 *       // uma entrada por Account de type "CREDIT_CARD" (SO cartoes -
 *       // Criterio de aceite #5/#7), current = fatura mais recente
 *       // (dueDate desc) ou null se nao houver nenhuma, history = as
 *       // demais, tambem decrescente por dueDate.
 */

const {
  creditCardBillUpsertMock,
  creditCardBillFindManyMock,
  accountFindUniqueMock,
  accountFindManyMock,
} = vi.hoisted(() => ({
  creditCardBillUpsertMock: vi.fn(),
  creditCardBillFindManyMock: vi.fn(),
  accountFindUniqueMock: vi.fn(),
  accountFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    creditCardBill: {
      upsert: creditCardBillUpsertMock,
      findMany: creditCardBillFindManyMock,
    },
    account: {
      findUnique: accountFindUniqueMock,
      findMany: accountFindManyMock,
    },
  },
}));

function buildRawBill(overrides: Record<string, unknown> = {}) {
  return {
    pluggyBillId: "bill-1",
    dueDate: new Date("2026-08-10T00:00:00.000Z"),
    totalAmount: 3408.84,
    minimumPaymentAmount: 511.32,
    ...overrides,
  };
}

function buildBillRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "internal-bill-1",
    pluggyBillId: "bill-1",
    accountId: "acc-1",
    dueDate: new Date("2026-08-10T00:00:00.000Z"),
    totalAmount: { toString: () => "3408.84" },
    minimumPaymentAmount: { toString: () => "511.32" },
    account: { name: "Cartao Black" },
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("syncCreditCardBills - upsert por pluggyBillId (Criterio de aceite #3 da TASK-011)", () => {
  it("array vazio de faturas: nao chama upsert, devolve 0", async () => {
    const { syncCreditCardBills } = await import("@/lib/bills");

    const result = await syncCreditCardBills("acc-1", []);

    expect(result).toBe(0);
    expect(creditCardBillUpsertMock).not.toHaveBeenCalled();
  });

  it("uma fatura: chama upsert com where.pluggyBillId, create com accountId/dueDate/totalAmount/minimumPaymentAmount, devolve 1", async () => {
    creditCardBillUpsertMock.mockResolvedValueOnce({ id: "internal-bill" });
    const { syncCreditCardBills } = await import("@/lib/bills");

    const result = await syncCreditCardBills(
      "internal-account-1",
      [buildRawBill()],
    );

    expect(result).toBe(1);
    expect(creditCardBillUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pluggyBillId: "bill-1" },
        create: expect.objectContaining({
          pluggyBillId: "bill-1",
          accountId: "internal-account-1",
          dueDate: new Date("2026-08-10T00:00:00.000Z"),
          totalAmount: 3408.84,
          minimumPaymentAmount: 511.32,
        }),
        update: expect.objectContaining({
          dueDate: new Date("2026-08-10T00:00:00.000Z"),
          totalAmount: 3408.84,
          minimumPaymentAmount: 511.32,
        }),
      }),
    );
  });

  it("minimumPaymentAmount null e repassado como null (nao 0, nao omitido) tanto em create quanto em update", async () => {
    creditCardBillUpsertMock.mockResolvedValueOnce({ id: "internal-bill" });
    const { syncCreditCardBills } = await import("@/lib/bills");

    await syncCreditCardBills(
      "internal-account-1",
      [buildRawBill({ minimumPaymentAmount: null })],
    );

    const call = creditCardBillUpsertMock.mock.calls[0][0];
    expect(call.create.minimumPaymentAmount).toBeNull();
    expect(call.update.minimumPaymentAmount).toBeNull();
  });

  it("varias faturas: uma chamada de upsert por fatura, devolve a contagem total, EM SERIE", async () => {
    creditCardBillUpsertMock.mockResolvedValue({ id: "internal-bill" });
    const { syncCreditCardBills } = await import("@/lib/bills");

    const rawBills = Array.from({ length: 5 }, (_, index) =>
      buildRawBill({ pluggyBillId: `bill-${index}` }),
    );
    const result = await syncCreditCardBills("internal-account-1", rawBills);

    expect(result).toBe(5);
    expect(creditCardBillUpsertMock).toHaveBeenCalledTimes(5);
    for (const [index, rawBill] of rawBills.entries()) {
      expect(creditCardBillUpsertMock).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({ where: { pluggyBillId: rawBill.pluggyBillId } }),
      );
    }
  });
});

describe("AccountNotFoundError - erro de dominio (mesmo padrao de lib/transactions.ts)", () => {
  it("tem uma mensagem fixa e nome proprio", async () => {
    const { AccountNotFoundError } = await import("@/lib/bills");
    const error = new AccountNotFoundError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AccountNotFoundError");
    expect(error.message.length).toBeGreaterThan(0);
  });
});

describe("billsQuerySchema - validacao Zod do parametro accountId (Criterio de aceite #7, casca fina)", () => {
  it("objeto vazio e valido - accountId ausente", async () => {
    const { billsQuerySchema } = await import("@/lib/bills");

    const result = billsQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accountId).toBeUndefined();
    }
  });

  it("accountId nao vazio e valido e preservado", async () => {
    const { billsQuerySchema } = await import("@/lib/bills");

    const result = billsQuerySchema.safeParse({ accountId: "acc-123" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accountId).toBe("acc-123");
    }
  });

  it("accountId vazio (string vazia) -> parse falha", async () => {
    const { billsQuerySchema } = await import("@/lib/bills");

    expect(billsQuerySchema.safeParse({ accountId: "" }).success).toBe(false);
  });

  it("campos desconhecidos nao quebram o parse", async () => {
    const { billsQuerySchema } = await import("@/lib/bills");

    const result = billsQuerySchema.safeParse({
      accountId: "acc-1",
      utm_source: "newsletter",
    });

    expect(result.success).toBe(true);
  });
});

describe("listBills - sem filtro (Criterio de aceite #7)", () => {
  it("sem accountId: NAO chama account.findUnique, chama creditCardBill.findMany e devolve totalAmount/minimumPaymentAmount como STRING", async () => {
    creditCardBillFindManyMock.mockResolvedValueOnce([buildBillRow()]);

    const { listBills } = await import("@/lib/bills");
    const result = await listBills();

    expect(accountFindUniqueMock).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: "internal-bill-1",
        pluggyBillId: "bill-1",
        accountId: "acc-1",
        accountName: "Cartao Black",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        totalAmount: "3408.84",
        minimumPaymentAmount: "511.32",
      },
    ]);
  });

  it("minimumPaymentAmount null na linha vira null na saida (nunca a string 'null')", async () => {
    creditCardBillFindManyMock.mockResolvedValueOnce([
      buildBillRow({ minimumPaymentAmount: null }),
    ]);

    const { listBills } = await import("@/lib/bills");
    const [result] = await listBills();

    expect(result.minimumPaymentAmount).toBeNull();
  });

  it("lista ordenada por dueDate DECRESCENTE (a mais recente primeiro) - chama findMany com orderBy dueDate desc", async () => {
    creditCardBillFindManyMock.mockResolvedValueOnce([]);

    const { listBills } = await import("@/lib/bills");
    await listBills();

    expect(creditCardBillFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.objectContaining({ dueDate: "desc" }),
      }),
    );
  });
});

describe("listBills - com filtro accountId (Criterio de aceite #7)", () => {
  it("accountId existente: verifica a Account, filtra as faturas por accountId", async () => {
    accountFindUniqueMock.mockResolvedValueOnce({ id: "acc-1" });
    creditCardBillFindManyMock.mockResolvedValueOnce([buildBillRow()]);

    const { listBills } = await import("@/lib/bills");
    const result = await listBills({ accountId: "acc-1" });

    expect(accountFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "acc-1" } }),
    );
    expect(creditCardBillFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: "acc-1" }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("accountId inexistente: rejeita com AccountNotFoundError, NUNCA chama creditCardBill.findMany", async () => {
    accountFindUniqueMock.mockResolvedValueOnce(null);

    const { listBills, AccountNotFoundError } = await import("@/lib/bills");

    await expect(
      listBills({ accountId: "conta-que-nao-existe" }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(creditCardBillFindManyMock).not.toHaveBeenCalled();
  });
});

describe("listBillsByCard - agrupado por cartao, atual + historico (Criterio de aceite #7, secao 2)", () => {
  it("sem nenhum cartao (Account type CREDIT_CARD): devolve array vazio", async () => {
    accountFindManyMock.mockResolvedValueOnce([]);

    const { listBillsByCard } = await import("@/lib/bills");
    const result = await listBillsByCard();

    expect(result).toEqual([]);
  });

  it("busca SOMENTE Accounts do tipo CREDIT_CARD (nunca CHECKING/SAVINGS/CASH)", async () => {
    accountFindManyMock.mockResolvedValueOnce([]);

    const { listBillsByCard } = await import("@/lib/bills");
    await listBillsByCard();

    expect(accountFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "CREDIT_CARD" }),
      }),
    );
  });

  it("cartao SEM nenhuma fatura: current=null, history=[] (estado vazio, nao quebra)", async () => {
    accountFindManyMock.mockResolvedValueOnce([
      { id: "acc-sem-fatura", name: "Cartao Sem Fatura" },
    ]);
    creditCardBillFindManyMock.mockResolvedValueOnce([]);

    const { listBillsByCard } = await import("@/lib/bills");
    const result = await listBillsByCard();

    expect(result).toEqual([
      {
        accountId: "acc-sem-fatura",
        accountName: "Cartao Sem Fatura",
        current: null,
        history: [],
      },
    ]);
  });

  it("cartao com UMA fatura: vira current, history fica vazio", async () => {
    accountFindManyMock.mockResolvedValueOnce([
      { id: "acc-1", name: "Cartao Black" },
    ]);
    creditCardBillFindManyMock.mockResolvedValueOnce([
      buildBillRow({ id: "bill-unica" }),
    ]);

    const { listBillsByCard } = await import("@/lib/bills");
    const [group] = await listBillsByCard();

    expect(group.current).not.toBeNull();
    expect(group.current?.id).toBe("bill-unica");
    expect(group.history).toEqual([]);
  });

  it("cartao com VARIAS faturas (ja ordenadas dueDate desc pelo Prisma): a PRIMEIRA (mais recente) vira current, as demais viram history na MESMA ordem", async () => {
    accountFindManyMock.mockResolvedValueOnce([
      { id: "acc-1", name: "Cartao Black" },
    ]);
    creditCardBillFindManyMock.mockResolvedValueOnce([
      buildBillRow({
        id: "bill-agosto",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
      }),
      buildBillRow({
        id: "bill-julho",
        dueDate: new Date("2026-07-10T00:00:00.000Z"),
      }),
      buildBillRow({
        id: "bill-junho",
        dueDate: new Date("2026-06-10T00:00:00.000Z"),
      }),
    ]);

    const { listBillsByCard } = await import("@/lib/bills");
    const [group] = await listBillsByCard();

    expect(group.current?.id).toBe("bill-agosto");
    expect(group.history.map((b) => b.id)).toEqual(["bill-julho", "bill-junho"]);
  });

  it("chama creditCardBill.findMany com orderBy dueDate desc, filtrado por accountId de CADA cartao", async () => {
    accountFindManyMock.mockResolvedValueOnce([
      { id: "acc-1", name: "Cartao 1" },
    ]);
    creditCardBillFindManyMock.mockResolvedValueOnce([]);

    const { listBillsByCard } = await import("@/lib/bills");
    await listBillsByCard();

    expect(creditCardBillFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: "acc-1" }),
        orderBy: expect.objectContaining({ dueDate: "desc" }),
      }),
    );
  });

  it("varios cartoes: um grupo por cartao, cada um com sua propria lista de faturas", async () => {
    accountFindManyMock.mockResolvedValueOnce([
      { id: "acc-1", name: "Cartao 1" },
      { id: "acc-2", name: "Cartao 2" },
    ]);
    creditCardBillFindManyMock
      .mockResolvedValueOnce([buildBillRow({ id: "bill-cartao-1", accountId: "acc-1" })])
      .mockResolvedValueOnce([]);

    const { listBillsByCard } = await import("@/lib/bills");
    const result = await listBillsByCard();

    expect(result).toHaveLength(2);
    expect(result[0].accountId).toBe("acc-1");
    expect(result[0].current?.id).toBe("bill-cartao-1");
    expect(result[1].accountId).toBe("acc-2");
    expect(result[1].current).toBeNull();
  });
});
