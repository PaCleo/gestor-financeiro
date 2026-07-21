import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste de "documentacao executavel" do Criterio de aceite #3 e #7 da
 * TASK-004:
 *
 *   - Criterio 3: `prisma/schema.prisma` ganha o campo `executionStatus`
 *     no model `BankItem` (resolve o DT-009 - a Pluggy expoe `item.status`
 *     + `item.executionStatus`, dois campos distintos, e nosso modelo
 *     tinha so um).
 *   - Criterio 7: nenhum campo de PII (o payload de Account traz
 *     `taxNumber` - CPF do titular, ver docs/PREMISSA.md secao 11) e
 *     declarado em NENHUM model do schema - garantia estrutural permanente,
 *     independente de qualquer mock especifico de teste. Esta task nao
 *     toca o model Account (fora de escopo - ver TASK-004.md secao 4), mas
 *     o teste cobre o schema inteiro porque nenhuma parte dele deveria
 *     ganhar uma coluna de PII nesta task.
 */
describe("prisma/schema.prisma - BankItem.executionStatus (Criterio 3 da TASK-004, resolve o DT-009)", () => {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  function extractModelBlock(modelName: string): string {
    const match = schema.match(
      new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
    );
    expect(match).not.toBeNull();
    return match?.[1] ?? "";
  }

  it("model BankItem declara o campo executionStatus", () => {
    const bankItemBlock = extractModelBlock("BankItem");

    expect(bankItemBlock).toMatch(/^\s*executionStatus\s+String/m);
  });

  it("model BankItem continua declarando o campo status (raw, nao substituido pelo executionStatus)", () => {
    const bankItemBlock = extractModelBlock("BankItem");

    expect(bankItemBlock).toMatch(/^\s*status\s+String/m);
  });
});

describe("prisma/schema.prisma - nenhum campo de PII declarado (Criterio 7 da TASK-004, garantia estrutural)", () => {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  it("nenhuma linha do schema declara um campo taxNumber/cpf/cnpj (PII do titular da conta, ver PREMISSA secao 11)", () => {
    const piiFieldPattern = /^\s*(taxNumber|cpf|cnpj)\s+\S+/im;

    expect(schema).not.toMatch(piiFieldPattern);
  });
});
