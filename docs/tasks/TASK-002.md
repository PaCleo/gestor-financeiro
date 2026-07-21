# TASK-002 — Política de exclusão do BankItem + fail-fast de DATABASE_URL
Status: CONCLUÍDA | Fase do roadmap: 0 (dívidas da TASK-001)

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack já montada pela TASK-001: **Next 16.2.10**, **Prisma 7.9.0** com driver adapter
  (`@prisma/adapter-pg` + `pg`), Postgres 16 em docker-compose, Vitest com database de teste
  `gestor_test`. Prisma 7 e Next 16 são provavelmente **posteriores ao seu treinamento** —
  consulte `node_modules/prisma` e `node_modules/next/dist/docs/01-app/` antes de assumir
  formato de config, API de client ou assinatura de route handler.
- Leia `docs/DEBITO-TECNICO.md` antes de reportar qualquer problema como novo.
- Esta task nasce de dois achados **não-bloqueantes** da revisão da TASK-001. O terceiro achado
  (`eslint-disable` na rota de health) foi deliberadamente deixado de fora: é o DT-001.
- Regras do projeto: lógica de negócio em `lib/`, API routes são cascas finas, formato
  `ApiResponse<T>`, sem `console.log`, sem `any` sem justificativa, credenciais só em `.env.local`.

## 1. Objetivo

Tornar **intencional** a política de exclusão de um banco conectado — hoje ela é um efeito
colateral acidental de defaults do Prisma — e fazer a aplicação falhar alto quando
`DATABASE_URL` não estiver configurada, em vez de tentar conectar em um destino arbitrário.

## 2. Comportamento esperado (TDD)

- DADO um `BankItem` cujas `Account`s não possuem transações QUANDO o deleto
  ENTÃO ele e suas `Account`s são removidos com sucesso
- DADO um `BankItem` com ao menos uma `Transaction` importada QUANDO tento deletá-lo
  ENTÃO a operação é recusada E **nada é apagado** — a `Account` e a `Transaction` continuam
  existindo depois da tentativa
- DADO essa mesma tentativa recusada QUANDO capturo o erro
  ENTÃO recebo um **erro de domínio nomeado**, com mensagem útil ao usuário, e não o erro cru
  do Postgres (`violates foreign key constraint "Transaction_accountId_fkey"`)
- DADO `DATABASE_URL` ausente ou string vazia QUANDO a aplicação tenta obter o client do banco
  ENTÃO falha imediatamente com mensagem explícita citando a variável faltante
- DADO `DATABASE_URL` ausente QUANDO rodo `npm run build`
  ENTÃO o build **continua passando** — o fail-fast não pode quebrar build/CI, que não têm banco

## 3. Critérios de aceite

- [x] 1. `prisma/schema.prisma` declara `onDelete` **explicitamente** nas duas relações do fluxo:
      `BankItem→Account` = `Cascade` e `Account→Transaction` = `Restrict`.
      **Emendado após a revisão (2026-07-21):** a redação original exigia "migration nova gerada e
      aplicada", o que é insatisfazível — o Prisma já compilava essas relações para
      `ON DELETE CASCADE`/`RESTRICT` por default, então tornar a intenção explícita no schema gera
      **zero SQL**. Verificado por `pg_constraint` e por um diff de migration que retorna
      "empty migration" com exit 0. O critério se satisfaz com o schema explícito e nenhuma
      migration nova. A migration da TASK-001 não foi tocada.
- [ ] 2. Teste de integração prova que deletar `BankItem` **com** transações não apaga nada —
      asserção explícita de que a `Transaction` e a `Account` ainda existem após a tentativa
- [ ] 3. Teste prova que deletar `BankItem` **sem** transações funciona; o teste de cascade já
      existente da TASK-001 permanece verde
- [ ] 4. `lib/` expõe a exclusão traduzindo a violação de FK num erro de domínio nomeado (classe
      de erro própria ou tipo discriminado — decisão do coder), com mensagem útil; teste cobre a
      tradução e garante que a mensagem não vaza connection string nem detalhe interno do driver
- [ ] 5. Fail-fast de `DATABASE_URL` implementado com teste que cobre ausente **e** string vazia
- [ ] 6. `npm run build` passa **sem** `DATABASE_URL` no ambiente — verificar de fato, rodando o
      build com a variável desativada, não presumir
- [ ] 7. Suíte inteira verde (os 21 testes da TASK-001 mais os novos), `npm run build` e
      `npm run lint` limpos

## 4. Fora de escopo

- `RecurringBill` e `RecurringBillInstance` (o `onDelete` delas é o DT-003, fica para a Fase 4)
- Endpoint ou UI de exclusão de banco — esta task entrega só a camada de `lib/`
- Soft delete / arquivamento / "desconectar banco" — é o DT-002, fica para a Fase 1 ou 6
- O `eslint-disable` da rota de health — é o DT-001, deliberadamente adiado pelo usuário
- Qualquer coisa de Pluggy: connect token, widget, sync

