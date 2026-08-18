import { listCategoryRules } from "@/lib/category-rules";
import { AddCategoryRuleForm } from "@/components/category-rules/AddCategoryRuleForm";
import { DeleteCategoryRuleButton } from "@/components/category-rules/DeleteCategoryRuleButton";

/**
 * Pagina de gestao de regras de categorizacao por CPF/CNPJ (TASK-008,
 * Criterio de aceite #9) - Server Component (sem `"use client"`): busca
 * `listCategoryRules()` direto de `lib/category-rules.ts`, sem round-trip
 * HTTP (mesmo padrao de `app/bancos/page.tsx`, TASK-005).
 *
 * Renderiza `<AddCategoryRuleForm />` e, para cada regra, o rotulo (ou a
 * categoria, se o rotulo for `null` - "o documento nao existe para exibir,
 * por isso o rotulo importa", secao 3 do TASK-008.md) + a categoria + um
 * `<DeleteCategoryRuleButton ruleId={rule.id} />`. Estado vazio com
 * mensagem quando nao ha regras cadastradas.
 */
export default async function CategoriasPage() {
  const rules = await listCategoryRules();

  return (
    <main>
      <h1>Regras de categorizacao</h1>
      <AddCategoryRuleForm />
      {rules.length === 0 ? (
        <p>Voce ainda nao cadastrou nenhuma regra de categorizacao.</p>
      ) : (
        <ul>
          {rules.map((rule) => (
            <li key={rule.id}>
              <span>{rule.label ?? rule.category}</span>
              <span>{rule.category}</span>
              <DeleteCategoryRuleButton ruleId={rule.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
