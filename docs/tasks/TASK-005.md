# TASK-005 — Widget PluggyConnect e desativar banco (fecha a Fase 1)
Status: CONCLUÍDA | Fase do roadmap: 1

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16,
  Vitest, `pluggy-sdk`, `react-pluggy-connect`. Todos posteriores ao seu treinamento —
  consulte `node_modules/next/dist/docs/01-app/`, `node_modules/prisma`,
  `node_modules/pluggy-sdk` e `node_modules/react-pluggy-connect` antes de assumir qualquer API.
  **Esta é a primeira task com componentes React** — confira em `01-app` como Server e Client
  Components funcionam nesta versão antes de escrever `"use client"` por hábito.
- Leia `docs/DEBITO-TECNICO.md` antes de reportar qualquer problema como novo.
- Leia a **seção 11 da PREMISSA** (mapeamento da API e estados do Item).
- Já existem e devem ser reaproveitados: `POST /api/connect-token` (TASK-003),
  `POST /api/items` e `lib/bank-item.ts` (TASK-004).
- **Nenhum teste automatizado pode chamar a API real da Pluggy.**
- **DT-004**: `lib/db.ts` é Proxy com traps `get`/`has`; `vi.spyOn(prisma, ...)` é engolido.
  Mocke módulos inteiros.
- **DT-013**: coluna nova em tabela que pode ter dados deve ser nullable, ou com default.
  O `archivedAt` é naturalmente nullable — mantenha assim.
- **ADR 6**: contas reais, sem sandbox. **Não** use `includeSandbox` no widget.

## 1. Objetivo

Fechar a Fase 1: permitir conectar um banco pelo widget e **desativá-lo** — resolvendo o
**DT-002**, que hoje deixa um banco conectado sem nenhuma saída pela aplicação.

## 2. Comportamento esperado (TDD)

### Conectar
- DADO a página de bancos QUANDO clico em "Conectar banco"
  ENTÃO o widget abre usando um Connect Token obtido de `POST /api/connect-token`
- DADO o widget concluído com sucesso QUANDO recebo o `itemId` no `onSuccess`
  ENTÃO ele é enviado a `POST /api/items` e o banco aparece na lista com seu estado
- DADO o widget falhando (`onError`) QUANDO o erro chega
  ENTÃO vejo mensagem clara e a opção de tentar de novo — **sem** vazar detalhe técnico
- DADO que `/api/connect-token` falha QUANDO tento conectar
  ENTÃO vejo erro tratado e o widget **não** abre

### Desativar (DT-002)
- DADO um banco conectado QUANDO o desativo
  ENTÃO o Item é deletado **na Pluggy** e só depois o `BankItem` é marcado como arquivado
- DADO que a deleção na Pluggy falha QUANDO tento desativar
  ENTÃO **nada muda localmente** — o banco continua ativo e posso tentar de novo
- DADO um Item que já não existe na Pluggy (404) QUANDO desativo
  ENTÃO o arquivamento local acontece mesmo assim — o objetivo (parar de compartilhar) já está
  satisfeito e não faz sentido travar
- DADO um banco arquivado QUANDO listo os bancos
  ENTÃO ele **não** aparece, mas suas transações e o histórico continuam na base
- DADO um banco arquivado QUANDO um sync futuro rodar
  ENTÃO ele é ignorado

## 3. Critérios de aceite

- [ ] 1. `BankItem` ganha `archivedAt DateTime?` (nullable, conforme DT-013), com migration
- [ ] 2. `DELETE /api/items/[id]` existe, responde em `ApiResponse<T>` e é casca fina
- [ ] 3. **A ordem é obrigatória e testada**: deletar na Pluggy → só então arquivar local. Teste
      prova que, se a Pluggy falhar, o `BankItem` continua **não** arquivado (nunca some da UI
      um banco que segue compartilhando dados)
- [ ] 4. Teste prova que 404 da Pluggy (Item já inexistente) resulta em arquivamento local bem-sucedido
- [ ] 5. Arquivar é **idempotente**: desativar duas vezes não quebra nem altera o `archivedAt` original
- [ ] 6. A listagem de bancos exclui arquivados; teste prova que o registro e suas relações
      continuam na base
- [ ] 7. Componente do widget testado com **Testing Library** e `react-pluggy-connect` mockado:
      estado de carregando, `onSuccess` chamando `POST /api/items`, `onError` exibindo mensagem
      tratada, e falha do connect-token não abrindo o widget
- [ ] 8. Página que lista os bancos conectados com seu estado derivado (`OK`, `PRECISA_ACAO`…)
      e permite conectar e desativar
- [ ] 9. O Connect Token **nunca** é logado nem persistido; nenhum `console.*` em produção
- [ ] 10. `includeSandbox` não é usado (ADR 6)
- [ ] 11. Nenhum teste faz chamada de rede real; a suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 12. Suíte inteira verde (os 159 anteriores sem regressão), `npm run build` e
      `npm run lint` limpos

## 4. Fora de escopo

- Sync de `Account`s e `Transaction`s (Fase 2 — DT-007 sinal do `amount`, DT-008 paginação)
- Reconectar/atualizar Item com consentimento expirado (`updateItem`)
- Desarquivar um banco pela UI
- Webhooks
- Autenticação do nosso app
- Estilização elaborada — a UI desta task é funcional, não um design final

## 5. Testes (preenchido pelo qa)

### Aparato de teste (novo nesta task)

- **Dependências instaladas** (`devDependencies`, ver `package.json`/`package-lock.json`):
  `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`.
