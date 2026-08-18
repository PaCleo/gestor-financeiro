# Débito técnico e problemas conhecidos

> Registro dos problemas que decidimos **conscientemente** não resolver agora.
> Mantido pelo orquestrador. Todo achado não-bloqueante de uma revisão entra aqui.
>
> **Para os agentes (qa, coder, code-reviewer):** leiam este arquivo antes de reportar um
> problema como novo. Se o que você encontrou já está listado, referencie o ID em vez de
> tratá-lo como descoberta — e diga se piorou. Se encontrou algo que **não** está aqui,
> reporte normalmente.
>
> **Ao resolver um item, mova-o da tabela "Ativos" para "Resolvidos"** (com a task/data que
> resolveu), como parte de fechar a task.

## Regras permanentes (extraídas de débitos resolvidos)

- **Migration com coluna nova** em tabela que pode ter dados: **nullable**, ou **com `DEFAULT`**,
  ou `nullable → backfill → SET NOT NULL`. Nunca `NOT NULL` sem default (quebra em tabela populada).
  Origem: DT-013.

## Ativos

| ID | Problema | Origem | Impacto | Status |
|---|---|---|---|---|
| DT-001 | `eslint-disable` pontual em `app/api/health/route.ts` para o parâmetro não usado do handler. Se o padrão se repetir em outras rotas, vale trocar por `argsIgnorePattern: "^_"` na config do ESLint em vez de espalhar diretivas. | Revisão da TASK-001 (2026-07-20) | Cosmético. Nenhum risco funcional ou de segurança. Vira ruído se replicado. | ABERTO — reavaliar quando existirem 3+ API routes |
| DT-003 | `onDelete` das relações de `RecurringBill` e `RecurringBillInstance` continua no default implícito do Prisma — mesma origem do problema que a TASK-002 corrige para o fluxo de BankItem. | Revisão da TASK-001 (2026-07-20), escopo reduzido na TASK-002 | Latente. Sem impacto enquanto não houver exclusão de contas fixas (Fase 4). | ABERTO — resolver junto da Fase 4 |
| DT-004 | O `Proxy` de `lib/db.ts` implementa só os traps `get` e `has`. Consequência verificada: **`vi.spyOn(prisma, ...)` não funciona** — a escrita é silenciosamente engolida e o método real executa. Também `Object.keys(prisma)` retorna 0 e a identidade de método é instável (`prisma.$queryRaw !== prisma.$queryRaw`, por causa do `.bind()` a cada acesso). | Revisão da TASK-002 (2026-07-21) | Nenhum hoje: os testes mockam o módulo inteiro. Vira armadilha de depuração confusa na primeira task que tentar stubar o client diretamente. | ABERTO — resolver quando um teste precisar de spy no client |
| DT-005 | A detecção do `P2003` em `lib/bank-item.ts` traduz **qualquer** violação de FK do caminho de exclusão como "BankItem tem transações". Isso é correto só pela topologia atual do schema, não por construção: uma FK futura com `Restrict` apontando para `Account`/`BankItem` produziria a mensagem errada. O nome da constraint está em `error.meta.driverAdapterError.cause.constraint.index` e permite estreitar a checagem. | Revisão da TASK-002 (2026-07-21) | Latente. Ativa-se assim que o schema ganhar novas FKs restritivas nesse caminho — provável na Fase 4. | ABERTO — reavaliar ao adicionar FK restritiva |
| DT-006 | **Erros originais de fornecedores são descartados sem registro.** `lib/bank-item.ts` descarta o erro do Prisma (necessário: o `meta` expõe `originalMessage`, SQLSTATE `23503` e o nome da constraint) e `lib/pluggy.ts` descarta o erro do SDK da Pluggy (necessário: não dá para confiar no texto do fornecedor). Em ambos, o trade-off é consciente, mas não há nenhum registro server-side do que de fato aconteceu. | Revisão da TASK-002 e ampliado na TASK-003 (2026-07-21) | **Médio:** falhas de rede, 403 e timeout da Pluggy ficam sem rastro, o que torna diagnóstico de "não consigo conectar meu banco" quase impossível. | ABERTO — resolver quando houver logger: logar o original nos dois módulos, o que resolve o DT-005 junto |
| DT-011 | **Asserções de segurança verdes por construção.** Uma asserção de não-vazamento que roda contra um payload que jamais poderia conter o valor proibido passa por ausência de mecanismo, não por proteção. | Revisão da TASK-003 (2026-07-21) | Médio e insidioso: teste de segurança que não pode falhar gera confiança sem lastro. | PARCIALMENTE RESOLVIDO / regra permanente — toda asserção de não-vazamento precisa rodar sobre um payload que **realmente contenha** o valor proibido. Reforçar caso a caso |
| DT-012 | O SDK da Pluggy honra `process.env.PLUGGY_API_URL` como base URL (fallback `https://api.pluggy.ai`). Não há uso indevido hoje, mas essa variável **redireciona para onde as credenciais reais são enviadas**. | Revisão da TASK-003 (2026-07-21) | Alto **se** algum dia for definida a partir de configuração não confiável. Nulo hoje. | ACEITO — nunca definir a partir de entrada não confiável e nunca incluir no `.env.example` como ajustável |
| DT-014 | **A regra 5 de `deriveBankItemState` é inverificável.** R5 e R6 retornam ambas `"ERRO"`, então os 15 valores de `ERROR_EXECUTION_STATUSES`, o `CREATE_ERROR` e o `OUTDATED` não alteram nenhuma saída. Comprovado: reimplementando a função **sem a regra 5 inteira**, houve 0 divergências nas 615 combinações. | Revisão da TASK-004 (2026-07-21) | Latente hoje. Vira concreto se alguém introduzir um estado `DESCONHECIDO` distinto de `ERRO`. | ABERTO — mesmo padrão do DT-011. Reavaliar ao adicionar qualquer estado novo |
| DT-016 | A UI de `/bancos` não reflete conectar/desativar sem reload manual: nem `ConnectBankButton` nem `DeactivateBankButton` chamam `router.refresh()`. | Revisão da TASK-005 (2026-07-25) | Baixo. Aceitável para UI funcional; primeira coisa a corrigir quando o frontend evoluir. | ABERTO — resolver na fase de refino de UI |
| DT-018 | **Pagamento de fatura e transferência entre contas próprias inflam "receita" na camada de relatório.** A normalização do DT-007 (CREDIT inverte sempre) está correta no sync, mas faz um pagamento de fatura entrar como valor positivo — a perna-espelho de uma transferência no modelo plano (ADR 2). Não corrompe os totais de despesa, mas o dashboard que somar positivos como receita vai inflar o número. | Revisão da TASK-006 (2026-08-13) | Latente hoje; concreto na Fase 5. | ABERTO — o dashboard (Fase 5) deve excluir transferências/pagamentos de fatura do cálculo de receita |
| DT-019 | **Regras de categorização por contraparte (CPF/CNPJ).** Precedência: `categoryOverride` → regra por documento → `category` Pluggy. Desenho decidido (2026-08-13): o casamento acontece **no sync** (documento transitório no payload), e a transação grava **só a categoria resolvida**, nunca o documento (respeita DT-017). A tabela de regras guarda **hash** do CPF/CNPJ + categoria. Consequência aceita: regra nova só vale a partir do próximo sync. | Decisão do usuário (2026-08-13) | Feature nova. | **EM ANDAMENTO — TASK-008** |
| DT-020 | **Página `/transacoes` não trata `AccountNotFoundError`.** Uma URL salva/favoritada com `accountId` de uma conta depois excluída lança `AccountNotFoundError` e cai na error boundary do Next, em vez de degradar para o filtro padrão. A rota (`GET /api/transactions`) trata corretamente (400); só a página não. | Revisão da TASK-007 (2026-08-18) | Baixo e latente: não há como favoritar/persistir filtro hoje. | ABERTO — família DT-016, resolver na fase de refino de UI (try/catch na página → filtro padrão) |

