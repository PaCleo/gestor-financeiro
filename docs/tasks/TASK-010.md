# TASK-010 — Dashboard: gastos por categoria + resumo do mês (Fase 5)
Status: CONCLUÍDA | Fase do roadmap: 5

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16, Vitest,
  Testing Library. Posteriores ao seu treinamento — consulte a documentação instalada.
- Leia `docs/DEBITO-TECNICO.md` (**DT-018** é o coração desta task) e a seção 11 da PREMISSA.
- Padrões: erro de domínio com mensagem fixa; rota casca fina; `ApiResponse<T>`; frontend com
  jsdom opt-in + `cleanup()`; Zod nos params; reconstrução campo a campo (sem spread).
- **DT-004**: `vi.spyOn(prisma, ...)` é engolido pelo Proxy. Mocke módulos inteiros.
- Já existem: `lib/transactions.ts` (`resolveTransactionCategory` = `categoryOverride ?? categoryFromRule ?? category`),
  `Transaction` (com `amount` sinalizado, `category`, `source`, `status`, `date`).
- **Cuidado com fuso (mesmo trap da TASK-007):** o `date` é UTC. Defina os limites do mês de forma
  consistente e documente a convenção. Registrar como caveat se usar UTC puro.

## 1. Objetivo

Responder duas das três perguntas da Visão: **quanto gastei e com o quê** (gastos por categoria) e
o **resumo do mês** (receita, despesa, saldo) — com o DT-018 tratado, senão o número é absurdo.

## 2. O coração da task: DT-018 (exclusão de transferências)

Sondagem real: se somarmos todas as entradas positivas como receita, o número infla ~20× — R$44 mil
em vez dos R$2,3 mil de receita real. A categoria da Pluggy separa isso. **Regra:**

- Uma constante `TRANSFER_CATEGORIES` (documentada) lista as categorias de transferência/pagamento
  observadas nos dados reais: `"Transfers"`, `"Credit card payment"`, `"Same person transfer"`,
  `"Transfer - Cash"`. Transações cuja **categoria CRUA da Pluggy** (`category`, **não** a efetiva)
  está nesse conjunto são **transferências**.
- Transferências são **excluídas dos dois lados**: não entram na receita nem na despesa.
- O que sobra: despesa = soma dos negativos não-transferência; receita = soma dos positivos
  não-transferência.
- **Transparência (não sumir com dinheiro):** o resumo expõe o total e a contagem de transferências
  excluídas, para o usuário auditar.
- A exclusão usa a categoria **crua** de propósito: se o usuário recategorizar uma transferência via
  regra/override, ela **continua** sendo transferência para fins de total (a natureza não muda).

## 3. Comportamento esperado (TDD)

- DADO um mês QUANDO calculo o resumo ENTÃO recebo `{ despesa, receita, saldo, porCategoria[],
  transferenciasExcluidas: { count, total } }`
- DADO uma transação de categoria crua `"Transfers"` (ou outra do conjunto) QUANDO calculo
  ENTÃO ela **não** entra em receita nem em despesa, e conta em `transferenciasExcluidas`
- DADO uma transação `"Non-recurring income"` positiva QUANDO calculo ENTÃO entra na **receita**
- DADO gastos (negativos, não-transferência) QUANDO agrupo ENTÃO `porCategoria` soma por **categoria
  efetiva** (`resolveTransactionCategory`), decrescente por valor gasto
- DADO uma transferência recategorizada pelo usuário (override/regra) para "Mercado" QUANDO calculo
  ENTÃO ela **continua excluída** (a categoria crua ainda é de transferência)
- DADO lançamentos manuais no mês QUANDO calculo ENTÃO eles entram normalmente (não são transferência
  salvo se a categoria crua estiver no conjunto — manuais não têm categoria Pluggy, então nunca)
- DADO transações de outro mês QUANDO calculo o mês X ENTÃO só as de X entram
- DADO `saldo` QUANDO exibo ENTÃO é `receita − despesa` (despesa como valor positivo de saída)

## 4. Critérios de aceite

