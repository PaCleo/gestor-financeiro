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
 *
 * TASK-004 (Persistir o BankItem e modelar o estado do Item) estende este
 * mesmo arquivo com testes de `fetchPluggyItem`, a nova funcao de
 * `lib/pluggy.ts` que busca o Item na Pluggy (ver describes no final do
 * arquivo). Contrato assumido para essa parte:
 *
 *   lib/pluggy.ts
 *     export class PluggyItemFetchError extends Error {}
 *     export async function fetchPluggyItem(
 *       pluggyItemId: string,
 *     ): Promise<{ institution: string; status: string; executionStatus: string }>
 *
 * fetchPluggyItem deve:
 *   - reutilizar a MESMA validacao de CLIENT_ID/CLIENT_SECRET de
 *     createConnectToken - rejeita com PluggyConfigError (a mesma classe ja
 *     exportada) SEM instanciar PluggyClient quando as credenciais estao
 *     ausentes/vazias;
 *   - quando configurado, chamar `client.fetchItem(pluggyItemId)`
 *     (node_modules/pluggy-sdk/dist/client.d.ts:31) e devolver SOMENTE
 *     `{ institution: item.connector.name, status: item.status,
 *     executionStatus: item.executionStatus }` - nenhum outro campo do
 *     `Item` (nem `item.error`, `item.parameter`, `item.userAction`, nem
 *     qualquer campo de PII que por acidente venha anexado ao payload -
 *     Criterio de aceite #7 desta task, sobre nao persistir `taxNumber`/CPF)
 *     e repassado adiante;
 *   - traduzir qualquer falha do SDK (item nao encontrado/404, 500, timeout,
 *     excecao ou rejeicao com objeto plano de erro HTTP) em
 *     PluggyItemFetchError, mensagem fixa/generica, sem vazar stack trace
 *     nem detalhe do SDK - mesmo padrao de PluggyConnectTokenError;
 *   - nunca chamar console.log/warn/error em nenhum caminho.
 */

const {
  PluggyClientMock,
  createConnectTokenMock,
  fetchItemMock,
  deleteItemMock,
} = vi.hoisted(() => {
    const createConnectTokenMock = vi.fn();
    // TASK-004: `lib/pluggy.ts` ganha `fetchPluggyItem`, que chama
    // `client.fetchItem(pluggyItemId)` (node_modules/pluggy-sdk/dist/client.d.ts:31 -
    // `fetchItem(id: string): Promise<Item>`). Mockado no MESMO objeto
    // devolvido pelo construtor, ao lado de `createConnectToken`, para
    // reaproveitar o mesmo `PluggyClientMock` construivel (ver nota abaixo)
    // em vez de duplicar o mock da classe inteira num segundo arquivo.
    const fetchItemMock = vi.fn();
    // TASK-005: `lib/pluggy.ts` ganha `deleteItemFromPluggy`, que chama
    // `client.deleteItem(pluggyItemId)` (node_modules/pluggy-sdk/dist/client.d.ts:65 -
    // `deleteItem(id: string): Promise<void>`). Mesma logica de reaproveitar
    // o mesmo `PluggyClientMock` construivel.
    const deleteItemMock = vi.fn();
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
      return {
        createConnectToken: createConnectTokenMock,
        fetchItem: fetchItemMock,
        deleteItem: deleteItemMock,
      };
    });
    return {
      PluggyClientMock,
      createConnectTokenMock,
      fetchItemMock,
      deleteItemMock,
    };
  },
);

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

/**
 * TASK-004 - fetchPluggyItem (busca o Item na Pluggy para persistir o
 * BankItem). Reaproveita o `PluggyClientMock` hoisted no topo do arquivo
 * (agora com `fetchItem: fetchItemMock` no objeto devolvido pelo
 * construtor) - nenhuma chamada de rede real e possivel aqui tambem.
 */

const FAKE_PLUGGY_ITEM_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

