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
| [TASK-005](./tasks/TASK-005.md) | Widget PluggyConnect + desativar banco (resolve DT-002) | CONCLUÍDA |

## Fase 2 — Sync + listagem
**Critério de pronto:** vejo minhas transações reais das instituições conectadas.

| Task | Título | Status |
|---|---|---|
| [TASK-006](./tasks/TASK-006.md) | Sync de Accounts e Transactions (`POST /api/sync`) | CONCLUÍDA |
| [TASK-007](./tasks/TASK-007.md) | Tela de transações com filtros (fecha a Fase 2) | CONCLUÍDA |
| [TASK-008](./tasks/TASK-008.md) | Regras de categorização por CPF/CNPJ (DT-019) | CONCLUÍDA |

## Fase 3 — Lançamentos manuais
**Critério de pronto:** insiro um Pix manual e ele aparece junto com o resto.

| Task | Título | Status |
|---|---|---|
| [TASK-009](./tasks/TASK-009.md) | Lançamentos manuais + conta Dinheiro | CONCLUÍDA |

## Fase 4 — Contas fixas
**Critério de pronto:** vejo o que falta pagar no mês.

| Task | Título | Status |
|---|---|---|
| — | CRUD de recorrências + geração mensal de instâncias + baixa | PENDENTE |

## Fase 5 — Dashboard
**Critério de pronto:** as 3 perguntas da Visão são respondidas em 1 tela.

| Task | Título | Status |
|---|---|---|
| [TASK-010](./tasks/TASK-010.md) | Dashboard: gastos por categoria + resumo do mês (DT-018) | CONCLUÍDA |
| [TASK-011](./tasks/TASK-011.md) | Fatura do cartão (fecha a Fase 5) | CONCLUÍDA |

## Fase 6 — Refinos & usabilidade
**Critério de pronto:** sync automático confiável; app navegável.

| Task | Título | Status |
|---|---|---|
| [TASK-012](./tasks/TASK-012.md) | Navegação entre as telas | CONCLUÍDA |
| — | Webhooks, conciliação manual↔Pluggy, tratamento de expiração de consentimento | PENDENTE |
