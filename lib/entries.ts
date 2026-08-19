import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  ENTRY_METHODS,
  ENTRY_DIRECTIONS,
  type EntryMethod,
  type EntryDirection,
} from "@/lib/entry-constants";

export { ENTRY_METHODS, ENTRY_DIRECTIONS };
export type { EntryMethod, EntryDirection };

/**
 * `lib/entries.ts` - TASK-009 (Lancamentos manuais + conta Dinheiro,
 * primeira task da Fase 3). Concentra a logica de CRUD de lancamentos
 * MANUAIS (o que o Open Finance nao traz) e a conta "Dinheiro" padrao.
 *
 * A decisao de dedup desta task e PREVENCAO POR CONVENCAO (secao 2 do
 * TASK-009.md): criar/editar um lancamento manual so e permitido contra uma
 * conta NAO CONECTADA (`pluggyAccountId` nulo) - a dedup por
 * `pluggyTransactionId` (sagrada, `lib/sync.ts`) continua intacta porque os
 * manuais nunca preenchem esse campo, entao o upsert do sync jamais os casa.
 */

/**
 * Validacao do corpo de `POST /api/entries` / `PATCH /api/entries/[id]`
 * (Criterio de aceite #2). Reaproveitado tal-e-qual pelo PATCH - edicao
 * substitui o lancamento inteiro, sem schema parcial separado.
 */
export const manualEntryInputSchema = z.object({
  amount: z.number().positive(),
  direction: z.enum(ENTRY_DIRECTIONS),
  date: z.iso.date(),
  description: z.string().min(1),
  method: z.enum(ENTRY_METHODS),
  category: z.string().min(1).optional(),
  accountId: z.string().min(1),
});
export type ManualEntryInput = z.infer<typeof manualEntryInputSchema>;

/** `accountId` do input nao existe na tabela `Account`. */
export class EntryAccountNotFoundError extends Error {
  constructor() {
    super("Conta nao encontrada.");
    this.name = "EntryAccountNotFoundError";
  }
}

/**
 * A conta existe mas e CONECTADA (`pluggyAccountId` != null) - a PREVENCAO
 * POR CONVENCAO da secao 2 do TASK-009.md, o eixo desta task. Usado tanto
 * por `createManualEntry` quanto por `updateManualEntry`.
 */
export class EntryAccountConnectedError extends Error {
  constructor() {
    super(
      "Esta conta esta conectada a um banco e nao aceita lancamentos manuais.",
    );
    this.name = "EntryAccountConnectedError";
  }
}

/** `id` do lancamento nao existe na tabela `Transaction`. */
export class ManualEntryNotFoundError extends Error {
  constructor() {
    super("Lancamento nao encontrado.");
    this.name = "ManualEntryNotFoundError";
  }
}

/**
 * O `id` existe mas `source !== "MANUAL"` (e uma `Transaction` PLUGGY) -
 * dado importado nao se edita a mao, vem do sync (Criterio de aceite #5).
 */
export class ManualEntryNotEditableError extends Error {
  constructor() {
    super(
      "Esta transacao foi importada automaticamente e nao pode ser editada ou excluida manualmente.",
    );
    this.name = "ManualEntryNotEditableError";
  }
}

const MANUAL_SOURCE = "MANUAL";
const MANUAL_ENTRY_STATUS = "POSTED";

export interface ManualEntryListItem {
  id: string;
  date: Date;
  description: string;
  amount: string;
  direction: EntryDirection;
  accountId: string;
  accountName: string;
  method: string | null;
  category: string | null;
}

/**
 * Formato minimo de uma linha de `Transaction` (com o nome da conta
 * associada) suficiente para reconstruir um `ManualEntryListItem` - tipagem
 * estrutural (duck typing) em vez do tipo gerado do Prisma, para nao acoplar
 * este modulo aos generics do Prisma Client.
 */
interface TransactionRowWithAccountName {
  id: string;
  date: Date;
  description: string;
  amount: { toString(): string; toNumber(): number };
  accountId: string;
  method: string | null;
  category: string | null;
  account: { name: string };
}

/**
 * Reconstroi um `ManualEntryListItem` campo a campo a partir de uma linha do
 * Postgres. `direction` e DERIVADO do sinal de `amount` (convencao "negativo
 * = saida", Criterio de aceite #4) - nunca reaproveita o `direction` bruto
 * do input, para que a lista sempre reflita o que esta persistido de fato.
 */
function toManualEntryListItem(
  row: TransactionRowWithAccountName,
): ManualEntryListItem {
  const direction: EntryDirection =
    row.amount.toNumber() < 0 ? "saida" : "entrada";

  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount.toString(),
    direction,
    accountId: row.accountId,
    accountName: row.account.name,
    method: row.method,
    category: row.category,
  };
}

/**
 * Busca a `Account` de `accountId` e garante que ela e elegivel para
 * lancamento manual (nao conectada). Usado tanto por `createManualEntry`
 * quanto por `updateManualEntry` - a PREVENCAO POR CONVENCAO (Criterio de
 * aceite #3, o eixo da task).
 */
