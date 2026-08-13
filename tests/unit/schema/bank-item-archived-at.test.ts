import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste de "documentacao executavel" do Criterio de aceite #1 da TASK-005:
 * `BankItem` ganha `archivedAt DateTime?` (nullable, conforme DT-013),
 * com migration.
 *
 * Por que nullable e obrigatorio (DT-013, ver docs/DEBITO-TECNICO.md): uma
 * coluna nova adicionada a uma tabela que pode ja ter linhas so e segura se
 * for nullable (ou tiver DEFAULT) - `NOT NULL` sem default falha contra
 * dado preexistente. `archivedAt` e conceitualmente opcional (a maioria dos
 * BankItems nunca sera arquivada) - nullable e o modelo correto, nao so o
 * mais facil de migrar.
 *
 * A prova de que a coluna e de fato nullable NO POSTGRES (nao so no texto
 * do schema.prisma) fica em tests/integration/schema.integration.test.ts,
 * que consulta information_schema.columns depois de aplicar a migration de
 * verdade.
 */
describe("prisma/schema.prisma - BankItem.archivedAt (Criterio 1 da TASK-005, DT-013)", () => {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  function extractModelBlock(modelName: string): string {
    const match = schema.match(
      new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
    );
    expect(match).not.toBeNull();
    return match?.[1] ?? "";
  }

  it("model BankItem declara archivedAt como DateTime? (nullable)", () => {
    const bankItemBlock = extractModelBlock("BankItem");

    expect(bankItemBlock).toMatch(/^\s*archivedAt\s+DateTime\?/m);
  });

  it("archivedAt NAO e declarado com @default (nullable puro, nao default+NOT NULL disfarcado)", () => {
    const bankItemBlock = extractModelBlock("BankItem");
    const archivedAtLine = bankItemBlock
      .split("\n")
      .find((line) => /^\s*archivedAt\s+DateTime\?/.test(line));

    expect(archivedAtLine).toBeDefined();
    expect(archivedAtLine).not.toMatch(/@default/);
  });

  it("existe pelo menos uma migration cujo SQL adiciona a coluna archivedAt em BankItem", () => {
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

    const hasArchivedAtMigration = migrationSqls.some((sql) =>
      /archivedAt/i.test(sql),
    );

    expect(hasArchivedAtMigration).toBe(true);
  });
});
