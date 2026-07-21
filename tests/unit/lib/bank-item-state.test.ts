import { describe, expect, it } from "vitest";

/**
 * Testes unitarios PUROS de `deriveBankItemState` (lib/bank-item.ts,
 * TASK-004 - Criterio de aceite #4, "o coracao da task": resolve o DT-009
 * (a Pluggy expoe `item.status` + `item.executionStatus`, dois campos
 * distintos, e nosso modelo tinha um so - ver docs/DEBITO-TECNICO.md e
 * docs/PREMISSA.md secao 11).
 *
 * Nenhum mock aqui: e uma funcao pura de string->string->enum, sem I/O, sem
 * dependencia de `pluggy-sdk` nem de `lib/db.ts`.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   lib/bank-item.ts
 *     export type BankItemState =
 *       "OK" | "SINCRONIZANDO" | "PRECISA_ACAO" | "ERRO" | "PARCIAL";
 *     export function deriveBankItemState(
 *       status: string,
 *       executionStatus: string,
 *     ): BankItemState
 *
 * Fonte de verdade dos valores possiveis de `status`/`executionStatus`:
 * NAO a tabela solta da PREMISSA (que so cita alguns exemplos), e sim os
 * enums reais do SDK instalado, conferidos linha a linha antes de escrever
 * qualquer teste:
 *   - node_modules/pluggy-sdk/dist/types/item.js -> ITEM_STATUSES (7
 *     valores possiveis de `item.status`)
 *   - node_modules/pluggy-sdk/dist/types/execution.js -> EXECUTION_STATUSES
 *     (33 valores possiveis de `item.executionStatus`, composto de
 *     CREATING/CREATE_ERROR/CREATED + CONNECTOR_EXECUTION_STATUSES (13,
 *     "em progresso") + EXECUTION_FINISHED_STATUSES (17, "finalizado",
 *     exportado de verdade em runtime pelo SDK))
 *
 * REGRAS DE DERIVACAO (contrato exato, em ordem de prioridade - a primeira
 * regra que casar decide o resultado):
 *
 *   R1. `status` em {WAITING_USER_INPUT, WAITING_USER_ACTION, LOGIN_ERROR}
 *       -> PRECISA_ACAO
 *       (Criterio 4 exige isso literalmente para WAITING_USER_INPUT e
 *       LOGIN_ERROR via `status`; WAITING_USER_ACTION e o terceiro status
 *       de Item que tambem significa "depende do usuario" - mesma familia)
 *   R2. `executionStatus === "PARTIAL_SUCCESS"` -> PARCIAL
 *       (Criterio 4: "nunca OK" - um produto falhou, nao e sucesso)
 *   R3. `status === "UPDATED" && executionStatus === "SUCCESS"` -> OK
 *       (unica combinacao "tudo certo")
 *   R4. `status` em {UPDATING, MERGING} OU `executionStatus` em
 *       {CREATING, CREATED} UNIAO CONNECTOR_EXECUTION_STATUSES (os 13
 *       valores "_IN_PROGRESS" + WAITING_USER_INPUT/WAITING_USER_ACTION
 *       *como executionStatus*, nao como status) -> SINCRONIZANDO
 *   R5. `status === "OUTDATED"` OU `executionStatus` em
 *       (EXECUTION_FINISHED_STATUSES \ {SUCCESS, PARTIAL_SUCCESS}) OU
 *       `executionStatus === "CREATE_ERROR"` -> ERRO
 *   R6. Qualquer `status`/`executionStatus` NAO reconhecido (a Pluggy pode
 *       adicionar valores novos a qualquer momento) -> ERRO (fallback
 *       seguro - nunca OK, nunca lanca excecao)
 *
 * Mapeamento -> docs/tasks/TASK-004.md secao 2/3:
 *   - "PARTIAL_SUCCESS -> PARCIAL, nunca OK" (Criterio 4)
 *   - "WAITING_USER_INPUT ou LOGIN_ERROR -> PRECISA_ACAO" (Criterio 4)
 *   - "valor desconhecido -> estado seguro, nao quebra" (Criterio 4)
 *   - cobertura de cada valor documentado (Criterio 4) via os dois
 *     it.each abaixo, que iteram sobre TODOS os 7 valores de ItemStatus e
 *     TODOS os 33 valores de ExecutionStatus do SDK real.
 */

const VALID_STATES = ["OK", "SINCRONIZANDO", "PRECISA_ACAO", "ERRO", "PARCIAL"];

