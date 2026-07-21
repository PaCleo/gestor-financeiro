# Roadmap — Gestor Financeiro

> Derivado da seção 8 da [PREMISSA.md](./PREMISSA.md). O orquestrador mantém este arquivo.
> Status possíveis: `PENDENTE` · `EM ANDAMENTO` · `CONCLUÍDA` · `BLOQUEADA`

## Fase 0 — Fundação
**Critério de pronto:** `npm run dev` sobe, migrations aplicadas.

| Task | Título | Status |
|---|---|---|
| [TASK-001](./tasks/TASK-001.md) | Fundação de dados: Prisma + Postgres + schema + healthcheck | CONCLUÍDA |

> **Herança para as próximas fases (achado do review da TASK-001):** `Transaction.account` ficou
> com `onDelete: RESTRICT` (default do Prisma), enquanto `Account.bankItem` é `Cascade`. Na prática,
> deletar um `BankItem` cujas Accounts já tenham Transactions **falha** com violação de FK. O teste
> de cascade da TASK-001 passa apenas porque as Accounts do cenário estão vazias. A task que
> introduzir exclusão/reconexão de Item (Fase 1 ou 6) precisa definir essa política e cobrir o caso
> "BankItem com Accounts não vazias".

## Fase 1 — Conexão Pluggy
**Critério de pronto:** conecto um banco e o `itemId` fica salvo.

| Task | Título | Status |
|---|---|---|
| — | `/api/connect-token`, widget PluggyConnect, persistir BankItem | PENDENTE |

## Fase 2 — Sync + listagem
**Critério de pronto:** vejo minhas transações reais das instituições conectadas.

| Task | Título | Status |
|---|---|---|
| — | `/api/sync` com upsert por `pluggyTransactionId`, tela de transações com filtros | PENDENTE |

## Fase 3 — Lançamentos manuais
**Critério de pronto:** insiro um Pix manual e ele aparece junto com o resto.

| Task | Título | Status |
|---|---|---|
| — | CRUD de transações manuais + conta "Dinheiro" | PENDENTE |

## Fase 4 — Contas fixas
**Critério de pronto:** vejo o que falta pagar no mês.

| Task | Título | Status |
|---|---|---|
| — | CRUD de recorrências + geração mensal de instâncias + baixa | PENDENTE |

## Fase 5 — Dashboard
**Critério de pronto:** as 3 perguntas da Visão são respondidas em 1 tela.

| Task | Título | Status |
|---|---|---|
| — | Totais por categoria, fatura do cartão, pendências do mês | PENDENTE |

## Fase 6 — Refinos
**Critério de pronto:** sync automático confiável.

| Task | Título | Status |
|---|---|---|
| — | Webhooks, conciliação manual↔Pluggy, tratamento de expiração de consentimento | PENDENTE |
