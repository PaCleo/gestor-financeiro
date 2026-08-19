import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FAKE_PAYER_CPF,
  FAKE_RECEIVER_CNPJ,
  KNOWN_SHA256_HEX_CNPJ,
  KNOWN_SHA256_HEX_CPF,
} from "../../fixtures/pluggy";

/**
 * Testes unitarios de lib/category-rules.ts (TASK-008 - Regras de
 * categorizacao por CPF/CNPJ, DT-019).
 *
 * `hashDocument` e uma funcao PURA (sem I/O) - testada diretamente, sem
 * mock nenhum. As demais funcoes deste modulo tocam o Prisma; `@/lib/db` e
 * mockado INTEIRAMENTE (DT-004: `vi.spyOn(prisma, ...)` e engolido pelo
 * Proxy) - nenhum banco real aqui. A prova de PERSISTENCIA real (hash
 * gravado, nunca o documento, upsert por hash) fica em
 * tests/integration/category-rules.integration.test.ts.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   lib/category-rules.ts
 *     export function hashDocument(raw: string): string
 *       // normaliza (mantem so digitos, via regex tipo /\D/g) e aplica
 *       // node:crypto createHash("sha256").update(normalized).digest("hex").
 *       // UNICA fonte de hash do projeto - lib/pluggy.ts (sync) e este
 *       // modulo (cadastro) chamam a MESMA funcao, senao nunca casam
 *       // (Criterio de aceite #2, "o eixo da task").
 *
 *     export const categoryRuleInputSchema = z.object({
 *       document: z.string().min(1),
 *       category: z.string().min(1),
 *       label: z.string().min(1).optional(),
 *     });
 *     export type CategoryRuleInput = z.infer<typeof categoryRuleInputSchema>;
 *
 *     export interface CategoryRuleListItem {
 *       id: string;
 *       label: string | null;
 *       category: string;
 *     }
 *
 *     export async function upsertCategoryRule(
 *       input: CategoryRuleInput,
 *     ): Promise<CategoryRuleListItem>
 *       // hasheia input.document com hashDocument, faz
 *       // prisma.categoryRule.upsert({ where: { documentHash: hash },
 *       // create: { documentHash: hash, category, label }, update: {
 *       // category, label } }) e devolve { id, label, category }
 *       // RECONSTRUIDO campo a campo - nunca documentHash, nunca o
 *       // documento cru (Criterio de aceite #1/#3).
 *
 *     export async function listCategoryRules(): Promise<CategoryRuleListItem[]>
 *       // prisma.categoryRule.findMany(...) reconstruido campo a campo -
 *       // nunca documentHash na saida (Criterio de aceite #4).
 *
 *     export class CategoryRuleNotFoundError extends Error {}
 *     export async function deleteCategoryRule(id: string): Promise<void>
 *       // prisma.categoryRule.findUnique({ where: { id } }) - se null,
 *       // rejeita com CategoryRuleNotFoundError SEM chamar delete; senao
 *       // prisma.categoryRule.delete({ where: { id } }).
 *
 *     export async function getCategoryRuleHashMap(): Promise<Map<string, string>>
 *       // prisma.categoryRule.findMany({ select: { documentHash: true,
 *       // category: true } }) -> Map(documentHash -> category). Usado por
 *       // lib/sync.ts (Criterio de aceite #6).
 */

