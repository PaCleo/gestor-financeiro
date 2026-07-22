# TASK-005 — Widget PluggyConnect e desativar banco (fecha a Fase 1)
Status: EM ANDAMENTO | Fase do roadmap: 1

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16,
  Vitest, `pluggy-sdk`, `react-pluggy-connect`. Todos posteriores ao seu treinamento —
  consulte `node_modules/next/dist/docs/01-app/`, `node_modules/prisma`,
  `node_modules/pluggy-sdk` e `node_modules/react-pluggy-connect` antes de assumir qualquer API.
  **Esta é a primeira task com componentes React** — confira em `01-app` como Server e Client
  Components funcionam nesta versão antes de escrever `"use client"` por hábito.
- Leia `docs/DEBITO-TECNICO.md` antes de reportar qualquer problema como novo.
- Leia a **seção 11 da PREMISSA** (mapeamento da API e estados do Item).
- Já existem e devem ser reaproveitados: `POST /api/connect-token` (TASK-003),
  `POST /api/items` e `lib/bank-item.ts` (TASK-004).
- **Nenhum teste automatizado pode chamar a API real da Pluggy.**
- **DT-004**: `lib/db.ts` é Proxy com traps `get`/`has`; `vi.spyOn(prisma, ...)` é engolido.
  Mocke módulos inteiros.
- **DT-013**: coluna nova em tabela que pode ter dados deve ser nullable, ou com default.
  O `archivedAt` é naturalmente nullable — mantenha assim.
- **ADR 6**: contas reais, sem sandbox. **Não** use `includeSandbox` no widget.

## 1. Objetivo

Fechar a Fase 1: permitir conectar um banco pelo widget e **desativá-lo** — resolvendo o
**DT-002**, que hoje deixa um banco conectado sem nenhuma saída pela aplicação.

## 2. Comportamento esperado (TDD)

### Conectar
- DADO a página de bancos QUANDO clico em "Conectar banco"
  ENTÃO o widget abre usando um Connect Token obtido de `POST /api/connect-token`
- DADO o widget concluído com sucesso QUANDO recebo o `itemId` no `onSuccess`
  ENTÃO ele é enviado a `POST /api/items` e o banco aparece na lista com seu estado
- DADO o widget falhando (`onError`) QUANDO o erro chega
  ENTÃO vejo mensagem clara e a opção de tentar de novo — **sem** vazar detalhe técnico
- DADO que `/api/connect-token` falha QUANDO tento conectar
  ENTÃO vejo erro tratado e o widget **não** abre

### Desativar (DT-002)
- DADO um banco conectado QUANDO o desativo
  ENTÃO o Item é deletado **na Pluggy** e só depois o `BankItem` é marcado como arquivado
- DADO que a deleção na Pluggy falha QUANDO tento desativar
  ENTÃO **nada muda localmente** — o banco continua ativo e posso tentar de novo
- DADO um Item que já não existe na Pluggy (404) QUANDO desativo
  ENTÃO o arquivamento local acontece mesmo assim — o objetivo (parar de compartilhar) já está
  satisfeito e não faz sentido travar
- DADO um banco arquivado QUANDO listo os bancos
  ENTÃO ele **não** aparece, mas suas transações e o histórico continuam na base
- DADO um banco arquivado QUANDO um sync futuro rodar
  ENTÃO ele é ignorado

## 3. Critérios de aceite

- [ ] 1. `BankItem` ganha `archivedAt DateTime?` (nullable, conforme DT-013), com migration
- [ ] 2. `DELETE /api/items/[id]` existe, responde em `ApiResponse<T>` e é casca fina
- [ ] 3. **A ordem é obrigatória e testada**: deletar na Pluggy → só então arquivar local. Teste
      prova que, se a Pluggy falhar, o `BankItem` continua **não** arquivado (nunca some da UI
      um banco que segue compartilhando dados)
- [ ] 4. Teste prova que 404 da Pluggy (Item já inexistente) resulta em arquivamento local bem-sucedido
- [ ] 5. Arquivar é **idempotente**: desativar duas vezes não quebra nem altera o `archivedAt` original
- [ ] 6. A listagem de bancos exclui arquivados; teste prova que o registro e suas relações
      continuam na base
- [ ] 7. Componente do widget testado com **Testing Library** e `react-pluggy-connect` mockado:
      estado de carregando, `onSuccess` chamando `POST /api/items`, `onError` exibindo mensagem
      tratada, e falha do connect-token não abrindo o widget
- [ ] 8. Página que lista os bancos conectados com seu estado derivado (`OK`, `PRECISA_ACAO`…)
      e permite conectar e desativar
- [ ] 9. O Connect Token **nunca** é logado nem persistido; nenhum `console.*` em produção
- [ ] 10. `includeSandbox` não é usado (ADR 6)
- [ ] 11. Nenhum teste faz chamada de rede real; a suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 12. Suíte inteira verde (os 159 anteriores sem regressão), `npm run build` e
      `npm run lint` limpos

## 4. Fora de escopo

- Sync de `Account`s e `Transaction`s (Fase 2 — DT-007 sinal do `amount`, DT-008 paginação)
- Reconectar/atualizar Item com consentimento expirado (`updateItem`)
- Desarquivar um banco pela UI
- Webhooks
- Autenticação do nosso app
- Estilização elaborada — a UI desta task é funcional, não um design final

## 5. Testes (preenchido pelo qa)

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 6. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
