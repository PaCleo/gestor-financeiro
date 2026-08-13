# TASK-006 — Sync de Accounts e Transactions
Status: CONCLUÍDA | Fase do roadmap: 2

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10**, **Prisma 7.9.0** com driver adapter, Postgres 16, Vitest, `pluggy-sdk`.
  Todos posteriores ao seu treinamento — consulte `node_modules/pluggy-sdk`, `node_modules/prisma`
  e `node_modules/next/dist/docs/01-app/` antes de assumir qualquer API.
- **Leia a seção 11 da PREMISSA** — ela foi atualizada em 2026-07-25 com os formatos **reais** da
  API, capturados de um Item de verdade. Não confie na tabela antiga; os achados reais mandam.
- Leia `docs/DEBITO-TECNICO.md`. Esta task **resolve DT-007, DT-008 e DT-017**, e **investiga DT-010**.
- `lib/pluggy.ts` e `lib/bank-item.ts` já existem — reaproveite o padrão de erro de domínio.
- **Nenhum teste automatizado chama a API real.** Mocke o SDK. Os formatos dos mocks devem seguir
  os shapes REAIS da seção 11, não os documentados — foi um mock fiel à doc (e infiel à API) que
  escondeu o bug do 404 na TASK-005.
- **DT-004**: `vi.spyOn(prisma, ...)` é engolido pelo Proxy. Mocke módulos inteiros.
- **DT-013**: coluna nova em tabela que pode ter dados = nullable ou com default.
- **ADR 7**: sync no máximo 1×/dia, **em série** (1 requisição por vez). Nada de paralelizar contas.

## 1. Objetivo

Sincronizar as `Account`s e `Transaction`s de um `BankItem` conectado, traduzindo o formato da
Pluggy para o nosso — com a normalização de sinal que impede gasto de cartão de virar receita.

## 2. Comportamento esperado (TDD)

### Accounts
- DADO um `BankItem` ativo QUANDO rodo o sync ENTÃO cada `Account` da Pluggy é persistida
  (`pluggyAccountId`, `name`, `balance`, `type` mapeado) e re-sincronizar **atualiza** em vez de duplicar
- DADO uma Account `BANK/CHECKING_ACCOUNT` QUANDO mapeio o tipo ENTÃO vira `CHECKING`; `CREDIT/CREDIT_CARD` vira `CREDIT_CARD`
- DADO o payload de Account com `taxNumber` (CPF do titular) QUANDO persisto ENTÃO **não** gravo esse campo

### Transactions — o coração da task
- DADO uma transação de **conta corrente** com `type=DEBIT` e `amount` negativo QUANDO persisto
  ENTÃO o `amount` fica negativo (saída) — sem alteração
- DADO uma transação de **cartão** (`CREDIT`) com `type=DEBIT` e `amount` **positivo** (uma compra)
  QUANDO persisto ENTÃO o `amount` fica **negativo** no nosso modelo (saída) — **DT-007**
- DADO um pagamento de fatura no cartão (`amount` negativo na Pluggy) QUANDO persisto
  ENTÃO o sinal é normalizado de forma consistente com a regra acima (documente a convenção escolhida e teste-a)
- DADO uma conta com mais transações do que uma página QUANDO sincronizo ENTÃO **todas** vêm —
  usar `fetchAllTransactions` (cursor interno), **nunca** o `fetchTransactions` deprecado — **DT-008**
- DADO a mesma transação sincronizada duas vezes (`pluggyTransactionId` igual) QUANDO re-sincronizo
  ENTÃO **não duplica** — upsert por `pluggyTransactionId` (dedup sagrada)
- DADO uma transação `PENDING` que depois vira `POSTED` QUANDO re-sincronizo
  ENTÃO o registro existente é **atualizado** (status muda), não duplicado
- DADO `transaction.paymentData` com CPF/CNPJ de terceiros QUANDO persisto
  ENTÃO extraio só `paymentMethod` para o campo `method` e **descarto** `documentNumber`, nomes e
  dados de conta de pagador/recebedor — **DT-017**
- DADO um `BankItem` **arquivado** (`archivedAt` não nulo) QUANDO rodo o sync ENTÃO ele é ignorado
- DADO um sync bem-sucedido QUANDO termina ENTÃO `BankItem.lastSyncAt` é atualizado

## 3. Critérios de aceite

- [ ] 1. `Account` ganha `balance Decimal @db.Decimal(14,2)` (e o que mais o mapeamento exigir);
      `Transaction` ganha `status String` (`POSTED`/`PENDING`). Migrations nullable/backfill (DT-013)
- [ ] 2. `POST /api/sync` (casca fina) dispara o sync de todos os `BankItem`s ativos, **em série**;
      lógica em `lib/` (ex. `lib/sync.ts`)
- [ ] 3. **Normalização de sinal por tipo de conta (DT-007)** em `lib/`, com teste dedicado para
      conta corrente E cartão provando que gasto de cartão vira saída negativa
- [ ] 4. `fetchAllTransactions` usado; teste com um mock que devolve muitas transações prova que
      nenhuma é truncada (DT-008)
- [ ] 5. Upsert por `pluggyTransactionId` provado: re-sync não duplica e atualiza `PENDING`→`POSTED`
- [ ] 6. Teste prova que `taxNumber` (Account) e os `documentNumber` de `paymentData` **não** são
      persistidos — com payload mockado que **realmente contém** um CPF/CNPJ fabricado (lição DT-011)
