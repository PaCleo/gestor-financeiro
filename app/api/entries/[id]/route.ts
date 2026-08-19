import {
  manualEntryInputSchema,
  updateManualEntry,
  deleteManualEntry,
  ManualEntryNotFoundError,
  ManualEntryNotEditableError,
  EntryAccountNotFoundError,
  EntryAccountConnectedError,
  type ManualEntryListItem,
} from "@/lib/entries";
import type { ApiResponse } from "@/lib/api-response";

/**
 * PATCH /api/entries/[id] e DELETE /api/entries/[id] - TASK-009, Criterio de
 * aceite #3 e #5. Rota casca fina, mesmo padrao de
 * `app/api/category-rules/[id]/route.ts` (TASK-008): le o `id` do path
 * (`params` e uma `Promise` nesta versao do Next) e chama
 * `updateManualEntry`/`deleteManualEntry`, traduzindo para `ApiResponse<T>`.
 *
 * PATCH: corpo invalido -> 400, SEM chamar `updateManualEntry`.
 * `ManualEntryNotFoundError` -> 404. `EntryAccountNotFoundError`/
 * `EntryAccountConnectedError` -> 400 (a PREVENCAO POR CONVENCAO tambem vale
 * na edicao). `ManualEntryNotEditableError` -> 403 (a transacao existe mas
 * `source=PLUGGY` - dado importado nao se edita a mao). Sucesso -> 200.
 * Qualquer outro erro -> 500 generico.
 *
 * DELETE: `ManualEntryNotFoundError` -> 404. `ManualEntryNotEditableError`
 * -> 403. Sucesso -> 200 com `{ id }`. Qualquer outro erro -> 500 generico.
 *
 * Nenhum `console.*` em nenhum caminho.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  const rawBody = await request.json().catch(() => null);
  const parsedBody = manualEntryInputSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    const body: ApiResponse<never> = {
      success: false,
      error:
        "Corpo da requisicao invalido para o lancamento manual: verifique valor, direcao, data, descricao, metodo e conta.",
    };
    return Response.json(body, { status: 400 });
  }

  try {
    const entry = await updateManualEntry(id, parsedBody.data);
    const body: ApiResponse<ManualEntryListItem> = {
      success: true,
      data: {
        id: entry.id,
        date: entry.date,
        description: entry.description,
        amount: entry.amount,
        direction: entry.direction,
        accountId: entry.accountId,
        accountName: entry.accountName,
        method: entry.method,
        category: entry.category,
      },
    };
    return Response.json(body, { status: 200 });
  } catch (error) {
    if (error instanceof ManualEntryNotFoundError) {
      const body: ApiResponse<never> = {
        success: false,
        error: error.message,
      };
      return Response.json(body, { status: 404 });
    }

    if (
      error instanceof EntryAccountNotFoundError ||
      error instanceof EntryAccountConnectedError
    ) {
      const body: ApiResponse<never> = {
        success: false,
        error: error.message,
      };
      return Response.json(body, { status: 400 });
    }

    if (error instanceof ManualEntryNotEditableError) {
      const body: ApiResponse<never> = {
        success: false,
        error: error.message,
      };
      return Response.json(body, { status: 403 });
    }

    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel salvar as alteracoes. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  try {
    await deleteManualEntry(id);
    const body: ApiResponse<{ id: string }> = {
      success: true,
      data: { id },
    };
    return Response.json(body, { status: 200 });
  } catch (error) {
    if (error instanceof ManualEntryNotFoundError) {
      const body: ApiResponse<never> = {
        success: false,
        error: error.message,
      };
      return Response.json(body, { status: 404 });
    }

    if (error instanceof ManualEntryNotEditableError) {
      const body: ApiResponse<never> = {
        success: false,
        error: error.message,
      };
      return Response.json(body, { status: 403 });
    }

    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel excluir este lancamento. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
