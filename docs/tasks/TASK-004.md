# TASK-004 — Persistir o BankItem e modelar o estado do Item
Status: EM ANDAMENTO | Fase do roadmap: 1

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10**, **Prisma 7.9.0** com driver adapter, Postgres 16 em docker-compose,
  Vitest, **`pluggy-sdk`**. Todos posteriores ao seu treinamento — consulte
  `node_modules/next/dist/docs/01-app/`, `node_modules/prisma` e `node_modules/pluggy-sdk`
  antes de assumir qualquer API.
- Leia `docs/DEBITO-TECNICO.md` antes de reportar qualquer problema como novo.
- Leia a **seção 11 da PREMISSA** (mapeamento Pluggy → nosso modelo).
- `lib/pluggy.ts` já existe (TASK-003) e encapsula o SDK. Reaproveite o padrão dele: erros de
  domínio com mensagem fixa, sem interpolar texto do fornecedor.
- **Nenhum teste automatizado pode chamar a API real da Pluggy.** As credenciais são de contas
  bancárias reais. Mock no nível do módulo, como na TASK-003.
- Atenção ao **DT-004**: `lib/db.ts` é um Proxy com traps `get`/`has` apenas, então
  `vi.spyOn(prisma, ...)` é silenciosamente engolido. Mocke o módulo inteiro.

## 1. Objetivo

Receber o `itemId` que o widget devolve, buscar os dados desse Item na Pluggy e persistir o
`BankItem` — resolvendo, no caminho, o **DT-009**: a Pluggy expõe dois campos de estado e nosso
modelo tinha um só.

## 2. Comportamento esperado (TDD)

- DADO um `pluggyItemId` válido QUANDO chamo `POST /api/items`
  ENTÃO o `BankItem` é persistido com o nome da instituição, `status` e `executionStatus` crus
  da Pluggy, e recebo `201` no formato `ApiResponse<T>`
- DADO um `pluggyItemId` que **já existe** na base QUANDO chamo `POST /api/items` de novo
  ENTÃO **não duplica** — o registro existente é atualizado com o estado novo
- DADO um Item cujo `executionStatus` é `PARTIAL_SUCCESS` QUANDO persisto
  ENTÃO o estado derivado é `PARCIAL`, **nunca** `OK` — um produto falhou e isso não é sucesso
- DADO um Item com `status` `WAITING_USER_INPUT` ou `LOGIN_ERROR` QUANDO derivo o estado
  ENTÃO recebo `PRECISA_ACAO`, sinalizando que depende do usuário
- DADO um `status`/`executionStatus` **desconhecido** (a Pluggy pode adicionar valores novos)
  QUANDO derivo o estado ENTÃO recebo um estado seguro e o valor cru continua persistido —
  nada de quebrar nem de assumir sucesso
- DADO um payload inválido (sem `pluggyItemId`, ou com formato não-UUID)
  QUANDO chamo o endpoint ENTÃO recebo `400` no formato `ApiResponse<T>`, sem persistir nada
- DADO que a Pluggy responde erro (404, 500, timeout) QUANDO chamo o endpoint
  ENTÃO **nada é persistido** e recebo erro tratado, sem vazar detalhe do SDK
- DADO o payload da Pluggy contendo `taxNumber` (CPF do titular)
  QUANDO persisto ENTÃO esse dado **não** é gravado em lugar nenhum

## 3. Critérios de aceite

- [ ] 1. `POST /api/items` existe, valida o corpo com **Zod** e responde no formato `ApiResponse<T>`
- [ ] 2. A rota é **casca fina**: a lógica vive em `lib/` (ex. `lib/bank-item.ts`, que já existe)
- [ ] 3. `prisma/schema.prisma` ganha o campo `executionStatus` no `BankItem`, com migration
      gerada e aplicada (**resolve o DT-009**)
- [ ] 4. `lib/` expõe a derivação do estado — `OK` | `SINCRONIZANDO` | `PRECISA_ACAO` | `ERRO` |
      `PARCIAL` — a partir de `status` + `executionStatus`, com teste cobrindo **cada** valor
      documentado na seção 11, incluindo `PARTIAL_SUCCESS` → `PARCIAL` e um valor desconhecido
- [ ] 5. Idempotência provada por teste: chamar duas vezes com o mesmo `pluggyItemId` deixa
      **um** registro, com o estado atualizado — a constraint `@unique` não pode virar erro 500
- [ ] 6. Teste prova que falha da Pluggy **não deixa registro parcial** no banco
- [ ] 7. Teste prova que `taxNumber` (e qualquer PII do payload) não é persistido
- [ ] 8. Nenhum teste faz chamada de rede real; a suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 9. Nenhum `console.*` (o payload da Pluggy contém dados financeiros reais)
- [ ] 10. Suíte inteira verde (os 64 testes anteriores sem regressão), `npm run build` e
      `npm run lint` limpos

## 4. Fora de escopo

- **Widget PluggyConnect e qualquer UI** — é a TASK-005
- **Desativar/arquivar banco (DT-002)** — decisão do usuário: fica para a TASK-005
- Persistir `Account`s e `Transaction`s, e o sync em si (Fase 2 — ver DT-007 e DT-008)
- Webhooks e atualização automática de status
- Autenticação do nosso próprio app

## 5. Testes (preenchido pelo qa)

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 6. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
