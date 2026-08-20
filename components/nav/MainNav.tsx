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
 */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-200 bg-white">
      <ul className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-3 sm:gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                data-active={isActive ? "true" : undefined}
                className={
                  isActive
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                }
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
