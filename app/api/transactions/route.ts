import {
  AccountNotFoundError,
  listTransactions,
  transactionsQuerySchema,
  type TransactionListItem,
} from "@/lib/transactions";
import type { ApiResponse } from "@/lib/api-response";

/**
 * GET /api/transactions - Criterio de aceite #1 da TASK-007.
 *
 * Rota casca fina: toda a logica (filtro por conta/periodo, paginacao,
 * resolucao de categoria) vive em `listTransactions` (lib/transactions.ts).
 * Aqui so parseamos a query string com `transactionsQuerySchema` (o MESMO
 * schema usado por `app/transacoes/page.tsx`, nunca reescrito aqui) e
 * traduzimos o resultado/erro para `ApiResponse<T>`.
 *
 * Validacao Zod falhando (data invalida, periodo invertido, page/limit fora
 * de faixa, accountId vazio): 400 com `success: false`, SEM chamar
 * `listTransactions`.
 *
 * `AccountNotFoundError` (accountId com formato valido mas inexistente na
 * tabela `Account`): 400, nao 500 - e um erro do chamador, nao uma falha
 * interna (ponto de atencao explicito do prompt desta task).
 *
 * Qualquer outro erro: 500 generico, sem vazar mensagem/stack do erro
 * original.
 *
 * Nenhum `console.*` em nenhum caminho.
 */
export async function GET(request: Request): Promise<Response> {
  const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
  const parsedQuery = transactionsQuerySchema.safeParse(rawQuery);

  if (!parsedQuery.success) {
    const body: ApiResponse<never> = {
      success: false,
      error: "Parametros de consulta invalidos.",
    };
    return Response.json(body, { status: 400 });
  }

  try {
    const result = await listTransactions(parsedQuery.data);
    const body: ApiResponse<TransactionListItem[]> = {
      success: true,
      data: result.transactions,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
    return Response.json(body, { status: 200 });
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      const body: ApiResponse<never> = {
        success: false,
        error: "Conta nao encontrada.",
      };
      return Response.json(body, { status: 400 });
    }

    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel carregar as transacoes. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