describe("hashDocument - normalizacao + SHA-256 (Criterio de aceite #2, O EIXO DA TASK)", () => {
  it("normaliza CPF formatado e sem formatacao para o MESMO hash - senao o casamento no sync nunca bate", async () => {
    const { hashDocument } = await import("@/lib/category-rules");

    expect(hashDocument("123.456.789-00")).toBe(hashDocument("12345678900"));
  });

  it("normaliza CNPJ formatado e sem formatacao para o MESMO hash", async () => {
    const { hashDocument } = await import("@/lib/category-rules");

    expect(hashDocument("12.345.678/0001-95")).toBe(
      hashDocument("12345678000195"),
    );
  });

  it("hashDocument(FAKE_PAYER_CPF) bate com o SHA-256 hex CONHECIDO de '12345678900' - calculado de forma independente (node:crypto direto neste teste), nao so contra si mesma", async () => {
    const { hashDocument } = await import("@/lib/category-rules");

    const independentHash = createHash("sha256")
      .update("12345678900")
      .digest("hex");
    expect(independentHash).toBe(KNOWN_SHA256_HEX_CPF);
    expect(hashDocument(FAKE_PAYER_CPF)).toBe(KNOWN_SHA256_HEX_CPF);
  });

  it("hashDocument(FAKE_RECEIVER_CNPJ) bate com o SHA-256 hex CONHECIDO de '12345678000195'", async () => {
    const { hashDocument } = await import("@/lib/category-rules");

    expect(hashDocument(FAKE_RECEIVER_CNPJ)).toBe(KNOWN_SHA256_HEX_CNPJ);
  });

  it("documentos diferentes (CPF vs CNPJ) produzem hashes diferentes", async () => {
    const { hashDocument } = await import("@/lib/category-rules");

    expect(hashDocument(FAKE_PAYER_CPF)).not.toBe(
      hashDocument(FAKE_RECEIVER_CNPJ),
    );
  });

  it("o retorno e sempre uma string hexadecimal de 64 caracteres (SHA-256 em hex)", async () => {
    const { hashDocument } = await import("@/lib/category-rules");

    const hash = hashDocument(FAKE_PAYER_CPF);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("o hash NUNCA contem o documento cru como substring (o proprio hash nao pode vazar o valor)", async () => {
    const { hashDocument } = await import("@/lib/category-rules");

    const hash = hashDocument(FAKE_PAYER_CPF);
    expect(hash).not.toContain("123456789");
    expect(hash).not.toContain(FAKE_PAYER_CPF);
  });
});

describe("categoryRuleInputSchema - validacao Zod (Criterio de aceite #3)", () => {
  it("document/category validos (sem label) -> parse ok", async () => {
    const { categoryRuleInputSchema } = await import("@/lib/category-rules");

    const result = categoryRuleInputSchema.safeParse({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
    });
    expect(result.success).toBe(true);
  });

  it("document/category/label validos -> parse ok", async () => {
    const { categoryRuleInputSchema } = await import("@/lib/category-rules");

    const result = categoryRuleInputSchema.safeParse({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
      label: "Mercado do bairro",
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["ausente", {}],
    ["vazio", { document: "" }],
    ["nao-string", { document: 12345678900 }],
    ["null", { document: null }],
  ])("document invalido (%s) -> parse falha", async (_label, partial) => {
    const { categoryRuleInputSchema } = await import("@/lib/category-rules");

    const result = categoryRuleInputSchema.safeParse({
      category: "Mercado",
      ...partial,
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["ausente", {}],
    ["vazia", { category: "" }],
    ["nao-string", { category: 123 }],
  ])("category invalida (%s) -> parse falha", async (_label, partial) => {
    const { categoryRuleInputSchema } = await import("@/lib/category-rules");

    const result = categoryRuleInputSchema.safeParse({
      document: FAKE_RECEIVER_CNPJ,
      ...partial,
    });
    expect(result.success).toBe(false);
  });

  it("label vazio (string vazia) -> parse falha (label opcional, mas nao vazio quando presente)", async () => {
    const { categoryRuleInputSchema } = await import("@/lib/category-rules");

    const result = categoryRuleInputSchema.safeParse({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
      label: "",
    });
    expect(result.success).toBe(false);
  });
});

const {
  categoryRuleUpsertMock,
  categoryRuleFindManyMock,
  categoryRuleFindUniqueMock,
  categoryRuleDeleteMock,
} = vi.hoisted(() => ({
  categoryRuleUpsertMock: vi.fn(),
  categoryRuleFindManyMock: vi.fn(),
  categoryRuleFindUniqueMock: vi.fn(),
  categoryRuleDeleteMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    categoryRule: {
      upsert: categoryRuleUpsertMock,
      findMany: categoryRuleFindManyMock,
      findUnique: categoryRuleFindUniqueMock,
      delete: categoryRuleDeleteMock,
    },
  },
}));

function buildPersistedRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-cuid-1",
    documentHash:
      "a8476735b37a541a38402a2e7037c79e2d217fe9780e5e34347156ef61eff42b",
    category: "Mercado",
    label: "Mercado do bairro",
    createdAt: new Date("2026-08-13T10:00:00.000Z"),
    updatedAt: new Date("2026-08-13T10:00:00.000Z"),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("upsertCategoryRule - hasheia e faz upsert por hash, resposta NUNCA ecoa o documento (Criterio de aceite #1/#3)", () => {
  it("chama prisma.categoryRule.upsert com o HASH (nao o documento cru) como chave", async () => {
    categoryRuleUpsertMock.mockResolvedValueOnce(buildPersistedRuleRow());

    const { upsertCategoryRule, hashDocument } = await import(
      "@/lib/category-rules"
    );
    await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
      label: "Mercado do bairro",
    });

    const expectedHash = hashDocument(FAKE_RECEIVER_CNPJ);
    expect(categoryRuleUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentHash: expectedHash },
      }),
    );
    const callArg = categoryRuleUpsertMock.mock.calls[0][0];
    expect(JSON.stringify(callArg)).not.toContain(FAKE_RECEIVER_CNPJ);
  });

  it("retorna SOMENTE { id, label, category } - nunca documentHash, mesmo que a linha persistida tenha o campo (defesa em profundidade)", async () => {
    categoryRuleUpsertMock.mockResolvedValueOnce(buildPersistedRuleRow());

    const { upsertCategoryRule } = await import("@/lib/category-rules");
    const result = await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
      label: "Mercado do bairro",
    });

    expect(result).toEqual({
      id: "rule-cuid-1",
      label: "Mercado do bairro",
      category: "Mercado",
    });
    expect(Object.keys(result).sort()).toEqual(
      ["category", "id", "label"].sort(),
    );
    expect(JSON.stringify(result)).not.toContain("documentHash");
  });

  it("sem label, cadastra com label null/undefined (rotulo e opcional)", async () => {
    categoryRuleUpsertMock.mockResolvedValueOnce(
      buildPersistedRuleRow({ label: null }),
    );

    const { upsertCategoryRule } = await import("@/lib/category-rules");
    const result = await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
    });

    expect(result.label).toBeNull();
  });
});

