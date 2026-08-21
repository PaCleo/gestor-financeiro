import { listCategoryRules, type CategoryRuleListItem } from "@/lib/category-rules";
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
 *
 * TASK-013 (sistema de design Fintech Premium): so a apresentacao muda -
 * cada regra vira um `.card`, a categoria ganha `.chip`. `rotulo`/
 * `categoria` continuam elementos DISTINTOS com o texto cru (contrato de
 * tests/unit/app/categorias-page.test.tsx, que faz `getByText` em cada um
 * separadamente).
 */
function RuleRow({ rule }: { rule: CategoryRuleListItem }) {
  return (
    <li className="card flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--text)]">
          {rule.label ?? rule.category}
        </span>
        <span className="chip w-fit">{rule.category}</span>
      </div>
      <DeleteCategoryRuleButton ruleId={rule.id} />
    </li>
  );
}

export default async function CategoriasPage() {
  const rules = await listCategoryRules();

  return (
    <main className="flex flex-col gap-6">
      <div className="page-head">
        <p className="eyebrow">Categorização</p>
        <h1>Regras de categorizacao</h1>
      </div>

      <div className="card">
        <AddCategoryRuleForm />
      </div>

      {rules.length === 0 ? (
        <p className="empty-text">Voce ainda nao cadastrou nenhuma regra de categorizacao.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} />
          ))}
        </ul>
      )}
    </main>
  );
}
