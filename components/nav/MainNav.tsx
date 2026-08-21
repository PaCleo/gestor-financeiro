"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Transações", href: "/transacoes" },
  { label: "Faturas", href: "/faturas" },
  { label: "Bancos", href: "/bancos" },
  { label: "Lançamentos", href: "/lancamentos" },
  { label: "Categorias", href: "/categorias" },
];

/**
 * Navegação principal do app (TASK-012, Critérios de aceite #1, #2, #5, #6;
 * Parte 2 - apresentação visual, Critério P4). Client Component: usa
 * `usePathname()` para saber a rota atual e marcar o link correspondente
 * com `aria-current="page"` + `data-active="true"` (destaque visual
 * estruturado, sem travar classe Tailwind específica em teste). Não importa
 * nada de `lib/` - nenhum acoplamento a `lib/db`/módulos server-only (mesma
 * armadilha documentada nas TASK-009/011: um import desses arrastaria `pg`
 * para o bundle do cliente e quebraria `npm run build`).
 *
 * TASK-013 (sistema de design Fintech Premium): só a apresentação mudou -
 * marca com "mark" em gradiente indigo + link ativo como pílula (classe
 * `.app-nav-link[data-active="true"]` em `app/globals.css`). O
 * `aria-current="page"`/`data-active="true"` do link ativo (contrato
 * testável de tests/unit/components/main-nav.test.tsx) é mantido
 * exatamente igual.
 */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Navegação principal">
      <div className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <div className="mr-2 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          Gestor
        </div>
        <ul className="flex flex-wrap items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  data-active={isActive ? "true" : undefined}
                  className="app-nav-link"
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
