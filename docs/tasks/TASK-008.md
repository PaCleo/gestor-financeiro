# TASK-008 — Regras de categorização por CPF/CNPJ
Status: EM ANDAMENTO | Fase do roadmap: 2 (extensão — DT-019)

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

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 7. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 8. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
