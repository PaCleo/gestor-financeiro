import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase, resetCategoryRuleTable } from "../setup/reset-db";
import { buildAccount, buildBankItem, buildTransaction } from "../fixtures/db";
import { FAKE_PAYER_CPF, FAKE_RECEIVER_CNPJ } from "../fixtures/pluggy";

/**
 * Testes de integracao de lib/category-rules.ts (TASK-008, DT-019). Batem
 * no Postgres REAL de teste (gestor_test) - a UNICA forma confiavel de
 * provar, por VALOR, que o documento cru nunca e persistido em nenhuma
 * coluna de `CategoryRule` (licao do DT-011/DT-017: uma asserção de
 * nao-vazamento so vale alguma coisa se o payload testado REALMENTE
 * continha o valor proibido e a prova checar o dado persistido, nao so o
 * retorno de uma funcao em memoria).
 *
 * `resetCategoryRuleTable` (nao `resetDatabase`) limpa a tabela nova - ver o
 * comentario em tests/setup/reset-db.ts sobre por que as duas funcoes ficam
 * separadas.
 */

beforeEach(async () => {
  await resetDatabase(prisma);
  await resetCategoryRuleTable(prisma);
});

afterEach(async () => {
  await resetCategoryRuleTable(prisma);
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("upsertCategoryRule - persiste o HASH, nunca o documento (Criterio de aceite #1, prova por VALOR contra o Postgres real)", () => {
  it("persiste documentHash == hashDocument(documento) e NUNCA o CNPJ cru (FAKE_RECEIVER_CNPJ, REALMENTE presente no input)", async () => {
    const { upsertCategoryRule, hashDocument } = await import(
      "@/lib/category-rules"
    );

    await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
      label: "Mercado do bairro",
    });

    const expectedHash = hashDocument(FAKE_RECEIVER_CNPJ);
    const row = await prisma.categoryRule.findUniqueOrThrow({
      where: { documentHash: expectedHash },
    });

    expect(row.category).toBe("Mercado");
    expect(row.label).toBe("Mercado do bairro");
    // Prova com poder de deteccao real (DT-011): o CNPJ fabricado
    // REALMENTE estava no input; verificamos o VALOR persistido, nao so o
    // nome da coluna.
    expect(JSON.stringify(row)).not.toContain(FAKE_RECEIVER_CNPJ);
    expect(JSON.stringify(row)).not.toContain("12345678000195");
  });

  it("persiste documentHash == hashDocument(documento) para um CPF (FAKE_PAYER_CPF)", async () => {
    const { upsertCategoryRule, hashDocument } = await import(
      "@/lib/category-rules"
    );

    await upsertCategoryRule({ document: FAKE_PAYER_CPF, category: "Saúde" });

    const row = await prisma.categoryRule.findUniqueOrThrow({
      where: { documentHash: hashDocument(FAKE_PAYER_CPF) },
    });
    expect(row.category).toBe("Saúde");
    expect(JSON.stringify(row)).not.toContain(FAKE_PAYER_CPF);
  });

  it("varrendo TODAS as linhas de CategoryRule apos varios cadastros, nenhum documento cru aparece em nenhuma coluna", async () => {
    const { upsertCategoryRule } = await import("@/lib/category-rules");

    await upsertCategoryRule({ document: FAKE_PAYER_CPF, category: "Saúde" });
    await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
      label: "Mercado do bairro",
    });

    const allRows = await prisma.categoryRule.findMany();
    const raw = JSON.stringify(allRows);
    expect(raw).not.toContain(FAKE_PAYER_CPF);
    expect(raw).not.toContain(FAKE_RECEIVER_CNPJ);
    expect(raw).not.toContain("12345678900");
    expect(raw).not.toContain("12345678000195");
  });
});

