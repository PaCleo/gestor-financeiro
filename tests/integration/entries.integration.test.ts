import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../setup/reset-db";
import {
  buildAccount,
  buildBankItem,
  buildManualAccount,
  buildTransaction,
} from "../fixtures/db";
import {
  buildMockPluggyAccountResponse,
  buildMockPluggyTransactionResponse,
} from "../fixtures/pluggy";

/**
 * Testes de integracao de `lib/entries.ts` (TASK-009 - Lancamentos manuais +
 * conta Dinheiro, primeira task da Fase 3). Batem no Postgres REAL de teste
 * (gestor_test) - nenhum mock de Prisma (DT-004: `vi.spyOn(prisma, ...)` e
 * engolido pelo Proxy de `lib/db.ts`).
 *
 * A validacao Zod pura (`manualEntryInputSchema`) e testada isolada, sem
 * banco, em tests/unit/lib/entries.test.ts.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   lib/entries.ts
 *     export const ENTRY_METHODS = ["PIX", "TED", "DEBIT", "CREDIT", "CASH"] as const;
 *     export const ENTRY_DIRECTIONS = ["entrada", "saida"] as const;
 *     export const manualEntryInputSchema = z.object({ ... });  // ver
 *       tests/unit/lib/entries.test.ts para o schema completo
 *     export type ManualEntryInput = z.infer<typeof manualEntryInputSchema>;
 *
 *     export class EntryAccountNotFoundError extends Error {}
 *       // `accountId` do input nao existe na tabela Account.
 *     export class EntryAccountConnectedError extends Error {}
 *       // a conta existe mas e CONECTADA (`pluggyAccountId` != null) - a
 *       // PREVENCAO POR CONVENCAO da secao 2 do TASK-009.md, o eixo desta
 *       // task. Usado tanto por `createManualEntry` quanto por
 *       // `updateManualEntry`.
 *     export class ManualEntryNotFoundError extends Error {}
 *       // `id` do lancamento nao existe na tabela Transaction.
 *     export class ManualEntryNotEditableError extends Error {}
 *       // o `id` existe mas `source !== "MANUAL"` (e uma Transaction
 *       // PLUGGY) - usado tanto por `updateManualEntry` quanto por
 *       // `deleteManualEntry` (Criterio de aceite #5).
 *
 *     export interface ManualEntryListItem {
 *       id: string;
 *       date: Date;
 *       description: string;
 *       amount: string;              // Decimal serializado, JA com sinal
 *       direction: "entrada" | "saida"; // derivado do sinal do amount
 *       accountId: string;
 *       accountName: string;
 *       method: string | null;
 *       category: string | null;
 *     }
 *
 *     export async function ensureCashAccount(): Promise<{
 *       id: string; name: string; type: string;
 *     }>
 *       // Criterio de aceite #1. IDEMPOTENTE: `findFirst({ where: { type:
 *       // "CASH", pluggyAccountId: null } })` - se existir, devolve SEM
 *       // criar de novo; senao `create({ name: "Dinheiro", type: "CASH",
 *       // pluggyAccountId: null, bankItemId: null })`. NUNCA confia em
 *       // constraint unica para a idempotencia - `pluggyAccountId` unique
 *       // permite MULTIPLOS null no Postgres (NULL != NULL), entao so o
 *       // findFirst evita duplicar.
 *
 *     export async function createManualEntry(
 *       input: ManualEntryInput,
 *     ): Promise<ManualEntryListItem>
 *       // 1. busca a Account por accountId - nao existe -> EntryAccountNotFoundError.
 *       // 2. account.pluggyAccountId != null -> EntryAccountConnectedError
 *       //    (PREVENCAO POR CONVENCAO, Criterio de aceite #3 - O EIXO).
 *       // 3. amount assinado: direction === "saida" -> -amount; "entrada" -> +amount
 *       //    (Criterio de aceite #4).
 *       // 4. cria a Transaction com source="MANUAL", pluggyTransactionId=null,
 *       //    status="POSTED" (Criterio de aceite #2).
 *
 *     export async function updateManualEntry(
 *       id: string,
 *       input: ManualEntryInput,
 *     ): Promise<ManualEntryListItem>
 *       // 1. busca a Transaction por id - nao existe -> ManualEntryNotFoundError.
 *       // 2. source !== "MANUAL" -> ManualEntryNotEditableError (Criterio #5).
 *       // 3/4. MESMAS regras de conta/sinal de createManualEntry.
 *
 *     export async function deleteManualEntry(id: string): Promise<void>
 *       // 1. busca a Transaction por id - nao existe -> ManualEntryNotFoundError.
 *       // 2. source !== "MANUAL" -> ManualEntryNotEditableError (Criterio #5).
 *       // 3. prisma.transaction.delete.
 *
 *     export async function listManualEntries(): Promise<ManualEntryListItem[]>
 *       // where source="MANUAL", orderBy date desc.
 *
 *     export async function listManualAccounts(): Promise<
 *       Array<{ id: string; name: string }>
 *     >
 *       // where pluggyAccountId=null, orderBy name asc - contas elegiveis
 *       // para o formulario de lancamento manual.
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

async function createConnectedAccount(overrides: Record<string, unknown> = {}) {
  const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
  return prisma.account.create({ data: buildAccount(bankItem.id, overrides) });
}

async function createManualAccountRow(overrides: Record<string, unknown> = {}) {
  return prisma.account.create({ data: buildManualAccount(overrides) });
}

function baseInput(accountId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    amount: 50,
    direction: "saida" as const,
    date: "2026-08-10",
    description: "Pix para o mercado",
    method: "PIX" as const,
    category: "Alimentação",
    accountId,
    ...overrides,
  };
}

describe("ensureCashAccount - conta Dinheiro idempotente (Criterio de aceite #1)", () => {
  it("cria a conta Dinheiro (CASH, sem pluggyAccountId/bankItemId) quando ainda nao existe", async () => {
    const { ensureCashAccount } = await import("@/lib/entries");

    const account = await ensureCashAccount();

    expect(account.name).toBe("Dinheiro");
    expect(account.type).toBe("CASH");
    const persisted = await prisma.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(persisted.pluggyAccountId).toBeNull();
    expect(persisted.bankItemId).toBeNull();
  });

  it("chamar duas vezes NAO duplica - a segunda chamada devolve a MESMA conta", async () => {
    const { ensureCashAccount } = await import("@/lib/entries");

    const first = await ensureCashAccount();
    const second = await ensureCashAccount();

    expect(second.id).toBe(first.id);
    const cashAccounts = await prisma.account.findMany({
      where: { type: "CASH", pluggyAccountId: null },
    });
    expect(cashAccounts).toHaveLength(1);
  });
});

describe("createManualEntry - lancamento manual basico (Criterio de aceite #2)", () => {
  it("cria uma Transaction com source=MANUAL, pluggyTransactionId=null e status=POSTED", async () => {
    const account = await createManualAccountRow();
    const { createManualEntry } = await import("@/lib/entries");

    const entry = await createManualEntry(baseInput(account.id));

    const persisted = await prisma.transaction.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(persisted.source).toBe("MANUAL");
    expect(persisted.pluggyTransactionId).toBeNull();
    expect(persisted.status).toBe("POSTED");
    expect(persisted.description).toBe("Pix para o mercado");
    expect(persisted.method).toBe("PIX");
    expect(persisted.category).toBe("Alimentação");
  });

  it("sem category (opcional), persiste category=null", async () => {
    const account = await createManualAccountRow();
    const { createManualEntry } = await import("@/lib/entries");

    const input = baseInput(account.id);
    delete (input as Record<string, unknown>).category;
    const entry = await createManualEntry(input);

    const persisted = await prisma.transaction.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(persisted.category).toBeNull();
  });
});

describe("createManualEntry - sinal por direcao, PROVADO NO VALOR GRAVADO NO POSTGRES (Criterio de aceite #4, as DUAS direcoes)", () => {
  it("direction='saida' grava amount NEGATIVO", async () => {
    const account = await createManualAccountRow();
    const { createManualEntry } = await import("@/lib/entries");

    const entry = await createManualEntry(
      baseInput(account.id, { amount: 75.5, direction: "saida" }),
    );

    const persisted = await prisma.transaction.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(persisted.amount.toFixed(2)).toBe("-75.50");
    expect(persisted.amount.toNumber()).toBeLessThan(0);
  });

  it("direction='entrada' grava amount POSITIVO", async () => {
    const account = await createManualAccountRow();
    const { createManualEntry } = await import("@/lib/entries");

    const entry = await createManualEntry(
      baseInput(account.id, { amount: 200, direction: "entrada" }),
    );

    const persisted = await prisma.transaction.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(persisted.amount.toFixed(2)).toBe("200.00");
    expect(persisted.amount.toNumber()).toBeGreaterThan(0);
  });
});

describe("createManualEntry - PREVENCAO POR CONVENCAO: conta conectada recusa, conta manual aceita (Criterio de aceite #3, O EIXO DA TASK)", () => {
  it("contra uma conta CONECTADA (pluggyAccountId != null) e RECUSADO com EntryAccountConnectedError, e NENHUMA Transaction e criada; a MESMA chamada contra a conta MANUAL (Dinheiro, pluggyAccountId null) e ACEITA - a prova por contraste exigida pelo prompt", async () => {
    const connectedAccount = await createConnectedAccount();
    const manualAccount = await createManualAccountRow();
    const { createManualEntry, EntryAccountConnectedError } = await import(
      "@/lib/entries"
    );

    await expect(
      createManualEntry(baseInput(connectedAccount.id)),
    ).rejects.toBeInstanceOf(EntryAccountConnectedError);
    const countAfterRejection = await prisma.transaction.count();
    expect(countAfterRejection).toBe(0);

    const accepted = await createManualEntry(baseInput(manualAccount.id));
    const persisted = await prisma.transaction.findUniqueOrThrow({
      where: { id: accepted.id },
    });
    expect(persisted.accountId).toBe(manualAccount.id);
    expect(await prisma.transaction.count()).toBe(1);
  });

  it("accountId que nao existe -> EntryAccountNotFoundError, sem criar nada", async () => {
    const { createManualEntry, EntryAccountNotFoundError } = await import(
      "@/lib/entries"
    );

    await expect(
      createManualEntry(baseInput("conta-que-nao-existe")),
    ).rejects.toBeInstanceOf(EntryAccountNotFoundError);
    expect(await prisma.transaction.count()).toBe(0);
  });
});

describe("updateManualEntry - edita SO lancamento MANUAL (Criterio de aceite #5)", () => {
  it("edita um lancamento MANUAL com sucesso, inclusive re-normalizando o sinal quando a direction muda", async () => {
    const account = await createManualAccountRow();
    const { createManualEntry, updateManualEntry } = await import(
      "@/lib/entries"
    );
    const created = await createManualEntry(
      baseInput(account.id, { amount: 30, direction: "saida", description: "Original" }),
    );

    const updated = await updateManualEntry(
      created.id,
      baseInput(account.id, {
        amount: 30,
        direction: "entrada",
        description: "Editado",
      }),
    );

    expect(updated.description).toBe("Editado");
    const persisted = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(persisted.description).toBe("Editado");
    expect(persisted.amount.toFixed(2)).toBe("30.00");
  });

  it("id inexistente -> ManualEntryNotFoundError", async () => {
    const account = await createManualAccountRow();
    const { updateManualEntry, ManualEntryNotFoundError } = await import(
      "@/lib/entries"
    );

    await expect(
      updateManualEntry("id-que-nao-existe", baseInput(account.id)),
    ).rejects.toBeInstanceOf(ManualEntryNotFoundError);
  });

  it("editar contra uma conta CONECTADA -> EntryAccountConnectedError, o lancamento original permanece intacto", async () => {
    const manualAccount = await createManualAccountRow();
    const connectedAccount = await createConnectedAccount();
    const { createManualEntry, updateManualEntry, EntryAccountConnectedError } =
      await import("@/lib/entries");
    const created = await createManualEntry(baseInput(manualAccount.id));

    await expect(
      updateManualEntry(created.id, baseInput(connectedAccount.id)),
    ).rejects.toBeInstanceOf(EntryAccountConnectedError);

    const persisted = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(persisted.accountId).toBe(manualAccount.id);
  });

  it("DADO uma transacao PLUGGY (importada) QUANDO tento editar ENTAO e RECUSADO (source e o distintivo, Criterio de aceite #5)", async () => {
    const connectedAccount = await createConnectedAccount();
    const pluggyTransaction = await prisma.transaction.create({
      data: buildTransaction(connectedAccount.id, { source: "PLUGGY" }),
    });
    const manualAccount = await createManualAccountRow();
    const { updateManualEntry, ManualEntryNotEditableError } = await import(
      "@/lib/entries"
    );

    await expect(
      updateManualEntry(pluggyTransaction.id, baseInput(manualAccount.id)),
    ).rejects.toBeInstanceOf(ManualEntryNotEditableError);

    const persisted = await prisma.transaction.findUniqueOrThrow({
      where: { id: pluggyTransaction.id },
    });
    // Intocada - nem accountId nem description mudaram.
    expect(persisted.accountId).toBe(connectedAccount.id);
    expect(persisted.description).toBe("Supermercado");
  });
});

describe("deleteManualEntry - exclui SO lancamento MANUAL (Criterio de aceite #5)", () => {
  it("exclui um lancamento MANUAL com sucesso", async () => {
    const account = await createManualAccountRow();
    const { createManualEntry, deleteManualEntry } = await import(
      "@/lib/entries"
    );
    const created = await createManualEntry(baseInput(account.id));

    await deleteManualEntry(created.id);

    const persisted = await prisma.transaction.findUnique({
      where: { id: created.id },
    });
    expect(persisted).toBeNull();
  });

  it("id inexistente -> ManualEntryNotFoundError", async () => {
    const { deleteManualEntry, ManualEntryNotFoundError } = await import(
      "@/lib/entries"
    );

    await expect(
      deleteManualEntry("id-que-nao-existe"),
    ).rejects.toBeInstanceOf(ManualEntryNotFoundError);
  });

  it("DADO uma transacao PLUGGY (importada) QUANDO tento excluir ENTAO e RECUSADO e ela CONTINUA no banco (source e o distintivo, Criterio de aceite #5)", async () => {
    const connectedAccount = await createConnectedAccount();
    const pluggyTransaction = await prisma.transaction.create({
      data: buildTransaction(connectedAccount.id, { source: "PLUGGY" }),
    });
    const { deleteManualEntry, ManualEntryNotEditableError } = await import(
      "@/lib/entries"
    );

    await expect(
      deleteManualEntry(pluggyTransaction.id),
    ).rejects.toBeInstanceOf(ManualEntryNotEditableError);

    const persisted = await prisma.transaction.findUnique({
      where: { id: pluggyTransaction.id },
    });
    expect(persisted).not.toBeNull();
  });
});

describe("listManualEntries - lista SOMENTE lancamentos MANUAL", () => {
  it("uma transacao MANUAL e uma PLUGGY no banco - so a MANUAL aparece na lista", async () => {
    const manualAccount = await createManualAccountRow();
    const connectedAccount = await createConnectedAccount();
    await prisma.transaction.create({
      data: buildTransaction(connectedAccount.id, {
        source: "PLUGGY",
        description: "Importada da Pluggy",
      }),
    });
    const { createManualEntry, listManualEntries } = await import(
      "@/lib/entries"
    );
    await createManualEntry(
      baseInput(manualAccount.id, { description: "Lancamento manual" }),
    );

    const entries = await listManualEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0].description).toBe("Lancamento manual");
  });

  it("sem nenhum lancamento manual, devolve array vazio", async () => {
    const { listManualEntries } = await import("@/lib/entries");
    await expect(listManualEntries()).resolves.toEqual([]);
  });
});

describe("listManualAccounts - contas elegiveis para o formulario (pluggyAccountId nulo)", () => {
  it("devolve so contas SEM pluggyAccountId - a conta conectada fica de fora", async () => {
    const manualAccount = await createManualAccountRow({ name: "Dinheiro" });
    await createConnectedAccount({ name: "Conta corrente conectada" });
    const { listManualAccounts } = await import("@/lib/entries");

    const accounts = await listManualAccounts();

    expect(accounts.map((a) => a.id)).toEqual([manualAccount.id]);
    expect(accounts.map((a) => a.name)).toEqual(["Dinheiro"]);
  });
});

/**
 * Convivencia com o sync (Criterio de aceite #6 - REGRESSAO DA DEDUP
 * SAGRADA). Mocka SO "pluggy-sdk" (mesma tecnica de
 * tests/integration/sync.integration.test.ts) para que `syncBankItem`
 * (lib/sync.ts, ja implementado desde a TASK-006) rode de verdade contra o
 * Postgres real. A prova central: os lancamentos manuais tem
 * `pluggyTransactionId=null`, entao o `upsert({ where: { pluggyTransactionId
 * } } })` do sync NUNCA os casa - eles ficam de fora do upsert inteiramente,
 * nao so "iguais por coincidencia".
 */