- **`vitest.config.ts`** (alterado): `include` passa a pegar `tests/**/*.test.tsx` além de
  `.ts`; `coverage.include` ganha `app/bancos/**/*.tsx` e `components/**/*.tsx`. O ambiente
  global continua `"node"` (os 159 testes existentes e os de integração dependem disso e do
  Postgres real) — cada arquivo de teste de componente ativa `jsdom` **por arquivo**, via o
  docblock nativo do Vitest `/** @vitest-environment jsdom */` na primeira linha (confirmado
  em `node_modules/vitest/dist/chunks/cli-api.*.js`, função `detectCodeBlock`). Nenhuma
  mudança de ambiente afeta os testes que não declaram o docblock.
- **`tests/setup/vitest.setup.ts`** (alterado): importa `@testing-library/jest-dom/vitest`
  globalmente (`expect.extend`, seguro em ambiente `node` — não toca `document`/`window` na
  importação).
- **`tests/fixtures/db.ts`** (alterado): `buildBankItem` ganha `archivedAt: undefined`
  (sobrescrevível), default `NULL` via schema.
- **Armadilha descoberta e documentada nos próprios arquivos de teste**: com
  `globals: false` (padrão do projeto), o cleanup automático do Testing Library entre testes
  **não** dispara (ele depende de um `afterEach` global). Todo teste de componente chama
  `cleanup()` explicitamente no seu `afterEach` — sem isso, o segundo teste de cada arquivo
  quebra com "multiple elements found" porque o componente do teste anterior continua montado
  no jsdom.
- **Validação de contrato**: antes de fechar a task, cada arquivo de teste novo que dependia de
  `lib/`, rota ou componente ainda não implementados foi validado com uma implementação-stub
  temporária (criada e depois revertida via `git checkout`/`rm`, nunca commitada) para provar
  que os contratos abaixo são realmente satisfazíveis e que nenhum teste tem bug de autoria.
  Todos os stubs geraram GREEN nos arquivos correspondentes antes de serem descartados.

### Correção pós-aprovação: shape REAL do erro de "Item não encontrado" da Pluggy (critério 4)

A revisão (seção 7) já havia sinalizado, como achado não-bloqueante, que a detecção de 404 em
`deleteItemFromPluggy` (`error.statusCode === 404`) presumia um shape de erro que o SDK instalado
não confirma — e que **nenhum teste validava**, porque os mocks injetavam exatamente
`{ statusCode: 404 }`, o mesmo shape que o código (então hipotético) esperava. O orquestrador
confirmou contra a API real (chamada `deleteItem` de verdade contra um Item inexistente) que o
shape verdadeiro é:

```js
{ message: 'item not found', code: 404, codeDescription: 'ITEM_NOT_FOUND', errorId: '<uuid>' }
```

Ou seja: **não existe `statusCode` na raiz** (nem em nenhum outro lugar do objeto); é um objeto
plano (`constructor: Object`), sem `.response`. O campo `code` é numérico (`404`), e
`codeDescription: 'ITEM_NOT_FOUND'` é o discriminador semântico mais robusto (a Pluggy reusa
`code` tanto para status HTTP quanto, em outros endpoints, para códigos de erro próprios — mais
ambíguo do que `codeDescription`). A implementação existente checava `statusCode`, que é sempre
`undefined` contra esse shape — o critério 4 falhava silenciosamente em produção, exatamente como
a revisão havia previsto como risco.

**Ação tomada nesta correção**: os mocks de "Item já não existe" foram reescritos para usar o
shape real acima (função `buildRealPluggyItemNotFoundError()` em
`tests/unit/lib/pluggy.test.ts`, reaproveitada por referência de shape — não de import — em
`tests/integration/api/items-delete.integration.test.ts`), nos dois únicos arquivos que de fato
constroem o objeto de erro cru do SDK (`vi.mock("pluggy-sdk", ...)`):

- `tests/unit/lib/pluggy.test.ts` — testa `deleteItemFromPluggy` isolado.
- `tests/integration/api/items-delete.integration.test.ts` — ponta a ponta (rota + lib + Postgres).

Os demais arquivos apontados inicialmente pelo orquestrador (`tests/unit/lib/bank-item-archive.test.ts`,
`tests/integration/bank-item-archive.integration.test.ts`) mockam `@/lib/pluggy` **inteiro**
(`deleteItemFromPluggy` como uma função opaca que resolve ou rejeita) — nunca constroem o objeto
de erro cru da Pluggy, então não tinham o bug de shape; a tradução do shape é responsabilidade
exclusiva de `lib/pluggy.ts`, testada nos dois arquivos acima. Adicionei comentários nesses dois
arquivos explicando essa fronteira, para não deixar a ausência de mudança parecer um descuido.

O teste de erro genérico (não-404) foi mantido cobrindo a direção crítica de privacidade — **não
arquivar** — e seu mock foi ajustado para não usar `statusCode` (campo confirmado inexistente no
SDK real) nem `code: 404`/`codeDescription: 'ITEM_NOT_FOUND'` (para não ser confundido com o caso
de sucesso): `{ message: 'Forbidden for this API key', code: 'FORBIDDEN', errorId: '<uuid>' }`.

