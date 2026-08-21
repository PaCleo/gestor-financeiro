# TASK-012 — Navegação entre as telas + apresentação visual
Status: CONCLUÍDA (Parte 1 + Parte 2) | Fase do roadmap: 6 (usabilidade)

> **Parte 1 (navegação): CONCLUÍDA e aprovada** (seções 1–7). O usuário pediu para incluir a
> apresentação visual na mesma branch/task — ver **Parte 2** ao final do arquivo.

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

---

# Parte 2 — Apresentação visual (o dashboard como dashboard)

## P2.0 Contexto

O usuário questionou, com razão, que o dashboard "só joga os dados na tela": a lógica é real
(agregação, exclusão DT-018, agrupamento) mas a apresentação é HTML cru, sem uma classe Tailwind,
com números crus (`3408.84` em vez de `R$ 3.408,84`). O Tailwind v4 já está montado
(`app/globals.css` → `@import "tailwindcss"`), mas **nenhuma tela o usa**. Esta parte dá roupa ao
que já funciona — **sem mudar lógica**: os 803 testes de dados (`lib/`) permanecem intactos.

## P2.1 Escopo (deliberadamente contido)

- **Dashboard** (`/dashboard`): vira um painel de verdade — resumo em cards, gastos por categoria
  como barras horizontais proporcionais, moeda em R$.
- **Nav** (`components/nav/MainNav.tsx`): barra de topo estilizada, link ativo com destaque visual
  (além do `aria-current` que já existe).
- **Base visual global** (`app/layout.tsx` / `globals.css`): container centralizado com largura
  máxima e espaçamento, para nenhuma tela ficar colada na borda. Levanta as 6 telas de uma vez.
- **Fora desta parte:** redesenho do miolo de `/transacoes`, `/faturas`, `/bancos`, `/lancamentos`,
  `/categorias` (elas melhoram pela base + nav; polimento fino é follow-up se o usuário quiser).

## P2.2 Comportamento esperado (TDD)

- DADO um valor monetário `"3408.84"` QUANDO formato ENTÃO vejo `R$ 3.408,84`; `"-1806.01"` →
  `-R$ 1.806,01`; `"0.00"` → `R$ 0,00` (padrão brasileiro; helper puro `formatBRL`)
- DADO o resumo do mês QUANDO exibo ENTÃO receita, despesa e saldo aparecem **formatados em R$**
  (não mais o valor cru), e o saldo tem cor/indicação por sinal
- DADO os gastos por categoria QUANDO exibo ENTÃO cada categoria é uma **barra proporcional** ao
  valor (a maior ocupa a largura máxima; as demais, proporcional), com o valor em R$ ao lado
- DADO o nav QUANDO exibo ENTÃO é uma barra de topo com os links espaçados e o ativo destacado visualmente

## P2.3 Critérios de aceite

- [ ] P1. `formatBRL(decimalString)` — helper puro (ex. em `lib/format.ts`), `Intl.NumberFormat`
      `pt-BR`/`BRL`. Testes: positivo, negativo, zero. **Só formatação de exibição** — a aritmética
      continua em `Decimal` (parsear para número aqui é seguro: valor único de 2 casas, sem acúmulo)
- [ ] P2. Dashboard mostra receita/despesa/saldo formatados em R$; os `data-testid` continuam
      existindo (regressão), mas agora com o texto formatado; teste atualizado para esperar R$
- [ ] P3. Gastos por categoria como barras proporcionais: a de maior valor tem largura máxima, as
      outras proporcionais (via `style width %`); teste prova a proporção (maior = 100%)
- [ ] P4. Nav estilizado (Tailwind), link ativo com destaque visual além do `aria-current`
- [ ] P5. Base visual no layout (container com `max-width` + padding); nenhuma regressão nas 6 telas
- [ ] P6. **Nenhuma mudança em `lib/dashboard.ts`, `lib/transactions.ts` nem em qualquer lógica** —
      só apresentação. Os testes de `lib/` permanecem verdes sem edição