const { PluggyClientMock, fetchAccountsMock, fetchAllTransactionsMock } =
  vi.hoisted(() => {
    const fetchAccountsMock = vi.fn();
    const fetchAllTransactionsMock = vi.fn();
    const PluggyClientMock = vi.fn().mockImplementation(function () {
      return {
        fetchAccounts: fetchAccountsMock,
        fetchAllTransactions: fetchAllTransactionsMock,
        fetchTransactions: vi.fn(),
      };
    });
    return { PluggyClientMock, fetchAccountsMock, fetchAllTransactionsMock };
  });

vi.mock("pluggy-sdk", () => ({ PluggyClient: PluggyClientMock }));

const FAKE_CLIENT_ID = "fake-client-id-para-teste-nao-e-credencial-real";
const FAKE_CLIENT_SECRET =
  "fake-client-secret-para-teste-nao-e-credencial-real";
const ORIGINAL_CLIENT_ID = process.env.CLIENT_ID;
const ORIGINAL_CLIENT_SECRET = process.env.CLIENT_SECRET;

function restoreEnv() {
  if (ORIGINAL_CLIENT_ID === undefined) delete process.env.CLIENT_ID;
  else process.env.CLIENT_ID = ORIGINAL_CLIENT_ID;
  if (ORIGINAL_CLIENT_SECRET === undefined) delete process.env.CLIENT_SECRET;
  else process.env.CLIENT_SECRET = ORIGINAL_CLIENT_SECRET;
}

