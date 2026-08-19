# TASK-009 — Lançamentos manuais + conta Dinheiro (Fase 3)
Status: CONCLUÍDA | Fase do roadmap: 3

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16, Vitest,
  Testing Library. Posteriores ao seu treinamento — consulte a documentação instalada.
- Leia `docs/DEBITO-TECNICO.md` e a **seção 5 da PREMISSA** (modelo de dados + dedup).
- Padrões já estabelecidos: erro de domínio com mensagem fixa (`lib/`); rota casca fina;
  `ApiResponse<T>`; frontend com jsdom opt-in + `cleanup()` (TASK-005/007); Zod nos params.
- **DT-004**: `vi.spyOn(prisma, ...)` é engolido pelo Proxy. Mocke módulos inteiros.
- **Regra de migration permanente:** coluna nova em tabela com dados = nullable ou com default.
- Já existem: `Account` (com `pluggyAccountId`, `bankItemId`, `type`, `balance`), `Transaction`
  (com `source`, `pluggyTransactionId @unique`, `status`, `method`), `lib/sync.ts`,
  `lib/transactions.ts` (`listTransactions`, `resolveTransactionCategory`).

## 1. Objetivo

Permitir lançar transações **manuais** (dinheiro, contas não conectadas, antecipações) — o que o
Open Finance não traz. Entrega a conta "Dinheiro" e o CRUD de lançamentos manuais.

## 2. A decisão de dedup: PREVENÇÃO POR CONVENÇÃO (seção 5.3 da premissa)

Lançamento manual serve **só** para o que a Pluggy **não** sincroniza. Contas conectadas são
**só-importação**. Isso evita estruturalmente a duplicidade manual↔Pluggy: você nunca digita à mão
algo que vai chegar pelo sync. **Concretamente:** criar/editar um lançamento manual só é permitido
contra uma conta **não conectada** (`pluggyAccountId` nulo E `bankItemId` nulo). A conta "Dinheiro"
(`type=CASH`) é a conta manual padrão. A dedup por `pluggyTransactionId` (sagrada) continua intacta.

## 3. Comportamento esperado (TDD)

### Conta Dinheiro
- DADO que não existe QUANDO garanto a conta Dinheiro ENTÃO ela é criada como `CASH`,
  `pluggyAccountId=null`, `bankItemId=null`; garantir de novo **não** duplica (idempotente)

### Criar lançamento manual
- DADO valor, data, descrição, método, categoria e uma conta manual QUANDO crio ENTÃO nasce uma
  `Transaction` com `source=MANUAL`, `pluggyTransactionId=null`, `status=POSTED`
- DADO uma direção **saída** QUANDO crio ENTÃO o `amount` é gravado **negativo**; **entrada** →
  positivo (convenção `negativo = saída`, testada nas duas direções)
- DADO uma conta **conectada** (`pluggyAccountId` não nulo) QUANDO tento criar um manual nela
  ENTÃO é **recusado** com erro de domínio → 400 (prevenção por convenção)

### Editar / excluir
- DADO um lançamento `MANUAL` QUANDO edito/excluo ENTÃO funciona
- DADO uma transação `PLUGGY` (importada) QUANDO tento editar/excluir ENTÃO é **recusado** — dados
  importados não se editam à mão (vêm do sync)

### Convivência com o sync
- DADO lançamentos manuais na base QUANDO rodo o sync ENTÃO eles **permanecem intactos** (o sync
  faz upsert por `pluggyTransactionId`, que é nulo nos manuais — nunca os toca)
- DADO um lançamento manual QUANDO abro `/transacoes` ENTÃO ele aparece na lista junto dos importados

## 4. Critérios de aceite

- [ ] 1. `lib/` expõe `ensureCashAccount()` idempotente (conta Dinheiro `CASH`, sem vínculo Pluggy)
- [ ] 2. `POST /api/entries` cria lançamento manual: Zod (valor > 0, `direction` entrada/saída,
      data válida, descrição não vazia, `method` no conjunto, categoria opcional, `accountId`).
      Casca fina; lógica em `lib/` (ex. `lib/entries.ts`). `source=MANUAL`, `pluggyTransactionId=null`