// ITEM_STATUSES - node_modules/pluggy-sdk/dist/types/item.js (7 valores)
const ITEM_STATUS_CASES: Array<[string, string]> = [
  ["UPDATED", "OK"],
  ["UPDATING", "SINCRONIZANDO"],
  ["WAITING_USER_INPUT", "PRECISA_ACAO"],
  ["WAITING_USER_ACTION", "PRECISA_ACAO"],
  ["MERGING", "SINCRONIZANDO"],
  ["LOGIN_ERROR", "PRECISA_ACAO"],
  ["OUTDATED", "ERRO"],
];

// EXECUTION_STATUSES - node_modules/pluggy-sdk/dist/types/execution.js
// (33 valores: CREATING/CREATE_ERROR/CREATED + 13 "_IN_PROGRESS"/MFA +
// 17 valores "finalizados", incluindo SUCCESS e PARTIAL_SUCCESS)
const EXECUTION_STATUS_CASES: Array<[string, string]> = [
  ["CREATING", "SINCRONIZANDO"],
  ["CREATE_ERROR", "ERRO"],
  ["CREATED", "SINCRONIZANDO"],
  ["LOGIN_IN_PROGRESS", "SINCRONIZANDO"],
  ["WAITING_USER_INPUT", "SINCRONIZANDO"],
  ["WAITING_USER_ACTION", "SINCRONIZANDO"],
  ["LOGIN_MFA_IN_PROGRESS", "SINCRONIZANDO"],
  ["ACCOUNTS_IN_PROGRESS", "SINCRONIZANDO"],
  ["TRANSACTIONS_IN_PROGRESS", "SINCRONIZANDO"],
  ["PAYMENT_DATA_IN_PROGRESS", "SINCRONIZANDO"],
  ["CREDITCARDS_IN_PROGRESS", "SINCRONIZANDO"],
  ["INVESTMENTS_IN_PROGRESS", "SINCRONIZANDO"],
  ["INVESTMENTS_TRANSACTIONS_IN_PROGRESS", "SINCRONIZANDO"],
  ["IDENTITY_IN_PROGRESS", "SINCRONIZANDO"],
  ["LOANS_IN_PROGRESS", "SINCRONIZANDO"],
  ["ACCOUNT_STATEMENTS_IN_PROGRESS", "SINCRONIZANDO"],
  ["INVALID_CREDENTIALS", "ERRO"],
  ["ALREADY_LOGGED_IN", "ERRO"],
  ["UNEXPECTED_ERROR", "ERRO"],
  ["INVALID_CREDENTIALS_MFA", "ERRO"],
  ["SITE_NOT_AVAILABLE", "ERRO"],
  ["ACCOUNT_LOCKED", "ERRO"],
  ["ACCOUNT_CREDENTIALS_RESET", "ERRO"],
  ["CONNECTION_ERROR", "ERRO"],
  ["ACCOUNT_NEEDS_ACTION", "ERRO"],
  ["USER_AUTHORIZATION_PENDING", "ERRO"],
  ["USER_AUTHORIZATION_NOT_GRANTED", "ERRO"],
  ["USER_NOT_SUPPORTED", "ERRO"],
  ["USER_INPUT_TIMEOUT", "ERRO"],
  ["MERGE_ERROR", "ERRO"],
  ["ERROR", "ERRO"],
  ["SUCCESS", "OK"],
  ["PARTIAL_SUCCESS", "PARCIAL"],
];

describe("deriveBankItemState - cada valor de ItemStatus (status), executionStatus neutro = SUCCESS", () => {
  it.each(ITEM_STATUS_CASES)(
    "status=%s (+ executionStatus=SUCCESS) -> %s",
    async (status, expected) => {
      const { deriveBankItemState } = await import("@/lib/bank-item");

      expect(deriveBankItemState(status, "SUCCESS")).toBe(expected);
    },
  );
});

describe("deriveBankItemState - cada valor de ExecutionStatus, status neutro = UPDATED", () => {
  it.each(EXECUTION_STATUS_CASES)(
    "executionStatus=%s (+ status=UPDATED) -> %s",
    async (executionStatus, expected) => {
      const { deriveBankItemState } = await import("@/lib/bank-item");

      expect(deriveBankItemState("UPDATED", executionStatus)).toBe(expected);
    },
  );
});

