import { syncAllActiveBankItems, type SyncAllResult } from "@/lib/sync";
import type { ApiResponse } from "@/lib/api-response";

/**
 * POST /api/sync - Criterio de aceite #2 da TASK-006.
 *
 * Rota casca fina: dispara o sync de TODOS os `BankItem`s ativos (em serie -
 * ADR 7), sem receber corpo (nao ha parametro - `syncAllActiveBankItems` ja
 * decide quais bancos sincronizar). Toda a logica vive em
 * `syncAllActiveBankItems` (lib/sync.ts).
 *
 * `syncAllActiveBankItems` ja captura falha por-item (um banco que falha
 * vira `{ status: "ERROR" }` naquela posicao do array, sem interromper os
 * demais) - entao um `throw` aqui so acontece por falha inesperada (ex.
 * `listActiveBankItems` rejeitando por Postgres fora do ar). Nesse caso,
 * 500 generico em `ApiResponse<T>`, sem vazar mensagem/stack do erro
 * original.
 *
 * Nenhum `console.*` em nenhum caminho.
 *
 * O parametro `request` segue a assinatura padrao de Route Handler do
 * Next.js e nao e usado por esta rota (nao ha corpo a ler); mantido para
 * compatibilidade de call-site com os testes (mesmo padrao de
 * `app/api/health/route.ts`, DT-001).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(request: Request): Promise<Response> {
  try {
    const results = await syncAllActiveBankItems();
    const body: ApiResponse<SyncAllResult[]> = {
      success: true,
      data: results,
    };
    return Response.json(body, { status: 200 });
  } catch {
    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel sincronizar os bancos. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