## Resolvidos

| ID | Problema | Resolvido em |
|---|---|---|
| DT-002 | Não havia caminho para desconectar um banco. | **TASK-005** (2026-07-25) — desativar deleta o Item na Pluggy e arquiva o `BankItem` (`archivedAt`), preservando o histórico. |
| DT-007 | Sinal do `amount` invertido no cartão de crédito. | **TASK-006** (2026-08-13) — `normalizeTransactionSign` inverte para conta `CREDIT`. Verificado nos dados reais: cartão com 383 negativas / 28 positivas. |
| DT-008 | Endpoint de transação antigo (deprecado), paginação por página. | **TASK-006** (2026-08-13) — usa `fetchAllTransactions` (cursor interno). |
| DT-009 | `BankItem.status` não comportava os dois estados da Pluggy. | **TASK-004** (2026-07-21) — persiste `status` + `executionStatus` crus; `deriveBankItemState` deriva o estado (`PARTIAL_SUCCESS` nunca vira `OK`). |
| DT-010 | Dúvida se `category` viria `null` sem Pro. | **TASK-006/007** (2026-08-13/18) — dados reais vêm preenchidos (432/432); decidido confiar na categoria da Pluggy como fallback. Resolução `categoryOverride ?? category` na TASK-007; a regra por CPF/CNPJ é o DT-019/TASK-008. |
| DT-013 | Migration `NOT NULL` sem default só funciona em tabela vazia. | **TASK-006** (2026-08-13) — a migration de `balance`/`status` usou nullable/`DEFAULT` corretamente. O padrão virou **regra permanente** (topo deste arquivo). A migration antiga da TASK-004 permanece (inalcançável); não reescrita para não divergir checksum. |
| DT-015 | Detecção de 404 da Pluggy assumia shape que o SDK não produz. | **TASK-005** (2026-07-25) — corrigida dentro da própria task após sondagem real (`code`/`codeDescription`, nunca `statusCode`). |
| DT-017 | PII (CPF/CNPJ) no `paymentData` da transação. | **TASK-006** (2026-08-13) — de `paymentData` extrai-se só `paymentMethod`; documentos/nomes descartados; `taxNumber` não persistido. Verificado: 0 documentos no banco após sync real. |
