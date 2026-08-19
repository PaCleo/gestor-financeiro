# TASK-010 — Dashboard: gastos por categoria + resumo do mês (Fase 5)
Status: EM ANDAMENTO | Fase do roadmap: 5

## 0. Contexto técnico obrigatório (leia antes de escrever qualquer linha)

- Stack: **Next 16.2.10** + React 19, **Prisma 7.9.0** com driver adapter, Postgres 16, Vitest,
  Testing Library. Posteriores ao seu treinamento — consulte a documentação instalada.
- Leia `docs/DEBITO-TECNICO.md` (**DT-018** é o coração desta task) e a seção 11 da PREMISSA.
- Padrões: erro de domínio com mensagem fixa; rota casca fina; `ApiResponse<T>`; frontend com
  jsdom opt-in + `cleanup()`; Zod nos params; reconstrução campo a campo (sem spread).
- **DT-004**: `vi.spyOn(prisma, ...)` é engolido pelo Proxy. Mocke módulos inteiros.
- Já existem: `lib/transactions.ts` (`resolveTransactionCategory` = `categoryOverride ?? categoryFromRule ?? category`),
  `Transaction` (com `amount` sinalizado, `category`, `source`, `status`, `date`).
- **Cuidado com fuso (mesmo trap da TASK-007):** o `date` é UTC. Defina os limites do mês de forma
  consistente e documente a convenção. Registrar como caveat se usar UTC puro.

## 1. Objetivo

Responder duas das três perguntas da Visão: **quanto gastei e com o quê** (gastos por categoria) e
o **resumo do mês** (receita, despesa, saldo) — com o DT-018 tratado, senão o número é absurdo.

## 2. O coração da task: DT-018 (exclusão de transferências)

Sondagem real: se somarmos todas as entradas positivas como receita, o número infla ~20× — R$44 mil
em vez dos R$2,3 mil de receita real. A categoria da Pluggy separa isso. **Regra:**

- Uma constante `TRANSFER_CATEGORIES` (documentada) lista as categorias de transferência/pagamento
  observadas nos dados reais: `"Transfers"`, `"Credit card payment"`, `"Same person transfer"`,
  `"Transfer - Cash"`. Transações cuja **categoria CRUA da Pluggy** (`category`, **não** a efetiva)
  está nesse conjunto são **transferências**.
- Transferências são **excluídas dos dois lados**: não entram na receita nem na despesa.
- O que sobra: despesa = soma dos negativos não-transferência; receita = soma dos positivos
  não-transferência.
- **Transparência (não sumir com dinheiro):** o resumo expõe o total e a contagem de transferências
  excluídas, para o usuário auditar.
- A exclusão usa a categoria **crua** de propósito: se o usuário recategorizar uma transferência via
  regra/override, ela **continua** sendo transferência para fins de total (a natureza não muda).

## 3. Comportamento esperado (TDD)

- DADO um mês QUANDO calculo o resumo ENTÃO recebo `{ despesa, receita, saldo, porCategoria[],
  transferenciasExcluidas: { count, total } }`
- DADO uma transação de categoria crua `"Transfers"` (ou outra do conjunto) QUANDO calculo
  ENTÃO ela **não** entra em receita nem em despesa, e conta em `transferenciasExcluidas`
- DADO uma transação `"Non-recurring income"` positiva QUANDO calculo ENTÃO entra na **receita**
- DADO gastos (negativos, não-transferência) QUANDO agrupo ENTÃO `porCategoria` soma por **categoria
  efetiva** (`resolveTransactionCategory`), decrescente por valor gasto
- DADO uma transferência recategorizada pelo usuário (override/regra) para "Mercado" QUANDO calculo
  ENTÃO ela **continua excluída** (a categoria crua ainda é de transferência)
- DADO lançamentos manuais no mês QUANDO calculo ENTÃO eles entram normalmente (não são transferência
  salvo se a categoria crua estiver no conjunto — manuais não têm categoria Pluggy, então nunca)
- DADO transações de outro mês QUANDO calculo o mês X ENTÃO só as de X entram
- DADO `saldo` QUANDO exibo ENTÃO é `receita − despesa` (despesa como valor positivo de saída)

## 4. Critérios de aceite

- [ ] 1. `lib/dashboard.ts` expõe `getMonthlySummary(month: "YYYY-MM")` retornando despesa, receita,
      saldo, `porCategoria[]` e `transferenciasExcluidas { count, total }`
- [ ] 2. `TRANSFER_CATEGORIES` constante documentada; a detecção usa a **categoria crua** (`category`)
- [ ] 3. **DT-018 provado:** teste com transferências (das categorias reais) + receita real + gastos,
      provando que transferências saem dos dois lados e a receita real entra. Sem esse teste, a task não fecha
- [ ] 4. `porCategoria` agrupa por **categoria efetiva** (`resolveTransactionCategory`), decrescente
- [ ] 5. Limites do mês consistentes e documentados (cuidado com fuso — caveat se UTC)
- [ ] 6. `GET /api/dashboard?month=YYYY-MM` casca fina, Zod (mês inválido → 400)
- [ ] 7. Página `/dashboard`: resumo do mês (receita/despesa/saldo), gastos por categoria, e a linha
      de transferências excluídas. Mês selecionável (default: mês corrente). Testing Library
- [ ] 8. Nenhum teste faz chamada de rede real; suíte passa sem `CLIENT_ID`/`CLIENT_SECRET`
- [ ] 9. Nenhum `console.*` em produção
- [ ] 10. Suíte inteira verde (os anteriores sem regressão), `npm run build` e `npm run lint` limpos

## 5. Fora de escopo

- **Fatura do cartão** ("quanto vai fechar") — é a TASK-011
- **"O que falta pagar"** — depende de contas fixas (Fase 4, que estamos pulando); esta task
  responde 2 das 3 perguntas
- Gráficos elaborados / biblioteca de charts (uma lista/barra simples basta no MVP)
- Configurar a lista `TRANSFER_CATEGORIES` pela UI (hardcoded documentado nesta task)
- Orçamento por categoria / metas (fora do MVP)

## 6. Testes (preenchido pelo qa)

Arquivos criados: | Comandos para rodar: | Mapeamento critério → teste:

## 7. Implementação (preenchido pelo coder)

Arquivos alterados: | Decisões tomadas: | Dívidas assumidas:

## 8. Revisão (preenchido pelo code-reviewer)

Veredito: APROVADO | REPROVADO
Problemas encontrados: | Sugestões não-bloqueantes:
