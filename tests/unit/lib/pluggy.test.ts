import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Testes unitarios de lib/pluggy.ts (TASK-003 - Connect Token server-side).
 *
 * A `pluggy-sdk` e mockada INTEIRAMENTE (`vi.mock("pluggy-sdk", ...)`) -
 * nenhum teste deste arquivo faz ou pode fazer chamada de rede real: o
 * modulo real do SDK (que usa `got` para bater em `https://api.pluggy.ai`)
 * nunca e carregado, so o mock abaixo. As credenciais usadas aqui
 * (FAKE_CLIENT_ID/FAKE_CLIENT_SECRET) sao strings inventadas para teste,
 * nunca as credenciais reais do usuario (que nem existem no ambiente de
 * teste - `.env.test` define CLIENT_ID/CLIENT_SECRET como string vazia).
 *
 * Contrato assumido (definido pelo qa nesta task - ver secao 5 do
 * TASK-003.md - o coder implementa exatamente assim):
 *
 *   lib/pluggy.ts
 *     export class PluggyConfigError extends Error {}
 *     export class PluggyConnectTokenError extends Error {}
 *     export async function createConnectToken(
 *       clientUserId?: string,
 *     ): Promise<{ accessToken: string }>
 *
 * createConnectToken deve:
 *   - ler CLIENT_ID/CLIENT_SECRET de process.env e, se algum estiver
 *     ausente OU for string vazia, rejeitar com PluggyConfigError (mensagem
 *     fixa, generica, que NAO cita "CLIENT_ID"/"CLIENT_SECRET" nem qualquer
 *     valor de credencial - Criterio de aceite #4) SEM sequer instanciar o
 *     PluggyClient (Criterio de aceite #7: nenhuma tentativa de chamada);
 *   - quando configurado, instanciar `new PluggyClient({ clientId,
 *     clientSecret })` (import de "pluggy-sdk") e chamar
 *     `client.createConnectToken(itemId, options)`, repassando
 *     `clientUserId` DENTRO de `options.clientUserId` (nao na raiz nem como
 *     itemId) - Criterio de aceite #6, secao 11 da PREMISSA;
 *   - em caso de falha do SDK (excecao de rede/timeout OU rejeicao com um
 *     corpo de erro HTTP, que o SDK real as vezes devolve sem ser instancia
 *     de Error - ver node_modules/pluggy-sdk/dist/baseApi.js), traduzir
 *     para PluggyConnectTokenError com mensagem fixa/generica, sem stack
 *     trace nem detalhe do SDK (Criterio de aceite #5);
 *   - devolver SOMENTE `{ accessToken }` - nunca repassar campos extras que
 *     por acidente vierem no payload resolvido (Criterio de aceite #3);
 *   - nunca chamar console.log/warn/error com o payload da Pluggy
 *     (Criterio de aceite #8 - o retorno contem dados financeiros reais).
 */

const { PluggyClientMock, createConnectTokenMock } = vi.hoisted(() => {
  const createConnectTokenMock = vi.fn();
  // IMPORTANTE: precisa ser uma `function` normal, NAO uma arrow function.
  // O SDK real (`node_modules/pluggy-sdk/dist/client.js`) e
  // `class PluggyClient extends BaseApi`, ou seja, so pode ser chamado com
  // `new` - e e exatamente assim que o contrato desta task (secao 5 do
  // TASK-003.md) manda `lib/pluggy.ts` instanciar (`new PluggyClient({...})`).
  // Arrow functions nunca sao construiveis em JavaScript
  // (`Reflect.construct(() => {}, [])` lanca `TypeError: ... is not a
  // constructor`), e o dispatcher de `new` do @vitest/spy usa
  // `Reflect.construct` sobre a implementation - um mock com arrow function
  // lancaria incondicionalmente em QUALQUER chamada com `new`, independente
  // do que o coder escrever do lado de producao. Usar `function` normal aqui
  // faz o mock se comportar como uma classe de verdade (construivel),
  // preservando o teste do contrato real sem "consertar" o problema
  // trocando `new PluggyClient(...)` por uma chamada sem `new` no lado de
  // producao (isso seria mascarar um erro real de integracao).
  const PluggyClientMock = vi.fn().mockImplementation(function () {
    return { createConnectToken: createConnectTokenMock };
  });
  return { PluggyClientMock, createConnectTokenMock };
});

vi.mock("pluggy-sdk", () => ({
  PluggyClient: PluggyClientMock,
}));

const FAKE_CLIENT_ID = "fake-client-id-para-teste-nao-e-credencial-real";
const FAKE_CLIENT_SECRET = "fake-client-secret-para-teste-nao-e-credencial-real";

const FORBIDDEN_SUBSTRINGS = [
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  "CLIENT_ID",
  "CLIENT_SECRET",
  "X-API-KEY",
  "apiKey",
  "process.env",
  "at Object.",
  "at async",
  ".ts:",
  ".js:",
  "node_modules",
];

const ORIGINAL_CLIENT_ID = process.env.CLIENT_ID;
const ORIGINAL_CLIENT_SECRET = process.env.CLIENT_SECRET;

function restoreEnv() {
  if (ORIGINAL_CLIENT_ID === undefined) {
    delete process.env.CLIENT_ID;
  } else {
    process.env.CLIENT_ID = ORIGINAL_CLIENT_ID;
  }
  if (ORIGINAL_CLIENT_SECRET === undefined) {
    delete process.env.CLIENT_SECRET;
  } else {
    process.env.CLIENT_SECRET = ORIGINAL_CLIENT_SECRET;
  }
}

afterEach(() => {
  vi.clearAllMocks();
  restoreEnv();
  vi.resetModules();
});

describe("createConnectToken - sucesso (Cenario 1 / Criterio 1)", () => {
  it("retorna { accessToken } quando CLIENT_ID e CLIENT_SECRET estao configurados", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-abc-123" });

    const { createConnectToken } = await import("@/lib/pluggy");

    await expect(createConnectToken()).resolves.toEqual({
      accessToken: "token-abc-123",
    });
  });

  it("instancia o PluggyClient da pluggy-sdk com clientId/clientSecret do ambiente - nunca faz a chamada HTTP real", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-abc-123" });

    const { createConnectToken } = await import("@/lib/pluggy");
    await createConnectToken();

    expect(PluggyClientMock).toHaveBeenCalledTimes(1);
    expect(PluggyClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_SECRET,
      }),
    );
  });

  it("retorna somente accessToken mesmo se o SDK devolver campos extras no payload (defesa contra vazamento acidental - Criterio 3)", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    createConnectTokenMock.mockResolvedValueOnce({
      accessToken: "token-abc-123",
      clientId: FAKE_CLIENT_ID,
      clientSecret: FAKE_CLIENT_SECRET,
      internalDebug: "nao-deveria-vazar",
    });

    const { createConnectToken } = await import("@/lib/pluggy");
    const result = await createConnectToken();

    expect(result).toEqual({ accessToken: "token-abc-123" });
    expect(Object.keys(result)).toEqual(["accessToken"]);
  });

  it("nao chama console.log/warn/error no caminho feliz (Criterio 8 - retorno contem dado financeiro real)", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-abc-123" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createConnectToken } = await import("@/lib/pluggy");
    await createConnectToken();

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("createConnectToken - clientUserId repassado em options (Cenario 5 / Criterio 6)", () => {
  it("repassa clientUserId DENTRO de options, nao na raiz e nao como itemId", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-abc-123" });

    const { createConnectToken } = await import("@/lib/pluggy");
    await createConnectToken("user-42");

    expect(createConnectTokenMock).toHaveBeenCalledTimes(1);
    const [itemIdArg, optionsArg] = createConnectTokenMock.mock.calls[0] as [
      unknown,
      { clientUserId?: string } | undefined,
    ];

    // clientUserId NAO pode ser o primeiro argumento (que a SDK trata como
    // itemId, um conceito totalmente diferente - ver
    // node_modules/pluggy-sdk/dist/client.d.ts).
    expect(itemIdArg).not.toBe("user-42");
    expect(optionsArg).toBeDefined();
    expect(optionsArg?.clientUserId).toBe("user-42");
  });

  it("funciona sem clientUserId informado (nao quebra a chamada ao SDK)", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    createConnectTokenMock.mockResolvedValueOnce({ accessToken: "token-sem-user" });

    const { createConnectToken } = await import("@/lib/pluggy");

    await expect(createConnectToken()).resolves.toEqual({
      accessToken: "token-sem-user",
    });
  });
});

describe("createConnectToken - credenciais ausentes (Cenario 3 / Criterio 3/4)", () => {
  it("rejeita com PluggyConfigError quando CLIENT_ID esta ausente", async () => {
    delete process.env.CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;

    const { createConnectToken, PluggyConfigError } = await import("@/lib/pluggy");

    await expect(createConnectToken()).rejects.toBeInstanceOf(PluggyConfigError);
  });

  it("rejeita com PluggyConfigError quando CLIENT_SECRET esta ausente", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    delete process.env.CLIENT_SECRET;

    const { createConnectToken, PluggyConfigError } = await import("@/lib/pluggy");

    await expect(createConnectToken()).rejects.toBeInstanceOf(PluggyConfigError);
  });

  it("rejeita com PluggyConfigError quando CLIENT_ID e CLIENT_SECRET sao string vazia", async () => {
    process.env.CLIENT_ID = "";
    process.env.CLIENT_SECRET = "";

    const { createConnectToken, PluggyConfigError } = await import("@/lib/pluggy");

    await expect(createConnectToken()).rejects.toBeInstanceOf(PluggyConfigError);
  });

  it("a mensagem do erro de config NAO cita CLIENT_ID/CLIENT_SECRET nem qualquer valor de credencial (Criterio 4)", async () => {
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;

    const { createConnectToken } = await import("@/lib/pluggy");

    let caughtError: unknown;
    try {
      await createConnectToken();
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = (caughtError as Error).message;
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(message).not.toContain(forbidden);
    }
  });

  it("credenciais ausentes NUNCA chegam a instanciar o PluggyClient - nenhuma tentativa de chamada ao SDK (Criterio 7)", async () => {
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;

    const { createConnectToken } = await import("@/lib/pluggy");
    await expect(createConnectToken()).rejects.toThrow();

    expect(PluggyClientMock).not.toHaveBeenCalled();
    expect(createConnectTokenMock).not.toHaveBeenCalled();
  });
});

