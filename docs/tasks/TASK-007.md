# TASK-007 — Tela de transações com filtros (fecha a Fase 2)
Status: EM ANDAMENTO | Fase do roadmap: 2

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16, Vitest,
  Testing Library. Todos posteriores ao seu treinamento — consulte `node_modules/next/dist/docs/01-app/`,
  `node_modules/prisma` antes de assumir qualquer API.
- Leia `docs/DEBITO-TECNICO.md` e a **seção 11 da PREMISSA**.
- Padrões de frontend já estabelecidos na TASK-005: `jsdom` opt-in por arquivo via docblock
  `/** @vitest-environment jsdom */`; ambiente global segue `node`; com `globals: false`, cada teste
  de componente chama `cleanup()` explicitamente. Reaproveite.
- **DT-004**: `vi.spyOn(prisma, ...)` é engolido pelo Proxy. Mocke módulos inteiros.
- **DT-018**: pagamento de fatura/transferência entra com `amount` positivo. **Esta task não
  calcula receita/despesa agregada** (é Fase 5), então não precisa tratar isso — mas não introduza
  nenhum totalizador que some positivos como receita.
- Já existem: `lib/sync.ts`, `lib/db.ts`, os models `Account`/`Transaction` com dados reais no banco.

## 1. Objetivo

Fechar a Fase 2: uma tela onde o usuário **vê** as transações sincronizadas, com filtros — cumprindo
o critério de pronto da fase ("vejo minhas transações reais das instituições conectadas").

## 2. Comportamento esperado (TDD)

- DADO transações sincronizadas QUANDO abro a tela ENTÃO vejo a lista com data, descrição, valor
  (com sinal), conta, método e a categoria efetiva
- DADO uma transação com `categoryOverride` preenchido QUANDO a exibo ENTÃO a categoria mostrada é
  o `categoryOverride`; **senão**, a `category` da Pluggy (precedência override → Pluggy) — **DT-010**
- DADO uma transação `PENDING` QUANDO a exibo ENTÃO ela é visualmente distinguível de `POSTED`
  (a compra existe mas ainda não fechou)
- DADO o filtro por conta QUANDO seleciono uma conta ENTÃO vejo só as transações daquela conta
- DADO o filtro por período (data inicial/final) QUANDO aplico ENTÃO vejo só as transações no intervalo
- DADO muitas transações (o Item real tem 432) QUANDO abro a tela ENTÃO ela **pagina** ou limita de
  forma sã — não despeja centenas de linhas nem faz uma query sem limite
- DADO a consulta QUANDO ela retorna ENTÃO **nenhum** campo de PII (a task anterior já garantiu que
  não há CPF/CNPJ no banco; esta não pode reintroduzir nada disso na resposta)

## 3. Critérios de aceite

- [ ] 1. `GET /api/transactions` (casca fina) com filtros por conta e por período, e paginação;
      a query vive em `lib/` (ex. `lib/transactions.ts`), validada com **Zod** nos parâmetros
- [ ] 2. A categoria efetiva é resolvida em `lib/` como `categoryOverride ?? category`; teste cobre
      os dois casos (override presente e ausente)
- [ ] 3. Página (ex. `/transacoes`) que lista as transações e oferece os filtros de conta e período
- [ ] 4. Paginação real: a query usa `take`/`skip` (ou cursor) com um limite padrão; teste prova que
      não retorna a tabela inteira de uma vez
- [ ] 5. `PENDING` é visualmente distinto de `POSTED` na tela; teste de componente cobre
- [ ] 6. Ordenação por data decrescente (mais recentes primeiro) por padrão
- [ ] 7. Componentes testados com Testing Library; a query testada contra o Postgres real
- [ ] 8. Nenhum teste faz chamada de rede real; a suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 9. Nenhum `console.*` em produção
- [ ] 10. Suíte inteira verde (os anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 4. Fora de escopo

- **Regras de categorização por CPF/CNPJ** — é a TASK-008 (DT-019); aqui a categoria é só
  `categoryOverride ?? category`
- Editar/atribuir `categoryOverride` pela tela (pode virar parte da TASK-008 ou task própria)
- Totais por categoria, receita/despesa agregada, gráficos — Fase 5 (cuidado com DT-018)
- Fatura do cartão agrupada — Fase 5
- Disparar o sync pela tela (o `POST /api/sync` já existe; um botão é opcional e não é o foco)
- Lançamento manual de transação — Fase 3

## 5. Testes (preenchido pelo qa)

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 6. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 7. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
