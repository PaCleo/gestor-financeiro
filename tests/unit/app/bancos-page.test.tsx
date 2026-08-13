/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Teste de Testing Library da pagina de bancos conectados (TASK-005 -
 * Criterio de aceite #8). Ambiente `jsdom` via docblock no topo do
 * arquivo.
 *
 * `@/lib/bank-item` (a fonte dos dados) e os dois componentes filhos
 * (`ConnectBankButton`, `DeactivateBankButton` - ja cobertos em detalhe
 * pelos proprios arquivos de teste) sao mockados inteiramente - este
 * arquivo isola a responsabilidade PROPRIA da pagina: buscar a lista e
 * passar os props certos para cada filho, sem duplicar a logica de
 * fetch/estado ja testada em connect-bank-button.test.tsx e
 * deactivate-bank-button.test.tsx.
 *
 * `app/bancos/page.tsx` e um Server Component (funcao async, SEM "use
 * client" - busca os dados direto de `lib/bank-item.ts`, sem endpoint HTTP
 * intermediario, seguindo o padrao de Server Components desta versao do
 * Next - ver node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md).
 * Testado chamando a funcao async diretamente e renderizando o elemento
 * resultante - tecnica padrao para testar Server Components do App Router
 * fora do runtime do Next.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/bancos/page.tsx
 *     export default async function BancosPage(): Promise<JSX.Element>
 *
 * Deve:
 *   - chamar `listActiveBankItems()` de `lib/bank-item.ts`;
 *   - renderizar `<ConnectBankButton />` (o Criterio de aceite #7 ja cobre
 *     o comportamento interno do widget);
 *   - para cada BankItem retornado, mostrar a instituicao, o `state`
 *     derivado (texto "OK"/"PRECISA_ACAO"/etc.) e um
 *     `<DeactivateBankButton bankItemId={item.id} />`;
 *   - quando a lista estiver vazia, mostrar uma mensagem de estado vazio
 *     (nao uma tabela/lista em branco sem explicacao).
 */

const { listActiveBankItemsMock } = vi.hoisted(() => ({
  listActiveBankItemsMock: vi.fn(),
}));

vi.mock("@/lib/bank-item", () => ({
  listActiveBankItems: listActiveBankItemsMock,
}));

vi.mock("@/components/bank-items/ConnectBankButton", () => ({
  ConnectBankButton: () => (
    <button type="button">Conectar banco (mock)</button>
  ),
}));

vi.mock("@/components/bank-items/DeactivateBankButton", () => ({
  DeactivateBankButton: ({ bankItemId }: { bankItemId: string }) => (
    <button type="button" data-testid={`deactivate-mock-${bankItemId}`}>
      Desativar (mock)
    </button>
  ),
}));

function buildListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "bankitem-1",
    pluggyItemId: "pluggy-item-1",
    institution: "Banco Teste",
    status: "UPDATED",
    executionStatus: "SUCCESS",
    state: "OK",
    lastSyncAt: null,
    ...overrides,
  };
}

afterEach(() => {
  // `globals: false` no vitest.config.ts desativa o cleanup automatico do
  // Testing Library entre testes - ver o mesmo comentario em
  // connect-bank-button.test.tsx.
  cleanup();
  vi.clearAllMocks();
});

describe("app/bancos/page.tsx - lista bancos conectados com estado derivado e acoes (Criterio de aceite #8)", () => {
  it("renderiza o botao de conectar e, para cada banco ativo, a instituicao, o state e o botao de desativar", async () => {
    listActiveBankItemsMock.mockResolvedValueOnce([
      buildListItem({ id: "item-ok", institution: "Banco Um", state: "OK" }),
      buildListItem({
        id: "item-acao",
        institution: "Banco Dois",
        state: "PRECISA_ACAO",
      }),
    ]);

    const { default: BancosPage } = await import("@/app/bancos/page");
    render(await BancosPage());

    expect(
      screen.getByRole("button", { name: /conectar banco/i }),
    ).toBeInTheDocument();

    expect(screen.getByText("Banco Um")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByTestId("deactivate-mock-item-ok")).toBeInTheDocument();

    expect(screen.getByText("Banco Dois")).toBeInTheDocument();
    expect(screen.getByText("PRECISA_ACAO")).toBeInTheDocument();
    expect(
      screen.getByTestId("deactivate-mock-item-acao"),
    ).toBeInTheDocument();
  });

  it("nao mostra bancos arquivados - so renderiza o que listActiveBankItems devolveu (a exclusao em si e testada em lib/bank-item)", async () => {
    listActiveBankItemsMock.mockResolvedValueOnce([
      buildListItem({ id: "item-ativo", institution: "Banco Ativo" }),
    ]);

    const { default: BancosPage } = await import("@/app/bancos/page");
    render(await BancosPage());

    expect(screen.getByText("Banco Ativo")).toBeInTheDocument();
    expect(screen.queryByText(/banco arquivado/i)).not.toBeInTheDocument();
    expect(listActiveBankItemsMock).toHaveBeenCalledTimes(1);
  });

  it("mostra uma mensagem de estado vazio quando nao ha bancos conectados", async () => {
    listActiveBankItemsMock.mockResolvedValueOnce([]);

    const { default: BancosPage } = await import("@/app/bancos/page");
    render(await BancosPage());

    expect(
      screen.getByRole("button", { name: /conectar banco/i }),
    ).toBeInTheDocument();
    expect(document.body.textContent).toMatch(
      /nenhum banco conectado|voc[eê] ainda n[aã]o conectou/i,
    );
  });
});
