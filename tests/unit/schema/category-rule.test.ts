import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste de "documentacao executavel" do Criterio de aceite #1 da TASK-008
 * (DT-019): garantia ESTRUTURAL, no proprio `schema.prisma`, de que o novo
 * model `CategoryRule` guarda o HASH do documento (nunca o documento cru) e
 * de que `Transaction` ganha `categoryFromRule` nullable.
 *
 * Mesmo padrao de tests/unit/schema/sync-pii-fields.test.ts (TASK-006) -
 * complemento ESTRUTURAL, permanente, independente de mock especifico. NAO
 * substitui a prova de VALOR contra o Postgres real (ver
 * tests/integration/category-rules.integration.test.ts e a extensao de
 * tests/integration/schema.integration.test.ts).
 *
 * Contrato assumido (definido pelo qa nesta task):
 *
 *   model CategoryRule {
 *     id           String   @id @default(cuid())
 *     documentHash String   @unique
 *     category     String
 *     label        String?
 *     createdAt    DateTime @default(now())
 *     updatedAt    DateTime @updatedAt
 *   }
 *
 *   model Transaction {
 *     ...
 *     categoryFromRule String?   // nullable - DT-013, tabela ja tem 432 linhas
 *   }
 */
describe("prisma/schema.prisma - model CategoryRule guarda o HASH, nunca o documento (Criterio de aceite #1, DT-019)", () => {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  function extractModelBlock(modelName: string): string {
    const match = schema.match(
      new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
    );
    expect(match, `model ${modelName} nao encontrado em schema.prisma`).not.toBeNull();
    return match?.[1] ?? "";
  }

  it("declara o model CategoryRule", () => {
    expect(schema).toMatch(/model\s+CategoryRule\s*\{/);
  });

  it("CategoryRule.documentHash existe e e @unique (String)", () => {
    const block = extractModelBlock("CategoryRule");
    expect(block).toMatch(/^\s*documentHash\s+String\s+@unique/m);
  });

  it("CategoryRule.category existe (String, obrigatoria)", () => {
    const block = extractModelBlock("CategoryRule");
    expect(block).toMatch(/^\s*category\s+String(?!\?)/m);
  });

  it("CategoryRule.label existe e e opcional (String?)", () => {
    const block = extractModelBlock("CategoryRule");
    expect(block).toMatch(/^\s*label\s+String\?/m);
  });

  /**
   * Corrigido apos revisao do coordenador (2026-08-18): o `it.each` original
   * usava `document\w*` sem excecao, o que casava tambem com o campo
   * LEGITIMO `documentHash` (exatamente o que o Criterio 1 exige - guardar o
   * HASH, nunca o documento). Os dois testes se contradiziam e o coder
   * corretamente parou em vez de escolher um lado.
   *
   * Fix: a entrada "document" ganha um negative lookahead
   * `(?!Hash\b)` que exclui SOMENTE `documentHash` (e continua pegando
   * `document`, `documentNumber`, `documentRaw` etc.) - as demais entradas
   * do array (`cpf`, `cnpj`, `documentNumber`, `rawDocument`) nao mudam.
   * `documentNumber` continua sendo testada tanto pela entrada dedicada
   * quanto pela entrada "document" (redundante de proposito - defesa em
   * profundidade).
   */
  function buildForbiddenFieldPattern(forbiddenFieldName: string): RegExp {
    if (forbiddenFieldName === "document") {
      return new RegExp(`^\\s*document(?!Hash\\b)\\w*\\s+\\S+`, "im");
    }
    return new RegExp(`^\\s*${forbiddenFieldName}\\w*\\s+\\S+`, "im");
  }

  it.each(["document", "cpf", "cnpj", "documentNumber", "rawDocument"])(
    "CategoryRule NUNCA declara um campo de documento cru chamado (ou comecando com) '%s' (documentHash e uma excecao EXPLICITA e permitida)",
    (forbiddenFieldName) => {
      const block = extractModelBlock("CategoryRule");
      const pattern = buildForbiddenFieldPattern(forbiddenFieldName);
      expect(block).not.toMatch(pattern);
    },
  );

  it("CONTROLE (licao do DT-011 - o tripwire nao pode virar decorativo): o mesmo padrao usado para 'document' AINDA reprova um campo 'documentNumber String' num schema hipotetico", () => {
    const fakeBlockComDocumentoCru =
      "  id             String   @id @default(cuid())\n" +
      "  documentNumber String\n" +
      "  category       String\n";
    const pattern = buildForbiddenFieldPattern("document");

    expect(fakeBlockComDocumentoCru).toMatch(pattern);
  });

  it("CONTROLE: o mesmo padrao NAO reprova 'documentHash String @unique' (o campo que o Criterio 1 exige)", () => {
    const fakeBlockComHashLegitimo =
      "  id           String   @id @default(cuid())\n" +
      "  documentHash String   @unique\n" +
      "  category     String\n";
    const pattern = buildForbiddenFieldPattern("document");

    expect(fakeBlockComHashLegitimo).not.toMatch(pattern);
  });

  it("Transaction ganha categoryFromRule String? (nullable - DT-013, tabela com 432 linhas reais)", () => {
    const block = extractModelBlock("Transaction");
    expect(block).toMatch(/^\s*categoryFromRule\s+String\?/m);
  });
});
