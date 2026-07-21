import { createConnectToken } from "@/lib/pluggy";
import type { ApiResponse } from "@/lib/api-response";

type ConnectTokenRequestBody = {
  clientUserId?: unknown;
};

/**
 * POST /api/connect-token - Criterios de aceite #1 e #2 da TASK-003.
 *
 * Rota casca fina: toda a integracao com a Pluggy (credenciais, SDK,
 * traducao de erro) vive em `createConnectToken` (lib/pluggy.ts). Aqui so
 * extraimos `clientUserId` opcional do corpo da requisicao e traduzimos o
 * resultado/erro para `ApiResponse<T>`.
 *
 * O corpo e tolerante a ausencia/JSON invalido/`null` literal - `clientUserId`
 * e opcional. `request.json()` REJEITA com corpo ausente/JSON malformado, mas
 * RESOLVE com `null` para o corpo JSON literal "null" (json valido) - por
 * isso o parse (com o `.catch`) e a normalizacao `?? {}` precisam estar
 * dentro do mesmo `try` que o resto da rota: um `parsedBody.clientUserId`
 * fora do try, com `parsedBody === null`, lancaria um TypeError nao tratado
 * antes de qualquer logica de negocio rodar (bug encontrado na revisao
 * pos-aprovacao da TASK-003 - `curl` com corpo `null` devolvia 500 com corpo
 * vazio, quebrando o contrato `ApiResponse<T>`).
 *
 * Qualquer erro capturado (parse do corpo, `PluggyConfigError`,
 * `PluggyConnectTokenError` ou qualquer outra coisa inesperada - a rota nao
 * confia cegamente no tipo, mesmo padrao de `app/api/health/route.ts` da
 * TASK-001) vira 500 com uma mensagem generica, nunca o `error.message` bruto
 * nem stack trace.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsedBody: ConnectTokenRequestBody =
      (await request.json().catch(() => null)) ?? {};
    const clientUserId =
      typeof parsedBody.clientUserId === "string"
        ? parsedBody.clientUserId
        : undefined;

    const { accessToken } = await createConnectToken(clientUserId);
    const body: ApiResponse<{ accessToken: string }> = {
      success: true,
      data: { accessToken },
    };
    return Response.json(body, { status: 200 });
  } catch {
    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel gerar o token de conexao. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}
