# TASK-006 — Sync de Accounts e Transactions
Status: EM ANDAMENTO | Fase do roadmap: 2

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

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 6. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas: | **Achado sobre `category` (DT-010):**

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
