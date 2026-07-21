# TASK-001 — Fundação de dados: Prisma + Postgres + schema + healthcheck
Status: CONCLUÍDA | Fase do roadmap: 0

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- **Este NÃO é o Next.js que você conhece.** O projeto usa **Next 16.2.10** com React 19.
  APIs, convenções e estrutura de arquivos podem divergir do seu treinamento. Consulte
  `node_modules/next/dist/docs/01-app/` (Route Handlers, configuração) **antes** de criar a
  API route. Respeite avisos de deprecação.
- Estado atual do repo: scaffold puro do `create-next-app`. Existem apenas `app/page.tsx`,
  `app/layout.tsx`, `app/globals.css`. **Não** existe Prisma, test runner, `lib/`, nem
  `pluggy-sdk`.
- Banco: **Postgres 16 via Docker Compose local** (decisão do usuário nesta sessão —
  substitui o SQLite do rascunho original da premissa). Docker 29.3.0 disponível e daemon ativo.
- Regras do projeto que valem aqui: lógica de negócio em `lib/`, API routes são cascas finas,
  formato `ApiResponse<T>` de `.claude/rules/typescript-patterns.md`, sem `console.log`,
  sem `any` sem justificativa, credenciais só em `.env.local`.

## 1. Objetivo

Entregar a camada de dados do projeto: Postgres em Docker, schema Prisma com os 5 models da
seção 5 da premissa, client singleton em `lib/`, aparato de testes (Vitest) contra um database
de teste separado, e um endpoint `/api/health` que prova a conexão ponta a ponta.

## 2. Comportamento esperado (TDD)

- DADO o docker compose de pé QUANDO rodo as migrations ENTÃO as 5 tabelas
  (`BankItem`, `Account`, `Transaction`, `RecurringBill`, `RecurringBillInstance`) existem no Postgres
- DADO o schema aplicado QUANDO crio duas Transactions com o mesmo `pluggyTransactionId`
  ENTÃO o banco rejeita a segunda com erro de constraint única
- DADO uma Transaction com `source = MANUAL` QUANDO a crio sem `pluggyTransactionId`
  ENTÃO ela é aceita — e uma segunda também, porque `NULL` não colide no índice único
- DADO um `amount` de `-1234.56` QUANDO gravo e leio de volta ENTÃO recebo exatamente
  `-1234.56`, sem erro de arredondamento de ponto flutuante
- DADO um `BankItem` com `Account`s associadas QUANDO deleto o `BankItem`
  ENTÃO as `Account`s são removidas junto (cascade)
- DADO a aplicação rodando QUANDO chamo `GET /api/health`
  ENTÃO recebo `200` com `{ success: true, data: { database: "ok" } }`
- DADO o banco inacessível QUANDO chamo `GET /api/health`
  ENTÃO recebo `503` com `success: false` e uma mensagem que **não** vaza a connection string,
  credenciais nem stack trace

## 3. Critérios de aceite

- [ ] 1. `docker compose up -d` sobe um Postgres 16 e `npx prisma migrate dev` aplica sem erro
- [ ] 2. `prisma/schema.prisma` contém os 5 models da seção 5 da PREMISSA, com `@relation`
      explícitas (o rascunho tem FKs soltas: `bankItemId`, `accountId`, `recurringBillId`,
      `transactionId`) e índices em `Transaction.date` e `Transaction.accountId`
- [ ] 3. `pluggyTransactionId` é `@unique` e nullable; teste de integração prova a rejeição do
      duplicado **e** a aceitação de múltiplos `NULL`
- [ ] 4. Prisma Client exportado como singleton em `lib/db.ts`, sem esgotar o pool no hot-reload do dev
- [ ] 5. Vitest configurado; `npm test` roda contra um database de teste separado (ex.
      `gestor_test`), com estado limpo entre os testes
- [ ] 6. `GET /api/health` responde 200/503 no formato `ApiResponse<T>`; a route é casca fina e
      a verificação de conectividade vive em `lib/`
- [ ] 7. `.env.example` commitado com `DATABASE_URL`, `CLIENT_ID` e `CLIENT_SECRET` **vazios**;
      `.gitignore` recebe `!.env.example` (hoje o padrão `.env*` bloqueia até o exemplo);
      nenhuma credencial real entra no repositório
- [ ] 8. `pluggy-sdk` e `react-pluggy-connect` instalados (sem uso nesta task); `zod` promovido a
      dependência explícita no `package.json`