describe("deriveBankItemState - PARTIAL_SUCCESS nunca vira OK (Criterio 4, coracao da task)", () => {
  it("executionStatus PARTIAL_SUCCESS com status UPDATED produz PARCIAL, NUNCA OK", async () => {
    const { deriveBankItemState } = await import("@/lib/bank-item");

    const result = deriveBankItemState("UPDATED", "PARTIAL_SUCCESS");

    expect(result).toBe("PARCIAL");
    expect(result).not.toBe("OK");
  });

  it("mesmo com um status fora do comum, PARTIAL_SUCCESS nunca produz OK", async () => {
    const { deriveBankItemState } = await import("@/lib/bank-item");

    expect(deriveBankItemState("MERGING", "PARTIAL_SUCCESS")).not.toBe("OK");
  });
});

describe("deriveBankItemState - status que exige acao do usuario (Criterio 4)", () => {
  it("status WAITING_USER_INPUT produz PRECISA_ACAO independente do executionStatus", async () => {
    const { deriveBankItemState } = await import("@/lib/bank-item");

    expect(deriveBankItemState("WAITING_USER_INPUT", "SUCCESS")).toBe(
      "PRECISA_ACAO",
    );
    expect(
      deriveBankItemState("WAITING_USER_INPUT", "LOGIN_IN_PROGRESS"),
    ).toBe("PRECISA_ACAO");
  });

  it("status LOGIN_ERROR produz PRECISA_ACAO independente do executionStatus", async () => {
    const { deriveBankItemState } = await import("@/lib/bank-item");

    expect(deriveBankItemState("LOGIN_ERROR", "SUCCESS")).toBe("PRECISA_ACAO");
    expect(deriveBankItemState("LOGIN_ERROR", "UNEXPECTED_ERROR")).toBe(
      "PRECISA_ACAO",
    );
  });
});

describe("deriveBankItemState - valor desconhecido nao quebra (Criterio 4 - a Pluggy pode adicionar valores novos)", () => {
  it("status desconhecido (nao documentado no SDK) resolve para um estado seguro, nunca OK, e nunca lanca", async () => {
    const { deriveBankItemState } = await import("@/lib/bank-item");

    let result: string | undefined;
    expect(() => {
      result = deriveBankItemState("STATUS_NOVO_DA_PLUGGY_2027", "SUCCESS");
    }).not.toThrow();

    expect(result).not.toBe("OK");
    expect(VALID_STATES).toContain(result);
  });

  it("executionStatus desconhecido (nao documentado no SDK) resolve para um estado seguro, nunca OK, e nunca lanca", async () => {
    const { deriveBankItemState } = await import("@/lib/bank-item");

    let result: string | undefined;
    expect(() => {
      result = deriveBankItemState("UPDATED", "EXECUCAO_NOVA_DA_PLUGGY_2027");
    }).not.toThrow();

    expect(result).not.toBe("OK");
    expect(VALID_STATES).toContain(result);
  });

  it("status E executionStatus desconhecidos ao mesmo tempo tambem resolvem para um estado seguro sem lancar", async () => {
    const { deriveBankItemState } = await import("@/lib/bank-item");

    let result: string | undefined;
    expect(() => {
      result = deriveBankItemState(
        "STATUS_NOVO_DA_PLUGGY_2027",
        "EXECUCAO_NOVA_DA_PLUGGY_2027",
      );
    }).not.toThrow();

    expect(result).not.toBe("OK");
    expect(VALID_STATES).toContain(result);
  });

  it("string vazia em status/executionStatus nao lanca e resolve para um estado seguro", async () => {
    const { deriveBankItemState } = await import("@/lib/bank-item");

    let result: string | undefined;
    expect(() => {
      result = deriveBankItemState("", "");
    }).not.toThrow();

    expect(result).not.toBe("OK");
    expect(VALID_STATES).toContain(result);
  });
});

describe("deriveBankItemState - resultado e sempre um dos 5 estados validos (robustez)", () => {
  it("para todos os pares testados acima (ItemStatus x SUCCESS, UPDATED x ExecutionStatus), o resultado esta em VALID_STATES", async () => {
    const { deriveBankItemState } = await import("@/lib/bank-item");

    for (const [status] of ITEM_STATUS_CASES) {
      expect(VALID_STATES).toContain(deriveBankItemState(status, "SUCCESS"));
    }
    for (const [executionStatus] of EXECUTION_STATUS_CASES) {
      expect(VALID_STATES).toContain(
        deriveBankItemState("UPDATED", executionStatus),
      );
    }
  });
});