describe("upsertCategoryRule - mesmo documento cadastrado de novo ATUALIZA, nao duplica (Criterio de aceite #1, upsert por hash)", () => {
  it("cadastrar o mesmo CNPJ (formatado diferente da segunda vez) atualiza a MESMA linha - contagem permanece 1", async () => {
    const { upsertCategoryRule } = await import("@/lib/category-rules");

    await upsertCategoryRule({
      document: "12.345.678/0001-95",
      category: "Mercado",
      label: "Rotulo antigo",
    });
    await upsertCategoryRule({
      document: "12345678000195",
      category: "Supermercado",
      label: "Rotulo novo",
    });

    const rows = await prisma.categoryRule.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("Supermercado");
    expect(rows[0].label).toBe("Rotulo novo");
  });

  it("dois documentos DIFERENTES geram DUAS linhas distintas", async () => {
    const { upsertCategoryRule } = await import("@/lib/category-rules");

    await upsertCategoryRule({ document: FAKE_PAYER_CPF, category: "Saúde" });
    await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
    });

    const rows = await prisma.categoryRule.findMany();
    expect(rows).toHaveLength(2);
  });
});

describe("listCategoryRules - rotulo + categoria, sem documento (secao 3, 'DADO uma lista de regras')", () => {
  it("lista as regras cadastradas com id/label/category, sem qualquer traco de hash/documento", async () => {
    const { upsertCategoryRule, listCategoryRules } = await import(
      "@/lib/category-rules"
    );
    await upsertCategoryRule({
      document: FAKE_PAYER_CPF,
      category: "Saúde",
      label: "Plano de saúde",
    });
    await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
    });

    const rules = await listCategoryRules();

    expect(rules).toHaveLength(2);
    const raw = JSON.stringify(rules);
    expect(raw).not.toContain("documentHash");
    expect(raw).not.toContain(FAKE_PAYER_CPF);
    expect(raw).not.toContain(FAKE_RECEIVER_CNPJ);
    expect(rules.map((r) => r.category).sort()).toEqual(
      ["Mercado", "Saúde"].sort(),
    );
  });
});

describe("deleteCategoryRule - remove sem afetar transacoes ja categorizadas (secao 3, 'DADO uma regra QUANDO a removo')", () => {
  it("remove a regra do banco", async () => {
    const { upsertCategoryRule, deleteCategoryRule, listCategoryRules } =
      await import("@/lib/category-rules");
    const created = await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
    });

    await deleteCategoryRule(created.id);

    await expect(listCategoryRules()).resolves.toEqual([]);
    await expect(
      prisma.categoryRule.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull();
  });

  it("rejeita com CategoryRuleNotFoundError para um id inexistente", async () => {
    const { deleteCategoryRule, CategoryRuleNotFoundError } = await import(
      "@/lib/category-rules"
    );

    await expect(
      deleteCategoryRule("id-que-nao-existe"),
    ).rejects.toBeInstanceOf(CategoryRuleNotFoundError);
  });

  it("remover a regra NAO altera retroativamente o categoryFromRule de uma Transaction ja categorizada por ela (consequencia aceita do DT-019 - so o proximo sync muda)", async () => {
    const { upsertCategoryRule, deleteCategoryRule } = await import(
      "@/lib/category-rules"
    );
    const rule = await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
    });

    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    const account = await prisma.account.create({
      data: buildAccount(bankItem.id),
    });
    const transaction = await prisma.transaction.create({
      data: buildTransaction(account.id, { categoryFromRule: rule.category }),
    });

    await deleteCategoryRule(rule.id);

    const reloaded = await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
    });
    expect(reloaded.categoryFromRule).toBe("Mercado");
  });
});

describe("getCategoryRuleHashMap - mapa hash->categoria contra o Postgres real (Criterio de aceite #6)", () => {
  it("devolve um Map com as regras cadastradas, chaveado pelo HASH (o mesmo que hashDocument calcula)", async () => {
    const { upsertCategoryRule, getCategoryRuleHashMap, hashDocument } =
      await import("@/lib/category-rules");
    await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
    });

    const map = await getCategoryRuleHashMap();

    expect(map.get(hashDocument(FAKE_RECEIVER_CNPJ))).toBe("Mercado");
  });
});
