import { z } from "zod";
import { prisma } from "@/lib/db";
import type { PluggyRawBill } from "@/lib/pluggy";

/**
 * `lib/bills.ts` - TASK-011 (Fatura do cartao, fecha a Fase 5). Concentra a
 * logica de persistencia (`syncCreditCardBills`) e consulta (`listBills`/
 * `listBillsByCard`) das faturas de cartao ja sincronizadas.
 */

/**
 * Persiste as faturas de UMA Account `CREDIT` por upsert em `pluggyBillId`
 * (Criterio de aceite #3/#4 - "a dedup e sagrada", mesmo padrao de
 * `Transaction.pluggyTransactionId`). EM SERIE (ADR 7 da PREMISSA).
 *
 * `accountId` e o id INTERNO (ja upsertado por `syncBankItem`), nao o
 * `pluggyAccountId`. Devolve `rawBills.length` - a contagem processada, NAO
 * exposta no retorno de `syncBankItem` (Criterio de aceite #3, secao 5 do
 * TASK-011.md).
 */
export async function syncCreditCardBills(
  accountId: string,
  rawBills: PluggyRawBill[],
): Promise<number> {
  for (const rawBill of rawBills) {
    await prisma.creditCardBill.upsert({
      where: { pluggyBillId: rawBill.pluggyBillId },
      create: {
        pluggyBillId: rawBill.pluggyBillId,
        accountId,
        dueDate: rawBill.dueDate,
        totalAmount: rawBill.totalAmount,
        minimumPaymentAmount: rawBill.minimumPaymentAmount,
      },
      update: {
        dueDate: rawBill.dueDate,
        totalAmount: rawBill.totalAmount,
        minimumPaymentAmount: rawBill.minimumPaymentAmount,
      },
    });
  }

  return rawBills.length;
}

/**
 * Erro de dominio: `accountId` tem formato valido mas nao existe na tabela
 * `Account`. A rota traduz isso para 400 (nao 500) - mesmo padrao de
 * `lib/transactions.ts`.
 */
export class AccountNotFoundError extends Error {
  constructor() {
    super("Conta nao encontrada.");
    this.name = "AccountNotFoundError";
  }
}

/**
 * Validacao Zod do parametro opcional `accountId` de `GET /api/bills`
 * (Criterio de aceite #7, casca fina). `accountId` so valida o FORMATO
 * (nao-vazio) - a existencia real na tabela `Account` e checada em
 * `listBills` (rejeita com `AccountNotFoundError`).
 */
export const billsQuerySchema = z.object({
  accountId: z.string().min(1).optional(),
});

export type BillsQuery = z.infer<typeof billsQuerySchema>;

export interface CreditCardBillListItem {
  id: string;
  pluggyBillId: string;
  accountId: string;
  accountName: string;
  dueDate: Date;
  totalAmount: string;
  minimumPaymentAmount: string | null;
}

type CreditCardBillRow = {
  id: string;
  pluggyBillId: string;
  accountId: string;
  dueDate: Date;
  totalAmount: { toString(): string };
  minimumPaymentAmount: { toString(): string } | null;
  account: { name: string };
};

/** `totalAmount`/`minimumPaymentAmount` SEMPRE string (Decimal, sem erro de float). */
function mapBillRow(row: CreditCardBillRow): CreditCardBillListItem {
  return {
    id: row.id,
    pluggyBillId: row.pluggyBillId,
    accountId: row.accountId,
    accountName: row.account.name,
    dueDate: row.dueDate,
    totalAmount: row.totalAmount.toString(),
    minimumPaymentAmount:
      row.minimumPaymentAmount === null
        ? null
        : row.minimumPaymentAmount.toString(),
  };
}

/**
 * Lista faturas, ordenadas por `dueDate` DECRESCENTE (a mais recente
 * primeiro). Sem `accountId`: todas as faturas. Com `accountId`: verifica
 * que a Account existe (senao `AccountNotFoundError`) e filtra so as faturas
 * daquela conta (Criterio de aceite #7).
 */
export async function listBills(
  query: BillsQuery = {},
): Promise<CreditCardBillListItem[]> {
  if (query.accountId) {
    const account = await prisma.account.findUnique({
      where: { id: query.accountId },
    });
    if (!account) {
      throw new AccountNotFoundError();
    }
  }

  const rows = await prisma.creditCardBill.findMany({
    where: query.accountId ? { accountId: query.accountId } : {},
    orderBy: { dueDate: "desc" },
    include: { account: { select: { name: true } } },
  });

  return rows.map(mapBillRow);
}

export interface CardBillsGroup {
  accountId: string;
  accountName: string;
  current: CreditCardBillListItem | null;
  history: CreditCardBillListItem[];
}

/**
 * Agrupa as faturas por cartao (Account `type === "CREDIT_CARD"`, nunca
 * CHECKING/SAVINGS/CASH) - `current` e a fatura mais recente (`dueDate`
 * desc) ou `null` se o cartao nao tiver nenhuma; `history` sao as demais, na
 * mesma ordem decrescente (Criterio de aceite #7, secao 2).
 */
export async function listBillsByCard(): Promise<CardBillsGroup[]> {
  const accounts = await prisma.account.findMany({
    where: { type: "CREDIT_CARD" },
    select: { id: true, name: true },
  });

  const groups: CardBillsGroup[] = [];

  for (const account of accounts) {
    const rows = await prisma.creditCardBill.findMany({
      where: { accountId: account.id },
      orderBy: { dueDate: "desc" },
      include: { account: { select: { name: true } } },
    });
    const bills = rows.map(mapBillRow);
    const [current = null, ...history] = bills;

    groups.push({
      accountId: account.id,
      accountName: account.name,
      current,
      history,
    });
  }

  return groups;
}