- [ ] 7. `paymentData.paymentMethod` mapeado para `method`; teste cobre PIX/TED/BOLETO/OTHER
- [ ] 8. `BankItem` arquivado é ignorado; teste prova
- [ ] 9. **Investigação do DT-010:** persistir `category` cru como vem. Registrar na seção 6 o que a
      API de fato devolveu (preenchido? sempre? de onde vem?) — sem decidir ainda se confiamos
- [ ] 10. Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 11. Nenhum `console.*` (o payload tem transações financeiras reais)
- [ ] 12. Suíte inteira verde (os 222 anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 4. Fora de escopo

- **Tela de listagem de transações com filtros** — é a TASK-007 (fecha a Fase 2)
- Fatura do cartão / agrupamento por `billForecastDate` (Fase 5)
- Auto-vínculo de transação a `RecurringBillInstance` (Fase 4)
- Webhooks e sync automático agendado (Fase 6) — nesta task o sync é disparado manualmente
- Guarda de "não sincronizar 2×/dia" — otimização, não bloqueia; pode virar task própria
- Normalização de categoria / recategorização (a decisão do DT-010 vem depois da investigação)

## 5. Testes (preenchido pelo qa)

### 5.1 Como rodar

```bash
npm test                          # suite inteira (precisa de `docker compose up -d` rodando)
npm test -- tests/unit/lib/sync.test.ts tests/unit/lib/pluggy.test.ts \
             tests/unit/api/sync-route.test.ts \
             tests/unit/schema/account-balance.test.ts tests/unit/schema/transaction-status.test.ts \
             tests/unit/schema/sync-pii-fields.test.ts \
             tests/integration/sync.integration.test.ts tests/integration/schema.integration.test.ts
                                   # so os arquivos desta task (+ o schema.integration.test.ts, que foi estendido)
npm run lint
npx tsc --noEmit                  # confirma que so faltam @/lib/sync e @/app/api/sync/route (RED esperado)
```

Estado RED confirmado nesta task (rodado localmente, `npm test` completo): **82 falhas novas, 239
testes verdes, ZERO regressão nos 222 anteriores** (contra os 222 já existentes na branch, todos
continuam passando). As 82 falhas são, sem exceção, `Cannot find module '@/lib/sync'`, `Cannot find
module '@/app/api/sync/route'`, `X is not a function`/`Property X does not exist` (funções ainda não
exportadas de `lib/pluggy.ts`), ou asserções de schema (`schema.prisma` ainda sem `balance`/`status`,
nenhuma migration ainda) — nunca erro de sintaxe/import quebrado nos próprios arquivos de teste.
`tests/unit/schema/sync-pii-fields.test.ts` passa integralmente hoje (12/12) porque é um teste-trava
estrutural: prova que o schema atual **não** tem campos de PII de `paymentData`, e continua provando
o mesmo depois da implementação — não há nada para essa suite "ficar RED", ela é uma rede de
segurança permanente, não um teste do comportamento novo.

**Cuidado herdado do DT-013 (mesmo achado que a TASK-005 já tinha sobre `archivedAt`):**
`tests/fixtures/db.ts` ganhou `balance: undefined` em `buildAccount` e `status: undefined` em
`buildTransaction` — **não** um valor concreto. Um valor concreto (`"1000.00"`/`"POSTED"`) quebra a
suíte inteira agora, porque o Prisma Client rejeita **qualquer** chave que a DMMF atual não reconheça
(erro `Unknown argument`, e a mensagem de erro do Prisma aponta para um campo aleatório do objeto, não
necessariamente o culpado — armadilha de depuração confirmada empiricamente ao escrever este arquivo).
`undefined` é tratado pelo Prisma Client como "campo não informado" (comportamento documentado), então
os testes de TASK-001/002/005 que chamam `buildAccount`/`buildTransaction` sem saber dos campos novos
continuam passando tanto ANTES quanto DEPOIS da migration desta task.

### 5.2 Arquivos criados/alterados

**Novos:**
- `tests/fixtures/pluggy.ts` — builders dos payloads CRUS da Pluggy (`Account`/`Transaction`), shapes
  REAIS da seção 11 da PREMISSA (não a doc antiga). Inclui `buildRealCreditCardPurchaseTransaction`
  (a compra de cartão com `amount` **positivo**, o caso central do DT-007) e
  `buildTransactionWithPaymentData` (payer/receiver com CPF/CNPJ fabricados de verdade).
- `tests/unit/lib/sync.test.ts` — funções puras (`mapAccountType`, `normalizeTransactionSign`) e
  orquestração de `syncBankItem`/`syncAllActiveBankItems` com `@/lib/db`, `@/lib/pluggy`,
  `@/lib/bank-item` mockados inteiramente (DT-004).
- `tests/integration/sync.integration.test.ts` — ponta a ponta contra o Postgres real, mockando
  **só** `"pluggy-sdk"` (não `@/lib/pluggy`) para que a tradução/normalização/remoção de PII real
  rode de verdade até gravar no banco (a prova de "valor gravado", não só retorno em memória).
- `tests/unit/api/sync-route.test.ts` — `POST /api/sync`, `@/lib/sync` mockado inteiro.
- `tests/unit/schema/account-balance.test.ts`, `tests/unit/schema/transaction-status.test.ts`,
  `tests/unit/schema/sync-pii-fields.test.ts` — documentação executável do schema.

**Alterados:**
- `tests/fixtures/db.ts` — `balance`/`status` adicionados como `undefined` (ver nota DT-013 acima).
- `tests/integration/schema.integration.test.ts` — describes novos para `Account.balance` e
  `Transaction.status` no Postgres real (nullable/default, tipo, precisão) + tripwire de colunas PII.
- `tests/unit/lib/pluggy.test.ts` — estende o `PluggyClientMock` hoisted com
  `fetchAccounts`/`fetchAllTransactions`/`fetchTransactions` e adiciona os describes de
  `fetchPluggyAccounts`/`fetchPluggyAllTransactions`.

### 5.3 Contrato para o coder

#### `lib/pluggy.ts` (estende o arquivo existente, mesmo padrão de erro de domínio)

```ts
export class PluggyAccountsFetchError extends Error {}
export async function fetchPluggyAccounts(pluggyItemId: string): Promise<Array<{
  pluggyAccountId: string;   // = account.id
  name: string;
  type: "BANK" | "CREDIT";
  subtype: "CHECKING_ACCOUNT" | "SAVINGS_ACCOUNT" | "CREDIT_CARD";
  balance: number;
}>>

export class PluggyTransactionsFetchError extends Error {}
export async function fetchPluggyAllTransactions(pluggyAccountId: string): Promise<Array<{
  pluggyTransactionId: string; // = transaction.id
  date: Date;
  description: string;
  amount: number;              // AINDA CRU da Pluggy - normalização é responsabilidade de lib/sync.ts
  type: "DEBIT" | "CREDIT";
  status: "PENDING" | "POSTED"; // default "POSTED" quando t.status vem undefined
  category: string | null;      // cru, sem decisão (Criério 9/DT-010)
  paymentMethod: string | null; // = transaction.paymentData?.paymentMethod ?? null
}>>
```

- Mesma validação de `CLIENT_ID`/`CLIENT_SECRET` das funções existentes (`PluggyConfigError`, sem
  instanciar `PluggyClient`).
- `fetchPluggyAccounts` chama `client.fetchAccounts(pluggyItemId)` (`PageResponse<Account>`, usa só
  `.results`) e **reconstrói campo a campo** — nunca espalha (`...account`), para nunca deixar
  `taxNumber`/`owner`/`number`/`marketingName`/`bankData`/`creditData` vazarem.
- `fetchPluggyAllTransactions` chama **`client.fetchAllTransactions(pluggyAccountId)`** (nunca
  `client.fetchTransactions`, deprecado — DT-008; `fetchAllTransactions` já devolve `Transaction[]`
  completo, varredura de cursor interna, sem paginação manual necessária) e **reconstrói campo a
  campo** — nunca deixa `paymentData.payer`/`.receiver` (CPF/CNPJ/nomes/dados de conta),
  `creditCardMetadata`, `merchant`, `descriptionRaw`, `providerCode`/`providerId` vazarem.
- Qualquer falha do SDK → `PluggyAccountsFetchError`/`PluggyTransactionsFetchError`, mensagem
  fixa/genérica, sem stack/detalhe do SDK. Nunca `console.*`.

#### `lib/sync.ts` (novo)

```ts
export type PluggyRawAccountType = "BANK" | "CREDIT";
export type PluggyRawAccountSubtype = "CHECKING_ACCOUNT" | "SAVINGS_ACCOUNT" | "CREDIT_CARD";

export function mapAccountType(type: string, subtype: string): string
// ("BANK","CHECKING_ACCOUNT")->"CHECKING"; ("BANK","SAVINGS_ACCOUNT")->"SAVINGS";
// ("CREDIT","CREDIT_CARD")->"CREDIT_CARD"; qualquer outra combinação -> devolve `subtype` cru
// (fallback seguro, nunca lança).

export function normalizeTransactionSign(accountType: string, amount: number): number
// accountType === "CREDIT" -> -amount (inverte SEMPRE, é a conta que decide, não o `type`
// DEBIT/CREDIT da transação - o mesmo "DEBIT" aparece nos dois casos reais de compra/saída);
// accountType === "BANK" -> amount inalterado; qualquer outro valor -> amount inalterado
// (fallback seguro, nunca lança). ESTE É O CORAÇÃO DA TASK (DT-007).

export class BankItemArchivedError extends Error {}
export class BankItemNotFoundError extends Error {}

export async function syncBankItem(bankItemId: string): Promise<{
  bankItemId: string;
  accountsSynced: number;
  transactionsSynced: number;
}>
// 1. prisma.bankItem.findUnique({ where: { id: bankItemId } }) - null -> BankItemNotFoundError.
// 2. archivedAt preenchido -> BankItemArchivedError, SEM chamar fetchPluggyAccounts (Critério 8).
// 3. fetchPluggyAccounts(bankItem.pluggyItemId).
// 4. para CADA account, EM SÉRIE (nunca Promise.all - ADR 7):
//    a. prisma.account.upsert por pluggyAccountId, type: mapAccountType(...), balance: raw.balance,
//       bankItemId setado na criação.
//    b. fetchPluggyAllTransactions(rawAccount.pluggyAccountId).
//    c. para CADA transação, EM SÉRIE, prisma.transaction.upsert por pluggyTransactionId, com
//       amount: normalizeTransactionSign(rawAccount.type, rawTx.amount), category: rawTx.category
//       (cru), method: rawTx.paymentMethod, status: rawTx.status, source: "PLUGGY".
// 5. prisma.bankItem.update({ data: { lastSyncAt: new Date() } }) - só DEPOIS de tudo sincronizado.
// 6. devolve { bankItemId, accountsSynced, transactionsSynced }.

export type SyncAllResult =
  | { bankItemId: string; status: "OK"; accountsSynced: number; transactionsSynced: number }
  | { bankItemId: string; status: "ERROR"; error: string };
export async function syncAllActiveBankItems(): Promise<SyncAllResult[]>
// chama listActiveBankItems() (@/lib/bank-item, reaproveita o filtro archivedAt: null da TASK-005);
// para CADA item, EM SÉRIE, chama syncBankItem(item.id); se rejeitar, captura o erro (NÃO interrompe
// os demais) e registra { status: "ERROR", error: <mensagem> }, seguindo para o próximo.
```

#### `app/api/sync/route.ts` (novo, casca fina)

```ts
export async function POST(request: Request): Promise<Response>
// request nao e lido (sem corpo). Chama syncAllActiveBankItems() e responde 200 com
// { success: true, data: <array de SyncAllResult> }. Qualquer erro NAO capturado por
// syncAllActiveBankItems (ela mesma ja captura falha por-item) -> 500 generico em ApiResponse<T>,
// sem vazar mensagem/stack. Nunca console.*.
```

#### `prisma/schema.prisma`

- `Account.balance Decimal? @db.Decimal(14, 2)` — **nullable**, sem `@default` (DT-013 + correto por
  natureza: Account manual pode não ter saldo).
- `Transaction.status String @default("POSTED")` — **NOT NULL com default** (DT-013; toda transação,
  real ou manual, tem status definido).
- Nenhum campo `taxNumber`/`documentNumber`/`payer`/`receiver`/`paymentData` em nenhum model
  (`tests/unit/schema/sync-pii-fields.test.ts` e `tests/unit/schema/account-balance.test.ts` travam
  isso estruturalmente).

### 5.4 Mapeamento critério de aceite → teste

| # | Critério | Teste(s) |
|---|---|---|
| 1 | `Account.balance`/`Transaction.status` no schema, migration nullable/default | `tests/unit/schema/account-balance.test.ts` (3 testes), `tests/unit/schema/transaction-status.test.ts` (3 testes), `tests/integration/schema.integration.test.ts` › `describe("Account.balance...")` e `describe("Transaction.status...")` (7 testes) |
| 1 | Accounts persistidas e re-sync atualiza | `tests/unit/lib/sync.test.ts` › `"persiste cada Account..."`; `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - Accounts persistidas...")` (2 testes) |
| 1 | Mapeamento `BANK/CHECKING_ACCOUNT`→`CHECKING`, `CREDIT/CREDIT_CARD`→`CREDIT_CARD` | `tests/unit/lib/sync.test.ts` › `describe("mapAccountType...")` (4 testes); `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - mapeamento de tipo de conta...")` (2 testes) |
| 1 | `Account.taxNumber` não persistido | `tests/unit/schema/account-balance.test.ts` › `"NAO declara nenhum campo taxNumber"`; `tests/integration/schema.integration.test.ts` › `"a coluna Account nao expoe taxNumber..."`; `tests/unit/lib/pluggy.test.ts` › `"NUNCA deixa taxNumber/owner/.../vazarem..."`; `tests/integration/sync.integration.test.ts` › `"account.taxNumber (...) nunca aparece em nenhuma coluna..."` |
| 2 | `POST /api/sync` casca fina, dispara sync de todos os ativos, em série | `tests/unit/api/sync-route.test.ts` (7 testes); `tests/unit/lib/sync.test.ts` › `describe("syncAllActiveBankItems...")` (4 testes); `tests/integration/sync.integration.test.ts` › `"syncAllActiveBankItems ignora o BankItem arquivado..."` |
| 3 | **Normalização de sinal (DT-007) — o coração da task** | `tests/unit/lib/sync.test.ts` › `describe("normalizeTransactionSign...")` (5 testes, incluindo a prova central com `+138.83` de cartão); `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - normalizacao de sinal, PONTA A PONTA...")` (3 testes) |
| 4 | `fetchAllTransactions` usado, nenhuma transação truncada (DT-008) | `tests/unit/lib/pluggy.test.ts` › `describe("fetchPluggyAllTransactions - sucesso...")` (chama fetchAllTransactions, nunca fetchTransactions; 650 sem truncar); `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - paginacao...")` (650 transações persistidas ponta a ponta) |
| 5 | Upsert por `pluggyTransactionId`: re-sync não duplica, `PENDING`→`POSTED` atualiza | `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - upsert por pluggyTransactionId...")` (2 testes, por contagem no banco) |
| 6 | `taxNumber`/`documentNumber` de `paymentData` não persistidos, provado pelo VALOR gravado | `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - PII...")` (2 testes, CPF/CNPJ fabricados REALMENTE no payload, `JSON.stringify` do row do Postgres); `tests/unit/lib/pluggy.test.ts` › `"extrai SOMENTE paymentData.paymentMethod..."`; `tests/unit/schema/sync-pii-fields.test.ts` (12 testes estruturais) |
| 7 | `paymentData.paymentMethod` → `method`, cobre PIX/TED/BOLETO/OTHER | `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - paymentData.paymentMethod mapeado...")` (it.each de 4 + caso sem paymentData); `tests/unit/lib/sync.test.ts` › `"mapeia paymentMethod..."` |
| 8 | `BankItem` arquivado é ignorado | `tests/unit/lib/sync.test.ts` › `describe("syncBankItem - BankItem inexistente ou arquivado...")`; `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - BankItem arquivado e ignorado...")` (2 testes, por consulta real ao Postgres) |
| 9 | `category` persistida crua (investigação DT-010) | `tests/unit/lib/sync.test.ts` › `"persiste category cru..."`; `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - category persistida crua...")` (2 testes, incluindo `null`) |
| — | `lastSyncAt` atualizado após sync bem-sucedido | `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - lastSyncAt e atualizado...")` |
| — | Caminho de erro: API Pluggy fora do ar / Item `LOGIN_ERROR`/`OUTDATED` | `tests/unit/lib/pluggy.test.ts` › `describe("fetchPluggyAccounts - falha da Pluggy")` e `describe("fetchPluggyAllTransactions - falha da Pluggy...")`; `tests/integration/sync.integration.test.ts` › `describe("syncBankItem - API da Pluggy fora do ar...")`; `tests/unit/lib/sync.test.ts` › `"um item que falha ... nao interrompe..."`; `tests/unit/api/sync-route.test.ts` › `describe("... erro inesperado...")` |
| 10 | Nenhuma chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET` | Todos os arquivos acima mockam `"pluggy-sdk"` ou `@/lib/pluggy` inteiro — nenhum teste importa o SDK real |
| 11 | Nenhum `console.*` | `tests/unit/lib/pluggy.test.ts` e `tests/unit/api/sync-route.test.ts` têm teste dedicado de `console.log/warn/error` em cada describe relevante |
| 12 | Suíte inteira verde, `build`/`lint` limpos | Verificado pelo qa: `npx tsc --noEmit` só acusa os módulos que o coder ainda vai criar; `npm run lint` limpo (0 erros) |

## 6. Implementação (preenchido pelo coder)

### Arquivos alterados

**Novos:**
- `lib/sync.ts` — `mapAccountType`, `normalizeTransactionSign` (o coração da task, DT-007),
  `syncBankItem`, `syncAllActiveBankItems`, `BankItemNotFoundError`, `BankItemArchivedError`.
- `app/api/sync/route.ts` — `POST /api/sync`, casca fina sobre `syncAllActiveBankItems`.
- `prisma/migrations/20260813230601_add_account_balance_and_transaction_status/migration.sql` —
  `ALTER TABLE "Account" ADD COLUMN "balance" DECIMAL(14,2)` (nullable, sem default) e
  `ALTER TABLE "Transaction" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED'`. Aplicada tanto no
  banco de dev (`gestor`, que já tinha 1 `BankItem` real e 0 `Account`/`Transaction` — confirmado
  antes de migrar) quanto no de teste (`gestor_test`, via `npm run test:migrate`).

**Alterados:**
- `lib/pluggy.ts` — adiciona `fetchPluggyAccounts`/`PluggyAccountsFetchError` e
  `fetchPluggyAllTransactions`/`PluggyTransactionsFetchError`, exatamente conforme o contrato da
  seção 5.3. Ambas reconstroem o payload campo a campo (nunca `...spread`) e usam
  `client.fetchAllTransactions` (nunca `fetchTransactions`, deprecado — DT-008).
- `prisma/schema.prisma` — `Account.balance Decimal? @db.Decimal(14, 2)` (nullable) e
  `Transaction.status String @default("POSTED")` (NOT NULL com default), conforme decisão da
  seção 5.3 (DT-013).

Os demais arquivos que aparecem como alterados no `git status` (`tests/fixtures/db.ts`,
`tests/integration/schema.integration.test.ts`, `tests/unit/lib/pluggy.test.ts`,
`tests/fixtures/pluggy.ts` e os demais arquivos novos em `tests/`) já vieram prontos do qa — não
editei nenhum teste.

### Decisões tomadas

- **Upsert de `Account`**: `create` grava `bankItemId`/`pluggyAccountId`/`name`/`type`/`balance`;
  `update` regrava só `name`/`type`/`balance` (o `pluggyAccountId` já identifica a linha via
  `where`, e `bankItemId` não deveria mudar entre syncs de um mesmo Item). `type` é sempre
  recalculado por `mapAccountType` em cada sync — se a Pluggy corrigir um `subtype` errado depois,
  o próximo sync já reflete.
- **Upsert de `Transaction`**: `create` grava `source: "PLUGGY"` fixo (nunca vem de fora — não há
  outro `source` possível neste caminho); `update` NÃO regrava `source`/`accountId`/
  `pluggyTransactionId` (identidade da linha, não deveriam mudar). `amount`/`category`/`method`/
  `status`/`date`/`description` são sempre regravados no `update`, para que um re-sync realmente
  atualize (ex. `PENDING`→`POSTED`, valor de `category` que a Pluggy passe a preencher depois).
- **`normalizeTransactionSign`**: segui literalmente o contrato da seção 5.3 — inversão só depende
  de `accountType === "CREDIT"`, nunca do `type` (`DEBIT`/`CREDIT`) da transação. Documentando a
  convenção pedida no critério de aceite: para conta de cartão, "negativo = saída" continua valendo
  depois da normalização — uma compra (`+138.83` cru) vira saída negativa (`-138.83`), um pagamento
  de fatura (`-500` cru) vira entrada positiva (`+500`). É a mesma regra de sinal da conta corrente
  aplicada de forma consistente, não um caso especial por `type` de transação.
- **`syncAllActiveBankItems`**: erro de um item é capturado com `error instanceof Error ?
  error.message : <mensagem genérica>` — como `syncBankItem` só lança `BankItemNotFoundError`/
  `BankItemArchivedError` (que são `Error`) ou repassa a rejeição já traduzida de
  `PluggyAccountsFetchError`/`PluggyTransactionsFetchError` (também `Error`), o branch não-`Error`
  é defensivo (mesmo padrão de outras rotas do projeto) e não é exercitado pelos testes atuais.
- **`fetchPluggyAllTransactions`**: `status: t.status ?? "POSTED"` replica o próprio default
  documentado pela SDK (`status?: TransactionStatus`, ver `node_modules/pluggy-sdk/dist/types/transaction.d.ts`).
- **Migration**: rodei `prisma migrate dev` contra o banco de dev real (`gestor`) depois de
  confirmar via `docker exec ... psql` que só havia 1 `BankItem` e 0 `Account`/`Transaction` — a
  migration gerada (`balance` nullable sem default, `status` com `DEFAULT 'POSTED'`) é segura mesmo
  que essas tabelas já tivessem linhas, mas confirmei o estado real antes de aplicar, como pedido.

### Dívidas assumidas

- Nenhuma dívida nova identificada durante a implementação. O guard de "não sincronizar 2×/dia"
  (ADR 7) continua fora de escopo, como já definido na seção 4.
- `syncAllActiveBankItems` não tem teste que force o branch `error instanceof Error === false` de
  fato passar por um erro não-`Error` genuíno vindo de `syncBankItem` (porque hoje nenhum caminho de
  `syncBankItem` rejeita com algo que não seja uma instância de `Error`) — código defensivo sem
  cobertura direta, mesmo padrão já aceito em outras partes do projeto (ex. `deleteItemFromPluggy`).

### Achado sobre `category` (investigação do DT-010, Critério de aceite #9)

Implementei a persistência **crua**, sem nenhuma transformação/validação/normalização — exatamente
como pedido ("sem decidir ainda se confiamos"). `fetchPluggyAllTransactions` (lib/pluggy.ts) repassa
`transaction.category` (tipado pela SDK real como `string | null`, **não opcional** — ver
`node_modules/pluggy-sdk/dist/types/transaction.d.ts:160`) direto para o campo `category` que já
existia no schema desde a TASK-001; `lib/sync.ts` grava esse valor sem alteração no `upsert`
(`category: rawTransaction.category`).

O que os tipos/fixtures desta task confirmam sobre o formato (não é uma nova sondagem — é o que já
está documentado na seção 11 da PREMISSA, atualizada em 2026-07-25 pelo orquestrador/qa, e que os
testes desta task codificam como contrato):
- O tipo da SDK real (`Transaction.category: string | null`) não distingue "usuário sem plano Pro"
  de "categoria não atribuída pelo conector" — os dois casos são indistinguíveis por tipo, só o
  valor (`null` vs. string) diz algo, e mesmo assim não diz *por quê*.
  A Pluggy também expõe `categoryId: string | null` como campo irmão (visto nos fixtures,
  `categoryId: "08010000"`/`"17000000"`), mas o contrato desta task (seção 5.3) não pede
  `categoryId` — só `category` é repassado por `fetchPluggyAllTransactions`. Não persistimos
  `categoryId`; se a decisão futura do DT-010 for "confiar em `category`", `categoryId` pode valer a
  pena capturar também (ele parece ser o identificador estável, `category` o rótulo legível).
- Os testes desta task (unit e integração) cobrem tanto `category` preenchida (`"Online shopping"`,
  `"Housing"`) quanto `category: null`, e ambos persistem exatamente como vieram — nenhuma lógica de
  fallback/placeholder foi adicionada.
- Eu **não** tenho visibilidade de código para confirmar "vem do conector, do plano ou do ambiente"
  (a pergunta que o DT-010 levanta) — isso exigiria uma nova sondagem contra a API real com Items de
  plano/conector diferentes, fora do escopo desta task (que só pede persistir cru). Deixo registrado
  que a implementação está pronta para qualquer decisão futura: como `category` é gravada sem
  transformação, mudar de "não confiar" para "confiar e usar em relatórios" não exige alterar
  `lib/sync.ts`/`lib/pluggy.ts` — só a camada de leitura/apresentação que ainda não existe.

## 7. Revisão (preenchido pelo code-reviewer)

**Veredito: APROVADO**

Revisei `git diff` completo (rastreados e não rastreados) contra a seção 11 da PREMISSA
atualizada, o `docs/DEBITO-TECNICO.md` e o código instalado do `pluggy-sdk`. Confirmei o que a
verificação por dados reais não cobre: convenção de sinal, segurança da migration em tabela
populada, ausência de spread, série e ignorar arquivados — tudo no código, no Postgres e no
schema. A suíte que rodei: **321/321 verde**, cobertura 98.45% stmts / 97.6% branches, drift
zero contra o banco (`migrate diff` vazio). Também limpei a seção 7 duplicada que existia neste
arquivo.

### 1. Convenção de sinal no pagamento de fatura (DT-007)

**A convenção "CREDIT inverte sempre" está correta para a camada de sync; o pagamento de fatura
virar positivo é o comportamento certo do modelo, mas planta uma armadilha para o dashboard.**

Analisei os dois lados. Compra de cartão (`+138.83` cru) → `-138.83` (saída): correto, é
despesa. Pagamento de fatura (`-500` cru na Pluggy) → `+500` (entrada) no nosso modelo. A
pergunta é se isso "infla receita".

O pagamento de fatura é uma **transferência entre contas do próprio usuário**: sai da conta
corrente (aparece lá como `-500`, saída) e abate a dívida no cartão (aparece como `+500`). Num
modelo plano onde "tudo é Transaction, negativo=saída" (ADR 2), toda transferência gera
naturalmente esse par espelhado — a perna positiva no cartão é o correto contábil da entrada de
dinheiro que abate a dívida. Não é um caso especial mal tratado: é a consequência inerente do
modelo. E importa notar que **os totais de despesa não são corrompidos** — só a soma de
positivos (receita) seria afetada.

Verifiquei também que não há convenção melhor disponível nesta camada: um pagamento de fatura e
um estorno/refund chegam ambos negativos no cartão com `type=CREDIT`, indistinguíveis por
sinal+type. "Inverter sempre" trata os dois como positivo — o que é *correto* para o estorno
(reduz a despesa líquida) e é a perna-espelho de transferência para o pagamento. Dado o
empate de informação, é a regra mais simples e consistente possível, e está testada
(`normalizeTransactionSign("CREDIT", -500) === 500`, `tests/unit/lib/sync.test.ts:236`).

**Onde o risco que você levantou se materializa: no dashboard (Fase 5), não aqui.** Se a tela de
"quanto entrou" somar transações positivas sem excluir pagamentos de fatura / transferências
entre contas próprias, o `+500` será contado como receita e vai inflar o número. Isso é um
problema da camada de relatório, não do sync — a convenção do sync é pré-requisito correto para
ele. Recomendo DT para que a task de dashboard/fatura trate explicitamente transferências
inter-contas. Não bloqueia.

### 2. Migration segura em tabela populada + o default "POSTED"

**Segura, e o default não mascara PENDING.** A migration é
`ADD COLUMN "balance" DECIMAL(14,2)` (nullable) e
`ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED'` — ambos aplicáveis a linhas preexistentes
sem violar constraint (`balance` aceita NULL; `status` preenche as linhas antigas com 'POSTED').
DT-013 respeitado: nenhuma coluna `NOT NULL` sem default sobre tabela que possa ter dados.
Confirmei no banco de dev (`gestor`, que de fato tinha 1 `BankItem` real): as 4 migrations
constam aplicadas, `balance` é `YES`/sem default e `status` é `NO`/`'POSTED'::text`, e o
`migrate diff` schema↔banco vem vazio (sem drift).

Sobre o default mascarar um PENDING: **não mascara**. O default de coluna só age quando o INSERT
não informa `status`. No sync, `syncBankItem` sempre passa `status: rawTransaction.status`
explicitamente (no `create` e no `update`), e `fetchPluggyAllTransactions` deriva
`t.status ?? "POSTED"`. Um PENDING real chega explícito da API (a sondagem confirmou
`status="PENDING"` presente nos dados reais) e é preservado; o `?? "POSTED"` só decide quando a
API **não** informa status, o que é a mesma escolha default que a própria SDK documenta. O
default de coluna, portanto, só alcança transações manuais futuras e o backfill (0 linhas). A
distinção PENDING/POSTED da API nunca é apagada.

### 3. Investigação do DT-010

**Conclusão sólida, e nada a decidir agora — corretamente.** O coder persistiu `category` cru,
sem transformação (`category: rawTransaction.category`), exatamente o que o critério 9 pediu
("sem decidir ainda se confiamos"). A investigação registrada é honesta e precisa: o tipo real
da SDK é `category: string | null` (não opcional), o que não distingue "sem Pro" de "não
categorizado"; e o coder anotou que existe `categoryId` irmão (o identificador estável) que
**não** é capturado hoje. Ele foi apropriadamente humilde sobre não ter visibilidade para
responder "de onde vem" sem nova sondagem com Items de plano/conector diferentes — o que está
fora do escopo. A implementação fica pronta para qualquer decisão futura sem exigir mudança em
`lib/sync.ts`/`lib/pluggy.ts`. A única coisa a alimentar de volta ao DT-010: **se** a decisão
for "confiar em category", capturar `categoryId` junto (rótulo vs. id estável). Nada bloqueia.

### 4. Reconstrução campo a campo (DT-017)

**Confirmado: nenhum spread do payload da Pluggy em nenhum ponto.** `grep` por `...` em
`lib/pluggy.ts`/`lib/sync.ts`/`app/api/sync/route.ts` só retorna as ocorrências dentro de
comentários. `fetchPluggyAccounts` monta `{ pluggyAccountId, name, type, subtype, balance }`
explicitamente a partir de `account` — `taxNumber`/`owner`/`number`/`bankData`/`creditData`
ficam de fora. `fetchPluggyAllTransactions` monta os 8 campos explicitamente e `paymentData`
cede **somente** `paymentData?.paymentMethod ?? null` — `payer`/`receiver`/`documentNumber`,
`creditCardMetadata`, `merchant`, `descriptionRaw`, `providerCode/Id` nunca são lidos. `lib/sync.ts`
também constrói objetos `create`/`update` explícitos, sem espalhar o objeto cru. A defesa é por
construção em cada camada, o que é o que dá poder real aos testes de PII com CPF/CNPJ fabricado.

### 5. Série (ADR 7) e arquivado ignorado

**Ambos corretos no código.** `syncBankItem` percorre contas e transações com `for...of` +
`await` sequencial; `syncAllActiveBankItems` idem por item; nenhum `Promise.all/allSettled/race`
em produção (confirmado por `grep`). Arquivado é ignorado em **duas** camadas independentes: (a)
`syncBankItem` lança `BankItemArchivedError` se `archivedAt` estiver preenchido, **antes** de
chamar a Pluggy (nenhuma requisição para banco desativado); (b) `syncAllActiveBankItems` usa
`listActiveBankItems()`, que filtra `archivedAt: null`, então um banco arquivado nem chega ao
laço. Defesa redundante, correta.

### Qualidade da suíte

321/321, cobertura folgada acima do threshold. As duas linhas não cobertas relevantes desta
task são branches defensivos (`sync.ts:239` — fallback não-`Error` de `syncAllActiveBankItems`;
`pluggy.ts:218`), ambos documentados e do mesmo padrão já aceito no projeto. Os 222 testes
anteriores seguem verdes; os arquivos de teste alterados são aditivos (fixtures com
`balance`/`status: undefined`, describes novos no `schema.integration`) — nenhuma asserção
existente enfraquecida.

### Problemas bloqueantes

Nenhum.

### Problemas não-bloqueantes — recomendo registrar como DT

1. **[VIRAR DT] Pagamento de fatura / transferência entre contas próprias infla "receita" na
   camada de relatório.** A convenção de sinal do sync está correta (ponto 1), mas o
   `+500` de um pagamento de fatura no cartão é entrada no modelo plano. O dashboard da Fase 5
   ("quanto entrou/receita") precisa excluir pagamentos de fatura e transferências inter-contas,
   senão o número de receita infla silenciosamente. Latente hoje (não há dashboard); vira
   concreto na Fase 5. Só afeta soma de positivos — despesas ficam corretas.

2. **[Alimenta o DT-010, não é DT novo] `categoryId` não é capturado.** Se a decisão do DT-010
   for confiar em `category`, o identificador estável (`categoryId`) deveria ser persistido junto
   do rótulo legível (`category`). Registrar dentro do DT-010, que já está REABERTO.

### Observações menores (não precisam virar DT)

- **A tabela antiga da seção 11 da PREMISSA ainda diz `category` "Sempre null no nosso plano"**,
  contradizendo o bloco de sondagem real logo acima (que achou `category` preenchida) e o DT-010
  REABERTO. É inconsistência de documentação, não de código; vale um ajuste na PREMISSA para não
  induzir uma task futura a erro. O DT-010 já captura a substância.
- `PluggyRawTransaction.type` (`DEBIT`/`CREDIT`) é repassado por `fetchPluggyAllTransactions` mas
  não consumido por `lib/sync.ts` (a normalização usa o tipo da conta, corretamente). É inócuo e
  útil como validação futura; não é PII. Sem ação.
- A rota usa `eslint-disable-next-line` para o `request` não usado (DT-001). Consistente com o
  padrão já catalogado; o DeactivateBankButton da TASK-005 mostrou que dá para evitar quando há
  um segundo argumento, mas aqui só há `request` — aceitável sob o DT-001 existente.

### Segurança e escopo

Sem achados de segurança. Nenhum spread de payload, nenhum `console.*` em produção (verificado e
com testes dedicados), nenhum `any`, nenhum `NEXT_PUBLIC_`. As funções de fetch reusam a
validação de credenciais e não instanciam `PluggyClient` sem elas; erros do SDK viram erros de
domínio com mensagem fixa, sem repassar o objeto cru (coerente com o formato de erro real
documentado na seção 11 e com o DT-006). `fetchAllTransactions` usado, nunca o `fetchTransactions`
deprecado (DT-008 resolvido). Dedup sagrada preservada: upsert por `pluggyTransactionId`, sem
duplicar, atualizando PENDING→POSTED. Seção 4 respeitada — nada de tela de transações,
fatura/agrupamento, auto-vínculo a `RecurringBillInstance`, webhooks nem guard de 2×/dia. DT-007,
DT-008 e DT-017 de fato resolvidos; DT-010 investigado e deixado pronto para decisão.
