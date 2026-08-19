import { deleteCategoryRule, CategoryRuleNotFoundError } from "@/lib/category-rules";
import type { ApiResponse } from "@/lib/api-response";

/**
 * DELETE /api/category-rules/[id] - Criterio de aceite #4 da TASK-008.
 *
 * Rota casca fina, mesmo padrao de `app/api/items/[id]/route.ts`
 * (TASK-005): le o `id` do path (`params` e uma `Promise` nesta versao do
 * Next) e chama `deleteCategoryRule`, traduzindo para `ApiResponse<T>`.
 *
 * - Sucesso: 200 com `{ success: true, data: { id } }`.
 * - `CategoryRuleNotFoundError` -> 404, mensagem generica.
 * - Qualquer outro erro -> 500, mensagem generica, sem vazar stack/detalhe.
 * - Nenhum `console.*` em nenhum caminho.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  try {
    await deleteCategoryRule(id);
    const body: ApiResponse<{ id: string }> = {
      success: true,
      data: { id },
    };
    return Response.json(body, { status: 200 });
  } catch (error) {
    if (error instanceof CategoryRuleNotFoundError) {
      const body: ApiResponse<never> = {
        success: false,
        error: "Regra de categorizacao nao encontrada.",
      };
      return Response.json(body, { status: 404 });
    }

    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel remover esta regra. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