function pageResponse(results: unknown[]) {
  return { results, page: 1, total: results.length, totalPages: 1 };
}

describe("convivencia com o sync - lancamentos manuais permanecem INTACTOS apos syncBankItem (Criterio de aceite #6, regressao da dedup sagrada)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
  });

  afterEach(() => {
    restoreEnv();
  });

  it("cria lancamentos manuais, roda o sync (Pluggy mockada) e prova que os manuais NAO foram apagados nem alterados - pluggyTransactionId=null nunca casa o upsert", async () => {
    const manualAccount = await createManualAccountRow();
    const { createManualEntry, listManualEntries } = await import(
      "@/lib/entries"
    );
    const manualOne = await createManualEntry(
      baseInput(manualAccount.id, {
        description: "Pix manual 1",
        amount: 40,
        direction: "saida",
      }),
    );
    const manualTwo = await createManualEntry(
      baseInput(manualAccount.id, {
        description: "Dinheiro recebido",
        amount: 100,
        direction: "entrada",
      }),
    );
    const beforeSync = await prisma.transaction.findMany({
      where: { source: "MANUAL" },
      orderBy: { id: "asc" },
    });
    expect(beforeSync).toHaveLength(2);

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    fetchAccountsMock.mockResolvedValueOnce(
      pageResponse([
        buildMockPluggyAccountResponse({ id: "acc-convivencia-sync" }),
      ]),
    );
    fetchAllTransactionsMock.mockResolvedValueOnce([
      buildMockPluggyTransactionResponse({
        id: "tx-convivencia-sync",
        amount: -55,
      }),
    ]);
    const { syncBankItem } = await import("@/lib/sync");
    await syncBankItem(bankItem.id);

    // O sync criou a transacao PLUGGY dele...
    const pluggyTransaction = await prisma.transaction.findUniqueOrThrow({
      where: { pluggyTransactionId: "tx-convivencia-sync" },
    });
    expect(pluggyTransaction.source).toBe("PLUGGY");

    // ...mas os DOIS manuais continuam EXATAMENTE como estavam - mesma
    // quantidade, mesmos ids, mesmos valores/descricoes/contas.
    const afterSync = await prisma.transaction.findMany({
      where: { source: "MANUAL" },
      orderBy: { id: "asc" },
    });
    expect(afterSync).toHaveLength(2);
    expect(afterSync.map((t) => t.id).sort()).toEqual(
      [manualOne.id, manualTwo.id].sort(),
    );
    const afterOne = afterSync.find((t) => t.id === manualOne.id)!;
    const afterTwo = afterSync.find((t) => t.id === manualTwo.id)!;
    expect(afterOne.description).toBe("Pix manual 1");
    expect(afterOne.amount.toFixed(2)).toBe("-40.00");
    expect(afterOne.pluggyTransactionId).toBeNull();
    expect(afterTwo.description).toBe("Dinheiro recebido");
    expect(afterTwo.amount.toFixed(2)).toBe("100.00");
    expect(afterTwo.pluggyTransactionId).toBeNull();

    // listManualEntries tambem reflete os dois intactos, via lib/entries.ts.
    const entriesAfter = await listManualEntries();
    expect(entriesAfter).toHaveLength(2);

    // O total de transacoes na base e MANUAL(2) + PLUGGY(1) = 3 - nao houve
    // nenhuma fusao/duplicacao acidental entre os dois mundos.
    expect(await prisma.transaction.count()).toBe(3);
  });
});

