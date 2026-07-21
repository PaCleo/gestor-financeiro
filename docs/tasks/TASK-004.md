# TASK-004 — Persistir o BankItem e modelar o estado do Item
Status: CONCLUÍDA | Fase do roadmap: 1

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10**, **Prisma 7.9.0** com driver adapter, Postgres 16 em docker-compose,
  Vitest, **`pluggy-sdk`**. Todos posteriores ao seu treinamento — consulte
  `node_modules/next/dist/docs/01-app/`, `node_modules/prisma` e `node_modules/pluggy-sdk`
  antes de assumir qualquer API.
- Leia `docs/DEBITO-TECNICO.md` antes de reportar qualquer problema como novo.
- Leia a **seção 11 da PREMISSA** (mapeamento Pluggy → nosso modelo).
- `lib/pluggy.ts` já existe (TASK-003) e encapsula o SDK. Reaproveite o padrão dele: erros de
  domínio com mensagem fixa, sem interpolar texto do fornecedor.
- **Nenhum teste automatizado pode chamar a API real da Pluggy.** As credenciais são de contas
  bancárias reais. Mock no nível do módulo, como na TASK-003.
- Atenção ao **DT-004**: `lib/db.ts` é um Proxy com traps `get`/`has` apenas, então
  `vi.spyOn(prisma, ...)` é silenciosamente engolido. Mocke o módulo inteiro.

## 1. Objetivo

Receber o `itemId` que o widget devolve, buscar os dados desse Item na Pluggy e persistir o
`BankItem` — resolvendo, no caminho, o **DT-009**: a Pluggy expõe dois campos de estado e nosso
modelo tinha um só.

## 2. Comportamento esperado (TDD)

- DADO um `pluggyItemId` válido QUANDO chamo `POST /api/items`
  ENTÃO o `BankItem` é persistido com o nome da instituição, `status` e `executionStatus` crus
  da Pluggy, e recebo `201` no formato `ApiResponse<T>`
- DADO um `pluggyItemId` que **já existe** na base QUANDO chamo `POST /api/items` de novo
  ENTÃO **não duplica** — o registro existente é atualizado com o estado novo
- DADO um Item cujo `executionStatus` é `PARTIAL_SUCCESS` QUANDO persisto
  ENTÃO o estado derivado é `PARCIAL`, **nunca** `OK` — um produto falhou e isso não é sucesso
- DADO um Item com `status` `WAITING_USER_INPUT` ou `LOGIN_ERROR` QUANDO derivo o estado
  ENTÃO recebo `PRECISA_ACAO`, sinalizando que depende do usuário
- DADO um `status`/`executionStatus` **desconhecido** (a Pluggy pode adicionar valores novos)
  QUANDO derivo o estado ENTÃO recebo um estado seguro e o valor cru continua persistido —
  nada de quebrar nem de assumir sucesso
- DADO um payload inválido (sem `pluggyItemId`, ou com formato não-UUID)
  QUANDO chamo o endpoint ENTÃO recebo `400` no formato `ApiResponse<T>`, sem persistir nada
- DADO que a Pluggy responde erro (404, 500, timeout) QUANDO chamo o endpoint
  ENTÃO **nada é persistido** e recebo erro tratado, sem vazar detalhe do SDK
- DADO o payload da Pluggy contendo `taxNumber` (CPF do titular)
  QUANDO persisto ENTÃO esse dado **não** é gravado em lugar nenhum

## 3. Critérios de aceite

- [ ] 1. `POST /api/items` existe, valida o corpo com **Zod** e responde no formato `ApiResponse<T>`
- [ ] 2. A rota é **casca fina**: a lógica vive em `lib/` (ex. `lib/bank-item.ts`, que já existe)
- [ ] 3. `prisma/schema.prisma` ganha o campo `executionStatus` no `BankItem`, com migration
      gerada e aplicada (**resolve o DT-009**)
- [ ] 4. `lib/` expõe a derivação do estado — `OK` | `SINCRONIZANDO` | `PRECISA_ACAO` | `ERRO` |
      `PARCIAL` — a partir de `status` + `executionStatus`, com teste cobrindo **cada** valor
      documentado na seção 11, incluindo `PARTIAL_SUCCESS` → `PARCIAL` e um valor desconhecido
- [ ] 5. Idempotência provada por teste: chamar duas vezes com o mesmo `pluggyItemId` deixa
      **um** registro, com o estado atualizado — a constraint `@unique` não pode virar erro 500
- [ ] 6. Teste prova que falha da Pluggy **não deixa registro parcial** no banco
- [ ] 7. Teste prova que `taxNumber` (e qualquer PII do payload) não é persistido
- [ ] 8. Nenhum teste faz chamada de rede real; a suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 9. Nenhum `console.*` (o payload da Pluggy contém dados financeiros reais)
- [ ] 10. Suíte inteira verde (os 64 testes anteriores sem regressão), `npm run build` e
      `npm run lint` limpos

## 4. Fora de escopo

- **Widget PluggyConnect e qualquer UI** — é a TASK-005
- **Desativar/arquivar banco (DT-002)** — decisão do usuário: fica para a TASK-005
- Persistir `Account`s e `Transaction`s, e o sync em si (Fase 2 — ver DT-007 e DT-008)
- Webhooks e atualização automática de status
- Autenticação do nosso próprio app

## 5. Testes (preenchido pelo qa)

### Investigação prévia (SDK real em vez da tabela solta da PREMISSA)

A seção 11 da PREMISSA cita só alguns exemplos de `status`/`executionStatus`
(`UPDATED`, `LOGIN_ERROR`, `OUTDATED`, `PARTIAL_SUCCESS`), sem enumerar os ~25
valores completos. Antes de escrever qualquer teste, conferi
`node_modules/pluggy-sdk/dist/types/item.js` e
`node_modules/pluggy-sdk/dist/types/execution.js` linha a linha (fonte de
verdade real, não a memória de treinamento):

- `item.status` (`ItemStatus`) tem exatamente **7** valores: `UPDATED`,
  `UPDATING`, `WAITING_USER_INPUT`, `WAITING_USER_ACTION`, `MERGING`,
  `LOGIN_ERROR`, `OUTDATED`.