describe("upsertCategoryRule - mesmo documento cadastrado de novo ATUALIZA, nao duplica (Criterio de aceite #1, nivel de orquestracao)", () => {
  it("cadastrar o MESMO documento (formatado diferente) duas vezes gera o MESMO hash em ambas as chamadas de upsert", async () => {
    categoryRuleUpsertMock
      .mockResolvedValueOnce(buildPersistedRuleRow({ category: "Mercado" }))
      .mockResolvedValueOnce(
        buildPersistedRuleRow({ category: "Supermercado" }),
      );

    const { upsertCategoryRule } = await import("@/lib/category-rules");
    await upsertCategoryRule({
      document: "12.345.678/0001-95",
      category: "Mercado",
    });
    await upsertCategoryRule({
      document: "12345678000195",
      category: "Supermercado",
    });

    expect(categoryRuleUpsertMock).toHaveBeenCalledTimes(2);
    const firstWhere = categoryRuleUpsertMock.mock.calls[0][0].where;
    const secondWhere = categoryRuleUpsertMock.mock.calls[1][0].where;
    expect(firstWhere).toEqual(secondWhere);
  });
});

describe("listCategoryRules - lista rotulo + categoria, NUNCA o documento/hash (Criterio de aceite #4)", () => {
  it("reconstroi cada item campo a campo - nunca vaza documentHash mesmo que a query traga a coluna", async () => {
    categoryRuleFindManyMock.mockResolvedValueOnce([
      buildPersistedRuleRow({ id: "rule-1", label: "Mercado" }),
      buildPersistedRuleRow({ id: "rule-2", label: null, category: "Farmácia" }),
    ]);

    const { listCategoryRules } = await import("@/lib/category-rules");
    const result = await listCategoryRules();

    expect(result).toEqual([
      { id: "rule-1", label: "Mercado", category: "Mercado" },
      { id: "rule-2", label: null, category: "Farmácia" },
    ]);
    expect(JSON.stringify(result)).not.toContain("documentHash");
    expect(JSON.stringify(result)).not.toContain(
      "a8476735b37a541a38402a2e7037c79e2d217fe9780e5e34347156ef61eff42b",
    );
  });

  it("lista vazia quando nao ha regras cadastradas", async () => {
    categoryRuleFindManyMock.mockResolvedValueOnce([]);

    const { listCategoryRules } = await import("@/lib/category-rules");
    await expect(listCategoryRules()).resolves.toEqual([]);
  });
});

