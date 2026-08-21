# TASK-014 — Correção: pagamento de fatura fora do gasto + gastos por método
Status: CONCLUÍDA | Fase do roadmap: 6 (correções de dashboard)

## 0. Contexto técnico obrigatório

- Stack: Next 16.2.10 + React 19, Prisma 7.9.0 (driver adapter), Postgres 16, Vitest, Testing Library.
- Sistema de design **Fintech Premium** já aplicado (TASK-013) — reusar os primitivos
  (`.card`, `.kpi-*`, `.chip`, etc. em `app/globals.css`); a moeda usa `formatBRL` de `lib/format.ts`.
- Leia `docs/DEBITO-TECNICO.md` (DT-018 e DT-024 são o contexto direto) e a seção 11 da PREMISSA.
- `lib/dashboard.ts` (`getMonthlySummary`) e `lib/bills.ts` (faturas persistidas) já existem.
- **DT-004**: mocke módulos inteiros. **DT-026**: nunca rodar testes concorrentes contra `gestor_test`.

## 1. Objetivo

Dois problemas do dashboard, confirmados nos dados reais:
1. **O pagamento de fatura conta como despesa** e infla o total (duplica o que já foi contado nas
   compras do cartão). Ex. real: um débito de −R$ 3.408,84 na conta corrente = o total da fatura do
   cartão Gold, mas a Pluggy o categorizou como "Loans and financing", então o DT-018 (que exclui
   por categoria exata) não o pega.
2. Falta granularidade: o usuário quer ver **quanto gastou por método** (Pix/TED, crédito, débito, dinheiro).

## 2. A decisão (confirmada com o usuário)

- **Detecção do pagamento de fatura = casar com a fatura.** Um débito numa conta **não-cartão**
  (CHECKING/CASH) cujo `|amount|` é **igual** ao `totalAmount` de uma `CreditCardBill` **e** cuja
  `date` cai numa **janela ao redor do `dueDate`** daquela fatura (ex. ±10 dias) é um **pagamento de
  fatura** → excluído do cálculo (receita e despesa). Documentar a tolerância e o desempate.
  - Pagamento **parcial** (valor ≠ total exato) fica fora do escopo — cai no comportamento atual
    (registrar como observação/DT se relevante).
- **Transparência:** os pagamentos de fatura excluídos entram na contabilidade de "excluídos" do
  resumo (o dinheiro não some da tela sem explicação), como já acontece com transferências.

## 3. Comportamento esperado (TDD)

- DADO um débito de conta corrente igual ao total de uma fatura, dentro da janela do vencimento
  QUANDO calculo o resumo ENTÃO ele **não** entra na despesa e é contabilizado como pagamento excluído
- DADO um débito de mesmo valor mas **fora** da janela de data QUANDO calculo ENTÃO ele conta normal
  (não é o pagamento daquela fatura)
- DADO um gasto real de "Loans and financing" que **não** casa com nenhuma fatura QUANDO calculo
  ENTÃO ele **conta** como despesa (não excluímos a categoria inteira — só o que casa com fatura)
- DADO as transações do mês QUANDO agrupo por método ENTÃO recebo o total gasto em **crédito**
  (transações em contas CREDIT_CARD), **Pix/TED**, **débito** e **dinheiro**
- DADO o dashboard QUANDO exibo ENTÃO há cards de gasto por método, além de receita/despesa/saldo

## 4. Critérios de aceite

- [ ] 1. `lib/dashboard.ts` identifica pagamentos de fatura casando débito não-cartão com
      `CreditCardBill.totalAmount` + janela de `dueDate`; exclui-os de receita e despesa
- [ ] 2. Teste prova os 3 casos: casa (exclui), mesmo valor fora da janela (conta), "Loans and
      financing" que não casa fatura nenhuma (conta) — com poder de detecção real
- [ ] 3. O resumo expõe os pagamentos de fatura excluídos (contagem/total), separado ou somado às
      transferências excluídas — decisão do coder, documentada
- [ ] 4. `lib/dashboard.ts` (ou `lib/`) calcula gasto por método: crédito (contas CREDIT_CARD),
      Pix/TED, débito, dinheiro; teste cobre a classificação
- [ ] 5. Dashboard mostra cards de gasto por método, no sistema de design (primitivos `.card`/`.kpi-*`),
      moeda em `formatBRL`
