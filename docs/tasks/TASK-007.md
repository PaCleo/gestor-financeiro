# TASK-007 — Tela de transações com filtros (fecha a Fase 2)
Status: CONCLUÍDA | Fase do roadmap: 2

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16, Vitest,
  Testing Library. Todos posteriores ao seu treinamento — consulte `node_modules/next/dist/docs/01-app/`,
  `node_modules/prisma` antes de assumir qualquer API.
- Leia `docs/DEBITO-TECNICO.md` e a **seção 11 da PREMISSA**.
- Padrões de frontend já estabelecidos na TASK-005: `jsdom` opt-in por arquivo via docblock
  `/** @vitest-environment jsdom */`; ambiente global segue `node`; com `globals: false`, cada teste
  de componente chama `cleanup()` explicitamente. Reaproveite.
- **DT-004**: `vi.spyOn(prisma, ...)` é engolido pelo Proxy. Mocke módulos inteiros.
- **DT-018**: pagamento de fatura/transferência entra com `amount` positivo. **Esta task não
  calcula receita/despesa agregada** (é Fase 5), então não precisa tratar isso — mas não introduza
  nenhum totalizador que some positivos como receita.
- Já existem: `lib/sync.ts`, `lib/db.ts`, os models `Account`/`Transaction` com dados reais no banco.

## 1. Objetivo

Fechar a Fase 2: uma tela onde o usuário **vê** as transações sincronizadas, com filtros — cumprindo
o critério de pronto da fase ("vejo minhas transações reais das instituições conectadas").

## 2. Comportamento esperado (TDD)

- DADO transações sincronizadas QUANDO abro a tela ENTÃO vejo a lista com data, descrição, valor
  (com sinal), conta, método e a categoria efetiva
- DADO uma transação com `categoryOverride` preenchido QUANDO a exibo ENTÃO a categoria mostrada é
  o `categoryOverride`; **senão**, a `category` da Pluggy (precedência override → Pluggy) — **DT-010**
- DADO uma transação `PENDING` QUANDO a exibo ENTÃO ela é visualmente distinguível de `POSTED`
  (a compra existe mas ainda não fechou)
- DADO o filtro por conta QUANDO seleciono uma conta ENTÃO vejo só as transações daquela conta
- DADO o filtro por período (data inicial/final) QUANDO aplico ENTÃO vejo só as transações no intervalo
- DADO muitas transações (o Item real tem 432) QUANDO abro a tela ENTÃO ela **pagina** ou limita de
  forma sã — não despeja centenas de linhas nem faz uma query sem limite
- DADO a consulta QUANDO ela retorna ENTÃO **nenhum** campo de PII (a task anterior já garantiu que
  não há CPF/CNPJ no banco; esta não pode reintroduzir nada disso na resposta)

## 3. Critérios de aceite

- [ ] 1. `GET /api/transactions` (casca fina) com filtros por conta e por período, e paginação;
      a query vive em `lib/` (ex. `lib/transactions.ts`), validada com **Zod** nos parâmetros
- [ ] 2. A categoria efetiva é resolvida em `lib/` como `categoryOverride ?? category`; teste cobre
      os dois casos (override presente e ausente)
- [ ] 3. Página (ex. `/transacoes`) que lista as transações e oferece os filtros de conta e período
- [ ] 4. Paginação real: a query usa `take`/`skip` (ou cursor) com um limite padrão; teste prova que
      não retorna a tabela inteira de uma vez