// CPF fabricado para teste - formato valido, NUNCA um CPF real. Usado so
// para provar que `fetchPluggyItem` tem poder de deteccao real contra
// vazamento de PII (Criterio de aceite #7 da TASK-004): o payload mockado
// abaixo REALMENTE contem esse valor (licao do DT-011/TASK-003 - uma
// asserção de nao-vazamento so tem valor se o payload testado pudesse
// conter o valor proibido).
const FAKE_CPF = "123.456.789-00";

/**
 * Objeto no formato real de `Item` (node_modules/pluggy-sdk/dist/types/item.d.ts),
 * com todos os campos documentados preenchidos - para que os testes de
 * "so devolve institution/status/executionStatus" tenham poder de deteccao
 * contra QUALQUER um desses campos vazando, nao so contra um payload vazio
 * que trivialmente nao vazaria nada.
 */
function buildMockPluggyItemResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: FAKE_PLUGGY_ITEM_ID,
    connector: {
      id: 201,
      name: "Banco Teste",
      institutionUrl: "https://banco-teste.example.com",
      imageUrl: "https://banco-teste.example.com/logo.png",
      primaryColor: "#000000",
      type: "PERSONAL_BANK",
      country: "BR",
      credentials: [],
      hasMFA: false,
      health: { status: "ONLINE", stage: null },
    },
    status: "UPDATED",
    statusDetail: null,
    error: null,
    executionStatus: "SUCCESS",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    lastUpdatedAt: new Date("2026-07-20T00:00:00.000Z"),
    parameter: null,
    webhookUrl: null,
    clientUserId: null,
    userAction: null,
    consecutiveFailedLoginAttempts: 0,
    nextAutoSyncAt: null,
    consentExpiresAt: null,
    ...overrides,
  };
}