**Resultado**: contra a implementação atual (que ainda checa `statusCode`), os testes de 404
corrigidos ficam **RED** — a prova de que o mock agora reflete a realidade e expõe o bug de
verdade, em vez de validar a suposição errada. Nenhum outro teste regrediu (ver "Evidência de RED
pós-correção" no fim desta seção).

### Arquivos criados

- `tests/unit/schema/bank-item-archived-at.test.ts`
- `tests/unit/lib/bank-item-archive.test.ts`
- `tests/integration/bank-item-archive.integration.test.ts`
- `tests/unit/api/items-delete-route.test.ts`
- `tests/integration/api/items-delete.integration.test.ts`
- `tests/unit/components/connect-bank-button.test.tsx`
- `tests/unit/components/deactivate-bank-button.test.tsx`
- `tests/unit/app/bancos-page.test.tsx`

### Arquivos alterados

- `vitest.config.ts`, `tests/setup/vitest.setup.ts`, `tests/fixtures/db.ts` (aparato, ver acima)
- `tests/unit/lib/pluggy.test.ts` (adiciona a suíte de `deleteItemFromPluggy`)
- `tests/integration/schema.integration.test.ts` (adiciona a verificação de `archivedAt`
  nullable no catálogo real do Postgres)
- `package.json` / `package-lock.json` (novas `devDependencies`)

### Comandos para rodar

```bash
# Suíte inteira (Docker/Postgres de teste precisa estar de pé: npm run db:up)
npm test

# Só os arquivos desta task
npm test -- tests/unit/schema/bank-item-archived-at.test.ts
npm test -- tests/unit/lib/bank-item-archive.test.ts
npm test -- tests/integration/bank-item-archive.integration.test.ts
npm test -- tests/unit/api/items-delete-route.test.ts
npm test -- tests/integration/api/items-delete.integration.test.ts
npm test -- tests/unit/components/connect-bank-button.test.tsx
npm test -- tests/unit/components/deactivate-bank-button.test.tsx
npm test -- tests/unit/app/bancos-page.test.tsx
npm test -- tests/unit/lib/pluggy.test.ts
npm test -- tests/integration/schema.integration.test.ts

# Cobertura
npm run test:coverage
```

### Contrato assumido para o coder (resumo — o detalhe completo está no cabeçalho de cada
arquivo de teste)

- `lib/pluggy.ts` ganha `export class PluggyItemDeleteError extends Error {}` e
  `export async function deleteItemFromPluggy(pluggyItemId: string): Promise<void>` — mesma
  validação de credenciais das funções existentes; chama `client.deleteItem(pluggyItemId)`;
  **resolve** (não rejeita) quando o erro capturado representar "Item já não existe" — **shape
  real confirmado contra a API** (ver correção pós-aprovação acima):
  `{ message: 'item not found', code: 404, codeDescription: 'ITEM_NOT_FOUND', errorId: '<uuid>' }`,
  **sem** `statusCode`. A checagem deve usar `codeDescription === 'ITEM_NOT_FOUND'` (ou
  `code === 404`, mas nunca `statusCode`, campo que o SDK real não preenche); qualquer outra
  falha vira `PluggyItemDeleteError` (mensagem fixa, sem detalhe do SDK); nunca `console.*`.
- `lib/bank-item.ts` ganha:
  - `export class BankItemNotFoundError extends Error {}`
  - `export async function archiveBankItem(bankItemId: string): Promise<{ id: string; pluggyItemId: string; archivedAt: Date }>`
    — nesta ordem: (1) `findUnique` por id, `BankItemNotFoundError` se não existir; (2) se
    `archivedAt` já preenchido, retorna imediatamente **sem** chamar `deleteItemFromPluggy` nem
    `update` (idempotência, critério 5); (3) senão, chama `deleteItemFromPluggy` **primeiro** —
    se rejeitar, propaga o erro **sem** tocar o banco (critério 3); (4) só então
    `prisma.bankItem.update({ data: { archivedAt: new Date() } })`.
  - `export async function listActiveBankItems(): Promise<Array<{ id; pluggyItemId; institution; status; executionStatus; state: BankItemState; lastSyncAt }>>`
    — `findMany({ where: { archivedAt: null } })`, reconstruído campo a campo com `state` via
    `deriveBankItemState`.
- `prisma/schema.prisma`: `BankItem` ganha `archivedAt DateTime?` (nullable, sem `@default`),
  com migration nova.
- `app/api/items/[id]/route.ts` (novo): `export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> })`
  — lê `id` de `await params`; chama `archiveBankItem(id)`; sucesso → 200 `ApiResponse<{ id, pluggyItemId, archivedAt }>`
  reconstruído campo a campo; `BankItemNotFoundError` → 404; qualquer outro erro → 500 genérico,
  sem vazar detalhe.
- `components/bank-items/ConnectBankButton.tsx` (`"use client"`, novo): botão "Conectar banco" →
  `POST /api/connect-token` → abre `<PluggyConnect connectToken={...} onSuccess={...} onError={...} />`
  (sem `includeSandbox`) → `onSuccess` chama `POST /api/items` com `{ pluggyItemId: itemData.item.id }`
  → `onError`/falha do connect-token mostram mensagem genérica fixa (nunca `error.message` bruto)
  e não persistem/logam o token.
- `components/bank-items/DeactivateBankButton.tsx` (`"use client"`, novo): recebe `bankItemId`,
  botão "Desativar" → `fetch(`/api/items/${bankItemId}`, { method: "DELETE" })`, estados de
  carregando/sucesso/erro tratado.
- `app/bancos/page.tsx` (Server Component, novo, **sem** `"use client"`): `async function BancosPage()`
  chama `listActiveBankItems()` direto (sem round-trip HTTP), renderiza `<ConnectBankButton />`
  e, por item, instituição + `state` + `<DeactivateBankButton bankItemId={item.id} />`; mensagem
  de estado vazio quando a lista estiver vazia.

### Mapeamento critério → teste