- [ ] 5. `PENDING` é visualmente distinto de `POSTED` na tela; teste de componente cobre
- [ ] 6. Ordenação por data decrescente (mais recentes primeiro) por padrão
- [ ] 7. Componentes testados com Testing Library; a query testada contra o Postgres real
- [ ] 8. Nenhum teste faz chamada de rede real; a suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 9. Nenhum `console.*` em produção
- [ ] 10. Suíte inteira verde (os anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 4. Fora de escopo

- **Regras de categorização por CPF/CNPJ** — é a TASK-008 (DT-019); aqui a categoria é só
  `categoryOverride ?? category`
- Editar/atribuir `categoryOverride` pela tela (pode virar parte da TASK-008 ou task própria)
- Totais por categoria, receita/despesa agregada, gráficos — Fase 5 (cuidado com DT-018)
- Fatura do cartão agrupada — Fase 5
- Disparar o sync pela tela (o `POST /api/sync` já existe; um botão é opcional e não é o foco)
- Lançamento manual de transação — Fase 3

## 5. Testes (preenchido pelo qa)

### 5.1 Arquivos criados

- `tests/unit/lib/transactions.test.ts` — funções puras: `resolveTransactionCategory`
  (Critério #2, DT-010) e `transactionsQuerySchema` (validação Zod dos parâmetros,
  Critério #1/#6).
- `tests/integration/transactions.integration.test.ts` — `listTransactions`/
  `listAccountsForFilter` ponta a ponta contra o Postgres real de teste
  (`gestor_test`) — categoria efetiva, filtro por conta, filtro por período
  (com atenção a fuso), paginação real com 432 transações (o número exato do
  Item real, PREMISSA seção 11), ordenação, PENDING/POSTED, precisão decimal
  e ausência de PII na resposta.
- `tests/unit/api/transactions-route.test.ts` — `GET /api/transactions`
  (`@/lib/transactions` mockada, exceto o schema Zod real via `importOriginal`).
- `tests/unit/app/transacoes-page.test.tsx` — `app/transacoes/page.tsx`
  (Server Component), Testing Library com `@vitest-environment jsdom`.

### 5.2 Como rodar

```bash
npm test                          # suite inteira (precisa de `docker compose up -d`/gestor_test rodando)
npm test -- tests/unit/lib/transactions.test.ts \
             tests/integration/transactions.integration.test.ts \
             tests/unit/api/transactions-route.test.ts \
             tests/unit/app/transacoes-page.test.tsx
                                   # so os arquivos desta task
npm run lint
npm run test:coverage
```

**Validação de contrato (mesma técnica da TASK-005):** antes de fechar a
task, implementei uma stub temporária de `lib/transactions.ts`,
`app/api/transactions/route.ts` e `app/transacoes/page.tsx` (nunca
commitada — criada, testada e revertida via `rm`) para provar que os 84
testes novos são satisfazíveis com a implementação exata do contrato da
seção 5.3, e que nenhum é um teste com bug de autoria. Resultado: **84/84
verde** com a stub, **405/405 verde** na suíte inteira (321 pré-existentes +
84 novos), `npm run lint` limpo. A stub foi então removida por completo
(`git status` confirma: só os 4 arquivos de teste ficam, nenhum arquivo de
produção).

### 5.3 Contrato assumido para o coder

#### `lib/transactions.ts` (novo)

```ts
export const DEFAULT_PAGE_SIZE = 50;   // < 432 (o Item real) de proposito -
                                        // prova, ja na constante, que a
                                        // paginacao e real (Criterio #4)
export const MAX_PAGE_SIZE = 100;      // teto aceito para `limit`

export const transactionsQuerySchema: ZodSchema
// z.object({
//   accountId: z.string().min(1).optional(),         // formato apenas -
//                                                      // existencia real e
//                                                      // checada em listTransactions
//   startDate: "YYYY-MM-DD" (regex + calendario valido).optional(),
//   endDate:   "YYYY-MM-DD" (regex + calendario valido).optional(),
//   page:  coerce.number().int().min(1).optional().default(1),
//   limit: coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
// }).refine(startDate <= endDate quando ambos presentes - comparacao
//           lexicografica de string ISO funciona direto)

export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;

export class AccountNotFoundError extends Error {}
// listTransactions rejeita com isso quando `accountId` tem formato valido
// mas NAO existe na tabela Account - a rota traduz para 400 (nao 500):
// "conta inexistente" e erro do chamador, nao falha interna.

export function resolveTransactionCategory(transaction: {
  category: string | null;
  categoryOverride: string | null;
}): string | null
// return transaction.categoryOverride ?? transaction.category
// ESCOPO DESTA TASK: so a precedencia override -> Pluggy. A regra por
// CPF/CNPJ (DT-019) e a TASK-008, NAO implementar aqui.

export interface TransactionListItem {
  id: string;
  date: Date;
  description: string;
  amount: string;        // Decimal.toString() - reconstruido campo a campo,
                          // nunca o objeto Decimal/row cru do Prisma
  accountId: string;
  accountName: string;   // Account.name via include/select - NUNCA account
                          // cru (evita reintroduzir taxNumber por engano)
  method: string | null;
  status: string;         // "PENDING" | "POSTED", repassado sem filtro
  category: string | null; // JA RESOLVIDA por resolveTransactionCategory
}

export interface ListTransactionsResult {
  transactions: TransactionListItem[];
  total: number;   // prisma.transaction.count() com o MESMO `where` (sem take/skip)
  page: number;
  limit: number;
}

export async function listTransactions(query: TransactionsQuery): Promise<ListTransactionsResult>
// 1. Se query.accountId, prisma.account.findUnique - null -> AccountNotFoundError.
// 2. where = { accountId? , date: { gte: startDateT00:00:00.000Z?, lte: endDateT23:59:59.999Z? } }
//    (ATENCAO AO FUSO: janela do dia inteiro em UTC - ver os testes de
//    fronteira 23:59:59/00:00:00 em transactions.integration.test.ts).
// 3. findMany({ where, orderBy: { date: "desc" }, skip: (page-1)*limit,
//    take: limit, include: { account: { select: { name: true } } } })
//    + count({ where }) EM PARALELO (Promise.all) - o `take`/`skip` e a
//    prova central do Criterio #4 (testado com 432 linhas reais no banco).
// 4. Mapeia cada row reconstruindo campo a campo (nunca spread), category
//    via resolveTransactionCategory.

export async function listAccountsForFilter(): Promise<Array<{ id: string; name: string }>>
// prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
// - usado pelo <select> de filtro da pagina.
```

#### `app/api/transactions/route.ts` (novo, casca fina)

```ts
export async function GET(request: Request): Promise<Response>
// 1. new URL(request.url).searchParams -> Object.fromEntries(...) -> rawQuery.
// 2. transactionsQuerySchema.safeParse(rawQuery) - invalido -> 400 ApiResponse<T>
//    (error: string), SEM chamar listTransactions.
// 3. try { listTransactions(parsed.data) } -> 200 { success: true,
//    data: result.transactions, meta: { total, page, limit } }.
// 4. catch: AccountNotFoundError -> 400 (nao 500); qualquer outro erro ->
//    500 generico, SEM vazar mensagem/stack do erro original.
// 5. Nunca console.*.
```

#### `app/transacoes/page.tsx` (novo, Server Component, SEM `"use client"`)

```ts
export default async function TransacoesPage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<JSX.Element>
// 1. await searchParams; transactionsQuerySchema.safeParse(rawParams) -
//    se invalido (ex.: URL digitada a mao com data malformada), cai no
//    filtro padrao { page: 1, limit: DEFAULT_PAGE_SIZE } em vez de lancar
//    (mesmo espirito "nao quebrar" do Criterio #1/#6, generalizado a tela).
// 2. Promise.all([listTransactions(query), listAccountsForFilter()]) -
//    busca direto de lib/, sem round-trip HTTP (mesmo padrao de
//    app/bancos/page.tsx da TASK-005).
// 3. <form method="GET"> com:
//    - <select id="accountId" name="accountId"> (label "Conta",
//      getByLabelText), uma <option> por conta de listAccountsForFilter,
//      defaultValue = query.accountId;
//    - <input id="startDate" name="startDate" type="date"> (label "Data
//      inicial"), defaultValue = query.startDate;
//    - <input id="endDate" name="endDate" type="date"> (label "Data
//      final"), defaultValue = query.endDate;
//    - botao de submit.
// 4. Por transacao: <tr data-testid={`transaction-row-${tx.id}`}
//    data-status={tx.status}> com data, descricao, valor com SINAL
//    EXPLICITO ("-" para negativo, "+" para positivo - nunca so a
//    ausencia de sinal), accountName, method, category (ja resolvida) e,
//    SE status === "PENDING", o texto "Pendente" visivel (Criterio #5) -
//    POSTED nao mostra esse indicador.
// 5. <nav aria-label="Paginação"> com links acessiveis por nome
//    "Anterior"/"Próxima", presentes so quando page > 1 / page < totalPages
//    (totalPages = ceil(total / limit)) - nunca renderiza mais linhas do
//    que listTransactions devolveu (Criterio #4).
// 6. transactions.length === 0 -> mensagem "Nenhuma transação encontrada."
```

### 5.4 Mapeamento critério de aceite → teste

| # | Critério (seção 3) | Teste(s) |
|---|---|---|
| 1 | `GET /api/transactions` casca fina, filtros por conta/período, paginação; query em `lib/`, validada com Zod | `tests/unit/api/transactions-route.test.ts` → describes `"validacao Zod dos parametros"` e `"sucesso, filtros repassados de verdade para listTransactions"`; `tests/unit/lib/transactions.test.ts` → describe `"transactionsQuerySchema..."` (23 testes); `tests/integration/transactions.integration.test.ts` → describes `"filtro por conta"` e `"filtro por periodo..."` |
| 2 | Categoria efetiva = `categoryOverride ?? category`, testados os dois casos | `tests/unit/lib/transactions.test.ts` → describe `"resolveTransactionCategory..."` (5 testes: override presente, ausente/null, undefined, ambos ausentes, string vazia); `tests/integration/transactions.integration.test.ts` → describe `"listTransactions - categoria efetiva contra o Postgres real..."` (3 testes) |
| 3 | Página `/transacoes` lista transações e oferece filtros de conta/período | `tests/unit/app/transacoes-page.test.tsx` → describes `"lista transacoes com data, descricao, valor com sinal, conta, metodo e categoria efetiva"` e `"filtros de conta e periodo"`; `tests/integration/transactions.integration.test.ts` → describe `"listAccountsForFilter..."` |
| 4 | Paginação real: `take`/`skip` (ou cursor) com limite padrão; teste prova que não retorna a tabela inteira | `tests/integration/transactions.integration.test.ts` → describe `"paginacao REAL: NAO retorna a tabela inteira"` (3 testes, incluindo 432 transações — o número exato do Item real — e a prova de `skip` via não-interseção entre páginas); `tests/unit/lib/transactions.test.ts` → `"DEFAULT_PAGE_SIZE e MAX_PAGE_SIZE sao positivos e MENORES que 432..."`; `tests/unit/app/transacoes-page.test.tsx` → describe `"paginacao..."` (4 testes, nunca renderiza mais linhas do que `listTransactions` devolveu) |
| 5 | `PENDING` visualmente distinto de `POSTED` na tela; teste de componente cobre | `tests/unit/app/transacoes-page.test.tsx` → describe `"PENDING e visualmente distinto de POSTED"`; `tests/integration/transactions.integration.test.ts` → describe `"status PENDING e POSTED sao ambos retornados, sem filtro implicito por status"` |
| 6 | Ordenação por data decrescente por padrão | `tests/integration/transactions.integration.test.ts` → describe `"ordenacao por data decrescente por padrao"` |
| 7 | Componentes testados com Testing Library; a query testada contra o Postgres real | `tests/unit/app/transacoes-page.test.tsx` (jsdom + Testing Library, `cleanup()` explícito); `tests/integration/transactions.integration.test.ts` (Postgres real de teste, `@/lib/db` NÃO mockado) |
| 8 | Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET` | Nenhum arquivo desta task importa `pluggy-sdk`/`@/lib/pluggy` — esta tela só lê dados já sincronizados do Postgres, sem tocar a Pluggy (ver nota abaixo) |
| 9 | Nenhum `console.*` em produção | `tests/unit/api/transactions-route.test.ts` → teste dedicado de `console.log/warn/error` no caminho feliz e no de erro |
| 10 | Suíte verde sem regressão; `build`/`lint` limpos | Confirmado pelo qa nesta entrega (ver evidência de RED abaixo); cabe ao coder manter os 321 pré-existentes + fazer os 84 novos passarem, e ao code-reviewer confirmar `npm run build` |
| — | Casos de borda: valor zero/negativo, data inválida, duplicidade | `tests/integration/transactions.integration.test.ts` → describe `"amount preservado com precisao decimal, incluindo zero e negativo"`; datas inválidas cobertas nos Zod tests (critério 1); duplicidade de `pluggyTransactionId` já é dedup sagrada da TASK-006 (fora de escopo re-testar aqui, esta tela só lê) |
| — | Defesa de PII (nenhum campo reintroduzido) | `tests/integration/transactions.integration.test.ts` → describe `"nao reintroduz PII na resposta"` (lista exaustiva de chaves) |

**Nota sobre "caminho de erro: API Pluggy fora do ar / Item LOGIN_ERROR/OUTDATED"
do prompt desta task:** não se aplica à TASK-007 — a tela de transações não
faz nenhuma chamada à Pluggy (lê exclusivamente dados já sincronizados no
Postgres pela TASK-006). O caminho de erro real e testado aqui é o análogo
correto para esta camada: Postgres indisponível / `listTransactions`
rejeitando de forma inesperada, coberto em
`tests/unit/api/transactions-route.test.ts` → describe `"erro inesperado
(Postgres fora do ar)..."`.

### 5.5 Evidência de RED (rodado nesta entrega, com a stub de validação já removida)

```
$ npm test
...
 Test Files  4 failed | 29 passed (33)
      Tests  70 failed | 321 passed (391)
```

As 70 falhas + a suíte `tests/unit/app/transacoes-page.test.tsx` (0 testes
coletados, falha de carregamento do arquivo inteiro) são, sem exceção,
`Cannot find package '@/lib/transactions'`, `Cannot find package
'@/app/api/transactions/route'` ou `Failed to resolve import
"@/app/transacoes/page"` — nunca erro de sintaxe/import quebrado nos
próprios arquivos de teste. **Nenhuma regressão**: os 321 testes
pré-existentes continuam verdes. `npm run lint` limpo (0 erros; os 2
warnings são os mesmos pré-existentes em `coverage/`, não relacionados a
esta task).

Validado GREEN antes de reverter (seção 5.2): **405/405** com a stub
temporária (321 + 84 novos), provando que o RED acima é por ausência de
implementação, não por teste malformado.

## 6. Implementação (preenchido pelo coder)

### Arquivos alterados/criados

- `lib/transactions.ts` (novo) — `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE`,
  `transactionsQuerySchema`, `TransactionsQuery`, `AccountNotFoundError`,
  `resolveTransactionCategory`, `TransactionListItem`,
  `ListTransactionsResult`, `listTransactions`, `listAccountsForFilter`.
- `app/api/transactions/route.ts` (novo) — `GET`, casca fina sobre
  `lib/transactions.ts`.
- `app/transacoes/page.tsx` (novo) — Server Component, lista + filtros +
  paginação.
- `docs/tasks/TASK-007.md` — esta seção.

Nenhum arquivo de teste foi tocado.

### Decisões tomadas

1. **Datas via `z.iso.date()` (Zod v4).** O regex embutido dessa API já
   valida calendário de verdade (rejeita `2026-02-30`, `2026-13-01`,
   ano bissexto etc.) e é ancorado (`^...$`) sem componente de hora — cobre
   todos os casos de borda do teste (`07/01/2026`, `2026`,
   `2026-07-01T00:00:00.000Z`) sem eu precisar escrever/validar um regex
   próprio. Evita reinventar uma validação que a lib já resolve melhor.
2. **`page`/`limit`: `z.coerce.number().int().min(1)...optional().default(n)`
   na ordem exata do contrato da seção 5.3.** Confirmado que
   `z.coerce.number()` sobre um array (`["1", "2"]`, caso de "query
   duplicada") produz `NaN` (via `Number([...])`), que falha em `.int()` —
   não precisei de validação extra para esse caso.
3. **Janela de período em UTC, construída por concatenação de string
   (`${startDate}T00:00:00.000Z` / `${endDate}T23:59:59.999Z`)** em vez de
   `new Date(startDate)` + manipulação de hora — mais direto e testado
   explicitamente nos casos de fronteira do teste de integração (23:59:59.999Z
   do último dia incluído, 00:00:00.000Z do dia seguinte excluído).
4. **`AccountNotFoundError` verificado ANTES do `where` de `listTransactions`**,
   com uma consulta dedicada (`account.findUnique`) — paga uma query extra
   quando `accountId` está presente, mas evita ambiguidade entre "conta
   existe mas não tem transações no período" (resultado vazio válido) e
   "conta não existe" (erro do chamador), que o `findMany` sozinho não
   distinguiria.
5. **`resolveTransactionCategory` chamada dentro do `.map()` de
   `listTransactions`**, nunca na rota nem na página — mantém a única fonte
   de verdade da precedência `categoryOverride ?? category` (DT-010) em
   `lib/`, como o contrato pede.
6. **Reconstrução campo a campo de cada `TransactionListItem`** (nunca
   spread de `row` nem de `row.account`) — evita vazar `Account.taxNumber`
   (não existe no schema atual, mas essa é a defesa em profundidade descrita
   na seção 11 da PREMISSA) ou qualquer campo futuro adicionado à tabela sem
   querer expor.
7. **Formatação de sinal do valor na página (`formatSignedAmount`) por
   string, não por `Number(...)`.** `TransactionListItem.amount` já é
   `Decimal.toString()` — uma transação negativa já vem com `"-"` embutido
   na própria string; só prefixo `+` quando a string não começa com `-`.
   Evita qualquer conversão para `number`/float no caminho de exibição de
   dinheiro (regra do prompt: "Valores monetários: `Decimal`... nunca
   `number` com float").
8. **Página valida `searchParams` com o MESMO `transactionsQuerySchema` da
   rota** (reexportado de `lib/transactions.ts`, nunca duplicado) e cai em
   `{ page: 1, limit: DEFAULT_PAGE_SIZE }` quando inválido, em vez de deixar
   a página quebrar com uma URL digitada à mão — exatamente o contrato da
   seção 5.3.
9. **Formulário de filtro é `<form method="GET">` puro** (sem `"use
   client"`, sem JS de submit) — a navegação por querystring nativa do
   browser já resolve o caso de uso; evita complexidade de Client Component
   não pedida por nenhum teste.
10. **Links de paginação (`<a href=...>`) constroem a querystring
    preservando `accountId`/`startDate`/`endDate`/`limit` e trocando só
    `page`** — necessário para que "Anterior"/"Próxima" não percam o filtro
    ativo.

### Dívidas técnicas assumidas

- Nenhuma nova. Fora de escopo desta task (já listado na seção 4 do
  próprio arquivo): edição de `categoryOverride` pela tela, totais
  agregados, fatura de cartão agrupada, regra de categorização por
  CPF/CNPJ (TASK-008/DT-019).
- Não implementei estado "conta selecionada não existe mais" na tela (ex.:
  se o usuário salvar/favoritar uma URL com `accountId` de uma conta depois
  excluída, `listTransactions` rejeitaria com `AccountNotFoundError`, e a
  página — que não tem `try/catch` ao redor de `listTransactions`, por
  contrato da seção 5.3 — propagaria o erro para a árvore de erro padrão do
  Next.js). Nenhum teste cobre esse caminho para a página (só para a rota,
  onde é tratado); não implementei tratamento não pedido.

### Validação

- `npm test` → 33 arquivos, **405/405 verde** (321 pré-existentes + 84
  novos desta task), sem regressão.
- `npx tsc --noEmit` → limpo.
- `npm run build` → limpo (`/transacoes` e `/api/transactions` aparecem na
  tabela de rotas geradas).
- `npm run lint` → 0 erros; os mesmos 2 warnings pré-existentes em
  `coverage/` (não relacionados a esta task).

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: **APROVADO** — sem bloqueantes.

Problemas encontrados (bloqueantes): nenhum.

Sugestões não-bloqueantes:
- **N1 (fuso):** teto `lte T23:59:59.999Z` deixa fresta sub-ms teórica; `lt <dia+1>T00:00:00.000Z`
  seria à prova de futuro. Inalcançável hoje (Date tem precisão de ms). Cosmético.
- **N2 (UX):** searchParam inválido faz a página descartar TODOS os filtros (inclusive `accountId`
  válido) ao cair em `DEFAULT_QUERY`. Aceitável no MVP; parse por-campo tolerante melhoraria.
- **N3 → DT-020:** página sem `try/catch` em `listTransactions` — URL salva com `accountId` de
  conta excluída cai na error boundary do Next (documentado pelo coder, seção 6). Família DT-016.
- **N4:** `formatSignedAmount("0.00")` → `"+0.00"` (zero exibido como positivo). Cosmético.

Verificado: paginação `take`/`skip` real com `count` no mesmo `where`; janela UTC de dia inteiro
com testes de fronteira; categoria = `categoryOverride ?? category` (sem CPF/CNPJ); sem agregação
(DT-018); reconstrução campo a campo sem spread e sem PII; `AccountNotFoundError` → 400 na rota;
500 genérico sem vazar stack (teste com poder de detecção real); nenhum `console.*`; `z.iso.date()`
válido no Zod 4.4.3; nenhum teste enfraquecido.
