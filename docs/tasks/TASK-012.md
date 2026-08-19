# TASK-012 — Navegação entre as telas
Status: CONCLUÍDA | Fase do roadmap: 6 (usabilidade)

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

### Contrato assumido para o coder

- **`components/nav/MainNav.tsx`** (novo) — Client Component (`"use client"`), `export function
  MainNav(): JSX.Element`. Usa `usePathname()` de `next/navigation`. Não importa nada de `lib/`
  (armadilha TASK-009/011 — arrastaria `pg`/`lib/db` para o bundle do cliente). Renderiza uma
  `<nav>` com 6 `<Link>` (de `next/link`), nesta ordem/rótulos:
  - "Dashboard" → `/dashboard`
  - "Transações" → `/transacoes`
  - "Faturas" → `/faturas`
  - "Bancos" → `/bancos`
  - "Lançamentos" → `/lancamentos`
  - "Categorias" → `/categorias`

  O link cujo `href` bate com o pathname atual (`usePathname()`) recebe `aria-current="page"`;
  os outros 5 não têm esse atributo. Nenhum `console.*` durante a renderização.

- **`app/layout.tsx`** (alterado) — `metadata.title` passa a ser `"Gestor Financeiro"` (não mais
  "Create Next App"). `RootLayout({ children })` continua uma função síncrona (Server Component)
  que renderiza `<MainNav />` dentro de `<body>`, junto com `{children}`.

- **`app/page.tsx`** (reescrito) — `export default function Home(): never { redirect("/dashboard");
  }` (import `redirect` de `next/navigation`), síncrono, chama `redirect` incondicionalmente ao
  renderizar (Server Component, sem `"use client"`, sem precisar ser `async`). Todo o conteúdo
  scaffold ("To get started, edit the page.tsx file...") sai.

- **`vitest.config.ts`** (alterado pelo qa, aparato de teste) — `coverage.include` ganha
  `"app/layout.tsx"` e `"app/page.tsx"` (o `"components/**/*.tsx"` já existente cobre o novo
  `components/nav/`).

### Arquivos criados

- `tests/unit/components/main-nav.test.tsx`
- `tests/unit/app/layout.test.tsx`
- `tests/unit/app/page-redirect.test.ts`

### Arquivos alterados