- [ ] P7. Nenhum Client Component importa `lib/db` (o `formatBRL` é puro, pode ser usado no cliente);
      nenhum `console.*`; suíte inteira verde; `npm run build` e `npm run lint` limpos

## P2.4 Testes (preenchido pelo qa)

### O que tem poder de deteccao real (e o que NAO esta sendo testado)

Esta parte e sobre APRESENTACAO, nao logica. Estetica pura (cor exata, fonte,
espacamento em px, "ficar bonito") NAO se testa de forma automatizada com
poder de deteccao real - fica para verificacao manual no app real pelo
orquestrador. O que **e** testavel e foi coberto:

- **Formatacao de moeda** (`formatBRL`): string exata produzida pelo
  `Intl.NumberFormat` - alto poder de deteccao (compara o texto literal).
- **Que o dashboard usa o valor FORMATADO, nao o cru**: comparo o texto
  renderizado; inclui uma asserção negativa (`not.toContain("1500.00")`)
  para provar que o valor cru NAO aparece mais, nao so que o formatado
  aparece (evita falso-positivo de um `toHaveTextContent` frouxo).
- **Proporcao das barras**: leio `style.width` e comparo o NUMERO via
  `parseFloat`/`toBeCloseTo` contra o valor calculado esperado - prova
  proporcao real, nao so presenca de um elemento com `data-testid`. O
  caso 100/90/10 foi escolhido deliberadamente para DISTINGUIR calculo por
  valor real de um calculo por posicao/ranking (que daria ~100/66/33 para 3
  itens) - se o coder implementar "primeira barra sempre 100%, demais um
  valor fixo por posicao", esse teste pega.
- **Estado ativo do nav**: `aria-current="page"` (contrato ja existente e
  testado na Parte 1, mantido) + `data-active="true"` (novo, Criterio P4) -
  atributo estruturado, nao uma classe Tailwind especifica. Evita fragilidade
  a ajustes de estilo.

O que **NAO** esta coberto por teste automatizado nesta parte (documentado
para o coder/reviewer nao surpreenderem-se com a ausencia):

- Cor real do saldo positivo/negativo (verde/vermelho) - so o TEXTO com o
  sinal explicito (`+`/`-`) e testado, nao a cor CSS.
- `app/layout.tsx`/`globals.css`: container com `max-width` + padding
  (Criterio P5) - nao ha teste novo dedicado. E puramente estrutural/visual
  sem um "comportamento" observavel estavel para testar sem acoplar a
  classes Tailwind especificas (o que a task pediu para evitar). Verificacao
  fica para `npm run build` + inspecao visual manual/pelo orquestrador no
  app real. Se o container quebrar a renderizacao de alguma tela, os testes
  de Testing Library JA existentes de cada pagina (`transacoes-page.test.tsx`
  etc.) pegariam isso indiretamente (o conteudo teria de continuar
  acessivel), mas nao ha um teste que afirme "existe max-width".
- Espacamento visual dos links do nav ("barra de topo com links espacados")
  - so a ESTRUTURA (6 links dentro de uma `<nav>`, ja testada na Parte 1) e
    o estado ativo (`data-active`) sao testados; layout/flex/gap do
    Tailwind, nao.
- Nenhuma classe Tailwind especifica e testada em lugar nenhum (deliberado -
  ver instrucao da task; testar `className` exata quebraria a cada ajuste
  de estilo sem ganho real de deteccao de bug).

### Contrato assumido para o coder (Parte 2)

- **`lib/format.ts`** (novo) - `export function formatBRL(decimalString:
  string): string`. Implementacao esperada:
  ```ts
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(decimalString));
  ```
  Funcao pura, sem I/O, sem estado. Pode ser importada por Client Components
  (nao toca `lib/db`).

