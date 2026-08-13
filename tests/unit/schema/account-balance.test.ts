import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste de "documentacao executavel" do Criterio de aceite #1 da TASK-006:
 * `Account` ganha `balance Decimal @db.Decimal(14,2)`.
 *
 * Decisao de modelagem (secao 5 do TASK-006.md): NULLABLE, nao
 * `NOT NULL`/default. Dois motivos, nao so um:
 *   1. DT-013 - `Account` e uma tabela que ja existe desde a TASK-001 e ja
 *      pode ter linhas quando a migration desta task rodar; `NOT NULL` sem
 *      default quebraria contra dado preexistente (mesma licao de
 *      `archivedAt` na TASK-005).
 *   2. Correto pelo MODELO, nao so pela migracao: uma `Account` manual
 *      (`pluggyAccountId: null`, ex. "Dinheiro" - ver docs/PREMISSA.md
 *      secao 5) pode nao ter saldo vindo da Pluggy nunca.
 *
 * A prova de que a coluna e de fato nullable e `numeric(14,2)` NO POSTGRES
 * (nao so no texto do schema.prisma) fica em
 * tests/integration/schema.integration.test.ts.
 */
describe("prisma/schema.prisma - Account.balance (Criterio 1 da TASK-006, DT-013)", () => {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  function extractModelBlock(modelName: string): string {
    const match = schema.match(
      new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
    );
    expect(match).not.toBeNull();
    return match?.[1] ?? "";
  }

  it("model Account declara balance como Decimal? com @db.Decimal(14, 2)", () => {
    const accountBlock = extractModelBlock("Account");

    expect(accountBlock).toMatch(
      /^\s*balance\s+Decimal\?\s*@db\.Decimal\(\s*14\s*,\s*2\s*\)/m,
    );
  });

  it("balance NAO e declarado NOT NULL (sem @default disfarcando NOT NULL, nullable puro)", () => {
    const accountBlock = extractModelBlock("Account");
    const balanceLine = accountBlock
      .split("\n")
      .find((line) => /^\s*balance\s+Decimal/.test(line));

    expect(balanceLine).toBeDefined();
    expect(balanceLine).toMatch(/Decimal\?/);
    expect(balanceLine).not.toMatch(/@default/);
  });

  it("existe pelo menos uma migration cujo SQL adiciona a coluna balance em Account", () => {
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

    const hasBalanceMigration = migrationSqls.some(
      (sql) => /"Account"/i.test(sql) && /balance/i.test(sql),
    );

    expect(hasBalanceMigration).toBe(true);
  });

  it("model Account NAO declara nenhum campo taxNumber (PII do titular, ver DT-017/PREMISSA secao 11)", () => {
    const accountBlock = extractModelBlock("Account");

    expect(accountBlock).not.toMatch(/^\s*taxNumber\s+\S+/im);
  });
});
