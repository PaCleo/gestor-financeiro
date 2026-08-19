import { PluggyClient } from "pluggy-sdk";
import { hashDocument } from "@/lib/category-rules";

/**
 * Erro de dominio: `CLIENT_ID`/`CLIENT_SECRET` ausentes ou vazias.
 *
 * Mensagem fixa e generica - nunca cita o nome das variaveis nem qualquer
 * valor de credencial (Criterio de aceite #4 da TASK-003). O `PluggyClient`
 * nem chega a ser instanciado nesse caminho (Criterio de aceite #7).
 */
export class PluggyConfigError extends Error {
  constructor() {
    super("Nao foi possivel gerar o token de conexao.");
    this.name = "PluggyConfigError";
  }
}

/**
 * Erro de dominio: a Pluggy (ou o SDK) falhou ao gerar o Connect Token
 * (rede, timeout, HTTP 4xx/5xx). Mensagem fixa e generica - nunca interpola
 * `error.message`/detalhe do SDK, pelo mesmo motivo do
 * `BankItemHasTransactionsError` da TASK-002: o texto de erro do fornecedor
 * nao e confiavel para expor ao usuario (Criterio de aceite #5).
 */
export class PluggyConnectTokenError extends Error {
  constructor() {
    super(
      "Nao foi possivel gerar o token de conexao com a Pluggy. Tente novamente em instantes.",
    );
    this.name = "PluggyConnectTokenError";
  }
}

/**
 * Gera o Connect Token da Pluggy - unico dado que o frontend pode receber
 * (ver docs/PREMISSA.md secao 3 e 11).
 *
 * - Le `CLIENT_ID`/`CLIENT_SECRET` de `process.env`; se qualquer um estiver
 *   ausente ou for string vazia, rejeita com `PluggyConfigError` SEM
 *   instanciar `PluggyClient` (nenhuma tentativa de chamada ao SDK).
 * - `itemId` e sempre `undefined` nesta task (nao existe Item ainda - ver
 *   TASK-003.md secao 4). `clientUserId`, quando informado, vai somente
 *   dentro de `options.clientUserId` (nao na raiz, nao como itemId -
 *   confirmado em node_modules/pluggy-sdk/dist/client.d.ts e na secao 11 da
 *   PREMISSA).
 * - Qualquer falha do SDK (excecao com `.message`/`.stack`, ou rejeicao com
 *   um objeto plano de erro HTTP que nao e `instanceof Error`) vira
 *   `PluggyConnectTokenError` com mensagem propria fixa.
 * - O retorno e sempre `{ accessToken }` - mesmo que o SDK devolva campos
 *   extras, nenhum outro campo e repassado.
 * - Nenhum `console.*` em nenhum caminho (o payload da Pluggy toca dados
 *   financeiros reais).
 */
export async function createConnectToken(
  clientUserId?: string,
): Promise<{ accessToken: string }> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new PluggyConfigError();
  }

  try {
    const client = new PluggyClient({ clientId, clientSecret });
    const options = clientUserId ? { clientUserId } : undefined;
    const result = await client.createConnectToken(undefined, options);
    return { accessToken: result.accessToken };
  } catch {
    throw new PluggyConnectTokenError();
  }
}

/**
 * Erro de dominio: falha ao buscar o Item na Pluggy (`client.fetchItem`) -
 * item nao encontrado (404), rede/timeout, HTTP 4xx/5xx do lado da Pluggy.
 * Mensagem fixa e generica - mesmo motivo de `PluggyConnectTokenError`: o
 * texto de erro do fornecedor nao e confiavel para expor ao usuario
 * (Criterio de aceite #5/#6 da TASK-004: "sem vazar detalhe do SDK").
 */
export class PluggyItemFetchError extends Error {
  constructor() {
    super(
      "Nao foi possivel obter os dados do banco conectado. Tente novamente em instantes.",
    );
    this.name = "PluggyItemFetchError";
  }
}