- `item.executionStatus` (`ExecutionStatus`) tem exatamente **33** valores:
  `CREATING`/`CREATE_ERROR`/`CREATED` + 13 valores "em progresso"
  (`CONNECTOR_EXECUTION_STATUSES`, que inclui `WAITING_USER_INPUT`/
  `WAITING_USER_ACTION` **como executionStatus**, não como status) + 17
  valores "finalizados" (`EXECUTION_FINISHED_STATUSES`, único array
  realmente exportado em runtime pelo SDK: `INVALID_CREDENTIALS`,
  `ALREADY_LOGGED_IN`, `UNEXPECTED_ERROR`, `INVALID_CREDENTIALS_MFA`,
  `SITE_NOT_AVAILABLE`, `ACCOUNT_LOCKED`, `ACCOUNT_CREDENTIALS_RESET`,
  `CONNECTION_ERROR`, `ACCOUNT_NEEDS_ACTION`, `USER_AUTHORIZATION_PENDING`,
  `USER_AUTHORIZATION_NOT_GRANTED`, `USER_NOT_SUPPORTED`,
  `USER_INPUT_TIMEOUT`, `MERGE_ERROR`, `ERROR`, `SUCCESS`,
  `PARTIAL_SUCCESS`).
- `client.fetchItem(id: string): Promise<Item>` (`client.d.ts:31`) é o
  método usado para buscar o Item; não existe `getItem`.
- `Item.connector.name: string` (`connector.d.ts:66`) é o nome da
  instituição.
- `Account.taxNumber: string | null` (`account.d.ts:34`) é o CPF/CNPJ do
  titular - **confirmado que `Item` não tem esse campo em nenhum nível**
  (nem em `Item.parameter`, nem em `Item.userAction`, nem em
  `Item.connector`). Ver nota "Sobre o teste de PII" abaixo.

Usei esses 40 valores reais como fonte de verdade dos testes (em vez da
tabela solta da PREMISSA), porque é o que realmente vai chegar em
`fetchPluggyItem` em produção, e porque a Pluggy documenta esses arrays
como a lista completa e oficial.

### Sobre o teste de PII (Critério 7) - nota de transparência

A seção 4 (fora de escopo) desta task exclui explicitamente "Persistir
`Account`s e `Transaction`s" - e `taxNumber` é um campo de `Account`, não
de `Item`. Ou seja, **o fluxo real desta task (`fetchItem` → persistir
`BankItem`) nunca toca um payload que contenha `taxNumber` de verdade** -
confirmado acima pela tipagem do SDK. Registro isso explicitamente em vez
de escrever um teste decorativo (lição do DT-011): um teste que afirma
"taxNumber não aparece" rodando sobre um payload de `Item` genuíno nunca
teria poder de detecção, porque a string simplesmente não pode estar lá
por construção do tipo.

Em vez de pular o critério ou fingir cobertura, tratei-o como **defesa em
profundidade prospectiva**: os testes fabricam um CPF (`FAKE_CPF =
"123.456.789-00"`, formato válido, nunca real) e o **injetam de verdade**
no payload mockado retornado por `client.fetchItem` (nível
`lib/pluggy.ts`) e por `fetchPluggyItem` (nível `lib/bank-item.ts`),
simulando contaminação futura (nova versão da API, erro de integração,
campo extra inesperado). Isso dá às asserções de "não persiste
`taxNumber`" poder de detecção real em **três camadas independentes**
(mesma técnica reforçada na revisão pós-aprovação da TASK-003):

1. `lib/pluggy.ts` → `fetchPluggyItem` deve reconstruir
   `{ institution, status, executionStatus }` campo a campo, nunca
   espalhar (`...item`) o objeto cru do SDK.
2. `lib/bank-item.ts` → `upsertBankItem` deve gravar só as 3 colunas
   conhecidas no Prisma, mesmo que o objeto vindo de `fetchPluggyItem`
   (mockado neste nível) tragua um campo extra.
3. `prisma/schema.prisma` → nenhum campo remotamente parecido com PII
   (`taxNumber`/`cpf`/`cnpj`) é declarado em nenhum model (teste de texto,
   guarda estrutural permanente, independente de qualquer mock).

### Contrato que os testes assumem (para o coder implementar exatamente assim)

**`prisma/schema.prisma`** (alterado):

- `model BankItem` ganha o campo `executionStatus String` (Critério 3,
  resolve o DT-009). Nullability é livre (nenhum teste força NOT NULL vs
  `String?`, mas todos os testes sempre fornecem um valor não-vazio) -
  recomendo `String` obrigatório, simétrico a `status`. Migration nova
  precisa ser gerada de verdade desta vez (ao contrário da TASK-002, isso
  adiciona uma coluna nova - não é uma mudança sem efeito no SQL).
- Nenhum campo de PII (`taxNumber`/`cpf`/`cnpj`) em nenhum model - guarda
  estrutural (Critério 7).

**`lib/pluggy.ts`** (estendido - `PluggyConfigError`/`PluggyConnectTokenError`/
`createConnectToken` da TASK-003 continuam intocados):

```ts
export class PluggyItemFetchError extends Error {}

export async function fetchPluggyItem(pluggyItemId: string): Promise<{
  institution: string;
  status: string;
  executionStatus: string;
}>
```

- Reutiliza a MESMA validação de `CLIENT_ID`/`CLIENT_SECRET` de
  `createConnectToken` - rejeita com `PluggyConfigError` (a classe já
  existente) **sem** instanciar `PluggyClient` quando as credenciais estão
  ausentes/vazias.
- Quando configurado: `client.fetchItem(pluggyItemId)`
  (`node_modules/pluggy-sdk/dist/client.d.ts:31`) e devolve **somente**
  `{ institution: item.connector.name, status: item.status,
  executionStatus: item.executionStatus }` - nenhum outro campo do `Item`
  passa adiante (Critério 7).
- Qualquer falha (item não encontrado/404, 500, timeout, exceção ou
  rejeição com objeto plano de erro HTTP) vira `PluggyItemFetchError`,
  mensagem fixa/genérica, sem stack trace nem detalhe do SDK - mesmo
  padrão de `PluggyConnectTokenError`.
- Nenhum `console.*` em nenhum caminho.

**`lib/bank-item.ts`** (estendido - `BankItemHasTransactionsError`/
`deleteBankItem` da TASK-002 continuam intocados):

```ts
export type BankItemState =
  | "OK"
  | "SINCRONIZANDO"
  | "PRECISA_ACAO"
  | "ERRO"
  | "PARCIAL";

export function deriveBankItemState(
  status: string,
  executionStatus: string,
): BankItemState

export async function upsertBankItem(pluggyItemId: string): Promise<{
  id: string;
  pluggyItemId: string;
  institution: string;
  status: string;
  executionStatus: string;
  state: BankItemState;
}>
```