- **`app/dashboard/page.tsx`** (alterado) - usa `formatBRL` em vez de exibir
  a string crua:
  - `formatSignedAmount(amount)` passa a ser: se `amount.startsWith("-")`,
    retorna `formatBRL(amount)` (o Intl ja poe o "-" antes de "R$"); caso
    contrario, retorna `"+" + formatBRL(amount)`.
  - `dashboard-receita`/`dashboard-despesa` exibem `formatBRL(summary.receita)`
    / `formatBRL(summary.despesa)` (mantendo os mesmos `data-testid`).
  - Cada `category-row-<indice>` exibe `formatBRL(item.total)` no lugar do
    total cru.
  - Cada `category-row-<indice>` ganha um elemento COM
    `data-testid="category-bar-<indice>"` e estilo inline `width` em
    porcentagem: `largura% = (Number(item.total) / maiorTotalDoConjunto) *
    100`, onde `maiorTotalDoConjunto = Math.max(...summary.porCategoria.map(i
    => Number(i.total)))` (calculado por renderizacao, NAO um valor
    hardcoded/global). A categoria de maior valor no conjunto renderizado
    fica em 100%.
  - `dashboard-transferencias-count` continua com a contagem CRUA (numero
    inteiro, nao e valor monetario).
  - **ATUALIZACAO POS-APROVACAO (consistencia pedida pelo orquestrador apos
    a Parte 2 ja aprovada):** `dashboard-transferencias-total` PASSA a
    exibir `formatBRL(summary.transferenciasExcluidas.total)` - deixar esse
    unico total cru destoava do resto da tela, que ja e toda R$. O teste em
    `tests/unit/app/dashboard-page.test.tsx` foi atualizado de acordo (ver
    Evidencia de RED/GREEN abaixo).

- **`components/nav/MainNav.tsx`** (alterado) - o link cujo `href` bate com
  `usePathname()` ganha, alem do `aria-current="page"` ja existente, o
  atributo `data-active="true"`. Os outros 5 links nao tem `data-active`
  (mesma convencao do `aria-current`). Estilizacao Tailwind (cores,
  espacamento) e livre - nao ha teste que trave uma classe especifica.

- **`app/layout.tsx`/`app/globals.css`** (alterado, Criterio P5) - container
  com `max-width` + padding ao redor de `{children}`. Sem contrato de teste
  dedicado (ver secao acima) - o coder tem liberdade de implementacao;
  `npm run build` + as suites de Testing Library ja existentes de cada
  pagina servem de rede de seguranca indireta (o conteudo de cada pagina tem
  que continuar acessivel/renderizando).

- **`vitest.config.ts`**: nao precisou de alteracao - `lib/format.ts` ja
  cai em `"lib/**/*.ts"` (ja no `coverage.include`); `components/nav/` ja
  cai em `"components/**/*.tsx"`; `app/dashboard/page.tsx` **nao** esta em
  `coverage.include` hoje (so `app/bancos/**/*.tsx`, `app/layout.tsx`,
  `app/page.tsx` estao) - segue o padrao ja estabelecido nas tasks
  anteriores (TASK-007/009/010/011), fora do escopo desta task corrigir.

### Arquivos criados

- `tests/unit/lib/format.test.ts`

### Arquivos alterados

- `tests/unit/app/dashboard-page.test.tsx` - assercoes de receita/despesa/
  saldo/categoria atualizadas para esperar o valor FORMATADO em R$ (mudanca
  de comportamento DELIBERADA, documentada no docblock do proprio arquivo);
  4 novos testes de barras proporcionais (Criterio P3); nenhum teste de
  selecao de mes/transferencias-excluidas foi tocado.
- `tests/unit/components/main-nav.test.tsx` - 2 novos testes de
  `data-active` (Criterio P4); nenhum teste existente (links, `aria-current`,
  console) foi alterado.

### Comandos para rodar

```bash
npm run db:up

# So os arquivos desta parte
npm test -- tests/unit/lib/format.test.ts tests/unit/app/dashboard-page.test.tsx tests/unit/components/main-nav.test.tsx

# Suite inteira (confirma ausencia de regressao nos testes pre-existentes,
# incluindo TODOS os testes de lib/dashboard.ts e lib/transactions.ts -
# Criterio de aceite P6, intocados)
npm test

npm run test:coverage
```

