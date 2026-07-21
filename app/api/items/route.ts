import { z } from "zod";
import { upsertBankItem } from "@/lib/bank-item";
import type { ApiResponse } from "@/lib/api-response";

const connectItemBodySchema = z.object({
  pluggyItemId: z.uuid(),
});

/**
 * POST /api/items - Criterios de aceite #1 e #2 da TASK-004.
 *
 * Rota casca fina: toda a logica (buscar o Item na Pluggy, persistir o
 * `BankItem`, derivar o estado) vive em `upsertBankItem` (lib/bank-item.ts).
 * Aqui so validamos o corpo com Zod e traduzimos o resultado/erro para
 * `ApiResponse<T>`.
 *
 * O corpo e tolerante a ausencia/`null`/JSON malformado - mesma licao do bug
 * de corpo `null` encontrado na revisao pos-aprovacao da TASK-003
 * (`request.json()` RESOLVE com `null` para o corpo JSON literal "null", nao
 * rejeita): o parse fica dentro do mesmo bloco protegido pelo Zod
 * `safeParse`, que trata qualquer formato invalido (incluindo `null`) como
 * erro de validacao.
 *
 * Validacao Zod falhando (corpo ausente/`null`/malformado, sem
 * `pluggyItemId`, formato nao-UUID): 400 com `success: false` e mensagem
 * generica, SEM chamar `upsertBankItem`.
 *
 * Qualquer erro capturado de `upsertBankItem` (`PluggyConfigError`,
 * `PluggyItemFetchError`, ou qualquer coisa inesperada - a rota nao confia
 * cegamente no tipo, mesmo padrao de `app/api/connect-token/route.ts` da
 * TASK-003): 500 com `success: false`, mensagem generica, sem vazar stack
 * trace/detalhe do SDK.
 *
 * Sucesso: 201 com `{ success: true, data: <BankItem reconstruido> }` -
 * `data` e reconstruido campo a campo a partir do retorno de
 * `upsertBankItem`, nunca repassado cru, para nao amplificar um eventual
 * vazamento de PII vindo de uma camada abaixo (defesa em profundidade,
 * Criterio de aceite #7).
 *
 * Nenhum `console.*` em nenhum caminho.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.json().catch(() => null);
  const parsedBody = connectItemBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    const body: ApiResponse<never> = {
      success: false,
      error: "Corpo da requisicao invalido: pluggyItemId (UUID) e obrigatorio.",
    };
    return Response.json(body, { status: 400 });
  }

  try {
    const result = await upsertBankItem(parsedBody.data.pluggyItemId);
    const body: ApiResponse<{
      id: string;
      pluggyItemId: string;
      institution: string;
      status: string;
      executionStatus: string;
      state: string;
    }> = {
      success: true,
      data: {
        id: result.id,
        pluggyItemId: result.pluggyItemId,
        institution: result.institution,
        status: result.status,
        executionStatus: result.executionStatus,
        state: result.state,
      },
    };
    return Response.json(body, { status: 201 });
  } catch {
    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel conectar este banco. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