**Regras de derivação de `deriveBankItemState`** (contrato exato, ordem de
prioridade - a primeira regra que casar decide; ver comentário completo em
`tests/unit/lib/bank-item-state.test.ts`):

1. `status` em `{WAITING_USER_INPUT, WAITING_USER_ACTION, LOGIN_ERROR}` →
   `PRECISA_ACAO` (Critério 4, literal para os dois primeiros; estendido a
   `WAITING_USER_ACTION` por ser a mesma família semântica)
2. `executionStatus === "PARTIAL_SUCCESS"` → `PARCIAL` (Critério 4: nunca
   `OK`)
3. `status === "UPDATED" && executionStatus === "SUCCESS"` → `OK` (única
   combinação "tudo certo")
4. `status` em `{UPDATING, MERGING}` OU `executionStatus` em
   `{CREATING, CREATED}` ∪ `CONNECTOR_EXECUTION_STATUSES` (os 13 valores
   "`_IN_PROGRESS`"/MFA, incluindo `WAITING_USER_INPUT`/`WAITING_USER_ACTION`
   *como executionStatus*) → `SINCRONIZANDO`
5. `status === "OUTDATED"` OU `executionStatus` em
   (`EXECUTION_FINISHED_STATUSES` menos `SUCCESS`/`PARTIAL_SUCCESS`) OU
   `executionStatus === "CREATE_ERROR"` → `ERRO`
6. Qualquer valor não reconhecido (a Pluggy pode adicionar valores novos a
   qualquer momento) → `ERRO` (fallback seguro - nunca `OK`, nunca lança)

`upsertBankItem` deve:

1. Chamar `fetchPluggyItem(pluggyItemId)` **primeiro** - se rejeitar,
   nenhuma operação de banco pode acontecer (Critério 6: nada de registro
   parcial).
2. Fazer um `prisma.bankItem.upsert({ where: { pluggyItemId }, create:
   {...}, update: {...} })` - **upsert**, não `create`, é o que resolve o
   Critério 5 estruturalmente (nunca colide com a constraint `@unique`
   como erro).
3. Devolver o registro persistido **mais** `state`, calculado por
   `deriveBankItemState(status, executionStatus)` - `state` NÃO é uma
   coluna do banco, só um campo calculado na resposta.

**`app/api/items/route.ts`** (novo):

```ts
export async function POST(request: Request): Promise<Response>
```

- Casca fina (Critério 2): parseia o corpo com **Zod**
  (`z.object({ pluggyItemId: z.string().uuid() })` ou equivalente,
  tolerante a corpo ausente/`null`/JSON malformado - mesma lição do bug de
  corpo `null` encontrado na revisão pós-aprovação da TASK-003), chama
  `upsertBankItem(pluggyItemId)` de `lib/bank-item.ts` e traduz o
  resultado/erro para `ApiResponse<T>`.
- Sucesso: `201` com `{ success: true, data: <retorno de upsertBankItem> }`
  (Critério 1).
- Erro de validação Zod (corpo ausente/`null`/malformado, sem
  `pluggyItemId`, formato não-UUID): `400` com `success: false` e uma
  `error` string genérica, **sem** chamar `upsertBankItem`.
- Qualquer erro capturado de `upsertBankItem` (`PluggyConfigError`,
  `PluggyItemFetchError`, ou qualquer coisa inesperada - a rota não confia
  cegamente no tipo, mesmo padrão de `app/api/connect-token/route.ts`):
  `500` com `success: false`, mensagem genérica, sem vazar
  stack trace/detalhe do SDK.
- Nenhum `console.*`.

### Arquivos de teste criados

- `tests/unit/lib/bank-item-state.test.ts` - unitário puro (sem I/O), da
  função `deriveBankItemState`. Cobre **cada um dos 7 valores de
  `ItemStatus`** (via `it.each`, executionStatus neutro `SUCCESS`) e **cada
  um dos 33 valores de `ExecutionStatus`** (via `it.each`, status neutro
  `UPDATED`) - 82 combinações no total, fonte de verdade o SDK real (ver
  investigação acima). Mais: testes dedicados para `PARTIAL_SUCCESS` nunca
  virar `OK`, para os status que exigem ação do usuário, e para valores
  desconhecidos (não documentados) não lançarem e resolverem para um
  estado seguro.
- `tests/unit/lib/pluggy.test.ts` - **estendido** (arquivo da TASK-003,
  não recriado): o mock hoisted de `PluggyClientMock` ganhou
  `fetchItem: fetchItemMock` no objeto devolvido pelo construtor
  (nenhum teste existente da TASK-003 foi alterado ou enfraquecido - só
  adicionei a chave nova ao objeto mockado). Novos describes cobrem
  `fetchPluggyItem`: sucesso (incluindo o teste de defesa contra PII com
  `FAKE_CPF` de verdade no payload mockado), credenciais ausentes/vazias
  (reaproveitando `PluggyConfigError`), e falha da Pluggy (404, exceção de
  rede/timeout, 500), sempre sem `console.*`.
- `tests/unit/api/items-route.test.ts` - unitário, mocka `@/lib/bank-item`
  inteiro (`upsertBankItem`). A validação Zod roda de verdade (não é
  mockada - é o único jeito de testar o Critério 1). Cobre: corpo
  ausente/`null`/JSON malformado, `pluggyItemId` ausente/não-string/vazio/
  formato não-UUID (todos `400`, sem chamar `upsertBankItem`), sucesso
  (`201`, `ApiResponse<T>`, repasse do `pluggyItemId`), defesa contra PII
  na resposta HTTP (mock de `upsertBankItem` resolvendo com um campo
  `taxNumber` fabricado, defesa em profundidade), erro tratado (`500`,
  três formatos de erro), e ausência de `console.*`.
- `tests/integration/bank-item-creation.integration.test.ts` - integração
  contra o Postgres real de teste (via `@/lib/db`, `resetDatabase`, mesmo
  padrão de `bank-item-deletion.integration.test.ts` da TASK-002), com
  `@/lib/pluggy` mockado inteiro (`fetchPluggyItem`) - nenhuma chamada de
  rede real é possível. Testa `upsertBankItem` diretamente: criação
  (institution/status/executionStatus persistidos crus), idempotência
  (duas chamadas com o mesmo `pluggyItemId` → um só registro, contando no
  banco, não só pelo retorno), `PARTIAL_SUCCESS` → `PARCIAL` persistido
  fim a fim, status que exigem ação do usuário, valor desconhecido não
  quebra o fluxo completo, falha da Pluggy não deixa registro órfão (dois
  cenários: criação nova e atualização de um registro existente,
  provando que o registro original sobrevive intacto), e PII não
  persistida em nenhuma coluna (com `FAKE_CPF` de verdade no payload
  mockado, mais checagem de `Object.keys` do row cru contra o Postgres).