- [ ] 6. **Nenhuma regressão** nos testes existentes; nenhum `console.*`; suíte verde; build/lint limpos
- [ ] 7. Verificação contra dados reais (orquestrador): o −R$ 3.408,84 sai do total; os cards de
      método batem com o extrato

## 5. Fora de escopo

- Ciclo de fatura por cartão / fatura aberta / cadastro de dia de fechamento → **TASK-015**
- Card **por cartão** (crédito discriminado por cartão) → TASK-015 (depende do ciclo)
- Pagamento parcial de fatura (valor diferente do total)
- Conciliação manual

## 6. Testes (preenchido pelo qa)

### 6.1 Arquivos alterados

Nenhum arquivo de teste novo — os 4 arquivos que já cobrem `lib/dashboard.ts`/
`app/dashboard/page.tsx` (TASK-010/TASK-012) foram **estendidos**:

- `tests/unit/lib/dashboard.test.ts` — testes PUROS (sem I/O) das duas peças
  novas: `BILL_PAYMENT_WINDOW_DAYS` (constante = 10), `isBillPayment`
  (deteccão de pagamento de fatura por valor+janela, 12 casos incluindo
  fronteira exata da janela em ms, desempate entre faturas, `windowDays`
  customizado) e `classifyExpenseMethod` (classificação por método, 13 casos
  incluindo a ordem de precedência `CREDIT_CARD` > `CASH` > `PIX/TED` >
  `DEBIT` > não classificado). Contrato completo das duas funções no
  docblock do topo do arquivo.
- `tests/integration/dashboard.integration.test.ts` — **o arquivo mais
  importante da task**, batendo no Postgres real (`gestor_test`). Contém:
  os 3 casos exigidos pelo critério 2 (casa/exclui, mesmo valor fora da
  janela/conta, "Loans and financing" sem match/conta) usando
  `buildCreditCardBill` com os valores reais da sondagem (R$3.408,84,
  vencimento 10/08); mais 5 casos de borda (limite exato da janela, valor
  positivo não casa, débito na própria conta CREDIT_CARD não casa, janela
  atravessando a borda do mês — prova que `CreditCardBill` é buscada sem
  filtro de mês —, duas faturas com mesmo total não duplicam a exclusão); a
  transparência separada de `pagamentosFaturaExcluidos`/
  `transferenciasExcluidas` (critério 3); a classificação `porMetodo` nos 4
  buckets (critério 4), incluindo método nulo/fora dos buckets e exclusão
  dos pagamentos de fatura de `porMetodo`. O docblock do topo tem o
  **contrato completo** (fonte de verdade para o coder) — reescrito para
  refletir o novo shape de `MonthlySummary` e os passos 4-9 do algoritmo. O
  teste "mês sem nenhuma transação" (que fazia `toEqual` do objeto inteiro)
  foi **atualizado** para incluir `porMetodo`/`pagamentosFaturaExcluidos`
  zerados — mudança deliberada de contrato, documentada no próprio teste,
  não enfraquecimento (a asserção continua exata, só o shape cresceu).
- `tests/unit/app/dashboard-page.test.tsx` — `buildSummary()` (fixture do
  mock de `getMonthlySummary`) ganhou os dois campos novos com valores
  DISTINTOS entre si (poder de detecção contra confundir buckets); dois
  `describe` novos: cards de "Gastos por método" (4 `data-testid`,
  `formatBRL`) e a seção "Pagamentos de fatura excluídos" (2 `data-testid`,
  **separados** dos de "Transferências excluídas").
- `tests/unit/api/dashboard-route.test.ts` — **não precisou de edição**: as
  asserções fazem `toEqual({ success: true, data: summary })` contra o que
  o mock de `getMonthlySummary` devolve, agnóstico ao shape — continua
  válido com o `MonthlySummary` ampliado sem qualquer mudança.

Nenhuma fixture nova em `tests/fixtures/db.ts` foi necessária —
`buildCreditCardBill` (TASK-011) e `buildAccount`/`buildTransaction` (via
`overrides` de `type`/`method`) cobrem todos os cenários novos.

### 6.2 Comandos para rodar

```bash
# Suíte inteira (nunca concorrente com outro vitest — DT-026)
ps aux | grep vitest   # confirmar que não há outro processo rodando
npm test > /tmp/t.log 2>&1; tail -n 100 /tmp/t.log; pkill -9 -f vitest

# Só os arquivos desta task
npx dotenv -e .env.test -- vitest run \
  tests/unit/lib/dashboard.test.ts \
  tests/integration/dashboard.integration.test.ts \
  tests/unit/app/dashboard-page.test.tsx \
  tests/unit/api/dashboard-route.test.ts
```

