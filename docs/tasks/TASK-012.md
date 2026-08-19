# TASK-012 — Navegação entre as telas
Status: EM ANDAMENTO | Fase do roadmap: 6 (usabilidade)

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, Vitest, Testing Library. Posterior ao seu treinamento —
  consulte `node_modules/next/dist/docs/01-app/` para `usePathname`, `redirect`, layout, Client vs
  Server Components nesta versão.
- Padrão de frontend do projeto: `jsdom` opt-in por arquivo via `/** @vitest-environment jsdom */`;
  ambiente global `node`; com `globals: false`, cada teste de componente chama `cleanup()`.
- **Armadilha recorrente (TASK-009/011):** um Client Component não pode importar, direta ou
  transitivamente, `lib/db` (arrasta `pg` para o bundle e o build quebra). O nav não precisa de
  nada de `lib/` — mantenha assim. **Rode `npm run build` antes de reportar pronto.**
- Existem 6 páginas: `/dashboard`, `/transacoes`, `/faturas`, `/bancos`, `/lancamentos`,
  `/categorias`. O `app/layout.tsx` é Server Component e ainda tem o metadata do scaffold
  ("Create Next App"). `app/page.tsx` é a home do scaffold.

## 1. Objetivo

Tornar o app **usável no dia a dia**: uma barra de navegação, presente em todas as telas, ligando
as seis páginas — hoje elas existem mas não há como ir de uma à outra sem digitar a URL.

## 2. Comportamento esperado (TDD)

- DADO qualquer página QUANDO ela renderiza ENTÃO vejo uma navegação com links para as 6 telas
  (Dashboard, Transações, Faturas, Bancos, Lançamentos, Categorias)
- DADO que estou em `/transacoes` QUANDO vejo o nav ENTÃO o link de Transações está marcado como
  **ativo** (distinguível dos demais)
- DADO que abro `/` QUANDO a home carrega ENTÃO sou redirecionado para `/dashboard`
- DADO qualquer página QUANDO olho a aba do navegador ENTÃO o título é do app, não "Create Next App"

## 3. Critérios de aceite

- [ ] 1. Componente de navegação (Client Component; usa `usePathname` para o estado ativo) com os 6
      links, renderizado no `app/layout.tsx` — aparece em **todas** as páginas
- [ ] 2. O link da rota atual é marcado como ativo (ex. `aria-current="page"` + estilo); teste cobre
      dois pathnames diferentes ativando o link certo
- [ ] 3. `/` redireciona para `/dashboard` (via `redirect` do Next)
- [ ] 4. `app/layout.tsx` metadata com título do app (ex. "Gestor Financeiro"), não o do scaffold
- [ ] 5. O nav é testado com Testing Library (renderiza os 6 links; estado ativo). Nenhum Client
      Component importa `lib/db`/`lib/*` de servidor
- [ ] 6. Nenhum `console.*` em produção
- [ ] 7. Suíte inteira verde (os anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 4. Fora de escopo

- Estilização elaborada / tema / responsividade fina (um nav funcional e legível basta)
- Menu mobile com hambúrguer (se o nav simples já couber, ótimo; não é requisito)
- Autenticação / usuário logado no nav
- Qualquer mudança de lógica das páginas existentes (só adicionar o nav e o redirect)
- Botão de sincronizar no nav (o `POST /api/sync` existe, mas não é o foco desta task)

## 5. Testes (preenchido pelo qa)

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 6. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