## 5. Testes (preenchido pelo qa)

### Arquivos de teste criados nesta task

- `tests/integration/bank-item-deletion.integration.test.ts` — bate no Postgres real
  de teste (`gestor_test`, via `lib/db.ts` + `resetDatabase`, mesmo padrão da
  TASK-001). Contém:
  - `describe("Política de onDelete no Postgres (Critério 1 da TASK-002)")` — consulta
    `pg_constraint` (cast `confdeltype::text`, necessário porque o driver adapter do
    Prisma 7 não desserializa o tipo interno `"char"` do Postgres sem cast explícito)
    e prova que `Account_bankItemId_fkey` é `CASCADE` (`confdeltype = 'c'`) e
    `Transaction_accountId_fkey` é `RESTRICT` (`confdeltype = 'r'`) — controle de
    regressão a nível de banco, independente da política de exclusão em `lib/`.
  - `describe("deleteBankItem - BankItem sem transações (Cenário 1)")` — exclusão
    bem-sucedida com cascade de `Account`s vazias.
  - `describe("deleteBankItem - BankItem com transações: recusa e preserva os dados
    (Cenário 2)")` — dois testes: um com uma única `Account` com `Transaction`, outro
    com **múltiplas** `Account`s do mesmo `BankItem` onde só uma tem `Transaction`
    (prova que nem a `Account` vazia é apagada — cascade tudo-ou-nada). Ambos
    consultam `BankItem`, `Account` e `Transaction` **depois** da tentativa recusada
    e afirmam que as três continuam existindo (não é só `rejects.toThrow()`).
  - Terceiro teste do mesmo describe: prova que o erro capturado é
    `instanceof BankItemHasTransactionsError`, com `.message` não-vazia que não
    contém nenhuma das `FORBIDDEN_SUBSTRINGS` (connection string, nome real da
    constraint `Transaction_accountId_fkey`, `violates foreign key constraint`,
    SQLSTATE `23503`, código Prisma `P2003`, `DriverAdapterError`, frames de stack
    trace) — confirmado empiricamente via script ad-hoc contra `gestor_test` que o
    erro cru do Prisma (`P2003`) inclui `Transaction_accountId_fkey` na própria
    `.message`, então a tradução tem que **substituir**, não só envolver, a mensagem.
  - `describe("deleteBankItem - borda")` — `BankItem` inexistente rejeita (sem
    prescrever qual erro exatamente; é edge case, não critério).
- `tests/unit/lib/db-fail-fast.test.ts` — unitário, sem tocar o Postgres real.
  Cobre os dois casos do critério 5 (`DATABASE_URL` ausente e string vazia) contra
  `lib/db.ts`, manipulando `process.env.DATABASE_URL` + `vi.resetModules()` (mesmo
  padrão de `tests/integration/db-singleton.integration.test.ts` da TASK-001).
  Deliberadamente **não prescreve timing** (import eager vs. uso lazy) — ver
  "Contrato" abaixo.
- `tests/unit/schema/on-delete-explicit.test.ts` — unitário, lê `prisma/schema.prisma`
  como texto (não Postgres) e prova que a linha do campo `Account.bankItem` contém
  `onDelete: Cascade` e a linha do campo `Transaction.account` contém
  `onDelete: Restrict`. Ver "Por que um teste de texto" no comentário do próprio
  arquivo: **confirmado empiricamente** (consulta direta a `pg_constraint`,
  ver script abaixo) que o Postgres já aplica `RESTRICT` por padrão do Prisma para
  relação obrigatória mesmo sem `onDelete` explícito — ou seja, o comportamento no
  banco **não muda** entre implícito e explícito para essa relação, então só um
  teste de texto do schema consegue provar a exigência literal do critério 1
  ("declara `onDelete` **explicitamente**"). O teste de `pg_constraint` acima
  (`bank-item-deletion.integration.test.ts`) permanece como controle de
  comportamento; este aqui é controle de "está escrito explicitamente".

### Contrato que os testes assumem (para o coder implementar exatamente assim)

