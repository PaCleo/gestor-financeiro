# TASK-014 — Correção: pagamento de fatura fora do gasto + gastos por método
Status: EM ANDAMENTO | Fase do roadmap: 6 (correções de dashboard)

## 0. Contexto técnico obrigatório

- Stack: Next 16.2.10 + React 19, Prisma 7.9.0 (driver adapter), Postgres 16, Vitest, Testing Library.
- Sistema de design **Fintech Premium** já aplicado (TASK-013) — reusar os primitivos
  (`.card`, `.kpi-*`, `.chip`, etc. em `app/globals.css`); a moeda usa `formatBRL` de `lib/format.ts`.
- Leia `docs/DEBITO-TECNICO.md` (DT-018 e DT-024 são o contexto direto) e a seção 11 da PREMISSA.
- `lib/dashboard.ts` (`getMonthlySummary`) e `lib/bills.ts` (faturas persistidas) já existem.
- **DT-004**: mocke módulos inteiros. **DT-026**: nunca rodar testes concorrentes contra `gestor_test`.

## 1. Objetivo

Dois problemas do dashboard, confirmados nos dados reais:
1. **O pagamento de fatura conta como despesa** e infla o total (duplica o que já foi contado nas
   compras do cartão). Ex. real: um débito de −R$ 3.408,84 na conta corrente = o total da fatura do
   cartão Gold, mas a Pluggy o categorizou como "Loans and financing", então o DT-018 (que exclui
   por categoria exata) não o pega.
2. Falta granularidade: o usuário quer ver **quanto gastou por método** (Pix/TED, crédito, débito, dinheiro).

## 2. A decisão (confirmada com o usuário)

- **Detecção do pagamento de fatura = casar com a fatura.** Um débito numa conta **não-cartão**
  (CHECKING/CASH) cujo `|amount|` é **igual** ao `totalAmount` de uma `CreditCardBill` **e** cuja
  `date` cai numa **janela ao redor do `dueDate`** daquela fatura (ex. ±10 dias) é um **pagamento de
  fatura** → excluído do cálculo (receita e despesa). Documentar a tolerância e o desempate.
  - Pagamento **parcial** (valor ≠ total exato) fica fora do escopo — cai no comportamento atual
    (registrar como observação/DT se relevante).
- **Transparência:** os pagamentos de fatura excluídos entram na contabilidade de "excluídos" do
  resumo (o dinheiro não some da tela sem explicação), como já acontece com transferências.

## 3. Comportamento esperado (TDD)

- DADO um débito de conta corrente igual ao total de uma fatura, dentro da janela do vencimento
  QUANDO calculo o resumo ENTÃO ele **não** entra na despesa e é contabilizado como pagamento excluído
- DADO um débito de mesmo valor mas **fora** da janela de data QUANDO calculo ENTÃO ele conta normal
  (não é o pagamento daquela fatura)
- DADO um gasto real de "Loans and financing" que **não** casa com nenhuma fatura QUANDO calculo
  ENTÃO ele **conta** como despesa (não excluímos a categoria inteira — só o que casa com fatura)
- DADO as transações do mês QUANDO agrupo por método ENTÃO recebo o total gasto em **crédito**
  (transações em contas CREDIT_CARD), **Pix/TED**, **débito** e **dinheiro**
- DADO o dashboard QUANDO exibo ENTÃO há cards de gasto por método, além de receita/despesa/saldo

## 4. Critérios de aceite

- [ ] 1. `lib/dashboard.ts` identifica pagamentos de fatura casando débito não-cartão com
      `CreditCardBill.totalAmount` + janela de `dueDate`; exclui-os de receita e despesa
- [ ] 2. Teste prova os 3 casos: casa (exclui), mesmo valor fora da janela (conta), "Loans and
      financing" que não casa fatura nenhuma (conta) — com poder de detecção real
- [ ] 3. O resumo expõe os pagamentos de fatura excluídos (contagem/total), separado ou somado às
      transferências excluídas — decisão do coder, documentada
- [ ] 4. `lib/dashboard.ts` (ou `lib/`) calcula gasto por método: crédito (contas CREDIT_CARD),
      Pix/TED, débito, dinheiro; teste cobre a classificação
- [ ] 5. Dashboard mostra cards de gasto por método, no sistema de design (primitivos `.card`/`.kpi-*`),
      moeda em `formatBRL`
- [ ] 6. **Nenhuma regressão** nos testes existentes; nenhum `console.*`; suíte verde; build/lint limpos
- [ ] 7. Verificação contra dados reais (orquestrador): o −R$ 3.408,84 sai do total; os cards de
      método batem com o extrato

## 5. Fora de escopo

- Ciclo de fatura por cartão / fatura aberta / cadastro de dia de fechamento → **TASK-015**
- Card **por cartão** (crédito discriminado por cartão) → TASK-015 (depende do ciclo)
- Pagamento parcial de fatura (valor diferente do total)
- Conciliação manual

## 6/7/8. (qa / coder / reviewer preenchem)