### Mapeamento critério de aceite → teste

| # | Critério de aceite | Arquivo | Teste |
|---|---|---|---|
| P1 | `formatBRL` formata positivo em R$ pt-BR | `tests/unit/lib/format.test.ts` | `lib/format.ts - formatBRL... > formata um valor positivo com separador de milhar '.' e decimal ',' e o prefixo 'R$'` |
| P1 | `formatBRL` formata negativo (sinal antes de "R$") | `tests/unit/lib/format.test.ts` | `... > formata um valor negativo com o sinal '-' ANTES de 'R$' (nao 'R$ -')` |
| P1 | `formatBRL` formata zero | `tests/unit/lib/format.test.ts` | `... > formata zero como 'R$ 0,00' (sem sinal)` |
| P1 | `formatBRL` usa separador de milhar | `tests/unit/lib/format.test.ts` | `... > formata um valor com milhar exato ('1500.00') com o separador de milhar` |
| P1 | (idem, funcao pura/sem efeito colateral) | `tests/unit/lib/format.test.ts` | `... > e uma funcao pura: chamar duas vezes com a mesma entrada devolve o mesmo resultado (sem estado/efeito colateral)` |
| P2 | Receita/despesa exibidas formatadas em R$, nao mais cruas | `tests/unit/app/dashboard-page.test.tsx` | `...resumo do mes... (Criterio de aceite P2...) > exibe receita e despesa FORMATADAS em R$ (nao mais o valor cru do Decimal)` |
| P2 | Saldo positivo formatado em R$ com sinal `+` explicito | `tests/unit/app/dashboard-page.test.tsx` | `... > saldo POSITIVO e exibido com o sinal '+' EXPLICITO e formatado em R$ ('+R$ 561,17')` |
| P2 | Saldo negativo formatado em R$, sinal antes de "R$", sem duplicar | `tests/unit/app/dashboard-page.test.tsx` | `... > saldo NEGATIVO e exibido formatado em R$, com o '-' ANTES de 'R$' (sem duplicar nem virar '+-R$')` |
| P2 | Saldo zero formatado, sem sinal duplicado | `tests/unit/app/dashboard-page.test.tsx` | `... > saldo ZERO nao lanca, nao mostra dois sinais e aparece formatado em R$ ('+R$ 0,00')` |
| P2 | (idem, `data-testid` mantidos como ancora de regressao) | `tests/unit/app/dashboard-page.test.tsx` | Os 4 testes acima usam `getByTestId("dashboard-receita"/"dashboard-despesa"/"dashboard-saldo")` - os mesmos `data-testid` da Parte 1/TASK-010 |
| P2 | Total por categoria formatado em R$ | `tests/unit/app/dashboard-page.test.tsx` | `...gastos por categoria... > renderiza uma linha por categoria de porCategoria, NA MESMA ORDEM recebida..., com o total FORMATADO em R$` |
| P2 | (ajuste de consistencia pos-aprovacao) total de transferencias excluidas formatado em R$, nao mais cru | `tests/unit/app/dashboard-page.test.tsx` | `...transferencias excluidas... > exibe a CONTAGEM e o TOTAL de transferencias excluidas, visiveis na tela` |
| P2 | (idem, caso zero transferencias) | `tests/unit/app/dashboard-page.test.tsx` | `... > com ZERO transferencias excluidas, mostra contagem 0 e total formatado 'R$ 0,00' (nao esconde a linha)` |
| P3 | Categoria de maior valor com barra em 100%; demais proporcionais | `tests/unit/app/dashboard-page.test.tsx` | `...barras proporcionais... (Criterio de aceite P3...) > a categoria de MAIOR valor tem a barra em 100% de largura; as demais, proporcionais (100/50/25 -> 100%/50%/25%)` |
| P3 | Proporcao real, nao ranking/posicao (poder de deteccao contra impl falsa) | `tests/unit/app/dashboard-page.test.tsx` | `... > prova a PROPORCAO real (nao apenas o ranking/posicao): 100/90/10 gera 100%/90%/10%, distinguindo de um calculo por posicao (que daria ~100%/66%/33%)` |
| P3 | Borda: categoria unica ocupa 100% | `tests/unit/app/dashboard-page.test.tsx` | `... > com UMA UNICA categoria, a barra ocupa 100% mesmo sozinha (maior valor do conjunto e ela mesma)` |
| P3 | Borda: valor zero gera barra 0%, sem NaN/Infinity | `tests/unit/app/dashboard-page.test.tsx` | `... > categoria com valor ZERO ao lado de outra com valor positivo gera barra de 0% (sem NaN/Infinity)` |
| P4 | Link ativo com destaque visual estruturado (`data-active`), alem do `aria-current` ja existente | `tests/unit/components/main-nav.test.tsx` | `MainNav - destaque visual do link ativo via data-active (Criterio de aceite P4...) > em /bancos, SOMENTE o link 'Bancos' recebe data-active='true' (alem do aria-current ja existente)` |
| P4 | (idem, troca de rota move o destaque, nao fica "preso") | `tests/unit/components/main-nav.test.tsx` | `... > trocar a rota move o data-active='true' de um link para outro (nao fica um segundo link 'preso' ativo)` |
| P5 | Base visual do layout (container `max-width`/padding) | Nao coberto por teste automatizado dedicado (ver "O que NAO esta coberto" acima) - verificacao manual/`npm run build` + suites de pagina existentes como rede indireta |
| P6 | Nenhuma mudanca em `lib/dashboard.ts`/`lib/transactions.ts`/qualquer teste de logica | (nao e um teste, e uma restricao) | `tests/unit/lib/dashboard.test.ts`, `tests/unit/lib/transactions.test.ts` e TODOS os demais testes de `lib/` **nao foram tocados nesta task** - confirmado rodando a suite inteira (ver evidencia abaixo): 0 arquivos de `lib/` aparecem entre os 3 arquivos que falham |
| P7 | Nenhum Client Component importa `lib/db`; nenhum `console.*`; suite verde; build/lint limpos | Checagem final do coder (fora do escopo de um teste individual) - `console.*` do nav ja coberto pelo teste existente da Parte 1 (`nao chama console.log/warn/error ao renderizar`); `formatBRL` nao faz I/O nem loga |

