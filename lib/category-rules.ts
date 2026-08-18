import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * `lib/category-rules.ts` - TASK-008 (Regras de categorizacao por CPF/CNPJ,
 * DT-019). Cadastro/consulta de regras que associam um documento (CPF/CNPJ)
 * a uma categoria - "CNPJ do mercado -> Mercado".
 *
 * A REGRA DE OURO desta task (secao 2 do TASK-008.md): o documento NUNCA e
 * persistido nem logado. A tabela `CategoryRule` guarda so o HASH
 * (`documentHash`). `hashDocument` e a UNICA funcao de hash do projeto -
 * tanto este modulo (cadastro) quanto `lib/pluggy.ts` (sync) chamam a MESMA
 * funcao, senao o casamento hash-contra-hash nunca bate (Criterio de aceite
 * #2, "o eixo da task").
 */

const DOCUMENT_ONLY_DIGITS_PATTERN = /\D/g;

/**
 * Normaliza um CPF/CNPJ (mantendo so digitos) e aplica SHA-256 (hex).
 * Funcao PURA, sem I/O - a UNICA fonte de hash do projeto (Criterio de
 * aceite #2).
 */
export function hashDocument(raw: string): string {
  const normalized = raw.replace(DOCUMENT_ONLY_DIGITS_PATTERN, "");
  return createHash("sha256").update(normalized).digest("hex");
}

export const categoryRuleInputSchema = z.object({
  document: z.string().min(1),
  category: z.string().min(1),
  label: z.string().min(1).optional(),
});
export type CategoryRuleInput = z.infer<typeof categoryRuleInputSchema>;

export interface CategoryRuleListItem {
  id: string;
  label: string | null;
  category: string;
}

/**
 * Cadastra (ou atualiza, se o documento ja existir - upsert por hash) uma
 * regra de categorizacao (Criterio de aceite #1/#3). Hasheia
 * `input.document` com `hashDocument` e faz o upsert por `documentHash`
 * (nunca pelo documento cru). O retorno e RECONSTRUIDO campo a campo -
 * nunca `documentHash`, nunca o documento (defesa em profundidade: mesmo
 * que a linha persistida tenha o hash, ele nao sai daqui).
 */
export async function upsertCategoryRule(
  input: CategoryRuleInput,
): Promise<CategoryRuleListItem> {
  const documentHash = hashDocument(input.document);

  const rule = await prisma.categoryRule.upsert({
    where: { documentHash },
    create: {
      documentHash,
      category: input.category,
      label: input.label,
    },
    update: {
      category: input.category,
      label: input.label,
    },
  });

  return {
    id: rule.id,
    label: rule.label,
    category: rule.category,
  };
}

/**
 * Lista as regras cadastradas (Criterio de aceite #4) - rotulo + categoria,
 * o documento nao existe para exibir (so o hash, que tambem nunca sai
 * daqui). Reconstruido campo a campo.
 */
export async function listCategoryRules(): Promise<CategoryRuleListItem[]> {
  const rules = await prisma.categoryRule.findMany();

  return rules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    category: rule.category,
  }));
}

/**
 * Erro de dominio: `deleteCategoryRule` chamado com um `id` que nao existe.
 * Mensagem fixa e generica, mesmo padrao dos demais erros de dominio do
 * projeto.
 */
export class CategoryRuleNotFoundError extends Error {
  constructor() {
    super("Regra de categorizacao nao encontrada.");
    this.name = "CategoryRuleNotFoundError";
  }
}

/**
 * Remove uma regra por `id` (Criterio de aceite #1, secao 3 "DADO uma regra
 * QUANDO a removo"). `findUnique` primeiro - se nao existir, rejeita com
 * `CategoryRuleNotFoundError` SEM chamar `delete`. Remover uma regra nao
 * afeta retroativamente transacoes ja categorizadas por ela (consequencia
 * aceita do DT-019 - so o proximo sync muda).
 */
export async function deleteCategoryRule(id: string): Promise<void> {
  const rule = await prisma.categoryRule.findUnique({ where: { id } });

  if (!rule) {
    throw new CategoryRuleNotFoundError();
  }

  await prisma.categoryRule.delete({ where: { id } });
}

/**
 * Mapa hash->categoria de TODAS as regras cadastradas (Criterio de aceite
 * #6) - usado por `lib/sync.ts` para resolver `categoryFromRule` de cada
 * transacao sem tocar em nenhum documento cru.
 */
export async function getCategoryRuleHashMap(): Promise<Map<string, string>> {
  const rules = await prisma.categoryRule.findMany({
    select: { documentHash: true, category: true },
  });

  return new Map(rules.map((rule) => [rule.documentHash, rule.category]));
}
