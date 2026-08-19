# TASK-011 — Fatura do cartão (fecha a Fase 5)
Status: EM ANDAMENTO | Fase do roadmap: 5

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16, Vitest,
  Testing Library. Posteriores ao seu treinamento — consulte a documentação instalada.
- Leia `docs/DEBITO-TECNICO.md` e a **seção 11 da PREMISSA** (bloco "Fatura do cartão vem de
  endpoint dedicado", com o formato real capturado).
- Padrões: erro de domínio com mensagem fixa; rota casca fina; `ApiResponse<T>`; frontend com
  jsdom opt-in + `cleanup()`; Zod nos params; reconstrução campo a campo (sem spread).
- **DT-004**: `vi.spyOn(prisma, ...)` é engolido pelo Proxy. Mocke módulos inteiros.
- **DT-013 (regra permanente):** coluna/tabela nova segura em base com dados (aqui é tabela nova).
- **ADR 7:** sync em série, 1 requisição por vez.
- Já existem: `lib/sync.ts` (`syncBankItem`/`syncAllActiveBankItems`), `lib/pluggy.ts`
  (`fetchPluggyAccounts`, `fetchPluggyAllTransactions`), `Account` (com `type`).
- **A dedup é sagrada.** Faturas deduplicam por `pluggyBillId` (como transações por
  `pluggyTransactionId`) — upsert, nunca duplica.

## 1. Objetivo

Responder a terceira pergunta da Visão — **quanto vai fechar minha fatura** — sincronizando e
mostrando as faturas do cartão (atual em destaque + histórico), do endpoint dedicado da Pluggy.

## 2. Comportamento esperado (TDD)

### Sync das faturas
- DADO uma conta `CREDIT` QUANDO sincronizo ENTÃO cada fatura da Pluggy é persistida
  (`pluggyBillId`, `dueDate`, `totalAmount`, `minimumPaymentAmount`) e re-sincronizar **atualiza** (upsert), não duplica
- DADO uma conta `BANK` (ou `CASH`) QUANDO sincronizo ENTÃO **nenhuma** fatura é buscada para ela
- DADO um cartão sem faturas (a Pluggy devolve lista vazia) QUANDO sincronizo ENTÃO não quebra —
  simplesmente não há faturas para aquele cartão
- DADO a mesma fatura sincronizada duas vezes QUANDO re-sincronizo ENTÃO **não duplica**
  (dedup por `pluggyBillId`)
- DADO um `BankItem` arquivado QUANDO sincronizo ENTÃO suas faturas não são buscadas (já ignorado no nível do Item)

### Exibição
- DADO faturas de um cartão QUANDO abro a tela ENTÃO vejo a **mais recente** em destaque (total,
  vencimento, mínimo) e as anteriores como histórico, decrescente por `dueDate`
- DADO um cartão sem faturas QUANDO abro ENTÃO vejo um estado vazio claro, sem erro
- DADO valores monetários QUANDO exibo ENTÃO usam `Decimal` (sem erro de float)

## 3. Critérios de aceite

- [ ] 1. Model `CreditCardBill` (`pluggyBillId @unique`, `accountId` + relação, `dueDate`,
      `totalAmount Decimal @db.Decimal(14,2)`, `minimumPaymentAmount Decimal?`), migration nova.
      `onDelete` explícito na relação com `Account` (evita o DT-003/DT-005; decida e documente)
- [ ] 2. `lib/pluggy.ts`: `fetchPluggyBills(accountId)` usa `client.fetchCreditCardBills`,
      reconstrói campo a campo (sem spread), erro de domínio com mensagem fixa
- [ ] 3. `lib/` (ex. `lib/bills.ts`): persiste as faturas por upsert em `pluggyBillId`; `lib/sync.ts`
      chama isso **só para contas `CREDIT`**, em série, dentro do fluxo de sync existente
- [ ] 4. **Dedup provada:** re-sync não duplica faturas; teste conta os registros
- [ ] 5. Teste prova que contas `BANK`/`CASH` **não** disparam busca de fatura, e que cartão sem
      fatura não quebra
- [ ] 6. Teste prova que o sync de faturas **não** altera nem apaga `Transaction`s nem `Account`s
      (não regride nada da Fase 2)
- [ ] 7. `GET /api/bills` (casca fina, Zod se houver filtro) e página (ex. `/faturas`): fatura atual
      em destaque + histórico por cartão. Testing Library
- [ ] 8. Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 9. Nenhum `console.*` em produção
- [ ] 10. Suíte inteira verde (os anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 4. Fora de escopo

- **Transações-linha de cada fatura** (exigiria re-adicionar `creditCardMetadata.billId` às
  transações; a TASK-006 descartou). Nível resumo só
- **Fatura aberta/forecast** (a que ainda acumula) — o endpoint dá as fechadas; a aberta viria de
  `account.creditData`/PENDING. Refinamento futuro; registrar como observação se relevante
- `financeCharges` e `payments` detalhados da fatura (só total/vencimento/mínimo nesta task)
- "O que falta pagar" / contas fixas (Fase 4, pulada)
- Pagar a fatura pelo app

## 5. Testes (preenchido pelo qa)

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 6. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
