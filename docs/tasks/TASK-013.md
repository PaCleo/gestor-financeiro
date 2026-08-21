# TASK-013 — Sistema de design Fintech Premium (todas as telas)
Status: CONCLUÍDA | Fase do roadmap: 6 (usabilidade)

## 0. Contexto e adaptação de processo (leia antes de tudo)

- Stack: **Next 16.2.10** + React 19, **Tailwind v4** (já montado em `app/globals.css` via
  `@import "tailwindcss"`), Vitest, Testing Library.
- **Esta task é APRESENTAÇÃO, não lógica nem comportamento.** Por isso **não há fase qa/RED**:
  inventar testes que falham para CSS produz asserções frágeis de classe (o anti-padrão do DT-025).
  O contrato desta task é **regressão**: os **825 testes existentes continuam verdes, sem edição** —
  nenhum `data-testid`, `aria-current`, valor formatado (`formatBRL`) ou link/rota pode sumir ou
  mudar de semântica. A qualidade visual é verificada pelo orquestrador contra o mockup e pelo usuário.
- **A especificação visual é o mockup aprovado pelo usuário:** `docs/design/mockup-fintech-premium.html`.
  Abra e siga: paleta, espaçamento, cantos, tipografia, os componentes (cards, KPIs, barras, chips,
  pills, tabela). É a fonte da verdade do visual.
- **Armadilha recorrente:** Client Component não importa `lib/db` (arrasta `pg` → build quebra).
  Rode `npm run build` antes de reportar pronto.

## 1. Objetivo

Aplicar a identidade **Fintech Premium** (escura) do mockup aprovado a **todas as 6 telas** + nav,
de forma coerente, sem tocar em nenhuma lógica. O app deixa de parecer HTML cru e ganha um sistema
de design consistente.

## 2. O sistema de design (extraído do mockup)

### Tokens (definir em `app/globals.css`, dark-only — commit deliberado a um mundo escuro)
```
--ground   #0B0F17   fundo         --surface   #141A24  cards
--ground-2 #0E141E                 --surface-2 #171F2B   card (topo do gradiente)
--line     #222B39   bordas        --line-soft rgba(255,255,255,.055)
--text     #E6EAF2   primário      --text-2 #9AA6B8  secundário   --text-3 #5D6982  apagado
--accent   #6366F1   indigo        --accent-bright #818CF8       --accent-dim rgba(99,102,241,.14)
--pos      #34D399   entrada       --neg #FB7185  saída           --warn #FBBF24
--radius 16px  --radius-sm 10px
número: fonte monoespaçada + tabular-nums (o mockup usa isso nos valores)
fundo: glow radial indigo bem fraco no topo (não competir com dados)
```
Como o app hoje tem tema claro/escuro do scaffold em `globals.css`: **substituir por dark-only**,
pintando `body` explicitamente com `--ground` (não depender de `prefers-color-scheme`).

### Componentes (reutilizáveis — o segredo da coerência)
Crie primitivos compartilhados (classes `@layer components` no globals.css, ou componentes React em
`components/ui/`) e use-os em todas as telas, para nenhuma tela ficar bespoke:
- **Card** (gradiente sutil, borda, sombra), **card-head** (título + eyebrow)
- **KPI card** (label com dot colorido, valor grande mono, sub/tendência)
- **Barra de categoria** (track + fill com gradiente indigo e glow)
- **Chip** de categoria (indigo) e **chip muted**
- **Pill** de status (Compensado/emerald, Pendente/warn, Manual/neutro)
- **Tabela** (header uppercase apagado, linhas com borda soft, `overflow-x:auto`)
- **Controles de formulário** (input/select/button no tom escuro, foco visível com anel indigo)
- **Nav** (marca com o "mark", link ativo como pílula indigo — já tem `aria-current`/`data-active`)

## 3. Escopo — as 6 telas + nav

Aplicar o sistema, **preservando toda a estrutura e os `data-testid`/`aria` existentes**:
1. **Nav** (`components/nav/MainNav.tsx`) — marca + pílula ativa, como no mockup
2. **Dashboard** (`app/dashboard/page.tsx`) — o mais próximo do mockup: KPIs, barras, transferências
3. **Transações** (`app/transacoes/page.tsx`) — tabela estilizada, chips, pills de status, filtros
4. **Faturas** (`app/faturas/page.tsx`) — cards de fatura (atual em destaque + histórico)
5. **Lançamentos** (`app/lancamentos/page.tsx`) — formulário e lista no tom escuro
6. **Bancos** (`app/bancos/page.tsx`) — cards de banco com estado
7. **Categorias** (`app/categorias/page.tsx`) — formulário e lista de regras

## 4. Critérios de aceite

- [ ] 1. Tokens do sistema em `app/globals.css` (dark-only, `body` pintado explícito com `--ground`)
- [ ] 2. Primitivos reutilizáveis (card, kpi, barra, chip, pill, tabela, form, nav) — usados
      consistentemente nas 6 telas (nada de cada tela inventar seu estilo)
- [ ] 3. Fidelidade ao mockup: paleta, tipografia (números mono/tabular), cards, barras com
      gradiente, chips e pills conforme `docs/design/mockup-fintech-premium.html`
- [ ] 4. **Regressão zero:** os 825 testes existentes verdes **sem edição**; nenhum `data-testid`,
      `aria-current`, `data-active` ou valor `formatBRL` removido/alterado
- [ ] 5. Nenhum Client Component importa `lib/db`; nenhum `console.*`
- [ ] 6. Acessibilidade mínima: contraste legível (texto sobre `--ground`/`--surface`), **foco
      visível** (anel indigo) em links/inputs/botões, `<nav>` landmark, `prefers-reduced-motion`
      respeitado se houver animação
- [ ] 7. Responsivo: os grids (KPIs, colunas) colapsam em 1 coluna no mobile; nenhuma rolagem
      horizontal do body (tabelas rolam no próprio container)
- [ ] 8. `npm run build` e `npm run lint` limpos; suíte inteira verde

## 5. Fora de escopo

- Mudança de qualquer lógica (`lib/**`), endpoints ou dados — **só apresentação**
- Novas funcionalidades (gráficos de linha, temas claro/escuro toggláveis, etc.)
- Menu mobile hambúrguer elaborado (o nav pode quebrar em wrap simples, como já faz)
- Refação dos testes de lógica

## 6. Implementação (preenchido pelo coder)

### Arquivos alterados

- `app/globals.css` — reescrito: tokens Fintech Premium (`--ground`, `--surface`,
  `--accent`, `--pos`/`--neg`/`--warn`, `--radius` etc.) extraídos 1:1 de
  `docs/design/mockup-fintech-premium.html`; tema claro/escuro do scaffold
  removido (`prefers-color-scheme` fora); `body` pintado explicitamente com
  `--ground` + glow radial indigo/verde bem fraco no topo; primitivos
  reutilizáveis em `@layer components` (`.card`, `.card-head`, `.card-title`,
  `.kpi-*`, `.cat-row`/`.track`/`.fill`, `.chip`/`.chip-muted`,
  `.pill`/`.pill-posted`/`.pill-pending`/`.pill-danger`/`.pill-neutral`,
  `.data-table`/`.table-wrap`, `.field-label`/`.field-input`/`.field-select`,
  `.btn-primary`/`.btn-secondary`/`.btn-danger`, `.app-nav`/`.app-nav-link`/
  `.brand-mark`, `.page-shell`/`.page-head`/`.eyebrow`, `.num` com fonte
  monoespaçada + `tabular-nums`); foco visível global (`:focus-visible` com
  anel indigo) em `a`/`button`/`input`/`select`; `prefers-reduced-motion`
  respeitado (a única animação — transição de largura da barra `.fill` — só
  roda em `no-preference`).
- `app/layout.tsx` — troca `bg-slate-50` (scaffold claro) por nada (o `body`
  já é pintado por `globals.css`); o wrapper de conteúdo passa a usar
  `.page-shell` (max-width 1160px, mesmo do mockup) no lugar do
  `max-w-5xl` do Tailwind.
- `components/nav/MainNav.tsx` — marca "Gestor" com `.brand-mark` (gradiente
  indigo) + links com `.app-nav-link`/`[data-active="true"]` como pílula
  ativa. `aria-current="page"`/`data-active="true"` do link ativo mantidos
  bit a bit (contrato de `main-nav.test.tsx`).
