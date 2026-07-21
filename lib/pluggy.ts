import { PluggyClient } from "pluggy-sdk";

/**
 * Erro de dominio: `CLIENT_ID`/`CLIENT_SECRET` ausentes ou vazias.
 *
 * Mensagem fixa e generica - nunca cita o nome das variaveis nem qualquer
 * valor de credencial (Criterio de aceite #4 da TASK-003). O `PluggyClient`
 * nem chega a ser instanciado nesse caminho (Criterio de aceite #7).
 */
export class PluggyConfigError extends Error {
  constructor() {
    super("Nao foi possivel gerar o token de conexao.");
    this.name = "PluggyConfigError";
  }
}

/**
 * Erro de dominio: a Pluggy (ou o SDK) falhou ao gerar o Connect Token
 * (rede, timeout, HTTP 4xx/5xx). Mensagem fixa e generica - nunca interpola
 * `error.message`/detalhe do SDK, pelo mesmo motivo do
 * `BankItemHasTransactionsError` da TASK-002: o texto de erro do fornecedor
 * nao e confiavel para expor ao usuario (Criterio de aceite #5).
 */
export class PluggyConnectTokenError extends Error {
  constructor() {
    super(
      "Nao foi possivel gerar o token de conexao com a Pluggy. Tente novamente em instantes.",
    );
    this.name = "PluggyConnectTokenError";
  }
}

/**
 * Gera o Connect Token da Pluggy - unico dado que o frontend pode receber
 * (ver docs/PREMISSA.md secao 3 e 11).
 *
 * - Le `CLIENT_ID`/`CLIENT_SECRET` de `process.env`; se qualquer um estiver
 *   ausente ou for string vazia, rejeita com `PluggyConfigError` SEM
 *   instanciar `PluggyClient` (nenhuma tentativa de chamada ao SDK).
 * - `itemId` e sempre `undefined` nesta task (nao existe Item ainda - ver
 *   TASK-003.md secao 4). `clientUserId`, quando informado, vai somente
 *   dentro de `options.clientUserId` (nao na raiz, nao como itemId -
 *   confirmado em node_modules/pluggy-sdk/dist/client.d.ts e na secao 11 da
 *   PREMISSA).
 * - Qualquer falha do SDK (excecao com `.message`/`.stack`, ou rejeicao com
 *   um objeto plano de erro HTTP que nao e `instanceof Error`) vira
 *   `PluggyConnectTokenError` com mensagem propria fixa.
 * - O retorno e sempre `{ accessToken }` - mesmo que o SDK devolva campos
 *   extras, nenhum outro campo e repassado.
 * - Nenhum `console.*` em nenhum caminho (o payload da Pluggy toca dados
 *   financeiros reais).
 */
export async function createConnectToken(
  clientUserId?: string,
): Promise<{ accessToken: string }> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new PluggyConfigError();
  }

  try {
    const client = new PluggyClient({ clientId, clientSecret });
    const options = clientUserId ? { clientUserId } : undefined;
    const result = await client.createConnectToken(undefined, options);
    return { accessToken: result.accessToken };
  } catch {
    throw new PluggyConnectTokenError();
  }
}