### Evidência de RED (rodado nesta sessão)

Só os 3 arquivos desta parte:

```
$ npm test -- tests/unit/lib/format.test.ts tests/unit/app/dashboard-page.test.tsx tests/unit/components/main-nav.test.tsx
...
 ❯ tests/unit/app/dashboard-page.test.tsx (17 tests | 9 failed)
 ❯ tests/unit/components/main-nav.test.tsx (7 tests | 2 failed)
 ❯ tests/unit/lib/format.test.ts (5 tests | 5 failed)

 Test Files  3 failed (3)
      Tests  16 failed | 13 passed (29)
```

Os 16 testes que falham, e o motivo de cada falha (nenhum e erro de
sintaxe/import quebrado no teste em si - todos sao comportamento ainda nao
implementado):

- `tests/unit/lib/format.test.ts` (5/5 falham): `Error: Cannot find package
  '@/lib/format' imported from ...` - `lib/format.ts` ainda nao existe.
- `tests/unit/app/dashboard-page.test.tsx` (9/9 falham, as pretendidas):
  - As 4 assercoes de receita/despesa/saldo falham com
    `AssertionError: expected element to have text content "R$ 1.500,00" ...
    Received: "1500.00"` (e variantes para saldo `+R$ 561,17`/`-R$ 200,00`/
    `+R$ 0,00`) - a pagina ainda exibe o valor cru.
  - A assercao de total por categoria formatado falha com
    `TestingLibraryElementError: Unable to find an element with the text:
    /R\$\s*800,00/` - o `<span>` ainda mostra `800.00` (cru, sem "R$").
  - As 4 dos testes de barra falham com `TestingLibraryElementError: Unable
    to find an element by: [data-testid="category-bar-0"]` - o elemento da
    barra ainda nao existe.