/**
 * Criterio de aceite #8: o lancamento manual aparece em /transacoes (mesma
 * tabela, via lib/transactions.ts - ja implementado desde a TASK-007), e o
 * filtro de conta (`listAccountsForFilter`) inclui a conta Dinheiro depois
 * de `ensureCashAccount`.
 */
describe("integracao com /transacoes (Criterio de aceite #8) - a listagem/filtro ja existentes de lib/transactions.ts enxergam os dados desta task sem nenhuma alteracao nelas", () => {
  it("um lancamento manual criado por createManualEntry aparece em listTransactions, ao lado de uma transacao PLUGGY", async () => {
    const manualAccount = await createManualAccountRow();
    const connectedAccount = await createConnectedAccount();
    await prisma.transaction.create({
      data: buildTransaction(connectedAccount.id, {
        description: "Importada da Pluggy",
      }),
    });
    const { createManualEntry } = await import("@/lib/entries");
    await createManualEntry(
      baseInput(manualAccount.id, { description: "Pix manual" }),
    );

    const { listTransactions } = await import("@/lib/transactions");
    const result = await listTransactions({ page: 1, limit: 50 });

    expect(result.total).toBe(2);
    const descriptions = result.transactions.map((t) => t.description).sort();
    expect(descriptions).toEqual(["Importada da Pluggy", "Pix manual"].sort());
  });

  it("apos ensureCashAccount, a conta Dinheiro aparece em listAccountsForFilter (o filtro de /transacoes)", async () => {
    const { ensureCashAccount } = await import("@/lib/entries");
    await ensureCashAccount();

    const { listAccountsForFilter } = await import("@/lib/transactions");
    const accounts = await listAccountsForFilter();

    expect(accounts.some((a) => a.name === "Dinheiro")).toBe(true);
  });
});