- [ ] 9. `npm run build` e `npm run lint` passam limpos

## 4. Fora de escopo

- Qualquer chamada real à API da Pluggy; `/api/connect-token`; widget PluggyConnect
- Qualquer UI ou tela (a `app/page.tsx` do scaffold permanece como está)
- Seeds, fixtures de dados de negócio, CRUD de transações
- Autenticação
- Deploy e Postgres de produção
- Playwright / testes E2E (entram numa fase posterior, conforme `.claude/rules/typescript-testing.md`)

## 5. Testes (preenchido pelo qa)

### Infraestrutura de teste criada (não é código de produção)

- `docker-compose.yml` — Postgres 16, expõe `localhost:5432`, cria o database `gestor`
  (`POSTGRES_DB`) e roda `docker/init-db/01-create-test-database.sql` na primeira
  inicialização do volume, que cria também `gestor_test`.
- `docker/init-db/01-create-test-database.sql` — `CREATE DATABASE gestor_test;`.
- `.env.test` — `DATABASE_URL` apontando para `gestor_test` (mesmas credenciais locais do
  compose, não são segredos reais — por isso commitado). `.gitignore` recebeu `!.env.test`
  para permitir isso apesar do padrão `.env*`.
- `vitest.config.ts` — runner Node, alias `@` → raiz do projeto (mesmo `@/*` do
  `tsconfig.json`), `setupFiles`, `globalSetup`, `fileParallelism: false` (testes de
  integração compartilham o mesmo Postgres e o `beforeEach/afterEach` faz `TRUNCATE` —
  rodar em série evita corrida entre arquivos), cobertura v8 com threshold 80% em
  `lib/**` e `app/api/**/route.ts`.
- `tests/setup/vitest.setup.ts` — carrega `.env.test` (fallback; o script `npm test` já
  injeta via `dotenv-cli`) e falha cedo se `DATABASE_URL` não estiver definida.
- `tests/setup/global-setup.ts` — roda uma vez antes de toda a suíte; se
  `prisma/schema.prisma` ou `prisma.config.ts` ainda não existirem (RED atual), **não**
  aborta a run — só avisa e deixa os testes falharem individualmente pelo motivo certo.
  Quando existirem, roda `npx prisma migrate deploy` contra `DATABASE_URL` do `.env.test`.
- `tests/setup/reset-db.ts` — `resetDatabase(prisma)`: `TRUNCATE` das 5 tabelas
  (`RESTART IDENTITY CASCADE`) — usado em `beforeEach`/`afterEach` dos testes de
  integração para estado limpo entre testes (critério 5). Tipado estruturalmente
  (`{ $executeRawUnsafe }`), não importa `@prisma/client` diretamente.
- `tests/fixtures/db.ts` — factories `buildBankItem/buildAccount/buildTransaction/
  buildRecurringBill/buildRecurringBillInstance` com os campos exatos da seção 5 da
  PREMISSA, aceitando overrides parciais para os cenários de borda.
- `package.json` — scripts `test`, `test:watch`, `test:coverage` (todos via
  `dotenv -e .env.test -- vitest ...`), `test:migrate` (`prisma migrate deploy` contra
  o banco de teste), `db:up`/`db:down` (docker compose). Devdependencies adicionadas:
  `vitest`, `@vitest/coverage-v8`, `dotenv`, `dotenv-cli`, `prisma`; dependency
  `@prisma/client` (necessários para os testes rodarem; `pluggy-sdk`,
  `react-pluggy-connect` e a promoção de `zod` ficam para o coder, critério 8).

### Contrato que os testes assumem (para o coder implementar exatamente assim)

- `lib/db.ts` exporta `export const prisma: PrismaClient` como singleton cacheado em
  `globalThis` (padrão Next.js oficial) — os testes de hot-reload usam
  `vi.resetModules()` + reimport e esperam a **mesma referência**.
- `lib/health.ts` exporta `export async function checkDatabaseConnection(): Promise<boolean>`.
  Deve envolver a query de verificação (`prisma.$queryRaw` — os testes mockam esse método
  específico) em try/catch e **nunca** relançar o erro: qualquer falha vira `false`. Essa é
  a garantia estrutural de que a rota nunca vê a connection string/credenciais reais.
- `app/api/health/route.ts` exporta `GET`, chama `checkDatabaseConnection()` de
  `lib/health.ts` (mockado nos testes unitários da rota) e devolve `ApiResponse<{ database:
  "ok" }>` — 200 quando `true`, 503 com `success:false` e uma `error` string genérica
  quando `false` **ou** quando `checkDatabaseConnection` rejeitar inesperadamente (a rota
  deve ter seu próprio try/catch também).