- `app/dashboard/page.tsx` — KPIs em `.card`/`.kpi-*` (Receita/Despesa/Saldo
  com dot colorido), `Gastos por categoria` como `.cat-row` (nome | barra
  com gradiente+glow `.track`/`.fill` | valor), `Transferências excluídas`
  em `.card`. Todos os `data-testid` e o texto formatado por `formatBRL`
  mantidos idênticos.
- `app/transacoes/page.tsx` — filtro num `.card`, tabela em
  `.table-wrap`/`.data-table`, categoria como `.chip`/`.chip-muted`
  ("Sem categoria" no lugar de "-" quando `category` é `null` — texto novo,
  mas o teste só proíbe "null"/"undefined" literais), status como
  `.pill-pending`("Pendente")/`.pill-posted`("Compensado" — texto novo para
  POSTED, não exigido nem proibido por nenhum teste). Paginação como
  `.btn-secondary`. `data-testid`/`data-status` das linhas mantidos.
- `app/faturas/page.tsx` — cada cartão em `.card`, fatura atual com
  `.bill-amount`/`.bill-meta-label`/`.bill-meta-value`, histórico com
  `.divider`. Ver decisão "faturas sem `formatBRL`" abaixo.
- `app/lancamentos/page.tsx` — `<AddEntryForm>` dentro de `.card`; cada
  lançamento manual vira um `.card` na lista (o conteúdo interno é mockado
  por completo no teste desta página, então o wrapper pôde mudar livre).
- `app/bancos/page.tsx` — `<ConnectBankButton>` dentro de `.card`; cada banco
  vira um `.card` com o `state` como `.pill` colorida por
  `statePillClass(state)` (OK→posted/verde, PRECISA_ACAO→pending/âmbar,
  ERRO→danger/vermelho, demais→neutral) — só a COR muda, o TEXTO do `state`
  continua o valor cru do enum (`getByText("OK")` etc. no teste).
- `app/categorias/page.tsx` — cada regra vira um `.card`, categoria como
  `.chip`. Rótulo/categoria continuam elementos `<span>` distintos (o teste
  faz `getByText` separado em cada um).
- `components/bank-items/ConnectBankButton.tsx`,
  `components/bank-items/DeactivateBankButton.tsx`,
  `components/category-rules/AddCategoryRuleForm.tsx`,
  `components/category-rules/DeleteCategoryRuleButton.tsx`,
  `components/entries/AddEntryForm.tsx`,
  `components/entries/EditEntryForm.tsx`,
  `components/entries/DeleteEntryButton.tsx` — botões/inputs/selects
  ganharam `.btn-primary`/`.btn-secondary`/`.btn-danger`/`.field-input`/
  `.field-select`/`.field-label`; mensagens de erro em `text-[var(--neg)]`,
  sucesso em `text-[var(--pos)]`, "carregando" em `.hint-text`. Nenhum
  `id`/`htmlFor`/texto de rótulo/nome acessível de botão foi alterado.

### Decisões tomadas

1. **Faturas e Transações NÃO usam `formatBRL`.** O mockup mostra os valores
   formatados em R$, mas `tests/unit/app/faturas-page.test.tsx` faz
   `current.textContent.toContain("3408.84")`/`toContain("511.32")` e
   `tests/unit/app/transacoes-page.test.tsx` faz `toContain("-45")`/
   `toContain("+230")` — ambos contra a string CRUA do Decimal.
   `formatBRL("3408.84")` produz `"R$ 3.408,84"` (ponto de milhar), que não
   contém a substring `"3408.84"`; `formatBRL("-45.90")` produz
   `"-R$ 45,90"`, que não contém `"-45"`. Aplicar `formatBRL` aqui quebraria
   a suíte (regra invíolável #2/#4 da task > fidelidade estética ao
   mockup). Como meio-termo, adicionei o prefixo estático `"R$ "` antes do
   número cru em Faturas (não muda a lógica, só concatena um literal) para
   aproximar visualmente sem tocar o formato do número. Em Transações, o
   valor manteve exatamente `formatSignedAmount` (sinal + string crua) —
   nenhum prefixo, para não arriscar `"+R$ 230"` colidir com alguma
   asserção futura; ficou como número monoespaçado colorido (verde/vermelho
   por sinal).