describe("deleteCategoryRule - remove por id (Criterio de aceite #1, secao 'DADO uma regra QUANDO a removo')", () => {
  it("regra existente -> chama prisma.categoryRule.delete com o id", async () => {
    categoryRuleFindUniqueMock.mockResolvedValueOnce(buildPersistedRuleRow());
    categoryRuleDeleteMock.mockResolvedValueOnce(buildPersistedRuleRow());

    const { deleteCategoryRule } = await import("@/lib/category-rules");
    await deleteCategoryRule("rule-cuid-1");

    expect(categoryRuleDeleteMock).toHaveBeenCalledWith({
      where: { id: "rule-cuid-1" },
    });
  });

  it("regra inexistente -> rejeita com CategoryRuleNotFoundError, SEM chamar delete", async () => {
    categoryRuleFindUniqueMock.mockResolvedValueOnce(null);

    const { deleteCategoryRule, CategoryRuleNotFoundError } = await import(
      "@/lib/category-rules"
    );

    await expect(
      deleteCategoryRule("id-que-nao-existe"),
    ).rejects.toBeInstanceOf(CategoryRuleNotFoundError);
    expect(categoryRuleDeleteMock).not.toHaveBeenCalled();
  });
});

describe("getCategoryRuleHashMap - mapa hash->categoria para o sync usar (Criterio de aceite #6)", () => {
  it("devolve um Map com documentHash -> category de cada regra cadastrada", async () => {
    categoryRuleFindManyMock.mockResolvedValueOnce([
      { documentHash: "hash-a", category: "Mercado" },
      { documentHash: "hash-b", category: "Farmácia" },
    ]);

    const { getCategoryRuleHashMap } = await import("@/lib/category-rules");
    const map = await getCategoryRuleHashMap();

    expect(map).toBeInstanceOf(Map);
    expect(map.get("hash-a")).toBe("Mercado");
    expect(map.get("hash-b")).toBe("Farmácia");
    expect(map.size).toBe(2);
  });

  it("mapa vazio quando nao ha regras cadastradas", async () => {
    categoryRuleFindManyMock.mockResolvedValueOnce([]);

    const { getCategoryRuleHashMap } = await import("@/lib/category-rules");
    const map = await getCategoryRuleHashMap();

    expect(map.size).toBe(0);
  });
});

describe("lib/category-rules.ts - nunca chama console.* (documento passa por aqui)", () => {
  it("nao loga em nenhum caminho feliz de upsert/list/delete/hashMap", async () => {
    categoryRuleUpsertMock.mockResolvedValueOnce(buildPersistedRuleRow());
    categoryRuleFindManyMock.mockResolvedValue([]);
    categoryRuleFindUniqueMock.mockResolvedValueOnce(buildPersistedRuleRow());
    categoryRuleDeleteMock.mockResolvedValueOnce(buildPersistedRuleRow());

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const {
      upsertCategoryRule,
      listCategoryRules,
      deleteCategoryRule,
      getCategoryRuleHashMap,
    } = await import("@/lib/category-rules");

    await upsertCategoryRule({
      document: FAKE_RECEIVER_CNPJ,
      category: "Mercado",
    });
    await listCategoryRules();
    await deleteCategoryRule("rule-cuid-1");
    await getCategoryRuleHashMap();

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
