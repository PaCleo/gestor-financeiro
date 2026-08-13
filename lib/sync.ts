import { prisma } from "@/lib/db";
import { listActiveBankItems } from "@/lib/bank-item";
import { fetchPluggyAccounts, fetchPluggyAllTransactions } from "@/lib/pluggy";

/**
 * Sync de Accounts e Transactions (TASK-006, primeira task da Fase 2).
 *
 * Traduz o formato da Pluggy para o nosso, com a normalizacao de sinal que
 * impede um gasto de cartao de virar receita (DT-007 - "o coracao da
 * task"). Sincroniza em SERIE (ADR 7 da PREMISSA: 1 requisicao por vez,
 * nunca `Promise.all`).
 */

export type PluggyRawAccountType = "BANK" | "CREDIT";
export type PluggyRawAccountSubtype =
  | "CHECKING_ACCOUNT"
  | "SAVINGS_ACCOUNT"
  | "CREDIT_CARD";

/**
 * Traduz `account.type`/`account.subtype` da Pluggy para o nosso `Account.type`
 * (Criterio de aceite #1). Fallback seguro: qualquer combinacao nao
 * reconhecida devolve o `subtype` cru em vez de lancar - a Pluggy pode
 * adicionar subtypes novos a qualquer momento (mesmo espirito de R6 de
 * `deriveBankItemState`, lib/bank-item.ts).
 */
export function mapAccountType(type: string, subtype: string): string {
  if (type === "BANK" && subtype === "CHECKING_ACCOUNT") {
    return "CHECKING";
  }
  if (type === "BANK" && subtype === "SAVINGS_ACCOUNT") {
    return "SAVINGS";
  }
  if (type === "CREDIT" && subtype === "CREDIT_CARD") {
    return "CREDIT_CARD";
  }
  return subtype;
}

/**
 * Normaliza o sinal de `amount` conforme o TIPO DA CONTA - NAO o `type`
 * (DEBIT/CREDIT) da transacao (Criterio de aceite #3, O CORACAO DA TASK,
 * resolve o DT-007). Confirmado contra dados reais (PREMISSA secao 11): numa
 * conta corrente, `type=DEBIT` ja vem com `amount` negativo (correto); num
 * cartao, uma compra `type=DEBIT` vem com `amount` POSITIVO. O `type` e o
 * MESMO "DEBIT" nos dois casos - so o tipo da conta desambigua.
 *
 * Convencao adotada (unica, sem excecao por `type` da transacao):
 *   - `accountType === "CREDIT"` -> inverte sempre (`-amount`). Uma compra
 *     positiva vira saida negativa; um pagamento de fatura (que a Pluggy
 *     manda negativo) vira entrada positiva no nosso modelo - consistente
 *     com "negativo = saida" tambem para o cartao.
 *   - `accountType === "BANK"` -> `amount` inalterado (o sinal ja esta
 *     correto).
 *   - qualquer outro valor -> `amount` inalterado (fallback seguro, nunca
 *     lanca).
 */
export function normalizeTransactionSign(
  accountType: string,
  amount: number,
): number {
  if (accountType === "CREDIT") {
    return -amount;
  }
  return amount;
}

/**
 * Erro de dominio: `syncBankItem` chamado com um `bankItemId` que nao
 * existe. Mensagem fixa e generica, mesmo padrao dos erros de dominio de
 * `lib/bank-item.ts`/`lib/pluggy.ts`.
 */
export class BankItemNotFoundError extends Error {
  constructor() {
    super("Banco nao encontrado.");
    this.name = "BankItemNotFoundError";
  }
}

/**
 * Erro de dominio: `syncBankItem` chamado com um `BankItem` ja arquivado
 * (Criterio de aceite #8) - arquivado e ignorado no sync, sem sequer chamar
 * a Pluggy.
 */
export class BankItemArchivedError extends Error {
  constructor() {
    super("Este banco foi desativado e nao pode ser sincronizado.");
    this.name = "BankItemArchivedError";
  }
}

const PLUGGY_SOURCE = "PLUGGY";