- `tests/unit/components/main-nav.test.tsx` (2/2 falham, as pretendidas):
  falham com `AssertionError: expected <a ...> to have attribute
  "data-active"` - o atributo ainda nao e setado.

Suíte inteira, mesma sessão (confirma ausência de regressão nos 814 testes
pré-existentes da Parte 1, e em especial nos testes de `lib/` - Critério
P6):

```
$ npm run db:up && npm test
...
 Test Files  3 failed | 59 passed (62)
      Tests  16 failed | 809 passed (825)
```

814 (base pré-existente, pós Parte 1) − 5 (testes de `dashboard-page.test.tsx`
que existiam e foram deliberadamente re-propositados para esperar valor
formatado: receita/despesa, saldo positivo/negativo/zero, total por
categoria — na verdade 5 assercoes reaproveitadas, ver diff) + 11 (novos:
5 em `format.test.ts` + 4 barras + 2 `data-active`) = 825 no total, com
16 vermelhos (os 11 novos + os pré-existentes re-propositados que ainda
esperam o comportamento antigo) e 809 verdes. Os únicos 3 arquivos vermelhos
são exatamente os 3 tocados nesta parte; os 59 arquivos restantes (incluindo
`tests/unit/lib/dashboard.test.ts`, `tests/unit/lib/transactions.test.ts` e
toda a suíte de integração) permanecem 100% verdes, sem edição — Critério
P6 confirmado.

### Ajuste pós-aprovação: `dashboard-transferencias-total` também formatado (pedido do orquestrador)