2. **Status "Compensado"/"Sem categoria" em Transações** são textos novos
   (não exigidos pelos testes, mas também não proibidos) para dar
   completude visual ao padrão pill/chip do mockup — só aparecem no lugar
   onde antes havia `null`/nada.
3. **`.page-shell` com 1160px** (em vez do `max-w-5xl`/1024px do scaffold)
   para bater com o `max-width` do `.wrap` do mockup aprovado.
4. **Sem month-pill/avatar no nav real** — o mockup mostra também um
   seletor de mês e avatar no canto direito do nav, mas isso pertenceria a
   uma feature nova (seleção de mês global, perfil de usuário) fora do
   escopo desta task (`Fora de escopo: novas funcionalidades`); o filtro de
   mês já existe, só que embutido na página do Dashboard (Critério de
   aceite #7 da TASK-010, não tocado).
5. **`BankItem`/tipo local em `app/bancos/page.tsx`** — `lib/bank-item.ts`
   não exporta um tipo nomeado para o item de `listActiveBankItems()`; para
   não mexer em `lib/`, usei `Awaited<ReturnType<typeof listActiveBankItems>>[number]`
   localmente na página (só tipo, zero lógica).

### Dívidas assumidas

- Faturas/Transações ficam com números em formato "cru" (ponto decimal, sem
  separador de milhar) em vez do R$ pt-BR do resto do app — inconsistência
  visual pontual, documentada acima, forçada pelo contrato de teste
  existente. Se o orquestrador quiser esse valor formatado de fato, os
  testes correspondentes (`faturas-page.test.tsx`,
  `transacoes-page.test.tsx`) precisam ser reescritos primeiro (fora do
  escopo desta task, que proíbe editar teste).
- Não adicionei gráficos, seletor de mês global no nav nem avatar — fora de
  escopo explícito (seção 5 do TASK-013.md).
- Não gerei screenshot via ferramenta de browser (Playwright não está
  instalado no projeto); validei via `curl` que as 6 rotas respondem 200
  sem marcador de erro (`__next_error__`/"Internal Server Error"/`digest`)
  e inspecionei o HTML renderizado em busca das classes esperadas
  (`.card`, `.kpi-value` etc.). Verificação visual pixel-a-pixel fica a
  cargo do orquestrador/usuário, como já previsto na seção 0 da task.

### Ajuste posterior (rodada 2) — R$ em Faturas e Transações

O qa atualizou `tests/unit/app/transacoes-page.test.tsx` e
`tests/unit/app/faturas-page.test.tsx` para exigir `formatBRL` (fechando a
inconsistência apontada na "dívida assumida" acima — a suíte inteira agora
espera moeda formatada em todas as telas, não só no Dashboard). Ajustei:

- `app/transacoes/page.tsx` — `formatSignedAmount` passou a combinar o sinal
  explícito com `formatBRL` (mesmo contrato de `app/dashboard/page.tsx`:
  `amount.startsWith("-") ? formatBRL(amount) : "+" + formatBRL(amount)`,
  já que `formatBRL` sozinho já antepõe o "-" a "R$" quando negativo). A
  cor da célula (`.text-[var(--pos)]`/`.text-[var(--neg)]`) continua
  calculada a partir do sinal do valor CRU (`transaction.amount.startsWith("-")`),
  antes da formatação — não muda de comportamento.
- `app/faturas/page.tsx` — `bill.totalAmount` (fatura atual e histórico) e
  `minimumPaymentAmount` passam por `formatBRL` de verdade; removi o
  prefixo estático `"R$ "` que eu tinha concatenado ao valor cru na rodada
  anterior. `formatDate` (a data de vencimento) não mudou — continua
  "YYYY-MM-DD", que é o que o teste espera literalmente.
- Nenhum `data-testid` foi tocado; nenhuma lógica de `lib/transactions.ts`/
  `lib/bills.ts` foi tocada — só a apresentação (mesmo espírito da task
  inteira).

Suíte completa (`npm test`): 62 arquivos / 825 testes, todos verdes.
`npm run build`: compila limpo, 19 rotas geradas (nenhum Client Component
importando `lib/db`). `npm run lint`: 0 erros (as mesmas 3 warnings
pré-existentes de `coverage/` e de um teste não tocado por esta task).

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO

Revisão feita sobre o working tree (TASK-013 não commitada) vs. `main`.
Suíte rodada pelo próprio reviewer: **62 arquivos / 825 testes, todos verdes**
(`npm test`, ~47s). `git diff -- lib/` **vazio**. Nenhum Client Component
importa `lib/db` (o único match em `MainNav.tsx` é menção em comentário, não
import). Nenhum `console.*` residual (todos os matches são comentários
documentando a ausência). Foco visível (anel `--accent-bright`) global em
`a`/`button`/`input`/`select`; `prefers-reduced-motion` respeitado (única
animação, `.fill` width, gated em `no-preference`); `<nav>` landmark com
`aria-label`. Primitivos (`.card`/`.chip`/`.pill`/`.data-table`/`.kpi-*`/
`.field-*`/`.btn-*`) reutilizados nas 6 telas; `.table-wrap` tem
`overflow-x:auto` (tabela rola no container, não no body).

### Regressão / poder de detecção (critério #1) — OK

- **Nav:** `aria-current="page"`/`data-active="true"` preservados bit a bit;
  o destaque ativo migrou 100% para CSS (`[data-active="true"]`), mas o
  atributo continua emitido pelo mesmo ramo condicional. `main-nav.test.tsx`
  mantém detecção real: assere `data-active`/`aria-current` no link ativo E
  `not.toHaveAttribute` nos outros 5, e valida que troca de rota move o
  marcador. Pegaria se `data-active` sumisse.
- **Moeda:** as edições em `transacoes-page.test.tsx`/`faturas-page.test.tsx`
  **fortalecem** a suíte, não a enfraquecem — passaram a exigir a string
  formatada (`toHaveTextContent("-R$ 45,90")`, `"R$ 3.408,84")` E a provar a
  ausência do valor cru (`not.toContain("-45.90")`/`"3408.84"`). Pegariam
  tanto a remoção de `formatBRL` quanto um regresso ao Decimal cru. Mudança
  de apresentação deliberada e coerente com o Dashboard (TASK-012 P2).
- Nenhuma asserção foi trocada por match frágil de classe Tailwind (DT-025
  respeitado): os testes editados continuam ancorados em texto/atributo
  semântico, não em `className`.

### Corretude — OK

- Nenhuma lógica tocada: `git diff -- lib/` vazio; `data-testid`/`data-status`
  das linhas e `data-testid` de cards/current-bill/history-bill preservados.
- `formatBRL` (helper puro de `lib/format`) aplicado consistentemente em
  Transações e Faturas; sinal explícito preservado via `formatSignedAmount`
  (cor calculada do sinal do valor CRU, antes de formatar — sem mudança de
  comportamento). `formatDate` do vencimento inalterado ("YYYY-MM-DD").
- Escopo respeitado (sem gráficos, sem seletor de mês global, sem avatar).

### Problemas encontrados (bloqueantes)

Nenhum.

### Sugestões não-bloqueantes (viram DT)

1. **Contraste de `--text-3` (#5D6982) sobre `--ground` (#0B0F17) ≈ 3.5:1**
   — abaixo do WCAG AA 4.5:1 para texto normal. Em rótulos/eyebrow/headers de
   tabela (uppercase, decorativos/UI) está OK. O ponto de atenção é
   `.empty-text` e `.hint-text`: são mensagens de conteúdo (estados vazios,
   "carregando") em tamanho ~13px que, tecnicamente, ficam sub-AA. Não
   bloqueia (secundário, MVP), mas sugiro abrir **DT** para elevar esses dois
   para `--text-2` (#9AA6B8, ~AA) numa passada de a11y futura.
2. Textos novos "Compensado"/"Sem categoria" em Transações estão dentro do
   combinado (não exigidos nem proibidos por teste); só aparecem onde antes
   havia `null`/nada. Sem ação.
3. `.page-shell` a 1160px (vs. 1024 do scaffold) é intencional para bater com
   o mockup — coerente com o `max-w-[1160px]` do nav. Sem ação.

Nada aqui devolve a task ao coder. Fidelidade visual pixel-a-pixel fica com o
usuário/orquestrador na tela, conforme seção 0.
