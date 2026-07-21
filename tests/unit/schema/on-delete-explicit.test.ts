import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste de "documentacao executavel" do Criterio de aceite #1 da TASK-002:
 * o schema Prisma declara `onDelete` EXPLICITAMENTE nas duas relacoes do
 * fluxo de exclusao de BankItem (BankItem->Account = Cascade,
 * Account->Transaction = Restrict).
 *
 * Por que um teste de TEXTO do schema, e nao so de comportamento no banco:
 * o Postgres ja aplica RESTRICT por padrao do Prisma para relacoes
 * obrigatorias mesmo SEM `onDelete` explicito no schema (confirmado
 * empiricamente via `pg_constraint.confdeltype = 'r'` mesmo antes desta
 * task - ver
 * tests/integration/bank-item-deletion.integration.test.ts). Ou seja, o
 * comportamento observavel no Postgres NAO muda entre "implicito" e
 * "explicito" para essa relacao - so um teste que le o `schema.prisma`
 * consegue provar que a declaracao ficou explicita, como o criterio exige
 * literalmente ("declara onDelete explicitamente").
 */
describe("prisma/schema.prisma - onDelete explicito (Criterio 1 da TASK-002)", () => {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");
  const lines = schema.split("\n");

  it("declara onDelete explicitamente em Account.bankItem (Cascade) e em Transaction.account (Restrict)", () => {
    const accountBankItemFieldLine = lines.find(
      (line) => line.includes("BankItem?") && line.includes("@relation"),
    );
    const transactionAccountFieldLine = lines.find((line) =>
      /^\s*account\s+Account\s+@relation/.test(line),
    );

    expect(accountBankItemFieldLine).toBeDefined();
    expect(transactionAccountFieldLine).toBeDefined();

    expect(accountBankItemFieldLine).toMatch(/onDelete:\s*Cascade/);
    expect(transactionAccountFieldLine).toMatch(/onDelete:\s*Restrict/);
  });
});
