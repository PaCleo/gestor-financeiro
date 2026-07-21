# TASK-003 — Connect Token server-side
Status: CONCLUÍDA | Fase do roadmap: 1

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10**, **Prisma 7.9.0** com driver adapter, Postgres 16 em docker-compose,
  Vitest. Next 16 e Prisma 7 são **posteriores ao seu treinamento** — consulte
  `node_modules/next/dist/docs/01-app/` e `node_modules/prisma` antes de assumir qualquer API.
  O mesmo vale para o **`pluggy-sdk`**, já instalado: leia a tipagem real em
  `node_modules/pluggy-sdk` em vez de escrever de memória.
- Leia `docs/DEBITO-TECNICO.md` antes de reportar qualquer problema como novo.
- Leia a **seção 11 da PREMISSA** (mapeamento Pluggy → nosso modelo). Ela foi escrita a partir da
  documentação oficial e contém armadilhas confirmadas.
- **Nenhum teste automatizado pode chamar a API real da Pluggy.** As credenciais são de contas
  bancárias reais do usuário. Todo teste usa mock construído a partir do formato documentado.

## 1. Objetivo

Entregar o endpoint server-side que gera o Connect Token da Pluggy — o único dado que o frontend
pode receber. É o primeiro ponto do projeto onde as credenciais reais são usadas.

## 2. Comportamento esperado (TDD)

- DADO `CLIENT_ID` e `CLIENT_SECRET` configurados QUANDO chamo `POST /api/connect-token`
  ENTÃO recebo `200` com `{ success: true, data: { accessToken: "..." } }` no formato `ApiResponse<T>`
- DADO essa mesma resposta QUANDO inspeciono o corpo
  ENTÃO ele contém **apenas** o `accessToken` — nada de `CLIENT_ID`, `CLIENT_SECRET`, API Key
  da Pluggy ou qualquer outro campo do payload interno
- DADO `CLIENT_ID` ou `CLIENT_SECRET` ausentes QUANDO chamo o endpoint
  ENTÃO recebo `500` com `success: false` e mensagem genérica — **sem** citar qual variável falta
  nem vazar valor de credencial
- DADO que a Pluggy responde com erro (403, 500, timeout) QUANDO chamo o endpoint
  ENTÃO recebo um erro tratado no formato `ApiResponse<T>`, sem stack trace nem detalhe do SDK
- DADO um `clientUserId` informado QUANDO gero o token
  ENTÃO ele é repassado à Pluggy **dentro de `options`** (`options.clientUserId`), conforme a
  documentação — a seção 6.1 da premissa dizia errado, ver seção 11

## 3. Critérios de aceite

- [ ] 1. `POST /api/connect-token` existe e responde no formato `ApiResponse<T>`
- [ ] 2. A rota é **casca fina**: a integração com o `pluggy-sdk` vive em `lib/` (ex. `lib/pluggy.ts`)
- [ ] 3. Teste prova que a resposta de sucesso contém **somente** `accessToken` — asserção
      explícita de que `CLIENT_ID`, `CLIENT_SECRET` e API Key não aparecem em lugar nenhum do corpo
- [ ] 4. Teste prova que credenciais ausentes → `500` genérico, sem indicar qual variável falta
- [ ] 5. Teste cobre falha da Pluggy (erro HTTP e exceção do SDK) sem vazar stack trace
- [ ] 6. `clientUserId` é repassado em `options.clientUserId`
- [ ] 7. **Nenhum teste faz chamada de rede real** — o `pluggy-sdk` é mockado. Verificável: a suíte
      passa com a rede desligada e sem `CLIENT_ID`/`CLIENT_SECRET` no ambiente
- [ ] 8. Nenhum `console.log` de payload da Pluggy (o retorno contém dados financeiros reais)
- [ ] 9. Suíte inteira verde (os 30 testes anteriores sem regressão), `npm run build` e
      `npm run lint` limpos

## 4. Fora de escopo

- Widget `PluggyConnect` no frontend e qualquer UI
- `POST /api/items` e persistir o `BankItem` (próxima task)
- Sync de accounts/transactions, normalização de sinal, paginação (Fase 2 — ver DT-007 e DT-008)
- Modelagem de `status`/`executionStatus` do Item (DT-009, na task de persistir Item)
- Renovação/cache do token entre requisições
- Autenticação do nosso próprio app

## 5. Testes (preenchido pelo qa)

### Divergência encontrada entre a PREMISSA e o `pluggy-sdk` instalado (registrada, não é contradição)

A seção 11 da PREMISSA descreve `POST /connect_token` com header `X-API-KEY` e resposta
`{ accessToken }`, com `clientUserId` dentro de `options`. Conferi `node_modules/pluggy-sdk/dist/`
linha a linha antes de escrever qualquer mock:

- `client.js` → `createConnectToken(itemId, options)` faz
  `createPostRequest('connect_token', null, { itemId, options })` — **bate exatamente** com a
  premissa: `options.clientUserId`, não a raiz do body. Tipagem (`auth.d.ts`):
  `ConnectTokenOptions.clientUserId?: string`.
- `baseApi.js` mostra um detalhe que a premissa não tinha (não é divergência, é detalhe interno
  que os testes não precisam simular): o `X-API-KEY` usado em `/connect_token` **não é**
  `CLIENT_ID`/`CLIENT_SECRET` diretamente — o SDK primeiro troca as credenciais por um `apiKey`
  via `POST /auth` (`{ clientId, clientSecret, nonExpiring: false }`), cacheia esse `apiKey` (com
  checagem de expiração JWT) e só então o usa como `X-API-KEY` nas chamadas seguintes, incluindo
  `/connect_token`. Como a task manda mockar a `pluggy-sdk` **inteira**
  (`vi.mock("pluggy-sdk", ...)` no nível da classe `PluggyClient`), esse fluxo de dois passos
  nunca executa em teste — é encapsulado pelo SDK e nenhum teste precisa (nem deve) simular
  `/auth` separadamente.
