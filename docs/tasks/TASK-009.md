# TASK-009 — Lançamentos manuais + conta Dinheiro (Fase 3)
Status: EM ANDAMENTO | Fase do roadmap: 3

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

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 7. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 8. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