- **Novo:** `lib/bank-item.ts` exporta:
  - `export class BankItemHasTransactionsError extends Error` — erro de domínio
    nomeado (critério 4). Mensagem própria e fixa (não deve interpolar
    `error.message`/`error.meta` do Prisma cru), útil ao usuário (ex.: algo como
    "Não é possível excluir este banco: existem transações importadas vinculadas a
    ele."), sem citar `Transaction_accountId_fkey`, código Prisma, SQLSTATE ou
    qualquer trecho de connection string.
  - `export async function deleteBankItem(bankItemId: string): Promise<void>` —
    chama `prisma.bankItem.delete(...)`; captura o erro de FK do Prisma (código
    `P2003`, confirmado via script ad-hoc nesta sessão — ver seção "Evidência
    empírica" abaixo) e relança como `BankItemHasTransactionsError`. Comportamento
    para outros erros inesperados (`P2025` no `BankItem` inexistente, por exemplo)
    é livre — só precisa rejeitar (testado no describe "borda"), não precisa virar
    `BankItemHasTransactionsError`.
- **Alterado (comportamento, não assinatura):** `lib/db.ts` — a exportação
  `export const prisma: PrismaClient` **continua existindo com o mesmo shape**
  (os testes de `db-singleton.integration.test.ts` da TASK-001 não mudam). O que
  muda é o comportamento quando `DATABASE_URL` está ausente ou vazia: hoje (RED
  confirmado nesta sessão) o adapter aceita `connectionString: undefined`
  silenciosamente e o `pg` tenta os defaults de libpq — o teste novo capturou isso
  na prática como `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a
  string` (uma tentativa real de conexão com credenciais erradas, não uma falha
  clara). O critério 5 exige que **tentar obter/usar o client** falhe imediatamente
  com uma mensagem que cite `DATABASE_URL`. **Não prescrevemos se a validação
  acontece no import do módulo (eager, como hoje) ou só no primeiro uso real do
  client (lazy — ex. Proxy/getter)** — ver aviso do critério 6 abaixo, que é
  justamente sobre essa escolha.

### ⚠️ Evidência empírica: critério 5 (fail-fast) vs. critério 6 (build) — aviso reforçado para o coder

Fiz um experimento reversível nesta sessão (editei `lib/db.ts` para lançar
incondicionalmente dentro de `createPrismaClient()`, rodei `npm run build` sem
`.env.local`/`DATABASE_URL`, e desfiz a edição — `git diff lib/db.ts` limpo depois).
Resultado: **o build quebrou de verdade**, na fase "Collecting page data":

```
Collecting page data using 6 workers ...
Error: QA-EXPERIMENT: lib/db.ts module was evaluated at this point
> Build error occurred
Error: Failed to collect page data for /api/health
```

Isso **prova** (não é só suposição) que o `next build` **executa** o módulo
`lib/db.ts` (via a fase de "collect page data"/trace de `app/api/health/route.ts`)
mesmo com a rota marcada `ƒ Dynamic` (confirmei também que `/api/health` já sai
como `ƒ Dynamic` no build atual, graças ao parâmetro `request: Request` mantido
pelo coder na TASK-001 — isso evita a pré-renderização estática, mas **não** evita
a fase de coleta de dados, que já executa o módulo hoje). Portanto: **um guard que
lança de forma síncrona no escopo top-level de `lib/db.ts` (ex.: dentro de
`createPrismaClient()`, chamado por `globalForPrisma.prisma ?? createPrismaClient()`
na exportação `const prisma = ...`) vai quebrar `npm run build` assim que
`DATABASE_URL` não estiver no ambiente de build.** O coder precisa de um desenho
onde a falha só ocorre no **uso real** do client (ex.: `prisma` como `Proxy` que só
valida/cria o client de verdade no primeiro acesso a uma propriedade, ou qualquer
outra forma de adiar a validação para fora do `require()`/`import()` do módulo) —
`tests/unit/lib/db-fail-fast.test.ts` foi desenhado para aceitar qualquer uma
dessas abordagens (ele importa o módulo E tenta uma query mínima, capturando o
erro em qualquer um dos dois pontos).

### Verificação do critério 6 (não é teste de Vitest — comando manual)

```bash
mv .env.local .env.local.bak 2>/dev/null   # .env.local não é commitado; garante que
                                             # DATABASE_URL não vaza de lá para o build
env -u DATABASE_URL npm run build
# depois, restaurar:
mv .env.local.bak .env.local 2>/dev/null
```

Rodei esse exato comando duas vezes nesta sessão: (1) contra o `lib/db.ts` atual
(sem fail-fast) → build passa, `/api/health` sai como `ƒ Dynamic`; (2) contra o
`lib/db.ts` com o guard incondicional do experimento acima → build falha. O coder
deve rodar (1) de novo depois de implementar o fail-fast real e confirmar que ainda
passa — essa é a prova de que o critério 6 não regrediu.

### Comandos para rodar

```bash
npm test                                    # suite inteira (30 testes: 21 da TASK-001 + 9 novos)
npm test -- tests/integration/bank-item-deletion.integration.test.ts
npm test -- tests/unit/lib/db-fail-fast.test.ts
npm test -- tests/unit/schema/on-delete-explicit.test.ts
npm run test:coverage                       # cobertura v8, threshold 80% em lib/**, app/api/**/route.ts
npx tsc --noEmit                            # confirma que as falhas são so TS2307 (modulo ausente)
```

### Estado RED confirmado nesta sessão

`npm test` → **3 arquivos de teste falhando, 8 testes falhando + 22 passando (30
total)**. Os 21 testes originais da TASK-001 continuam verdes, mais 1 teste novo já
verde de saída (o controle de `pg_constraint`/cascade — comportamento que já existia
antes desta task, ver nota de "teste não-RED" abaixo). As 8 falhas novas, todas pelo
motivo certo:

| Teste | Motivo da falha (RED) |
|---|---|
| 5 testes de `deleteBankItem`/`BankItemHasTransactionsError` em `bank-item-deletion.integration.test.ts` | `Cannot find package '@/lib/bank-item'` — `npx tsc --noEmit` confirma: só `TS2307` para esse caminho, nenhum erro de sintaxe |
| 2 testes de `db-fail-fast.test.ts` | Comportamento errado, não crash de config: hoje `lib/db.ts` tenta conectar de verdade com credenciais ausentes/vazias e falha com `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` (a landmine que a revisão da TASK-001 já tinha previsto), em vez de uma mensagem clara citando `DATABASE_URL` |
| `on-delete-explicit.test.ts` | `Transaction.account` ainda não tem `onDelete: Restrict` no schema (só `Account.bankItem` tem `onDelete: Cascade`, herdado da TASK-001) |

**Nota sobre um teste não-RED:** o teste de `pg_constraint` (política de onDelete no
Postgres) já passa hoje **sem** nenhuma mudança de schema, porque descobri (consulta
direta ao catálogo, documentada no comentário do próprio teste e em
`on-delete-explicit.test.ts`) que o Prisma já gera `ON DELETE RESTRICT` nativo por
padrão para relações obrigatórias — o comportamento no banco não muda entre
implícito e explícito. Mantive o teste porque é um controle de regressão de valor
real (trava o comportamento a nível de banco independente de como o schema está
escrito), só não é RED para o critério 1 — quem é RED para o critério 1 é
`on-delete-explicit.test.ts` (teste de texto do schema).

### Nenhum teste existente da TASK-001 foi alterado, tornado redundante ou conflitante

Todos os 21 testes de `tests/integration/schema.integration.test.ts`,
`db-singleton.integration.test.ts`, `tests/unit/lib/health.test.ts`,
`tests/unit/api/health-route.test.ts` e `tests/integration/api/health.integration.test.ts`
continuam exatamente como estavam, e continuam verdes (confirmado no `npm test`
acima). Em particular, `"deleta as Accounts em cascade ao deletar o BankItem"` (o
teste de cascade da TASK-001) continua verde porque o cenário dele usa `Account`s
**vazias** (sem `Transaction`) — exatamente o caso que o novo
`onDelete: Restrict` em `Transaction.account` não afeta. Não há redundância: os
testes de `deleteBankItem` desta task exercitam a função de domínio em `lib/`, não
o `prisma.bankItem.delete()` cru chamado diretamente como no teste de cascade da
TASK-001 — são duas camadas diferentes (Prisma direto vs. `lib/bank-item.ts`), e
ambas continuam necessárias.

### Mapeamento critério de aceite → teste

| Critério (seção 3) | Arquivo | Teste(s) |
|---|---|---|
| 1. `onDelete` explícito nas duas relações + migration nova | `tests/unit/schema/on-delete-explicit.test.ts` | `"declara onDelete explicitamente em Account.bankItem (Cascade) e em Transaction.account (Restrict)"` (texto do schema — comportamento no banco não distingue implícito/explícito, ver nota acima). Migration nova/separada da TASK-001: **não é testável via Vitest** — verificação manual: `ls prisma/migrations/` deve mostrar um diretório novo além de `20260721010539_init`, e `git diff` da migration da TASK-001 deve ficar vazio (não editada) |
| Controle de comportamento (não é o critério 1 em si, é regressão a nível de banco) | `tests/integration/bank-item-deletion.integration.test.ts` | `"Account->BankItem e ON DELETE CASCADE e Transaction->Account e ON DELETE RESTRICT no catalogo do Postgres"` |
| 2. Deletar `BankItem` **com** transações não apaga nada (Account e Transaction sobrevivem) | `tests/integration/bank-item-deletion.integration.test.ts` | `"recusa a exclusao quando a Account tem ao menos uma Transaction e NAO apaga nada"`, `"recusa a exclusao mesmo quando so UMA das varias Accounts do BankItem tem Transaction - nem a Account vazia e apagada"` |
| 3. Deletar `BankItem` **sem** transações funciona; cascade da TASK-001 permanece verde | `tests/integration/bank-item-deletion.integration.test.ts` | `"exclui o BankItem e suas Accounts em cascade quando nenhuma Account tem Transaction"`. Cascade da TASK-001: `tests/integration/schema.integration.test.ts` → `"deleta as Accounts em cascade ao deletar o BankItem"` (inalterado, confirmado verde) |
| 4. Erro de domínio nomeado, mensagem útil, sem vazar detalhe interno | `tests/integration/bank-item-deletion.integration.test.ts` | `"lanca um erro de dominio nomeado (BankItemHasTransactionsError), com mensagem util, sem vazar detalhe interno do Postgres/Prisma (Cenario 3 / Criterio 4)"` |
| 5. Fail-fast de `DATABASE_URL` ausente **e** string vazia | `tests/unit/lib/db-fail-fast.test.ts` | `"falha citando DATABASE_URL na mensagem quando a variavel esta AUSENTE"`, `"falha citando DATABASE_URL na mensagem quando a variavel e uma STRING VAZIA"` |
| 6. `npm run build` passa sem `DATABASE_URL` | Não é teste de Vitest — comando manual (ver seção "Verificação do critério 6" acima) | — |
| Edge case adicional (não numerado): `BankItem` inexistente | `tests/integration/bank-item-deletion.integration.test.ts` | `"rejeita ao tentar excluir um BankItem inexistente"` |
| 7. Suíte inteira verde + build + lint | Todos os arquivos acima + os 5 arquivos da TASK-001 | `npm test` (30/30 esperado após a implementação), `npm run build`, `npm run lint` |

Critérios de Pluggy (Item `LOGIN_ERROR`/`OUTDATED`, API fora do ar) mencionados no
prompt genérico do qa **não se aplicam** a esta task — seção 4 exclui
explicitamente "qualquer coisa de Pluggy".

## 6. Implementação (preenchido pelo coder)

### Estado da suíte ao final

`npm test`: **8 arquivos, 30/30 testes passando** (os 21 da TASK-001 + os 9 novos desta
task: 6 de `bank-item-deletion.integration.test.ts`, 2 de `db-fail-fast.test.ts`, 1 de
`on-delete-explicit.test.ts`). `npx tsc --noEmit` limpo. `npm run lint` limpo (0 erros, 0
warnings — removi um `coverage/` gerado por uma rodada anterior de `test:coverage` que estava
sendo lintado por acidente, não fazia parte do diff). `npm run build` passa **com** e **sem**
`DATABASE_URL` no ambiente (verificação manual abaixo). `npm run test:coverage`:
Statements 97.29%, Branches 93.75%, Functions 88.88%, Lines 97.29% — acima do threshold de
80% configurado em `vitest.config.ts` (única linha não coberta: `lib/db.ts:67`, o branch
`if (process.env.NODE_ENV !== "production")` para o ramo de produção, que nenhum teste
exercita nem precisa exercitar).

### Arquivos criados

- `lib/bank-item.ts` — `BankItemHasTransactionsError` (mensagem fixa, própria, sem
  interpolar nada do erro cru do Prisma) e `deleteBankItem(bankItemId)`, que chama
  `prisma.bankItem.delete(...)` e traduz `Prisma.PrismaClientKnownRequestError` com
  `code === "P2003"` na exceção de domínio; qualquer outro erro (ex.: `P2025` de
  `BankItem` inexistente) é relançado como veio.

### Arquivos alterados

- `prisma/schema.prisma` — `Transaction.account` ganhou `onDelete: Restrict` explícito
  (critério 1). `Account.bankItem` já tinha `onDelete: Cascade` desde a TASK-001, mantido.
  Comentário de cabeçalho atualizado explicando por que não há migration nova (ver decisão
  1 abaixo).
- `lib/db.ts` — reescrito para ser **lazy**: a exportação `prisma` agora é um `Proxy` que só
  cria o `PrismaClient` real (e só então valida `DATABASE_URL`) no primeiro acesso a uma
  propriedade/método. O cache em `globalThis` continua exatamente com a mesma finalidade da
  TASK-001 (mesma referência entre reimports/hot-reload); o que mudou é que o objeto cacheado
  é o `Proxy`, não mais o `PrismaClient` construído ansiosamente.
- `docs/tasks/TASK-002.md` — esta seção 6.

### Nenhuma migration nova foi gerada (não é omissão — confirmado pelo `prisma migrate dev`)

Rodei `npx dotenv -e .env.local -- npx prisma migrate dev --name explicit-on-delete-account-transaction`
depois de adicionar `onDelete: Restrict` ao schema. Saída: `"Already in sync, no schema change
or pending migration was found."` — nenhum diretório de migration foi criado em
`prisma/migrations/` (confirmado com `ls`, só existe `20260721010539_init`, da TASK-001,
intocada). Isso bate exatamente com o que o qa já tinha adiantado na seção 5: o Prisma já
compila uma relação obrigatória sem `onDelete` explícito para `ON DELETE RESTRICT` por padrão
(comportamento confirmado also via `pg_constraint.confdeltype = 'r'`), então adicionar o
`Restrict` explícito não muda o SQL gerado — só a legibilidade/intenção do schema. Segui a
instrução explícita do orquestrador: **não forcei** uma migration artificial (ex.: via
`--create-only` só para ter um arquivo) só para "parecer" que algo mudou no banco; o critério 1
é satisfeito pelo teste de texto (`on-delete-explicit.test.ts`) e pelo controle de
`pg_constraint` (que já passava antes desta task, como o qa também documentou).

### Decisões tomadas (e por quê)

1. **`lib/db.ts` como `Proxy` lazy, não guard eager.** O qa comprovou experimentalmente que
   `next build` executa `lib/db.ts` na fase "Collecting page data" mesmo sem requisição real.
   Um `throw` síncrono no escopo top-level (dentro de `createPrismaClient()`, chamado na
   atribuição de `export const prisma = ...`) quebraria `npm run build` sem `DATABASE_URL`.
   Design escolhido: `export const prisma` é um `Proxy<PrismaClient>` cujo `target` é um objeto
   vazio; o `get`/`has` trap chama `getRealClient()`, que só then constrói o `PrismaPg` adapter
   e o `PrismaClient` de verdade (e só então valida `DATABASE_URL` via `assertDatabaseUrl()`).
   Importar o módulo nunca lança; **usar** qualquer método/propriedade do client (inclusive em
   build-time, se algum código chegasse a fazer isso) lança imediatamente e cita
   `DATABASE_URL` na mensagem. Validei isso de duas formas: (a) os 2 testes de
   `db-fail-fast.test.ts` (ausente/string vazia); (b) rodando `npm run build` de fato sem
   `DATABASE_URL` no ambiente (ver seção "Verificação do critério 6" abaixo) — a rota de health
   nunca aciona o Proxy em build-time (ela é `ƒ Dynamic`, então o `next build` não a invoca de
   verdade), então o build passa mesmo sem nenhum banco disponível.
2. **`realClient` cacheado numa variável de módulo (`let`), não em `globalThis`.** Só o
   `Proxy` em si (o valor exportado como `prisma`) precisa estar em `globalThis` para satisfazer
   o teste de "mesma instância entre reimports" da TASK-001 — o `Proxy` cacheado carrega consigo
   a closure de `getRealClient`/`realClient` da sua avaliação de módulo original, então
   `vi.resetModules()` (que só limpa o *registro* de módulos, não `globalThis`) não perde esse
   estado quando o `Proxy` cacheado é reaproveitado. Testei mentalmente (e confirmei rodando a
   suíte) que isso funciona tanto para o caminho feliz (DATABASE_URL válida, testes de
   `db-singleton.integration.test.ts`) quanto para o fail-fast (`db-fail-fast.test.ts`, que
   depende de reavaliar `assertDatabaseUrl()` a cada acesso, já que `realClient` nunca chega a
   ser atribuído quando a validação falha).
3. **Tradução de erro por substituição total da mensagem, não `cause`.** Confirmei (o qa já
   tinha documentado isso na seção 5) que a mensagem crua do Prisma para `P2003` inclui o nome
   real da constraint (`Transaction_accountId_fkey`). `BankItemHasTransactionsError` tem uma
   mensagem fixa no construtor, sem nenhuma referência ao erro original (nem `{ cause: error }`,
   que colocaria `error.message` acessível via `.cause` e vazaria na primeira introspecção).
   O erro original é simplesmente descartado após a checagem de `code === "P2003"`.
4. **`error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003"`** em vez
   de checar só a mensagem ou um cast solto — é o jeito documentado pelo próprio Prisma de
   identificar erros de constraint de forma tipada, sem `any`.
5. **Outros erros (`P2025` de `BankItem` inexistente, etc.) são relançados como vieram** — a
   seção 5 deixou esse comportamento livre ("só precisa rejeitar, não precisa virar
   `BankItemHasTransactionsError`"), e o teste de borda só verifica `rejects.toThrow()` sem
   checar o tipo. Não criei um segundo erro de domínio para "BankItem não encontrado" porque
   nenhum critério/teste pede isso — ficaria fora de escopo (feature não solicitada).

### Verificação do critério 6 (rodada manual, não é teste de Vitest)

```
mv .env.local .env.local.bak
rm -rf .next
env -u DATABASE_URL npm run build
# ... build passou, exit code 0, /api/health saiu como ƒ Dynamic ...
mv .env.local.bak .env.local   # restaurado e conferido (diff vazio) depois
```

Rodei também o build normal (com `.env.local`/`DATABASE_URL` presente) antes e depois dessa
verificação, para confirmar que nada regrediu no caminho feliz.

### Dívidas assumidas / itens para o orquestrador

1. Nenhuma migration nova foi criada (ver seção dedicada acima) — não é uma dívida no sentido
   de trabalho pendente, é o resultado correto e esperado; documentando aqui só para o
   orquestrador não estranhar a ausência de um novo diretório em `prisma/migrations/`.
2. O `eslint-disable` em `app/api/health/route.ts` (DT-001) e a ausência de "desconectar banco"
   (DT-002, que esta própria task deixa mais evidente — agora ficou impossível excluir um
   `BankItem` com histórico pela aplicação) e o `onDelete` implícito de `RecurringBill`/
   `RecurringBillInstance` (DT-003) permanecem como estavam em `docs/DEBITO-TECNICO.md` — não
   toquei em nenhum dos três, conforme a seção 4 (fora de escopo) e o próprio arquivo de dívida
   técnica pedem.
3. Nenhum `any` foi usado; nenhum `console.log` foi usado.

## 7. Revisão (preenchido pelo code-reviewer)

**Veredito: APROVADO**

Revisado `git diff 8c42e76` + arquivos não rastreados. Li `docs/DEBITO-TECNICO.md` antes de
classificar qualquer achado como novo. Não confiei no relato da seção 6: verifiquei as
afirmações de maior risco empiricamente contra o Postgres e contra o client real.

### Os 4 pontos de julgamento levantados pelo orquestrador

**1. `lib/db.ts` como Proxy lazy — o risco principal não se concretizou.**

Sondei o Proxy contra o client real (script ad-hoc, `gestor_test`), não só pela suíte. A
semântica essencial está preservada: métodos (`$queryRaw`), delegates de model
(`prisma.bankItem`), `$transaction` na forma de **array** e na forma **interativa
(callback)**, `$disconnect` seguido de reconexão automática, e o operador `in` — todos
funcionam através do Proxy.

Sobre construção múltipla / vazamento de conexão, que era a pergunta central: simulei 4
reavaliações do módulo (cache-bust no specifier, equivalente ao `resetModules` do hot-reload)
mantendo o mesmo `globalThis`. Resultado: **a mesma referência exportada nas 4 vezes e
exatamente 1 conexão** em `pg_stat_activity` para `gestor_test`. A identidade cacheada em
`globalThis` está correta e não há caminho de dupla construção: `getRealClient()` é
sincrônico com guard `if (!realClient)`, e o `Proxy` cacheado carrega a closure da avaliação
original — o design da decisão 2 do coder se confirma na prática. Como `realClient` só é
atribuído em caso de **sucesso**, uma falha de validação nunca fica cacheada, o que é o que
faz o fail-fast continuar valendo em acessos subsequentes.

Achei limitações reais do Proxy, mas nenhuma bloqueante — ver não-bloqueante 1.

**2. Tradução do erro em `lib/bank-item.ts` — a troca é aceitável e a decisão está
empiricamente justificada.**

Confirmei que a substituição total é mesmo **necessária**, não preferência de estilo: o
`.message` cru do Prisma contém `Transaction_accountId_fkey`, e o `.meta` vai além, expondo
`originalMessage`, `originalCode: "23503"` e `constraint.index`. Encadear `{ cause: error }`
deixaria tudo isso acessível a qualquer serialização/introspecção do erro. Verifiquei o erro
traduzido: `message`, `stack` e `cause` não contêm nenhum dos marcadores proibidos, e
`cause` é `undefined`. Critério 4 atendido.

Sobre a robustez do `P2003`: **hoje a detecção captura só o caso pretendido**, e isso não é
suposição — mapeei as 5 FKs no catálogo e, dentro do caminho de exclusão de um `BankItem`
(cascade em `Account`), a única violação de FK alcançável é `Transaction_accountId_fkey`.
`P2025` (BankItem inexistente) é corretamente relançado cru e **não** vira erro de domínio,
como o contrato permite. A ressalva é prospectiva, não atual — ver não-bloqueante 2.

**3. Ausência de migration — afirmação verificada e correta; critério 1 satisfeito no
mérito.**

Não aceitei a afirmação: conferi no banco. `pg_constraint` mostra
`Transaction_accountId_fkey` = `r` (RESTRICT) e `Account_bankItemId_fkey` = `c` (CASCADE).
`prisma migrate status` → "Database schema is up to date!". E o teste autoritativo de drift,
`prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --script
--exit-code`, retorna **"-- This is an empty migration."** com exit code 0: o datamodel
explícito e o banco real são idênticos. Ou seja, o `onDelete: Restrict` explícito gera zero
SQL, e a migration da TASK-001 está intocada (`git diff` vazio nela).

Julgamento: a **intenção** do critério 1 (o banco impõe a política e o schema a declara
explicitamente) está atendida e provada em duas camadas. A sub-cláusula literal "migration
nova gerada e aplicada" é **insatisfazível** — não existe DDL a gerar. O coder acertou em
recusar fabricar uma migration vazia via `--create-only` só para produzir um artefato;
isso seria ruído no histórico e uma migration que não migra nada. Sugiro ao orquestrador
considerar essa sub-cláusula formalmente emendada, para não reaparecer como pendência.

**4. A política implementada corresponde à decisão do usuário.** Verificado por teste e por
sonda própria: com transações, a operação é recusada e **nada** é apagado — `BankItem`,
`Account` com transação, `Account` vazia do mesmo `BankItem` e a `Transaction` sobrevivem
todos. Não há exclusão parcial: o cascade e o restrict são avaliados no mesmo comando, então
a recusa é atômica por construção do Postgres. Sem transações, a exclusão funciona com
cascade. Histórico financeiro preservado, como decidido.

### Qualidade da suíte

Rodei `npm run test:coverage`: **30/30 verde, 97.29% stmts / 93.75% branches / 88.88% funcs /
97.29% lines**, acima do threshold de 80% da `.claude/rules/testing.md`. Nenhum teste da
TASK-001 foi alterado ou enfraquecido (`git diff 8c42e76` não toca `tests/`). Os testes novos
são fortes: o critério 2 assere sobrevivência explícita das 3 entidades, não só
`rejects.toThrow()`. O teste de texto do schema (`on-delete-explicit.test.ts`) é justificável
justamente porque o comportamento no banco não distingue implícito de explícito — é o único
jeito de provar a exigência literal do critério 1.

### Problemas bloqueantes

Nenhum.

### Problemas não-bloqueantes — **recomendo registrar como DT**

1. **[VIRAR DT] `lib/db.ts:60-69` — o Proxy implementa só `get` e `has`; escritas e
   introspecção não funcionam.** Verificado empiricamente:
   - **Monkey-patch é silenciosamente engolido.** Sem trap `set`, `prisma.$queryRaw = fn`
     grava no target vazio, mas o trap `get` ignora o target e sempre delega ao client real —
     chamei depois da escrita e o método real foi executado, não o substituto. Consequência
     prática: **`vi.spyOn(prisma, '$queryRaw')` não vai funcionar** e falhará de forma
     confusa (o spy nunca é lido). Nada quebra hoje porque os testes mockam o módulo
     `@/lib/db` inteiro, mas é uma armadilha para a primeira task que tentar espionar/stubar
     o client.
   - **Introspecção vazia:** `Object.keys(prisma).length === 0` e `{...prisma}` → `{}`
     (faltam `ownKeys`/`getOwnPropertyDescriptor`). Quebra qualquer código/lib que enumere o
     client.
   - **Identidade de método instável:** `prisma.$queryRaw !== prisma.$queryRaw`, porque
     `value.bind(client)` cria uma função nova a cada acesso. Quebra comparação por
     referência e memoização com `WeakMap` chaveada no método. Correção barata, se algum dia
     incomodar: memoizar as funções já ligadas num `Map` por `prop`.
   - Impacto hoje: nenhum, e os delegates de model mantêm identidade estável. É dívida
     latente de testabilidade/extensibilidade, não defeito funcional.

2. **[VIRAR DT] `lib/bank-item.ts:44-49` — a detecção de `P2003` é precisa hoje por topologia
   do schema, não por construção.** Qualquer FK futura com `Restrict` apontando para
   `Account` ou `BankItem` (ex.: extrato, orçamento, conciliação) passaria a disparar `P2003`
   nessa mesma operação e seria traduzida na mensagem errada — "existem transações importadas
   vinculadas" — para um caso que não é esse. O nome da constraint está disponível em
   `error.meta.driverAdapterError.cause.constraint.index` e permitiria estreitar a checagem
   para `Transaction_accountId_fkey`. Não bloqueia porque hoje a tradução é comprovadamente
   correta; vale reavaliar quando um novo model referenciar `Account`.

3. **[VIRAR DT, baixa prioridade] Perda de diagnóstico ao descartar o erro original.** A
   decisão de substituir em vez de encadear está correta (comprovei que `cause` vazaria o
   nome da constraint e o `originalMessage`), mas hoje o erro real do Prisma é descartado
   sem **nenhum** registro server-side — se a tradução um dia mascarar um `P2003` de outra
   origem (não-bloqueante 2), não haverá rastro para diagnosticar. Quando o projeto tiver
   logger (ainda não tem, e `console.log` é proibido pelas regras), logar o erro original no
   servidor antes de lançar o erro de domínio resolve os dois pontos de uma vez.

### Observações menores (não precisam virar DT)

- **Imprecisão na seção 6:** o relato diz que a única linha não coberta (`lib/db.ts:67`) é o
  branch `if (process.env.NODE_ENV !== "production")`. Não é — a linha 67 é o corpo do trap
  `has`, que **nenhum teste exercita**. O branch de `NODE_ENV` fica na linha 79. Sem impacto
  na aprovação (cobertura global folgada acima do threshold), mas registro porque o trap
  `has` é código não testado e, se `DATABASE_URL` faltar, `'x' in prisma` lança.
- O teste de vazamento inspeciona só `.message`. Verifiquei por fora que `.stack` e `.cause`
  também estão limpos, então não há exposição; um `expect(err.cause).toBeUndefined()` seria
  blindagem de regressão barata contra alguém reintroduzir `{ cause }` no futuro.

### Segurança e escopo

Sem achados. Nenhuma credencial hardcoded; nenhum `console.log` ou `any` no código de
produção; nenhum `NEXT_PUBLIC_`; nada de Pluggy. O fail-fast de `DATABASE_URL` fecha
exatamente a landmine que a revisão da TASK-001 apontou. Validação Zod não se aplica: esta
task não expõe rota nem recebe input externo (`deleteBankItem` recebe um id interno). Seção 4
respeitada: `RecurringBill`/`RecurringBillInstance` (DT-003), endpoint/UI, soft delete
(DT-002) e o `eslint-disable` (DT-001) não foram tocados. `coverage/` está corretamente
ignorado pelo git.
