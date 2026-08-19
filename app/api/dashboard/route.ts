import { getMonthlySummary, monthQuerySchema, type MonthlySummary } from "@/lib/dashboard";
import type { ApiResponse } from "@/lib/api-response";

/**
 * GET /api/dashboard - Criterio de aceite #6 da TASK-010.
 *
 * Rota casca fina: toda a logica (janela do mes, DT-018, agrupamento por
 * categoria efetiva) vive em `getMonthlySummary` (lib/dashboard.ts). Aqui so
 * parseamos `month` da query string com `monthQuerySchema` (o MESMO schema
 * usado por `app/dashboard/page.tsx`, nunca reescrito aqui) e traduzimos o
 * resultado/erro para `ApiResponse<T>`.
 *
 * `month` ausente ou malformado: 400 com `success: false`, SEM chamar
 * `getMonthlySummary`.
 *
 * Sucesso: 200 com `{ success: true, data: <MonthlySummary> }` - sem `meta`,
 * o resumo mensal ja carrega tudo (nao ha paginacao aqui, diferente de
 * /api/transactions).
 *
 * Qualquer erro de `getMonthlySummary`: 500 generico, sem vazar
 * mensagem/stack do erro original.
 *
 * Nenhum `console.*` em nenhum caminho.
 */
export async function GET(request: Request): Promise<Response> {
  const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
  const parsedQuery = monthQuerySchema.safeParse(rawQuery);

  if (!parsedQuery.success) {
    const body: ApiResponse<never> = {
      success: false,
      error: "Mes invalido. Use o formato YYYY-MM.",
    };
    return Response.json(body, { status: 400 });
  }

  try {
    const summary = await getMonthlySummary(parsedQuery.data.month);
    const body: ApiResponse<MonthlySummary> = {
      success: true,
      data: summary,
    };
    return Response.json(body, { status: 200 });
  } catch {
    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel carregar o resumo do dashboard. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