describe("fetchPluggyItem - sucesso (Criterio de aceite #1/#3 da TASK-004)", () => {
  it("busca o Item na Pluggy e retorna institution/status/executionStatus", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    fetchItemMock.mockResolvedValueOnce(
      buildMockPluggyItemResponse({
        connector: { name: "Banco Teste" },
        status: "UPDATED",
        executionStatus: "SUCCESS",
      }),
    );

    const { fetchPluggyItem } = await import("@/lib/pluggy");

    await expect(fetchPluggyItem(FAKE_PLUGGY_ITEM_ID)).resolves.toEqual({
      institution: "Banco Teste",
      status: "UPDATED",
      executionStatus: "SUCCESS",
    });
  });

  it("chama client.fetchItem com o pluggyItemId recebido, instanciando o PluggyClient com as credenciais do ambiente", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    fetchItemMock.mockResolvedValueOnce(buildMockPluggyItemResponse());

    const { fetchPluggyItem } = await import("@/lib/pluggy");
    await fetchPluggyItem(FAKE_PLUGGY_ITEM_ID);

    expect(PluggyClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_SECRET,
      }),
    );
    expect(fetchItemMock).toHaveBeenCalledTimes(1);
    expect(fetchItemMock).toHaveBeenCalledWith(FAKE_PLUGGY_ITEM_ID);
  });

  it("retorna SOMENTE institution/status/executionStatus mesmo que o Item traga PII (taxNumber) ou qualquer outro campo sensivel (Criterio de aceite #7 - defesa contra vazamento)", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    // Payload defensivo: o Item real da Pluggy NAO documenta um campo
    // `taxNumber` (esse e um campo de Account - ver docs/PREMISSA.md secao
    // 11), mas simulamos aqui um payload contaminado/inesperado (erro de
    // integracao futuro, versao nova da API, etc.) para provar que
    // `fetchPluggyItem` reconstroi o objeto de retorno campo a campo em vez
    // de espalhar (`...item`) o que a Pluggy devolver - a mesma tecnica de
    // defesa em profundidade da TASK-003 para `createConnectToken`.
    fetchItemMock.mockResolvedValueOnce(
      buildMockPluggyItemResponse({
        taxNumber: FAKE_CPF,
        accountHolderDocument: FAKE_CPF,
        error: {
          code: "UNEXPECTED_ERROR",
          message: "erro interno que nao deveria vazar",
        },
        userAction: {
          instructions: "informacao sensivel de instrucao ao usuario",
          type: "qr",
        },
      }),
    );

    const { fetchPluggyItem } = await import("@/lib/pluggy");
    const result = await fetchPluggyItem(FAKE_PLUGGY_ITEM_ID);

    expect(Object.keys(result).sort()).toEqual([
      "executionStatus",
      "institution",
      "status",
    ]);
    const rawResult = JSON.stringify(result);
    expect(rawResult).not.toContain(FAKE_CPF);
    expect(rawResult).not.toContain("taxNumber");
    expect(rawResult).not.toContain("accountHolderDocument");
    expect(rawResult).not.toContain("UNEXPECTED_ERROR");
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    fetchItemMock.mockResolvedValueOnce(buildMockPluggyItemResponse());

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { fetchPluggyItem } = await import("@/lib/pluggy");
    await fetchPluggyItem(FAKE_PLUGGY_ITEM_ID);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("fetchPluggyItem - credenciais ausentes", () => {
  it("rejeita com PluggyConfigError quando CLIENT_ID/CLIENT_SECRET estao ausentes, SEM instanciar PluggyClient nem chamar fetchItem", async () => {
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;

    const { fetchPluggyItem, PluggyConfigError } = await import(
      "@/lib/pluggy"
    );

    await expect(fetchPluggyItem(FAKE_PLUGGY_ITEM_ID)).rejects.toBeInstanceOf(
      PluggyConfigError,
    );
    expect(PluggyClientMock).not.toHaveBeenCalled();
    expect(fetchItemMock).not.toHaveBeenCalled();
  });

  it("rejeita com PluggyConfigError quando as credenciais sao string vazia", async () => {
    process.env.CLIENT_ID = "";
    process.env.CLIENT_SECRET = "";

    const { fetchPluggyItem, PluggyConfigError } = await import(
      "@/lib/pluggy"
    );

    await expect(fetchPluggyItem(FAKE_PLUGGY_ITEM_ID)).rejects.toBeInstanceOf(
      PluggyConfigError,
    );
  });
});

describe("fetchPluggyItem - falha da Pluggy (item nao encontrado, 500, timeout)", () => {
  it("traduz uma rejeicao 404 (Item nao encontrado) em PluggyItemFetchError, sem vazar detalhe do SDK", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    fetchItemMock.mockRejectedValueOnce({
      message: "Item not found",
      code: "NOT_FOUND",
      statusCode: 404,
    });

    const { fetchPluggyItem, PluggyItemFetchError } = await import(
      "@/lib/pluggy"
    );

    let caughtError: unknown;
    try {
      await fetchPluggyItem(FAKE_PLUGGY_ITEM_ID);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(PluggyItemFetchError);
    const message = (caughtError as Error).message;
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain("Item not found");
    expect(message).not.toContain("NOT_FOUND");
  });

  it("traduz uma excecao de rede/timeout lancada pelo SDK em PluggyItemFetchError, sem vazar mensagem/stack originais", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    const sdkError = new Error(
      "Timeout awaiting 'request' for 30000ms at connect ETIMEDOUT 200.1.2.3:443",
    );
    sdkError.stack =
      "Error: Timeout\n    at Object.<anonymous> (/app/node_modules/pluggy-sdk/dist/baseApi.js:99:20)";
    fetchItemMock.mockRejectedValueOnce(sdkError);

    const { fetchPluggyItem, PluggyItemFetchError } = await import(
      "@/lib/pluggy"
    );

    let caughtError: unknown;
    try {
      await fetchPluggyItem(FAKE_PLUGGY_ITEM_ID);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(PluggyItemFetchError);
    const message = (caughtError as Error).message;
    expect(message).not.toContain("ETIMEDOUT");
    expect(message).not.toContain("Timeout awaiting");
    expect(message).not.toContain(".ts:");
    expect(message).not.toContain(".js:");
  });

  it("traduz uma falha 500 da Pluggy em PluggyItemFetchError", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    fetchItemMock.mockRejectedValueOnce(new Error("Internal Server Error"));

    const { fetchPluggyItem, PluggyItemFetchError } = await import(
      "@/lib/pluggy"
    );

    await expect(fetchPluggyItem(FAKE_PLUGGY_ITEM_ID)).rejects.toBeInstanceOf(
      PluggyItemFetchError,
    );
  });

  it("nao chama console.log/warn/error mesmo quando a Pluggy falha", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    fetchItemMock.mockRejectedValueOnce(new Error("boom"));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { fetchPluggyItem } = await import("@/lib/pluggy");
    await fetchPluggyItem(FAKE_PLUGGY_ITEM_ID).catch(() => undefined);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

/**
 * TASK-005 - deleteItemFromPluggy (deleta o Item na Pluggy - primeiro passo
 * obrigatorio de "desativar um banco", DT-002). Reaproveita o
 * `PluggyClientMock` hoisted no topo do arquivo (agora com `deleteItem:
 * deleteItemMock`). Contrato assumido (definido pelo qa nesta task - ver
 * secao 5 do TASK-005.md - o coder implementa exatamente assim):
 *
 *   lib/pluggy.ts
 *     export class PluggyItemDeleteError extends Error {}
 *     export async function deleteItemFromPluggy(pluggyItemId: string): Promise<void>
 *
 * deleteItemFromPluggy deve:
 *   - reutilizar a MESMA validacao de CLIENT_ID/CLIENT_SECRET das outras
 *     funcoes - rejeita com PluggyConfigError SEM instanciar PluggyClient
 *     quando as credenciais estao ausentes/vazias;
 *   - quando configurado, chamar `client.deleteItem(pluggyItemId)`
 *     (node_modules/pluggy-sdk/dist/client.d.ts:65 -
 *     `deleteItem(id: string): Promise<void>`);
 *   - em caso de SUCESSO, resolver (undefined);
 *   - em caso de REJEICAO com o Item ja nao existente na Pluggy, tratar
 *     como SUCESSO e RESOLVER (nao rejeitar) - Criterio de aceite #4 da
 *     TASK-005: o objetivo (parar de compartilhar) ja esta satisfeito, nao
 *     faz sentido travar o arquivamento local por um Item que ja sumiu do
 *     lado da Pluggy.
 *     IMPORTANTE (corrigido apos revisao pos-aprovacao - o reviewer
 *     confirmou contra a API real): o SDK NAO rejeita com `statusCode` na
 *     raiz do objeto. O shape real de erro de uma chamada `deleteItem` a um
 *     Item inexistente, capturado numa chamada real, e:
 *       { message: 'item not found', code: 404,
 *         codeDescription: 'ITEM_NOT_FOUND', errorId: '<uuid>' }
 *     Um objeto plano (`constructor: Object`), sem `.response`, sem
 *     `.statusCode`. O discriminador semantico mais robusto e
 *     `codeDescription === 'ITEM_NOT_FOUND'` (o `code` numerico 404 tambem
 *     serve, mas `codeDescription` e mais legivel e menos ambiguo que um
 *     `code` que a Pluggy usa tanto para HTTP status quanto, em outros
 *     endpoints, para codigos de erro proprios). A implementacao anterior
 *     checava `error.statusCode === 404`, que NUNCA e verdadeiro contra o
 *     shape real - o Criterio de aceite #4 falhava silenciosamente em
 *     producao. Ver `tests/unit/lib/bank-item-archive.test.ts` e
 *     `tests/integration/api/items-delete.integration.test.ts` para o mesmo
 *     shape reaproveitado;
 *   - em caso de QUALQUER outra falha (rede/timeout, exception, rejeicao
 *     com objeto plano de erro HTTP que NAO seja o Item-nao-encontrado
 *     acima), rejeitar com PluggyItemDeleteError, mensagem fixa/generica,
 *     sem vazar detalhe do SDK - mesmo padrao de
 *     PluggyConnectTokenError/PluggyItemFetchError;
 *   - nunca chamar console.log/warn/error em nenhum caminho.
 */

/**
 * Shape REAL do erro devolvido por `client.deleteItem` contra um Item que
 * ja nao existe na Pluggy - capturado pelo orquestrador numa chamada real
 * `deleteItem` a um item inexistente (revisao pos-aprovacao da TASK-005).
 * NAO tem `.statusCode` nem `.response` - e um objeto plano.
 */
function buildRealPluggyItemNotFoundError(
  overrides: Record<string, unknown> = {},
) {
  return {
    message: "item not found",
    code: 404,
    codeDescription: "ITEM_NOT_FOUND",
    errorId: "6f6b6f8a-6f9a-4b7a-9b3a-1c2d3e4f5a6b",
    ...overrides,
  };
}

describe("deleteItemFromPluggy - sucesso (Criterio de aceite #3 da TASK-005)", () => {
  it("resolve quando client.deleteItem resolve", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    deleteItemMock.mockResolvedValueOnce(undefined);

    const { deleteItemFromPluggy } = await import("@/lib/pluggy");

    await expect(
      deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID),
    ).resolves.toBeUndefined();
  });

  it("instancia o PluggyClient com as credenciais do ambiente e chama client.deleteItem com o pluggyItemId recebido", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    deleteItemMock.mockResolvedValueOnce(undefined);

    const { deleteItemFromPluggy } = await import("@/lib/pluggy");
    await deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID);

    expect(PluggyClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_SECRET,
      }),
    );
    expect(deleteItemMock).toHaveBeenCalledTimes(1);
    expect(deleteItemMock).toHaveBeenCalledWith(FAKE_PLUGGY_ITEM_ID);
  });

  it("nao chama console.log/warn/error no caminho feliz", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    deleteItemMock.mockResolvedValueOnce(undefined);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { deleteItemFromPluggy } = await import("@/lib/pluggy");
    await deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("deleteItemFromPluggy - credenciais ausentes", () => {
  it("rejeita com PluggyConfigError quando CLIENT_ID/CLIENT_SECRET estao ausentes, SEM instanciar PluggyClient nem chamar deleteItem", async () => {
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;

    const { deleteItemFromPluggy, PluggyConfigError } = await import(
      "@/lib/pluggy"
    );

    await expect(
      deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID),
    ).rejects.toBeInstanceOf(PluggyConfigError);
    expect(PluggyClientMock).not.toHaveBeenCalled();
    expect(deleteItemMock).not.toHaveBeenCalled();
  });
});

