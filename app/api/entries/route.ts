import {
  manualEntryInputSchema,
  createManualEntry,
  EntryAccountNotFoundError,
  EntryAccountConnectedError,
  type ManualEntryListItem,
} from "@/lib/entries";
import type { ApiResponse } from "@/lib/api-response";

/**
 * POST /api/entries - TASK-009, Criterio de aceite #2 e #3.
 *
 * Rota casca fina: toda a logica (a PREVENCAO POR CONVENCAO, o sinal por
 * direcao, a persistencia) vive em `createManualEntry` (`lib/entries.ts`).
 * Aqui so validamos o corpo com `manualEntryInputSchema` e traduzimos o
 * resultado/erro para `ApiResponse<T>`.
 *
 * O corpo e tolerante a ausencia/JSON malformado (`request.json()` protegido
 * por `.catch(() => null)`, mesmo padrao de `app/api/category-rules/route.ts`).
 *
 * Validacao falhando -> 400, SEM chamar `createManualEntry`.
 * `EntryAccountNotFoundError`/`EntryAccountConnectedError` -> 400 (a
 * PREVENCAO POR CONVENCAO, Criterio de aceite #3 - o eixo da task).
 * Sucesso -> 201 com `{ success: true, data: {...} }` RECONSTRUIDO campo a
 * campo a partir do retorno de `createManualEntry`.
 * Qualquer outro erro -> 500 generico, sem vazar stack/detalhe.
 * Nenhum `console.*` em nenhum caminho.
 */
export async function POST(request: Request): Promise<Response> {
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
    const entry = await createManualEntry(parsedBody.data);
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
    return Response.json(body, { status: 201 });
  } catch (error) {
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

    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel criar este lancamento. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
