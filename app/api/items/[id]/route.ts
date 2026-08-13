import { archiveBankItem, BankItemNotFoundError } from "@/lib/bank-item";
import type { ApiResponse } from "@/lib/api-response";

/**
 * DELETE /api/items/[id] - Criterio de aceite #2 da TASK-005 (resolve o
 * DT-002).
 *
 * Rota casca fina: toda a logica (deletar o Item na Pluggy PRIMEIRO e so
 * entao arquivar o `BankItem` local - Criterio de aceite #3) vive em
 * `archiveBankItem` (lib/bank-item.ts). Aqui so lemos o `id` do path (nesta
 * versao do Next, `params` e uma `Promise` - ver
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md,
 * secao "Dynamic Route Segments") e traduzimos o resultado/erro para
 * `ApiResponse<T>`.
 *
 * - Sucesso: 200 com `{ success: true, data: { id, pluggyItemId, archivedAt } }`,
 *   reconstruido campo a campo a partir do retorno de `archiveBankItem`
 *   (nunca `data: result` cru), para nao amplificar um eventual vazamento de
 *   PII vindo de uma camada abaixo.
 * - `BankItemNotFoundError` -> 404, mensagem generica.
 * - Qualquer outro erro (falha da Pluggy traduzida por
 *   `archiveBankItem`/`deleteItemFromPluggy`, ou algo inesperado - a rota
 *   nao confia cegamente no tipo, mesmo padrao de `app/api/items/route.ts`
 *   da TASK-004) -> 500, mensagem generica, sem vazar stack/detalhe.
 * - Nenhum `console.*` em nenhum caminho.
 *
 * O parametro `request` nao e usado por esta rota (so o `id` de `params`
 * importa); mantido para compatibilidade de call-site com os testes e com a
 * assinatura padrao de Route Handler do Next.js. Diferente de
 * `app/api/health/route.ts` (DT-001), nao precisa de `eslint-disable` aqui:
 * a config padrao de `@typescript-eslint/no-unused-vars` (`args:
 * "after-used"`) so acusa argumentos nao usados que vêm DEPOIS do ultimo
 * argumento usado - como `context` (usado) vem depois de `request`, este
 * fica isento.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  try {
    const result = await archiveBankItem(id);
    const body: ApiResponse<{
      id: string;
      pluggyItemId: string;
      archivedAt: Date;
    }> = {
      success: true,
      data: {
        id: result.id,
        pluggyItemId: result.pluggyItemId,
        archivedAt: result.archivedAt,
      },
    };
    return Response.json(body, { status: 200 });
  } catch (error) {
    if (error instanceof BankItemNotFoundError) {
      const body: ApiResponse<never> = {
        success: false,
        error: "Banco nao encontrado.",
      };
      return Response.json(body, { status: 404 });
    }

    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel desativar este banco. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