- [ ] 3. **Prevenção por convenção:** criar/editar manual contra conta conectada é recusado
      (`pluggyAccountId` não nulo → erro de domínio → 400). Teste prova
- [ ] 4. Sinal por `direction`: saída → `amount` negativo, entrada → positivo. Teste as duas
- [ ] 5. `PATCH /api/entries/[id]` edita **só** `MANUAL`; `DELETE /api/entries/[id]` exclui **só**
      `MANUAL`. Tentar em `PLUGGY` → recusado (400/403). Testes provam por `source`
- [ ] 6. Teste prova que um sync **não altera nem apaga** lançamentos manuais (regressão da dedup)
- [ ] 7. Página (ex. `/lancamentos`): formulário de novo lançamento (valor, direção, data,
      descrição, método, categoria, conta) + lista dos manuais com excluir e editar. Testing Library
- [ ] 8. O lançamento manual aparece em `/transacoes` (mesma tabela); o filtro de conta inclui Dinheiro
- [ ] 9. Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 10. Nenhum `console.*` em produção
- [ ] 11. Suíte inteira verde (os anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 5. Fora de escopo

- Conciliação manual↔Pluggy / sugestão de duplicatas (a premissa 5.2; **não** faremos — a decisão
  foi prevenção por convenção)
- Criar contas manuais **arbitrárias** além da Dinheiro (só a Dinheiro nesta task)
- Saldo computado da conta Dinheiro / agregação (Fase 5 — dashboard)
- Recorrências / contas fixas (Fase 4)
- Vincular lançamento manual a uma `RecurringBillInstance` (Fase 4)

## 6. Testes (preenchido pelo qa)

### Arquivos criados

- `tests/unit/lib/entries.test.ts` — validação Zod pura de `manualEntryInputSchema`
  (sem banco).
- `tests/integration/entries.integration.test.ts` — `lib/entries.ts` contra o Postgres
  real (`ensureCashAccount`, `createManualEntry`, `updateManualEntry`, `deleteManualEntry`,
  `listManualEntries`, `listManualAccounts`), a prevenção por convenção, a convivência com
  o sync e a integração com `/transacoes`. Contém o **contrato completo** de `lib/entries.ts`
  no docblock do topo (classes de erro, assinaturas, regras passo a passo) — é a fonte de
  verdade para o coder.
- `tests/unit/api/entries-route.test.ts` — `POST /api/entries` (mock parcial de
  `@/lib/entries`, schema real via `importOriginal`).
- `tests/unit/api/entries-id-route.test.ts` — `PATCH /api/entries/[id]` e
  `DELETE /api/entries/[id]` (mesmo padrão de mock parcial).
- `tests/unit/components/add-entry-form.test.tsx` — `components/entries/AddEntryForm.tsx`.
- `tests/unit/components/edit-entry-form.test.tsx` — `components/entries/EditEntryForm.tsx`.
- `tests/unit/components/delete-entry-button.test.tsx` — `components/entries/DeleteEntryButton.tsx`.
- `tests/unit/app/lancamentos-page.test.tsx` — `app/lancamentos/page.tsx` (mocka os três
  componentes acima e `@/lib/entries`).

Arquivo de **fixture** estendido (não é teste, é infraestrutura de teste): `tests/fixtures/db.ts`
ganhou `buildManualAccount(overrides)` — uma Account com `pluggyAccountId=null` **e**
`bankItemId=null` (contrasta com `buildAccount`, cujo default sempre gera uma conta
conectada). Nenhuma migration/schema novo é necessária — `Account`/`Transaction` já têm
todos os campos usados (`source`, `method`, `status`, `pluggyAccountId`, `bankItemId`,
`pluggyTransactionId`).

### Comandos para rodar

```bash
# Suíte inteira (o que valida "sem regressão nos 527 testes" + as novas em RED)
npm test

# Só os arquivos desta task
npx dotenv -e .env.test -- vitest run \
  tests/unit/lib/entries.test.ts \
  tests/integration/entries.integration.test.ts \
  tests/unit/api/entries-route.test.ts \
  tests/unit/api/entries-id-route.test.ts \
  tests/unit/components/add-entry-form.test.tsx \
  tests/unit/components/edit-entry-form.test.tsx \
  tests/unit/components/delete-entry-button.test.tsx \
  tests/unit/app/lancamentos-page.test.tsx

# Cobertura
npm run test:coverage
```

Pré-requisito: Postgres de teste no ar (`npm run db:up`, `npm run test:migrate` se
necessário) — os testes de `lib/` e de rota batem no banco real (`gestor_test`), exceto o
schema Zod puro (`tests/unit/lib/entries.test.ts`), que não precisa de banco.

### RED confirmado (evidência)

`npm test` nesta branch, ANTES de qualquer código de produção desta task existir:

```
Test Files  8 failed | 41 passed (49)
     Tests  87 failed | 527 passed (614)
```

Os 8 arquivos que falham são exatamente os 8 criados nesta task. Motivo confirmado em
todos — falta de implementação, não erro de sintaxe/import quebrado por engano:

- `Cannot find package '@/lib/entries'` (5 arquivos: o schema/lib ainda não existe)
- `Cannot find package '@/app/api/entries/route'` / `.../[id]/route`
- `Failed to resolve import "@/app/lancamentos/page"`
- `Failed to resolve import "@/components/entries/AddEntryForm"` /
  `DeleteEntryButton` / `EditEntryForm`

Os **527 testes pré-existentes continuam verdes** (nenhuma regressão) — o baseline citado
no prompt bate exatamente.

### Mapeamento critério de aceite → teste

| # | Critério (seção 4) | Teste(s) |
|---|---|---|
| 1 | `ensureCashAccount()` idempotente | `entries.integration.test.ts` › `ensureCashAccount - conta Dinheiro idempotente` (as 2 its: cria na 1ª chamada; 2ª chamada devolve a mesma, sem duplicar) |
| 2 | `POST /api/entries` cria manual; Zod completo; casca fina; `source=MANUAL`/`pluggyTransactionId=null` | Zod: `entries.test.ts` (todos os describes) + `entries-route.test.ts` › "validação Zod" (payload ausente/malformado/each inválido) e "sucesso" (chama `createManualEntry`, `ApiResponse<T>` reconstruído). Persistência: `entries.integration.test.ts` › `createManualEntry - lancamento manual basico` (source/pluggyTransactionId/status, com e sem category) |
| 3 | Prevenção por convenção: manual contra conta conectada é recusado (400), provado no Postgres real | `entries.integration.test.ts` › `createManualEntry - PREVENCAO POR CONVENCAO...` (1º it: MESMO teste recusa a conectada E aceita a manual, por contraste, como pedido no prompt) e `updateManualEntry - ... editar contra uma conta CONECTADA`. Tradução HTTP: `entries-route.test.ts` › "prevenção por convenção" (`EntryAccountConnectedError` → 400) e `entries-id-route.test.ts` › mesmo bloco no PATCH |
| 4 | Sinal por direção, as duas direções, provado no valor gravado | `entries.integration.test.ts` › `createManualEntry - sinal por direcao...` (2 its: `saida` → negativo, `entrada` → positivo, ambos lendo `persisted.amount` do Postgres) |
| 5 | `PATCH`/`DELETE` só em `MANUAL`; `PLUGGY` recusado, provado por `source` | `entries.integration.test.ts` › `updateManualEntry - edita SO lancamento MANUAL` (it "DADO uma transacao PLUGGY... e RECUSADO") e `deleteManualEntry - exclui SO lancamento MANUAL` (idem) — cria a `Transaction` com `source: "PLUGGY"` de verdade e prova que fica intacta. Tradução HTTP (`ManualEntryNotEditableError` → 403): `entries-id-route.test.ts` › blocos "transacao PLUGGY não pode ser editada/excluida" |
| 6 | Sync não altera/apaga manuais (regressão da dedup sagrada) | `entries.integration.test.ts` › `convivencia com o sync - lancamentos manuais permanecem INTACTOS...` (cria 2 manuais, roda `syncBankItem` com Pluggy mockada, prova contagem/ids/valores/descrições intactos e `pluggyTransactionId` continua `null`) |
| 7 | Página `/lancamentos`: formulário + lista com excluir/editar | `add-entry-form.test.tsx`, `edit-entry-form.test.tsx`, `delete-entry-button.test.tsx`, `lancamentos-page.test.tsx` (todos os describes) |
| 8 | Manual aparece em `/transacoes`; filtro de conta inclui Dinheiro | `entries.integration.test.ts` › `integracao com /transacoes` (2 its: `listTransactions` traz o manual ao lado do PLUGGY; `listAccountsForFilter` traz "Dinheiro" após `ensureCashAccount`) |
| 9 | Nenhuma chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET` | Todo o arquivo `entries.integration.test.ts` mocka `"pluggy-sdk"` (nunca a rede real) só no bloco de convivência com o sync, com `CLIENT_ID`/`CLIENT_SECRET` fake definidos/restaurados no próprio teste — os demais blocos não tocam a Pluggy. Testes de componente mockam `fetch` via `vi.stubGlobal` |
| 10 | Nenhum `console.*` em produção | `entries-route.test.ts`, `entries-id-route.test.ts` (blocos "não chama console.*") e os testes de componente (`AddEntryForm`, `EditEntryForm` — bloco dedicado) |
| 11 | Suíte inteira verde, `build`/`lint` limpos | Validado pelo coder ao final; o qa confirmou aqui que os 527 testes pré-existentes permanecem verdes (RED só nos 8 arquivos novos) |

### Contrato definido para o coder (resumo — o completo está no docblock de `entries.integration.test.ts`)

- **`lib/entries.ts`**: `ENTRY_METHODS`/`ENTRY_DIRECTIONS`, `manualEntryInputSchema`
  (reaproveitado tal-e-qual pelo PATCH — edição substitui o lançamento inteiro, sem schema
  parcial separado), erros `EntryAccountNotFoundError`, `EntryAccountConnectedError`,
  `ManualEntryNotFoundError`, `ManualEntryNotEditableError`, e as funções
  `ensureCashAccount`, `createManualEntry`, `updateManualEntry`, `deleteManualEntry`,
  `listManualEntries`, `listManualAccounts`.
- **`app/api/entries/route.ts`**: `POST` — Zod 400, `EntryAccountNotFoundError`/
  `EntryAccountConnectedError` → 400, sucesso 200/201, outro erro → 500.
- **`app/api/entries/[id]/route.ts`**: `PATCH` — Zod 400, `ManualEntryNotFoundError` → 404,
  `EntryAccountNotFoundError`/`EntryAccountConnectedError` → 400, `ManualEntryNotEditableError`
  → 403, sucesso 200, outro erro → 500. `DELETE` — mesmos códigos (sem a etapa de Zod),
  sucesso 200 com `{ id }`.
- **`components/entries/AddEntryForm.tsx`**: campos rotulados "Valor"/"Direção"/"Data"/
  "Descrição"/"Método"/"Categoria"/"Conta" (select a partir de `accounts` prop), botão
  "Adicionar lançamento", POST, estado "Salvando...", limpa o formulário e chama
  `onCreated` no sucesso, mantém valores e mostra erro genérico na falha.
- **`components/entries/EditEntryForm.tsx`**: mesmos campos, sempre visível (sem toggle),
  pré-preenchido a partir de `entry` prop, botão "Salvar alterações", PATCH, chama `onSaved`
  no sucesso.
- **`components/entries/DeleteEntryButton.tsx`**: botão "Excluir", DELETE, estado
  "Removendo...", desabilita/some no sucesso e chama `onDeleted`.
- **`app/lancamentos/page.tsx`**: Server Component — chama `ensureCashAccount()`,
  `listManualEntries()`, `listManualAccounts()`; renderiza `AddEntryForm` + uma
  `EditEntryForm`/`DeleteEntryButton` por lançamento; estado vazio quando a lista é `[]`.

## 7. Implementação (preenchido pelo coder)

### Arquivos criados

- `lib/entries.ts` — `ENTRY_METHODS`/`ENTRY_DIRECTIONS` (reexportados de
  `lib/entry-constants.ts`), `manualEntryInputSchema`, os quatro erros de
  domínio (`EntryAccountNotFoundError`, `EntryAccountConnectedError`,
  `ManualEntryNotFoundError`, `ManualEntryNotEditableError`), `ManualEntryListItem`
  e `ensureCashAccount`/`createManualEntry`/`updateManualEntry`/
  `deleteManualEntry`/`listManualEntries`/`listManualAccounts`. Implementado
  exatamente conforme o contrato do docblock de
  `tests/integration/entries.integration.test.ts`.
- `lib/entry-constants.ts` — **arquivo novo, fora do contrato original do
  qa** (decisão do coder, ver abaixo): `ENTRY_METHODS`/`ENTRY_DIRECTIONS` e
  seus tipos, sem nenhum import de `@/lib/db`/Prisma.
- `app/api/entries/route.ts` — `POST` (casca fina sobre `createManualEntry`).
- `app/api/entries/[id]/route.ts` — `PATCH`/`DELETE` (casca fina sobre
  `updateManualEntry`/`deleteManualEntry`).
- `components/entries/AddEntryForm.tsx`, `components/entries/EditEntryForm.tsx`,
  `components/entries/DeleteEntryButton.tsx` — formulários/ação client-side,
  mesmo padrão de `AddCategoryRuleForm`/`DeleteCategoryRuleButton` (TASK-008).
- `app/lancamentos/page.tsx` — Server Component: `ensureCashAccount()` →
  `listManualEntries()`/`listManualAccounts()` → `AddEntryForm` + uma
  `EditEntryForm`/`DeleteEntryButton` por lançamento; estado vazio quando `[]`.

Nenhum arquivo de teste foi alterado. Nenhuma migration/alteração de schema
(confirmado pelo qa na seção 6 — `Account`/`Transaction` já tinham todos os
campos necessários).

### Decisões tomadas

- **`lib/entry-constants.ts` (desvio do contrato do qa, motivado por
  `npm run build`, não por um teste).** O contrato da seção 6 previa
  `ENTRY_METHODS`/`ENTRY_DIRECTIONS` só em `lib/entries.ts`. Ao implementar
  assim, `npm run build` quebrava: `AddEntryForm`/`EditEntryForm` são Client
  Components e importavam esses arrays de `lib/entries.ts`, que também
  importa `@/lib/db` (Prisma + driver `pg`) — isso arrastava `pg` (que usa
  `net`/`tls`/`util/types`, módulos Node-only) para o bundle do browser,
  falhando com "Module not found: Can't resolve 'net'". Nenhum teste unitário
  pegou isso porque os testes de componente rodam em `jsdom` via Vitest, que
  não faz bundling estilo webpack/Turbopack — só `npm run build` expõe o
  problema. Solução: extraí as duas constantes (e seus tipos) para
  `lib/entry-constants.ts`, um módulo sem nenhum I/O; `lib/entries.ts`
  reexporta os mesmos símbolos (o contrato `import { ENTRY_METHODS } from
  "@/lib/entries"` usado pelos testes continua válido — `tests/unit/lib/entries.test.ts`
  passa sem alteração), e os componentes client-side importam direto de
  `lib/entry-constants.ts`. Nenhum teste foi tocado; a mudança é estritamente
  aditiva (um módulo novo) e não altera nenhuma assinatura pública testada.
- **`direction` do `ManualEntryListItem` é sempre derivado do sinal do
  `amount` persistido** (nunca reaproveita o `direction` do input) — assim
  `listManualEntries`/`listManualAccounts` e o retorno de
  `create`/`updateManualEntry` ficam consistentes entre si e com o Postgres,
  mesmo que uma edição futura altere o valor por outro caminho.
  `toManualEntryListItem` é a única função de reconstrução, reaproveitada
  pelas quatro funções de I/O; recebe um tipo estrutural mínimo (duck typing)
  em vez de tipar contra os generics do Prisma Client — reduz acoplamento e
  facilita reuso da mesma função nos quatro pontos que retornam
  `ManualEntryListItem`.
- **`updateManualEntry`/`deleteManualEntry` checam `source !== "MANUAL"`
  ANTES de tocar em `accountId`** — replica a ordem exigida pelo teste
  "transação PLUGGY não pode ser editada" (a prevenção por convenção não
  entra em jogo quando o registro nem é editável).
- **`app/lancamentos/page.tsx` mapeia `ManualEntryListItem` (amount com
  sinal, `date: Date`) para o formato que `EditEntryForm` espera (amount
  absoluto em string, `date` como `"YYYY-MM-DD"`)** — via
  `Math.abs(Number(entry.amount)).toFixed(2)` e
  `entry.date.toISOString().slice(0, 10)`. Não coberto por teste direto (o
  teste da página mocka `EditEntryForm` inteiro), mas necessário para a
  integração real funcionar; `method: entry.method ?? "PIX"` é um fallback
  defensivo para o tipo `string | null` do `ManualEntryListItem` — na prática
  nunca é `null` para um lançamento manual, já que `method` é obrigatório no
  Zod.

### Dívidas assumidas

- Nenhuma nova. `lib/entry-constants.ts` é infraestrutura, não uma
  funcionalidade extra — nenhum critério de aceite muda de comportamento.

## 8. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO

Verificação independente do reviewer (não confiei no relato): `npx tsc --noEmit`
limpo; `npm run build` limpo (rotas `/lancamentos`, `/api/entries` e
`/api/entries/[id]` geradas, sem "Module not found: net/tls"); os 8 arquivos
da task = 111/111 verdes contra o Postgres real; `npm run lint` 0 erros (2
warnings são em `coverage/lcov-report/*`, arquivo gerado, não código-fonte).

Julgamento sobre os 6 pontos levantados:

1. Prevenção por convenção (critério 3) — SÓLIDA. `createManualEntry` e
   `updateManualEntry` passam ambos por `getManualEligibleAccount`
   (`lib/entries.ts:147`), que recusa com `EntryAccountConnectedError` quando
   `pluggyAccountId !== null`. Não há caminho (create nem update) que aceite um
   manual contra conta conectada. Update ainda checa `source` antes da conta.
   Provado no Postgres real por contraste (integration test, describe "PREVENCAO
   POR CONVENCAO") e na edição.

2. Dedup sagrada (critério 6) — INTACTA e com poder de detecção real. O teste de
   convivência roda `syncBankItem` de verdade (só a `pluggy-sdk` mockada na
   fronteira do módulo), o sync cria uma `Transaction` PLUGGY real via upsert por
   `pluggyTransactionId`, e o teste prova os 2 manuais intactos (ids, valores,
   descrições, `pluggyTransactionId=null`) + total=3. Não é verde-por-construção:
   o upsert exercita o caminho real e os manuais têm `pluggyTransactionId=null`,
   nunca casáveis.

3. Sinal por direção (critério 4) — DERIVADO, nunca confiado. `signedAmount`
   (`lib/entries.ts:164`) deriva o sinal de `direction`. Reforço em duas camadas:
   o Zod exige `amount: z.number().positive()`, então valor negativo digitado já
   é 400. Testado nas duas direções lendo o valor persistido.

4. Editar/excluir só MANUAL (critério 5) — ROBUSTO. `source !== "MANUAL"` é
   checado ANTES de qualquer escrita, tanto em `updateManualEntry` quanto em
   `deleteManualEntry` (linhas 246 e 280), e antes da resolução de conta. PLUGGY
   → `ManualEntryNotEditableError` → 403. Provado por `source` real no banco
   (transação criada com `source:"PLUGGY"`, verificada intacta após a recusa).

5. `lib/entry-constants.ts` (desvio do coder) — CORRETO e necessário. Os três
   Client Components importam só `@/lib/entry-constants` (sem I/O) e
   `@/lib/api-response` (interface pura, import type-only). Nenhum importa, direta
   ou transitivamente, `lib/entries.ts` ou `lib/db`. Confirmado pelo `npm run
   build` limpo — o único lugar que pegaria o vazamento do `pg` para o bundle
   client. Desvio bem justificado; não altera nenhuma assinatura testada.

6. Zod / PII / console.* — OK. Zod cobre valor <=0, ausente, não-numérico; data
   inválida (30/fev, mês 13, formato com horário); descrição vazia; método fora do
   conjunto; direção inválida; accountId vazio; categoria vazia-quando-presente.
   Nenhum `console.*` em produção (só em comentários), com teste de detecção real
   no caminho de erro (spy em `console` funciona — não é o Proxy do DT-004).
   Mensagens de erro genéricas nas rotas e nos componentes (nunca `body.error`
   bruto no client); sem PII/CPF/dado financeiro em log.

### Problemas bloqueantes

Nenhum.

### Sugestões não-bloqueantes

- **Guarda de elegibilidade keia só `pluggyAccountId`, não "ambos nulos".**
  `getManualEligibleAccount` (`lib/entries.ts:156`) e `listManualAccounts`
  (`lib/entries.ts:305`) filtram apenas `pluggyAccountId`, enquanto a PREMISSA
  (5.3) define conta manual como `pluggyAccountId` nulo E `bankItemId` nulo. Hoje
  é seguro e, na verdade, `pluggyAccountId` é o discriminador correto: é a chave
  que o `syncBankItem` usa no upsert de contas, então "conectada" == "tem
  pluggyAccountId". Os dois campos são sempre gravados juntos (sync põe ambos;
  `ensureCashAccount` põe ambos nulos), logo o estado `pluggyAccountId=null &&
  bankItemId!=null` não é alcançável no código atual. Fica frágil só se uma task
  futura criar conta com `bankItemId` sem `pluggyAccountId`. Sugestão: alinhar a
  guarda à definição da premissa (checar os dois) ou registrar como DT com a
  justificativa acima. Não bloqueia — a proteção do eixo da task está correta.

- **`method: entry.method ?? "PIX"` em `app/lancamentos/page.tsx:44`** é um
  fallback defensivo para o tipo `string | null` de `ManualEntryListItem`. Na
  prática nunca é null (method é obrigatório no Zod), mas o fallback silencioso
  para "PIX" poderia mascarar um dado inconsistente. Aceitável para MVP; opcional
  estreitar o tipo de `method` no `ManualEntryListItem` já que manuais sempre têm
  método.

### Achados que viram DT

- Candidato a DT (registrar, não corrigir agora): guarda de elegibilidade por
  `pluggyAccountId` isolado vs. definição "ambos nulos" da premissa 5.3 — mesmo
  padrão latente do DT-014 (inverificável/redundante hoje, vira concreto ao
  introduzir um novo caminho de criação de conta). Reavaliar ao adicionar contas
  manuais arbitrárias (fora do escopo desta task) ou qualquer vínculo parcial a
  BankItem.
