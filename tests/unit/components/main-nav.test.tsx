/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Teste de Testing Library do componente de navegacao principal (TASK-012 -
 * Criterios de aceite #1, #2, #5). Ambiente `jsdom` via docblock no topo do
 * arquivo (mesmo padrao de connect-bank-button.test.tsx/deactivate-bank-
 * button.test.tsx da TASK-005).
 *
 * `next/navigation` e mockado PARCIALMENTE: so `usePathname` e mockada (via
 * `vi.hoisted` + `mockReturnValue` por teste) - o resto do modulo (`Link`
 * vem de `next/link`, nao de `next/navigation`) continua real. Isso da
 * controle total sobre "em qual pagina o usuario esta" sem precisar de um
 * AppRouterContext real no jsdom.
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   components/nav/MainNav.tsx
 *     "use client"
 *     export function MainNav(): JSX.Element
 *
 * Deve:
 *   - nao importar nada de `lib/` (nenhum acoplamento a `lib/db` ou
 *     qualquer modulo server-only - Criterio de aceite #5, mesma armadilha
 *     de TASK-009/011 documentada na TASK-012.md secao 0);
 *   - renderizar uma `<nav>` com 6 links (`<a>` via `next/link`), UM para
 *     cada tela, com os hrefs exatos:
 *       "Dashboard"    -> /dashboard
 *       "Transações"   -> /transacoes
 *       "Faturas"      -> /faturas
 *       "Bancos"       -> /bancos
 *       "Lançamentos"  -> /lancamentos
 *       "Categorias"   -> /categorias
 *   - usar `usePathname()` (next/navigation) para decidir qual link
 *     representa a rota atual;
 *   - marcar o link da rota atual com `aria-current="page"` - e SOMENTE
 *     esse link (os outros 5 NAO tem o atributo `aria-current`);
 *   - nao chamar `console.log`/`console.warn`/`console.error` durante a
 *     renderizacao (Criterio de aceite #6).
 *
 * ADICAO (TASK-012 Parte 2 - apresentacao visual, Criterio de aceite P4):
 * alem do `aria-current="page"` ja existente (mantido como contrato -
 * Criterio de aceite #2 da Parte 1, intocado), o link ativo passa a
 * carregar tambem `data-active="true"`; os outros 5 NAO tem esse atributo
 * (mesma convencao do `aria-current`). Esse atributo e o CONTRATO
 * TESTAVEL do "destaque visual" pedido em P4 - deliberadamente NAO se
 * testa nenhuma classe Tailwind especifica (fragil a qualquer ajuste de
 * estilo); a aparencia real (cor, peso de fonte, sublinhado etc.) e
 * estetica e fica para verificacao manual/pelo orquestrador no app real.
 */

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

const EXPECTED_LINKS: Array<{ name: RegExp; href: string }> = [
  { name: /^dashboard$/i, href: "/dashboard" },
  { name: /^transa[cç][oõ]es$/i, href: "/transacoes" },
  { name: /^faturas$/i, href: "/faturas" },
  { name: /^bancos$/i, href: "/bancos" },
  { name: /^lan[cç]amentos$/i, href: "/lancamentos" },
  { name: /^categorias$/i, href: "/categorias" },
];

afterEach(() => {
  // `globals: false` no vitest.config.ts desativa o cleanup automatico do
  // Testing Library entre testes - ver o mesmo comentario em
  // connect-bank-button.test.tsx.
  cleanup();
  vi.clearAllMocks();
});

describe("MainNav - os 6 links das telas (Criterio de aceite #1)", () => {
  it("renderiza um link para cada uma das 6 telas, com o href correto", async () => {
    usePathnameMock.mockReturnValue("/dashboard");
    const { MainNav } = await import("@/components/nav/MainNav");

    render(<MainNav />);

    for (const { name, href } of EXPECTED_LINKS) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("renderiza os links dentro de uma <nav> (landmark de navegacao)", async () => {
    usePathnameMock.mockReturnValue("/dashboard");
    const { MainNav } = await import("@/components/nav/MainNav");

    render(<MainNav />);

    const nav = screen.getByRole("navigation");
    for (const { name } of EXPECTED_LINKS) {
      expect(
        screen.getByRole("link", { name }).closest("nav"),
      ).toBe(nav);
    }
  });

  it("nao chama console.log/warn/error ao renderizar (Criterio de aceite #6)", async () => {
    usePathnameMock.mockReturnValue("/dashboard");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { MainNav } = await import("@/components/nav/MainNav");
    render(<MainNav />);

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("MainNav - estado ativo via usePathname, dois pathnames distintos (Criterio de aceite #2)", () => {
  it("em /transacoes, SOMENTE o link 'Transações' fica marcado como ativo (aria-current='page')", async () => {
    usePathnameMock.mockReturnValue("/transacoes");
    const { MainNav } = await import("@/components/nav/MainNav");

    render(<MainNav />);

    const activeLink = screen.getByRole("link", { name: /^transa[cç][oõ]es$/i });
    expect(activeLink).toHaveAttribute("aria-current", "page");

    const others = EXPECTED_LINKS.filter((l) => l.href !== "/transacoes");
    for (const { name } of others) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute(
        "aria-current",
      );
    }
  });

  it("em /faturas, SOMENTE o link 'Faturas' fica marcado como ativo (aria-current='page') - troca de rota muda qual link esta ativo", async () => {
    usePathnameMock.mockReturnValue("/faturas");
    const { MainNav } = await import("@/components/nav/MainNav");

    render(<MainNav />);

    const activeLink = screen.getByRole("link", { name: /^faturas$/i });
    expect(activeLink).toHaveAttribute("aria-current", "page");

    // Em particular, o link de Transacoes (ativo no teste anterior) NAO
    // pode continuar marcado agora que a rota mudou.
    const others = EXPECTED_LINKS.filter((l) => l.href !== "/faturas");
    for (const { name } of others) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute(
        "aria-current",
      );
    }
  });
});

describe("MainNav - destaque visual do link ativo via data-active (Criterio de aceite P4, TASK-012 Parte 2)", () => {
  it("em /bancos, SOMENTE o link 'Bancos' recebe data-active='true' (alem do aria-current ja existente)", async () => {
    usePathnameMock.mockReturnValue("/bancos");
    const { MainNav } = await import("@/components/nav/MainNav");

    render(<MainNav />);

    const activeLink = screen.getByRole("link", { name: /^bancos$/i });
    expect(activeLink).toHaveAttribute("data-active", "true");
    expect(activeLink).toHaveAttribute("aria-current", "page");

    const others = EXPECTED_LINKS.filter((l) => l.href !== "/bancos");
    for (const { name } of others) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute(
        "data-active",
      );
    }
  });

  it("trocar a rota move o data-active='true' de um link para outro (nao fica um segundo link 'preso' ativo)", async () => {
    usePathnameMock.mockReturnValue("/categorias");
    const { MainNav } = await import("@/components/nav/MainNav");

    render(<MainNav />);

    expect(
      screen.getByRole("link", { name: /^categorias$/i }),
    ).toHaveAttribute("data-active", "true");
    expect(
      screen.getByRole("link", { name: /^dashboard$/i }),
    ).not.toHaveAttribute("data-active");
  });
});
