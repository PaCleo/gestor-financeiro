# Débito técnico e problemas conhecidos

> Registro dos problemas que decidimos **conscientemente** não resolver agora.
> Mantido pelo orquestrador. Todo achado não-bloqueante de uma revisão entra aqui.
>
> **Para os agentes (qa, coder, code-reviewer):** leiam este arquivo antes de reportar um
> problema como novo. Se o que você encontrou já está listado, referencie o ID em vez de
> tratá-lo como descoberta — e diga se piorou. Se encontrou algo que **não** está aqui,
> reporte normalmente.

## Ativos

| ID | Problema | Origem | Impacto | Status |
|---|---|---|---|---|
| DT-001 | `eslint-disable` pontual em `app/api/health/route.ts` para o parâmetro não usado do handler. Se o padrão se repetir em outras rotas, vale trocar por `argsIgnorePattern: "^_"` na config do ESLint em vez de espalhar diretivas. | Revisão da TASK-001 (2026-07-20) | Cosmético. Nenhum risco funcional ou de segurança. Vira ruído se replicado. | ABERTO — reavaliar quando existirem 3+ API routes |
| DT-002 | Não existe caminho para **desconectar um banco**. Com a política de exclusão da TASK-002 (bloqueio quando há transações), remover um BankItem já sincronizado é impossível pela aplicação — por design, para proteger o histórico. Falta a contrapartida: arquivar/desativar o Item mantendo os dados. | Decisão da TASK-002 (2026-07-21) | Alto para o usuário final assim que houver banco conectado: consentimento de Open Finance expira e o Item precisa ser reconectado ou aposentado. | ABERTO — resolver na Fase 1 ou 6 |
| DT-003 | `onDelete` das relações de `RecurringBill` e `RecurringBillInstance` continua no default implícito do Prisma — mesma origem do problema que a TASK-002 corrige para o fluxo de BankItem. | Revisão da TASK-001 (2026-07-20), escopo reduzido na TASK-002 | Latente. Sem impacto enquanto não houver exclusão de contas fixas (Fase 4). | ABERTO — resolver junto da Fase 4 |
| DT-004 | O `Proxy` de `lib/db.ts` implementa só os traps `get` e `has`. Consequência verificada: **`vi.spyOn(prisma, ...)` não funciona** — a escrita é silenciosamente engolida e o método real executa. Também `Object.keys(prisma)` retorna 0 e a identidade de método é instável (`prisma.$queryRaw !== prisma.$queryRaw`, por causa do `.bind()` a cada acesso). | Revisão da TASK-002 (2026-07-21) | Nenhum hoje: os testes mockam o módulo inteiro. Vira armadilha de depuração confusa na primeira task que tentar stubar o client diretamente. | ABERTO — resolver quando um teste precisar de spy no client |
| DT-005 | A detecção do `P2003` em `lib/bank-item.ts` traduz **qualquer** violação de FK do caminho de exclusão como "BankItem tem transações". Isso é correto só pela topologia atual do schema, não por construção: uma FK futura com `Restrict` apontando para `Account`/`BankItem` produziria a mensagem errada. O nome da constraint está em `error.meta.driverAdapterError.cause.constraint.index` e permite estreitar a checagem. | Revisão da TASK-002 (2026-07-21) | Latente. Ativa-se assim que o schema ganhar novas FKs restritivas nesse caminho — provável na Fase 4. | ABERTO — reavaliar ao adicionar FK restritiva |
| DT-007 | **Sinal do `amount` invertido no cartão de crédito.** A Pluggy devolve gastos de cartão como valores *positivos*; nosso modelo assume `negativo = saída`. Sem normalização, gasto de cartão vira receita no dashboard. | Leitura da documentação (2026-07-21) | **Alto e silencioso** — não quebra nada, só produz números errados. | ABERTO — obrigatório resolver na task de sync (Fase 2), com teste por tipo de conta |
| DT-008 | **Paginação por cursor não tratada.** Transações vêm em páginas de 500 com cursor `next`. Um sync que não pagina trunca em silêncio e parece ter funcionado. | Leitura da documentação (2026-07-21) | Alto para quem tem mais de 500 transações no período. | ABERTO — obrigatório na task de sync (Fase 2) |
| DT-009 | **`BankItem.status` não comporta os dois estados da Pluggy.** Ela expõe `status` e `executionStatus` (~25 valores). `PARTIAL_SUCCESS` significa que um produto falhou — tratá-lo como sucesso esconde dados faltando. | Leitura da documentação (2026-07-21) | Médio. Manifesta-se como "sincronizou mas faltou o cartão", sem aviso. | ABERTO — decidir o modelo ao persistir o Item (Fase 1) |
| DT-010 | **Sem assinatura Pro, `category` e `merchant` chegam `null`.** A premissa listava categorização automática como funcionalidade do MVP; passou a ser manual (seção 2 ajustada). | Confirmado pelo usuário (2026-07-21) | Médio de produto: a pergunta "quanto gastei e com o quê" depende de trabalho manual. | ACEITO — reavaliar se o plano mudar |
| DT-006 | `lib/bank-item.ts` descarta o erro original do Prisma sem registrá-lo em lugar nenhum. Foi necessário para não vazar `Transaction_accountId_fkey` e o `meta` (que expõe `originalMessage`, SQLSTATE `23503` e o nome da constraint), mas custa contexto de diagnóstico. | Revisão da TASK-002 (2026-07-21) | Baixo. Dificulta depurar falhas de exclusão em produção. | ABERTO — resolver quando houver logger; loga o original e resolve o DT-005 junto |

## Resolvidos

| ID | Problema | Resolvido em |
|---|---|---|
| — | — | — |
