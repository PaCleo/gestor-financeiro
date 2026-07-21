import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchPluggyItem } from "@/lib/pluggy";

/**
 * Erro de dominio: tentativa de excluir um `BankItem` que ainda tem
 * `Transaction`s importadas vinculadas (via `Account.transactions`).
 *
 * Mensagem fixa e propria (nao interpola `error.message`/`error.meta` do
 * Prisma cru) - o erro nativo do Postgres/Prisma (`P2003`, SQLSTATE 23503)
 * inclui o nome real da constraint (`Transaction_accountId_fkey`) na propria
 * mensagem, entao a traducao PRECISA substituir, nao so envolver
 * (`{ cause }`), para nao vazar detalhe interno do driver (Criterio de
 * aceite #4 da TASK-002).
 */
export class BankItemHasTransactionsError extends Error {
  constructor() {
    super(
      "Nao e possivel excluir este banco: existem transacoes importadas " +
        "vinculadas a ele. Remova ou desvincule as transacoes antes de " +
        "tentar novamente.",
    );
    this.name = "BankItemHasTransactionsError";
  }
}

const FOREIGN_KEY_VIOLATION_ERROR_CODE = "P2003";

/**
 * Exclui um `BankItem` e suas `Account`s (cascade, ver `prisma/schema.prisma`).
 *
 * A politica de exclusao e intencional (TASK-002, Criterio de aceite #1):
 * `Account.bankItem` e `onDelete: Cascade` (contas sem transacoes somem
 * junto do banco), mas `Transaction.account` e `onDelete: Restrict` (o
 * Postgres recusa a exclusao se qualquer `Account` do `BankItem` tiver
 * `Transaction`s - preserva o historico financeiro do usuario). Essa funcao
 * traduz a violacao de FK (`P2003`) num erro de dominio nomeado
 * (`BankItemHasTransactionsError`) em vez de deixar vazar o erro cru do
 * Prisma/Postgres para quem chama.
 */
