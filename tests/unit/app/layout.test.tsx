/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Teste do Root Layout (TASK-012 - Criterios de aceite #1 e #4).
 *
 * `app/layout.tsx` e um Server Component sincrono `RootLayout({ children })`
 * que so monta a arvore de elementos (<html><body>{nav}{children}</body>
 * </html>) - chama-lo diretamente como funcao (sem passar por um servidor
 * Next real) e o padrao documentado pela propria Next.js para testar layouts
 * (um layout e "so uma funcao que recebe `children`"). O elemento retornado
 * e entao passado para `render()` do Testing Library normalmente; jsdom nao
 * se importa que a arvore renderizada contenha uma tag `<html>` aninhada
 * dentro do container de teste - so os testes de `getByRole`/`getByTestId`
 * importam aqui (confirmado experimentalmente antes de escrever este
 * arquivo).
 *
 * `next/font/google` (`Geist`, `Geist_Mono`) e mockado INTEIRAMENTE: essas
 * funcoes dependem da transformacao SWC do build real do Next para
 * funcionar (baixam metadados de fonte em build-time) - fora do pipeline de
 * build elas nao sao nem chamaveis (confirmado: `Geist is not a function`
 * ao importar `app/layout.tsx` sem esse mock). Sem relacao com o
 * comportamento desta task (navegacao/metadata) - mock necessario so para
 * o modulo carregar.
 *
 * `next/navigation` (`usePathname`, usado internamente por `MainNav`) e
 * mockado para um pathname fixo - o estado ATIVO do link e responsabilidade
 * de main-nav.test.tsx (Criterio de aceite #2); aqui so importa que o nav
 * apareca em toda pagina.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/layout.tsx
 *     export const metadata: Metadata = { title: "Gestor Financeiro", ... }
 *     export default function RootLayout({ children }): JSX.Element
 *       - renderiza <MainNav /> (de "@/components/nav/MainNav") em algum
 *         lugar de <body>, ANTES ou ao redor de `children`;
 *       - continua renderizando `children` (o conteudo de cada pagina).
 */

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

afterEach(() => {
  // `globals: false` desativa o cleanup automatico do Testing Library -
  // mesmo padrao dos demais testes de componente do projeto.
  cleanup();
  vi.clearAllMocks();
});

describe("app/layout.tsx - RootLayout inclui a navegacao em toda pagina (Criterio de aceite #1)", () => {
  it("renderiza os 6 links de navegacao ao redor do conteudo da pagina (children)", async () => {
    const { default: RootLayout } = await import("@/app/layout");

    render(
      RootLayout({
        children: <div data-testid="conteudo-da-pagina">Conteudo da tela</div>,
      }),
    );

    expect(screen.getByRole("link", { name: /^dashboard$/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(
      screen.getByRole("link", { name: /^transa[cç][oõ]es$/i }),
    ).toHaveAttribute("href", "/transacoes");
    expect(screen.getByRole("link", { name: /^faturas$/i })).toHaveAttribute(
      "href",
      "/faturas",
    );
    expect(screen.getByRole("link", { name: /^bancos$/i })).toHaveAttribute(
      "href",
      "/bancos",
    );
    expect(
      screen.getByRole("link", { name: /^lan[cç]amentos$/i }),
    ).toHaveAttribute("href", "/lancamentos");
    expect(
      screen.getByRole("link", { name: /^categorias$/i }),
    ).toHaveAttribute("href", "/categorias");
  });

  it("continua renderizando o conteudo da pagina (children) junto com a navegacao", async () => {
    const { default: RootLayout } = await import("@/app/layout");

    render(
      RootLayout({
        children: <div data-testid="conteudo-da-pagina">Conteudo da tela</div>,
      }),
    );

    expect(screen.getByTestId("conteudo-da-pagina")).toHaveTextContent(
      "Conteudo da tela",
    );
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});

describe("app/layout.tsx - metadata do app, nao a do scaffold (Criterio de aceite #4)", () => {
  it("o titulo NAO e mais 'Create Next App' (metadata do scaffold)", async () => {
    const { metadata } = await import("@/app/layout");

    expect(metadata.title).not.toBe("Create Next App");
  });

  it("o titulo e o titulo do app ('Gestor Financeiro')", async () => {
    const { metadata } = await import("@/app/layout");

    expect(metadata.title).toBe("Gestor Financeiro");
  });
});