/**
 * Busca o Item na Pluggy (usado para persistir o `BankItem` - ver
 * lib/bank-item.ts, TASK-004). Resolve o DT-009: devolve os DOIS campos de
 * estado da Pluggy (`status` e `executionStatus`) separadamente, em vez de
 * colapsar num so.
 *
 * - Reutiliza a MESMA validacao de `CLIENT_ID`/`CLIENT_SECRET` de
 *   `createConnectToken` - rejeita com `PluggyConfigError` SEM instanciar
 *   `PluggyClient` quando as credenciais estao ausentes/vazias (Criterio de
 *   aceite #8: nenhuma tentativa de chamada ao SDK nesse caminho).
 * - Quando configurado: `client.fetchItem(pluggyItemId)`
 *   (node_modules/pluggy-sdk/dist/client.d.ts:31) e devolve SOMENTE
 *   `{ institution: item.connector.name, status: item.status,
 *   executionStatus: item.executionStatus }` - nenhum outro campo do `Item`
 *   (nem `item.error`, `item.parameter`, `item.userAction`, nem qualquer
 *   campo de PII que por acidente venha anexado ao payload) passa adiante
 *   (Criterio de aceite #7 - o `Item` real da Pluggy nao documenta
 *   `taxNumber`, mas reconstruir campo a campo e a defesa em profundidade
 *   contra qualquer contaminacao futura do payload).
 * - Qualquer falha (item nao encontrado/404, 500, timeout, excecao ou
 *   rejeicao com objeto plano de erro HTTP) vira `PluggyItemFetchError`,
 *   mensagem fixa/generica, sem stack trace nem detalhe do SDK.
 * - Nenhum `console.*` em nenhum caminho.
 */
export async function fetchPluggyItem(pluggyItemId: string): Promise<{
  institution: string;
  status: string;
  executionStatus: string;
}> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new PluggyConfigError();
  }

  try {
    const client = new PluggyClient({ clientId, clientSecret });
    const item = await client.fetchItem(pluggyItemId);
    return {
      institution: item.connector.name,
      status: item.status,
      executionStatus: item.executionStatus,
    };
  } catch {
    throw new PluggyItemFetchError();
  }
}

/**
 * Erro de dominio: falha ao deletar o Item na Pluggy (`client.deleteItem`) -
 * qualquer coisa que NAO seja um 404 (rede/timeout, HTTP 4xx/5xx do lado da
 * Pluggy). Mensagem fixa e generica - mesmo motivo de
 * `PluggyConnectTokenError`/`PluggyItemFetchError`: o texto de erro do
 * fornecedor nao e confiavel para expor ao usuario.
 */
export class PluggyItemDeleteError extends Error {
  constructor() {
    super(
      "Nao foi possivel desativar este banco. Tente novamente em instantes.",
    );
    this.name = "PluggyItemDeleteError";
  }
}

const NOT_FOUND_STATUS_CODE = 404;

/**
 * Deleta o Item na Pluggy - primeiro passo obrigatorio de "desativar um
 * banco" (DT-002, TASK-005). Chamado por `archiveBankItem` (lib/bank-item.ts)
 * ANTES de qualquer alteracao local, para nunca deixar um banco sumir da UI
 * enquanto ainda compartilha dados com a Pluggy (Criterio de aceite #3).
 *
 * - Reutiliza a MESMA validacao de `CLIENT_ID`/`CLIENT_SECRET` das outras
 *   funcoes deste modulo - rejeita com `PluggyConfigError` SEM instanciar
 *   `PluggyClient` quando as credenciais estao ausentes/vazias.
 * - Quando configurado: `client.deleteItem(pluggyItemId)`
 *   (node_modules/pluggy-sdk/dist/client.d.ts:65).
 * - Em caso de sucesso, resolve (`void`).
 * - Quando a rejeicao e o Item-ja-nao-encontrado (ver `isItemNotFoundError`
 *   abaixo), trata como SUCESSO e resolve mesmo assim - o objetivo (parar de
 *   compartilhar dados) ja esta satisfeito, nao faz sentido travar o
 *   arquivamento local por um Item que ja sumiu do lado da Pluggy (Criterio
 *   de aceite #4).
 * - Qualquer outra falha vira `PluggyItemDeleteError`, mensagem
 *   fixa/generica, sem vazar stack trace nem detalhe do SDK.
 * - Nenhum `console.*` em nenhum caminho.
 */
