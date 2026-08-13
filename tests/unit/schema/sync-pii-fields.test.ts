import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste de "documentacao executavel" do Criterio de aceite #6 da TASK-006
 * (resolve o DT-017): garantia ESTRUTURAL, no proprio `schema.prisma`, de
 * que nenhum campo de PII de `paymentData` (CPF/CNPJ de pagador/recebedor,
 * nomes, dados de conta bancaria de terceiros - docs/PREMISSA.md secao 11,
 * item 3) e declarado em NENHUM model.
 *
 * Mesmo padrao de tests/unit/schema/bank-item-execution-status.test.ts
 * (Criterio 7 da TASK-004, que ja cobre `taxNumber`/`cpf`/`cnpj`) - esta
 * task estende a lista de padroes proibidos com os campos NOVOS que o
 * `paymentData` da Pluggy expoe (`documentNumber`, `payer`, `receiver`,
 * e variantes de nome de coluna que um coder apressado poderia usar para
 * "so guardar o nome do pagador").
 *
 * Este teste NAO substitui a prova de valor (JSON.stringify do row no
 * Postgres, em tests/integration/sync.integration.test.ts) - e um
 * complemento estrutural, permanente, independente de qualquer mock
 * especifico (licao do DT-011: nome de coluna nao prova ausencia de
 * vazamento de VALOR, mas continua sendo uma rede de seguranca barata).
 */
describe("prisma/schema.prisma - nenhum campo de PII de paymentData declarado (Criterio 6 da TASK-006, resolve o DT-017)", () => {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  it.each([
    "documentNumber",
    "payerDocument",
    "receiverDocument",
    "payerName",
    "receiverName",
    "payer",
    "receiver",
    "paymentData",
    "accountNumber",
    "branchNumber",
    "routingNumber",
  ])(
    "nenhuma linha do schema declara um campo de coluna chamado (ou comecando com) '%s'",
    (forbiddenFieldName) => {
      const fieldDeclarationPattern = new RegExp(
        `^\\s*${forbiddenFieldName}\\w*\\s+\\S+`,
        "im",
      );

      expect(schema).not.toMatch(fieldDeclarationPattern);
    },
  );

  it("nenhuma linha do schema declara um campo taxNumber/cpf/cnpj (continua valido apos esta task - Criterio 7 da TASK-004)", () => {
    const piiFieldPattern = /^\s*(taxNumber|cpf|cnpj)\w*\s+\S+/im;

    expect(schema).not.toMatch(piiFieldPattern);
  });

  it("model Transaction declara method como String? (unico campo derivado de paymentData - so paymentMethod, ver Criterio 7)", () => {
    const match = schema.match(/model\s+Transaction\s*\{([\s\S]*?)\n\}/);
    expect(match).not.toBeNull();
    const transactionBlock = match?.[1] ?? "";

    expect(transactionBlock).toMatch(/^\s*method\s+String\?/m);
  });
});