async function getManualEligibleAccount(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new EntryAccountNotFoundError();
  }

  if (account.pluggyAccountId !== null) {
    throw new EntryAccountConnectedError();
  }

  return account;
}

/** Sinal por direcao (Criterio de aceite #4): saida -> negativo, entrada -> positivo. */
function signedAmount(input: ManualEntryInput): number {
  return input.direction === "saida" ? -input.amount : input.amount;
}

/**
 * Garante a conta "Dinheiro" (Criterio de aceite #1) - CASH, sem
 * `pluggyAccountId`/`bankItemId`. IDEMPOTENTE: `findFirst` primeiro; so cria
 * se ainda nao existir. NUNCA confia em constraint unica para a
 * idempotencia - `pluggyAccountId` unique permite MULTIPLOS `null` no
 * Postgres (`NULL != NULL`), entao so o `findFirst` evita duplicar.
 */
export async function ensureCashAccount(): Promise<{
  id: string;
  name: string;
  type: string;
}> {
  const existing = await prisma.account.findFirst({
    where: { type: "CASH", pluggyAccountId: null },
  });

  if (existing) {
    return { id: existing.id, name: existing.name, type: existing.type };
  }

  const created = await prisma.account.create({
    data: {
      name: "Dinheiro",
      type: "CASH",
      pluggyAccountId: null,
      bankItemId: null,
    },
  });

  return { id: created.id, name: created.name, type: created.type };
}

/**
 * Cria um lancamento manual (Criterio de aceite #2). Passos: 1) resolve a
 * conta e garante que e elegivel (nao conectada); 2) assina o valor pela
 * `direction`; 3) cria a `Transaction` com `source=MANUAL`,
 * `pluggyTransactionId=null`, `status=POSTED`.
 */
export async function createManualEntry(
  input: ManualEntryInput,
): Promise<ManualEntryListItem> {
  const account = await getManualEligibleAccount(input.accountId);

  const row = await prisma.transaction.create({
    data: {
      accountId: account.id,
      date: new Date(`${input.date}T00:00:00.000Z`),
      description: input.description,
      amount: signedAmount(input),
      category: input.category ?? null,
      method: input.method,
      status: MANUAL_ENTRY_STATUS,
      source: MANUAL_SOURCE,
      pluggyTransactionId: null,
    },
    include: { account: { select: { name: true } } },
  });

  return toManualEntryListItem(row);
}

/**
 * Edita um lancamento manual (Criterio de aceite #5). 1) busca a
 * `Transaction` - inexistente -> `ManualEntryNotFoundError`; 2)
 * `source !== "MANUAL"` -> `ManualEntryNotEditableError` (dados importados
 * nao se editam a mao); 3/4) MESMAS regras de conta/sinal de
 * `createManualEntry`.
 */
export async function updateManualEntry(
  id: string,
  input: ManualEntryInput,
): Promise<ManualEntryListItem> {
  const existing = await prisma.transaction.findUnique({ where: { id } });

  if (!existing) {
    throw new ManualEntryNotFoundError();
  }

  if (existing.source !== MANUAL_SOURCE) {
    throw new ManualEntryNotEditableError();
  }

  const account = await getManualEligibleAccount(input.accountId);

  const row = await prisma.transaction.update({
    where: { id },
    data: {
      accountId: account.id,
      date: new Date(`${input.date}T00:00:00.000Z`),
      description: input.description,
      amount: signedAmount(input),
      category: input.category ?? null,
      method: input.method,
    },
    include: { account: { select: { name: true } } },
  });

  return toManualEntryListItem(row);
}

/**
 * Exclui um lancamento manual (Criterio de aceite #5). Mesma checagem de
 * `source` de `updateManualEntry` - dados `PLUGGY` nunca sao removidos por
 * aqui.
 */
export async function deleteManualEntry(id: string): Promise<void> {
  const existing = await prisma.transaction.findUnique({ where: { id } });

  if (!existing) {
    throw new ManualEntryNotFoundError();
  }

  if (existing.source !== MANUAL_SOURCE) {
    throw new ManualEntryNotEditableError();
  }

  await prisma.transaction.delete({ where: { id } });
}

/** Lista SOMENTE lancamentos `MANUAL`, mais recentes primeiro. */
export async function listManualEntries(): Promise<ManualEntryListItem[]> {
  const rows = await prisma.transaction.findMany({
    where: { source: MANUAL_SOURCE },
    orderBy: { date: "desc" },
    include: { account: { select: { name: true } } },
  });

  return rows.map(toManualEntryListItem);
}

/**
 * Contas elegiveis para o formulario de lancamento manual - so as SEM
 * `pluggyAccountId` (a conta Dinheiro e quaisquer outras nao conectadas).
 */
export async function listManualAccounts(): Promise<
  Array<{ id: string; name: string }>
> {
  return prisma.account.findMany({
    where: { pluggyAccountId: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