export async function deleteItemFromPluggy(
  pluggyItemId: string,
): Promise<void> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new PluggyConfigError();
  }

  try {
    const client = new PluggyClient({ clientId, clientSecret });
    await client.deleteItem(pluggyItemId);
  } catch (error) {
    if (isItemNotFoundError(error)) {
      return;
    }

    throw new PluggyItemDeleteError();
  }
}

/**
 * Reconhece o erro "Item ja nao existe na Pluggy" no formato REAL devolvido
 * pelo SDK (confirmado contra a API real, revisao pos-aprovacao da
 * TASK-005): um objeto plano SEM `.statusCode` nem `.response` -
 * `{ message: 'item not found', code: 404, codeDescription: 'ITEM_NOT_FOUND',
 * errorId: '<uuid>' }` (node_modules/pluggy-sdk/dist/baseApi.js rejeita com
 * `error.response.body` cru).
 *
 * `codeDescription === "ITEM_NOT_FOUND"` e o discriminador PRINCIPAL - mais
 * semantico e menos ambiguo que `code`, que a Pluggy reaproveita tanto para
 * status HTTP quanto para codigos de erro proprios em outros endpoints.
 * `code === 404` e aceito como alternativa (o valor numerico do shape real).
 * Uma implementacao anterior checava `error.statusCode === 404`, campo que o
 * SDK real NUNCA popula - o Criterio de aceite #4 falhava silenciosamente em
 * producao (usuario preso ao tentar desativar um Item ja removido na
 * Pluggy).
 */
function isItemNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, codeDescription } = error as {
    code?: unknown;
    codeDescription?: unknown;
  };

  return codeDescription === "ITEM_NOT_FOUND" || code === NOT_FOUND_STATUS_CODE;
}

/**
 * Erro de dominio: falha ao buscar as Accounts de um Item na Pluggy
 * (`client.fetchAccounts`). Mensagem fixa e generica, mesmo padrao dos
 * demais erros deste modulo - o texto de erro do fornecedor nao e confiavel
 * para expor ao usuario.
 */
export class PluggyAccountsFetchError extends Error {
  constructor() {
    super(
      "Nao foi possivel obter as contas deste banco. Tente novamente em instantes.",
    );
    this.name = "PluggyAccountsFetchError";
  }
}

/** Formato cru (ja traduzido, sem PII) de uma Account devolvida pela Pluggy. */
export type PluggyRawAccount = {
  pluggyAccountId: string;
  name: string;
  type: "BANK" | "CREDIT";
  subtype: "CHECKING_ACCOUNT" | "SAVINGS_ACCOUNT" | "CREDIT_CARD";
  balance: number;
};

/**
 * Busca as Accounts de um Item na Pluggy (TASK-006 - sync de Accounts e
 * Transactions). Resolve parte do DT-017: `account.taxNumber`/`owner`/
 * `number`/`marketingName`/`bankData`/`creditData` NUNCA sao repassados.
 *
 * - Reutiliza a MESMA validacao de `CLIENT_ID`/`CLIENT_SECRET` das demais
 *   funcoes deste modulo - rejeita com `PluggyConfigError` SEM instanciar
 *   `PluggyClient` quando as credenciais estao ausentes/vazias.
 * - Quando configurado: `client.fetchAccounts(pluggyItemId)`
 *   (node_modules/pluggy-sdk/dist/client.d.ts:71), que devolve
 *   `PageResponse<Account>` (`{ results, page, total, totalPages }`) - usa
 *   SOMENTE `.results`.
 * - Reconstroi CADA account campo a campo (nunca espalha `...account`), para
 *   nunca deixar `taxNumber`/`owner`/`number`/`marketingName`/`bankData`/
 *   `creditData` vazarem, mesmo que a Pluggy adicione campos novos no
 *   futuro (defesa em profundidade, mesmo padrao de `fetchPluggyItem`).
 * - Qualquer falha do SDK vira `PluggyAccountsFetchError`, mensagem
 *   fixa/generica, sem stack/detalhe do SDK.
 * - Nenhum `console.*` em nenhum caminho.
 */
