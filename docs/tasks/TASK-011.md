# TASK-011 — Fatura do cartão (fecha a Fase 5)
Status: CONCLUÍDA | Fase do roadmap: 5

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16, Vitest,
  Testing Library. Posteriores ao seu treinamento — consulte a documentação instalada.
- Leia `docs/DEBITO-TECNICO.md` e a **seção 11 da PREMISSA** (bloco "Fatura do cartão vem de
  endpoint dedicado", com o formato real capturado).
- Padrões: erro de domínio com mensagem fixa; rota casca fina; `ApiResponse<T>`; frontend com
  jsdom opt-in + `cleanup()`; Zod nos params; reconstrução campo a campo (sem spread).
- **DT-004**: `vi.spyOn(prisma, ...)` é engolido pelo Proxy. Mocke módulos inteiros.
- **DT-013 (regra permanente):** coluna/tabela nova segura em base com dados (aqui é tabela nova).
- **ADR 7:** sync em série, 1 requisição por vez.
- Já existem: `lib/sync.ts` (`syncBankItem`/`syncAllActiveBankItems`), `lib/pluggy.ts`
  (`fetchPluggyAccounts`, `fetchPluggyAllTransactions`), `Account` (com `type`).
- **A dedup é sagrada.** Faturas deduplicam por `pluggyBillId` (como transações por
  `pluggyTransactionId`) — upsert, nunca duplica.

## 1. Objetivo

Responder a terceira pergunta da Visão — **quanto vai fechar minha fatura** — sincronizando e
mostrando as faturas do cartão (atual em destaque + histórico), do endpoint dedicado da Pluggy.

## 2. Comportamento esperado (TDD)

### Sync das faturas
- DADO uma conta `CREDIT` QUANDO sincronizo ENTÃO cada fatura da Pluggy é persistida
  (`pluggyBillId`, `dueDate`, `totalAmount`, `minimumPaymentAmount`) e re-sincronizar **atualiza** (upsert), não duplica
- DADO uma conta `BANK` (ou `CASH`) QUANDO sincronizo ENTÃO **nenhuma** fatura é buscada para ela
- DADO um cartão sem faturas (a Pluggy devolve lista vazia) QUANDO sincronizo ENTÃO não quebra —
  simplesmente não há faturas para aquele cartão
- DADO a mesma fatura sincronizada duas vezes QUANDO re-sincronizo ENTÃO **não duplica**
  (dedup por `pluggyBillId`)
- DADO um `BankItem` arquivado QUANDO sincronizo ENTÃO suas faturas não são buscadas (já ignorado no nível do Item)

### Exibição
- DADO faturas de um cartão QUANDO abro a tela ENTÃO vejo a **mais recente** em destaque (total,
  vencimento, mínimo) e as anteriores como histórico, decrescente por `dueDate`
- DADO um cartão sem faturas QUANDO abro ENTÃO vejo um estado vazio claro, sem erro
- DADO valores monetários QUANDO exibo ENTÃO usam `Decimal` (sem erro de float)

## 3. Critérios de aceite

- [ ] 1. Model `CreditCardBill` (`pluggyBillId @unique`, `accountId` + relação, `dueDate`,
      `totalAmount Decimal @db.Decimal(14,2)`, `minimumPaymentAmount Decimal?`), migration nova.
      `onDelete` explícito na relação com `Account` (evita o DT-003/DT-005; decida e documente)
- [ ] 2. `lib/pluggy.ts`: `fetchPluggyBills(accountId)` usa `client.fetchCreditCardBills`,
      reconstrói campo a campo (sem spread), erro de domínio com mensagem fixa
- [ ] 3. `lib/` (ex. `lib/bills.ts`): persiste as faturas por upsert em `pluggyBillId`; `lib/sync.ts`
      chama isso **só para contas `CREDIT`**, em série, dentro do fluxo de sync existente
- [ ] 4. **Dedup provada:** re-sync não duplica faturas; teste conta os registros
- [ ] 5. Teste prova que contas `BANK`/`CASH` **não** disparam busca de fatura, e que cartão sem
      fatura não quebra
- [ ] 6. Teste prova que o sync de faturas **não** altera nem apaga `Transaction`s nem `Account`s
      (não regride nada da Fase 2)
- [ ] 7. `GET /api/bills` (casca fina, Zod se houver filtro) e página (ex. `/faturas`): fatura atual
      em destaque + histórico por cartão. Testing Library
- [ ] 8. Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 9. Nenhum `console.*` em produção
- [ ] 10. Suíte inteira verde (os anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 4. Fora de escopo

- **Transações-linha de cada fatura** (exigiria re-adicionar `creditCardMetadata.billId` às
  transações; a TASK-006 descartou). Nível resumo só
- **Fatura aberta/forecast** (a que ainda acumula) — o endpoint dá as fechadas; a aberta viria de
  `account.creditData`/PENDING. Refinamento futuro; registrar como observação se relevante
- `financeCharges` e `payments` detalhados da fatura (só total/vencimento/mínimo nesta task)
- "O que falta pagar" / contas fixas (Fase 4, pulada)
- Pagar a fatura pelo app

## 5. Testes (preenchido pelo qa)

### Contrato assumido (o coder implementa exatamente assim)

```
prisma/schema.prisma
  model CreditCardBill {
    id                   String   @id @default(cuid())
    pluggyBillId         String   @unique
    accountId            String
    account              Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
    dueDate              DateTime
    totalAmount          Decimal  @db.Decimal(14, 2)
    minimumPaymentAmount Decimal? @db.Decimal(14, 2)
  }
  // Account ganha `creditCardBills CreditCardBill[]`.
  // onDelete: Cascade (decisão desta task, documentada em
  // tests/unit/schema/credit-card-bill.test.ts): diferente de
  // Transaction.account (Restrict — preserva o histórico financeiro
  // primário), CreditCardBill é um resumo DERIVADO que a Pluggy recalcula a
  // cada re-sync — não é a fonte de verdade dos movimentos de dinheiro do
  // usuário. Bloquear a exclusão de uma Account por causa de faturas-resumo
  // seria inconsistente (mesmo espírito de Account.bankItem, já Cascade).

lib/pluggy.ts
  export class PluggyBillsFetchError extends Error {}
  export type PluggyRawBill = {
    pluggyBillId: string;
    dueDate: Date;
    totalAmount: number;
    minimumPaymentAmount: number | null;
  };
  export async function fetchPluggyBills(pluggyAccountId: string): Promise<PluggyRawBill[]>
  // client.fetchCreditCardBills(pluggyAccountId) -> PageResponse<CreditCardBills>,
  // usa SOMENTE .results, reconstrói campo a campo (nunca espalha ...bill —
  // payments/financeCharges/allowsInstallments/totalAmountCurrencyCode NUNCA
  // vazam). Mesma validação de credenciais e mesmo padrão de tradução de
  // erro das demais funções do módulo.

lib/bills.ts
  export async function syncCreditCardBills(accountId: string, rawBills: PluggyRawBill[]): Promise<number>
  // upsert por pluggyBillId, EM SÉRIE; create tem
  // {pluggyBillId, accountId, dueDate, totalAmount, minimumPaymentAmount},
  // update tem {dueDate, totalAmount, minimumPaymentAmount}; devolve
  // rawBills.length.

  export class AccountNotFoundError extends Error {}  // "Conta não encontrada."

  export const billsQuerySchema = z.object({ accountId: z.string().min(1).optional() });
  export type BillsQuery = z.infer<typeof billsQuerySchema>;

  export interface CreditCardBillListItem {
    id: string; pluggyBillId: string; accountId: string; accountName: string;
    dueDate: Date; totalAmount: string; minimumPaymentAmount: string | null;
  }
  export async function listBills(query?: BillsQuery): Promise<CreditCardBillListItem[]>
  // sem accountId: todas as faturas, orderBy dueDate desc. Com accountId:
  // verifica que a Account existe (senão AccountNotFoundError) e filtra.
  // totalAmount/minimumPaymentAmount SEMPRE string (Decimal.toString()).

  export interface CardBillsGroup {
    accountId: string; accountName: string;
    current: CreditCardBillListItem | null; history: CreditCardBillListItem[];
  }
  export async function listBillsByCard(): Promise<CardBillsGroup[]>
  // uma entrada por Account type === "CREDIT_CARD" (nunca CHECKING/SAVINGS/
  // CASH); current = fatura mais recente (dueDate desc) ou null; history =
  // as demais, mesma ordem decrescente.

lib/sync.ts (syncBankItem, dentro do loop por account, EM SÉRIE, depois de
sincronizar as transactions daquela conta)
  - se rawAccount.type === "CREDIT": fetchPluggyBills(rawAccount.pluggyAccountId)
    -> syncCreditCardBills(account.id, rawBills) (account.id = id INTERNO,
    já upsertado).
  - se rawAccount.type !== "CREDIT" (ex. "BANK"): NUNCA chama
    fetchPluggyBills nem syncCreditCardBills.
  - O RETORNO de syncBankItem NÃO MUDA: continua
    { bankItemId, accountsSynced, transactionsSynced } — sem contagem de
    faturas exposta (evita quebrar os testes já existentes de TASK-006/007/008
    que fazem toEqual exato desse objeto).
  - Falha em fetchPluggyBills/syncCreditCardBills propaga (mesmo padrão de
    fetchPluggyAccounts/fetchPluggyAllTransactions) — syncBankItem rejeita,
    lastSyncAt não é atualizado; o que já foi persistido antes da falha
    permanece (sem rollback, mesmo comportamento pré-existente do módulo).

app/api/bills/route.ts
  export async function GET(request: Request): Promise<Response>
  // casca fina: parseia query com billsQuerySchema (accountId inválido/vazio
  // -> 400 sem chamar listBills), chama listBills(parsed), 200
  // { success: true, data } SEM meta (sem paginação, mesmo padrão de
  // /api/dashboard). AccountNotFoundError -> 400. Qualquer outro erro -> 500
  // genérico. Nenhum console.*.

app/faturas/page.tsx
  export default async function FaturasPage(): Promise<JSX.Element>
  // Server Component (sem "use client"), chama listBillsByCard() direto
  // (sem round-trip HTTP, mesmo padrão de /transacoes e /dashboard). Uma
  // seção por cartão (data-testid="card-<accountId>") com o nome do cartão;
  // se current existir, um destaque (data-testid="current-bill-<accountId>")
  // com vencimento/total/mínimo (mínimo null -> placeholder, nunca "null");
  // se current for null, estado vazio claro para aquele cartão; history vira
  // uma lista de itens (data-testid="history-bill-<billId>"), na MESMA ordem
  // recebida (já decrescente); se listBillsByCard() devolver [], estado
  // vazio geral da página.
```

### Arquivos criados/alterados

**Novos:**
- `tests/unit/schema/credit-card-bill.test.ts` — model `CreditCardBill` no `schema.prisma` (texto).
- `tests/unit/lib/bills.test.ts` — `lib/bills.ts` unitário (mock de `@/lib/db`, DT-004).
- `tests/unit/api/bills-route.test.ts` — `GET /api/bills` casca fina.
- `tests/unit/app/faturas-page.test.tsx` — página `/faturas`, Testing Library.
- `tests/integration/bills.integration.test.ts` — `lib/bills.ts` contra o Postgres real + constraints do model (unicidade, cascade, precisão Decimal).

**Estendidos:**
- `tests/unit/lib/pluggy.test.ts` — describes novos de `fetchPluggyBills` (mock `fetchCreditCardBillsMock` adicionado ao `PluggyClientMock` hoisted).
- `tests/unit/lib/sync.test.ts` — describes novos do sync de faturas; `vi.mock("@/lib/pluggy", ...)` ganhou `fetchPluggyBills`, novo `vi.mock("@/lib/bills", ...)`, `beforeEach` ganhou defaults seguros (`fetchPluggyBillsMock.mockResolvedValue([])`, `syncCreditCardBillsMock.mockResolvedValue(0)`) para não quebrar os testes já existentes de contas CREDIT das tasks anteriores.
- `tests/integration/sync.integration.test.ts` — describes novos ponta a ponta; `PluggyClientMock` hoisted ganhou `fetchCreditCardBillsMock` com default `pageResponse([])` no `beforeEach` global (mesmo motivo acima, aplicado a TODOS os testes do arquivo, não só os novos).
- `tests/fixtures/pluggy.ts` — `buildMockPluggyCreditCardBillResponse` / `buildMockPluggyCreditCardBillWithoutMinimum` (formato real de `CreditCardBills`, com `payments`/`financeCharges` preenchidos para poder provar não-vazamento — lição do DT-011).
- `tests/fixtures/db.ts` — `buildCreditCardBill`.
- `tests/setup/reset-db.ts` — `resetCreditCardBillTable` (não incluída em `resetDatabase`/`ALL_TABLES`, mesmo motivo do `resetCategoryRuleTable` da TASK-008: evitar quebrar a suíte inteira em RED pelo motivo errado antes da migration existir). Nota: não é necessária nos testes de `sync.integration.test.ts`/`bills.integration.test.ts` porque `TRUNCATE "Account" ... CASCADE` (dentro de `resetDatabase`) já propaga para `CreditCardBill` via FK, independente do `onDelete` da relação.

### Comandos para rodar

```bash
# Suíte inteira (o que o coordenador/coder deve rodar ao final)
npm test

# Só os arquivos desta task
npm test -- tests/unit/schema/credit-card-bill.test.ts tests/unit/lib/bills.test.ts \
  tests/unit/api/bills-route.test.ts tests/unit/app/faturas-page.test.tsx \
  tests/integration/bills.integration.test.ts tests/unit/lib/pluggy.test.ts \
  tests/unit/lib/sync.test.ts tests/integration/sync.integration.test.ts
```

Pré-requisito: Postgres de teste no ar (`npm run db:up`), `.env.test` presente (`CLIENT_ID`/`CLIENT_SECRET` vazios — nenhum teste faz chamada de rede real).

### Estado RED confirmado (antes da implementação do coder)

`npm test` → **8 arquivos falham, 50 passam** | **82 testes falham, 713 passam de 795** (baseline pré-existente: 710 testes, todos os 50 arquivos não tocados por esta task continuam 100% verdes — **zero regressão**). Os 85 testes novos desta task se dividem em 82 que falham pelo motivo certo (módulo/model/rota/página inexistentes — `Cannot find module`, `prisma.creditCardBill is undefined`, "model CreditCardBill nao encontrado", etc., nunca erro de sintaxe) e **3 que já passam hoje, investigados e documentados abaixo** (nenhum é o problema descrito no DT-011 — não são asserções estruturalmente infalseáveis, são invariantes de "ainda não implementado ⇒ trivialmente satisfeito" que continuam válidas e com poder de detecção real depois que o coder implementar):

1. `tests/unit/lib/sync.test.ts` → *"conta BANK: NUNCA chama fetchPluggyBills nem syncCreditCardBills"* — passa porque `syncBankItem` hoje não importa/chama `fetchPluggyBills` para NENHUMA conta ainda; continuará passando depois da implementação correta, e FALHARIA se o coder chamasse `fetchPluggyBills` incondicionalmente (não só para CREDIT).
2. `tests/unit/lib/sync.test.ts` → *"BankItem arquivado: faturas NUNCA sao buscadas..."* — mesma razão; a guarda de `archivedAt` já existe (TASK-006) e já impede qualquer chamada à Pluggy, faturas incluído.
3. `tests/integration/sync.integration.test.ts` → *"sincronizar as faturas de um cartao NAO altera nem apaga nenhuma Transaction ja sincronizada daquela conta"* — passa porque hoje `syncBankItem` não mexe em fatura nenhuma, então obviamente não interfere na Transaction; serve de FOTO do comportamento correto que precisa continuar valendo depois que o coder ligar o sync de faturas (o par dela, no mesmo describe, que soma `creditCardBill.count()`, falha corretamente porque a tabela ainda não existe).

Comando usado para confirmar (saída completa arquivada pelo qa):
```
npm test
# Test Files  8 failed | 50 passed (58)
#      Tests  82 failed | 713 passed (795)
```

`npx eslint` nos 11 arquivos criados/alterados desta task: limpo (0 problemas).

### Mapeamento critério de aceite → teste

**Critério 1 — model `CreditCardBill` (`pluggyBillId @unique`, `accountId`+relação, `dueDate`, `totalAmount Decimal(14,2)`, `minimumPaymentAmount Decimal?`), `onDelete` explícito e documentado:**
- `tests/unit/schema/credit-card-bill.test.ts` — todos os `it`s do describe único (existência do model, `pluggyBillId @unique`, `accountId` obrigatório, relação `onDelete: Cascade`, `dueDate DateTime`, `totalAmount Decimal` não-nullable com `@db.Decimal(14,2)`, `minimumPaymentAmount Decimal?` nullable, ausência de `payments`/`financeCharges`, migration cria a tabela e a constraint única).
- `tests/integration/bills.integration.test.ts` → describe `"model CreditCardBill - unicidade de pluggyBillId..."` (constraint única real, precisão Decimal, `minimumPaymentAmount` null) e `"model CreditCardBill - onDelete: Cascade com Account..."` (cascade real).

**Critério 2 — `fetchPluggyBills(accountId)` usa `client.fetchCreditCardBills`, reconstrói campo a campo, erro de domínio com mensagem fixa:**
- `tests/unit/lib/pluggy.test.ts` → describes `"fetchPluggyBills - sucesso..."`, `"fetchPluggyBills - credenciais ausentes"`, `"fetchPluggyBills - falha da Pluggy..."` (mapeamento de campos, chamada com `pluggyAccountId`, não-vazamento de `payments`/`financeCharges`/`allowsInstallments`/`totalAmountCurrencyCode`, `PluggyConfigError`, `PluggyBillsFetchError`, sem `console.*`).

**Critério 3 — `lib/bills.ts` persiste por upsert em `pluggyBillId`; `lib/sync.ts` chama isso só para contas `CREDIT`, em série:**
- `tests/unit/lib/bills.test.ts` → describe `"syncCreditCardBills - upsert por pluggyBillId..."`.
- `tests/unit/lib/sync.test.ts` → describe `"syncBankItem - faturas do cartao, SO para contas CREDIT..."`, testes *"conta CREDIT: busca as faturas e persiste via syncCreditCardBills..."* e *"varias contas CREDIT sao processadas EM SERIE..."*.
- `tests/integration/sync.integration.test.ts` → describe `"syncBankItem - faturas do cartao: persistidas SO para contas CREDIT..."`, teste *"conta CREDIT: cada fatura da Pluggy e persistida..."*.

**Critério 4 — dedup provada por contagem (re-sync não duplica):**
- `tests/unit/lib/bills.test.ts` → *"uma fatura: chama upsert com where.pluggyBillId..."* e *"varias faturas: uma chamada de upsert por fatura..."* (upsert por chave, não `create`).
- `tests/integration/sync.integration.test.ts` → describe `"syncBankItem - dedup de faturas por pluggyBillId, upsert NAO duplica..."` (as 3 provas centrais: mesma fatura duas vezes, fatura que muda de valor, 13 faturas sem colisão).
- `tests/integration/bills.integration.test.ts` → *"rejeita uma segunda CreditCardBill com o MESMO pluggyBillId..."* (a constraint do banco por trás do upsert).

**Critério 5 — só `CREDIT` dispara busca de fatura; cartão sem fatura não quebra:**
- `tests/unit/lib/sync.test.ts` → *"conta BANK: NUNCA chama fetchPluggyBills nem syncCreditCardBills"*, *"cartao sem faturas (fetchPluggyBills devolve []) nao quebra..."*, *"BankItem arquivado: faturas NUNCA sao buscadas..."*.
- `tests/integration/sync.integration.test.ts` → *"conta BANK: fetchCreditCardBills NUNCA e chamado..."*, *"uma conta BANK e uma CREDIT no MESMO BankItem..."*, *"cartao sem faturas (results: []) nao quebra..."*.
- `tests/unit/lib/pluggy.test.ts` → *"cartao sem faturas (results: []) devolve array vazio, sem lancar..."*.

**Critério 6 — sync de faturas não altera/apaga `Transaction`s nem `Account`s:**
- `tests/integration/sync.integration.test.ts` → describe `"syncBankItem - o sync de faturas NAO regride a Fase 2..."` (as 2 provas: transação intacta byte a byte após sync com fatura, e contagem de `Account`/`Transaction` idêntica antes/depois de um re-sync completo com faturas).

**Critério 7 — `GET /api/bills` (casca fina, Zod) e página `/faturas` (atual em destaque + histórico por cartão):**
- `tests/unit/lib/bills.test.ts` → describes `"billsQuerySchema..."`, `"listBills - sem filtro..."`, `"listBills - com filtro accountId..."`, `"listBillsByCard..."`.
- `tests/integration/bills.integration.test.ts` → describes `"listBills - contra o Postgres real..."` e `"listBillsByCard - agrupado por cartao contra o Postgres real..."` (inclui o cenário de 13 faturas → atual + 12 no histórico, decrescente).
- `tests/unit/api/bills-route.test.ts` → describes de validação Zod, sucesso, `AccountNotFoundError` → 400, erro genérico → 500.
- `tests/unit/app/faturas-page.test.tsx` → describes `"fatura atual em destaque..."`, `"historico decrescente por dueDate..."`, `"estado vazio por cartao..."`, `"estado vazio geral..."`, `"varios cartoes..."`.

**Estado vazio (cartão sem fatura) na tela, sem erro:**
- `tests/unit/app/faturas-page.test.tsx` → *"cartao SEM nenhuma fatura (current=null) mostra uma mensagem clara, sem lancar erro"*.
- `tests/integration/bills.integration.test.ts` → *"cartao sem NENHUMA fatura aparece com current=null e history=[]..."*.

**Valores monetários usam `Decimal`, sem erro de float:**
- `tests/integration/sync.integration.test.ts` → describe `"syncBankItem - Decimal, sem erro de float..."`.
- `tests/integration/bills.integration.test.ts` → *"grava e le totalAmount/minimumPaymentAmount com precisao Decimal..."* e *"totalAmount/minimumPaymentAmount saem como STRING (Decimal, nunca number/float)"*.

**`minimumPaymentAmount` nullable (cenário de borda explícito do prompt):**
- `tests/fixtures/pluggy.ts` → `buildMockPluggyCreditCardBillWithoutMinimum`.
- `tests/unit/lib/pluggy.test.ts` → *"minimumPaymentAmount null (fatura sem minimo definido) e preservado como null..."*.
- `tests/unit/lib/bills.test.ts` → *"minimumPaymentAmount null e repassado como null..."* (sync) e *"minimumPaymentAmount null na linha vira null na saida..."* (listBills).
- `tests/integration/sync.integration.test.ts` → *"minimumPaymentAmount null (fatura sem minimo) e persistido como null..."*.
- `tests/integration/bills.integration.test.ts` → *"minimumPaymentAmount aceita null..."* e *"cartao com uma fatura sem minimo definido: current.minimumPaymentAmount e null"*.

**Critério 8 — nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`:**
- Todos os arquivos desta task mockam `"pluggy-sdk"` inteiro (unit) ou só isso (integration) — mesmo padrão de TASK-003/006. `.env.test` já define `CLIENT_ID`/`CLIENT_SECRET` vazios; os testes de `lib/pluggy.ts` cobrem esse caminho explicitamente (describes "credenciais ausentes").

**Critério 9 — nenhum `console.*` em produção:**
- `tests/unit/lib/pluggy.test.ts` (`fetchPluggyBills`) e `tests/unit/api/bills-route.test.ts` têm um teste dedicado de `console.log/warn/error` não chamado em cada caminho (feliz e de erro), mesmo padrão dos demais módulos.

**Critério 10 — suíte inteira verde, `npm run build`/`npm run lint` limpos:** verificado pelo coder/reviewer ao final; o qa confirmou que os 50 arquivos de teste não tocados por esta task permanecem 100% verdes (RED só nos 8 arquivos desta task, pelo motivo certo).

## 6. Implementação (preenchido pelo coder)

### Arquivos alterados

**Novos:**
- `prisma/migrations/20260819200645_add_credit_card_bill/migration.sql` — cria a tabela
  `CreditCardBill` (`pluggyBillId` unique, FK `accountId -> Account.id` com `ON DELETE CASCADE`).
- `lib/bills.ts` — `syncCreditCardBills`, `AccountNotFoundError`, `billsQuerySchema`/`BillsQuery`,
  `CreditCardBillListItem`, `listBills`, `CardBillsGroup`, `listBillsByCard` (implementados
  exatamente conforme o contrato da seção 5).
- `app/api/bills/route.ts` — `GET /api/bills`, casca fina (Zod + `listBills`, `AccountNotFoundError`
  → 400, outro erro → 500).
- `app/faturas/page.tsx` — Server Component, `listBillsByCard()` direto, uma seção por cartão com
  destaque (`current-bill-<accountId>`) e histórico (`history-bill-<billId>`), estados vazios por
  cartão e geral.

**Alterados:**
- `prisma/schema.prisma` — novo model `CreditCardBill` (campos exatamente como o contrato: `id`,
  `pluggyBillId @unique`, `accountId`, relação `account` com `onDelete: Cascade`, `dueDate`,
  `totalAmount Decimal @db.Decimal(14,2)`, `minimumPaymentAmount Decimal? @db.Decimal(14,2)`);
  `Account` ganhou `creditCardBills CreditCardBill[]`. Comentário de topo do arquivo estendido
  documentando a decisão de `onDelete: Cascade` (mesmo texto do teste de schema).
- `lib/pluggy.ts` — nova `PluggyBillsFetchError`, `PluggyRawBill`, `fetchPluggyBills(pluggyAccountId)`
  (chama `client.fetchCreditCardBills`, usa só `.results`, reconstrói campo a campo — nunca espalha
  `...bill` — mesmo padrão de `fetchPluggyAccounts`/`fetchPluggyAllTransactions`).
- `lib/sync.ts` — `syncBankItem` importa `fetchPluggyBills` (`@/lib/pluggy`) e `syncCreditCardBills`
  (`@/lib/bills`); dentro do loop por account, EM SÉRIE, logo depois de sincronizar as transactions
  daquela conta, se `rawAccount.type === "CREDIT"` busca e persiste as faturas com `account.id`
  (id interno). Contas não-`CREDIT` nunca chamam essas funções. O retorno de `syncBankItem`
  permanece `{ bankItemId, accountsSynced, transactionsSynced }` (sem contagem de faturas).

### Decisões tomadas

- **`onDelete: Cascade` em `CreditCardBill.account`**, exatamente como o contrato da seção 5 (e o
  teste de schema) já especificava: `CreditCardBill` é um resumo derivado, recalculável a cada
  re-sync — não é a fonte de verdade dos movimentos de dinheiro (essa continua sendo `Transaction`,
  protegida por `Restrict`). Nenhum debate a reabrir aqui, só segui a decisão já registrada.
- **Migration nova via `prisma migrate dev`** (tabela nova, sem coluna adicionada a tabela
  existente — DT-013 não se aplica). Apliquei a mesma migration em `.env.local` (banco de dev,
  `gestor`) via `prisma migrate deploy`, porque `npm run build` faz prerender de `/faturas`
  (Server Component) contra esse banco e falhava com `P2021` (tabela ausente) até eu aplicar.
- **`syncCreditCardBills` em série** (`for...of` com `await` dentro do loop), sem `Promise.all`,
  seguindo ADR 7 — mesmo padrão do restante de `lib/sync.ts`.
- **`listBillsByCard` busca as faturas de cada cartão em série** (um `findMany` por account, dentro
  de um `for...of`), não em paralelo. Não há requisito explícito de "série" para leitura (ADR 7 fala
  de chamadas à Pluggy), mas é o padrão mais simples e suficiente para o volume esperado (poucos
  cartões); nenhum teste exige paralelismo aqui.
- **`app/faturas/page.tsx` sem `"use client"`** — Server Component puro, mesmo padrão de
  `/transacoes` e `/dashboard`, evitando o problema da TASK-009 (vazar `pg`/`lib/db` para o bundle
  do cliente). Confirmado com `npm run build`: `/faturas` aparece como rota estática (`○`), sem
  bundle de cliente.
- **Placeholder de `minimumPaymentAmount` nulo na tela**: usei o texto `"Nao informado"` — nenhum
  teste fixa o texto exato, só exige que a string `"null"` nunca apareça (verificado).

### Dívidas assumidas

- Nenhuma dívida técnica nova identificada durante esta task. A fatura "aberta" (ainda acumulando,
  forecast) e o detalhamento de `payments`/`financeCharges` seguem fora de escopo, conforme a
  seção 4 — não implementados, não simulados.
- Nenhum `any` usado. Nenhum `console.*` em código de produção.

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO

Suíte 803/803 verde (rodada por mim, sem CLIENT_ID/CLIENT_SECRET), `npx tsc --noEmit`
exit 0, `npm run lint` sem erros (as 2 únicas warnings estão em `coverage/`, arquivo
gerado, fora desta task). Revisão feita sobre o working tree real (a implementação está
não-commitada), não sobre a seção 6.

### Verificações centrais (pedidos de julgamento do coordenador)

1. **Gate por CREDIT (critério 5) — CONFIRMADO com poder de detecção real.**
   `lib/sync.ts:225` só chama `fetchPluggyBills`/`syncCreditCardBills` dentro de
   `if (rawAccount.type === "CREDIT")`. Fiz teste de mutação: troquei a condição por
   `if (true)` e rodei `tests/unit/lib/sync.test.ts` → o teste *"conta BANK: NUNCA chama
   fetchPluggyBills nem syncCreditCardBills"* (linha 545) FALHOU. Ou seja: deixou de ser
   verde-por-construção (estado RED da seção 5) e agora mata a mutação. Revertido.

2. **Dedup por `pluggyBillId` — CONFIRMADO.** `lib/bills.ts:26` usa `prisma.creditCardBill.upsert`
   com `where: { pluggyBillId }`, `create`/`update` campo a campo. Upsert atômico real, sem
   SELECT+INSERT (sem janela de corrida). `pluggyBillId @unique` no schema e na migration
   (`CreditCardBill_pluggyBillId_key`) sustenta o upsert por baixo.

3. **Não regride a Fase 2 (critério 6) — CONFIRMADO.** O passo de faturas
   (`lib/sync.ts:225-228`) roda DEPOIS do loop de transações e só toca `creditCardBill`;
   não altera `Transaction`/`Account`. Retorno de `syncBankItem` inalterado
   (`{ bankItemId, accountsSynced, transactionsSynced }` — sem contagem de faturas),
   preservando os `toEqual` exatos das TASK-006/007/008. Os testes de não-regressão de
   integração (linhas 1172-1238) agora exercitam o caminho real (fatura de fato persistida),
   não são mais verde-por-construção.

4. **`onDelete: Cascade` — CONCORDO, sem armadilha com o DT-005.** A topologia do caminho de
   exclusão continua com uma única FK `Restrict` (`Transaction.account`), que é a que dispara
   o P2003 traduzido em `lib/bank-item.ts:49`. `CreditCardBill.account` é `Cascade`: nunca
   levanta P2003, apenas apaga junto quando a Account cai por cascata do BankItem. Logo a FK
   nova NÃO cria caminho para uma tradução errada de "BankItem tem transações". Decisão
   coerente: fatura é resumo derivado, recalculável a cada re-sync — não é fonte de verdade
   (≠ Transaction). Verificado que não há delete direto de Account no código; a exclusão só
   ocorre via cascata de BankItem.

5. **Reconstrução campo a campo / não-vazamento (DT-011) — CONFIRMADO com poder real.**
   `fetchPluggyBills` (lib/pluggy.ts) mapeia só `id/dueDate/totalAmount/minimumPaymentAmount`,
   nunca espalha `...bill`. Mapeamento confere com o tipo real do SDK
   (`node_modules/pluggy-sdk/dist/types/creditCardBills.d.ts`). A fixture
   `buildMockPluggyCreditCardBillResponse` inclui `payments`/`financeCharges`/
   `allowsInstallments`/`totalAmountCurrencyCode` PREENCHIDOS com valores reais, e o teste de
   pluggy (linhas 1865-1896) primeiro afirma que a entrada os contém e depois que a saída
   serializada não contém nem os campos nem os valores (`payment-1`, `finance-charge-1`) —
   asserção falseável, respeita a regra permanente do DT-011. Sem PII. Sem `console.*` em
   nenhum arquivo de produção da task (verificado por grep; os únicos hits são comentários).

### Problemas encontrados (bloqueantes)

Nenhum.

### Sugestões não-bloqueantes

- **`listBills(accountId)` não restringe a `type === "CREDIT_CARD"`** (lib/bills.ts:115-122):
  valida só que a Account existe. Um `accountId` de conta BANK passa e devolve `[]` (nunca
  terá faturas). Coerente com o contrato ("accountId só valida existência") e inofensivo,
  mas é da mesma família redundante do DT-014/DT-022. Não bloqueia.
- **DT-006 cresceu de escopo:** `fetchPluggyBills` também descarta o erro do SDK num
  `catch {}` sem rastro server-side (lib/pluggy.ts). É o mesmo débito já aceito, agora num
  terceiro módulo — vale atualizar a linha do DT-006 para citar `fetchPluggyBills` quando
  houver logger. Não é DT novo.
- **Exibição de data em UTC cru** (`formatDate` → `toISOString().slice(0,10)` em
  app/faturas/page.tsx): família do DT-023. `dueDate` é meia-noite UTC, então o dia exibido
  é estável; é só apresentação não-localizada. Cosmético, para o refino de UI.

Nenhum achado novo merece virar DT próprio; os três acima referenciam débitos já
registrados (DT-006 a atualizar; DT-014/022 e DT-023 como família).