| # | Critério (seção 3) | Teste(s) |
|---|---|---|
| 1 | `BankItem.archivedAt DateTime?` nullable, com migration | `tests/unit/schema/bank-item-archived-at.test.ts` → `"model BankItem declara archivedAt como DateTime? (nullable)"`, `"archivedAt NAO e declarado com @default..."`, `"existe pelo menos uma migration cujo SQL adiciona a coluna archivedAt em BankItem"`; `tests/integration/schema.integration.test.ts` → `"BankItem.archivedAt - coluna nullable no Postgres real..." > "a coluna archivedAt existe, e nullable e do tipo timestamp"` e `"...um BankItem criado sem archivedAt persiste com o valor NULL..."` |
| 2 | `DELETE /api/items/[id]` existe, `ApiResponse<T>`, casca fina | `tests/unit/api/items-delete-route.test.ts` → todo o describe `"DELETE /api/items/[id] - sucesso (Criterio de aceite #2)"`; `tests/integration/api/items-delete.integration.test.ts` → `"deleta o Item na Pluggy e SO ENTAO arquiva o BankItem no Postgres, respondendo 200 (Criterio de aceite #2/#3)"` |
| 3 | **Ordem obrigatória** (Pluggy antes do arquivamento local); falha da Pluggy não muda nada localmente | `tests/unit/lib/bank-item-archive.test.ts` → describe `"archiveBankItem - ordem obrigatoria..."` (4 testes, incluindo o de `invocationCallOrder`); `tests/integration/bank-item-archive.integration.test.ts` → describe `"archiveBankItem - a ordem e obrigatoria e verificada no Postgres real..."` (3 testes, com re-consulta ao Postgres provando `archivedAt` continua `null`); `tests/integration/api/items-delete.integration.test.ts` → `"...quando a Pluggy falha (client.deleteItem rejeita com erro que NAO e 404), o BankItem continua ativo no Postgres..."` |
| 4 | 404 da Pluggy → arquivamento local bem-sucedido | **Shape real confirmado contra a API** (`{ message, code: 404, codeDescription: 'ITEM_NOT_FOUND', errorId }`, sem `statusCode`): `tests/unit/lib/pluggy.test.ts` → describe `"deleteItemFromPluggy - Item ja nao existe na Pluggy, shape REAL do erro (Criterio de aceite #4 da TASK-005)"` (2 testes, via `buildRealPluggyItemNotFoundError()`); `tests/integration/api/items-delete.integration.test.ts` → `"...quando a Pluggy responde com o shape REAL de Item ja inexistente (code: 404, codeDescription: 'ITEM_NOT_FOUND', SEM statusCode), o arquivamento local acontece mesmo assim (Criterio de aceite #4)"`. Camada de cima (não reconstrói o shape, mocka `deleteItemFromPluggy` como caixa-preta): `tests/unit/lib/bank-item-archive.test.ts` → describe `"archiveBankItem - Item ja nao existe na Pluggy (404 tratado como sucesso por deleteItemFromPluggy...)"` |
| 5 | Idempotência: desativar 2x não quebra nem altera `archivedAt` original | `tests/unit/lib/bank-item-archive.test.ts` → describe `"archiveBankItem - idempotencia (Criterio de aceite #5)"` (2 testes); `tests/integration/bank-item-archive.integration.test.ts` → `"desativar duas vezes nao quebra e preserva o archivedAt original"`; `tests/integration/api/items-delete.integration.test.ts` → `"chamar DELETE duas vezes seguidas para o mesmo BankItem e idempotente..."` |
| 6 | Listagem exclui arquivados; registro e relações continuam na base | `tests/unit/lib/bank-item-archive.test.ts` → describe `"listActiveBankItems - consulta somente BankItems ativos..."` (3 testes); `tests/integration/bank-item-archive.integration.test.ts` → describe `"listActiveBankItems - arquivados somem da listagem mas o registro e relacoes continuam na base (Criterio de aceite #6)"` (2 testes, consultando Account/Transaction direto no Prisma) |
| 7 | Widget testado com Testing Library (carregando, `onSuccess`→POST, `onError` tratado, connect-token falhando não abre o widget) | `tests/unit/components/connect-bank-button.test.tsx` — todos os describes: `"estado inicial e de carregando"`, `"widget abre com o Connect Token..."`, `"onSuccess chama POST /api/items..."`, `"onError mostra mensagem tratada..."`, `"falha de POST /api/connect-token: o widget NAO abre..."` |
| 8 | Página lista bancos com estado derivado e permite conectar/desativar | `tests/unit/app/bancos-page.test.tsx` (todos os testes); `tests/unit/components/deactivate-bank-button.test.tsx` (todos os testes) |
| 9 | Connect Token nunca logado nem persistido | `tests/unit/components/connect-bank-button.test.tsx` → describe `"o Connect Token nunca e logado nem persistido (Criterio de aceite #9)"` (console.\* espionado durante todo o fluxo + `Storage.prototype.setItem` espionado); reforçado pelos testes de `console.*` já existentes de `createConnectToken`/`fetchPluggyItem` em `tests/unit/lib/pluggy.test.ts` (TASK-003/004) |
| 10 | Sem `includeSandbox` | `tests/unit/components/connect-bank-button.test.tsx` → `"chama POST /api/connect-token e abre o widget com o accessToken retornado, sem includeSandbox (ADR 6, Criterio 10)"` (assere `include-sandbox-recebido` === `"undefined"`, ou seja, a prop nunca é passada) |
| 11 | Nenhum teste faz chamada de rede real; suíte roda sem `CLIENT_ID`/`CLIENT_SECRET` | Propriedade estrutural de toda a task: `pluggy-sdk` é sempre mockado (`vi.mock("pluggy-sdk", ...)` em `pluggy.test.ts` e `items-delete.integration.test.ts`) ou `@/lib/pluggy` é mockado inteiro (`bank-item-archive.test.ts`, `bank-item-archive.integration.test.ts`); `react-pluggy-connect` é sempre mockado (`connect-bank-button.test.tsx`); `fetch` global é sempre mockado nos testes de componente. `.env.test` mantém `CLIENT_ID`/`CLIENT_SECRET` vazios (herdado da TASK-003) e a suíte roda normalmente |
| 12 | Suíte verde sem regressão; build/lint limpos | Baseline confirmada nesta entrega: `npm test` roda **159/159** testes pré-existentes passando (nenhuma regressão) + 46 testes novos falhando pelo motivo certo (RED) + 3 suítes de componente falhando por módulo ainda inexistente (RED); `npm run lint` limpo (só 2 warnings pré-existentes em `coverage/`, nada relacionado a esta task). Cabe ao coder manter os 159 + fazer os novos passarem, e ao code-reviewer confirmar `npm run build`/`npm run lint` no final |