export async function fetchPluggyAccounts(
  pluggyItemId: string,
): Promise<PluggyRawAccount[]> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new PluggyConfigError();
  }

  try {
    const client = new PluggyClient({ clientId, clientSecret });
    const page = await client.fetchAccounts(pluggyItemId);
    return page.results.map((account) => ({
      pluggyAccountId: account.id,
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      balance: account.balance,
    }));
  } catch {
    throw new PluggyAccountsFetchError();
  }
}

/**
 * Erro de dominio: falha ao buscar as Transactions de uma Account na Pluggy
 * (`client.fetchAllTransactions`). Mensagem fixa e generica, mesmo padrao
 * dos demais erros deste modulo.
 */
export class PluggyTransactionsFetchError extends Error {
  constructor() {
    super(
      "Nao foi possivel obter as transacoes desta conta. Tente novamente em instantes.",
    );
    this.name = "PluggyTransactionsFetchError";
  }
}

/**
 * Formato cru (ja traduzido, sem PII) de uma Transaction devolvida pela
 * Pluggy. `amount` continua CRU - a normalizacao de sinal por tipo de conta
 * (DT-007) e responsabilidade de `lib/sync.ts`, nao deste modulo.
 *
 * TASK-008 (DT-019): `counterpartyDocumentHashes` e o UNICO traco que
 * sobrevive de `paymentData.payer`/`.receiver` - sempre um array de HASHES
 * (nunca o documento cru), calculado DENTRO de `fetchPluggyAllTransactions`
 * com a MESMA `hashDocument` (`@/lib/category-rules`) usada no cadastro de
 * regras (Criterio de aceite #2/#5).
 */
export type PluggyRawTransaction = {
  pluggyTransactionId: string;
  date: Date;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  status: "PENDING" | "POSTED";
  category: string | null;
  paymentMethod: string | null;
  counterpartyDocumentHashes: string[];
};

/**
 * Calcula os hashes da contraparte (payer/receiver) de uma transacao a
 * partir do `paymentData` cru da Pluggy - o documento cru NUNCA sai desta
 * funcao, so o hash (Criterio de aceite #5, DT-019). Deduplicado (Set) -
 * uma transferencia entre contas proprias, onde payer e receiver tem o
 * MESMO documento, devolve um unico hash.
 */
function extractCounterpartyDocumentHashes(paymentData?: {
  payer?: { documentNumber?: { value?: string } };
  receiver?: { documentNumber?: { value?: string } };
}): string[] {
  const rawDocuments = [
    paymentData?.payer?.documentNumber?.value,
    paymentData?.receiver?.documentNumber?.value,
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(rawDocuments.map((document) => hashDocument(document))));
}

const DEFAULT_TRANSACTION_STATUS = "POSTED";

/**
 * Busca TODAS as Transactions de uma Account na Pluggy (TASK-006). Resolve o
 * DT-008 (paginacao): usa `client.fetchAllTransactions`, que varre o cursor
 * internamente e ja devolve o array completo - NUNCA
 * `client.fetchTransactions` (deprecado, pagina por pagina, trunca em
 * silencio se usado sem paginar manualmente). Resolve parte do DT-017:
 * `paymentData.payer`/`.receiver` (CPF/CNPJ, nomes, dados de conta),
 * `creditCardMetadata`, `merchant`, `descriptionRaw`, `providerCode`/
 * `providerId` NUNCA sao repassados - so `paymentData.paymentMethod`
 * sobrevive, mapeado para `paymentMethod`.
 *
 * - Reutiliza a MESMA validacao de `CLIENT_ID`/`CLIENT_SECRET`.
 * - Quando configurado: `client.fetchAllTransactions(pluggyAccountId)`
 *   (node_modules/pluggy-sdk/dist/client.d.ts:106).
 * - Reconstroi CADA transacao campo a campo (nunca espalha `...t`).
 *   `status` usa `t.status ?? "POSTED"` como default quando a Pluggy nao
 *   devolve o campo (a propria SDK documenta esse default - ver
 *   node_modules/pluggy-sdk/dist/types/transaction.d.ts).
 * - Qualquer falha do SDK vira `PluggyTransactionsFetchError`, mesmo padrao
 *   das demais.
 * - Nenhum `console.*` em nenhum caminho.
 */
