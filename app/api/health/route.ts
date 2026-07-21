import { checkDatabaseConnection } from "@/lib/health";
import type { ApiResponse } from "@/lib/api-response";

/**
 * GET /api/health - Criterio de aceite #6 da TASK-001.
 *
 * Rota casca fina: toda a logica de conectividade vive em
 * `checkDatabaseConnection` (lib/health.ts). Mesmo que essa funcao
 * inesperadamente rejeite (ela nao deveria, mas a rota nao confia
 * cegamente nisso), o try/catch aqui garante que nenhuma mensagem de erro
 * real (connection string, credenciais, stack trace) chega ao cliente -
 * sempre respondemos com uma mensagem generica.
 *
 * O parametro `request` segue a assinatura padrao de Route Handler do
 * Next.js (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md)
 * e nao e usado por esta rota; mantido para compatibilidade de call-site
 * com os testes, que invocam `GET(new Request(...))`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(request: Request): Promise<Response> {
  let isDatabaseOk: boolean;

  try {
    isDatabaseOk = await checkDatabaseConnection();
  } catch {
    isDatabaseOk = false;
  }

  if (!isDatabaseOk) {
    const body: ApiResponse<never> = {
      success: false,
      error: "Servico indisponivel: nao foi possivel conectar ao banco de dados.",
    };
    return Response.json(body, { status: 503 });
  }

  const body: ApiResponse<{ database: "ok" }> = {
    success: true,
    data: { database: "ok" },
  };
  return Response.json(body, { status: 200 });
}