- Nomes de tabela default do Prisma (sem `@@map`): `BankItem`, `Account`, `Transaction`,
  `RecurringBill`, `RecurringBillInstance` — os testes de schema consultam
  `information_schema`/`pg_indexes` por esses nomes exatos.

### Comandos para rodar

```bash
docker compose up -d          # sobe o Postgres 16 (já feito nesta sessão; dados persistem em volume)
npm test                      # roda a suíte inteira contra gestor_test (RED agora)
npm test -- tests/unit        # só os unitários (mais rápidos, sem precisar do schema aplicado)
npm run test:coverage         # com relatório de cobertura v8
npm run test:migrate          # aplica `prisma migrate deploy` manualmente contra gestor_test
                               # (o coder normalmente não precisa rodar isso à mão —
                               # tests/setup/global-setup.ts já faz isso a cada `npm test`)
```

Estado RED confirmado nesta sessão: `npm test` → **5 arquivos de teste, 11 falhas
reportadas + 1 suíte com erro de import** (schema.integration.test.ts falha ao importar
antes mesmo de contar os `it`s), todas por `Cannot find package '@/lib/db'` /
`'@/lib/health'` / `'@/app/api/health/route'` — nenhuma falha de sintaxe ou de
configuração do runner. `npx tsc --noEmit` confirma: os únicos erros são `TS2307 Cannot
find module` para esses três caminhos ainda não implementados.

### Correção pós-implementação (qa, após o coder reportar 20/21)

O coder implementou o schema corretamente (índices `@@index([date])` e
`@@index([accountId])` existem em `Transaction`, confirmados via `pg_indexes`) e reportou
o teste `"cria indices em Transaction.date e Transaction.accountId"` como falho — investigou
e concluiu, corretamente, que a asserção original é que estava errada, não o schema (ver
seção 6, "Dívidas assumidas", item 1). A asserção original casava substring `'"date"'`
(com aspas) contra `pg_indexes.indexdef`; como o Postgres só cita identificadores que
exigem aspas (`accountId`, por causa da maiúscula) e não cita os que não exigem (`date`,
minúsculo), a asserção do `date` era insatisfazível contra **qualquer** schema correto —
o `accountId` só passava por coincidência da regra de quoting, não por design.