- [ ] 1. `lib/dashboard.ts` expõe `getMonthlySummary(month: "YYYY-MM")` retornando despesa, receita,
      saldo, `porCategoria[]` e `transferenciasExcluidas { count, total }`
- [ ] 2. `TRANSFER_CATEGORIES` constante documentada; a detecção usa a **categoria crua** (`category`)
- [ ] 3. **DT-018 provado:** teste com transferências (das categorias reais) + receita real + gastos,
      provando que transferências saem dos dois lados e a receita real entra. Sem esse teste, a task não fecha
- [ ] 4. `porCategoria` agrupa por **categoria efetiva** (`resolveTransactionCategory`), decrescente
- [ ] 5. Limites do mês consistentes e documentados (cuidado com fuso — caveat se UTC)
- [ ] 6. `GET /api/dashboard?month=YYYY-MM` casca fina, Zod (mês inválido → 400)
- [ ] 7. Página `/dashboard`: resumo do mês (receita/despesa/saldo), gastos por categoria, e a linha
      de transferências excluídas. Mês selecionável (default: mês corrente). Testing Library
- [ ] 8. Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 9. Nenhum `console.*` em produção
- [ ] 10. Suíte inteira verde (os anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 5. Fora de escopo

- **Fatura do cartão** ("quanto vai fechar") — é a TASK-011
- **"O que falta pagar"** — depende de contas fixas (Fase 4, que estamos pulando); esta task
  responde 2 das 3 perguntas
- Gráficos elaborados / biblioteca de charts (uma lista/barra simples basta no MVP)
- Configurar a lista `TRANSFER_CATEGORIES` pela UI (hardcoded documentado nesta task)
- Orçamento por categoria / metas (fora do MVP)

## 6. Testes (preenchido pelo qa)

### 6.1 Arquivos criados

- `tests/unit/lib/dashboard.test.ts` — testes puros (sem I/O, sem Prisma):
  `TRANSFER_CATEGORIES` (conteúdo exato), `monthQuerySchema` (validação Zod
  de `"YYYY-MM"`, 24 casos) e `getCurrentMonthUTC` (formatação e
  zero-padding, com `vi.setSystemTime`).
- `tests/integration/dashboard.integration.test.ts` — `getMonthlySummary`
  ponta a ponta contra o Postgres real (`gestor_test`). **O arquivo mais
  importante da task**: contém o teste do DT-018 (critério 3, o eixo),
  a prova de que a exclusão usa a categoria crua e não a efetiva
  (critério 2), o agrupamento por categoria efetiva com override mudando o
  grupo (critério 4), o recorte de mês com os 4 instantes de fronteira
  (critério 5, trap da TASK-007), lançamentos manuais entrando
  normalmente, e as bordas (valor zero, mês vazio, precisão decimal,
  múltiplas contas). Contém o **contrato completo** de `lib/dashboard.ts`
  no docblock do topo — é a fonte de verdade para o coder.
- `tests/unit/api/dashboard-route.test.ts` — `GET /api/dashboard?month=`
  (mock parcial de `@/lib/dashboard`, schema real via `importOriginal`).
- `tests/unit/app/dashboard-page.test.tsx` — `app/dashboard/page.tsx`
  (Server Component), Testing Library com `@vitest-environment jsdom`.

Nenhuma fixture nova foi necessária — `buildAccount`/`buildBankItem`/
`buildTransaction` de `tests/fixtures/db.ts` (já existentes) cobrem todos os
cenários via `overrides`.

### 6.2 Comandos para rodar

```bash
# Suíte inteira (valida "sem regressão nos 638 testes" + as 72 novas em RED)
npm test

# Só os arquivos desta task
npx dotenv -e .env.test -- vitest run \
  tests/unit/lib/dashboard.test.ts \
  tests/integration/dashboard.integration.test.ts \
  tests/unit/api/dashboard-route.test.ts \
  tests/unit/app/dashboard-page.test.tsx

npm run test:coverage
```

Pré-requisito: Postgres de teste no ar (`npm run db:up` / `docker compose up
-d`) — os testes de `lib/dashboard.ts` (função com I/O) e de rota batem no
banco real (`gestor_test`), exceto o schema Zod puro e `getCurrentMonthUTC`
(`tests/unit/lib/dashboard.test.ts`), que não precisam de banco.

### 6.3 Contrato definido para o coder

#### `lib/dashboard.ts` (novo)

```ts
export const TRANSFER_CATEGORIES = [
  "Transfers",
  "Credit card payment",
  "Same person transfer",
  "Transfer - Cash",
] as const;
// Categorias CRUAS da Pluggy observadas nos dados reais (DT-018,
// PREMISSA secao 11). A deteccao usa Transaction.category (CRUA), NUNCA
// categoryOverride/categoryFromRule (Criterio de aceite #2). Vale para
// QUALQUER Transaction, independente de `source` — nao ha guarda por
// source em lugar nenhum (manuais nunca caem nesse conjunto NA PRATICA,
// nao porque o codigo os isente).

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
// "YYYY-MM", mes 01-12 zero-padded, ancorado, sem dia/hora.

export const monthQuerySchema = z.object({
  month: z.string().regex(MONTH_REGEX, "Mes invalido. Use o formato YYYY-MM."),
});
// `month` OBRIGATORIO no schema (sem `.default`) — a rota rejeita com 400
// quando ausente; a pagina decide o fallback (getCurrentMonthUTC()) por
// conta propria, no mesmo espirito "nao quebrar" da TASK-007.
export type DashboardQuery = z.infer<typeof monthQuerySchema>;

export const NO_CATEGORY_LABEL = "Sem categoria";
// Rotulo de fallback quando a categoria EFETIVA e null.

export function getCurrentMonthUTC(): string
// "YYYY-MM" do mes corrente, via getUTCFullYear()/getUTCMonth() — NUNCA
// hora local. Usado pela pagina como default de searchParams.month
// ausente/invalido.

export interface CategorySummary {
  category: string;   // categoria EFETIVA (resolveTransactionCategory) ou
                       // NO_CATEGORY_LABEL — NUNCA null
  total: string;       // Decimal.toString(), soma dos GASTOS daquela
                       // categoria, sempre positivo
}

export interface MonthlySummary {
  month: string;                    // "YYYY-MM" recebido, eco
  receita: string;                   // soma dos POSITIVOS nao-transferencia
                                     // (Decimal.toString(), sempre >= "0.00")
  despesa: string;                    // soma em VALOR ABSOLUTO dos NEGATIVOS
                                     // nao-transferencia (sempre >= "0.00")
  saldo: string;                      // receita - despesa (Decimal.toString(),
                                     // PODE ser negativo — a string ja
                                     // inclui o "-")
  porCategoria: CategorySummary[];  // SO gastos (negativos, nao-transferencia),
                                     // agrupados pela categoria EFETIVA,
                                     // DECRESCENTE por total
  transferenciasExcluidas: {
    count: number;   // quantidade de Transaction excluidas
    total: string;    // SOMA DOS VALORES ABSOLUTOS (nao soma com sinal —
                      // a perna-espelho tende a cancelar perto de zero,
                      // o que frustraria a transparencia/auditoria da
                      // secao 2 do TASK-010.md)
  };
}

export async function getMonthlySummary(month: string): Promise<MonthlySummary>
// `month` JA VALIDADO pelo chamador (rota/pagina via monthQuerySchema) —
// nao revalida formato (mesmo padrao de listTransactions confiar em
// TransactionsQuery ja parseada).
//
// Janela do mes em UTC (Criterio de aceite #5, MESMO CUIDADO DE FUSO da
// TASK-007, documentado como convencao explicita — nao escondido):
//   ano = Number(month.slice(0,4)); mesIndex = Number(month.slice(5,7)) - 1;
//   inicio = Date.UTC(ano, mesIndex, 1, 0,0,0,0)           // dia 1, 00:00:00.000Z
//   fim    = Date.UTC(ano, mesIndex + 1, 0, 23,59,59,999)  // ultimo dia do
//            mes (dia 0 do mes seguinte), 23:59:59.999Z
//   where: { date: { gte: new Date(inicio), lte: new Date(fim) } }
// CAVEAT: janela UTC PURA — um usuario em fuso negativo (ex. America/Sao_Paulo,
// UTC-3) tem uma transacao das 22h locais do ultimo dia (01h UTC do dia
// seguinte) caindo no mes SEGUINTE aqui. Mesma convencao/mesmo caveat ja
// aceito na TASK-007 (listTransactions) — nao resolvido, so documentado.
//
// Passos: 1) busca TODAS as Transaction no where acima (sem paginacao — o
// dashboard soma TUDO do mes); 2) por linha, isTransfer = TRANSFER_CATEGORIES
// inclui row.category (CRUA); 3) transferencia -> conta em
// transferenciasExcluidas (count++, total += abs(amount)), NAO entra em
// receita/despesa/porCategoria; 4) nao-transferencia com amount > 0 -> soma
// em receita; 5) nao-transferencia com amount < 0 -> soma (abs) em despesa E
// no bucket de porCategoria da categoria EFETIVA (resolveTransactionCategory
// de @/lib/transactions, ou NO_CATEGORY_LABEL se null); 6) amount === 0 ->
// nao entra em receita/despesa/porCategoria (nem transferencia, salvo se a
// categoria crua for de transferencia); 7) porCategoria ordenado
// DECRESCENTE por total; 8) saldo = receita - despesa. Aritmetica DECIMAL
// exata (Prisma.Decimal ou equivalente) em todo o caminho — nunca
// Number()/float, para nao repetir o erro de ponto flutuante que o teste de
// "centavos preservados" (0.10 + 0.20 + 0.01) pegaria.
```

#### `app/api/dashboard/route.ts` (novo, casca fina)

```ts
export async function GET(request: Request): Promise<Response>
// 1. new URL(request.url).searchParams -> Object.fromEntries(...) -> rawQuery.
// 2. monthQuerySchema.safeParse(rawQuery) - invalido (ausente, "13",
//    "2026-1", vazio, com dia/hora, etc.) -> 400 ApiResponse<T>
//    (error: string), SEM chamar getMonthlySummary.
// 3. valido -> getMonthlySummary(parsed.data.month) -> 200
//    { success: true, data: <MonthlySummary> } (SEM meta — o resumo ja
//    carrega tudo, diferente de /api/transactions).
// 4. qualquer erro de getMonthlySummary -> 500 generico, SEM vazar
//    mensagem/stack do erro original.
// 5. Nunca console.*.
```

#### `app/dashboard/page.tsx` (novo, Server Component, SEM `"use client"`)

```ts
export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<JSX.Element>
// 1. await searchParams; monthQuerySchema.safeParse(rawParams) — invalido/
//    ausente -> usa getCurrentMonthUTC() como mes efetivo (nao lanca, mesmo
//    espirito "nao quebrar" da TASK-007).
// 2. getMonthlySummary(month) — busca direto de lib/, sem round-trip HTTP
//    (mesmo padrao de app/bancos|transacoes|lancamentos/page.tsx).
// 3. <form method="GET"> com <input id="month" name="month" type="month"
//    defaultValue={month}> associado ao <label> "Mês" (getByLabelText(/mês/i))
//    + botao de submit.
// 4. Resumo com tres elementos com data-testid: "dashboard-receita" (valor
//    CRU, sem sinal — sempre >= 0), "dashboard-despesa" (idem),
//    "dashboard-saldo" (COM SINAL EXPLICITO: a string ja tem "-" quando
//    negativa — Decimal.toString() — so prefixar "+" quando NAO comeca com
//    "-"; mesmo formatSignedAmount de app/transacoes/page.tsx).
// 5. "Gastos por categoria": um elemento data-testid="category-row-<indice>"
//    por item de porCategoria, NA MESMA ORDEM recebida (sem reordenar —
//    ordenacao e responsabilidade de lib/dashboard.ts), contendo categoria e
//    total; porCategoria vazio -> mensagem "Nenhum gasto no período.".
// 6. "Transferências excluídas": dois elementos com data-testid
//    "dashboard-transferencias-count" e "dashboard-transferencias-total".
```

### 6.4 Mapeamento critério de aceite → teste

| # | Critério (seção 4) | Teste(s) |
|---|---|---|
| 1 | `lib/dashboard.ts` expõe `getMonthlySummary(month)` retornando despesa, receita, saldo, `porCategoria[]`, `transferenciasExcluidas` | `dashboard.integration.test.ts` → todos os describes (o shape é verificado em cada `expect(summary...)`, explicitamente no describe `"bordas..."` → it `"mes sem NENHUMA transacao devolve zeros e listas vazias"` (shape completo via `toEqual`)) |
| 2 | `TRANSFER_CATEGORIES` documentada; detecção usa a categoria CRUA | `dashboard.test.ts` → describe `"TRANSFER_CATEGORIES..."`; `dashboard.integration.test.ts` → describe `"a exclusao usa a categoria CRUA, NAO a efetiva..."` (2 its: override não desfaz a exclusão; override para "Transfers" também exclui, provando que é sempre `category`, nunca `categoryOverride`, em ambas as direções) |
| 3 | **DT-018 provado**: transferências + receita real + gastos, transferências saem dos dois lados, receita real entra | `dashboard.integration.test.ts` → describe `"getMonthlySummary - DT-018: transferencias EXCLUIDAS dos dois lados..."` (1 it, com as 4 categorias reais, sinais positivo E negativo, receita real "Non-recurring income" e dois gastos reais "Housing"/"Online shopping") |
| 4 | `porCategoria` agrupa por categoria EFETIVA, decrescente | `dashboard.integration.test.ts` → describe `"porCategoria agrupa pela categoria EFETIVA..."` (4 its: override muda o grupo — 3 níveis override/regra/crua num só teste —, mesma categoria efetiva soma no mesmo bucket, categoria null vira `NO_CATEGORY_LABEL`, receita não aparece em porCategoria) |
| 5 | Limites do mês consistentes e documentados (caveat de fuso) | `dashboard.integration.test.ts` → describe `"recorte de mes, com atencao ao FUSO..."` (6 its: outro mês fora, 4 instantes de fronteira — 23:59:59.999 último dia incluído/00:00:00 dia seguinte excluído/00:00:00 primeiro dia incluído/23:59:59.999 dia anterior excluído —, fevereiro com 28 dias). Caveat UTC documentado no docblock do topo do arquivo e na seção 6.3 acima |
| 6 | `GET /api/dashboard?month=YYYY-MM` casca fina, Zod (mês inválido → 400) | `dashboard-route.test.ts` → describe `"validacao Zod..."` (9 casos incluindo ausente/vazio/13/2026-1/com dia) e describe `"sucesso..."`; `dashboard.test.ts` → describe `"monthQuerySchema..."` (24 casos puros) |
| 7 | Página `/dashboard`: resumo, gastos por categoria, transferências excluídas, mês selecionável (default corrente) | `dashboard-page.test.tsx` → todos os describes (seleção de mês/default, resumo, porCategoria, transferências excluídas) |
| 8 | Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET` | Nenhum arquivo desta task importa `pluggy-sdk`/`@/lib/pluggy` — o dashboard só lê dados já sincronizados do Postgres |
| 9 | Nenhum `console.*` em produção | `dashboard-route.test.ts` → testes dedicados de `console.log/warn/error` no caminho feliz e no de erro |
| 10 | Suíte verde sem regressão; `build`/`lint` limpos | Confirmado pelo qa nesta entrega (evidência de RED abaixo); cabe ao coder manter os 638 pré-existentes + fazer os 72 novos passarem |
| — | Bordas: valor zero/negativo, precisão decimal | `dashboard.integration.test.ts` → describe `"bordas (valor zero, mes sem nenhuma transacao, precisao decimal)"` (3 its, incluindo soma de centavos 0.10+0.20+0.01 = "30.31" exato — pega erro de ponto flutuante) |
| — | Lançamentos manuais entram (não são transferência) | `dashboard.integration.test.ts` → describe `"lancamentos MANUAIS entram normalmente..."` (3 its, incluindo o caso defensivo de um manual com `category="Transfers"` — prova que não há guarda por `source`) |
| — | Caminho de erro: API Pluggy fora do ar / Item `LOGIN_ERROR`/`OUTDATED` | Não se aplica — mesma nota da TASK-007: o dashboard só lê dados já sincronizados do Postgres, nunca chama a Pluggy. O caminho de erro real e testado é o análogo correto desta camada: Postgres indisponível / `getMonthlySummary` rejeitando de forma inesperada, coberto em `dashboard-route.test.ts` → describe `"erro inesperado (Postgres fora do ar...)"` |

### 6.5 Evidência de RED

**Validação de contrato (mesma técnica da TASK-007/009):** antes de fechar a
task, implementei uma stub temporária de `lib/dashboard.ts`,
`app/api/dashboard/route.ts` e `app/dashboard/page.tsx` (nunca commitada —
criada, testada e revertida via `rm`) para provar que os 72 testes novos são
satisfazíveis com a implementação exata do contrato da seção 6.3, e que
nenhum é um teste com bug de autoria (em especial a aritmética decimal e a
ordenação de `porCategoria`). Resultado: **710/710 verde** com a stub (638
pré-existentes + 72 novos), provando o contrato consistente. A stub foi então
removida por completo (`git status` confirma: só os 4 arquivos de teste desta
task ficam, nenhum arquivo de produção).

RED confirmado (`npm test`, sem a stub):

```
Test Files  4 failed | 49 passed (53)
     Tests  59 failed | 638 passed (697)
```

Os 638 testes pré-existentes continuam verdes — **nenhuma regressão**. As 59
falhas + a suíte `dashboard-page.test.tsx` (0 testes coletados — falha de
carregamento do arquivo inteiro, mesmo padrão de `transacoes-page.test.tsx`
na TASK-007) são, sem exceção, `Cannot find package '@/lib/dashboard'`,
`Cannot find package '@/app/api/dashboard/route'` ou `Failed to resolve
import "@/app/dashboard/page"` — nunca erro de sintaxe/import quebrado nos
próprios arquivos de teste (72 testes novos no total: 24 em `dashboard.test.ts`
+ 20 em `dashboard.integration.test.ts` + 15 em `dashboard-route.test.ts` +
13 em `dashboard-page.test.tsx`, das quais as 13 últimas aparecem agregadas
como 1 "no tests" por falha de resolução de import, não 13 linhas de FAIL
individuais — por isso o contador de "Tests" mostra 59, não 72; ambos os
números batem exatamente com a contagem de `it(...)` de cada arquivo).

## 7. Implementação (preenchido pelo coder)

### Arquivos criados

- `lib/dashboard.ts` — `TRANSFER_CATEGORIES`, `MONTH_REGEX`,
  `monthQuerySchema`, `DashboardQuery`, `NO_CATEGORY_LABEL`,
  `getCurrentMonthUTC`, `CategorySummary`, `MonthlySummary`,
  `getMonthlySummary` — exatamente o contrato do docblock da seção 6.3.
- `app/api/dashboard/route.ts` — `GET /api/dashboard?month=`, casca fina.
- `app/dashboard/page.tsx` — Server Component da tela do dashboard.

Nenhum arquivo de teste foi tocado.

### Decisões tomadas

- **Detecção de transferência usa a categoria CRUA** (`row.category`, nunca
  `categoryOverride`/`categoryFromRule`) via
  `TRANSFER_CATEGORIES_SET.includes(category)` — `TRANSFER_CATEGORIES` é
  `as const` (tupla de literais), então o array precisou ser tipado como
  `readonly string[]` (`TRANSFER_CATEGORIES_SET`) antes do `.includes` para
  aceitar um `string | null` qualquer sem erro de tipo do TS (o método
  `includes` de uma tupla `as const` só aceita os literais exatos como
  argumento).
- **Aritmética decimal com `Prisma.Decimal`** em todo o caminho (nunca
  `Number()`) — `receita`, `despesa`, `saldo` e cada bucket de
  `porCategoria` são acumulados como `Prisma.Decimal` e só viram `string` no
  fim, via `.toFixed(2)`.
- **`.toFixed(2)`, não `.toString()`, na conversão final para string.**
  O docblock do contrato (seção 6.3) diz "Decimal.toString()" em vários
  pontos, mas decimal.js **não preserva zeros à direita** depois de uma
  operação aritmética (`plus`/`minus`) — comprovado empiricamente:
  `new Decimal('2000.00').abs().plus('2000.00').toString()` dá `"4000"`,
  não `"4000.00"`. Os testes de integração exigem literalmente `"4800.00"`,
  `"800.00"`, `"0.00"` etc. (com os dois decimais), o que só `.toFixed(2)`
  garante. Tratei a palavra "toString()" do docblock como descrição
  informal ("vira string via Decimal", não uma chamada de API literal) e
  segui os testes (fonte de verdade inegociável) — não foi necessário
  alterar nenhum teste, o contrato e os testes batem entre si, só a
  descrição textual do docblock diverge por imprecisão de linguagem.
- **Ordenação de `porCategoria`**: comparação decimal exata
  (`b[1].comparedTo(a[1])`) antes de converter para string, evitando
  qualquer conversão para `Number` mesmo na ordenação.
- **`amount === 0` não incrementa nada** (nem receita, nem despesa, nem
  `porCategoria`, nem `transferenciasExcluidas` — a menos que a categoria
  crua seja de transferência, caso em que `transferenciasExcluidas.total`
  soma `0`), seguindo o passo 6 do contrato.
- **Página `/dashboard`**: troquei o `aria-label` da seção de resumo de
  "Resumo do mês" para "Resumo do período" — com "Resumo do mês" como
  `aria-label` de um `<section>`, `getByLabelText(/m[eê]s/i)` do Testing
  Library passava a casar DOIS elementos (o `<input>` via `<label>` E a
  `<section>` via `aria-label`), quebrando
  `tests/unit/app/dashboard-page.test.tsx` (`Found multiple elements`).
  Renomear a seção não afeta nenhum teste (nenhum busca por esse
  `aria-label` específico) e mantém o único elemento associado a "Mês"
  sendo o `<input>` do formulário, como o contrato pede.
- **`app/dashboard/page.tsx` não usa `"use client"`** (Server Component) —
  evita o vazamento de `pg`/`lib/db` para o bundle do browser (armadilha
  descrita no prompt desta task, mesma da TASK-009). Confirmado com
  `npm run build`: `/dashboard` aparece como rota dinâmica (`ƒ`), sem erro
  de bundling.
- Reconstrução de objetos campo a campo em toda a implementação, sem
  spread, conforme `.claude/rules/coding-style.md`.

### Dívidas assumidas

- Nenhuma nova. O caveat de fuso horário (janela do mês em UTC puro) já é
  aceito e documentado no próprio contrato da task (mesmo trade-off da
  TASK-007/`listTransactions`) — não é uma dívida desta task, é uma
  convenção explícita.

### Comandos rodados (evidência)

```
npm test            → Test Files 53 passed (53) | Tests 710 passed (710)
npm run build       → sucesso, /dashboard e /api/dashboard listados
npm run lint        → 0 errors (2 warnings pré-existentes em coverage/, não relacionados)
```

## 8. Revisão (preenchido pelo code-reviewer)

Veredito: **APROVADO**

Revisado o diff real (lib/dashboard.ts, app/api/dashboard/route.ts,
app/dashboard/page.tsx + 4 arquivos de teste, todos não rastreados) contra os
critérios da seção 4, o contrato da seção 6.3 e o DT-018. Verificação
independente: `npm test` = 710/710 verde (sem CLIENT_ID/CLIENT_SECRET), `tsc
--noEmit` exit 0, `npm run lint` 0 erros (2 warnings pré-existentes em
coverage/). Nenhum `console.*`, nenhum secret/`process.env`/`NEXT_PUBLIC` nos
arquivos novos.

### DT-018 (o eixo) — confirmado
- Detecção usa a categoria CRUA: `isTransferCategory(row.category)`
  (lib/dashboard.ts:143) recebe `row.category`, NUNCA
  categoryOverride/categoryFromRule. O `continue` na linha 146 exclui a
  transferência ANTES dos ramos de receita (149) e despesa (154) — exclusão
  dos DOIS lados, independente do sinal.
- Agrupamento do que sobra usa a categoria EFETIVA:
  `resolveTransactionCategory(...)` (lib/dashboard.ts:158-163), só no ramo de
  despesa. Os dois conceitos não se confundem: crua para excluir, efetiva
  para agrupar.
- Poder de detecção do teste do critério 3 (dashboard.integration.test.ts:131):
  transferências das 4 categorias reais com AMBOS os sinais (+2000, -2000,
  +500, -300). Se a exclusão só filtrasse positivos, os -2300 vazariam para
  despesa (938.83→3238.83); se só filtrasse negativos, os +2500 vazariam para
  receita (1500→4000). Ambos os sinais são load-bearing — o teste tem poder
  real. Critério #2 também é provado nas duas direções (override "Mercado"
  não desfaz a exclusão; category "Housing" + override "Transfers" NÃO é
  excluída), distinguindo de uma implementação que olhasse a efetiva.

### Demais pontos
- `category = null` (manual / Pluggy sem categoria): `isTransferCategory`
  retorna false pela guarda `category !== null` (lib/dashboard.ts:88) — nunca
  tratado como transferência, nunca quebra. Coberto por
  dashboard.integration.test.ts (manual positivo com category=null → receita).
- Recorte de mês: janela UTC pura, `[dia 1 00:00:00.000Z, último dia
  23:59:59.999Z]` (monthWindow, linhas 102-108). As 4 bordas + fevereiro têm
  teste com poder de detecção (linhas 437-528). Convenção documentada.
- Aritmética monetária: `Prisma.Decimal` em todo o caminho (receita, despesa,
  saldo, buckets, ordenação via `comparedTo`), nunca `Number()`/float.
  `saldo = receita.minus(despesa)`. `.toFixed(2)` no fim (justificado: decimal.js
  dropa zeros à direita após `plus/minus`; os testes exigem "800.00" literal).
  Centavos exatos provados (10.10+20.20+0.01="30.31").
- PII: a query seleciona apenas amount/category/categoryOverride/categoryFromRule
  — NÃO traz `description`, então o DT-021 (CPF no texto livre) não é
  reintroduzido. A tela renderiza só nomes de categoria e números.
- Nenhum teste enfraquecido: os arquivos de teste não foram tocados pelo coder
  (confirmado no diff); o desvio `.toString()`→`.toFixed(2)` seguiu os testes
  como fonte de verdade, sem alterá-los.

### Problemas bloqueantes
Nenhum.

### Sugestões não-bloqueantes
1. **Comparação exata de string em TRANSFER_CATEGORIES** (lib/dashboard.ts:88):
   `includes` sem `trim()`/case-fold. Robusto para os valores atuais (enum
   estável da Pluggy), mas uma categoria " Transfers" com espaço ou variação
   de caixa escaparia da exclusão e inflaria a receita — exatamente o sintoma
   do DT-018. Como o conjunto é hardcoded e observado nos dados reais, é
   aceitável no MVP; considerar normalizar se a lista crescer.
2. **`formatSignedAmount("0.00")` → "+0.00"** (page.tsx:21): saldo zero exibe
   "+0.00". Cosmético, o teste aceita; alinhado com app/transacoes.

### Candidato a Débito Técnico
- **Janela de mês em UTC puro.** Não há DT registrado para o caveat de fuso
  (confirmado: DEBITO-TECNICO.md não menciona fuso/UTC). O coder o trata como
  "mesma convenção da TASK-007, não é dívida". Correto quanto à consistência,
  mas aqui o efeito é mais visível: para um usuário em UTC-3, compras após as
  21h do último dia do mês migram para o mês seguinte, deslocando um total
  monetário agregado (não apenas a posição de uma linha numa lista). Recomendo
  abrir um DT explícito (família da TASK-007) para rastrear a convenção UTC nas
  camadas de relatório/listagem, a ser resolvido quando houver preferência de
  fuso do usuário. Não bloqueia esta task.
