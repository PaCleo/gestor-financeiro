import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste de "documentacao executavel" do Criterio de aceite #1 da TASK-011
 * (Fatura do cartao, fecha a Fase 5): novo model `CreditCardBill`.
 *
 * Mesmo padrao de tests/unit/schema/category-rule.test.ts (TASK-008) e
 * tests/unit/schema/on-delete-explicit.test.ts (TASK-002) - garantia
 * ESTRUTURAL, no proprio `schema.prisma`, independente de mock especifico.
 * NAO substitui a prova de VALOR contra o Postgres real (ver
 * tests/integration/bills.integration.test.ts e a extensao de
 * tests/integration/sync.integration.test.ts).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim, ver secao 5 do TASK-011.md):
 *
 *   model CreditCardBill {
 *     id                   String   @id @default(cuid())
 *     pluggyBillId         String   @unique
 *     accountId            String
 *     account              Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
 *     dueDate              DateTime
 *     totalAmount          Decimal  @db.Decimal(14, 2)
 *     minimumPaymentAmount Decimal? @db.Decimal(14, 2)
 *   }
 *
 * DECISAO de `onDelete` (o proprio Criterio de aceite #1 exige decidir e
 * documentar, "evita o DT-003/DT-005"): CASCADE, nao Restrict. Diferente de
 * `Transaction.account` (Restrict - preserva o HISTORICO financeiro
 * primario, DT-002/TASK-002), `CreditCardBill` e um resumo DERIVADO (fecha o
 * mes, mostra total/vencimento/minimo) que a propria Pluggy pode recalcular
 * num re-sync - nao e a fonte de verdade dos movimentos de dinheiro do
 * usuario. Bloquear a exclusao de uma `Account` por causa de faturas
 * resumo seria inconsistente com essa natureza (mesmo espirito de
 * `Account.bankItem`, que ja e Cascade). Fica registrado aqui para o coder
 * seguir a MESMA decisao, nao reabrir o debate.
 */
describe("prisma/schema.prisma - model CreditCardBill (Criterio de aceite #1 da TASK-011)", () => {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  function extractModelBlock(modelName: string): string {
    const match = schema.match(
      new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
    );
    expect(match, `model ${modelName} nao encontrado em schema.prisma`).not.toBeNull();
    return match?.[1] ?? "";
  }

  it("declara o model CreditCardBill", () => {
    expect(schema).toMatch(/model\s+CreditCardBill\s*\{/);
  });

  it("CreditCardBill.pluggyBillId existe e e @unique (String)", () => {
    const block = extractModelBlock("CreditCardBill");
    expect(block).toMatch(/^\s*pluggyBillId\s+String\s+@unique/m);
  });

  it("CreditCardBill.accountId existe (String, obrigatoria - toda fatura pertence a uma conta)", () => {
    const block = extractModelBlock("CreditCardBill");
    const line = block
      .split("\n")
      .find((l) => /^\s*accountId\s+String/.test(l));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/String\?/);
  });

  it("CreditCardBill declara a relacao com Account com onDelete: Cascade explicito (decisao desta task)", () => {
    const block = extractModelBlock("CreditCardBill");
    const relationLine = block
      .split("\n")
      .find((l) => /^\s*account\s+Account\s+@relation/.test(l));
    expect(relationLine).toBeDefined();
    expect(relationLine).toMatch(/onDelete:\s*Cascade/);
  });

  it("CreditCardBill.dueDate existe e e DateTime (obrigatoria)", () => {
    const block = extractModelBlock("CreditCardBill");
    const line = block.split("\n").find((l) => /^\s*dueDate\s+DateTime/.test(l));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/DateTime\?/);
  });

  it("CreditCardBill.totalAmount existe, e Decimal OBRIGATORIO (nao nullable) com @db.Decimal(14, 2)", () => {
    const block = extractModelBlock("CreditCardBill");
    const line = block
      .split("\n")
      .find((l) => /^\s*totalAmount\s+Decimal/.test(l));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/Decimal\?/);
    expect(line).toMatch(/@db\.Decimal\(\s*14\s*,\s*2\s*\)/);
  });

  it("CreditCardBill.minimumPaymentAmount existe, e Decimal? NULLABLE (a Pluggy pode nao informar minimo) com @db.Decimal(14, 2)", () => {
    const block = extractModelBlock("CreditCardBill");
    const line = block
      .split("\n")
      .find((l) => /^\s*minimumPaymentAmount\s+Decimal/.test(l));
    expect(line).toBeDefined();
    expect(line).toMatch(/Decimal\?/);
    expect(line).toMatch(/@db\.Decimal\(\s*14\s*,\s*2\s*\)/);
  });

  it("CreditCardBill NUNCA declara payments/financeCharges (fora de escopo desta task - so o resumo)", () => {
    const block = extractModelBlock("CreditCardBill");
    expect(block).not.toMatch(/^\s*payments\s+\S+/im);
    expect(block).not.toMatch(/^\s*financeCharges\s+\S+/im);
  });

  it("existe pelo menos uma migration cujo SQL cria a tabela CreditCardBill", () => {
    const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
    const migrationFolders = readdirSync(migrationsDir, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const migrationSqls = migrationFolders.map((folder) =>
      readFileSync(
        path.join(migrationsDir, folder, "migration.sql"),
        "utf-8",
      ),
    );

    const hasCreditCardBillMigration = migrationSqls.some((sql) =>
      /CREATE TABLE\s+"CreditCardBill"/i.test(sql),
    );

    expect(hasCreditCardBillMigration).toBe(true);
  });

  it("a migration que cria CreditCardBill declara a coluna pluggyBillId como UNIQUE", () => {
    const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
    const migrationFolders = readdirSync(migrationsDir, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const migrationSqls = migrationFolders.map((folder) =>
      readFileSync(
        path.join(migrationsDir, folder, "migration.sql"),
        "utf-8",
      ),
    );

    const hasUniqueIndex = migrationSqls.some(
      (sql) =>
        /CREATE TABLE\s+"CreditCardBill"/i.test(sql) &&
        /CreditCardBill_pluggyBillId_key/i.test(sql),
    );

    expect(hasUniqueIndex).toBe(true);
  });
});
