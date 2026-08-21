import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Teste do redirect de `/` para `/dashboard` (TASK-012 - Criterio de
 * aceite #3). Ambiente `node` (padrao do projeto - nao precisa de DOM: nao
 * renderizamos nada, so verificamos QUE `redirect()` foi chamado com o
 * destino certo).
 *
 * `next/navigation` e mockado PARCIALMENTE: so `redirect` e substituida por
 * um mock que, IGUAL AO `redirect` REAL do Next (ver
 * node_modules/next/dist/client/components/redirect.js - `redirect()`
 * sempre `throw`s um erro especial `NEXT_REDIRECT` para interromper a
 * renderizacao), tambem lanca - isso prova que a pagina chama `redirect`
 * de um jeito que de fato interrompe a renderizacao (nao so invoca a
 * funcao e continua renderizando o resto por baixo, o que na Next real
 * seria inofensivo so por acidente de uma implementacao real ainda nao
 * ter lancado o erro).
 *
 * Contrato assumido (definido pelo qa nesta task - o coder implementa
 * exatamente assim):
 *
 *   app/page.tsx
 *     import { redirect } from "next/navigation";
 *     export default function Home(): never {
 *       redirect("/dashboard");
 *     }
 *
 *   Server Component sincrono (sem "use client", sem precisar ser async) -
 *   chama `redirect("/dashboard")` incondicionalmente ao renderizar,
 *   seguindo o exemplo de Server Component da doc oficial (ver
 *   node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 *   redirect.md, secao "Server Component" e nota "does not require
 *   `return redirect()`... uses the TypeScript `never` type").
 */

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((_url: string) => {
    // Emula o comportamento real: `redirect()` sempre lanca.
    throw new Error("NEXT_REDIRECT_MOCK");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("app/page.tsx - '/' redireciona para '/dashboard' (Criterio de aceite #3)", () => {
  it("chama redirect('/dashboard') ao renderizar a home", async () => {
    const { default: Home } = await import("@/app/page");

    expect(() => Home()).toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("nao redireciona para nenhuma outra rota (garante o destino exato, nao so 'foi chamado')", async () => {
    const { default: Home } = await import("@/app/page");

    expect(() => Home()).toThrow();
    expect(redirectMock).not.toHaveBeenCalledWith("/");
    expect(redirectMock).not.toHaveBeenCalledWith("/transacoes");
    expect(redirectMock.mock.calls[0]?.[0]).toBe("/dashboard");
  });
});