/**
 * Sincroniza as Accounts e Transactions de UM `BankItem` (Criterios de
 * aceite #1 a #9). Passos, NESTA ORDEM (contrato da secao 5 do TASK-006.md):
 *
 * 1. Busca o `BankItem` pelo `id` - se nao existir, rejeita com
 *    `BankItemNotFoundError`.
 * 2. Se `archivedAt` estiver preenchido, rejeita com `BankItemArchivedError`
 *    SEM chamar a Pluggy (Criterio de aceite #8).
 * 3. Busca as Accounts na Pluggy (`fetchPluggyAccounts`).
 * 4. Para CADA account, EM SERIE (ADR 7):
 *    a. `upsert` por `pluggyAccountId` (type mapeado, balance cru).
 *    b. Busca TODAS as Transactions dessa account (`fetchPluggyAllTransactions`
 *       - paginacao completa, resolve o DT-008).
 *    c. Para CADA transacao, EM SERIE, `upsert` por `pluggyTransactionId`
 *       (dedup sagrada), com o `amount` normalizado pelo TIPO DA CONTA
 *       (DT-007), `category` cru (investigacao do DT-010, Criterio 9) e
 *       `method` = `paymentMethod` ja extraido por `fetchPluggyAllTransactions`
 *       (DT-017 resolvido em `lib/pluggy.ts` - aqui so repassamos).
 * 5. So DEPOIS de tudo sincronizado, atualiza `BankItem.lastSyncAt`.
 * 6. Devolve `{ bankItemId, accountsSynced, transactionsSynced }`.
 */
export async function syncBankItem(bankItemId: string): Promise<{
  bankItemId: string;
  accountsSynced: number;
  transactionsSynced: number;
}> {
  const bankItem = await prisma.bankItem.findUnique({
    where: { id: bankItemId },
  });

  if (!bankItem) {
    throw new BankItemNotFoundError();
  }

  if (bankItem.archivedAt) {
    throw new BankItemArchivedError();
  }

  const rawAccounts = await fetchPluggyAccounts(bankItem.pluggyItemId);

  let accountsSynced = 0;
  let transactionsSynced = 0;

  for (const rawAccount of rawAccounts) {
    const mappedType = mapAccountType(rawAccount.type, rawAccount.subtype);

    const account = await prisma.account.upsert({
      where: { pluggyAccountId: rawAccount.pluggyAccountId },
      create: {
        pluggyAccountId: rawAccount.pluggyAccountId,
        bankItemId: bankItem.id,
        name: rawAccount.name,
        type: mappedType,
        balance: rawAccount.balance,
      },
      update: {
        name: rawAccount.name,
        type: mappedType,
        balance: rawAccount.balance,
      },
    });
    accountsSynced += 1;

    const rawTransactions = await fetchPluggyAllTransactions(
      rawAccount.pluggyAccountId,
    );

    for (const rawTransaction of rawTransactions) {
      const amount = normalizeTransactionSign(
        rawAccount.type,
        rawTransaction.amount,
      );

      await prisma.transaction.upsert({
        where: { pluggyTransactionId: rawTransaction.pluggyTransactionId },
        create: {
          pluggyTransactionId: rawTransaction.pluggyTransactionId,
          accountId: account.id,
          date: rawTransaction.date,
          description: rawTransaction.description,
          amount,
          category: rawTransaction.category,
          method: rawTransaction.paymentMethod,
          status: rawTransaction.status,
          source: PLUGGY_SOURCE,
        },
        update: {
          date: rawTransaction.date,
          description: rawTransaction.description,
          amount,
          category: rawTransaction.category,
          method: rawTransaction.paymentMethod,
          status: rawTransaction.status,
        },
      });
      transactionsSynced += 1;
    }
  }

  await prisma.bankItem.update({
    where: { id: bankItem.id },
    data: { lastSyncAt: new Date() },
  });

  return { bankItemId: bankItem.id, accountsSynced, transactionsSynced };
}

/** Resultado do sync de UM `BankItem`, dentro de `syncAllActiveBankItems`. */
export type SyncAllResult =
  | {
      bankItemId: string;
      status: "OK";
      accountsSynced: number;
      transactionsSynced: number;
    }
  | { bankItemId: string; status: "ERROR"; error: string };

const GENERIC_SYNC_ERROR_MESSAGE =
  "Nao foi possivel sincronizar este banco. Tente novamente em instantes.";

/**
 * Sincroniza TODOS os `BankItem`s ativos (Criterio de aceite #2), EM SERIE
 * (ADR 7). Reaproveita `listActiveBankItems` (`@/lib/bank-item`, ja filtra
 * `archivedAt: null` - Criterio de aceite #8, bancos arquivados nunca
 * chegam aqui). Um item que falha NAO interrompe os demais - o erro e
 * capturado e vira `{ status: "ERROR" }` naquela posicao do array, seguindo
 * para o proximo item.
 */
export async function syncAllActiveBankItems(): Promise<SyncAllResult[]> {
  const bankItems = await listActiveBankItems();
  const results: SyncAllResult[] = [];

  for (const bankItem of bankItems) {
    try {
      const result = await syncBankItem(bankItem.id);
      results.push({
        bankItemId: bankItem.id,
        status: "OK",
        accountsSynced: result.accountsSynced,
        transactionsSynced: result.transactionsSynced,
      });
    } catch (error) {
      results.push({
        bankItemId: bankItem.id,
        status: "ERROR",
        error: error instanceof Error ? error.message : GENERIC_SYNC_ERROR_MESSAGE,
      });
    }
  }

  return results;
}
