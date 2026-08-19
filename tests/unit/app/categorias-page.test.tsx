/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Teste de Testing Library da pagina de gestao de regras de categorizacao
 * (TASK-008 - Criterio de aceite #9). Ambiente `jsdom` via docblock, mesmo
 * padrao de bancos-page.test.tsx (TASK-005).
 *
 * `@/lib/category-rules` (a fonte dos dados) e os dois componentes filhos
 * (`AddCategoryRuleForm`, `DeleteCategoryRuleButton` - ja cobertos em
 * detalhe pelos proprios arquivos de teste) sao mockados inteiramente -
 * este arquivo isola a responsabilidade PROPRIA da pagina: buscar a lista e
 * passar os props certos para cada filho.
 *
 * `app/categorias/page.tsx` e um Server Component (funcao async, SEM "use
 * client"), mesmo padrao de app/bancos/page.tsx.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/categorias/page.tsx
 *     export default async function CategoriasPage(): Promise<JSX.Element>
 *
 * Deve:
 *   - chamar `listCategoryRules()` de `lib/category-rules.ts`;
 *   - renderizar `<AddCategoryRuleForm />`;
 *   - para cada regra retornada, mostrar o rotulo (ou a categoria, se o
 *     rotulo for null - "o documento nao existe para exibir, por isso o
 *     rotulo importa", secao 3) + a categoria + um
 *     `<DeleteCategoryRuleButton ruleId={rule.id} />`;
 *   - quando a lista estiver vazia, mostrar uma mensagem de estado vazio.
 */

const { listCategoryRulesMock } = vi.hoisted(() => ({
  listCategoryRulesMock: vi.fn(),
}));

vi.mock("@/lib/category-rules", () => ({
  listCategoryRules: listCategoryRulesMock,
}));

vi.mock("@/components/category-rules/AddCategoryRuleForm", () => ({
  AddCategoryRuleForm: () => (
    <form aria-label="Adicionar regra (mock)">
      <button type="submit">Adicionar regra (mock)</button>
    </form>
  ),
}));

vi.mock("@/components/category-rules/DeleteCategoryRuleButton", () => ({
  DeleteCategoryRuleButton: ({ ruleId }: { ruleId: string }) => (
    <button type="button" data-testid={`delete-mock-${ruleId}`}>
      Remover (mock)
    </button>
  ),
}));

function buildRuleListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    label: "Mercado do bairro",
    category: "Mercado",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("app/categorias/page.tsx - lista regras de categorizacao (Criterio de aceite #9)", () => {
  it("renderiza o formulario de adicionar e, para cada regra, o rotulo, a categoria e o botao de remover", async () => {
    listCategoryRulesMock.mockResolvedValueOnce([
      buildRuleListItem({ id: "rule-mercado", label: "Mercado do bairro", category: "Mercado" }),
      buildRuleListItem({ id: "rule-saude", label: "Plano de saúde", category: "Saúde" }),
    ]);

    const { default: CategoriasPage } = await import("@/app/categorias/page");
    render(await CategoriasPage());

    expect(
      screen.getByRole("form", { name: /adicionar regra/i }),
    ).toBeInTheDocument();

    expect(screen.getByText("Mercado do bairro")).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(
      screen.getByTestId("delete-mock-rule-mercado"),
    ).toBeInTheDocument();

    expect(screen.getByText("Plano de saúde")).toBeInTheDocument();
    expect(screen.getByText("Saúde")).toBeInTheDocument();
    expect(screen.getByTestId("delete-mock-rule-saude")).toBeInTheDocument();
  });

  it("regra sem rotulo (label null) mostra a categoria no lugar do rotulo - o documento nao existe para exibir (secao 3)", async () => {
    listCategoryRulesMock.mockResolvedValueOnce([
      buildRuleListItem({ id: "rule-sem-rotulo", label: null, category: "Farmácia" }),
    ]);

    const { default: CategoriasPage } = await import("@/app/categorias/page");
    render(await CategoriasPage());

    expect(screen.getAllByText("Farmácia").length).toBeGreaterThan(0);
    expect(
      screen.getByTestId("delete-mock-rule-sem-rotulo"),
    ).toBeInTheDocument();
  });

  it("mostra uma mensagem de estado vazio quando nao ha regras cadastradas", async () => {
    listCategoryRulesMock.mockResolvedValueOnce([]);

    const { default: CategoriasPage } = await import("@/app/categorias/page");
    render(await CategoriasPage());

    expect(
      screen.getByRole("form", { name: /adicionar regra/i }),
    ).toBeInTheDocument();
    expect(document.body.textContent).toMatch(
      /nenhuma regra|voc[eê] ainda n[aã]o cadastrou/i,
    );
  });

  it("chama listCategoryRules exatamente uma vez", async () => {
    listCategoryRulesMock.mockResolvedValueOnce([]);

    const { default: CategoriasPage } = await import("@/app/categorias/page");
    render(await CategoriasPage());

    expect(listCategoryRulesMock).toHaveBeenCalledTimes(1);
  });
});