- `tests/integration/api/items.integration.test.ts` - smoke test ponta a
  ponta (rota real + `lib/bank-item.ts` real + Postgres real, só
  `@/lib/pluggy` mockado) - prova que a fiação entre as três camadas
  funciona de verdade, o que nem o teste de rota (mocka a lib) nem o teste
  de integração da lib (mocka a Pluggy, não passa pela rota) provam
  sozinhos. 4 testes: sucesso persiste e responde `201`, idempotência via
  duas chamadas HTTP não duplica, corpo inválido não toca o banco, falha
  da Pluggy não persiste nada.
- `tests/unit/schema/bank-item-execution-status.test.ts` - teste de texto
  do schema (mesmo padrão de `on-delete-explicit.test.ts` da TASK-002):
  `BankItem` declara `executionStatus` (Critério 3, RED hoje) e continua
  declarando `status` (controle, já verde hoje) e nenhum model do schema
  declara campo de PII (Critério 7, guarda estrutural, já verde hoje - ver
  nota de PII acima).

### Arquivo de fixture alterado (necessário para não quebrar as tasks anteriores)

`tests/fixtures/db.ts` → `buildBankItem()` ganhou um default
`executionStatus: "SUCCESS"`. Sem isso, no dia em que o coder adicionar a
coluna `executionStatus` como obrigatória, todo teste anterior que chama
`buildBankItem()` sem esse campo (TASK-001/TASK-002) quebraria com
`PrismaClientValidationError: Unknown argument`. Como o default é sempre
sobrescrevível via `overrides`, nenhuma asserção existente muda de
comportamento.

### ⚠️ Efeito colateral ESPERADO e TEMPORÁRIO desta mudança de fixture (não é regressão real)

Rodando a suíte **hoje** (schema ainda sem `executionStatus`, antes da
implementação do coder), 11 testes que antes eram verdes (TASK-001/
TASK-002) aparecem como falhando:

- `tests/integration/schema.integration.test.ts` - 7 testes (todos os que
  chamam `buildBankItem()`), erro
  `PrismaClientValidationError: Unknown argument 'executionStatus'`.
- `tests/integration/bank-item-deletion.integration.test.ts` - 4 testes
  (idem), mesmo motivo.

Isso é **esperado e proposital**, não uma regressão que eu introduzi por
descuido: confirmei a causa exata rodando `npm test -- tests/integration/schema.integration.test.ts`
e lendo o erro do Prisma linha a linha (`Unknown argument executionStatus.
Available options are marked with ?` - nenhum outro erro, nenhuma
asserção de teste alterada). No instante em que o coder adicionar
`executionStatus String` ao model `BankItem` e aplicar a migration
(Critério 3), esses 11 testes **voltam a verde automaticamente**, sem
qualquer alteração nos arquivos de teste - o default do fixture passa a
ser um argumento válido para o Prisma Client gerado. É mais uma
maneira de o coder confirmar que a migration está correta: se esses 11
testes não voltarem a verde depois de aplicar a migration, algo está
errado na migration/schema.

### Estado RED confirmado nesta sessão

```
npm test
# Test Files  8 failed | 7 passed (15)
#      Tests  104 failed | 55 passed (159)
```

Detalhamento por arquivo (`npm test -- <arquivo>`):

| Arquivo | Testes | Falhando | Motivo |
|---|---|---|---|
| `tests/unit/lib/bank-item-state.test.ts` | 49 | 49 | `deriveBankItemState is not a function` / `TS2339` |
| `tests/unit/lib/pluggy.test.ts` | 25 | 10 (15 antigos continuam verdes) | `fetchPluggyItem is not a function` / `TS2339` |
| `tests/unit/api/items-route.test.ts` | 19 | 19 | `Cannot find package '@/app/api/items/route'` |
| `tests/integration/bank-item-creation.integration.test.ts` | 10 | 10 | `upsertBankItem is not a function` |
| `tests/integration/api/items.integration.test.ts` | 4 | 4 | `Cannot find package '@/app/api/items/route'` |
| `tests/unit/schema/bank-item-execution-status.test.ts` | 3 | 1 (2 controles já verdes, ver nota de PII) | schema ainda sem `executionStatus` |
| `tests/integration/schema.integration.test.ts` (TASK-001) | 10 | 7 (efeito colateral temporário, ver acima) | fixture com `executionStatus` |
| `tests/integration/bank-item-deletion.integration.test.ts` (TASK-002) | 6 | 4 (efeito colateral temporário, ver acima) | fixture com `executionStatus` |

`npx tsc --noEmit` → todas as linhas de erro são `TS2307` (módulo
`@/app/api/items/route` ausente) ou `TS2339` (propriedade
`deriveBankItemState`/`upsertBankItem`/`fetchPluggyItem`/
`PluggyItemFetchError` ausente) - nenhum erro de sintaxe, nenhum erro em
qualquer arquivo fora do escopo desta task. `npx eslint
tests/unit/lib/bank-item-state.test.ts tests/unit/lib/pluggy.test.ts
tests/unit/api/items-route.test.ts
tests/integration/bank-item-creation.integration.test.ts
tests/integration/api/items.integration.test.ts
tests/unit/schema/bank-item-execution-status.test.ts tests/fixtures/db.ts`
→ limpo, 0 erros/warnings.

Nenhum teste novo passou incidentalmente (investigado): os únicos 2
testes novos já verdes hoje são os dois controles de
`bank-item-execution-status.test.ts` que documentei explicitamente como
"já verdes hoje" (BankItem continua com `status`; nenhum model tem campo
de PII) - nenhum dos dois testa um critério ainda não implementado, então
não são falso-positivo.

### Comandos para rodar