### Evidência de RED (rodado nesta entrega)

```
$ npm test
...
 Test Files  10 failed | 13 passed (23)
      Tests  46 failed | 159 passed (205)
```

Todas as 46 falhas + as 3 suítes que não carregam (`bancos-page`, `connect-bank-button`,
`deactivate-bank-button` — módulo/componente ainda não existe) falham por ausência de
implementação (`TypeError: X is not a function`, `Cannot find package '@/...'`,
`AssertionError` de schema/coluna ainda não migrada) — nenhuma por erro de sintaxe ou de setup
do próprio teste. Cada arquivo novo (exceto os que dependem de `prisma/schema.prisma`, que o qa
não pode alterar) foi adicionalmente validado GREEN com uma implementação-stub temporária,
depois revertida, provando que o RED é por ausência de implementação e não por teste mal
escrito.

### Evidência de RED pós-correção (shape real do 404 — rodado após a implementação do coder já existir)

Com a implementação do coder já em disco (seções 6/7 abaixo) e os mocks de 404 corrigidos para o
shape real confirmado contra a API:

```
$ npm test
...
 FAIL  tests/integration/api/items-delete.integration.test.ts > ... > quando a Pluggy responde
       com o shape REAL de Item ja inexistente (code: 404, codeDescription: 'ITEM_NOT_FOUND',
       SEM statusCode), o arquivamento local acontece mesmo assim (Criterio de aceite #4)
AssertionError: expected 500 to be 200

 FAIL  tests/unit/lib/pluggy.test.ts > ... > resolve (NAO rejeita) quando client.deleteItem
       rejeita com o shape real de 'item not found' (code: 404, codeDescription:
       'ITEM_NOT_FOUND', SEM statusCode)
AssertionError: promise rejected "PluggyItemDeleteError: ..." instead of resolving

 FAIL  tests/unit/lib/pluggy.test.ts > ... > nao chama console.log/warn/error quando trata o
       Item-nao-encontrado real como sucesso
PluggyItemDeleteError: Nao foi possivel desativar este banco. Tente novamente em instantes.

 Test Files  2 failed | 21 passed (23)
      Tests  3 failed | 219 passed (222)
```

Exatamente as 3 falhas esperadas, todas na mesma causa raiz: `lib/pluggy.ts` checa
`error.statusCode === 404`, que nunca é verdadeiro contra o shape real (`code`/`codeDescription`,
sem `statusCode`) — o mock agora reflete a realidade e expõe o bug de verdade, em vez de validar
a suposição errada que o passava antes. **Nenhuma regressão**: os outros 219 testes continuam
verdes, incluindo o teste de erro-genérico (não-404) que continua provando a direção crítica de
privacidade — **não arquivar** — com um mock também realista (sem `statusCode`, sem
`code: 404`/`codeDescription: 'ITEM_NOT_FOUND'`); e o teste de ordem-de-operações (critério 3)
continua verde. `npm run lint` seguiu limpo após a correção.

Cabe ao coder ajustar a checagem em `lib/pluggy.ts` (`deleteItemFromPluggy`) para reconhecer o
shape real (`codeDescription === 'ITEM_NOT_FOUND'` e/ou `code === 404`) em vez de `statusCode`.

## 6. Implementação (preenchido pelo coder)

### Arquivos criados

