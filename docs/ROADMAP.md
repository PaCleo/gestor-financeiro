# Roadmap — Gestor Financeiro

> Derivado da seção 8 da [PREMISSA.md](./PREMISSA.md). O orquestrador mantém este arquivo.
> Status possíveis: `PENDENTE` · `EM ANDAMENTO` · `CONCLUÍDA` · `BLOQUEADA`

## Fase 0 — Fundação
**Critério de pronto:** `npm run dev` sobe, migrations aplicadas.

| Task | Título | Status |
|---|---|---|
| [TASK-001](./tasks/TASK-001.md) | Fundação de dados: Prisma + Postgres + schema + healthcheck | CONCLUÍDA |
| [TASK-002](./tasks/TASK-002.md) | Política de exclusão do BankItem + fail-fast de DATABASE_URL | CONCLUÍDA |

> **Política de exclusão (definida na TASK-002):** deletar um `BankItem` que já tenha transações
> importadas é **recusado**, e nada é apagado — o histórico financeiro é preservado por decisão de
> produto. `BankItem→Account` é `Cascade` e `Account→Transaction` é `Restrict`, ambos explícitos.
> A contrapartida ainda não existe: não há como "desconectar" um banco. Ver **DT-002** em
> [DEBITO-TECNICO.md](./DEBITO-TECNICO.md) — a Fase 1 ou 6 precisa entregar arquivar/desativar Item,
> porque consentimento de Open Finance expira e Items precisam ser aposentados.

## Fase 1 — Conexão Pluggy
**Critério de pronto:** conecto um banco e o `itemId` fica salvo.

| Task | Título | Status |
|---|---|---|
| [TASK-003](./tasks/TASK-003.md) | Connect Token server-side (`POST /api/connect-token`) | CONCLUÍDA |
| [TASK-004](./tasks/TASK-004.md) | Persistir o BankItem e modelar o estado do Item (resolve DT-009) | CONCLUÍDA |
| — | Widget PluggyConnect + desativar/arquivar banco (resolve DT-002) | PENDENTE |

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
