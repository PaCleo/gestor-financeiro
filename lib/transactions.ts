import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * `lib/transactions.ts` - TASK-007 (Tela de transacoes com filtros, fecha a
 * Fase 2). Concentra a logica de consulta das transacoes ja sincronizadas
 * (TASK-006) - esta camada so LE dados do Postgres, nunca chama a Pluggy.
 *
 * `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` sao propositalmente MENORES que 432 (o
 * numero de transacoes do Item real, docs/PREMISSA.md secao 11) - a propria
 * constante ja prova que a paginacao e real (Criterio de aceite #4).
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/**
 * Validacao Zod dos parametros de `GET /api/transactions` (Criterio de
 * aceite #1 e #6). `accountId` so valida o FORMATO (nao-vazio) - a
 * existencia real na tabela `Account` e checada em `listTransactions`
 * (rejeita com `AccountNotFoundError`, traduzido para 400 pela rota, nunca
 * 500 - "conta inexistente" e erro do chamador).
 *
 * `startDate`/`endDate` usam `z.iso.date()` (formato "YYYY-MM-DD",
 * validando calendario de verdade - rejeita "2026-02-30", "2026-13-01" etc,
 * e rejeita horario embutido, ja que o formato exige `^...$` sem `T`).
 *
 * `page`/`limit` usam `z.coerce.number()` porque chegam como string da
 * query string.
 */
export const transactionsQuerySchema = z
  .object({
    accountId: z.string().min(1).optional(),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .optional()
      .default(DEFAULT_PAGE_SIZE),
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.startDate <= data.endDate,
    {
      message: "startDate nao pode ser posterior a endDate.",
      path: ["startDate"],
    },
  );

export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;

/**
 * Erro de dominio: `accountId` tem formato valido mas nao existe na tabela
 * `Account`. A rota traduz isso para 400 (nao 500) - "conta inexistente" e
 * erro do chamador, nao falha interna.
 */
export class AccountNotFoundError extends Error {
  constructor() {
    super("Conta nao encontrada.");
    this.name = "AccountNotFoundError";
  }
}

/**
 * Resolve a categoria efetiva de uma transacao (Criterio de aceite #2,
 * DT-010): `categoryOverride ?? category`. ESCOPO DESTA TASK: so essa
 * precedencia override->Pluggy. A regra por CPF/CNPJ (DT-019) e a TASK-008,
 * NAO implementada aqui.
 */
export function resolveTransactionCategory(transaction: {
  category: string | null;
  categoryOverride: string | null;
}): string | null {
  return transaction.categoryOverride ?? transaction.category;
}

export interface TransactionListItem {
  id: string;
  date: Date;
  description: string;
  amount: string;
  accountId: string;
  accountName: string;
  method: string | null;
  status: string;
  category: string | null;
}

export interface ListTransactionsResult {
  transactions: TransactionListItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Lista transacoes com filtro opcional por conta/periodo, paginadas de
 * verdade (`take`/`skip`) e ordenadas por data decrescente (Criterio de
 * aceite #6).
 *
 * Janela de periodo em UTC, dia inteiro:
 * `startDate` -> `<data>T00:00:00.000Z` (inicio do dia, inclusivo);
 * `endDate` -> `<data>T23:59:59.999Z` (fim do dia, inclusivo).
 */
export async function listTransactions(
  query: TransactionsQuery,
): Promise<ListTransactionsResult> {
  if (query.accountId) {
    const account = await prisma.account.findUnique({
      where: { id: query.accountId },
      select: { id: true },
    });
    if (!account) {
      throw new AccountNotFoundError();
    }
  }

  const where = {
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(query.startDate || query.endDate
      ? {
          date: {
            ...(query.startDate
              ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) }
              : {}),
            ...(query.endDate
              ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) }
              : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { account: { select: { name: true } } },
    }),
    prisma.transaction.count({ where }),
  ]);

  const transactions: TransactionListItem[] = rows.map((row) => ({
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount.toString(),
    accountId: row.accountId,
    accountName: row.account.name,
    method: row.method,
    status: row.status,
    category: resolveTransactionCategory({
      category: row.category,
      categoryOverride: row.categoryOverride,
    }),
  }));

  return {
    transactions,
    total,
    page: query.page,
    limit: query.limit,
  };
}

/**
 * Contas disponiveis para o `<select>` de filtro da pagina de transacoes.
 */
export async function listAccountsForFilter(): Promise<
  Array<{ id: string; name: string }>
> {
  return prisma.account.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