```bash
npm test                                                                 # suite inteira
npm test -- tests/unit/lib/bank-item-state.test.ts                      # deriveBankItemState (Criterio 4)
npm test -- tests/unit/lib/pluggy.test.ts                                # createConnectToken (TASK-003) + fetchPluggyItem (TASK-004)
npm test -- tests/unit/api/items-route.test.ts                           # rota isolada (lib/bank-item mockada)
npm test -- tests/integration/bank-item-creation.integration.test.ts     # upsertBankItem contra Postgres real (Pluggy mockada)
npm test -- tests/integration/api/items.integration.test.ts              # smoke ponta a ponta (rota+lib+Postgres real, Pluggy mockada)
npm test -- tests/unit/schema/bank-item-execution-status.test.ts         # schema.prisma (Criterio 3 + 7)
npm run test:coverage                                                    # cobertura v8, threshold 80% em lib/**, app/api/**/route.ts
npx tsc --noEmit                                                          # confirma que as falhas sao so TS2307/TS2339
npx eslint tests/unit/lib/bank-item-state.test.ts tests/unit/lib/pluggy.test.ts tests/unit/api/items-route.test.ts tests/integration/bank-item-creation.integration.test.ts tests/integration/api/items.integration.test.ts tests/unit/schema/bank-item-execution-status.test.ts tests/fixtures/db.ts
```

### Mapeamento critério de aceite → teste