Fix aplicado em `tests/integration/schema.integration.test.ts` ("cria indices em
Transaction.date e Transaction.accountId"): a consulta trocou de
`pg_indexes.indexdef` (parsing de texto) para `pg_index`/`pg_attribute`/`pg_class`
(catálogo estrutural), resolvendo os nomes de coluna indexada via
`a.attnum = ANY(i.indkey)` — robusto a quoting em qualquer direção, sem depender de como o
Postgres decide formatar o DDL reconstruído.

Verificação de que o teste corrigido ainda detecta ausência de índice (controle negativo,
só no banco `gestor_test`, sem tocar `prisma/schema.prisma`): `DROP INDEX
"Transaction_accountId_idx"` → teste falha com `expected [...] to include 'accountId'`;
restaurado o índice, `DROP INDEX "Transaction_date_idx"` → teste falha com `expected [...]
to include 'date'`; ambos os índices recriados manualmente com a definição exata reportada
pelo coder (`CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId")` /
`CREATE INDEX "Transaction_date_idx" ON "Transaction"(date)`), sem rodar `prisma migrate
reset` (bloqueado propositalmente pela CLI do Prisma para agentes de IA sem consentimento
explícito do usuário — evitado em favor de recriar só o que foi dropado).

Estado final confirmado: `npm test` → **5 arquivos de teste, 21 passed (21)**, contra o
schema já implementado pelo coder, sem nenhuma alteração em `prisma/schema.prisma`,
`lib/` ou `app/`.

### Mapeamento critério de aceite → teste

| Critério / Cenário (seção 2/3) | Arquivo de teste | Teste(s) |
|---|---|---|
| 1. `docker compose up -d` sobe Postgres 16; `prisma migrate dev`/`deploy` aplica sem erro | `docker-compose.yml` (infra, verificado manualmente: `gestor` e `gestor_test` existem, `pg_isready` healthy) + `tests/setup/global-setup.ts` (roda `migrate deploy` a cada `npm test`) | Validado indiretamente por **todos** os testes de `tests/integration/*` — eles só passam se as migrations tiverem sido aplicadas |
| 2. 5 models com `@relation` explícitas + índices em `Transaction.date`/`Transaction.accountId` | `tests/integration/schema.integration.test.ts` | `"cria as 5 tabelas esperadas..."`, `"cria indices em Transaction.date e Transaction.accountId"`, `"relaciona os 5 models entre si via @relation explicitas"` |
| 3. `pluggyTransactionId` único e nullable; rejeita duplicado; aceita múltiplos `NULL` | `tests/integration/schema.integration.test.ts` | `"rejeita uma segunda Transaction com o mesmo pluggyTransactionId"`, `"aceita duas Transactions MANUAL sem pluggyTransactionId (NULL nao colide no indice unico)"` |
| Cenário: amount `-1234.56` sem erro de arredondamento | `tests/integration/schema.integration.test.ts` | `"grava e le -1234.56 sem erro de arredondamento de ponto flutuante"` (edge: `"aceita amount 0.00 (limite entre entrada e saida)"`) |
| Cenário: cascade delete `BankItem` → `Account` | `tests/integration/schema.integration.test.ts` | `"deleta as Accounts em cascade ao deletar o BankItem"` |
| Edge cases adicionais (FK inválida, data inválida) | `tests/integration/schema.integration.test.ts` | `"rejeita Transaction com accountId inexistente (integridade referencial)"`, `"rejeita Transaction com uma data invalida"` |
| 4. `lib/db.ts` singleton, sem esgotar pool no hot-reload | `tests/integration/db-singleton.integration.test.ts` | `"exporta um client com a API padrao do Prisma..."`, `"mantem a mesma instancia entre reimportacoes (nao esgota o pool no hot-reload)"`, `"continua retornando a mesma instancia apos multiplos reloads consecutivos"` |
| 5. Vitest configurado; `npm test` roda contra `gestor_test`; estado limpo entre testes | `vitest.config.ts`, `tests/setup/*` (infra) | Validado por todos os testes de `tests/integration/*` (usam `resetDatabase` em `beforeEach`/`afterEach`); `npm test` já aponta para `gestor_test` via `.env.test` |
| 6. `GET /api/health` 200/503 em `ApiResponse<T>`; rota é casca fina, verificação vive em `lib/` | `tests/unit/lib/health.test.ts`, `tests/unit/api/health-route.test.ts`, `tests/integration/api/health.integration.test.ts` | lib: `"resolve true quando a query de verificacao (SELECT 1) e bem-sucedida"`; rota: `"responde 200 com ApiResponse<{ database: 'ok' }> quando o banco esta ok"`, `"responde 503 com success:false quando o banco esta inacessivel"`; integração real: `"responde 200 com { success: true, data: { database: 'ok' } } com o banco de teste no ar"` |
| Cenário: banco inacessível → 503, sem vazar connection string/credenciais/stack trace | `tests/unit/lib/health.test.ts`, `tests/unit/api/health-route.test.ts` | lib: `"resolve false (sem lancar) quando a query falha com um erro contendo credenciais"`, `"...erro sem mensagem (ex.: timeout)"`; rota: `"a resposta de erro 503 nunca vaza connection string, credenciais ou stack trace"`, `"responde 503 sem vazar detalhes mesmo se checkDatabaseConnection lancar uma excecao inesperada"` |
| 7. `.env.example` + `.gitignore` (`!.env.example`), sem credenciais reais | Fora do escopo de teste automatizado (verificação de arquivo) — **não coberto por teste**; é o próprio coder que cria `.env.example`. QA já resolveu o análogo `.env.test`/`!.env.test` para a suíte funcionar | — |
| 8. `pluggy-sdk`, `react-pluggy-connect` instalados; `zod` promovido a dependency | Fora do escopo desta task de dados (TASK-001 exclui uso de Pluggy — seção 4); nenhum teste desta rodada exercita esses pacotes | — |
| 9. `npm run build` e `npm run lint` passam limpos | Não é testável via Vitest; validado manualmente pelo coder/reviewer ao final. `npm run lint` já roda limpo hoje mesmo com os arquivos de teste novos (verificado nesta sessão) | — |

Critérios 7, 8 e 9 não geram teste automatizado porque são, respectivamente, verificação
de arquivo estático, instalação de pacote sem uso nesta task, e comandos de build/lint que
o coder deve rodar e confirmar manualmente (não há comportamento de runtime para
exercitar). Isso foi decidido conscientemente, não é uma lacuna esquecida.

## 6. Implementação (preenchido pelo coder)

### Estado da suíte ao final

`npm test`: **4 arquivos passam, 1 arquivo com 1 falha** (`20 passed / 1 failed`, de 21 testes
totais). A única falha é `tests/integration/schema.integration.test.ts > "cria indices em
Transaction.date e Transaction.accountId"` — analisada em detalhe na seção "Dívidas assumidas"
abaixo; concluí que é um teste incorreto e não o "hackeei" para passar (ver justificativa).
`npm run build` e `npm run lint` passam 100% limpos (0 erros, 0 warnings). `npx tsc --noEmit`
limpo.

### Arquivos criados

- `prisma.config.ts` — config do Prisma 7 (`schema`, `migrations.path`, `datasource.url` via
  `process.env.DATABASE_URL`), obrigatório desde o Prisma 7 para `migrate`/`generate`.
- `prisma/schema.prisma` — os 5 models da seção 5 da PREMISSA com `@relation` explícitas para
  as 5 FKs antes soltas (`Account.bankItemId`, `Transaction.accountId`,
  `Transaction.recurringBillId`, `RecurringBillInstance.recurringBillId`,
  `RecurringBillInstance.transactionId`), `@@index([date])` e `@@index([accountId])` em
  `Transaction`, `onDelete: Cascade` em `Account.bankItem` (único cascade exigido pelos
  testes/critérios).
- `prisma/migrations/20260721010539_init/migration.sql` + `migration_lock.toml` — gerados por
  `prisma migrate dev --name init` contra o Postgres de desenvolvimento (`gestor`).
- `lib/db.ts` — singleton do `PrismaClient` cacheado em `globalThis` (padrão Next.js oficial),
  usando `@prisma/adapter-pg` (`PrismaPg`) como driver adapter.
- `lib/health.ts` — `checkDatabaseConnection()`, `SELECT 1` via `prisma.$queryRaw` dentro de
  try/catch que nunca relança.
- `lib/api-response.ts` — tipo `ApiResponse<T>` (`.claude/rules/typescript-patterns.md`), usado
  pela rota de health e reutilizável pelas próximas tasks.
- `app/api/health/route.ts` — `GET` casca fina: chama `checkDatabaseConnection()` dentro de seu
  próprio try/catch, devolve `ApiResponse<{ database: "ok" }>` 200/503.
- `.env.example` — `DATABASE_URL` (placeholder local), `CLIENT_ID`/`CLIENT_SECRET` vazios.
- `.env.local` — **não versionado** (bloqueado por `.env*` no `.gitignore`, sem exceção
  criada), usado só localmente para apontar `prisma migrate dev`/`next dev`/`next build` para
  o Postgres de desenvolvimento (`gestor`).

### Arquivos alterados

- `.gitignore` — adicionado `!.env.example` (mesmo padrão já usado para `!.env.test`).
- `package.json` — dependencies: `@prisma/adapter-pg`, `pg`, `pluggy-sdk`,
  `react-pluggy-connect`, `zod` (promovido de transitivo a explícito, critério 8).
  devDependencies: `@types/pg`. Nenhum script alterado (os do qa já serviam).
- `package-lock.json` — atualizado pelo `npm install`.

### Decisões tomadas (e por quê)

1. **Prisma 7 é uma major breaking change real, não só o `prisma.config.ts`.** Descobri (via
   `npx prisma init`/`validate` num scratch dir e leitura do `node_modules/.prisma/client/index.d.ts`
   gerado) que o Prisma 7 **removeu `datasource.url` de `schema.prisma`**: agora o `url` só é
   aceito em `prisma.config.ts` (para Migrate/Introspect) e o `PrismaClient` em runtime **exige
   um driver adapter explícito** (`adapter` no construtor) — não lê mais `DATABASE_URL`
   implicitamente. Por isso instalei `@prisma/adapter-pg` + `pg` (+ `@types/pg` de dev), que não
   estavam nas dependências deixadas pelo qa, e `lib/db.ts` instancia `new PrismaPg({
   connectionString: process.env.DATABASE_URL })` e passa como `adapter` para `new
   PrismaClient({ adapter })`.
2. **Generator `provider = "prisma-client-js"` (clássico) em vez do novo default
   `"prisma-client"`.** Testei ambos: o novo default gera o client num diretório custom
   (`generated/prisma` por padrão) que exigiria importar de um caminho de arquivo em vez de
   `@prisma/client` — mas o qa já declarou `@prisma/client` como dependency de runtime
   (pensando no padrão clássico de import). `"prisma-client-js"` gera em
   `node_modules/.prisma/client`, que é exatamente o que o pacote `@prisma/client` (`default.js`
   → `require('.prisma/client/default')`) espera, então `import { PrismaClient } from
   "@prisma/client"` funciona sem mudar nenhum caminho de import nos testes. Não apareceu
   nenhum aviso de depreciação ao gerar com esse provider nesta versão (7.9.0) — se aparecer
   futuramente, é candidato a migração para o novo `"prisma-client"` + ajuste de imports.
3. **`onDelete: Cascade` só em `Account.bankItem`.** É o único cascade exercitado por teste/
   critério de aceite. As demais relações (`Transaction.account`, `Transaction.recurringBill`,
   `RecurringBillInstance.recurringBill`, `RecurringBillInstance.transaction`) ficaram no
   comportamento default do Prisma (RESTRICT para FK obrigatória, SET NULL para FK opcional) —
   não há teste/critério pedindo outro comportamento; ficam sujeitas a revisão numa task futura
   que defina a política de exclusão de transações/contas.
4. **`Decimal @db.Decimal(14, 2)` explícito** em `Transaction.amount`, `RecurringBill.amount` e
   `RecurringBillInstance.paidAmount`. Os testes só verificam `.toFixed(2)`, então o Postgres
   `numeric` sem precisão declarada (default do Prisma) também passaria — escolhi precisão
   explícita por ser uma prática melhor para valores monetários (evita `numeric` ilimitado) e
   por já ser uma decisão de schema que uma task futura teria que tomar de qualquer forma.
5. **`RecurringBillInstance` ↔ `Transaction` como relação um-para-um bidirecional explícita**
   (`Transaction.billInstance RecurringBillInstance?` como lado oposto de
   `RecurringBillInstance.transactionId @unique`) — exigido pelo Prisma quando ambos os lados de
   uma relação precisam ser declarados; sem campo nomeado no lado sem FK, o `prisma validate`
   falha.
6. **`GET(request: Request)` mantém o parâmetro, mesmo sem uso.** Os testes chamam
   `GET(new Request(...))`; uma assinatura `GET()` sem parâmetros causa erro de TypeScript
   (`TS2554: Expected 0 arguments, but got 1`) no `tsc --noEmit`/`next build`. Adicionei o
   parâmetro (consistente com a assinatura documentada em
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`) e supressei
   o warning correspondente do ESLint (`@typescript-eslint/no-unused-vars`) com um
   `eslint-disable-next-line` comentado, para manter `npm run lint` 100% limpo sem tocar nos
   testes.
7. **`.env.local` criado, mas não commitado** (deliberado — `.env*` já bloqueia por padrão e eu
   não adicionei exceção), só para viabilizar `prisma migrate dev`, `next dev` e `next build`
   localmente contra o Postgres `gestor`. Cada dev/CI deve copiar `.env.example` para
   `.env.local` e preencher.
8. `pluggy-sdk`/`react-pluggy-connect` instalados nas versões publicadas mais recentes
   (`^0.89.0`/`^2.12.0`) sem nenhum uso de código (fora de escopo por definição na seção 4).

### Dívidas assumidas / itens para o orquestrador decidir

1. **Teste com falha genuína, não corrigida (não gamed):**
   `tests/integration/schema.integration.test.ts` → `"cria indices em Transaction.date e
   Transaction.accountId"` falha na asserção `indexDefs.some(def => def.includes('"date"'))`.
   Investiguei a fundo: o índice **existe de fato**
   (`CREATE INDEX "Transaction_date_idx" ON "Transaction" USING btree (date)`, confirmado via
   `psql`/`pg_indexes` e presente em `prisma/migrations/.../migration.sql`), mas o Postgres só
   inclui aspas duplas na reconstrução de `indexdef` (via `pg_get_indexdef()`) quando o
   identificador **exige** aspas (maiúsculas/minúsculas mistas, palavra reservada, caracteres
   especiais) — comprovei isso diretamente: `SELECT quote_ident('date')` retorna `date` (sem
   aspas) enquanto `SELECT quote_ident('accountId')` retorna `"accountId"` (com aspas), e criei
   manualmente um índice com `CREATE INDEX ... USING btree ("date")` (aspeado na DDL) para
   confirmar que o `indexdef` reconstruído *ainda assim* mostra `date` sem aspas — a
   reconstrução ignora como o índice foi originalmente escrito. Ou seja: **nenhum schema Postgres
   legítimo com uma coluna chamada `date` (tudo minúsculo, não é palavra reservada) vai produzir
   `"date"` entre aspas em `pg_indexes.indexdef`**. A única forma de fazer essa asserção passar
   seria renomear a coluna física via `@map` (ex.: para `"Date"` ou outro nome que force aspas)
   só para enganar essa checagem de string — decidi **não fazer isso**, pois não é uma decisão de
   schema genuína, é gaming do teste, o que a task proíbe explicitamente. Registrando para o
   orquestrador/QA ajustar a asserção (ex.: usar regex `/\bdate\b/` sem exigir aspas, ou
   consultar `pg_index`/`information_schema.statistics` em vez de fazer parsing de string do
   `indexdef`).
2. `npm run test:coverage` não imprime a tabela de cobertura enquanto houver teste falhando
   (comportamento do Vitest 4 com `@vitest/coverage-v8` observado nesta sessão) — não consegui
   validar o threshold de 80% de `lib/**`/`app/api/**/route.ts` por causa do item 1. Assim que o
   teste acima for resolvido, rodar `npm run test:coverage` de novo para confirmar.
3. `onDelete`/`referential actions` das relações não cobertas por teste (item 3 das decisões
   acima) ficaram no default do Prisma — não é dívida bloqueante desta task, mas deve ser
   revisitado quando alguma task futura definir a regra de negócio (ex.: pode excluir uma
   `Account` com `Transaction`s vinculadas? Pode excluir um `RecurringBill` com `Transaction`s
   vinculadas?).
4. Nenhum `any` foi usado; nenhum `console.log` foi usado.

## 7. Revisão (preenchido pelo code-reviewer)

**Veredito: APROVADO**

Revisado o diff completo (`git status` + arquivos não rastreados) contra os 9 critérios da
seção 3. Verificações feitas por mim, não pelo relato do coder: schema conferido linha a
linha contra a seção 5 da PREMISSA, `migration.sql` conferido contra o schema,
`npm run test:coverage` executado, e o comportamento de cascade validado direto no Postgres.

### Critérios de aceite

Os 9 critérios estão atendidos. Destaques do que verifiquei além do relato:

- **Critério 2** — os 5 models batem campo a campo com a seção 5 da PREMISSA (nomes, tipos,
  nullability e `@unique`), com as 5 FKs antes soltas agora com `@relation` explícita. O
  `migration.sql` gerado reflete o schema fielmente, incluindo `Transaction_date_idx` e
  `Transaction_accountId_idx`.
- **Critério 3 (dedup — regra sagrada)** — íntegra. `pluggyTransactionId String? @unique` gera
  `CREATE UNIQUE INDEX "Transaction_pluggyTransactionId_key"`, que no Postgres rejeita
  duplicados e permite múltiplos `NULL`. Os dois testes cobrem exatamente os dois lados
  (`P2002` no duplicado, dois `MANUAL` com `NULL` coexistindo). Dinheiro em `Decimal
  @db.Decimal(14, 2)` nos 3 campos monetários, nunca float — `DECIMAL(14,2)` confirmado na
  migration.
- **Critério 4** — singleton correto: cache em `globalThis` com `??`, gravado só fora de
  produção (padrão oficial Next.js). Os 3 testes com `vi.resetModules()` provam a
  identidade da referência entre reloads.
- **Critério 6** — a rota é de fato casca fina: sem acesso a banco, sem `try/catch` sobre
  detalhes de erro, só o dispatch de status. O não-vazamento é garantido em duas camadas
  independentes (`checkDatabaseConnection` nunca relança + `try/catch` próprio da rota), e a
  string de erro é literal estática, sem interpolação de `error`. Formato `ApiResponse<T>`
  respeitado.

### Dívidas da seção 6 — avaliação

Nenhuma das 3 é bloqueante para a Fase 0. Duas já não existem mais:

1. **Dívida 1 (teste de índice falhando) — RESOLVIDA, e a decisão do coder foi correta.** A
   asserção original (`indexdef.includes('"date"')`) era insatisfazível contra qualquer schema
   correto, pelo comportamento de quoting do `pg_get_indexdef()`. O coder acertou em recusar
   renomear a coluna via `@map` só para satisfazer a checagem de string — isso teria sido
   gaming do teste. O fix do QA (catálogo `pg_index`/`pg_attribute` em vez de parsing de
   texto) é **mais forte** que a asserção original, não mais fraca, e o controle negativo
   registrado na seção 5 comprova que ainda detecta a ausência do índice. Nenhum teste foi
   enfraquecido para passar.
2. **Dívida 2 (cobertura não validada) — RESOLVIDA.** Rodei `npm run test:coverage`:
   **21/21 passando, 100% stmts / 83.33% branches / 100% funcs / 100% lines**, acima do
   threshold de 80% da `.claude/rules/testing.md`. Os 4 arquivos de produção estão sendo
   medidos de verdade (confirmado via `json-summary`): `route.ts` 8/8, `db.ts` 6/6,
   `health.ts` 4/4, `api-response.ts` 0 stmts (só tipo). O reporter `text` só omite as linhas
   100% cobertas — não é lacuna de instrumentação.
3. **Dívida 3 (referential actions no default)** — aceitável para a Fase 0, mas ver o problema
   não-bloqueante 1 abaixo: ela tem uma consequência concreta já hoje que vale registrar.

### Problemas bloqueantes

Nenhum.

### Problemas não-bloqueantes / sugestões

1. **`prisma/schema.prisma:37` — o cascade `BankItem` → `Account` quebra assim que a Account
   tiver Transactions.** `Account.bankItem` é `onDelete: Cascade`, mas `Transaction.account`
   ficou no default `RESTRICT`. Validei direto no Postgres: deletar um `BankItem` que tem uma
   `Account` com 1 `Transaction` falha com
   `ERROR: update or delete on table "Account" violates foreign key constraint "Transaction_accountId_fkey"`.
   O teste de cascade passa apenas porque as Accounts do cenário estão vazias. Não é bloqueante
   (nenhum fluxo de exclusão existe nesta fase e o critério 5 da seção 2 pede exatamente o
   comportamento testado), mas é um landmine para a task de sync/reconexão de banco. Sugestão:
   a task futura que definir a política de exclusão (dívida 3) deve tratar isso explicitamente
   e cobrir o caso "BankItem com Accounts **não vazias**" com teste.
2. **`lib/db.ts:24` — sem fail-fast quando `DATABASE_URL` não está definida.**
   `new PrismaPg({ connectionString: process.env.DATABASE_URL })` aceita `undefined` (o
   construtor recebe `pg.PoolConfig`, cujo `connectionString` é opcional), e nesse caso o
   `pg` cai silenciosamente nas variáveis `PG*`/defaults do libpq (localhost, usuário do SO).
   O resultado é conectar num banco não intencional em vez de falhar claro. A
   `.claude/rules/typescript-security.md` prescreve justamente o oposto
   (`if (!apiKey) throw new Error(...)`). Sugestão: validar a env var (Zod ou guard simples)
   antes de instanciar o adapter. Não bloqueia porque não há vazamento de credencial e o
   ambiente atual sempre injeta a variável.
3. **`app/api/health/route.ts:19` — `eslint-disable-next-line` para o `request` não usado.** A
   solução funciona e a justificativa (assinatura exigida pelo call-site dos testes) está
   correta. Alternativa mais limpa, se surgirem outras rotas com o mesmo caso: configurar
   `@typescript-eslint/no-unused-vars` com `argsIgnorePattern: "^_"` no ESLint e renomear para
   `_request`, evitando espalhar disables pelas rotas.

### Segurança — checklist

Sem achados. Nenhuma credencial hardcoded em código de produção; `CLIENT_ID`/`CLIENT_SECRET`
existem apenas como chaves vazias em `.env.example`/`.env.test`, sem consumo em código e sem
prefixo `NEXT_PUBLIC_`. Nenhuma chamada Pluggy (fora de escopo, respeitado). Nenhum dado
financeiro ou CPF em log — os únicos `console.warn` estão em `tests/setup/global-setup.ts`
(infra de teste) e não imprimem `DATABASE_URL`. `git ls-files | grep env` retorna vazio e
`git check-ignore` confirma `.env.local` bloqueado. As credenciais `postgres/postgres` do
`docker-compose.yml`/`.env.test` são locais e descartáveis, adequadamente documentadas como
tal. Validação Zod não se aplica: `GET /api/health` não recebe input.

### Escopo

Seção 4 respeitada — nenhuma chamada Pluggy, nenhuma UI, nenhum seed, nenhuma auth, nenhum
E2E. `pluggy-sdk`/`react-pluggy-connect` instalados sem uso, como o critério 8 pede.
`app/page.tsx` intocada.
