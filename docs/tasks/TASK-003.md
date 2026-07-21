# TASK-003 — Connect Token server-side
Status: EM ANDAMENTO | Fase do roadmap: 1

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10**, **Prisma 7.9.0** com driver adapter, Postgres 16 em docker-compose,
  Vitest. Next 16 e Prisma 7 são **posteriores ao seu treinamento** — consulte
  `node_modules/next/dist/docs/01-app/` e `node_modules/prisma` antes de assumir qualquer API.
  O mesmo vale para o **`pluggy-sdk`**, já instalado: leia a tipagem real em
  `node_modules/pluggy-sdk` em vez de escrever de memória.
- Leia `docs/DEBITO-TECNICO.md` antes de reportar qualquer problema como novo.
- Leia a **seção 11 da PREMISSA** (mapeamento Pluggy → nosso modelo). Ela foi escrita a partir da
  documentação oficial e contém armadilhas confirmadas.
- **Nenhum teste automatizado pode chamar a API real da Pluggy.** As credenciais são de contas
  bancárias reais do usuário. Todo teste usa mock construído a partir do formato documentado.

## 1. Objetivo

Entregar o endpoint server-side que gera o Connect Token da Pluggy — o único dado que o frontend
pode receber. É o primeiro ponto do projeto onde as credenciais reais são usadas.

## 2. Comportamento esperado (TDD)

- DADO `CLIENT_ID` e `CLIENT_SECRET` configurados QUANDO chamo `POST /api/connect-token`
  ENTÃO recebo `200` com `{ success: true, data: { accessToken: "..." } }` no formato `ApiResponse<T>`
- DADO essa mesma resposta QUANDO inspeciono o corpo
  ENTÃO ele contém **apenas** o `accessToken` — nada de `CLIENT_ID`, `CLIENT_SECRET`, API Key
  da Pluggy ou qualquer outro campo do payload interno
- DADO `CLIENT_ID` ou `CLIENT_SECRET` ausentes QUANDO chamo o endpoint
  ENTÃO recebo `500` com `success: false` e mensagem genérica — **sem** citar qual variável falta
  nem vazar valor de credencial
- DADO que a Pluggy responde com erro (403, 500, timeout) QUANDO chamo o endpoint
  ENTÃO recebo um erro tratado no formato `ApiResponse<T>`, sem stack trace nem detalhe do SDK
- DADO um `clientUserId` informado QUANDO gero o token
  ENTÃO ele é repassado à Pluggy **dentro de `options`** (`options.clientUserId`), conforme a
  documentação — a seção 6.1 da premissa dizia errado, ver seção 11

## 3. Critérios de aceite

- [ ] 1. `POST /api/connect-token` existe e responde no formato `ApiResponse<T>`
- [ ] 2. A rota é **casca fina**: a integração com o `pluggy-sdk` vive em `lib/` (ex. `lib/pluggy.ts`)
- [ ] 3. Teste prova que a resposta de sucesso contém **somente** `accessToken` — asserção
      explícita de que `CLIENT_ID`, `CLIENT_SECRET` e API Key não aparecem em lugar nenhum do corpo
- [ ] 4. Teste prova que credenciais ausentes → `500` genérico, sem indicar qual variável falta
- [ ] 5. Teste cobre falha da Pluggy (erro HTTP e exceção do SDK) sem vazar stack trace
- [ ] 6. `clientUserId` é repassado em `options.clientUserId`
- [ ] 7. **Nenhum teste faz chamada de rede real** — o `pluggy-sdk` é mockado. Verificável: a suíte
      passa com a rede desligada e sem `CLIENT_ID`/`CLIENT_SECRET` no ambiente
- [ ] 8. Nenhum `console.log` de payload da Pluggy (o retorno contém dados financeiros reais)
- [ ] 9. Suíte inteira verde (os 30 testes anteriores sem regressão), `npm run build` e
      `npm run lint` limpos

## 4. Fora de escopo

- Widget `PluggyConnect` no frontend e qualquer UI
- `POST /api/items` e persistir o `BankItem` (próxima task)
- Sync de accounts/transactions, normalização de sinal, paginação (Fase 2 — ver DT-007 e DT-008)
- Modelagem de `status`/`executionStatus` do Item (DT-009, na task de persistir Item)
- Renovação/cache do token entre requisições
- Autenticação do nosso próprio app

## 5. Testes (preenchido pelo qa)

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 6. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