- `components/bank-items/ConnectBankButton.tsx` — widget "Conectar banco" (Criterio #7/#9/#10).
- `components/bank-items/DeactivateBankButton.tsx` — botao "Desativar" (Criterio #8).
- `app/bancos/page.tsx` — Server Component que lista bancos ativos (Criterio #8).
- `app/api/items/[id]/route.ts` — `DELETE /api/items/[id]` (Criterio #2).
- `prisma/migrations/20260725043613_add_archived_at_to_bank_item/migration.sql` — `ALTER TABLE "BankItem" ADD COLUMN "archivedAt" TIMESTAMP(3);` (Criterio #1, gerada com `prisma migrate dev` e aplicada no banco de teste com `npm run test:migrate`).

### Arquivos alterados

- `prisma/schema.prisma` — `BankItem` ganha `archivedAt DateTime?` (nullable, sem `@default`, DT-013).
- `lib/pluggy.ts` — `PluggyItemDeleteError` + `deleteItemFromPluggy(pluggyItemId)`: chama `client.deleteItem`, resolve em sucesso, resolve (trata como sucesso) quando o erro capturado é reconhecido por `isItemNotFoundError` (ver correção pós-revisão abaixo), e rejeita com `PluggyItemDeleteError` (mensagem fixa) em qualquer outra falha.
- `lib/bank-item.ts` — `BankItemNotFoundError`, `archiveBankItem(bankItemId)` (ordem obrigatoria: `findUnique` → curto-circuito se ja arquivado → `deleteItemFromPluggy` → `update`) e `listActiveBankItems()` (`findMany({ where: { archivedAt: null } })`, reconstruido campo a campo com `state`).

### Decisões tomadas

1. **Ordem de `archiveBankItem` (Criterio #3, o mais importante da task):** implementada exatamente como especificado — `deleteItemFromPluggy` é `await`ado sem try/catch ao redor; se rejeitar, a exceção propaga sem tocar `prisma.bankItem.update`, e o objeto de erro original (não um wrapper) chega ao chamador, como o teste unitário `"propaga o erro de deleteItemFromPluggy sem mascara-lo"` exige (`caughtError === pluggyError`, mesma referência).
2. **404 tratado dentro de `deleteItemFromPluggy`, não em `archiveBankItem`:** a detecção do "Item já não existe" fica inteiramente em `lib/pluggy.ts` (resolve em vez de rejeitar); `archiveBankItem` não sabe (nem precisa saber) que isso aconteceu — ele só vê uma Promise resolvida. Isso mantém a responsabilidade de traduzir formato de erro do SDK dentro do módulo que já conhece esse formato.
3. **`react-pluggy-connect` quebra `next build`/SSR e exigiu `next/dynamic` com `ssr: false`:** o RED original não cobria isso (nenhum teste de build está no escopo do qa). Descoberto ao rodar `npm run build`: `react-pluggy-connect/dist/main/version.js` executa `window.__REACT_PLUGGY_CONNECT_SDK_VERSION = ...` na avaliação do módulo (efeito colateral top-level, não dentro de uma função), o que lança `ReferenceError: window is not defined` durante o prerender de `/bancos` no Node (Server Components renderizam Client Components no servidor para gerar o HTML inicial). Resolvido importando `PluggyConnect` dinamicamente dentro de `ConnectBankButton.tsx` via `dynamic(() => import("react-pluggy-connect").then(m => m.PluggyConnect), { ssr: false })` — padrão documentado em `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` ("Skipping SSR") para bibliotecas que dependem de `window`. Os testes de Testing Library continuam passando sem alteração (o `vi.mock("react-pluggy-connect", ...)` intercepta o import dinâmico do mesmo jeito que interceptaria um import estático).
4. **`eslint-disable` no `DELETE` da rota:** não foi necessário (diferente de `app/api/health/route.ts`, DT-001) — a regra padrão `@typescript-eslint/no-unused-vars` usa `args: "after-used"`, que só acusa argumentos não usados que vêm *depois* do último argumento usado; como `context` (usado) vem depois de `request` (não usado), `request` fica isento.
5. **Migration gerada via `prisma migrate dev` contra o banco de dev (`gestor`, não o de teste)** e depois aplicada no banco de teste (`gestor_test`) via `npm run test:migrate` (`prisma migrate deploy`) — mesmo fluxo documentado nas tasks anteriores.

### Dívidas assumidas / achados

- **Achado reportado na primeira entrega (RESOLVIDO pelo qa, não por mim):** `tests/integration/bank-item-creation.integration.test.ts` (TASK-004) tinha uma asserção com a lista exaustiva das colunas de `BankItem` como defesa contra PII, que não incluía a nova `archivedAt` (legítima, não-PII, exigida pelo Criterio #1 desta task). Segui a regra de nunca editar arquivo de teste e reportei em vez de corrigir. O qa confirmou que era um tripwire deliberado e atualizou o próprio teste (`archivedAt` agora entra na lista, em ambos os pontos do arquivo) — `git log` mostra a alteração como commit separado do qa, não meu. Suíte atual: **222/222 verde**, essa falha não existe mais.
- `DT-006` (erros do SDK descartados sem registro) permanece válido para `deleteItemFromPluggy` também — nenhuma mudança de escopo aqui, só mais uma função no mesmo padrão.
- Não implementado (fora de escopo, conforme seção 4 da task): sync de Accounts/Transactions, `updateItem`, desarquivar pela UI, webhooks, autenticação, estilização.

### Correção pós-revisão (2026-07-25) — detecção real do 404 em `deleteItemFromPluggy`

O code-reviewer (seção 7 abaixo) identificou que a checagem original (`error.statusCode === 404`)
assumia um shape que o SDK instalado não produz — confirmado por leitura de
`node_modules/pluggy-sdk/dist/baseApi.js`: `deleteItem` rejeita HTTP errors com
`Promise.reject(error.response.body)`, ou seja, o corpo de erro cru da Pluggy, sem nenhum
`statusCode` no topo. O coordenador fez uma chamada real a `deleteItem` contra um Item inexistente
e confirmou o shape verdadeiro:

```
{ message: 'item not found', code: 404, codeDescription: 'ITEM_NOT_FOUND', errorId: '<uuid>' }
```

**Correção aplicada em `lib/pluggy.ts`:** substituí a checagem de `statusCode` por uma função
dedicada `isItemNotFoundError(error)`, que reconhece o erro por
`codeDescription === "ITEM_NOT_FOUND"` (discriminador principal, mais semântico e menos ambíguo —
`code` é reaproveitado pela Pluggy tanto para status HTTP quanto para códigos de erro próprios em
outros endpoints) **ou** `code === 404` (fallback numérico). `statusCode` não é mais consultado em
nenhum lugar do módulo. A checagem continua sendo `===` estrito contra valores específicos — um
500/timeout/erro de rede (sem `code`/`codeDescription` reconhecíveis) nunca casa e continua caindo
em `PluggyItemDeleteError`, preservando a garantia crítica de privacidade do Criterio #3 (a
direção perigosa — arquivar enquanto ainda compartilha — continua inalcançável).

O qa atualizou os mocks de 404 nos três arquivos afetados (`tests/unit/lib/pluggy.test.ts`,
`tests/unit/lib/bank-item-archive.test.ts` — via mock de `deleteItemFromPluggy` como caixa-preta,
não precisou mudar shape — e `tests/integration/api/items-delete.integration.test.ts`) para o
shape real; o teste de erro genérico (`Forbidden`, sem `code: 404`/`codeDescription`) também foi
ajustado para não ter `statusCode`, provando que a direção crítica continua coberta com um mock
realista. Não editei nenhum teste — só `lib/pluggy.ts`.

Resultado: `npm test` **222/222 verde** (nenhuma regressão), `npm run build` limpo (`/bancos`
prerenderiza), `npm run lint` limpo (`0 erros`), `npx tsc --noEmit` sem saída.

Arquivos alterados: `lib/pluggy.ts` (mais os listados acima) | Decisões tomadas: ver acima |
Dívidas assumidas: ver "Dívidas assumidas / achados" acima

## 7. Revisão (preenchido pelo code-reviewer)

**Veredito: APROVADO**

Revisei o diff completo (arquivos rastreados e não rastreados) contra a seção 11 da PREMISSA, o
`docs/DEBITO-TECNICO.md` e o código instalado de `pluggy-sdk`, `react-pluggy-connect` e Next 16.
Verifiquei os pontos críticos no código real, no Postgres e no SDK — não só pelos testes. A
suíte que rodei: **222/222 verde**, cobertura 98.35% stmts / 98.91% branches.

### 1. Ordem de operações ao desativar (critério 3 — privacidade)

**Não existe caminho em que `archivedAt` seja gravado sem a deleção na Pluggy ter resolvido.**
Verifiquei a sequência em `lib/bank-item.ts:archiveBankItem` linha a linha: `deleteItemFromPluggy`
é `await`ado **sem** try/catch ao redor; se rejeitar, a exceção propaga na mesma instrução e
`prisma.bankItem.update` (a única escrita de `archivedAt`) nunca é alcançado. Não há escrita
especulativa, não há `update` antes do `delete`, e `archivedAt` não tem `@default` no schema —
então nenhuma linha ganha `archivedAt` por outro caminho. O curto-circuito de idempotência
(passo 2) retorna antes de qualquer efeito. A ordem está correta e é fail-safe: o modo de
falha é "recusa arquivar", nunca "arquiva enquanto ainda compartilha". Critério 3 satisfeito.

### 2. Os dois casos de falha da Pluggy — **aqui está o achado principal (não-bloqueante)**

A **distinção 404-vs-resto é robusta contra o perigo que você levantou** (500 tratado como
404): a checagem é `statusCode === 404`, igualdade estrita numérica, não casamento de string.
Um 500, timeout ou erro de rede nunca produz `statusCode === 404`, então a direção perigosa —
arquivar indevidamente um banco que segue compartilhando — é inalcançável. Confirmei também que
timeouts/erros de rede do `got` não são `HTTPError` e rejeitam com o erro cru (sem `statusCode`),
caindo corretamente em `PluggyItemDeleteError`.

**Mas a detecção do 404 repousa sobre uma suposição de shape que o SDK instalado contradiz, e
que nenhum teste consegue validar.** Li `node_modules/pluggy-sdk/dist/baseApi.js`: `deleteItem`
→ `createDeleteRequest` → `createMutationRequest`, cujo `catch` faz
`return Promise.reject(error.response.body)` para qualquer `HTTPError` do `got` (e o `got` está
com `throwHttpErrors` default, então um 404 vira `HTTPError`). Ou seja, **o valor rejeitado é o
corpo JSON de erro da Pluggy, não um objeto com `statusCode` no topo.** `grep statusCode` em
todo o `dist/` do SDK só casa dentro do próprio `baseApi.js` (variável interna do `got`); nenhum
tipo de erro do SDK expõe um campo `statusCode`. Os testes (unit e integração) injetam
`{ statusCode: 404 }` no mock — exatamente o shape que o código espera — então passam sem provar
que o shape real bate. É a primeira vez no projeto que a forma exata do valor rejeitado pelo SDK
é **load-bearing** para controle de fluxo (em `fetchPluggyItem`/`createConnectToken` todo erro
virava o mesmo erro de domínio, então o shape era irrelevante; aqui ele decide resolver vs.
rejeitar).

Consequência provável em produção: se o corpo de erro 404 da Pluggy usa outro nome de campo
(ex.: `code`, comum em envelopes de erro de API), `statusCode` fica `undefined`, o 404 cai em
`PluggyItemDeleteError`, e o **critério 4 falha silenciosamente** — o usuário que desativa um
banco cujo Item a Pluggy já purgou fica preso no erro "tente novamente", sem nunca conseguir
arquivar. Não consigo confirmar o nome do campo a partir do código instalado (o SDK não tipa o
corpo de erro), e é justamente por isso que isto precisa de verificação contra a API real, não
de mais um teste com mock. A falha é degradação graciosa e fail-safe (nunca compromete a
privacidade do critério 3), por isso **não bloqueia** — mas deve virar DT e ser validada na
primeira deleção real, endurecendo a checagem para aceitar também o campo que a Pluggy de fato
retorna (ex.: `code === 404 || statusCode === 404`).

### 3. `next/dynamic({ ssr: false })` no widget

Correto para esta versão. `next/dynamic` com `ssr: false` é permitido porque o import está num
Client Component (`"use client"` em `ConnectBankButton.tsx`) — a restrição do Next 15/16 que
proíbe `ssr: false` vale para Server Components, não aqui. O diagnóstico do coder confere: li
`react-pluggy-connect/dist/main/version.js` e ele executa atribuição a `window` na avaliação do
módulo (efeito top-level), que quebraria o prerender de `/bancos` no Node — `ssr: false` adia o
import para o browser. **Confirmei que não há outra rota de import estático do widget:** um
`grep` por `react-pluggy-connect` em `app/` e `components/` retorna só as três ocorrências
dentro de `ConnectBankButton.tsx` (o import dinâmico e dois comentários). Nada mais importa o
widget, então nenhum Client Component o traz para o grafo de SSR por outro caminho.

### 4. Idempotência e corrida entre dois DELETE

**Idempotência sequencial (o caso real e o testado): correta.** Reproduzi no Postgres: a segunda
chamada após a primeira concluir bate no curto-circuito `if (bankItem.archivedAt)`, retorna o
`archivedAt` original **sem** chamar a Pluggy nem `update`. Preservação do timestamp confirmada.

**Corrida entre dois DELETE concorrentes: benigna.** Testei dois `archiveBankItem` do mesmo id
em paralelo (ambos passando o `findUnique` antes de qualquer `update`): 0 rejeições, **1 linha**,
banco arquivado. O único efeito observável é que os dois `update` correm e o `archivedAt` final
é o do último a gravar — no meu teste, diferença de 3 ms (`...164Z` vs `...167Z`). Nenhuma
duplicação, nenhum erro, nenhuma violação de privacidade; na corrida real, a segunda
`deleteItem` na Pluggy receberia 404 (Item já deletado) e seria tratada como sucesso. O
critério 5 fala de "desativar duas vezes" no sentido sequencial, que é o que o teste cobre e
está correto. A janela de sobrescrita do timestamp sob concorrência verdadeira é um detalhe
cosmético, não um defeito — registro como observação menor, não vale DT.

### 5. Frontend

Sem armadilhas bloqueantes. Verifiquei:
- **Connect Token nunca logado nem persistido:** vive só em `useState`; não há `console.*`,
  `localStorage` nem `sessionStorage` em nenhum dos componentes. É limpo (`setConnectToken(null)`)
  no `onSuccess` e no `onError`. `handleWidgetSuccess` envia apenas `itemData.item.id` ao
  `POST /api/items`, nunca o token.
- **`onError` não vaza detalhe:** o handler ignora o argumento de erro e mostra mensagem fixa
  genérica; idem para falha do connect-token e do DELETE — nenhum componente interpola
  `body.error`/`error.message` do backend.
- **Sem estado preso em loading:** ambos os componentes saem de `loading` para `error` em toda
  falha (inclusive rejeição de rede via `catch`), e o botão de retry reaparece (só fica
  `disabled` durante `loading`). Não há caminho que deixe o botão travado.
- `includeSandbox` ausente (ADR 6) e um teste assere isso explicitamente.

### Regressão e o tripwire da TASK-004

O único teste pré-existente alterado é `tests/integration/bank-item-creation.integration.test.ts`
(o achado que o coder reportou honestamente e não corrigiu, por ser arquivo de teste). A correção
aplicada — adicionar `archivedAt` à lista exaustiva de colunas — **fortalece** o tripwire em vez
de enfraquecê-lo: o comentário novo deixa explícito que a defesa primária contra PII é o
`JSON.stringify(row).not.toContain(FAKE_CPF)` (checagem de valor, imune a nome/quantidade de
coluna) e que o `deepEqual` de nomes é um alarme de mudança de schema que exige revisão humana —
foi ele que pegou `archivedAt`. `archivedAt` é legitimamente não-PII. Nenhuma asserção perdeu
poder de detecção. Os 159 testes anteriores seguem verdes.

### Problemas bloqueantes

Nenhum.

### Problemas não-bloqueantes — recomendo registrar como DT

1. **[VIRAR DT] Detecção de 404 em `deleteItemFromPluggy` assume um shape (`statusCode` no topo
   do valor rejeitado) que o SDK instalado não produz e que nenhum teste valida.** Detalhado no
   ponto 2 acima. O SDK rejeita HTTP errors com `error.response.body` (corpo JSON da Pluggy), e
   o campo `statusCode` não aparece em nenhum tipo de erro do SDK. Risco: critério 4 (404 →
   arquiva) falha silenciosamente em produção; o usuário fica preso ao tentar desativar um Item
   já purgado. Fail-safe quanto à privacidade (critério 3 intacto), por isso não bloqueia.
   Ação: verificar o corpo de erro real numa deleção 404 contra a API e endurecer a checagem
   (aceitar o campo real, ex.: `code`, além de `statusCode`). Vale notar que a mesma suposição
   de shape existe nos testes de 404/403 de `fetchPluggyItem` (TASK-003/004), mas lá era inócua
   porque todo erro colapsava no mesmo `PluggyItemFetchError` — só na TASK-005 o shape virou
   load-bearing.

2. **[VIRAR DT, baixa prioridade] A UI não reflete a mudança sem reload manual.** `app/bancos/page.tsx`
   é Server Component e a lista vem de `listActiveBankItems()` no servidor; após conectar
   (`ConnectBankButton`) ou desativar (`DeactivateBankButton`) nenhum dos dois chama
   `router.refresh()`, então o banco novo não aparece e o desativado não some da lista até um
   reload. `DeactivateBankButton` troca o botão por "Banco desativado com sucesso." localmente,
   o que mascara parte do problema, mas o `<li>` do banco continua na página. A seção 4 declara
   a UI como funcional, não final, então é aceitável para fechar a fase — mas é a primeira coisa
   a corrigir quando a UI evoluir (um `router.refresh()` nos dois handlers de sucesso resolve).

### Observações menores (não precisam virar DT)

- Corrida entre dois DELETE concorrentes sobrescreve `archivedAt` por alguns ms (ponto 4).
  Benigna: sem duplicação, sem erro, sem impacto de privacidade. Registro só para constar.
- `DT-006` (erros de fornecedor descartados sem log) agora se aplica também a
  `deleteItemFromPluggy` — mesmo padrão, sem mudança de escopo; não precisa de entrada nova,
  já está coberto pelo DT-006.

### Segurança e escopo

Sem achados de segurança. Nenhuma credencial hardcoded, nenhum `console.*` em produção, nenhum
`any` injustificado, nenhum `NEXT_PUBLIC_`. `deleteItemFromPluggy` reusa a validação de
credenciais e não instancia `PluggyClient` sem elas. As rotas são cascas finas de verdade
(a lógica vive em `lib/`), reconstroem `data` campo a campo (defesa em profundidade de PII) e
não confiam no tipo do erro capturado. `archivedAt` é nullable, sem `@default` (DT-013
respeitado — não repete o padrão da migration da TASK-004). Seção 4 respeitada: nada de sync de
`Account`/`Transaction`, nada de `updateItem`, nada de desarquivar pela UI, nada de webhook nem
auth. O DT-002 está de fato resolvido: existe agora um caminho de aplicação para desativar um
banco, preservando histórico (a listagem filtra por `archivedAt: null`, o registro e as
relações `Account`/`Transaction` continuam na base — provado por teste de integração que
reconsulta o Postgres).
