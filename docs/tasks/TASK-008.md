# TASK-008 — Regras de categorização por CPF/CNPJ
Status: CONCLUÍDA | Fase do roadmap: 2 (extensão — DT-019)

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16, Vitest,
  Testing Library. Todos posteriores ao seu treinamento — consulte a documentação instalada.
- Leia `docs/DEBITO-TECNICO.md` (**DT-019** é o desenho desta task; **DT-017** é a regra de PII que
  ela NÃO pode violar) e a **seção 11 da PREMISSA** (formato real do `paymentData`).
- Já existem: `lib/sync.ts`, `lib/pluggy.ts` (que hoje **descarta** o `documentNumber`),
  `lib/transactions.ts` (`resolveTransactionCategory`), a página `/bancos` (padrão de UI + testes).
- **DT-004**: `vi.spyOn(prisma, ...)` é engolido pelo Proxy. Mocke módulos inteiros.
- **Regra de migration (permanente):** coluna nova em tabela com dados = nullable ou com default.
  `Transaction.categoryFromRule` é nullable; a tabela já tem 432 linhas reais.

## 1. Objetivo

Permitir que o usuário associe um CPF/CNPJ a uma categoria ("CNPJ do mercado → Mercado"). No sync,
uma transação cuja contraparte casa com uma regra recebe a categoria da regra — **sem nunca
persistir o documento**. Implementa a precedência: `categoryOverride` → **regra** → `category` Pluggy.

## 2. A regra de ouro desta task (privacidade)

O documento (CPF/CNPJ) **nunca** é persistido nem logado — nem na transação, nem em lugar nenhum.
A tabela de regras guarda o **hash** do documento, não o documento. O casamento é **hash contra
hash**. No sync, o `lib/pluggy.ts` calcula o hash da contraparte **dentro da própria função** e só
deixa sair o hash — o documento cru morre ali. Esta task **não pode** reintroduzir a PII que o
DT-017 removeu: depois do sync, `SELECT` nenhum pode achar um CPF/CNPJ em qualquer coluna.

## 3. Comportamento esperado (TDD)

### Cadastro de regras
- DADO um CPF/CNPJ e uma categoria QUANDO crio uma regra ENTÃO é persistida o **hash** do documento
  (normalizado: só dígitos) + a categoria + um rótulo opcional — **nunca o documento cru**
- DADO o mesmo documento cadastrado de novo QUANDO crio ENTÃO a regra existente é **atualizada**
  (upsert por hash), não duplicada
- DADO uma lista de regras QUANDO a exibo ENTÃO mostro rótulo + categoria (o documento não existe
  para exibir — por isso o rótulo importa)
- DADO uma regra QUANDO a removo ENTÃO ela some e transações já categorizadas por ela não são afetadas retroativamente

### Aplicação no sync
- DADO uma transação cuja contraparte (`paymentData.payer` **ou** `.receiver`) casa com uma regra
  QUANDO sincronizo ENTÃO `categoryFromRule` recebe a categoria da regra
- DADO uma transação sem contraparte que case QUANDO sincronizo ENTÃO `categoryFromRule` fica `null`
- DADO uma regra criada **depois** de um sync QUANDO re-sincronizo ENTÃO a transação passa a ter a
  categoria da regra (consequência aceita do DT-019: aplica no próximo sync, não retroativo isolado)
- DADO qualquer sync QUANDO termina ENTÃO **nenhum** CPF/CNPJ aparece em qualquer coluna de `Transaction`

### Resolução da categoria efetiva
- DADO override, regra e categoria Pluggy QUANDO resolvo ENTÃO a precedência é
  `categoryOverride ?? categoryFromRule ?? category`; teste cobre cada nível vencendo

## 4. Critérios de aceite

- [ ] 1. Model `CategoryRule` (`documentHash @unique`, `category`, `label String?`, timestamps).
      `Transaction.categoryFromRule String?` (nullable). Migration segura em tabela com dados
- [ ] 2. `lib/category-rules.ts` expõe `hashDocument(raw)` — normaliza (só dígitos) e aplica **SHA-256**
      (hex). É a **única** função de hash; usada tanto no cadastro quanto no sync, senão nunca casa
- [ ] 3. `POST /api/category-rules` ({ document, category, label? }): valida com Zod, **hasheia** e
      faz upsert por `documentHash`. A resposta **nunca** ecoa o documento cru. Casca fina
- [ ] 4. `GET /api/category-rules` (lista: id, label, category — sem documento) e
      `DELETE /api/category-rules/[id]`
- [ ] 5. `lib/pluggy.ts`: `fetchPluggyAllTransactions` passa a expor, por transação,
      `counterpartyDocumentHashes: string[]` (hash de payer/receiver presentes), calculado **na
      própria função**; o documento cru é descartado ali e **nunca** entra no objeto retornado
