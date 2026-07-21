import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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