export async function fetchPluggyAllTransactions(
  pluggyAccountId: string,
): Promise<PluggyRawTransaction[]> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new PluggyConfigError();
  }

  try {
    const client = new PluggyClient({ clientId, clientSecret });
    const transactions = await client.fetchAllTransactions(pluggyAccountId);
    return transactions.map((t) => ({
      pluggyTransactionId: t.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      status: t.status ?? DEFAULT_TRANSACTION_STATUS,
      category: t.category,
      paymentMethod: t.paymentData?.paymentMethod ?? null,
      counterpartyDocumentHashes: extractCounterpartyDocumentHashes(
        t.paymentData,
      ),
    }));
  } catch {
    throw new PluggyTransactionsFetchError();
  }
}

/**
 * Erro de dominio: falha ao buscar as CreditCardBills de uma Account na
 * Pluggy (`client.fetchCreditCardBills`). Mensagem fixa e generica, mesmo
 * padrao dos demais erros deste modulo.
 */
export class PluggyBillsFetchError extends Error {
  constructor() {
    super(
      "Nao foi possivel obter as faturas deste cartao. Tente novamente em instantes.",
    );
    this.name = "PluggyBillsFetchError";
  }
}

/**
 * Formato cru (ja traduzido, sem campos fora de escopo) de uma
 * CreditCardBill devolvida pela Pluggy (TASK-011).
 */
export type PluggyRawBill = {
  pluggyBillId: string;
  dueDate: Date;
  totalAmount: number;
  minimumPaymentAmount: number | null;
};

/**
 * Busca as CreditCardBills (faturas fechadas) de uma Account `CREDIT` na
 * Pluggy (TASK-011 - Fatura do cartao, fecha a Fase 5). So contas CREDIT tem
 * faturas - a decisao de chamar isso SO para contas CREDIT vive em
 * `lib/sync.ts`, nao aqui.
 *
 * - Reutiliza a MESMA validacao de `CLIENT_ID`/`CLIENT_SECRET` das demais
 *   funcoes deste modulo - rejeita com `PluggyConfigError` SEM instanciar
 *   `PluggyClient` quando as credenciais estao ausentes/vazias.
 * - Quando configurado: `client.fetchCreditCardBills(pluggyAccountId)`
 *   (node_modules/pluggy-sdk/dist/client.d.ts:197), que devolve
 *   `PageResponse<CreditCardBills>` (`{ results, page, total, totalPages }`)
 *   - usa SOMENTE `.results`. Um cartao pode devolver `results: []` (visto
 *     num cartao real, secao 11 da PREMISSA) - nao lanca, so devolve `[]`.
 * - Reconstroi CADA fatura campo a campo (nunca espalha `...bill`), para
 *   nunca deixar `payments`/`financeCharges`/`allowsInstallments`/
 *   `totalAmountCurrencyCode` vazarem - fora de escopo desta task (secao 4
 *   do TASK-011.md), mesmo padrao de defesa em profundidade de
 *   `fetchPluggyAccounts`/`fetchPluggyAllTransactions`.
 * - Qualquer falha do SDK vira `PluggyBillsFetchError`, mensagem
 *   fixa/generica, sem stack/detalhe do SDK.
 * - Nenhum `console.*` em nenhum caminho.
 */
export async function fetchPluggyBills(
  pluggyAccountId: string,
): Promise<PluggyRawBill[]> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new PluggyConfigError();
  }

  try {
    const client = new PluggyClient({ clientId, clientSecret });
    const page = await client.fetchCreditCardBills(pluggyAccountId);
    return page.results.map((bill) => ({
      pluggyBillId: bill.id,
      dueDate: bill.dueDate,
      totalAmount: bill.totalAmount,
      minimumPaymentAmount: bill.minimumPaymentAmount,
    }));
  } catch {
    throw new PluggyBillsFetchError();
  }
}
