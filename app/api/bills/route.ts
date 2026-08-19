import {
  AccountNotFoundError,
  billsQuerySchema,
  listBills,
  type CreditCardBillListItem,
} from "@/lib/bills";
import type { ApiResponse } from "@/lib/api-response";

/**
 * GET /api/bills - Criterio de aceite #7 da TASK-011.
 *
 * Rota casca fina: toda a logica (filtro por conta, ordenacao decrescente
 * por vencimento) vive em `listBills` (lib/bills.ts). Aqui so parseamos a
 * query string com `billsQuerySchema` (o MESMO schema usado internamente por
 * `lib/bills.ts`, nunca reescrito aqui) e traduzimos o resultado/erro para
 * `ApiResponse<T>`.
 *
 * `accountId` vazio (formato invalido): 400 com `success: false`, SEM
 * chamar `listBills`.
 *
 * `AccountNotFoundError` (accountId com formato valido mas inexistente na
 * tabela `Account`): 400, nao 500 - e um erro do chamador, mesmo padrao de
 * /api/transactions.
 *
 * Sucesso: 200 com `{ success: true, data: <faturas> }` - sem `meta` (nao ha
 * paginacao aqui, mesmo padrao de /api/dashboard).
 *
 * Qualquer outro erro: 500 generico, sem vazar mensagem/stack do erro
 * original.
 *
 * Nenhum `console.*` em nenhum caminho.
 */
export async function GET(request: Request): Promise<Response> {
  const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
  const parsedQuery = billsQuerySchema.safeParse(rawQuery);

  if (!parsedQuery.success) {
    const body: ApiResponse<never> = {
      success: false,
      error: "Parametros de consulta invalidos.",
    };
    return Response.json(body, { status: 400 });
  }

  try {
    const bills = await listBills(parsedQuery.data);
    const body: ApiResponse<CreditCardBillListItem[]> = {
      success: true,
      data: bills,
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
      error: "Nao foi possivel carregar as faturas. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