| Critério (seção 3) | Arquivo | Teste(s) |
|---|---|---|
| 1. `POST /api/items` existe, valida com Zod, `ApiResponse<T>` | `tests/unit/api/items-route.test.ts` | describe "validacao com Zod" (10 testes) + describe "sucesso" (`"pluggyItemId valido -> 201..."`) |
| 2. Rota é casca fina; lógica em `lib/` | Implícito em todos os testes de `items-route.test.ts` (mockam `@/lib/bank-item`; só passam se a rota de fato delegar) + `bank-item-creation.integration.test.ts` (lógica real testada isolada da rota) | Todos os testes de ambos, coletivamente |
| 3. `executionStatus` no schema, migration gerada | `tests/unit/schema/bank-item-execution-status.test.ts` | `"model BankItem declara o campo executionStatus"` (RED hoje). Migration: verificação manual - `ls prisma/migrations/` deve mostrar um diretório novo além de `20260721010539_init`, com SQL real (`ALTER TABLE ... ADD COLUMN`), ao contrário da TASK-002 |
| 4. Derivação do estado, cada valor + `PARTIAL_SUCCESS`→`PARCIAL` + desconhecido | `tests/unit/lib/bank-item-state.test.ts` | os dois `it.each` (82 combinações, cada um dos 7 `ItemStatus` e 33 `ExecutionStatus`), mais `"PARTIAL_SUCCESS nunca vira OK"` (2 testes), `"status que exige acao do usuario"` (2 testes), `"valor desconhecido nao quebra"` (4 testes). Nível integração: `bank-item-creation.integration.test.ts` → describes `"PARTIAL_SUCCESS nunca vira OK, mesmo persistido"`, `"status que exige acao do usuario"`, `"valor desconhecido nao quebra o fluxo ponta a ponta"` |
| 5. Idempotência (constraint `@unique` não vira 500) | `tests/integration/bank-item-creation.integration.test.ts` | `"chamar duas vezes com o mesmo pluggyItemId deixa UM registro atualizado..."` (conta no banco, não só pelo retorno). Nível ponta a ponta: `tests/integration/api/items.integration.test.ts` → `"chamar a rota duas vezes com o mesmo pluggyItemId nao duplica..."` |
| 6. Falha da Pluggy não deixa registro parcial | `tests/integration/bank-item-creation.integration.test.ts` | describe `"falha da Pluggy nao deixa registro parcial"` (2 testes: criação nova e atualização existente). Nível ponta a ponta: `tests/integration/api/items.integration.test.ts` → `"Pluggy fora do ar... responde erro tratado e nao persiste nada"` |
| 7. `taxNumber`/PII não persistida | `tests/unit/lib/pluggy.test.ts` → `"retorna SOMENTE institution/status/executionStatus mesmo que o Item traga PII..."`. `tests/integration/bank-item-creation.integration.test.ts` → `"mesmo que fetchPluggyItem resolva com um campo extra parecido com PII..."`. `tests/unit/api/items-route.test.ts` → `"mesmo que upsertBankItem resolva com um campo extra parecido com PII..."`. `tests/unit/schema/bank-item-execution-status.test.ts` → `"nenhuma linha do schema declara um campo taxNumber/cpf/cnpj..."` (guarda estrutural, já verde) |
| 8. Nenhuma chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET` | Toda a suíte (infra de mock, mesmo padrão da TASK-003) | `tests/unit/lib/pluggy.test.ts` → `"rejeita com PluggyConfigError... SEM instanciar PluggyClient nem chamar fetchItem"` |
| 9. Nenhum `console.*` | `tests/unit/lib/pluggy.test.ts`, `tests/unit/api/items-route.test.ts` | testes dedicados `"nao chama console.log/warn/error..."` em cada arquivo, caminho feliz e de erro |
| 10. Suíte verde + build + lint | Todos os arquivos acima + os 64 anteriores (uma vez a migration aplicada, ver nota de efeito colateral temporário) | `npm test` (verde esperado após a implementação), `npm run build`, `npm run lint` — comandos manuais |
| Edge case: payload sem `pluggyItemId` / não-UUID → 400 sem persistir | `tests/unit/api/items-route.test.ts` (10 casos de `it.each` + corpo ausente/null/malformado) + `tests/integration/api/items.integration.test.ts` → `"corpo invalido... nao toca o banco"` | — |

## 6. Implementação (preenchido pelo coder)

### Estado da suíte ao final

`npm test`: **15 arquivos, 159/159 testes passando** (verde na primeira execução completa
após a implementação — os 64 testes anteriores de TASK-001/002/003 sem regressão, mais os
95 novos desta task, incluindo os 11 que estavam "temporariamente vermelhos" por causa do
`executionStatus` no fixture, como o qa já havia previsto). `npx tsc --noEmit` limpo.
`npm run lint` limpo (0 erros, 0 warnings). `npm run build` passa **com e sem**
`CLIENT_ID`/`CLIENT_SECRET`/`DATABASE_URL` no ambiente (verificado manualmente, mesmo
procedimento das tasks anteriores). `npm run test:coverage`: 99.01% statements / 97.95%
branches / 95% functions / 99% lines — acima do threshold de 80%.

### Arquivos criados

- `app/api/items/route.ts` — `POST` casca fina: valida o corpo com
  `z.object({ pluggyItemId: z.uuid() })` (API não-depreciada do Zod v4 — `z.string().uuid()`
  aparece marcado `@deprecated` na tipagem instalada, então usei `z.uuid()` top-level),
  chama `upsertBankItem(pluggyItemId)` de `lib/bank-item.ts`, e traduz sucesso (201,
  `data` reconstruído campo a campo) ou qualquer erro (400 na validação Zod / 500 em
  qualquer erro de `upsertBankItem`) para `ApiResponse<T>`.
- `prisma/migrations/20260721162033_add_execution_status_to_bank_item/` — migration real
  (`ALTER TABLE "BankItem" ADD COLUMN "executionStatus" TEXT NOT NULL`), gerada com
  `npx prisma migrate dev --name add-execution-status-to-bank-item` contra o Postgres de
  desenvolvimento (tabela `BankItem` vazia no momento — confirmei com
  `SELECT count(*) FROM "BankItem"` antes de rodar, então a coluna `NOT NULL` sem default
  não teve nenhum dado existente para violar).

### Arquivos alterados

- `prisma/schema.prisma` — `BankItem` ganha `executionStatus String` (obrigatório — ver
  decisão 1 abaixo). Comentário de cabeçalho atualizado.
- `lib/pluggy.ts` — `PluggyItemFetchError` (nova classe de erro, mesmo padrão de
  `PluggyConnectTokenError`) e `fetchPluggyItem(pluggyItemId)`: reutiliza a validação de
  `CLIENT_ID`/`CLIENT_SECRET` já existente (rejeita com `PluggyConfigError` sem instanciar
  `PluggyClient`); quando configurado, `client.fetchItem(pluggyItemId)` e reconstrói
  `{ institution: item.connector.name, status: item.status, executionStatus:
  item.executionStatus }` — nunca espalha (`...item`). Qualquer falha vira
  `PluggyItemFetchError` com mensagem fixa.
- `lib/bank-item.ts` — `BankItemState`, `deriveBankItemState(status, executionStatus)`
  (as 6 regras de prioridade, ver decisão 2) e `upsertBankItem(pluggyItemId)`: chama
  `fetchPluggyItem` primeiro (se rejeitar, nenhuma operação de banco acontece — critério 6),
  depois `prisma.bankItem.upsert` por `pluggyItemId` (critério 5 — idempotência estrutural,
  nunca colide com a constraint única como erro), devolve o registro reconstruído campo a
  campo mais `state` calculado (nunca é coluna do banco).
- `docs/tasks/TASK-004.md` — esta seção 6.

### Decisões tomadas (e por quê)

1. **`executionStatus String` obrigatório, não `String?`.** A task deixou a nulidade livre
   ("nenhum teste força NOT NULL vs `String?`"), mas escolhi obrigatório por ser o modelo
   correto, não o mais fácil de migrar (a própria mensagem do orquestrador pediu essa
   justificativa): um `BankItem` só é criado por `upsertBankItem`, que **sempre** chama
   `fetchPluggyItem` antes de qualquer escrita no banco — e `fetchPluggyItem` só resolve
   com sucesso se `client.fetchItem` devolveu um `Item` de verdade, cujo `status` e
   `executionStatus` são campos obrigatórios na própria tipagem do SDK
   (`node_modules/pluggy-sdk/dist/types/item.d.ts:76,82` — nenhum `| null` em nenhum dos
   dois). Não existe caminho legítimo, hoje, para um `BankItem` existir sem
   `executionStatus` conhecido — torná-lo opcional esconderia essa garantia em vez de
   documentá-la no schema. Verifiquei que a tabela de desenvolvimento estava vazia antes
   de gerar a migration, então a coluna `NOT NULL` sem default não quebrou nada; se
   houvesse dado de produção pré-existente, a decisão teria exigido um valor por etapas
   (coluna opcional + backfill + `NOT NULL` numa migration seguinte) — mas não é o caso
   aqui, e a task pediu para decidir pelo modelo, não pela migration mais fácil.
2. **`deriveBankItemState` com `Set`s de constantes espelhando os arrays reais do SDK**
   (`ITEM_STATUSES`, `CONNECTOR_EXECUTION_STATUSES`, `EXECUTION_FINISHED_STATUSES` de
   `node_modules/pluggy-sdk/dist/types/item.js`/`execution.js`), em vez de uma lista de
   `if/else` solta — verifiquei manualmente as 82 combinações do `it.each` de
   `tests/unit/lib/bank-item-state.test.ts` contra a implementação antes mesmo de rodar o
   teste (todas bateram na primeira tentativa), porque a ordem de prioridade das 6 regras
   é o que realmente importa (`PARTIAL_SUCCESS` verificado antes da combinação "tudo
   certo", por exemplo) — a estrutura em `Set` deixa cada regra auditável linha a linha
   contra a lista de valores documentada no comentário.
3. **`upsertBankItem`/rota reconstroem o objeto de retorno campo a campo em toda camada**
   (nunca `...spread`), incluindo o "PII prospectivo" do critério 7: como o qa documentou,
   `taxNumber` é campo de `Account`, não de `Item` — o fluxo real desta task nunca tocaria
   esse valor. Ainda assim, tratei isso como defesa em profundidade real: `fetchPluggyItem`
   reconstrói de `item` (não espalha), `upsertBankItem` reconstrói do resultado de
   `fetchPluggyItem` E do row do Prisma (não espalha nenhum dos dois — inclusive isso é o
   que faz `Object.keys(result)` ficar em exatamente 6 chaves em vez de herdar `lastSyncAt`
   do row do Prisma), e a rota reconstrói de novo a partir do retorno de `upsertBankItem`
   antes de montar `data`. Três camadas independentes, cada uma correta por construção, não
   por sorte de payload.
4. **Rota não distingue `PluggyConfigError` de `PluggyItemFetchError`/erro inesperado** no
   corpo do 500 — mesmo padrão de `app/api/connect-token/route.ts` da TASK-003; nenhum
   teste exige mensagens diferentes por tipo.
5. **`z.uuid()` em vez de `z.string().uuid()`** — a segunda forma aparece marcada
   `@deprecated` na tipagem instalada do Zod v4 (`node_modules/zod/v4/classic/schemas.d.ts`),
   e a instrução do projeto é heed deprecation notices em dependências mais novas que o
   meu treinamento.

### Dívidas assumidas / itens para o orquestrador

1. Nenhum débito técnico novo identificado por mim. Não toquei em nenhum item de
   `docs/DEBITO-TECNICO.md` (DT-002, sobre desconectar/arquivar banco, é explicitamente
   fora de escopo — seção 4 desta task — e fica para a TASK-005).
2. Nenhum `any` foi usado; nenhum `console.log`/`console.warn`/`console.error` foi usado em
   nenhum arquivo novo/alterado.
3. `lib/bank-item.ts` agora importa `@/lib/pluggy` — não há import circular (`lib/pluggy.ts`
   não importa `lib/bank-item.ts`), mas registro que os dois módulos de domínio da
   integração Pluggy (`pluggy.ts`, camada de API externa; `bank-item.ts`, camada de
   persistência + regra de estado) crescem juntos; se uma task futura precisar de mais
   funções cruzando essa fronteira, vale considerar se `bank-item.ts` deveria virar uma
   pasta (`lib/bank-item/`) em vez de um arquivo só cada vez maior — não fiz essa
   reorganização agora porque nenhuma regra do projeto exige e o arquivo ainda está bem
   abaixo de qualquer limite de tamanho razoável.

## 7. Revisão (preenchido pelo code-reviewer)

**Veredito: APROVADO**

Revisei o diff completo contra a seção 11 da PREMISSA, o `docs/DEBITO-TECNICO.md` e o
`pluggy-sdk` instalado. Os cinco pontos de julgamento foram verificados empiricamente — no
Postgres, no SQL realmente emitido pelo Prisma, e por varredura exaustiva do espaço de estados.

### 1. `executionStatus` obrigatório e o risco da migration

**A decisão de modelo está certa; o risco da migration é real mas não é alcançável hoje.**

Concordo com o modelo, e verifiquei a justificativa em vez de aceitá-la: `item.status` e
`item.executionStatus` são não-nuláveis na própria tipagem do SDK
(`types/item.d.ts`), e `upsertBankItem` é o **único** caminho de escrita de `BankItem` —
sempre passando por `fetchPluggyItem` antes. Não existe caminho legítimo para um `BankItem`
sem `executionStatus`, então `String?` esconderia uma garantia real. Obrigatório é o modelo
correto.

O risco que você apontou também é real, e reproduzi para caracterizá-lo com precisão: criei um
banco descartável no estado da migration da TASK-001, inseri **um** `BankItem`, e apliquei o
SQL exato desta migration. Resultado:

```
ERROR:  column "executionStatus" of relation "BankItem" contains null values
```

Ou seja: `ADD COLUMN ... TEXT NOT NULL` sem default de fato só funciona em tabela vazia — a
própria migration carrega o aviso do Prisma dizendo isso.

**Por que ainda assim não bloqueia:** nenhum ambiente existente pode falhar. Conferi o banco de
desenvolvimento (`gestor`): as duas migrations já constam aplicadas em `_prisma_migrations` e a
tabela tem **0 linhas**; `gestor_test` idem; não existe banco de produção. E qualquer banco novo
replica as migrations em ordem sobre tabela vazia — `init` cria, esta altera, ambas em base
vazia. O cenário de falha exigiria um banco que tenha `BankItem`s criados **antes** desta
migration e ainda não migrado, e isso não existe: até a TASK-003 nada persistia `BankItem`.

**O que deve virar DT é o precedente, não este arquivo.** Na Fase 2, adicionar uma coluna
obrigatória a `Transaction`/`Account` — tabelas que **estarão cheias** — com esse mesmo padrão
quebra um deploy real. Recomendo registrar a regra: coluna nova `NOT NULL` em tabela que possa
ter linhas vai em três passos (nullable → backfill → `SET NOT NULL`) ou com `DEFAULT`. Não
mexeria nesta migration agora: reescrevê-la depois de aplicada criaria divergência de checksum
sem resolver risco nenhum.

### 2. Derivação de estado — verificada por varredura exaustiva, não pela contagem

Não conferi as 82 combinações do coder: varri o espaço inteiro. Cruzei os 7 `ItemStatus` e os
33 `ExecutionStatus` reais do SDK **mais 8 valores adversariais em cada eixo** (string vazia,
valor futuro inventado, `"success"` minúsculo, `"Ok"`, `"null"`, `"PARTIAL_SUCCESS "` com
espaço à direita, numérico) — **615 combinações**. Resultados:

- **`PARTIAL_SUCCESS` produz `OK` em 0 casos.** O invariante do critério 4 é absoluto: R2 vem
  antes de R3, e R3 ainda exige `executionStatus === "SUCCESS"`, que é literalmente outro
  valor. Não há caminho.
- **Exatamente UMA combinação em todo o espaço produz `OK`: `UPDATED + SUCCESS`.** Essa é a
  forma mais forte possível da regra "nunca assumir sucesso" — qualquer coisa fora desse par
  exato cai em outro estado.
- **Fallback seguro confirmado:** todo valor desconhecido, vazio ou com variação de
  caixa/espaço resolve para `ERRO`, nunca lança, e o retorno está sempre dentro dos 5 estados
  válidos (0 resultados fora do conjunto).
- **Nuance encontrada (3 casos em 615):** quando o `status` exige ação do usuário
  (`WAITING_USER_INPUT`, `WAITING_USER_ACTION`, `LOGIN_ERROR`) **e** o `executionStatus` é
  `PARTIAL_SUCCESS`, o resultado é `PRECISA_ACAO`, não `PARCIAL` — R1 tem precedência sobre R2.
  Não viola o critério (que exige "nunca `OK`", e não é `OK`), e me parece o comportamento certo
  de produto: se o login quebrou, a ação do usuário é a informação acionável. Mas o cenário da
  seção 2 lê como se `PARTIAL_SUCCESS` sempre virasse `PARCIAL`, então vale uma confirmação
  explícita do usuário e uma linha na seção 11 da PREMISSA documentando a precedência. Os
  testes atuais assertam `not.toBe("OK")` nesses cruzamentos — ou seja, cobrem o invariante
  garantido sem afirmar a versão forte demais. Está correto como está.

### 3. Atomicidade

Não há ordem de operações em que a escrita preceda a confirmação do fetch.
`upsertBankItem` desestrutura o resultado de `await fetchPluggyItem(...)` na primeira instrução;
se essa promessa rejeita, a função lança antes de qualquer referência a `prisma`. Não existe
escrita especulativa, nem `create` prévio, nem atualização de `lastSyncAt` antes do fetch. A
rota também não toca o banco — só valida e delega. O `upsert` em si é uma única instrução (ver
ponto 4), então nem parcialidade intra-operação existe. Os testes cobrem os dois cenários que
importam: falha em criação nova e falha ao atualizar registro existente (provando que o
registro anterior sobrevive intacto).

### 4. Idempotência e corrida

**Verificado no SQL real, não só pelo teste.** Liguei o log de queries do Prisma e capturei o
que o `upsert` emite, tanto para registro novo quanto existente — nos dois casos, uma única
instrução nativa:

```sql
INSERT INTO "public"."BankItem" (...) VALUES (...) ON CONFLICT ("pluggyItemId") DO UPDATE SET ...
```

Não é o padrão `SELECT` → `INSERT`/`UPDATE` em duas viagens, que teria janela de corrida.
Confirmei o efeito prático disparando **12 upserts simultâneos do mesmo `pluggyItemId`** via
`Promise.allSettled`: **0 rejeições, 1 linha na tabela**. A constraint `@unique` não vira 500
nem sob concorrência, e não há corrida possível entre chamadas simultâneas. Critério 5
satisfeito estruturalmente.

### 5. PII e persistência "por atacado"

Nada é persistido por atacado — **não existe um único operador spread em todo o código de
produção** (`lib/bank-item.ts`, `lib/pluggy.ts`, `app/api/items/route.ts`,
`app/api/connect-token/route.ts`), verificado por varredura. As três camadas reconstroem campo
a campo: `fetchPluggyItem` monta 3 campos a partir de `item`; `upsertBankItem` usa listas
explícitas em `create`/`update` e reconstrói o retorno (é por isso que `lastSyncAt` do row do
Prisma não vaza para a resposta); a rota reconstrói de novo antes de montar `data`. Cada camada
é correta por construção, não por sorte de payload — o que é exatamente o que dá poder de
detecção real à defesa em profundidade que o qa montou com o CPF fabricado. A conversão do
critério 7 feita pelo qa foi a decisão certa, e a implementação a sustenta.

### Regressão e qualidade da suíte

`npm run test:coverage`: **159/159 verde**, 99.01% stmts / 97.95% branches / 95% funcs. A
alteração no fixture é puramente aditiva e sobrescrevível — nenhuma asserção existente muda de
comportamento. No `tests/unit/lib/pluggy.test.ts` a única remoção é o bloco `vi.hoisted`,
substituído por uma versão estendida que **preserva** a correção da TASK-003 (mock construível
via `function`, não arrow) e apenas acrescenta `fetchItem`. Nenhum teste anterior foi
enfraquecido.

### Problemas bloqueantes

Nenhum.

### Problemas não-bloqueantes — recomendo registrar como DT

1. **[VIRAR DT] Padrão de migration que só funciona em tabela vazia.**
   `prisma/migrations/20260721162033_add_execution_status_to_bank_item/migration.sql` faz
   `ALTER TABLE "BankItem" ADD COLUMN "executionStatus" TEXT NOT NULL` sem default. Reproduzi a
   falha (`column ... contains null values`) contra uma tabela com uma linha. Hoje é
   inalcançável — verifiquei que todo ambiente existente já está migrado e com 0 linhas, e que
   banco novo replica sobre tabela vazia — mas o padrão repetido na Fase 2, sobre
   `Transaction`/`Account` já populadas, quebra deploy. DT deve registrar a **regra**, não o
   arquivo: coluna `NOT NULL` nova em tabela que possa ter linhas exige três passos (nullable →
   backfill → `SET NOT NULL`) ou `DEFAULT`. Não reescrever esta migration.

2. **[VIRAR DT, sob o padrão do DT-011] A regra 5 de `deriveBankItemState` é
   inverificável — nenhum teste possível pode detectar erro nela.** R5 e R6 retornam ambas
   `"ERRO"`, então R5 não pode alterar nenhuma saída. Comprovei: reimplementei a função
   **sem a regra 5 inteira** e comparei nas 615 combinações — **0 divergências**. Consequência
   prática: os 15 valores de `ERROR_EXECUTION_STATUSES`, a checagem de `CREATE_ERROR` e o
   `status === "OUTDATED"` são hoje documentação executável que não executa nada. Uma omissão ou
   erro de digitação nesse conjunto é **indetectável** por qualquer teste, e o `it.each` de 33
   valores dá a impressão de validar a família de erro sem validá-la. A assimetria importa: uma
   *classificação errada* na direção oposta (valor de erro colocado no conjunto de
   sincronização) **seria** pega. Não é defeito de comportamento — o resultado está correto
   hoje — mas vira risco no dia em que alguém introduzir um estado distinto para valor
   desconhecido (ex.: `DESCONHECIDO`, para separar "a Pluggy lançou valor novo" de "deu erro"),
   porque aí R5 passa a ser load-bearing com 15 valores nunca exercitados. Registrar junto do
   DT-011.

### Observações menores (não precisam virar DT)

- **`PARTIAL_SUCCESS` + status de ação do usuário → `PRECISA_ACAO`** (3 das 615 combinações,
  detalhado no ponto 2). Não viola nenhum critério; peça confirmação ao usuário e documente a
  precedência na seção 11 da PREMISSA, em vez de tratar como dívida.
- `lastSyncAt` continua sem nenhum caminho de escrita — coerente, já que sync é Fase 2 e está
  fora de escopo aqui; só registro para não passar batido quando a task de sync chegar.
- `state` ser calculado e nunca persistido é a decisão certa: elimina a classe inteira de bug
  "estado derivado dessincronizado dos valores crus".

### Segurança e escopo

Sem achados. Nenhuma credencial hardcoded, nenhum `console.*`, nenhum `any`, nenhum
`NEXT_PUBLIC_`. `fetchPluggyItem` reusa a validação de credenciais e não instancia
`PluggyClient` sem elas; erros do SDK viram `PluggyItemFetchError` com mensagem fixa, sem
interpolar texto do fornecedor. A rota valida com Zod antes de qualquer efeito e trata corpo
`null` corretamente — a lição da revisão da TASK-003 foi aplicada, e `z.uuid()` em vez da forma
depreciada está correto para o Zod v4 instalado. Seção 4 respeitada: nada de widget/UI, nada de
`Account`/`Transaction`, nada de webhook, DT-002 intocado. O DT-009 está de fato resolvido: os
dois campos da Pluggy passaram a ser persistidos separadamente e o estado derivado nunca trata
`PARTIAL_SUCCESS` como sucesso.