export async function deleteBankItem(bankItemId: string): Promise<void> {
  try {
    await prisma.bankItem.delete({ where: { id: bankItemId } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === FOREIGN_KEY_VIOLATION_ERROR_CODE
    ) {
      throw new BankItemHasTransactionsError();
    }
    throw error;
  }
}

/**
 * Estado derivado do `BankItem` (TASK-004, resolve o DT-009): a Pluggy expoe
 * dois campos de estado distintos (`item.status` e `item.executionStatus`,
 * ver docs/PREMISSA.md secao 11 e node_modules/pluggy-sdk/dist/types/item.js
 * e execution.js), e nosso modelo colapsava isso num so. `state` NAO e uma
 * coluna do banco - e sempre calculado a partir dos dois valores crus
 * persistidos, para nunca ficar desatualizado/inconsistente com eles.
 */
export type BankItemState =
  | "OK"
  | "SINCRONIZANDO"
  | "PRECISA_ACAO"
  | "ERRO"
  | "PARCIAL";

/** `item.status` que significa "depende de uma acao do usuario para continuar". */
const STATUSES_REQUIRING_USER_ACTION = new Set([
  "WAITING_USER_INPUT",
  "WAITING_USER_ACTION",
  "LOGIN_ERROR",
]);

/** `item.status` que significa "ainda sincronizando". */
const SYNCING_STATUSES = new Set(["UPDATING", "MERGING"]);

/**
 * `item.executionStatus` "em progresso" - CREATING/CREATED mais os 13
 * valores de CONNECTOR_EXECUTION_STATUSES do SDK (inclui
 * WAITING_USER_INPUT/WAITING_USER_ACTION *como executionStatus*, familia
 * semantica diferente do mesmo nome em `item.status`).
 */
const SYNCING_EXECUTION_STATUSES = new Set([
  "CREATING",
  "CREATED",
  "LOGIN_IN_PROGRESS",
  "WAITING_USER_INPUT",
  "WAITING_USER_ACTION",
  "LOGIN_MFA_IN_PROGRESS",
  "ACCOUNTS_IN_PROGRESS",
  "TRANSACTIONS_IN_PROGRESS",
  "PAYMENT_DATA_IN_PROGRESS",
  "CREDITCARDS_IN_PROGRESS",
  "INVESTMENTS_IN_PROGRESS",
  "INVESTMENTS_TRANSACTIONS_IN_PROGRESS",
  "IDENTITY_IN_PROGRESS",
  "LOANS_IN_PROGRESS",
  "ACCOUNT_STATEMENTS_IN_PROGRESS",
]);

/**
 * `item.executionStatus` "finalizado com erro" - EXECUTION_FINISHED_STATUSES
 * do SDK, exceto `SUCCESS`/`PARTIAL_SUCCESS` (tratados antes, em R2/R3).
 * `CREATE_ERROR` fica de fora deste set porque nao pertence a
 * EXECUTION_FINISHED_STATUSES no SDK (e um valor "de criacao"), mas ainda
 * assim significa erro - checado separadamente.
 */
const ERROR_EXECUTION_STATUSES = new Set([
  "INVALID_CREDENTIALS",
  "ALREADY_LOGGED_IN",
  "UNEXPECTED_ERROR",
  "INVALID_CREDENTIALS_MFA",
  "SITE_NOT_AVAILABLE",
  "ACCOUNT_LOCKED",
  "ACCOUNT_CREDENTIALS_RESET",
  "CONNECTION_ERROR",
  "ACCOUNT_NEEDS_ACTION",
  "USER_AUTHORIZATION_PENDING",
  "USER_AUTHORIZATION_NOT_GRANTED",
  "USER_NOT_SUPPORTED",
  "USER_INPUT_TIMEOUT",
  "MERGE_ERROR",
  "ERROR",
]);

/**
 * Deriva o estado do `BankItem` a partir do `status` + `executionStatus`
 * crus da Pluggy (Criterio de aceite #4 da TASK-004 - "o coracao da task").
 *
 * Regras em ordem de prioridade (a primeira que casar decide - ver
 * tests/unit/lib/bank-item-state.test.ts para o contrato exaustivo):
 *   R1. status de acao do usuario -> PRECISA_ACAO
 *   R2. executionStatus PARTIAL_SUCCESS -> PARCIAL (nunca OK - um produto
 *       falhou)
 *   R3. status UPDATED + executionStatus SUCCESS -> OK (unica combinacao
 *       "tudo certo")
 *   R4. status/executionStatus "em progresso" -> SINCRONIZANDO
 *   R5. status OUTDATED ou executionStatus "finalizado com erro" -> ERRO
 *   R6. qualquer valor NAO reconhecido (a Pluggy pode adicionar valores
 *       novos a qualquer momento) -> ERRO (fallback seguro - nunca OK,
 *       nunca lanca)
 */
export function deriveBankItemState(
  status: string,
  executionStatus: string,
): BankItemState {
  if (STATUSES_REQUIRING_USER_ACTION.has(status)) {
    return "PRECISA_ACAO";
  }
  if (executionStatus === "PARTIAL_SUCCESS") {
    return "PARCIAL";
  }
  if (status === "UPDATED" && executionStatus === "SUCCESS") {
    return "OK";
  }
  if (
    SYNCING_STATUSES.has(status) ||
    SYNCING_EXECUTION_STATUSES.has(executionStatus)
  ) {
    return "SINCRONIZANDO";
  }
  if (
    status === "OUTDATED" ||
    ERROR_EXECUTION_STATUSES.has(executionStatus) ||
    executionStatus === "CREATE_ERROR"
  ) {
    return "ERRO";
  }
  return "ERRO";
}

/**
 * Busca o Item na Pluggy e persiste (cria ou atualiza) o `BankItem`
 * correspondente (TASK-004).
 *
 * 1. Chama `fetchPluggyItem(pluggyItemId)` PRIMEIRO - se rejeitar, nenhuma
 *    operacao de banco acontece (Criterio de aceite #6: nada de registro
 *    parcial).
 * 2. `upsert` por `pluggyItemId` (`@unique` no schema) - cria se nao existe,
 *    atualiza institution/status/executionStatus se ja existe (Criterio de
 *    aceite #5: idempotencia, a constraint unica nunca vira erro 500).
 * 3. Devolve o registro persistido reconstruido campo a campo (nunca
 *    espalha o objeto cru do Prisma nem o de `fetchPluggyItem`) mais
 *    `state`, calculado por `deriveBankItemState` - `state` NAO e uma
 *    coluna do banco.
 */
export async function upsertBankItem(pluggyItemId: string): Promise<{
  id: string;
  pluggyItemId: string;
  institution: string;
  status: string;
  executionStatus: string;
  state: BankItemState;
}> {
  const { institution, status, executionStatus } =
    await fetchPluggyItem(pluggyItemId);

  const bankItem = await prisma.bankItem.upsert({
    where: { pluggyItemId },
    create: { pluggyItemId, institution, status, executionStatus },
    update: { institution, status, executionStatus },
  });

  return {
    id: bankItem.id,
    pluggyItemId: bankItem.pluggyItemId,
    institution: bankItem.institution,
    status: bankItem.status,
    executionStatus: bankItem.executionStatus,
    state: deriveBankItemState(bankItem.status, bankItem.executionStatus),
  };
}