Depois da Parte 2 aprovada, o orquestrador pediu consistência: o único valor
que ainda ficava cru na tela (`dashboard-transferencias-total`) passou a
esperar `formatBRL(...)` também, igual ao resto da página. Alterados os dois
testes que liam esse `data-testid` em
`tests/unit/app/dashboard-page.test.tsx` (secao "transferencias excluidas,
transparencia") - de `toHaveTextContent("4800.00")`/`"0.00"` para
`toHaveTextContent("R$ 4.800,00")`/`"R$ 0,00"` (mais uma asserção negativa
`not.toContain("4800.00")` provando que o valor cru some do texto).

RED capturado, isolado (antes do ajuste de produção alcançar esse ponto):

```
$ npm test -- tests/unit/app/dashboard-page.test.tsx
 ❯ ...transferencias excluidas... > exibe a CONTAGEM e o TOTAL de transferencias excluidas, visiveis na tela
Error: expect(element).toHaveTextContent()
Expected element to have text content: R$ 4.800,00
Received: 4800.00

 ❯ ...transferencias excluidas... > com ZERO transferencias excluidas, mostra contagem 0 e total formatado 'R$ 0,00' (nao esconde a linha)
Error: expect(element).toHaveTextContent()
Expected element to have text content: R$ 0,00
Received: 0.00

 Test Files  1 failed (1)
      Tests  2 failed | 15 passed (17)
```

Falha pelo motivo certo (valor cru vs valor formatado esperado), sem tocar
em produção nem em lógica - só a asserção. **Nota de concorrência:** o coder
estava implementando este mesmo ajuste em paralelo nesta sessão; ao
reconfirmar logo em seguida, o teste já estava GREEN (produção alcançou o
teste). Reconfirmado isolado, sem dependência de Postgres (a página é
testada com `getMonthlySummary` mockada):

```
$ npm test -- tests/unit/lib/format.test.ts tests/unit/app/dashboard-page.test.tsx tests/unit/components/main-nav.test.tsx
 Test Files  3 passed (3)
      Tests  29 passed (29)
```

**Nota de infraestrutura (não é regressão desta mudança):** rodar `npm test`
(suíte inteira, que inclui os testes de integração contra o Postgres real
`gestor_test`) nesta janela produziu contagens de falha instáveis e
inconsistentes entre execuções (de 16 a 107 testes vermelhos, sempre em
`tests/integration/**`, nunca nos 3 arquivos desta task). Investigado com
`ps aux`: havia MÚLTIPLOS processos `npm test`/`vitest run` de OUTRA sessão
(provavelmente o coder verificando GREEN repetidamente) rodando ao mesmo
tempo que os meus, todos batendo no MESMO banco `gestor_test` compartilhado
- `fileParallelism: false` só serializa testes dentro de um único processo
Vitest, não entre processos `npm test` distintos rodados por agentes
diferentes ao mesmo tempo. Confirmei a causa: quando não havia nenhum outro
processo `vitest`/`npm test` ativo (`ps aux` limpo), os 3 arquivos desta
task continuaram 100% verdes e isolados (evidência acima) - a instabilidade
fica contida à suíte de integração e é de concorrência entre agentes, não
um efeito dos testes desta parte. Recomendação para quem for validar a
suíte inteira: garantir que nenhum outro processo esteja rodando `npm
test`/`vitest` contra `gestor_test` ao mesmo tempo (checar com `ps aux |
grep vitest` antes).

## P2.5 Implementação (preenchido pelo coder)

Arquivos criados:
- `lib/format.ts` — `formatBRL(decimalString: string): string`, helper puro
  (`Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`).
  Sem I/O, sem estado; seguro para uso em Client Component (não toca
  `lib/db`).

Arquivos alterados (só apresentação, nenhuma lógica):
- `app/dashboard/page.tsx`:
  - `formatSignedAmount` passa a delegar em `formatBRL` (negativo: `formatBRL(amount)`
    diretamente, já que o Intl coloca o `-` antes de `R$`; positivo/zero:
    `"+" + formatBRL(amount)`).
  - `dashboard-receita`/`dashboard-despesa` exibem `formatBRL(summary.receita)`/
    `formatBRL(summary.despesa)`.
  - `dashboard-transferencias-count`/`dashboard-transferencias-total` mantidos
    com valor cru (fora do escopo P2/P3), intocados.
  - Cada `category-row-<n>` exibe `formatBRL(item.total)` e ganha um elemento
    irmão `data-testid="category-bar-<n>"` com `style={{ width: '<pct>%' }}`,
    onde `pct = (Number(item.total) / maxTotal) * 100` e `maxTotal =
    Math.max(...summary.porCategoria.map(i => Number(i.total)))` calculado
    por renderização (não hardcoded). Guard `maxTotal <= 0` retorna 0% (evita
    NaN/Infinity quando todos os totais são zero ou a lista é vazia).
  - Resumo do mês vira 3 cards (`grid sm:grid-cols-3`); saldo ganha cor por
    sinal (`text-emerald-600`/`text-red-600`/`text-slate-700` para zero) —
    só a classe CSS, sem teste dedicado (documentado pelo qa em P2.4 como
    não coberto).
  - Gastos por categoria: cada linha vira `<li>` com nome + valor formatado
    em cima e uma barra (`div` com `bg-slate-100` de fundo + `div` interno
    `bg-sky-500` com a largura proporcional) embaixo.
  - Cards/seções com `rounded-lg border` + padding; formulário de mês com
    label/input/botão estilizados. Nenhum `data-testid` removido ou
    renomeado; nenhuma mudança na busca de dados, no schema Zod ou na
    chamada a `getMonthlySummary`.
- `components/nav/MainNav.tsx`:
  - Link ativo ganha `data-active="true"` (além do `aria-current="page"` já
    existente); os outros 5 não recebem o atributo (`undefined`, não
    `"false"` — consistente com a convenção já usada para `aria-current`).
  - `<nav>` vira barra de topo (`border-b`, `bg-white`); `<ul>` com
    `flex flex-wrap gap-* px-4 py-3` centralizada em `max-w-5xl`; link ativo
    com fundo escuro/texto branco, inativo com hover sutil — só classes
    Tailwind, sem novo import.
- `app/layout.tsx`:
  - `<body>` ganha `bg-slate-50`; `{children}` passa a ser envolvido por
    `<div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">` — container
    centralizado com largura máxima e padding para as 6 telas (Critério P5).
    Não toquei `app/globals.css` — o container inteiro é resolvido no
    layout, sem precisar de classe utilitária customizada global.

Decisões:
- Segui o contrato do qa (seção P2.4) sem desvio nas partes com contrato de
  teste explícito (`formatBRL`, `formatSignedAmount`, `category-bar-<n>`,
  `data-active`).
- Nas partes sem contrato de teste dedicado (cores, espaçamento, classes
  Tailwind específicas do card/nav/container — documentado pelo qa como "não
  coberto"), usei um Tailwind neutro e convencional (slate/emerald/red/sky),
  sem inventar tokens de design fora do que o Tailwind v4 padrão já
  disponibiliza via `@import "tailwindcss"`.
- `barWidthPercent` (helper local, não exportado, vive só em
  `app/dashboard/page.tsx`) faz `Number(total) / maxTotal * 100`, com guard
  `maxTotal <= 0 → 0` para não gerar `NaN`/`Infinity` quando a lista é vazia
  ou todos os totais são `"0.00"` — cenário exercido pelo teste "categoria
  com valor ZERO ao lado de outra com valor positivo".
- `lib/dashboard.ts` e `lib/transactions.ts` não foram tocados (confirmado
  via `git diff --stat` vazio para ambos) — Critério P6.

Dívidas técnicas assumidas: nenhuma nova além das já registradas na Parte 1
(seção 7) e das lacunas de cobertura já documentadas pelo qa em P2.4 (cor
exata do saldo, container do layout, espaçamento do nav — sem teste
automatizado dedicado por decisão deliberada, ver P2.4).

Verificação:
- `npm test -- tests/unit/lib/format.test.ts tests/unit/app/dashboard-page.test.tsx tests/unit/components/main-nav.test.tsx tests/unit/app/layout.test.tsx`
  → 4 arquivos, 33/33 verdes.
- `npm test` (suíte inteira) → 62 arquivos, 825/825 verdes (os 809
  pré-existentes + os 16 que estavam RED nesta parte, agora GREEN; nenhuma
  regressão, `lib/dashboard.test.ts`/`lib/transactions.test.ts` intocados e
  verdes).
- `npm run build` → limpo (`Compiled successfully`, TypeScript ok, `/dashboard`
  gerado como rota dinâmica `ƒ`, sem erro; nenhum vazamento de `pg`/`lib/db`
  no bundle client).
- `npm run lint` → 0 erros (3 warnings pré-existentes não relacionados: 2 em
  `coverage/` gerado, 1 `_url` não usado em `tests/unit/app/page-redirect.test.ts`,
  nenhum tocado por esta task).
- `grep -n "console\." lib/format.ts app/dashboard/page.tsx components/nav/MainNav.tsx app/layout.tsx`
  → nenhuma ocorrência.
- `grep -n ": any\|<any>"` nos mesmos arquivos → nenhuma ocorrência.

## P2.6 Revisão (preenchido pelo code-reviewer)

**Veredito: APROVADO** (verificado pelo orquestrador: 825/825, build limpo, dashboard real
renderiza cards + barras proporcionais + moeda R$).

- **Lógica intocada (P6):** `git diff` de `lib/dashboard.ts`/`lib/transactions.ts` vazio. A única
  adição em `lib/` é o novo `lib/format.ts` (puro).
- **`formatBRL`:** puro, sem I/O; negativo `-R$ 1.806,01`, zero `R$ 0,00`; NBSP tratado no teste.
- **Barras:** largura `valor/maxValor*100`, com guarda `maxTotal <= 0 → 0` (mês sem gasto não quebra).
- **Sem vazamento de `lib/db`** no cliente; sem `console.*`; nenhum `data-testid` removido.
- **Ajuste pós-revisão (orquestrador):** o total de "transferências excluídas", que a revisão
  aceitaria como DT em número cru, foi formatado em R$ para consistência — não deixar número cru na
  tela que o usuário questionou. Asserção correspondente atualizada.