- `vitest.config.ts` (`coverage.include` ganha `app/layout.tsx` e `app/page.tsx` — ver "Contrato
  assumido" acima)

### Comandos para rodar

```bash
# Pré-requisito: banco de teste de pé (os 803 testes pré-existentes dependem dele mesmo
# quando não tocados por esta task, porque a suíte roda inteira)
npm run db:up

# Só os arquivos desta task
npm test -- tests/unit/components/main-nav.test.tsx
npm test -- tests/unit/app/layout.test.tsx
npm test -- tests/unit/app/page-redirect.test.ts

# Suíte inteira (confirma ausência de regressão nos 803 testes pré-existentes)
npm test

# Cobertura
npm run test:coverage
```

### Mapeamento critério de aceite → teste

| # | Critério de aceite | Arquivo | Teste |
|---|---|---|---|
| 1 | Nav com os 6 links, renderizado no `app/layout.tsx`, aparece em todas as páginas | `tests/unit/components/main-nav.test.tsx` | `MainNav - os 6 links das telas (Criterio de aceite #1) > renderiza um link para cada uma das 6 telas, com o href correto` |
| 1 | (idem, dentro de uma `<nav>`) | `tests/unit/components/main-nav.test.tsx` | `MainNav - os 6 links das telas (Criterio de aceite #1) > renderiza os links dentro de uma <nav> (landmark de navegacao)` |
| 1 | (idem, integrado ao layout — aparece ao redor de `children`, ou seja, em qualquer página) | `tests/unit/app/layout.test.tsx` | `app/layout.tsx - RootLayout inclui a navegacao em toda pagina (Criterio de aceite #1) > renderiza os 6 links de navegacao ao redor do conteudo da pagina (children)` |
| 1 | (idem, o conteúdo da página continua aparecendo junto com o nav) | `tests/unit/app/layout.test.tsx` | `app/layout.tsx - RootLayout inclui a navegacao em toda pagina (Criterio de aceite #1) > continua renderizando o conteudo da pagina (children) junto com a navegacao` |
| 2 | Link da rota atual marcado como ativo (`aria-current="page"`); dois pathnames diferentes ativando o link certo | `tests/unit/components/main-nav.test.tsx` | `MainNav - estado ativo via usePathname, dois pathnames distintos (Criterio de aceite #2) > em /transacoes, SOMENTE o link 'Transações' fica marcado como ativo (aria-current='page')` |
| 2 | (idem, segundo pathname — prova que a troca de rota muda qual link fica ativo, não apenas que "algum" link fica ativo) | `tests/unit/components/main-nav.test.tsx` | `MainNav - estado ativo via usePathname, dois pathnames distintos (Criterio de aceite #2) > em /faturas, SOMENTE o link 'Faturas' fica marcado como ativo (aria-current='page') - troca de rota muda qual link esta ativo` |
| 3 | `/` redireciona para `/dashboard` via `redirect` do Next | `tests/unit/app/page-redirect.test.ts` | `app/page.tsx - '/' redireciona para '/dashboard' (Criterio de aceite #3) > chama redirect('/dashboard') ao renderizar a home` |
| 3 | (idem, destino EXATO — não só "foi chamado") | `tests/unit/app/page-redirect.test.ts` | `app/page.tsx - '/' redireciona para '/dashboard' (Criterio de aceite #3) > nao redireciona para nenhuma outra rota (garante o destino exato, nao so 'foi chamado')` |
| 4 | `app/layout.tsx` metadata com título do app, não o do scaffold | `tests/unit/app/layout.test.tsx` | `app/layout.tsx - metadata do app, nao a do scaffold (Criterio de aceite #4) > o titulo NAO e mais 'Create Next App' (metadata do scaffold)` |
| 4 | (idem, título exato esperado) | `tests/unit/app/layout.test.tsx` | `app/layout.tsx - metadata do app, nao a do scaffold (Criterio de aceite #4) > o titulo e o titulo do app ('Gestor Financeiro')` |
| 5 | Nav testado com Testing Library (6 links; estado ativo) | `tests/unit/components/main-nav.test.tsx` | toda a suíte do arquivo (ver critérios 1/2/6 acima) |
| 5 | Nenhum Client Component importa `lib/db`/`lib/*` de servidor | Não coberto por teste automatizado dedicado nesta task — mesma abordagem de TASK-005/007/009/011: `MainNav.tsx` não tem motivo para importar `lib/`, e a garantia final é `npm run build` (import de `lib/db` no cliente quebra o build por arrastar `pg`). Revisão de código + `npm run build` fecham este critério. |
| 6 | Nenhum `console.*` em produção | `tests/unit/components/main-nav.test.tsx` | `MainNav - os 6 links das telas (Criterio de aceite #1) > nao chama console.log/warn/error ao renderizar (Criterio de aceite #6)` — complementado por `npm run lint` (regra `no-console` do projeto) |
| 7 | Suíte inteira verde, `npm run build` e `npm run lint` limpos | (checagem final do coder, fora do escopo de um teste individual) | `npm test` (803 pré-existentes + os novos desta task), `npm run build`, `npm run lint` |

### Evidência de RED (rodado nesta sessão)

```
$ npm test -- tests/unit/components/main-nav.test.tsx tests/unit/app/layout.test.tsx tests/unit/app/page-redirect.test.ts
...
 FAIL  tests/unit/components/main-nav.test.tsx [ tests/unit/components/main-nav.test.tsx ]
Error: Failed to resolve import "@/components/nav/MainNav" from "tests/unit/components/main-nav.test.tsx". Does the file exist?
...
 FAIL  tests/unit/app/layout.test.tsx > ... > renderiza os 6 links de navegacao ao redor do conteudo da pagina (children)
TestingLibraryElementError: Unable to find an accessible element with the role "link" and name `/^dashboard$/i`
...
 FAIL  tests/unit/app/layout.test.tsx > ... > o titulo e o titulo do app ('Gestor Financeiro')
AssertionError: expected 'Create Next App' to be 'Gestor Financeiro'
...
 FAIL  tests/unit/app/page-redirect.test.ts > ... > chama redirect('/dashboard') ao renderizar a home
AssertionError: expected [Function] to throw an error
...
 Test Files  3 failed (3)
      Tests  6 failed (6)
```

Todas as 7 falhas (1 falha de suíte por import ausente + 6 falhas de asserção) são pelo motivo
certo: comportamento ainda não implementado (`components/nav/MainNav.tsx` não existe; `RootLayout`
ainda não renderiza nav nenhum; `metadata.title` ainda é o do scaffold; `Home()` ainda não chama
`redirect`) — nenhuma é erro de sintaxe/import quebrado nos próprios testes.

Suíte inteira, mesma sessão, sem os 3 arquivos novos tocados na produção (confirma ausência de
regressão nos testes pré-existentes):

```
$ npm test
...
 Test Files  3 failed | 58 passed (61)
      Tests  6 failed | 803 passed (809)
```

Os 803 testes pré-existentes continuam 100% verdes; os únicos vermelhos são os 3 arquivos novos
desta task, pelo motivo esperado (RED).

## 6. Implementação (preenchido pelo coder)

> Nota: o coder foi interrompido por erro de API (computador dormiu) logo após terminar a
> implementação, antes de preencher esta seção. O orquestrador completou a verificação e o registro.

Arquivos alterados/criados:
- `components/nav/MainNav.tsx` (novo) — Client Component com `usePathname`, 6 links, `aria-current="page"` no ativo
- `app/layout.tsx` — metadata "Gestor Financeiro" + `<MainNav />` no `<body>`
- `app/page.tsx` — reescrito para `redirect("/dashboard")`

Decisões: seguiu o contrato da seção 5 sem desvio.

Verificação (pelo orquestrador): `npm test` 814/814 verde; `npm run lint` exit 0; `npm run build`
limpo (`/` estático redireciona, sem vazar `pg` no bundle client). Exercitado no app real:
`GET /` → 307 para `/dashboard`; nav presente em `/transacoes` com `aria-current="page"` no link ativo.

Dívidas assumidas: nenhuma nova.

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO

Revisado o diff real (não apenas a seção 6). Verificações rodadas pelo próprio
reviewer, não confiando no relato:
- `npx vitest run` nos 3 arquivos novos: 11/11 verdes.
- `npm run build`: limpo. `/` prerenderiza como `○ (Static)` (redirect resolvido
  em build); nenhum vazamento de `pg`/`lib/db` no bundle client.
- `grep console.` em `components/nav/`, `app/layout.tsx`, `app/page.tsx`: nada.

Ponto a ponto dos critérios de aceite:
1. OK — `MainNav` (`components/nav/MainNav.tsx`) renderiza `<nav>` com os 6
   `<Link>` na ordem/rótulos do contrato; montado em `app/layout.tsx` dentro de
   `<body>`, antes de `{children}` (aparece em toda página).
2. OK — link ativo por `pathname === item.href` (match EXATO), `aria-current="page"`
   só no ativo. Teste cobre dois pathnames distintos (`/transacoes`, `/faturas`),
   cada um exigindo que SÓ o link certo fique marcado e os outros 5 não — tem
   poder de detecção real contra hardcode/link-fixo.
3. OK — `app/page.tsx`: `redirect("/dashboard")` incondicional, síncrono, retorno
   `never`. Teste valida destino EXATO (`toHaveBeenCalledWith("/dashboard")` +
   `mock.calls[0][0] === "/dashboard"`), não só "foi chamado".
4. OK — `metadata.title = "Gestor Financeiro"`; scaffold "Create Next App" saiu.
5. OK — `MainNav` importa SÓ `next/link` e `next/navigation`; zero acoplamento a
   `lib/` (direto ou transitivo). Confirmado por leitura + build verde.
6. OK — sem `console.*`; teste dedicado espia log/warn/error na renderização.
7. OK — suíte inteira verde, build e lint limpos (build re-executado aqui).

Nenhum teste é verde-por-construção: os três exercem o comportamento real
(o de redirect falharia se `Home` não lançasse; o de metadata lê o valor real;
o de nav afirma href/`aria-current` reais).

### Problemas encontrados (bloqueantes)
Nenhum.

### Sugestões não-bloqueantes (viram DT, não travam a task)
- DT sugerida: o teste de estado ativo (Critério 2) só usa pathnames de topo
  (`/transacoes`, `/faturas`), nunca uma rota aninhada (ex. `/faturas/123`).
  Por isso não distingue o `===` implementado (correto/seguro) de um `startsWith`
  que daria falso-positivo em subrota. A implementação está certa; a lacuna é só
  de poder de detecção do teste. Se surgirem rotas aninhadas, adicionar um caso
  `/faturas/algo` esperando o link "Faturas" ativo (ou nenhum, conforme a regra
  desejada). Como não há subrotas hoje, é dívida, não bug.
- Não-bloqueante: `app/layout.tsx` mantém `<html lang="en">`; o app é em
  português — trocar para `lang="pt-BR"` melhora a11y/SEO. Fora do escopo desta
  task (seção 4), fica como observação.
- Não-bloqueante: `layout.test.tsx` renderiza `<html>` aninhado num `<div>` de
  teste e mocka `next/font/google` inteiro — tolerado pelo jsdom e documentado
  no próprio arquivo; aceitável para o padrão do projeto.

Veredito final: APROVADO.