Pré-requisito: Postgres de teste no ar (`npm run db:up`) — os testes de
integração e os que passam por `getMonthlySummary` de verdade batem em
`gestor_test`; os blocos puros (`isBillPayment`/`classifyExpenseMethod`/
schema Zod) não precisam de banco.

### 6.3 A decisão do qa sobre o critério 3 ("separado ou somado — decisão do coder, documentada")

O prompt desta task pede que **eu** (qa) defina o contrato, então a decisão
foi tomada aqui, não deixada em aberto para o coder: `pagamentosFaturaExcluidos`
é um campo **separado** de `transferenciasExcluidas` (não somado). Motivo:
são naturezas de exclusão diferentes (transferência entre contas próprias vs.
pagamento de fatura casado por valor+janela) e mantê-los distintos preserva
a granularidade de auditoria — o usuário consegue ver "quanto foi transferência"
separado de "quanto foi pagamento de fatura", em vez de um número combinado
que esconde a composição. Testado explicitamente em
`tests/integration/dashboard.integration.test.ts` (describe "pagamentosFaturaExcluidos
e transferenciasExcluidas SEPARADOS").

### 6.4 Contrato definido para o coder

#### `lib/dashboard.ts` (extensão)

```ts
export const BILL_PAYMENT_WINDOW_DAYS = 10;
// Tolerância em DIAS da janela ao redor do dueDate (secão 2 do
// TASK-014.md). Única fonte da tolerância.

export function isBillPayment(
  transaction: { amount: string; date: Date },
  bills: { totalAmount: string; dueDate: Date }[],
  windowDays: number = BILL_PAYMENT_WINDOW_DAYS,
): boolean
// true quando EXISTE ao menos uma bill tal que: (1) transaction.amount é
// NEGATIVO (só débito); (2) |amount| === bill.totalAmount EXATO (Prisma.Decimal,
// nunca float); (3) |transaction.date.getTime() - bill.dueDate.getTime()|
// <= windowDays * 86_400_000 (janela simétrica, INCLUSIVA nos dois
// extremos). bills vazio -> false. Não sabe/não checa o tipo de conta —
// responsabilidade do CHAMADOR só invocar para contas != "CREDIT_CARD".

export type ExpenseMethod = "credito" | "pixTed" | "debito" | "dinheiro" | null;

export function classifyExpenseMethod(input: {
  accountType: string;
  method: string | null;
}): ExpenseMethod
// Por PRECEDÊNCIA: (1) accountType === "CREDIT_CARD" -> "credito" SEMPRE;
// (2) senão accountType === "CASH" -> "dinheiro" SEMPRE; (3) senão
// method === "PIX" || "TED" -> "pixTed"; (4) senão method === "DEBIT" ->
// "debito"; (5) qualquer outro caso -> null (não classificado, mas
// CONTINUA em despesa/porCategoria — porMetodo é um recorte adicional).

export interface MethodSummary {
  credito: string;
  pixTed: string;
  debito: string;
  dinheiro: string;
}
// Cada campo = soma (Decimal.toFixed(2), sempre >= "0.00") dos GASTOS
// classificados naquele bucket (mesma base de `despesa`: exclui
// transferências E pagamentos de fatura).

export interface MonthlySummary {
  month: string;
  receita: string;
  despesa: string;
  saldo: string;
  porCategoria: CategorySummary[];
  porMetodo: MethodSummary;                                  // NOVO
  transferenciasExcluidas: { count: number; total: string };
  pagamentosFaturaExcluidos: { count: number; total: string }; // NOVO, separado (ver 6.3)
}

export async function getMonthlySummary(month: string): Promise<MonthlySummary>
// Mesma janela de mês em UTC de antes (Critério de aceite #5, TASK-010).
// MUDANÇAS:
// 1. `prisma.transaction.findMany` ganha SELECT AMPLIADO: `date: true`,
//    `method: true`, `account: { select: { type: true } }` (além dos
//    campos já selecionados).
// 2. ANTES do loop, buscar TODAS as CreditCardBill (sem filtro de mês/conta):
//    `prisma.creditCardBill.findMany({ select: { totalAmount: true, dueDate: true } })`.
// 3. No loop por linha: (a) isTransfer (como antes) -> transferenciasExcluidas;
//    (b) SENÃO, se `row.account.type !== "CREDIT_CARD"` E
//    `isBillPayment({ amount: row.amount.toString(), date: row.date }, bills)`
//    -> pagamentosFaturaExcluidos (count++, total += abs(amount)), NÃO entra
//    em receita/despesa/porCategoria/porMetodo; (c) SENÃO, amount > 0 ->
//    receita; (d) SENÃO, amount < 0 -> despesa + porCategoria (como antes)
//    E, se `classifyExpenseMethod({ accountType: row.account.type, method: row.method })`
//    não for null, soma no bucket correspondente de porMetodo.
// Aritmética DECIMAL exata em TODOS os campos novos também.
```

#### `app/dashboard/page.tsx` (extensão de apresentação — Critério de aceite #5)

Duas seções novas, reutilizando os primitivos já usados na página
(`.card`, `.card-head`, `.card-title`, `.kpi-*`), com `formatBRL`:

- **"Gastos por método"**: 4 elementos com `data-testid`
  `dashboard-metodo-credito`, `dashboard-metodo-pix-ted`,
  `dashboard-metodo-debito`, `dashboard-metodo-dinheiro`, cada um exibindo
  `formatBRL(summary.porMetodo.<campo>)`.
- **"Pagamentos de fatura excluídos"** (separada de "Transferências
  excluídas", critério 3): `data-testid="dashboard-pagamentos-fatura-count"`
  (contagem crua) e `data-testid="dashboard-pagamentos-fatura-total"`
  (`formatBRL(summary.pagamentosFaturaExcluidos.total)`).

Nenhum `data-testid` existente (`dashboard-receita`, `dashboard-despesa`,
`dashboard-saldo`, `category-row-<n>`, `category-bar-<n>`,
`dashboard-transferencias-count`, `dashboard-transferencias-total`) muda.

### 6.5 Mapeamento critério de aceite → teste

| Critério (seção 4 do TASK-014.md) | Teste(s) |
|---|---|
| 1. `lib/dashboard.ts` identifica pagamentos de fatura casando débito não-cartão com `CreditCardBill.totalAmount` + janela de `dueDate`; exclui de receita e despesa | `tests/unit/lib/dashboard.test.ts` → describes `BILL_PAYMENT_WINDOW_DAYS`/`isBillPayment` (lógica pura); `tests/integration/dashboard.integration.test.ts` → describe `getMonthlySummary - deteccao de pagamento de fatura por valor+janela` (todos os casos, wiring completo) |
| 2. Prova os 3 casos: casa (exclui) / mesmo valor fora da janela (conta) / "Loans and financing" sem match (conta) | `tests/integration/dashboard.integration.test.ts`, mesmo describe acima → `"CASO 1 dos 3: ... DENTRO da janela ..."`, `"CASO 2 dos 3: ... FORA da janela ..."`, `"CASO 3 dos 3: gasto REAL de 'Loans and financing' que NAO casa ..."` |
| 3. Resumo expõe pagamentos de fatura excluídos (contagem/total), separado das transferências, decisão documentada | `tests/integration/dashboard.integration.test.ts` → describe `"pagamentosFaturaExcluidos e transferenciasExcluidas SEPARADOS ..."` (2 testes); `tests/unit/app/dashboard-page.test.tsx` → describe `"pagamentos de fatura excluídos, transparência SEPARADA de transferências"` (2 testes); decisão registrada na seção 6.3 acima |
| 4. Calcula gasto por método (crédito/Pix-TED/débito/dinheiro); teste cobre a classificação | `tests/unit/lib/dashboard.test.ts` → describe `"classifyExpenseMethod - classificacao PURA ..."` (13 casos, lógica pura); `tests/integration/dashboard.integration.test.ts` → describe `"getMonthlySummary - porMetodo, gasto por metodo"` (5 testes, wiring com Account.type/Transaction.method reais) |
| 5. Dashboard mostra cards de gasto por método, no sistema de design, moeda em `formatBRL` | `tests/unit/app/dashboard-page.test.tsx` → describe `"cards de gasto por método"` (2 testes) |
| 6. Nenhuma regressão; nenhum `console.*`; suíte verde; build/lint limpos | Toda a suíte pré-existente (59 arquivos/824 testes) continua verde após as edições — ver evidência RED abaixo (só os 3 arquivos tocados por esta task falham, pelo motivo certo); build/lint ficam a cargo do coder/reviewer |
| 7. Verificação contra dados reais (orquestrador) | Fora do escopo de teste automatizado — o CASO 1 do critério 2 já reproduz os valores exatos da sondagem real (−R$3.408,84, vencimento 10/08) como regressão automatizada equivalente |

### 6.6 Evidência RED (motivo certo, sem regressão indevida)

```
$ ps aux | grep -i vitest | grep -v grep   # vazio antes de rodar
$ npm test > /tmp/t.log 2>&1; tail -n 5 /tmp/t.log; pkill -9 -f vitest

 Test Files  3 failed | 59 passed (62)
      Tests  44 failed | 824 passed (868)
```

Os 3 arquivos que falham são exatamente os 3 estendidos por esta task
(`tests/unit/lib/dashboard.test.ts`, `tests/integration/dashboard.integration.test.ts`,
`tests/unit/app/dashboard-page.test.tsx`) — os outros 59 arquivos (inclusive
`tests/unit/api/dashboard-route.test.ts`, que não foi editado) continuam
100% verdes, comprovando zero regressão indevida. Amostra dos motivos de
falha (todos "funcionalidade ausente", nunca erro de sintaxe/setup):

- `TypeError: isBillPayment is not a function` / `classifyExpenseMethod is
  not a function` (12 + 13 testes puros) — as duas funções ainda não
  existem em `lib/dashboard.ts`.
- `AssertionError: expected '3408.84' to be '0.00'` no CASO 1 do critério 2
  — a implementação atual ainda conta o débito de R$3.408,84 como despesa
  (o bug real que esta task corrige).
- `AssertionError: expected undefined to deeply equal { count: 0, total:
  '0.00' }` — `summary.pagamentosFaturaExcluidos` ainda não existe no
  retorno de `getMonthlySummary`.
- `TestingLibraryElementError: Unable to find an element by:
  [data-testid="dashboard-metodo-credito"]` — a página ainda não renderiza
  os cards de método.

Nenhuma falha por erro de conexão com Postgres, import quebrado ou timeout
— todas são "o comportamento pedido ainda não existe", o RED correto para
handoff ao coder.

## 7. Implementação (preenchido pelo coder)

### 7.1 Arquivos alterados

- `lib/dashboard.ts` — implementadas as três peças novas do contrato do qa
  (seção 6.4):
  - `BILL_PAYMENT_WINDOW_DAYS = 10` — única fonte da tolerância.
  - `isBillPayment(transaction, bills, windowDays = BILL_PAYMENT_WINDOW_DAYS)`
    — função pura: só considera `transaction.amount` negativo
    (`Prisma.Decimal(...).isNegative()`); casa por `Prisma.Decimal.equals`
    (nunca float/Number); janela simétrica em milissegundos
    (`windowDays * 86_400_000`), inclusiva nos dois extremos
    (`distanciaMs <= janelaMs`); `bills.some(...)` — qualquer fatura que
    case já satisfaz (sem desempate/vínculo a uma fatura específica, como
    documentado).
  - `classifyExpenseMethod({ accountType, method })` — cadeia de `if`
    respeitando a precedência exata do contrato: `CREDIT_CARD` → `CASH` →
    `PIX`/`TED` → `DEBIT` → `null`.
  - `MethodSummary`/`porMetodo` e `pagamentosFaturaExcluidos` acrescentados
    a `MonthlySummary`.
  - `getMonthlySummary`: `select` do `Transaction.findMany` ampliado
    (`date`, `method`, `account: { select: { type: true } }`); busca
    adicional `prisma.creditCardBill.findMany({ select: { totalAmount,
    dueDate } })` sem filtro de mês/conta, convertendo `totalAmount` para
    string antes de repassar a `isBillPayment` (mesma convenção de
    `row.amount.toString()`); no loop, a ordem de checagem é exatamente a
    do contrato: transferência (categoria crua) → pagamento de fatura
    (`account.type !== "CREDIT_CARD"` E `isBillPayment(...)`) → receita →
    despesa (+ `porCategoria` + `porMetodo`, este último só quando
    `classifyExpenseMethod` não devolve `null`). Toda a aritmética nova usa
    `Prisma.Decimal` (nunca `Number()`).
- `app/dashboard/page.tsx` — duas seções novas, Server Component, mesmos
  primitivos (`.card`/`.card-head`/`.card-title`/`.kpi-*`) e `formatBRL`
  já usados no resto da página:
  - "Gastos por método": grid de 4 cards (`dashboard-metodo-credito`,
    `dashboard-metodo-pix-ted`, `dashboard-metodo-debito`,
    `dashboard-metodo-dinheiro`), inserida entre "Gastos por categoria" e
    "Transferências excluídas".
  - "Pagamentos de fatura excluídos": nova `section` própria, com o mesmo
    layout de "Transferências excluídas" mas `data-testid` distintos
    (`dashboard-pagamentos-fatura-count`/`dashboard-pagamentos-fatura-total`),
    posicionada logo depois de "Transferências excluídas" — nenhum
    `data-testid` existente foi tocado.

Nenhum arquivo de teste foi alterado (protocolo desta task — os testes já
estavam no estado RED correto, definidos pelo qa).

### 7.2 Decisões tomadas

- Segui à risca o contrato do qa (seção 6.4 do TASK-014.md) — não houve
  ambiguidade a resolver; a decisão do critério 3 (campo separado) já
  estava tomada pelo qa (seção 6.3).
- `billsForMatch`: converto `CreditCardBill.totalAmount` (Decimal do
  Prisma) para `string` uma única vez, fora do loop de transações, para
  reaproveitar a mesma lista de faturas em todas as chamadas de
  `isBillPayment` sem reconverter a cada iteração.
- `porMetodo` é acumulado internamente como `Record<Exclude<ExpenseMethod,
  null>, Prisma.Decimal>` (mapa fixo dos 4 buckets) e só convertido para
  string (`toFixed(2)`) no retorno — mesmo padrão de `receita`/`despesa`.

### 7.3 Dívidas técnicas / observações

- Nenhuma dívida nova assumida. O caso "pagamento parcial de fatura" segue
  explicitamente fora de escopo (seção 5 do TASK-014.md) — um débito de
  valor diferente do total da fatura continua contando como despesa
  normal, sem nenhum tratamento especial.
- Sugestão (não implementada, fora do que os testes exigem): quando houver
  mais de uma `CreditCardBill` com o mesmo `totalAmount` casando dentro da
  janela, `isBillPayment` não indica QUAL fatura foi paga — isso é
  aceitável para esta task (só precisa saber "é pagamento de fatura?"),
  mas o vínculo transação↔fatura específica ficará necessário no ciclo de
  fatura por cartão (TASK-015).

### 7.4 Evidência verde

```
$ npx dotenv -e .env.test -- vitest run \
  tests/unit/lib/dashboard.test.ts \
  tests/integration/dashboard.integration.test.ts \
  tests/unit/app/dashboard-page.test.tsx \
  tests/unit/api/dashboard-route.test.ts
 Test Files  4 passed (4)
      Tests  119 passed (119)

$ npm test > /tmp/t.log 2>&1; tail -n 60 /tmp/t.log; pkill -9 -f vitest
 Test Files  62 passed (62)
      Tests  868 passed (868)

$ npm run lint
✖ 3 problems (0 errors, 3 warnings)   # warnings pré-existentes, fora do escopo desta task (coverage/*.js gerado e um teste não tocado)

$ npm run build
✓ Compiled successfully
  Running TypeScript ...
  Finished TypeScript in 3.7s ...
✓ Generating static pages using 7 workers (19/19)
```

Nenhuma regressão: os 59 arquivos que já estavam verdes continuam verdes;
os 3 arquivos estendidos pelo qa (dashboard.test.ts,
dashboard.integration.test.ts, dashboard-page.test.tsx) e o não-editado
(dashboard-route.test.ts) fecham 100% verdes. Sem `console.*`, sem `any`
nos arquivos alterados.

## 8. (reviewer preenche)

## 8. Revisão (reviewer)

**Veredito: APROVADO**

Suíte task-específica revalidada pelo reviewer (sem vitest concorrente, DT-026):
`4 passed (4) / 119 passed (119)`; suíte inteira 868/868 e build/lint limpos
conforme orquestrador. Sem `console.*` nos dois arquivos de produção; `formatBRL`
em todos os valores novos; primitivos `.card`/`.kpi-*` reusados nos cards novos.

### 8.1 Corretude verificada (eixo da task)

- **Match sem float.** `isBillPayment` usa `Prisma.Decimal.abs().equals(...)`
  (lib/dashboard.ts:126-137). O único `getTime()`/aritmética de `Number` é na
  distância de datas (janela em ms), nunca no dinheiro. Diferença de 1 centavo
  não casa — testado (`dashboard.test.ts` "diferenca de 1 centavo NAO casa").
- **Não exclui a categoria "Loans and financing" inteira.** CASO 3 do critério 2
  prova: gasto real de "Loans and financing" sem fatura casada conta como despesa
  (`dashboard.integration.test.ts`).
- **Débito na própria conta CREDIT_CARD não casa.** Guarda `row.account.type !==
  "CREDIT_CARD"` (lib/dashboard.ts:294) coberta por teste dedicado.
- **Só débito.** Valor positivo/estorno de mesmo valor não é excluído (guarda
  `isNegative()`, lib/dashboard.ts:122-124; testes puro e de integração).
- **Janela simétrica e inclusiva** (±10 dias, fronteira exata em ms testada nos
  dois extremos e a +1ms de fora).
- **Busca de faturas sem filtro de mês/conta** é intencional e testada (fatura com
  `dueDate` no mês seguinte ainda casa). Uma única transação nunca conta duas vezes:
  o `some(...)` e o `continue` garantem no máximo uma exclusão por linha (teste
  "duas faturas com o MESMO total ... exclui uma unica vez").
- **Ordem de exclusão** transferência → pagamento de fatura → receita/despesa está
  correta: cada linha cai em exatamente um ramo (todos os ramos terminam em
  `continue`/fim de iteração), nada conta em dobro nem escapa. `porMetodo` só soma
  no ramo despesa e só quando `classifyExpenseMethod != null` — pagamento de fatura
  e transferência ficam fora de `porMetodo` (testado explicitamente).
- **Testes não enfraquecidos.** O único teste alterado (`toEqual` do mês vazio)
  cresceu o shape (`porMetodo`/`pagamentosFaturaExcluidos` zerados) mantendo asserção
  exata — mudança de contrato legítima, não afrouxamento. Nenhum teste é
  verde-por-construção: os puros importam funções reais e os de integração batem no
  Postgres com valores da sondagem real.

### 8.2 Não-bloqueantes (não impedem aprovação)

1. **Risco de falso-positivo por over-exclusão — vira DT.** `isBillPayment` responde
   um booleano por linha e NÃO consome a fatura casada (sem vínculo 1:1). Consequências,
   todas aceitas pela decisão da seção 2, mas que devem ficar registradas:
   - Dois débitos legítimos de conta corrente com o valor exato de uma fatura dentro da
     janela seriam **ambos** excluídos (count=2 para 1 fatura), removendo um gasto real.
   - Como as faturas são buscadas sem filtro de conta, um débito pode casar com a fatura
     de **outro cartão** de mesmo valor. Quanto mais cartões/faturas, maior a superfície.
   O impacto hoje é baixo (match exige valor idêntico ao centavo + janela estreita), e o
   vínculo transação↔fatura específica já está roteado para a TASK-015 (ciclo de fatura).
   Recomendação: **abrir DT** ("pagamento de fatura casa por valor+janela sem consumir a
   fatura → risco de excluir gasto legítimo / casar cartão errado; resolver com match 1:1
   na TASK-015").
2. **`porMetodo` é subconjunto de `despesa` — vira DT + ajuste cosmético leve.** Os 4
   buckets não somam a despesa: gastos com `method` BOLETO/OTHER/null em conta não-cartão
   (ex. aluguel de R$1.806) ficam fora de todos — comportamento correto e testado, mas
   invisível para quem lê a tela. **Aceitar a lógica como está** (não bloquear), e:
   registrar DT + deixar claro na UI que "Gastos por método" é um recorte parcial (um
   rótulo/nota, ou um 5º card "Boleto/Outros" = `despesa − soma dos 4`). Ajuste pequeno,
   pode entrar aqui ou virar DT para a fase de refino de UI. Recomendo **DT** para não
   ampliar escopo desta correção.

### 8.3 O que vira DT (para docs/DEBITO-TECNICO.md)

- **DT novo (falso-positivo de pagamento de fatura):** match por valor+janela sem consumo
  1:1 da fatura pode excluir gasto legítimo ou casar fatura de outro cartão. Baixo hoje;
  fechar com vínculo transação↔fatura na TASK-015.
- **DT novo (recorte parcial de `porMetodo`):** os 4 buckets não somam a despesa (boleto/
  outros ficam fora); tornar explícito na UI ou adicionar bucket "Outros".
