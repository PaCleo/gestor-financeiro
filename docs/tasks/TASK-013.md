# TASK-013 — Sistema de design Fintech Premium (todas as telas)
Status: EM ANDAMENTO | Fase do roadmap: 6 (usabilidade)

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

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