- Achado relevante para o contrato do `lib/pluggy.ts` (documentado abaixo): `BaseApi` (chamado
  pelo `constructor` de `PluggyClient`) **lança sincronamente**
  `new Error('Missing authorization for API communication')` se `clientId`/`clientSecret` forem
  falsy — então mesmo que o coder não valide `CLIENT_ID`/`CLIENT_SECRET` antes de instanciar
  `PluggyClient`, um `try/catch` ao redor da instanciação + chamada captura esse erro também.
  Meus testes exigem `PluggyConfigError` independente de qual das duas estratégias (validar antes
  vs. deixar o SDK lançar e traduzir) o coder escolher — ver teste
  `"credenciais ausentes NUNCA chegam a instanciar o PluggyClient"`, que **prescreve** a
  estratégia de validar antes (não instanciar o `PluggyClient` em absoluto quando a config está
  ausente), por ser mais barata e mais clara sobre a intenção ("nem tentamos falar com a Pluggy
  sem credenciais").

### Contrato que os testes assumem (para o coder implementar exatamente assim)

**`lib/pluggy.ts`** (novo):

```ts
export class PluggyConfigError extends Error {}
export class PluggyConnectTokenError extends Error {}

export async function createConnectToken(
  clientUserId?: string,
): Promise<{ accessToken: string }>
```

- Lê `process.env.CLIENT_ID` e `process.env.CLIENT_SECRET`. Se qualquer um estiver **ausente
  OU for string vazia**, rejeita com `PluggyConfigError` — mensagem própria, fixa, genérica
  (ex.: "Não foi possível gerar o token de conexão."), que **não cita** `CLIENT_ID`,
  `CLIENT_SECRET` nem nenhum valor de credencial — **sem instanciar `PluggyClient`** nesse
  caminho (testável: o mock do construtor não deve ser chamado).
- Quando configurado: `const client = new PluggyClient({ clientId, clientSecret })` (import de
  `"pluggy-sdk"`), depois `client.createConnectToken(undefined, clientUserId ? { clientUserId }
  : undefined)` — **itemId sempre `undefined`** (não temos Item nesta task, ver seção 4);
  `clientUserId`, quando informado, vai **somente** dentro de `options.clientUserId`.
- Qualquer erro do SDK (exceção JS com `.message`/`.stack`, ou rejeição com um objeto plano que
  não é `instanceof Error` — formato real de erro HTTP do `baseApi.js`) é capturado e traduzido
  para `PluggyConnectTokenError` com mensagem própria, fixa, genérica — **nunca** interpolar
  `error.message` bruto do SDK (o mesmo motivo do `BankItemHasTransactionsError` da TASK-002:
  não dá para confiar que o texto do erro do fornecedor está limpo).
- O valor de retorno de sucesso é **sempre** `{ accessToken }` — mesmo que o objeto resolvido
  pelo SDK venha com campos extras (defesa em profundidade), a função devolve só essa chave.
- **Nenhum `console.log`/`console.warn`/`console.error`** em nenhum caminho (sucesso ou erro) —
  critério 8: o retorno contém dados que, numa chamada real, tocariam informação financeira.

**`app/api/connect-token/route.ts`** (novo):

```ts
export async function POST(request: Request): Promise<Response>
```

- Casca fina (critério 2): parseia o corpo (`request.json()`, tolerante a corpo ausente/vazio —
  `.catch(() => ({}))` ou equivalente) só para extrair `clientUserId?: string` opcional, chama
  `createConnectToken(clientUserId)` de `lib/pluggy.ts` e traduz o resultado/erro para
  `ApiResponse<T>`. Nenhuma lógica de credencial, nenhuma instância de `PluggyClient` na rota.
- Sucesso: `200` com `{ success: true, data: { accessToken } }` — **somente** essa chave em
  `data` (critério 3).
- Qualquer erro capturado (seja `PluggyConfigError`, `PluggyConnectTokenError`, ou qualquer outra
  coisa inesperada — a rota não deve confiar cegamente no tipo, mesmo padrão do
  `app/api/health/route.ts` da TASK-001, que também tem seu próprio `try/catch` "não confiando
  cegamente"): `500` com `success: false` e uma `error` string genérica. Não precisa distinguir
  a mensagem entre os dois tipos de erro (os testes não exigem mensagens diferentes por tipo),
  mas a mensagem **nunca** pode conter o texto bruto de `error.message` do erro capturado, nem
  stack trace.

### Arquivos de teste criados

- `tests/unit/lib/pluggy.test.ts` — unitário, mocka `pluggy-sdk` inteira via
  `vi.mock("pluggy-sdk", () => ({ PluggyClient: PluggyClientMock }))` (`vi.hoisted`). Nenhuma
  chamada de rede é possível: o módulo real do SDK (que usa `got` para bater em
  `https://api.pluggy.ai`) nunca é carregado. Cobre sucesso, repasse de `clientUserId` em
  `options`, credenciais ausentes/vazias (com asserção negativa de substrings), falha do SDK
  (exceção e rejeição não-`Error`), e ausência de `console.*`.
- `tests/unit/api/connect-token-route.test.ts` — unitário, mocka `@/lib/pluggy` inteira
  (`vi.mock("@/lib/pluggy", ...)`) — a rota nunca toca a `pluggy-sdk` real neste arquivo. Cobre
  sucesso com corpo mínimo (`ApiResponse<{ accessToken }>`), asserção explícita de que `data`
  contém somente `accessToken` (com lista de substrings proibidas), defesa contra campos extras
  vindos de `lib/pluggy.ts`, repasse de `clientUserId` do corpo da requisição, os dois caminhos
  de erro (config ausente / falha da Pluggy) sempre em `500` genérico, e ausência de
  `console.*`.

Nenhum teste de integração (Postgres) foi necessário nesta task — `/api/connect-token` não toca
o banco (fora de escopo: persistir o `BankItem` é a próxima task, seção 4).

### Lista de substrings proibidas usada nos dois arquivos (mesma técnica da TASK-002)

```
FAKE_CLIENT_ID, FAKE_CLIENT_SECRET (as credenciais fabricadas usadas nos testes de sucesso —
nunca credenciais reais), "CLIENT_ID", "CLIENT_SECRET", "X-API-KEY", "apiKey", "connect_token"
(rota), "process.env" (lib), "at Object.", "at async", ".ts:", ".js:", "node_modules"
```

### Verificação de que a suíte não faz chamada de rede real e não depende de credenciais reais (Critério 7)

Rodei a suíte inteira duas vezes nesta sessão, comparando byte a byte o resultado:

```bash
npm test                                          # via dotenv -e .env.test (CLIENT_ID/CLIENT_SECRET="" no arquivo)
env -u CLIENT_ID -u CLIENT_SECRET npm test        # variáveis nem existem no ambiente do processo
```

Resultado idêntico nas duas rodadas: **2 arquivos falhando, 8 passando (10 totais); 26 testes
falhando + 30 passando (56 totais)**, mesmas falhas, mesmo motivo. Isso prova que nenhum teste
depende de `CLIENT_ID`/`CLIENT_SECRET` estarem definidas no ambiente do processo — a suíte nem
tenta ler credenciais reais, porque `pluggy-sdk` está mockada no nível da classe `PluggyClient`
em todo teste que a toca. Não há como um teste "vazar" para a rede real: o `require`/`import` do
módulo real `pluggy-sdk` (que usa `got`) nunca é resolvido nos testes — só o mock é.

### Estado RED confirmado nesta sessão

`npm test` → **2 arquivos de teste novos falhando (26/26 testes novos falhando), os 8 arquivos /
30 testes anteriores (TASK-001 + TASK-002) continuam 100% verdes, sem nenhuma alteração nesses
arquivos**. `npx tsc --noEmit` confirma: as únicas 26 linhas de erro são `TS2307 Cannot find
module '@/lib/pluggy'` / `'@/app/api/connect-token/route'` — nenhum erro de sintaxe, nenhum erro
de tipo em qualquer outro arquivo. `npx eslint tests/unit/lib/pluggy.test.ts
tests/unit/api/connect-token-route.test.ts` → limpo, 0 erros/warnings.

### Correção pós-implementação (qa, após o coder reportar 49/56 com defeito de mock isolado)

O coder implementou `lib/pluggy.ts`/`app/api/connect-token/route.ts` seguindo o contrato à
risca (`new PluggyClient({ clientId, clientSecret })`, exatamente como a seção 5 prescreve) e
reportou 7 falhas, todas em `tests/unit/lib/pluggy.test.ts`, com uma investigação correta e
verificada por conta própria pelo orquestrador antes de me pedir a correção: o
`PluggyClientMock` em `vi.hoisted` usava `vi.fn().mockImplementation(() => ({...}))` — uma
**arrow function**. Arrow functions nunca são construíveis em JavaScript
(`Reflect.construct(() => {}, [])` lança `TypeError: ... is not a constructor`
incondicionalmente, em qualquer engine), e o `@vitest/spy` despacha uma chamada `new` sobre um
`vi.fn()` para `Reflect.construct(implementation, args, new.target)` usando a própria
implementation como alvo. Como o SDK real (`node_modules/pluggy-sdk/dist/client.js`) é
`class PluggyClient extends BaseApi`, o contrato corretamente exige `new` — então o defeito era
100% do mock, não da implementação. O coder acertou em não contornar isso trocando para uma
chamada sem `new` no lado de produção (o que faria a aplicação real quebrar na primeira chamada
verdadeira à Pluggy, já que classes ES2015 exigem `new`).

**Fix aplicado** em `tests/unit/lib/pluggy.test.ts` (única mudança; nenhuma asserção alterada):

```ts
// antes (arrow function - nao construivel)
const PluggyClientMock = vi.fn().mockImplementation(() => ({
  createConnectToken: createConnectTokenMock,
}));

// depois (function normal - construivel via `new`, como o SDK real exige)
const PluggyClientMock = vi.fn().mockImplementation(function () {
  return { createConnectToken: createConnectTokenMock };
});
```

**Verificação depois do fix:**

- `npm test` → **10/10 arquivos, 56/56 testes passando** (os 30 de TASK-001/TASK-002 + os 26
  novos desta task, incluindo os 15 de `pluggy.test.ts` e os 11 de
  `connect-token-route.test.ts`).
- `env -u CLIENT_ID -u CLIENT_SECRET npm test` → mesmo resultado, **56/56**, reconfirmando o
  Critério 7 (a suíte não depende de `CLIENT_ID`/`CLIENT_SECRET` reais no ambiente).
- `npx tsc --noEmit` e `npx eslint tests/unit/lib/pluggy.test.ts
  tests/unit/api/connect-token-route.test.ts` seguem limpos.

**Controle negativo — a suíte de segurança continua forte, não decorativa (verificação pedida
pelo orquestrador):** simulei a remoção da validação prévia de credenciais em `lib/pluggy.ts`
(experimento reversível: removi o bloco `if (!clientId || !clientSecret) { throw new
PluggyConfigError(); }`, rodei o teste, e reverti — `diff` contra o arquivo original confirmou
restauração byte-a-byte, `lib/pluggy.ts` do coder intocado no diff final). Sem o guard, com
`CLIENT_ID`/`CLIENT_SECRET` ausentes, o código passa a chamar
`new PluggyClient({ clientId: undefined, clientSecret: undefined })` — que **não lança** contra
o mock corrigido (ele aceita qualquer argumento, como o `PluggyClient` real aceitaria em tempo
de execução; só falharia de fato contra a API real). O teste
`"credenciais ausentes NUNCA chegam a instanciar o PluggyClient"` **detectou a regressão
corretamente**:

```
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
Received:
  1st vi.fn() call:
    Array [ Object { "clientId": undefined, "clientSecret": undefined } ]
❯ expect(PluggyClientMock).not.toHaveBeenCalled();
```

Ou seja, o teste **não** ficou trivialmente satisfeito pelo mock corrigido — ele continua
falhando exatamente quando deveria (guard ausente), e a razão de falhar é a asserção correta
(`PluggyClientMock` foi chamado), não uma consequência acidental de `rejects.toThrow()` (que,
sozinha, teria passado de qualquer forma, porque `result.accessToken` sobre `undefined` ainda
lançaria e seria traduzido para `PluggyConnectTokenError` pelo `catch` genérico — é exatamente
por isso que o teste faz as duas asserções extras sobre os mocks, não confia só no
`rejects.toThrow()`). Depois do experimento, restaurei `lib/pluggy.ts` para o estado exato
entregue pelo coder (`diff` vazio) e rodei a suíte inteira de novo: **56/56 verde**.

Nenhum outro teste de segurança (as asserções de `FORBIDDEN_SUBSTRINGS`, a defesa contra campos
extras no payload, os testes de `console.*`) foi afetado pelo fix do mock — o fix só corrigiu a
capacidade do mock de ser **construído**; nenhuma asserção de conteúdo/mensagem/substring foi
tocada, então nenhuma delas ficou mais fraca. Os 3 testes do describe "falha da Pluggy" que o
coder observou como "passando incidentalmente" (porque a falha de construção mascarava a causa
real, mas o tipo/mensagem do erro traduzido coincidia) agora passam pelo motivo genuíno: a
rejeição vem de fato de `client.createConnectToken(...)`, não da falha de `new PluggyClient(...)`.

### Correção pós-aprovação (revisão pós-implementação — 2 achados nos testes, sem bloqueante na implementação)

A revisão aprovou a TASK-003 sem bloqueantes, mas o reviewer encontrou dois problemas nos meus
testes (não no código de produção). Ambos corrigidos apenas em
`tests/unit/api/connect-token-route.test.ts`; `lib/pluggy.ts` e
`app/api/connect-token/route.ts` não foram tocados.

**1. Bug real encontrado pelo reviewer: corpo `null` quebra a rota sem tratamento.**

`request.json()` sobre o corpo literal `"null"` (JSON válido) **resolve** com `null` — não
rejeita. Confirmei isso isoladamente antes de escrever o teste (`node -e` com um `Request` real
via undici, fora do Vitest): `JSON.parse("null") === null`, e `.json()` do Web API devolve esse
valor normalmente, sem lançar. Como o parse do corpo em `app/api/connect-token/route.ts` fica
**fora** do `try/catch` (`const parsedBody = await request.json().catch(() => ({}))`), o
`.catch(() => ({}))` só reage a uma **rejeição** da promise, e `null` não rejeita — então
`parsedBody` vira `null`, e o acesso seguinte a `parsedBody.clientUserId` lança
`TypeError: Cannot read properties of null (reading 'clientUserId')` de dentro da função `POST`,
antes de qualquer `try`. O reviewer varreu manualmente os outros formatos (ausente, vazio, JSON
inválido, número, string, array, objeto) contra `next start` e confirmou que **todos** os outros
são absorvidos corretamente pelo `.catch()` ou pelo autobox de primitivos (`(42).clientUserId`,
`"str".clientUserId`, `[].clientUserId` são `undefined`, não lançam) — só `null` é especial,
porque é o único valor de JSON válido cujo acesso a propriedade lança em vez de retornar
`undefined`.

Adicionei dois testes novos a `tests/unit/api/connect-token-route.test.ts`:

- `describe("POST /api/connect-token - corpo null (bug encontrado na revisao pos-aprovacao)")`
  → 1 teste, **RED confirmado, pelo motivo certo**: `await POST(postRequest(null))` rejeita com
  o `TypeError` acima em vez de resolver para uma `Response`, então o teste falha antes mesmo de
  chegar à primeira asserção (`response.status`) — é o comportamento real quebrando, não um erro
  de digitação no teste. Depois da correção do coder (mover o parse do corpo para dentro do
  `try`, ou tratar `parsedBody === null` explicitamente antes do acesso), a rota deve devolver
  `500` tratado em `ApiResponse<T>`, sem `console.*`/stack trace vazando (a lista
  `FORBIDDEN_SUBSTRINGS` é checada no teste também).
- `describe("POST /api/connect-token - variedade de formatos de corpo (regressao automatizada da varredura do reviewer)")`
  → transforma a varredura manual do reviewer (ausente, vazio, JSON inválido, número, string,
  array, objeto) em `it.each` parametrizado, provando que a rota responde `200` tratado para
  cada um sem lançar exceção não tratada. Isso vira regressão automática — se algum desses
  formatos voltar a quebrar no futuro (ex.: um refactor que reintroduza acesso direto a uma
  propriedade sem guard), o teste pega, em vez de depender de alguém repetir a varredura manual.

**2. Asserção de segurança decorativa: `FORBIDDEN_SUBSTRINGS` rodando sobre payloads que nunca
poderiam conter os valores proibidos.**

Confirmei o diagnóstico do reviewer: em quase todos os testes de sucesso, `@/lib/pluggy` está
mockada e devolve só `{ accessToken: "..." }` — nenhum desses payloads jamais poderia conter
`FAKE_CLIENT_ID`, `"CLIENT_ID"`, `"X-API-KEY"` etc., então checar substrings ali prova ausência
de mecanismo (a string simplesmente não está em lugar nenhum do processo), não proteção da rota
contra vazamento. O único teste cujo payload mockado **de fato continha** um valor com formato
de credencial era o de "campos extras" (`clientId: FAKE_CLIENT_ID`), e justamente esse teste
**não** rodava o loop de substrings — só verificava `Object.keys(body.data)`.

**Correção aplicada** (sugestão do reviewer, seguida à risca): movi o loop de
`FORBIDDEN_SUBSTRINGS` para dentro desse teste específico, sobre o `rawBody` (texto bruto da
resposta, não o objeto já parseado), onde o valor perigoso realmente existe no payload mockado.
Também adicionei `clientSecret: FAKE_CLIENT_SECRET` ao payload mockado, para que **as duas**
credenciais fabricadas da lista tenham cobertura real (antes só `clientId` aparecia). Não toquei
a lista de substrings nos outros testes de sucesso (continuam lá — não fazem mal, só não
acrescentam garantia real; removê-las não foi pedido e não simplifica nada de relevante).

**Verificação de que a asserção reforçada tem capacidade real de detecção** (exatamente o que o
orquestrador pediu para confirmar): fiz um experimento reversível em
`app/api/connect-token/route.ts` — troquei `data: { accessToken }` por `data: result` (espalhando
o objeto inteiro devolvido por `createConnectToken`, incluindo os campos extras do mock), rodei
só esse teste, e o resultado foi falha **antes mesmo de chegar ao loop de substrings**, na
asserção `Object.keys(body.data)`:

```
AssertionError: expected [ 'accessToken', 'clientId', …(2) ] to deeply equal [ 'accessToken' ]
```

Para isolar se o loop de substrings **por si só** (sem depender da asserção de `Object.keys`)
também detecta o vazamento, criei um teste-escopo temporário e descartável (fora do arquivo
oficial, removido logo depois) com só o loop de substrings contra a mesma rota regredida — ele
também falhou, de forma independente:

```
AssertionError: expected '{"success":true,"data":{"accessToken"…' not to contain 'fake-client-id-para-teste-nao-e-crede…'
Received: "{"success":true,"data":{"accessToken":"token-abc-123","clientId":"fake-client-id-para-teste-nao-e-credencial-real"}}"
```

Ou seja: a asserção reforçada **não** é decorativa — ela (isoladamente, sem depender de nenhuma
outra checagem) detectaria uma regressão em que a rota devolvesse o payload de
`createConnectToken` sem reconstruir `{ accessToken }`. Depois do experimento, restaurei
`app/api/connect-token/route.ts` para o estado exato entregue pelo coder (`diff` byte a byte
contra uma cópia feita antes do experimento confirma restauração idêntica) e apaguei o
teste-escopo temporário — nenhum dos dois artefatos do experimento ficou no repositório.

**Registrado em `docs/DEBITO-TECNICO.md` pelo orquestrador/reviewer como DT-011** (asserções de
segurança verdes por construção) — meu fix resolve o caso específico apontado; o DT permanece
aberto como lembrete de padrão para tasks futuras ("toda asserção de não-vazamento precisa rodar
sobre um payload que realmente contenha o valor proibido").

**Estado da suíte depois das duas correções:**

`npm test` → **9 arquivos passam, 1 arquivo com 1 falha** (`63 passed / 1 failed`, de **64**
testes totais — os 56 anteriores + os 8 novos: 1 do bug de `null` (RED, correto) + 7 do
`it.each` de formatos). A única falha é a do `null`, pelo motivo certo (`TypeError` real, não
erro de sintaxe/import) — ver acima. `npx tsc --noEmit` limpo (0 erros — o módulo já existe
desde a implementação do coder, então não há mais `TS2307`). `npx eslint
tests/unit/api/connect-token-route.test.ts tests/unit/lib/pluggy.test.ts
app/api/connect-token/route.ts` → limpo, 0 erros/warnings. `app/api/connect-token/route.ts` e
`lib/pluggy.ts` continuam exatamente como o coder entregou (nenhum diff meu neles).

### Comandos para rodar

```bash
npm test                                                    # suite inteira (64 testes: 56 anteriores + 8 novos desta correcao pos-revisao)
npm test -- tests/unit/lib/pluggy.test.ts                   # so a lib
npm test -- tests/unit/api/connect-token-route.test.ts      # so a rota (inclui o teste RED do bug de corpo null)
npm run test:coverage                                       # cobertura v8, threshold 80% em lib/**, app/api/**/route.ts
npx tsc --noEmit                                             # confirma ausencia de erro de tipo/modulo
npx eslint tests/unit/lib/pluggy.test.ts tests/unit/api/connect-token-route.test.ts
```

### Mapeamento critério de aceite → teste

| Critério / Cenário (seção 2/3) | Arquivo | Teste(s) |
|---|---|---|
| 1. `POST /api/connect-token` existe, responde `ApiResponse<T>` | `tests/unit/api/connect-token-route.test.ts` | `"responde 200 com ApiResponse<{ accessToken }>"` |
| 2. Rota é casca fina; integração vive em `lib/pluggy.ts` | Implícito em todos os testes de `connect-token-route.test.ts` (mockam `@/lib/pluggy`; a rota só pode passar se de fato delegar a esse módulo) + `tests/unit/lib/pluggy.test.ts` (a lógica real mora e é testada aqui, isolada da rota) | Todos os testes de ambos os arquivos, coletivamente |
| 3. Resposta de sucesso contém **somente** `accessToken` — sem `CLIENT_ID`/`CLIENT_SECRET`/API Key | `tests/unit/api/connect-token-route.test.ts` | `"o corpo da resposta contem SOMENTE accessToken em data..."`, `"mesmo que lib/pluggy resolva com campos extras no payload (incluindo um valor com formato de credencial)..."` (reforçado na revisão pós-aprovação: agora roda o loop de `FORBIDDEN_SUBSTRINGS` sobre o payload que **de fato** contém `FAKE_CLIENT_ID`/`FAKE_CLIENT_SECRET` — verificação de que a asserção tem poder de detecção real documentada acima). Nível lib: `tests/unit/lib/pluggy.test.ts` → `"retorna somente accessToken mesmo se o SDK devolver campos extras..."` |
| Edge case (não numerado, achado na revisão pós-aprovação): corpo `null` não pode derrubar a rota sem tratamento | `tests/unit/api/connect-token-route.test.ts` | `"corpo JSON literal 'null' (JSON valido...) responde 500 tratado em ApiResponse<T>, sem lancar excecao nao tratada..."` (RED — bug real, ver seção de correção acima) |
| Edge case adicional: outros formatos de corpo (ausente, vazio, JSON inválido, número, string, array, objeto) não devem quebrar a rota | `tests/unit/api/connect-token-route.test.ts` | `it.each(OTHER_BODY_FORMATS)("corpo %s: responde 200 tratado em ApiResponse<T>, sem lancar excecao nao tratada")` — 7 casos, regressão automatizada da varredura manual do reviewer |
| 4. Credenciais ausentes → `500` genérico, sem citar a variável | `tests/unit/lib/pluggy.test.ts` | `"rejeita com PluggyConfigError quando CLIENT_ID esta ausente"`, `"...CLIENT_SECRET esta ausente"`, `"...string vazia"`, `"a mensagem do erro de config NAO cita CLIENT_ID/CLIENT_SECRET..."`. Nível rota: `tests/unit/api/connect-token-route.test.ts` → `"responde 500 com success:false e mensagem generica quando createConnectToken rejeita por config ausente..."` |
| 5. Falha da Pluggy (HTTP e exceção do SDK) sem stack trace | `tests/unit/lib/pluggy.test.ts` | `"traduz uma excecao lancada pelo SDK..."`, `"traduz uma rejeicao HTTP que nao e instancia de Error..."`, `"traduz uma falha 500 da Pluggy..."`. Nível rota: `tests/unit/api/connect-token-route.test.ts` → `"responde 500 tratado, sem stack trace nem detalhe do SDK..."`, `"responde 500 mesmo quando createConnectToken rejeita com um valor que nao e instancia de Error..."`, `"responde 500 tratado quando createConnectToken rejeita simulando uma falha 500..."` |
| 6. `clientUserId` repassado em `options.clientUserId` | `tests/unit/lib/pluggy.test.ts` | `"repassa clientUserId DENTRO de options, nao na raiz e nao como itemId"`, `"funciona sem clientUserId informado..."`. Nível rota: `tests/unit/api/connect-token-route.test.ts` → `"repassa o clientUserId do corpo da requisicao para createConnectToken..."`, `"funciona sem clientUserId no corpo..."` |
| 7. Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET` no ambiente | Toda a suíte (infra de mock) + verificação manual documentada acima (`npm test` vs. `env -u CLIENT_ID -u CLIENT_SECRET npm test`, resultado idêntico) | `tests/unit/lib/pluggy.test.ts` → `"credenciais ausentes NUNCA chegam a instanciar o PluggyClient..."` prova a garantia estrutural a nível de código; a verificação de ambiente acima prova a nível de processo |
| 8. Nenhum `console.log` de payload da Pluggy | `tests/unit/lib/pluggy.test.ts` | `"nao chama console.log/warn/error no caminho feliz..."`, `"...mesmo quando a Pluggy falha..."`. Nível rota: `tests/unit/api/connect-token-route.test.ts` → `"nao chama console.log/warn/error no caminho feliz..."`, `"...no caminho de erro..."` |
| 9. Suíte verde + `npm run build`/`npm run lint` limpos | Não é testável via Vitest para build/lint — comandos manuais que o coder/reviewer devem rodar ao final, mesmo padrão das tasks anteriores. A parte "suíte verde" é `npm test` (56/56 esperado após a implementação) | — |

Critérios de Item (`LOGIN_ERROR`/`OUTDATED`) e sync mencionados no prompt genérico do qa **não
se aplicam** a esta task — a seção 4 exclui explicitamente `POST /api/items`, persistência do
`BankItem` e qualquer sync (isso é a próxima task e a Fase 2, respectivamente). Este endpoint
não cria nem lê nenhum `Item` da Pluggy — só gera o Connect Token.

## 6. Implementação (preenchido pelo coder)

### Estado da suíte ao final

`npm test`: **9 arquivos passam, 1 arquivo com 7 falhas** (`49 passed / 7 failed`, de 56
testes totais — os 30 anteriores da TASK-001/TASK-002 e os 19 de
`tests/unit/api/connect-token-route.test.ts` estão 100% verdes; as 7 falhas são todas em
`tests/unit/lib/pluggy.test.ts`). **Não são falha de implementação** — analisadas em detalhe
abaixo, é um defeito genuíno no mock de `pluggy-sdk` do próprio arquivo de teste,
incompatível com a chamada `new PluggyClient(...)` que o contrato da seção 5 desta mesma task
prescreve literalmente. Não "hackeei" a implementação para fugir do `new` (ver justificativa).
`npx tsc --noEmit` limpo. `npm run lint` limpo (0 erros, 0 warnings). `npm run build` passa
**com e sem** `CLIENT_ID`/`CLIENT_SECRET`/`DATABASE_URL` no ambiente (verificado manualmente).

### Arquivos criados

- `lib/pluggy.ts` — `PluggyConfigError`, `PluggyConnectTokenError` e
  `createConnectToken(clientUserId?)`. Valida `CLIENT_ID`/`CLIENT_SECRET` de
  `process.env` **antes** de qualquer coisa (rejeita com `PluggyConfigError`, mensagem
  fixa/genérica, sem instanciar `PluggyClient`); quando configurado, `new PluggyClient({
  clientId, clientSecret })` e `client.createConnectToken(undefined, clientUserId ?
  { clientUserId } : undefined)` — `itemId` sempre `undefined`, `clientUserId` só dentro de
  `options`. Qualquer erro do SDK (instância de `Error` ou objeto plano de erro HTTP) vira
  `PluggyConnectTokenError` com mensagem fixa — nunca interpola `error.message` do SDK.
  Retorno sempre reconstruído como `{ accessToken: result.accessToken }` (nunca repassa o
  objeto resolvido inteiro). Nenhum `console.*` em nenhum caminho.
- `app/api/connect-token/route.ts` — `POST` casca fina: `request.json().catch(() => ({}))`
  para extrair `clientUserId` opcional (só aceito se `typeof === "string"`), chama
  `createConnectToken(clientUserId)`, traduz sucesso/erro para `ApiResponse<T>` (200 com
  `{ accessToken }` reconstruído / 500 genérico dentro de um `try/catch` que não confia
  cegamente no tipo do erro capturado, mesmo padrão de `app/api/health/route.ts`).

### ⚠️ Achado que preciso reportar em vez de contornar: mock de `pluggy-sdk` incompatível com `new PluggyClient(...)`

7 dos 15 testes de `tests/unit/lib/pluggy.test.ts` falham com a minha implementação — que
segue exatamente o contrato da seção 5 (`const client = new PluggyClient({ clientId,
clientSecret })`). Investiguei a fundo antes de reportar:

**Causa raiz (comprovada, não suposição):** o mock do arquivo de teste é

```ts
const PluggyClientMock = vi.fn().mockImplementation(() => ({
  createConnectToken: createConnectTokenMock,
}));
```

`() => ({...})` é uma **arrow function**. Arrow functions **nunca são construíveis** em
JavaScript — `Reflect.construct(arrowFn, args)` lança `TypeError: ... is not a constructor`
sempre, em qualquer engine, independente de qualquer coisa que meu código faça (reproduzi
isso num script Node puro, sem vitest nenhum, só para confirmar que não é peculiaridade do
mock/framework: `Reflect.construct(() => ({a:1}), [])` lança o mesmo erro). O
`@vitest/spy` (versão instalada, 4.1.10) — ao interceptar uma chamada feita com `new` a um
`vi.fn()` — despacha para `Reflect.construct(implementation, args, new.target)` usando a
própria função passada a `mockImplementation` como alvo do `construct`
(`node_modules/@vitest/spy/dist/index.js:309`). Como essa implementação é uma arrow
function, **qualquer código de produção que chame `new PluggyClient(...)` sobre esse mock
lança**, incondicionalmente — não há escolha de implementação minha que evite isso sem deixar
de usar `new`. O próprio Vitest documenta a causa no aviso que imprime:
`[vitest] The vi.fn() mock did not use 'function' or 'class' in its implementation`.

**Por que não contornei isso na implementação:** a única forma de fazer esses 7 testes
passarem seria chamar `PluggyClient({ clientId, clientSecret })` **sem** `new`. Isso
quebraria a aplicação de verdade: `pluggy-sdk` declara `PluggyClient`/`BaseApi` como
`class` nativa ES2015 (`node_modules/pluggy-sdk/dist/baseApi.js` — `class BaseApi {
constructor(params) {...} }`), e chamar uma `class` sem `new` lança
`TypeError: Class constructor BaseApi cannot be invoked without 'new'` em produção. Ou seja,
"consertar" o teste dessa forma trocaria uma falha de teste por um bug real na primeira
chamada de verdade à Pluggy — exatamente o tipo de "gaming" que a task proíbe. Mantive
`new PluggyClient(...)`, que é também o que a própria seção 5 prescreve literalmente.

**Quais dos 7 testes falham e por quê**, todos pelo mesmo motivo raiz (a construção lança
antes de qualquer lógica minha rodar, e meu `catch` genérico converte isso em
`PluggyConnectTokenError`, mascarando a causa real na asserção):
- `"retorna { accessToken } quando..."`, `"retorna somente accessToken mesmo se o SDK
  devolver campos extras..."`, `"funciona sem clientUserId informado..."` — esperam
  `resolves.toEqual(...)`, recebem uma rejeição.
- `"instancia o PluggyClient..."`, `"repassa clientUserId DENTRO de options..."` — o
  `await createConnectToken(...)` no início do teste já rejeita (sem `.catch`/`.rejects`),
  então o teste falha antes mesmo de chegar nas asserções sobre `PluggyClientMock`.
- `"nao chama console.log/warn/error no caminho feliz"` — mesma causa (rejeita antes das
  asserções de `console`).
- `"nao chama console.log/warn/error mesmo quando a Pluggy falha"` — este é o mais revelador:
  o teste usa `.catch(() => undefined)`, então tolera a rejeição, mas falha porque o
  **próprio Vitest** chama `console.warn(...)` internamente (visto acima,
  `@vitest/spy/dist/index.js:338`) para avisar sobre o problema do mock — e o `warnSpy` do
  teste captura esse aviso interno do framework, não nada emitido pelo meu código. Isso é
  evidência adicional de que a causa é o mock, não `lib/pluggy.ts`.

**Os outros 3 testes do describe "falha da Pluggy"** (`"traduz uma excecao lancada pelo
SDK..."`, `"traduz uma rejeicao HTTP que nao e instancia de Error..."`, `"traduz uma falha
500..."`) **passam incidentalmente** — eles só verificam o *tipo*/mensagem do erro traduzido
(`PluggyConnectTokenError`, sem substrings proibidas), então o fato de a exceção real vir da
falha de `new PluggyClient(...)` em vez de `client.createConnectToken(...)` não muda o
resultado observável desses testes específicos.

**Correção sugerida para o qa/orquestrador (verificada, não aplicada por mim ao arquivo de
teste):** trocar a arrow function por uma `function` no `mockImplementation` —

```ts
const PluggyClientMock = vi.fn().mockImplementation(function () {
  return { createConnectToken: createConnectTokenMock };
});
```

Reproduzi essa correção isoladamente (script Node fora do repositório, sem tocar no arquivo
de teste real) e confirmei que `Reflect.construct` funciona normalmente com uma `function`
comum, preservando exatamente as mesmas asserções e o mesmo objeto retornado — é uma
mudança de uma linha, sem alterar nenhuma expectativa do teste.

### Decisões tomadas (e por quê)

1. **Validar `CLIENT_ID`/`CLIENT_SECRET` antes de instanciar `PluggyClient`**, em vez de
   deixar o `BaseApi` do SDK lançar (`'Missing authorization for API communication'`) e
   traduzir esse erro. A seção 5 prescreve essa estratégia explicitamente
   ("`"credenciais ausentes NUNCA chegam a instanciar o PluggyClient"`, que prescreve a
   estratégia de validar antes"); também é mais barato (não monta o objeto de config nem
   entra no `try/catch` de rede para um erro que é puramente de configuração local).
2. **Reconstruir `{ accessToken: result.accessToken }` explicitamente**, tanto em
   `lib/pluggy.ts` quanto (defesa em profundidade) em `app/api/connect-token/route.ts` — em
   vez de repassar `result`/o retorno de `createConnectToken` inteiro. Isso é o que garante,
   estruturalmente, que nenhum campo extra (o SDK real devolve só `{ accessToken }`, mas o
   teste simula campos extras "por acidente") escape para a resposta HTTP (Critério 3).
3. **`catch` genérico e não-tipado em `lib/pluggy.ts`** (`catch { throw new
   PluggyConnectTokenError() }`) — cobre tanto exceções JS normais (`instanceof Error`)
   quanto rejeições com objeto plano de erro HTTP (não `instanceof Error`, formato real do
   `baseApi.js` do SDK para 4xx/5xx), sem precisar distinguir os dois casos, já que a
   mensagem de saída é a mesma de qualquer forma (Critério 5).
4. **Rota não distingue `PluggyConfigError` de `PluggyConnectTokenError`** na mensagem —
   ambas viram o mesmo 500 genérico. A seção 5 diz explicitamente que os testes não exigem
   mensagens diferentes por tipo; distinguir seria complexidade sem teste que a exija.
5. **`clientUserId` só é aceito do corpo se `typeof === "string"`** — proteção mínima contra
   corpo malformado (ex.: `{ clientUserId: 123 }`) sem introduzir Zod nesta task (nenhum
   teste exige validação de schema completa; a seção 4 não pede isso e a seção 5 não testa
   tipos inválidos de `clientUserId`).

### Dívidas assumidas / itens para o orquestrador

1. **Bloqueante para 100% verde, mas não é falha de implementação:** os 7 testes de
   `tests/unit/lib/pluggy.test.ts` documentados acima. Peço ao orquestrador/qa a correção de
   uma linha no mock (arrow function → `function`) descrita acima; não a apliquei eu mesmo
   por não poder editar arquivos de teste.
2. Nenhum `any` foi usado; nenhum `console.log`/`console.warn`/`console.error` foi usado em
   `lib/pluggy.ts` nem em `app/api/connect-token/route.ts`.
3. Nenhum débito técnico do `docs/DEBITO-TECNICO.md` foi tocado; nenhum novo débito foi
   introduzido por esta task além do achado do mock acima (que reporto aqui, não registro em
   `DEBITO-TECNICO.md` por ser um problema de teste, não de código de produção — decisão do
   orquestrador se quer catalogá-lo lá).

### Correção pós-aprovação: `request.json()` resolvendo com `null` (bug real, não vazamento)

**Estado ao entrar nesta correção:** o mock de `pluggy-sdk` já havia sido corrigido (arrow
function → `function` em `mockImplementation`, exatamente a mudança de uma linha sugerida
acima) — `npm test` já estava rodando 64 testes com 1 falha, isolada no bug abaixo.

**Bug:** em `app/api/connect-token/route.ts`, o parse do corpo (`await
request.json().catch(() => ({}))`) rodava **fora** do `try/catch` da rota. `request.json()`
**rejeita** para corpo ausente ou JSON malformado (o `.catch` cobria esses casos), mas
**resolve** com o valor `null` para o corpo JSON literal `"null"` — é JSON sintaticamente
válido, então não há rejeição nenhuma. Com `parsedBody === null`, a linha seguinte
(`parsedBody.clientUserId`) lançava `TypeError: Cannot read properties of null` **antes** do
`try` que envolve a chamada a `createConnectToken`, produzindo uma exceção não tratada que o
Next transformava numa resposta 500 com corpo vazio — quebrando o contrato `ApiResponse<T>`
do critério 1 mesmo sem vazar nada (por isso não bloqueou a aprovação, mas precisava de
correção).

**Correção aplicada:** movi o parse do corpo para **dentro** do `try`, e troquei
`.catch(() => ({}))` por `(await request.json().catch(() => null)) ?? {}`. Isso cobre os
três casos numa única expressão: (a) corpo ausente/JSON malformado → `request.json()`
rejeita → `.catch(() => null)` resolve com `null` → `?? {}` normaliza para objeto vazio;
(b) corpo JSON literal `null` → `request.json()` resolve com `null` diretamente → `?? {}`
normaliza da mesma forma; (c) qualquer outro corpo (número, string, array, objeto) passa
direto, e o acesso a `.clientUserId` num primitivo/array apenas retorna `undefined` (nunca
lança) — comportamento que já funcionava antes e que os 7 testes parametrizados de
`OTHER_BODY_FORMATS` cobrem. Com o parse dentro do `try`, qualquer falha nesse trecho agora
cai no mesmo `catch` genérico que já tratava as falhas de `createConnectToken`, preservando
o formato `ApiResponse<T>` (500, `success: false`, mensagem genérica) em **todo** caminho de
entrada, sem exceção.

**Verificação:** `npm test` → 64/64 verdes (os 10 arquivos, incluindo os 8 testes novos do
reviewer — 7 formatos de corpo parametrizados + o teste dedicado de corpo `null`). Rodei
`npm run build` com e sem `CLIENT_ID`/`CLIENT_SECRET`/`DATABASE_URL` no ambiente (mesmo
procedimento das tasks anteriores) e ambos passam limpos. `npm run lint` e `npx tsc --noEmit`
limpos.

## 7. Revisão (preenchido pelo code-reviewer)

**Veredito: APROVADO**

Revisei `lib/pluggy.ts`, `app/api/connect-token/route.ts` e os dois arquivos de teste, contra a
seção 11 da PREMISSA, o `docs/DEBITO-TECNICO.md` e o `pluggy-sdk` instalado. Não confiei no
relato: conferi a assinatura do SDK no código instalado e subi a aplicação em modo produção
para observar o comportamento real dos caminhos de erro.

### 1. Vazamento

Sem achados de exposição. O caminho de sucesso reconstrói `{ accessToken: result.accessToken }`
em **duas** camadas independentes (lib e rota), então nenhum campo extra do payload escapa —
e isso não é só afirmação: os testes injetam `clientId`/`internalDebug` no payload resolvido e
provam que `data` fica com uma única chave. Os dois erros de domínio têm mensagem fixa no
construtor, sem interpolar nada do SDK, e o `catch` da rota é cego ao tipo (`catch { }`), então
nem `PluggyConfigError`, nem `PluggyConnectTokenError`, nem um erro inesperado conseguem levar
texto próprio para a resposta. `CLIENT_ID`/`CLIENT_SECRET` são lidos só em `lib/pluggy.ts` e
nunca aparecem em nenhuma mensagem.

Testei especificamente o **erro inesperado que não é nenhum dos dois tipos de domínio**, como
pedido: encontrei um caminho — o único — em que a exceção escapa do `try/catch`. Ver
não-bloqueante 1. Subi `next start` e confirmei o que o cliente recebe nesse caso: **HTTP 500
com corpo vazio**, sem stack trace, sem nome de variável, sem credencial. Ou seja, o defeito é
de contrato, não de vazamento.

### 2. Chamada de rede em teste

Impossível, verificado estruturalmente. Só quatro arquivos do projeto mencionam "pluggy", e
dois deles (`tests/integration/schema.integration.test.ts`, `tests/fixtures/db.ts`) só casam
por causa dos campos Prisma `pluggyItemId`/`pluggyTransactionId` — não têm relação com o SDK.
Os dois que importam de verdade mockam no nível do módulo: `pluggy.test.ts` faz
`vi.mock("pluggy-sdk", factory)`, e `connect-token-route.test.ts` faz `vi.mock("@/lib/pluggy",
factory)`. Como ambos usam factory, o módulo real nunca chega a ser resolvido — `got` não é
carregado em nenhum ponto da suíte, e `https://api.pluggy.ai` é inalcançável por construção,
não por convenção. Some-se a isso a rodada `env -u CLIENT_ID -u CLIENT_SECRET` com resultado
idêntico: nenhum teste depende de credencial real.

### 3. Conformidade com o SDK instalado

Confere em todos os pontos que a suíte **não** exercita e que só quebrariam contra a API real:

- `client.d.ts:248` → `createConnectToken(itemId?: string, options?: ConnectTokenOptions)`. O
  coder chama `client.createConnectToken(undefined, options)` — `itemId` na primeira posição
  como `undefined`, `options` na segunda. Correto.
- `types/auth.d.ts:5` → `ConnectTokenOptions.clientUserId?: string`. O `clientUserId` vai
  **dentro de `options`**, batendo com a seção 11 da PREMISSA e com `client.js:369`
  (`createPostRequest('connect_token', null, { itemId, options })`). Critério 6 atendido de
  fato, não só no teste.
- `client.js:12` → `class PluggyClient extends BaseApi`, classe ES2015 nativa: exige `new`. O
  `new PluggyClient(...)` está correto, e **a recusa do coder em remover o `new` para fazer os
  7 testes passarem foi a decisão certa** — sem `new`, a aplicação lançaria
  `TypeError: Class constructor BaseApi cannot be invoked without 'new'` na primeira chamada
  real, e a suíte estaria verde escondendo isso.
- `baseApi.js:45-55` → o construtor recebe `{ clientId, clientSecret }` (exatamente o objeto
  passado) e lança `'Missing authorization for API communication'` se qualquer um for falsy —
  a afirmação do qa na seção 5 procede. A validação prévia do coder torna esse caminho
  inalcançável, o que é a escolha mais segura: nunca se chega a montar um client sem credencial.

### 4. Qualidade das asserções de segurança

O controle negativo do qa é genuíno e o teste `"credenciais ausentes NUNCA chegam a instanciar
o PluggyClient"` tem capacidade real de detecção. Fui procurar outras asserções na condição que
o orquestrador descreveu e **encontrei uma classe delas** — ver não-bloqueante 2. As demais
resistem ao teste de "isso falharia se a proteção sumisse": `Object.keys(body.data)` com
payload contendo campos extras, `not.toContain("ETIMEDOUT")` sobre um erro com mensagem
poluída, os spies de `console.*`, e a checagem de substrings sobre a mensagem do
`PluggyConfigError` (falharia no instante em que alguém escrevesse "CLIENT_ID não configurada").

### Suíte

Rodei `npm run test:coverage`: **56/56 verde**, 98.33% stmts / 95.83% branches / 92.85% funcs.
Os 30 testes anteriores continuam intactos e verdes. `/api/connect-token` sai como `ƒ Dynamic`
no build.

### Problemas bloqueantes

Nenhum.

### Problemas não-bloqueantes

1. **[VIRAR DT, ou corrigir agora — é uma linha] `app/api/connect-token/route.ts:25-31` — o
   parse do corpo está FORA do `try/catch`, e um corpo JSON `null` derruba o handler.**
   `request.json()` resolve com `null` (JSON válido), o `.catch(() => ({}))` não dispara
   porque não houve rejeição, e `parsedBody.clientUserId` lança
   `TypeError: Cannot read properties of null` antes do `try` da linha 33. Varri os formatos de
   corpo: ausente, vazio, JSON inválido, número, string, array e objeto — todos são tratados
   corretamente; **só `null` escapa**. Confirmei o impacto real subindo `next start`:
   `curl -X POST ... -d 'null'` devolve **HTTP 500 com corpo vazio**. Não vaza nada (por isso
   não bloqueia), mas quebra o critério 1 para essa entrada: a resposta não é `ApiResponse<T>`,
   e um frontend fazendo `res.json()` recebe erro de parse em vez do erro tratado. Nenhum teste
   cobre esse caso — o helper `postRequest` nunca é chamado com `null`. Correção: mover o parse
   para dentro do `try`, ou `const parsedBody = (await request.json().catch(() => null)) ?? {}`.

2. **[VIRAR DT] Asserções de segurança verdes por construção em
   `tests/unit/api/connect-token-route.test.ts`.** Respondendo diretamente à pergunta: sim, há
   outras além do `rejects.toThrow()` já identificado. No teste da rota, `@/lib/pluggy` está
   mockada e a rota nunca lê `process.env` — não existe mecanismo pelo qual `FAKE_CLIENT_ID`,
   `"CLIENT_ID"`, `"CLIENT_SECRET"`, `"X-API-KEY"`, `"apiKey"` ou `"connect_token"` possam
   aparecer no corpo. Essas entradas da `FORBIDDEN_SUBSTRINGS` rodam apenas contra payloads que
   jamais poderiam contê-las, então passam por ausência de mecanismo, não por proteção.
   O detalhe que fecha o diagnóstico: **o único teste cujo payload realmente contém um valor
   com formato de credencial** (`"mesmo que lib/pluggy resolva com campos extras..."`, que
   injeta `clientId: FAKE_CLIENT_ID`) **é justamente o que não roda a checagem de substrings** —
   ele só assere `Object.keys(body.data)`. A propriedade continua protegida (o `Object.keys`
   pegaria um `data: result` espalhado), mas a lista de substrings ali é decorativa. Conversão
   barata em asserção viva: adicionar o loop de `FORBIDDEN_SUBSTRINGS` sobre o `rawBody` nesse
   teste de campos extras. No `pluggy.test.ts` o problema não existe — lá as credenciais estão
   de fato em `process.env` quando a asserção roda.

3. **[Estender DT-006, não criar DT novo] `lib/pluggy.ts:68` descarta o erro original do SDK.**
   É o mesmo trade-off já catalogado para `lib/bank-item.ts`: necessário para não confiar no
   texto do fornecedor, mas agora falhas de rede/403/timeout da Pluggy também ficam sem
   qualquer registro server-side, o que torna diagnóstico de "não consigo conectar meu banco"
   quase impossível. O DT-006 hoje cita só `lib/bank-item.ts`; sugiro ampliá-lo para cobrir
   `lib/pluggy.ts`, já que a solução é a mesma (logar o original quando houver logger).

### Observação menor (não precisa virar DT)

`baseApi.js:47-48` mostra que o SDK honra `process.env.PLUGGY_API_URL` como base URL, com
fallback para `https://api.pluggy.ai`. Não é problema do código do coder e não há uso indevido
aqui, mas vale saber que essa variável redireciona para onde as credenciais reais são enviadas:
ela nunca deve ser definida a partir de configuração não confiável, e não deve entrar no
`.env.example` como algo ajustável.

### Segurança e escopo

Nenhuma credencial hardcoded; as do teste são strings fabricadas e explicitamente rotuladas.
Nenhum `console.*` em produção (e há teste ativo para os dois caminhos). Nenhum `any`. Nenhum
`NEXT_PUBLIC_`. A rota é casca fina de verdade: não instancia `PluggyClient`, não lê
`process.env`, não decide nada sobre credencial. Seção 4 respeitada — nada de widget, nada de
`POST /api/items`, nada de sync, nada de cache de token. Os DTs de Fase 2 (DT-007 sinal do
`amount`, DT-008 paginação) e o DT-009 seguem intocados, corretamente fora desta task.