describe("createConnectToken - falha da Pluggy (Cenario 4 / Criterio 5)", () => {
  it("traduz uma excecao lancada pelo SDK (ex.: erro de rede/timeout) em PluggyConnectTokenError, sem vazar a mensagem/stack originais", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;

    const sdkError = new Error(
      "Timeout awaiting 'request' for 30000ms at connect ETIMEDOUT 200.1.2.3:443",
    );
    sdkError.stack =
      "Error: Timeout\n    at Object.<anonymous> (/app/node_modules/pluggy-sdk/dist/baseApi.js:99:20)";
    createConnectTokenMock.mockRejectedValueOnce(sdkError);

    const { createConnectToken, PluggyConnectTokenError } = await import(
      "@/lib/pluggy"
    );

    let caughtError: unknown;
    try {
      await createConnectToken();
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(PluggyConnectTokenError);
    const message = (caughtError as Error).message;
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain("ETIMEDOUT");
    expect(message).not.toContain("Timeout awaiting");
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(message).not.toContain(forbidden);
    }
  });

  it("traduz uma rejeicao HTTP que nao e instancia de Error (formato real do SDK para erros 4xx/5xx - ver baseApi.js) em PluggyConnectTokenError", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;

    // O SDK real rejeita createMutationRequest com error.response.body em
    // erros HTTP (ex.: 403), que e um objeto plano, nao uma instancia de
    // Error - lib/pluggy.ts precisa tratar esse formato tambem.
    createConnectTokenMock.mockRejectedValueOnce({
      message: "Invalid credentials for connectorId",
      code: "INVALID_CREDENTIALS",
      statusCode: 403,
    });

    const { createConnectToken, PluggyConnectTokenError } = await import(
      "@/lib/pluggy"
    );

    let caughtError: unknown;
    try {
      await createConnectToken();
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(PluggyConnectTokenError);
    const message = (caughtError as Error).message;
    expect(message).not.toContain("Invalid credentials for connectorId");
    expect(message).not.toContain("INVALID_CREDENTIALS");
  });

  it("traduz uma falha 500 da Pluggy em PluggyConnectTokenError, sem vazar detalhe interno", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    createConnectTokenMock.mockRejectedValueOnce(new Error("Internal Server Error"));

    const { createConnectToken, PluggyConnectTokenError } = await import(
      "@/lib/pluggy"
    );

    await expect(createConnectToken()).rejects.toBeInstanceOf(PluggyConnectTokenError);
  });

  it("nao chama console.log/warn/error mesmo quando a Pluggy falha (Criterio 8)", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    createConnectTokenMock.mockRejectedValueOnce(new Error("boom"));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createConnectToken } = await import("@/lib/pluggy");
    await createConnectToken().catch(() => undefined);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