describe("deleteItemFromPluggy - Item ja nao existe na Pluggy, shape REAL do erro (Criterio de aceite #4 da TASK-005)", () => {
  it("resolve (NAO rejeita) quando client.deleteItem rejeita com o shape real de 'item not found' (code: 404, codeDescription: 'ITEM_NOT_FOUND', SEM statusCode)", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    const realNotFoundError = buildRealPluggyItemNotFoundError();
    // Confirma que o fixture NAO tem `statusCode` - se um `overrides`
    // futuro reintroduzir esse campo por engano, o teste avisa aqui em vez
    // de mascarar silenciosamente uma regressao do proprio teste.
    expect(realNotFoundError).not.toHaveProperty("statusCode");
    deleteItemMock.mockRejectedValueOnce(realNotFoundError);

    const { deleteItemFromPluggy } = await import("@/lib/pluggy");

    await expect(
      deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID),
    ).resolves.toBeUndefined();
  });

  it("nao chama console.log/warn/error quando trata o Item-nao-encontrado real como sucesso", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    deleteItemMock.mockRejectedValueOnce(buildRealPluggyItemNotFoundError());

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { deleteItemFromPluggy } = await import("@/lib/pluggy");
    await deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe("deleteItemFromPluggy - falha real da Pluggy (NAO e Item-nao-encontrado): rejeita com erro tratado (direcao critica de privacidade)", () => {
  it("traduz uma rejeicao 'Forbidden' (objeto plano, SEM code: 404 nem codeDescription: 'ITEM_NOT_FOUND') em PluggyItemDeleteError, sem vazar detalhe do SDK", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    // Shape plausivel de outro erro real da Pluggy (nao confirmado campo a
    // campo como o de 'item not found', mas deliberadamente SEM
    // `statusCode` - ja confirmado que o SDK nao usa esse campo - e SEM
    // `code: 404`/`codeDescription: 'ITEM_NOT_FOUND'`, para nao ser
    // confundido com o caso de sucesso do Criterio 4. Esta e a direcao
    // CRITICA de privacidade: um erro que NAO e "item ja nao existe"
    // precisa continuar rejeitando (e portanto nao arquivar nada
    // localmente - ver tests/unit/lib/bank-item-archive.test.ts e
    // tests/integration/api/items-delete.integration.test.ts).
    deleteItemMock.mockRejectedValueOnce({
      message: "Forbidden for this API key",
      code: "FORBIDDEN",
      errorId: "9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d",
    });

    const { deleteItemFromPluggy, PluggyItemDeleteError } = await import(
      "@/lib/pluggy"
    );

    let caughtError: unknown;
    try {
      await deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(PluggyItemDeleteError);
    const message = (caughtError as Error).message;
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain("Forbidden for this API key");
    expect(message).not.toContain("FORBIDDEN");
  });

  it("traduz uma excecao de rede/timeout lancada pelo SDK em PluggyItemDeleteError, sem vazar mensagem/stack originais", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    const sdkError = new Error(
      "Timeout awaiting 'request' for 30000ms at connect ETIMEDOUT 200.1.2.3:443",
    );
    sdkError.stack =
      "Error: Timeout\n    at Object.<anonymous> (/app/node_modules/pluggy-sdk/dist/baseApi.js:99:20)";
    deleteItemMock.mockRejectedValueOnce(sdkError);

    const { deleteItemFromPluggy, PluggyItemDeleteError } = await import(
      "@/lib/pluggy"
    );

    let caughtError: unknown;
    try {
      await deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(PluggyItemDeleteError);
    const message = (caughtError as Error).message;
    expect(message).not.toContain("ETIMEDOUT");
    expect(message).not.toContain("Timeout awaiting");
    expect(message).not.toContain(".ts:");
    expect(message).not.toContain(".js:");
  });

  it("traduz uma falha 500 da Pluggy em PluggyItemDeleteError", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    deleteItemMock.mockRejectedValueOnce(new Error("Internal Server Error"));

    const { deleteItemFromPluggy, PluggyItemDeleteError } = await import(
      "@/lib/pluggy"
    );

    await expect(
      deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID),
    ).rejects.toBeInstanceOf(PluggyItemDeleteError);
  });

  it("nao chama console.log/warn/error mesmo quando a Pluggy falha de verdade", async () => {
    process.env.CLIENT_ID = FAKE_CLIENT_ID;
    process.env.CLIENT_SECRET = FAKE_CLIENT_SECRET;
    deleteItemMock.mockRejectedValueOnce(new Error("boom"));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { deleteItemFromPluggy } = await import("@/lib/pluggy");
    await deleteItemFromPluggy(FAKE_PLUGGY_ITEM_ID).catch(() => undefined);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
