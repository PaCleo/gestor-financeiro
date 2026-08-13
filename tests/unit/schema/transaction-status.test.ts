import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste de "documentacao executavel" do Criterio de aceite #1 da TASK-006:
 * `Transaction` ganha `status String` (`POSTED`/`PENDING`).
 *
 * Decisao de modelagem (secao 5 do TASK-006.md, contraste deliberado com
 * `Account.balance` acima): `@default("POSTED")`, NAO nullable. Toda
 * `Transaction` tem um status definido (a propria Pluggy documenta
 * `status?: TransactionStatus` com default `POSTED` - ver
 * node_modules/pluggy-sdk/dist/types/transaction.d.ts) - inclusive as
 * `MANUAL` (sempre "concluidas" no momento em que o usuario lanca). Um
 * default satisfaz o DT-013 (coluna nova em tabela que ja pode ter linhas -
 * `Transaction` existe desde a TASK-001) sem abrir mao de NOT NULL, que e o
 * modelo correto aqui (ao contrario de `balance`, que e nullable por
 * natureza).
 */
describe("prisma/schema.prisma - Transaction.status (Criterio 1 da TASK-006, DT-013)", () => {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  function extractModelBlock(modelName: string): string {
    const match = schema.match(
      new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
    );
    expect(match).not.toBeNull();
    return match?.[1] ?? "";
  }

  it('model Transaction declara status como String com @default("POSTED")', () => {
    const transactionBlock = extractModelBlock("Transaction");

    expect(transactionBlock).toMatch(
      /^\s*status\s+String\s*@default\("POSTED"\)/m,
    );
  });

  it("status NAO e declarado nullable (String?, sem ponto de interrogacao)", () => {
    const transactionBlock = extractModelBlock("Transaction");
    const statusLine = transactionBlock
      .split("\n")
      .find((line) => /^\s*status\s+String/.test(line));

    expect(statusLine).toBeDefined();
    expect(statusLine).not.toMatch(/String\?/);
  });

  it("existe pelo menos uma migration cujo SQL adiciona a coluna status em Transaction", () => {
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

    const hasStatusMigration = migrationSqls.some(
      (sql) => /"Transaction"/i.test(sql) && /status/i.test(sql),
    );

    expect(hasStatusMigration).toBe(true);
  });
});