- [ ] 6. `lib/sync.ts`: usa os hashes para buscar `CategoryRule` e preencher `categoryFromRule`;
      re-aplica a cada sync. **Nunca** grava documento
- [ ] 7. **Teste de PII (o mais importante):** após um sync com `paymentData` contendo CPF/CNPJ
      fabricados que **realmente aparecem** no payload de entrada, provar por valor que nenhum deles
      está em qualquer coluna de `Transaction` — e que o `counterpartyDocumentHashes` são hashes, não
      documentos (lição DT-011). Idem: a resposta dos endpoints de regra nunca contém o documento
- [ ] 8. `resolveTransactionCategory` atualizada para `categoryOverride ?? categoryFromRule ?? category`;
      teste cobre os três níveis. A tela `/transacoes` reflete a categoria efetiva
- [ ] 9. Página de gestão de regras (ex. `/categorias`): lista, adiciona (documento + categoria +
      rótulo) e remove. Testada com Testing Library
- [ ] 10. Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 11. Nenhum `console.*` em produção (e **jamais** logar documento)
- [ ] 12. Suíte inteira verde (os anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 5. Fora de escopo

- Reaplicar regra retroativamente sem re-sync (aceito no DT-019 — o sync diário reprocessa)
- Editar `categoryOverride` por transação pela tela (task própria, se desejado)
- Totais/dashboard por categoria (Fase 5)
- Regra por descrição/merchant (só por documento nesta task)

## 6. Testes (preenchido pelo qa)

### Arquivos criados

- `tests/unit/lib/category-rules.test.ts` — unitário de `hashDocument` (puro) +
  `upsertCategoryRule`/`listCategoryRules`/`deleteCategoryRule`/`getCategoryRuleHashMap`
  (`@/lib/db` mockado por inteiro, DT-004).
- `tests/integration/category-rules.integration.test.ts` — mesmas funções contra
  o Postgres real (`gestor_test`); prova por VALOR que o documento nunca é
  persistido.
- `tests/unit/schema/category-rule.test.ts` — estrutural (regex no
  `schema.prisma`): `CategoryRule.documentHash @unique`, `category`, `label
  String?`, `Transaction.categoryFromRule String?`.
- `tests/unit/api/category-rules-route.test.ts` — `POST`/`GET
  /api/category-rules` (`@/lib/category-rules` mockado via `importOriginal`,
  preservando o `categoryRuleInputSchema` real — mesmo padrão de
  `transactions-route.test.ts`).
- `tests/unit/api/category-rules-delete-route.test.ts` — `DELETE
  /api/category-rules/[id]`.
- `tests/unit/components/add-category-rule-form.test.tsx` — formulário de
  cadastro (Testing Library, jsdom).
- `tests/unit/components/delete-category-rule-button.test.tsx` — botão de
  remoção (Testing Library, jsdom).
- `tests/unit/app/categorias-page.test.tsx` — página `/categorias` (Server
  Component, Testing Library, jsdom).

### Arquivos estendidos (contrato de módulos já existentes muda nesta task)

- `lib/pluggy.ts` — `PluggyRawTransaction` ganha `counterpartyDocumentHashes:
  string[]`. Testes novos/alterados em `tests/unit/lib/pluggy.test.ts`
  (describe `fetchPluggyAllTransactions - counterpartyDocumentHashes`, e o
  teste "extrai SOMENTE..." que agora inclui a chave nova no
  `Object.keys`).
- `lib/sync.ts` — `syncBankItem` resolve `categoryFromRule` via
  `getCategoryRuleHashMap`. Testes novos em `tests/unit/lib/sync.test.ts`
  (describe `syncBankItem - categoryFromRule via hash da contraparte`) e em
  `tests/integration/sync.integration.test.ts` (dois describes novos no fim
  do arquivo, incluindo **o teste de PII crítico**, critério 7).
- `lib/transactions.ts` — `resolveTransactionCategory` ganha o 3º nível
  (`categoryFromRule`). Describe reescrito em
  `tests/unit/lib/transactions.test.ts` e novo describe em
  `tests/integration/transactions.integration.test.ts`.
- `prisma/schema.prisma` — novo model `CategoryRule` +
  `Transaction.categoryFromRule`. Coberto por
  `tests/unit/schema/category-rule.test.ts` (estrutural) e por dois
  describes novos no fim de `tests/integration/schema.integration.test.ts`
  (Postgres real: colunas, `UNIQUE` de `documentHash`).
- `tests/fixtures/db.ts` — `buildTransaction` ganha `categoryFromRule:
  undefined` (mesmo truque de `status`/`balance`); novo `buildCategoryRule`.
- `tests/fixtures/pluggy.ts` — novo `KNOWN_SHA256_HEX_CPF`/`KNOWN_SHA256_HEX_CNPJ`
  (valores de referência calculados de forma independente, para o teste de
  `hashDocument` ter poder de detecção real — DT-011).
- `tests/setup/reset-db.ts` — novo `resetCategoryRuleTable` (função
  **separada** de `resetDatabase`; `CategoryRule` **não** entra em
  `ALL_TABLES` para não quebrar os testes de integração já existentes antes
  da migration desta task existir — ver comentário no arquivo).

### Comandos para rodar

```bash
# Suíte inteira (requer `docker compose up -d` já rodando — gestor_test):
npm test

# Só os arquivos desta task:
npx dotenv -e .env.test -- npx vitest run \
  tests/unit/lib/category-rules.test.ts \
  tests/integration/category-rules.integration.test.ts \
  tests/unit/schema/category-rule.test.ts \
  tests/unit/api/category-rules-route.test.ts \
  tests/unit/api/category-rules-delete-route.test.ts \
  tests/unit/components/add-category-rule-form.test.tsx \
  tests/unit/components/delete-category-rule-button.test.tsx \
  tests/unit/app/categorias-page.test.tsx \
  tests/unit/lib/pluggy.test.ts \
  tests/unit/lib/sync.test.ts \
  tests/unit/lib/transactions.test.ts \
  tests/integration/sync.integration.test.ts \
  tests/integration/transactions.integration.test.ts \
  tests/integration/schema.integration.test.ts
```

**Estado RED confirmado (2026-08-18):** `npm test` → **41 arquivos, 508
testes, 105 falhando, 403 passando, ZERO regressão** nos testes
pré-existentes (verificado arquivo a arquivo: os 27 arquivos totalmente
não tocados por esta task somam 234/234 verdes; os 6 arquivos estendidos
mantêm 100% dos testes anteriores verdes, só as asserções NOVAS falham).
As 3 suítes `.tsx` novas (`add-category-rule-form`, `delete-category-rule-button`,
`categorias-page`) falham **no nível do arquivo inteiro** ("Failed to
resolve import ... Does the file exist?") — comportamento normal do Vite
para `import()` dinâmico dentro de `.tsx` apontando para um componente que
ainda não existe (a resolução é estática, ao contrário de `.ts` puro, onde
o `import()` falha em runtime por teste). Resolve sozinho assim que os
componentes existirem.

**Correção pós-implementação (2026-08-18), achado do coordenador:** depois
do coder implementar, `524/525` testes passavam — o único vermelho era
`tests/unit/schema/category-rule.test.ts`, e era um teste MEU quebrado, não
um bug do coder. O `it.each` de PII usava o padrão `document\w*` sem
exceção, que casava também com o campo **legítimo** `documentHash` (o
próprio campo que o Critério 1 exige). Ele se contradizia com o teste
`"CategoryRule.documentHash existe e e @unique"` do mesmo arquivo — os dois
nunca poderiam passar juntos. O coder corretamente não tentou contornar
(nem renomeando `documentHash` nem editando meu teste) e parou.

Corrigido em `tests/unit/schema/category-rule.test.ts`: a entrada
`"document"` do `it.each` agora usa um negative lookahead
(`document(?!Hash\b)\w*`) que exclui SOMENTE `documentHash`, mantendo a
detecção de qualquer outro campo (`document`, `documentNumber`,
`documentRaw`, etc.). Para não deixar o tripwire "decorativo" (lição
DT-011), adicionei 2 testes de CONTROLE que rodam o mesmo padrão contra
blocos de schema sintéticos: um prova que `documentNumber String`
hipotético AINDA reprova, o outro prova que `documentHash String @unique`
passa. Nenhum código de produção foi tocado.

**Estado final confirmado (2026-08-18):** `npm test` → **41 arquivos, 527
testes, 527 passando, 0 falhando** (525 da implementação do coder + 2 testes
de controle novos desta correção). `npx eslint tests/unit/schema/category-rule.test.ts`
limpo (0 erros/warnings).

**Correção de HONESTIDADE pós-aprovação (2026-08-18), achado do coordenador
via sondagem real — registrado como DT-021:** a TASK-008 foi APROVADA; esta
é uma correção de precisão do teste, não de funcionalidade. Sondagem real
revelou que a Pluggy embute CPF/CNPJ e nome da contraparte em **texto
livre** de `transaction.description` para algumas transações reais (ex.
PIX recebido) — vetor pré-existente da TASK-006, ortogonal a esta task, sem
scrub (ver DT-021 em `docs/DEBITO-TECNICO.md`).

O teste de PII crítico (critério 7) em
`tests/integration/sync.integration.test.ts` se intitulava "CPF/CNPJ jamais
persistido em **nenhuma coluna** de Transaction" e varria a tabela inteira
— mas a fixture só injeta o documento fabricado via `paymentData`
(`description` é sempre "Pix enviado", nunca contém o CPF/CNPJ). A
asserção sobre a coluna `description` passava, mas por **ausência de
mecanismo**, não por proteção — e o título prometia uma garantia mais
ampla e, à luz do DT-021, **falsa** (existe CPF cru em `description` em
dados reais).

Corrigido em `tests/integration/sync.integration.test.ts`, sem tocar
produção nem tentar fazer a varredura de `description` "passar" (isso
exigiria scrub de descrição — fora de escopo, é o próprio DT-021):
- título do `describe`/`it` reescrito para deixar explícito que a garantia
  é do **vetor `paymentData`** (o único que a TASK-008/DT-019 promete
  limpar), com "o vetor `description` é o DT-021, fora de escopo" citado
  tanto no `describe` quanto no `it`;
- comentário JSDoc do bloco reescrito explicando o escopo honesto, com
  referência explícita ao DT-021;
- duas asserções novas (`rawTransaction.description` não contém o CPF/CNPJ
  fabricado) tornando EXPLÍCITO, dentro do próprio teste, que a fixture não
  carrega o documento em `description` — para o próximo leitor não
  confundir "este teste passou" com "`description` está sempre limpa";
- comentário adicional antes da varredura final reforçando que ela prova
  ausência do documento de `paymentData` em qualquer coluna (incluindo
  `description`, mas só porque a fixture nunca o colocou lá), não que
  `description` esteja livre de PII em produção.

Suíte após a correção: `npm test` → **41 arquivos, 527 testes, 527
passando, 0 falhando** (mesma contagem — só título/comentários/2 asserções
novas mudaram, nenhum teste foi removido ou adicionado).
`npx eslint tests/integration/sync.integration.test.ts` limpo. Nenhum
código de produção tocado.

### Contrato assumido para o coder

```ts
// lib/category-rules.ts (módulo NOVO)
export function hashDocument(raw: string): string;
// normaliza (regex /\D/g -> só dígitos) e aplica
// node:crypto createHash("sha256").update(normalized).digest("hex").
// ÚNICA função de hash do projeto - usada aqui E dentro de lib/pluggy.ts.

export const categoryRuleInputSchema = z.object({
  document: z.string().min(1),
  category: z.string().min(1),
  label: z.string().min(1).optional(),
});
export type CategoryRuleInput = z.infer<typeof categoryRuleInputSchema>;

export interface CategoryRuleListItem {
  id: string;
  label: string | null;
  category: string;
}

export async function upsertCategoryRule(
  input: CategoryRuleInput,
): Promise<CategoryRuleListItem>;
// hasheia input.document com hashDocument; prisma.categoryRule.upsert por
// { documentHash: hash }; devolve { id, label, category } RECONSTRUÍDO
// campo a campo (nunca documentHash, nunca o documento).

export async function listCategoryRules(): Promise<CategoryRuleListItem[]>;
// reconstruído campo a campo - nunca documentHash na saída.

export class CategoryRuleNotFoundError extends Error {}
export async function deleteCategoryRule(id: string): Promise<void>;
// findUnique primeiro - null -> CategoryRuleNotFoundError SEM chamar delete.

export async function getCategoryRuleHashMap(): Promise<Map<string, string>>;
// prisma.categoryRule.findMany({ select: { documentHash, category } })
// -> Map(documentHash -> category). Usado por lib/sync.ts.
```

```ts
// lib/pluggy.ts (ESTENDE fetchPluggyAllTransactions - TASK-006)
export type PluggyRawTransaction = {
  // ...campos já existentes (pluggyTransactionId, date, description, amount,
  // type, status, category, paymentMethod)...
  counterpartyDocumentHashes: string[];
  // Calculado DENTRO da própria função, a partir de
  // t.paymentData?.payer?.documentNumber?.value e
  // t.paymentData?.receiver?.documentNumber?.value (quando presentes),
  // usando hashDocument (@/lib/category-rules). Deduplicado (Set). [] quando
  // não há paymentData/payer/receiver. O documento cru NUNCA entra no objeto
  // retornado - só o hash.
};
```

```ts
// lib/sync.ts (ESTENDE syncBankItem - TASK-006/007)
// 1. No INÍCIO de syncBankItem (antes do loop de accounts), busca
//    `const categoryRuleMap = await getCategoryRuleHashMap();` UMA VEZ
//    (não a cada transação/account).
// 2. Para cada rawTransaction, resolve:
//    const categoryFromRule = rawTransaction.counterpartyDocumentHashes
//      .map((hash) => categoryRuleMap.get(hash))
//      .find((category): category is string => category !== undefined) ?? null;
// 3. `prisma.transaction.upsert(...)` passa a incluir `categoryFromRule` em
//    `create` E `update` (create/update ambos - Criterio "re-aplica a cada
//    sync").
```

```ts
// lib/transactions.ts (ESTENDE resolveTransactionCategory - TASK-007)
export function resolveTransactionCategory(transaction: {
  category: string | null;
  categoryOverride: string | null;
  categoryFromRule: string | null;
}): string | null {
  return (
    transaction.categoryOverride ??
    transaction.categoryFromRule ??
    transaction.category
  );
}
// listTransactions precisa selecionar/repassar categoryFromRule da row para
// chamar resolveTransactionCategory com os 3 campos.
```

```prisma
// prisma/schema.prisma (schema NÃO implementado pelo qa - contrato apenas)
model CategoryRule {
  id           String   @id @default(cuid())
  documentHash String   @unique
  category     String
  label        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Transaction {
  // ...campos já existentes...
  categoryFromRule String?   // nullable - DT-013, tabela com 432 linhas reais
}
```

```ts
// app/api/category-rules/route.ts (rota NOVA)
export async function POST(request: Request): Promise<Response>;
// body via categoryRuleInputSchema (@/lib/category-rules) -> 400 se inválido;
// chama upsertCategoryRule; 200/201 com { success: true, data: { id, label,
// category } } RECONSTRUÍDO (nunca o documento); erro -> 500 genérico.

export async function GET(): Promise<Response>;
// chama listCategoryRules(); 200 com { success: true, data: [...] }; erro -> 500.

// app/api/category-rules/[id]/route.ts (rota NOVA)
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response>;
// deleteCategoryRule(id); sucesso -> 200 { success: true, data: { id } };
// CategoryRuleNotFoundError -> 404; outro erro -> 500.
```

```tsx
// components/category-rules/AddCategoryRuleForm.tsx (NOVO, "use client")
export function AddCategoryRuleForm(props?: { onCreated?: () => void }): JSX.Element;
// 3 campos com label acessível: /documento/i, /categoria/i, /r[oó]tulo/i;
// botão "Adicionar regra"; POST /api/category-rules; loading "Salvando...";
// sucesso: confirmação + LIMPA os campos (privacidade) + chama onCreated;
// erro: mensagem genérica, MANTÉM os valores digitados; NUNCA console.*.

// components/category-rules/DeleteCategoryRuleButton.tsx (NOVO, "use client")
export function DeleteCategoryRuleButton(props: {
  ruleId: string;
  onDeleted?: () => void;
}): JSX.Element;
// botão "Remover"; DELETE /api/category-rules/{ruleId}; loading "Removendo...";
// sucesso: some/desabilita + chama onDeleted; erro: mensagem genérica, botão
// continua disponível.

// app/categorias/page.tsx (NOVO, Server Component - async function, sem "use client")
export default async function CategoriasPage(): Promise<JSX.Element>;
// chama listCategoryRules(); renderiza <AddCategoryRuleForm />; para cada
// regra, mostra label (fallback: category, se label for null) + category +
// <DeleteCategoryRuleButton ruleId={rule.id} />; estado vazio com mensagem.
```

### Mapeamento critério de aceite → teste

| Critério (seção 4) | Teste(s) |
|---|---|
| **1.** Model `CategoryRule` + `Transaction.categoryFromRule`, migration segura | `tests/unit/schema/category-rule.test.ts` (todo o arquivo); `tests/integration/schema.integration.test.ts` → `describe("CategoryRule - tabela nova...")` e `describe("Transaction.categoryFromRule - coluna nullable...")`; `tests/integration/category-rules.integration.test.ts` → `describe("upsertCategoryRule - persiste o HASH...")` |
| **2.** `hashDocument` normaliza + SHA-256, única fonte de hash | `tests/unit/lib/category-rules.test.ts` → `describe("hashDocument - normalizacao + SHA-256...")` (6 testes, incluindo golden SHA-256 vs `node:crypto` independente); `tests/unit/lib/pluggy.test.ts` → `describe("fetchPluggyAllTransactions - counterpartyDocumentHashes...")` (usa a MESMA função real, não mockada) |
| **3.** `POST /api/category-rules` valida, hasheia, upsert por hash, resposta nunca ecoa documento | `tests/unit/api/category-rules-route.test.ts` → `describe("POST /api/category-rules - validacao...")`, `describe("POST /api/category-rules - sucesso...")`, `describe("POST /api/category-rules - O TESTE DE PII MAIS CRITICO...")`; `tests/unit/lib/category-rules.test.ts` → `describe("upsertCategoryRule - hasheia e faz upsert por hash...")` e `describe("upsertCategoryRule - mesmo documento cadastrado de novo ATUALIZA...")`; `tests/integration/category-rules.integration.test.ts` → `describe("upsertCategoryRule - mesmo documento cadastrado de novo ATUALIZA...")` |
| **4.** `GET /api/category-rules` (lista sem documento) e `DELETE /api/category-rules/[id]` | `tests/unit/api/category-rules-route.test.ts` → `describe("GET /api/category-rules - lista...")`; `tests/unit/api/category-rules-delete-route.test.ts` (todo o arquivo); `tests/integration/category-rules.integration.test.ts` → `describe("listCategoryRules - ...")` e `describe("deleteCategoryRule - remove sem afetar transacoes...")` |
| **5.** `fetchPluggyAllTransactions` expõe `counterpartyDocumentHashes`, hash calculado na própria função, documento cru descartado ali | `tests/unit/lib/pluggy.test.ts` → `describe("fetchPluggyAllTransactions - counterpartyDocumentHashes (Criterio de aceite #5...)")` (5 testes: payer+receiver, só payer, sem contraparte, dedup, golden hash) + o teste "extrai SOMENTE..." atualizado |
| **6.** `lib/sync.ts` usa os hashes para buscar `CategoryRule` e preencher `categoryFromRule`, re-aplica a cada sync | `tests/unit/lib/sync.test.ts` → `describe("syncBankItem - categoryFromRule via hash da contraparte...")` (5 testes); `tests/integration/sync.integration.test.ts` → `describe("syncBankItem - regra de categorizacao por CPF/CNPJ...")` (5 testes, incluindo "regra criada DEPOIS de um sync inicial passa a valer no RE-sync") |
| **7. Teste de PII (o mais importante)** | `tests/integration/sync.integration.test.ts` → `describe("syncBankItem - TESTE DE PII CRITICO...")` (3 testes: varredura completa de `Transaction`, varredura de `CategoryRule`, formato do hash); `tests/unit/api/category-rules-route.test.ts` → `describe("POST /api/category-rules - O TESTE DE PII MAIS CRITICO DO ENDPOINT...")`; `tests/integration/category-rules.integration.test.ts` → `describe("upsertCategoryRule - persiste o HASH, nunca o documento...")` |
| **8.** `resolveTransactionCategory` com 3 níveis; `/transacoes` reflete a categoria efetiva | `tests/unit/lib/transactions.test.ts` → `describe("resolveTransactionCategory - categoria efetiva = categoryOverride ?? categoryFromRule ?? category...")` (7 testes, cada nível vencendo isoladamente); `tests/integration/transactions.integration.test.ts` → `describe("listTransactions - categoria efetiva de TRES niveis contra o Postgres real...")` (4 testes) |
| **9.** Página `/categorias` (lista/adiciona/remove) | `tests/unit/app/categorias-page.test.tsx` (todo o arquivo); `tests/unit/components/add-category-rule-form.test.tsx` (todo o arquivo); `tests/unit/components/delete-category-rule-button.test.tsx` (todo o arquivo) |
| **10.** Nenhuma chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET` | Todos os arquivos acima mockam `pluggy-sdk`/`@/lib/pluggy`/fetch global - nenhum teste depende de rede real (mesmo padrão de TASK-003 a TASK-007) |
| **11.** Nenhum `console.*`; documento jamais logado | Em CADA arquivo de teste novo/estendido: describe/teste dedicado "nao chama console.log/warn/error" (lib/category-rules, rotas, componentes, pluggy) |
| **12.** Suíte inteira verde, `build`/`lint` limpos | Critério do coder/reviewer - `npm run lint` já roda limpo sobre os arquivos de teste desta task (0 erros, confirmado pelo qa) |

## 7. Implementação (preenchido pelo coder)

### Arquivos criados

- `lib/category-rules.ts` — `hashDocument` (SHA-256 hex de digitos-somente,
  `node:crypto`), `categoryRuleInputSchema` (Zod), `upsertCategoryRule`,
  `listCategoryRules`, `deleteCategoryRule`/`CategoryRuleNotFoundError`,
  `getCategoryRuleHashMap`. Única fonte de hash do projeto — `lib/pluggy.ts`
  importa `hashDocument` daqui.
- `app/api/category-rules/route.ts` — `POST`/`GET`, casca fina sobre
  `lib/category-rules.ts` (mesmo padrão de `app/api/items/route.ts`).
- `app/api/category-rules/[id]/route.ts` — `DELETE`, casca fina (mesmo
  padrão de `app/api/items/[id]/route.ts`).
- `components/category-rules/AddCategoryRuleForm.tsx` — formulário
  client-side (3 campos, `POST /api/category-rules`, limpa os campos e
  chama `onCreated` em sucesso, mantém valores e mostra erro genérico em
  falha).
- `components/category-rules/DeleteCategoryRuleButton.tsx` — botão
  client-side (`DELETE /api/category-rules/{id}`, some em sucesso, mantém
  disponível em falha).
- `app/categorias/page.tsx` — Server Component, lista as regras
  (`listCategoryRules`), formulário e botão de remover por regra.
- `prisma/migrations/20260818133647_add_category_rule/` — migration gerada
  via `prisma migrate dev` (nova tabela `CategoryRule`, coluna nova
  `Transaction.categoryFromRule` nullable — nenhum `ALTER ... NOT NULL` sem
  default, regra permanente do topo do DEBITO-TECNICO).

### Arquivos alterados

- `prisma/schema.prisma` — `model CategoryRule` (`documentHash @unique`,
  `category`, `label String?`, timestamps) + `Transaction.categoryFromRule
  String?` (nullable).
- `lib/pluggy.ts` — `PluggyRawTransaction` ganha `counterpartyDocumentHashes:
  string[]`; nova função privada `extractCounterpartyDocumentHashes`
  (lê `paymentData.payer/.receiver.documentNumber.value`, aplica
  `hashDocument`, deduplica via `Set`) é chamada DENTRO de
  `fetchPluggyAllTransactions` — o `documentNumber` cru nunca sai da função,
  só o hash.
- `lib/sync.ts` — `syncBankItem` busca `getCategoryRuleHashMap()` uma única
  vez (antes do loop de accounts) e resolve `categoryFromRule` por
  transação (`counterpartyDocumentHashes.map(...).find(...)`), passado em
  `create` E `update` do upsert (re-aplica a cada sync).
- `lib/transactions.ts` — `resolveTransactionCategory` ganha o 3º parâmetro
  `categoryFromRule` na precedência `categoryOverride ?? categoryFromRule ??
  category`; `listTransactions` repassa `row.categoryFromRule`.
- Migration aplicada também no banco de desenvolvimento (`gestor`, via
  `.env.local` + `prisma migrate deploy`) — necessária para `next build`
  (a página `/categorias` é prerenderizada e consulta `CategoryRule` em
  build time, mesmo padrão de `/bancos`).

### Decisões tomadas

- `upsertCategoryRule`/rotas reconstroem o retorno campo a campo
  (`{ id, label, category }`) em toda camada (lib → API route), nunca
  repassam o objeto cru do Prisma — defesa em profundidade consistente com
  o padrão já usado em `lib/bank-item.ts`/`app/api/items/route.ts`.
- `AddCategoryRuleForm` omite a chave `label` do corpo da requisição quando
  o campo está vazio (em vez de enviar `label: ""`, que falharia a
  validação Zod de `categoryRuleInputSchema`, que exige `min(1)` quando
  presente).
- `getCategoryRuleHashMap` é chamada uma única vez por `syncBankItem`
  (fora do loop de accounts/transactions) — evita N+1 consultas ao Postgres
  a cada transação, conforme o contrato da seção 6.

### Dívidas assumidas

- **Teste com contradição interna, não corrigido (não editei o teste):**
  `tests/unit/schema/category-rule.test.ts`, describe
  `it.each(["document", "cpf", "cnpj", "documentNumber", "rawDocument"])`
  — o caso `"document"` usa o padrão `^\s*document\w*\s+\S+` que também
  casa com o campo **exigido** `documentHash` (`\w*` engole "Hash"). O
  próprio arquivo de teste documenta o contrato `documentHash String
  @unique` no cabeçalho, e todos os demais testes (unitários, integração,
  contrato do sync) exigem literalmente o nome de campo `documentHash`
  (ex.: `prisma.categoryRule.create({ data: { documentHash: ... } })` em
  `tests/integration/sync.integration.test.ts`). Não há forma de satisfazer
  os dois requisitos simultaneamente sem editar o teste — o que a regra de
  ouro do processo proíbe. Resultado: 1 teste falha
  (`CategoryRule NUNCA declara um campo de documento cru chamado (ou
  comecando com) 'document'`); todos os demais 524 testes da suíte passam.
  Reportado para o orquestrador/code-reviewer decidir (provável correção:
  trocar o padrão do teste para `${forbiddenFieldName}(?!Hash)\w*` ou
  remover `"document"` da lista, já que `documentHash` é o nome do campo
  contratado desde a seção 6 do próprio TASK-008.md).
- Nenhuma outra dívida nova. `npm run lint` está limpo (0 erros; os 2
  warnings existentes são em `coverage/` gerado, não relacionados a esta
  task).

## 8. Revisão (preenchido pelo code-reviewer)

Veredito: **APROVADO** (2026-08-18)

Revisado o diff real (working tree por cima da main), não o relato da seção 7.
Rodei por conta própria: unitários desta task 204/204, integração desta task
89/89 (inclui o teste de PII crítico, critério 7), `tsc --noEmit` exit 0.
Sondagem de código confirma a regra de ouro por construção.

### Confirmações dos pontos de julgamento

- **Regra de ouro por construção (ponto 2):** CONFIRMADA. `hashDocument`
  (`lib/category-rules.ts:25`) é a única fonte de hash, importada por
  `lib/pluggy.ts:2`. `extractCounterpartyDocumentHashes`
  (`lib/pluggy.ts:343`) é privada, filtra os documentos crus e devolve
  **só** o hash; o documento cru não entra no objeto de
  `fetchPluggyAllTransactions` (reconstrução campo a campo, sem `...t`), não
  vai a log (zero `console.*` em produção — só menções em comentário) e não
  vaza por erro (o `catch` relança `PluggyTransactionsFetchError` genérico,
  sem interpolar o original). Mesma função nos dois usos → o casamento
  hash-contra-hash bate (provado no teste real: 24 transações casaram).
- **Precedência (ponto 3):** CONFIRMADA. `resolveTransactionCategory`
  (`lib/transactions.ts:74`) = `categoryOverride ?? categoryFromRule ??
  category`; `listTransactions` repassa os três campos da row
  (`lib/transactions.ts:163`). Cobertos os três níveis vencendo.
- **Endpoints/upsert/DELETE/migration (ponto 4):** CONFIRMADOS. Upsert por
  `{ documentHash }` (`lib/category-rules.ts:56`); rotas e lib reconstroem
  `{ id, label, category }` campo a campo, nunca ecoam documento/hash;
  `DELETE` faz `findUnique` antes (404 sem chamar `delete`). Migration
  `20260818133647_add_category_rule` é `ADD COLUMN "categoryFromRule" TEXT`
  (nullable) + `CREATE TABLE` — segura nas 432 linhas reais (regra do DT-013).
- **Normalização do hash (ponto 5):** CONFIRMADA. `hashDocument` aplica
  `/\D/g` antes do SHA-256; teste prova `hashDocument("123.456.789-00") ===
  hashDocument("12345678900")` e bate contra golden hash calculado
  independentemente (`tests/unit/lib/category-rules.test.ts:75,86`). O ponto
  onde a feature falharia em silêncio está coberto.

### Problemas bloqueantes

Nenhum.

### Não-bloqueantes (viram DT / ajuste de teste, não devolvem a task)

1. **Lacuna de percepção no teste de PII (critério 7) — família DT-011.**
   `tests/integration/sync.integration.test.ts:787` intitula-se "CPF/CNPJ
   jamais persistido em **nenhuma coluna** de Transaction" e faz varredura da
   tabela inteira com `not.toContain(FAKE_PAYER_CPF)`. Só que a transação
   fabricada (`buildTransactionWithPaymentData`, `tests/fixtures/pluggy.ts:213`)
   tem `description: "Pix enviado"` — o documento entra **apenas** via
   `paymentData`. Logo, a asserção sobre a coluna `description` passa por
   **ausência de mecanismo**, não por proteção: se o sync gravasse um CPF na
   `description`, este teste **não pegaria**, porque a descrição fabricada
   nunca conteve um. O teste prova corretamente o vetor `paymentData` (que é o
   escopo da task e está sólido), mas o título/varredura se leem como garantia
   mais ampla ("nenhum CPF no banco") do que entregam. É exatamente o vetor
   pré-existente do **DT-021** (CPF em dígitos no texto livre de `description`,
   persistido desde a TASK-006). **Ação sugerida:** narrar no teste que a
   garantia é do vetor `paymentData` (não de `description`), referenciando o
   DT-021; e **registrar esta lacuna de percepção como nota no DT-021** (ou
   DT-011), para que o critério 7 não seja lido como cobertura do vetor
   `description`. Não bloqueia: o escopo do DT-019/TASK-008 é o paymentData, e
   esse está provado por valor.

2. **DT-021 permanece aberto e ortogonal.** Confirmo o julgamento do
   coordenador: a TASK-008 **não piora** o DT-021 — o documento do
   `paymentData` é hasheado e descartado em `lib/pluggy.ts` antes de qualquer
   persistência. O CPF em `description` é vetor pré-existente da TASK-006. Fica
   como está no DT-021 (decisão do usuário sobre scrub pendente).

### Achados que viram DT

- Nota no **DT-021** (ou novo item da família **DT-011**): o teste de PII do
  critério 7 cobre só o vetor `paymentData`; a varredura da coluna
  `description` é verde-por-construção (fixture sem CPF na descrição). Registrar
  para não gerar falsa sensação de "nenhum CPF no banco".
