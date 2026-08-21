# TASK-015 — Ciclo de fatura por cartão + fatura atual + cards por cartão
Status: PLANEJADA | Fase do roadmap: 6 (correções de dashboard)

> **Plano estruturado.** A matemática do ciclo é o coração e merece um spec detalhado + provável
> sondagem de dados quando a task começar. Este arquivo fixa o escopo e as decisões já tomadas.

## 1. Objetivo

Modelar a **fatura do cartão pelo ciclo de fechamento** (não pelo mês do calendário), para o
dashboard mostrar **o que o usuário vai pagar** por cartão — a fatura aberta, sempre ~1 mês à frente.

## 2. O modelo (confirmado com o usuário)

- Cada cartão tem um **dia de fechamento** (`closingDay`). O usuário **cadastra** isso (a Pluggy não
  entrega a data de fechamento de forma confiável — vem nula). Só o dia de fechamento; o vencimento
  vem do `dueDate` da Pluggy quando existir.
- **Ciclo:** uma compra de crédito na data `D` pertence à fatura que fecha no primeiro `closingDay`
  ≥ `D`; essa fatura vence no mês seguinte.
  - Exemplo real (Sicredi, fechamento dia 24): compras de **25/jul a 24/ago** = fatura de **setembro**.
- **Fatura atual (aberta)** de um cartão = soma das transações de crédito no ciclo corrente
  (do último fechamento + 1 até o próximo fechamento). É "o que vou pagar no mês que vem".
- Isso é a **fatura forecast/aberta** que a TASK-011 deixou fora de escopo (o endpoint da Pluggy só
  dá as fechadas). Aqui calculamos a aberta a partir das transações + `closingDay`.

## 3. Escopo

- **Schema:** `Account.closingDay Int?` (nullable — regra de migration permanente).
- **Cadastro:** tela para o usuário informar o dia de fechamento por cartão (ex. em `/bancos` ou uma
  tela de ajustes do cartão).
- **`lib`:** função de ciclo (data + `closingDay` → mês de fatura) e função de **fatura atual por
  cartão** (soma do ciclo aberto).
- **Dashboard:** **um card por cartão** com a fatura aberta (valor + a que mês/vencimento se refere).
  Resolve o resto do Problema 2 (cards por cartão) e o Problema 1.
- Só cartões `CREDIT_CARD`; um cartão sem `closingDay` cadastrado mostra estado "cadastre o fechamento".

## 4. Decisões em aberto (definir no início da task)

- A "fatura atual" mostra só o **ciclo aberto** (a vencer mês que vem), ou também a **fechada a
  vencer** (a mais próxima do vencimento)? O usuário falou "sempre um mês à frente" → provavelmente
  só a aberta; confirmar.
- Como o **card por cartão** convive com o gasto-por-crédito-total da TASK-014 (evitar dizer a mesma
  coisa duas vezes).
- Sondar dados reais: confirmar o mapeamento ciclo→mês num cartão de verdade antes de codar
  (lição da sessão: não confiar na doc/no palpite).

## 5. Fora de escopo

- Previsão de parcelas futuras (compras parceladas que caem em faturas seguintes) — pode ser task própria
- Conciliação / pagamento pelo app

## 6/7/8. (qa / coder / reviewer preenchem quando a task iniciar)
