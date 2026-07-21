# 💰 Projeto: Gestor Financeiro Pessoal (MVP)

> Documento de premissa — versão 0.1 · Julho/2026
> Este documento define o que estamos construindo, como, e por quê. Ele evolui junto com o projeto.

---

## 1. Visão

Um app pessoal para centralizar toda a vida financeira em um só lugar:

- **Automático:** transações, saldos e fatura de cartão importados via **Pluggy (Open Finance)** das **instituições financeiras conectadas**, vinculadas ao CPF do usuário.
- **Manual:** lançamentos que não vêm (ou ainda não vieram) do Open Finance — Pix avulsos, transferências, dinheiro, ajustes.
- **Recorrente:** contas fixas mensais (luz, água, gás, condomínio, aluguel) cadastradas uma vez e geradas automaticamente todo mês, com status de "pendente/pago".

O objetivo do MVP é responder três perguntas todos os dias:
1. **Quanto eu gastei este mês e com o quê?**
2. **O que ainda falta pagar este mês?**
3. **Quanto vai fechar minha fatura do cartão?**

---

## 2. Escopo do MVP

### Entra no MVP ✅
| Funcionalidade | Descrição |
|---|---|
| Conectar bancos | Widget Pluggy Connect para vincular as instituições (1 Item por banco) |
| Sincronizar transações | Importar transações de conta corrente e cartão de crédito via API Pluggy |
| Fatura do cartão | Visualizar transações do cartão agrupadas por fatura/mês |
| Lançamento manual | Inserir Pix, transferência, débito, dinheiro (valor, data, descrição, categoria, conta) |
| Contas fixas | Cadastrar recorrências mensais (aluguel, luz, água, gás, condomínio…) com dia de vencimento e valor estimado |
| Marcar como pago | Dar baixa numa conta fixa — manualmente ou vinculando a uma transação importada |
| Dashboard | Total do mês por categoria, contas pendentes, saldo por conta |
| Categorias | **Categorização manual** — a categorização automática da Pluggy exige assinatura Pro, que não temos: o campo `category` chega `null`. Ver seção 11. |

### Fica para depois ⏭️
- Múltiplos usuários / login social (MVP é single-user com auth simples)
- Metas de orçamento por categoria
- Investimentos (Pluggy suporta, mas não é o foco agora)
- Notificações / lembretes de vencimento
- Iniciar pagamentos pelo app (Pluggy Payments / Pix Automático)
- App mobile (MVP é web responsivo)

---

## 3. Conceitos Pluggy (resumo da documentação)

> Fonte: https://docs.pluggy.ai — ler também o Glossary e a seção "Open Finance Connectors".

| Conceito | O que é | Como usamos |
|---|---|---|
| **Connector** | Integração com uma instituição financeira | Conectores Open Finance das instituições conectadas |
| **Item** | Uma conexão criada via consentimento do usuário em um Connector. É a porta de entrada para os dados | Teremos 1 Item por instituição conectada. O `itemId` retornado no `onSuccess` do widget é salvo no nosso banco |
| **Account** | Conta bancária ou cartão de crédito dentro de um Item | Cada Item pode trazer conta corrente + cartão. Salvamos os `accountId`s |
| **Transaction** | Movimentação de uma Account | É o que sincronizamos periodicamente |
| **Credit Card Bill** | Fatura do cartão | Base da visão "minha fatura" |
| **API Key** | Secret de servidor, expira em **2 horas**. Gerada com `CLIENT_ID` + `CLIENT_SECRET` | Só existe no backend. O SDK (`pluggy-sdk`) gerencia isso |
| **Connect Token** | Token de curta duração (**30 min**) para o frontend abrir o widget. Acesso restrito | Gerado no endpoint `POST /api/connect-token` (server-side) |

### Regra de ouro de segurança 🔐
`CLIENT_ID` e `CLIENT_SECRET` vivem **apenas** em variáveis de ambiente do servidor (`.env.local`, nunca commitado). O browser só recebe o **Connect Token**, que expira em 30 minutos e tem acesso restrito. Nunca prefixar essas variáveis com `NEXT_PUBLIC_`.

### Ciclo de vida da conexão
1. Usuário abre o widget → autentica no banco → dá consentimento (Open Finance).
2. Widget retorna `itemData.item.id` no `onSuccess` → enviamos ao backend e persistimos.
3. Backend usa o `itemId` para listar Accounts e Transactions.
4. Consentimentos de Open Finance **expiram** — o Item precisa ser atualizado/reconectado periodicamente (ver "Updating an Item" e "Consents and expiration" na doc). Tratar o status do Item (`UPDATED`, `LOGIN_ERROR`, `OUTDATED`…) na UI.
5. Configurar **Webhooks** (fase 2) para saber quando um Item foi atualizado, em vez de fazer polling.

---

## 4. Arquitetura

```
┌─────────────────────────────────────────────────────┐
│  Next.js (App Router)                               │
│                                                     │
│  Frontend (React)              API Routes (server)  │
│  ┌──────────────────┐          ┌──────────────────┐ │
│  │ Dashboard        │  fetch   │ /api/connect-    │ │
│  │ PluggyConnect ───┼─────────▶│   token          │ │
│  │ Lançamentos      │          │ /api/items       │ │
│  │ Contas fixas     │          │ /api/sync        │ │
│  │ Fatura           │          │ /api/entries     │ │
│  └──────────────────┘          │ /api/recurring   │ │
│                                └────────┬─────────┘ │
└─────────────────────────────────────────┼───────────┘
                                          │ pluggy-sdk
                              ┌───────────▼──────────┐
                              │  Pluggy API          │
                              │  (Open Finance)      │
                              │  Instituições        │
                              └──────────────────────┘
                                          │
                              ┌───────────▼──────────┐
                              │  Banco de dados      │
                              │  (SQLite/Postgres    │
                              │   via Prisma)        │
                              └──────────────────────┘
```

### Stack sugerida
- **Next.js 14+ (App Router) + TypeScript** — já é o formato dos exemplos da Pluggy
- **Prisma + SQLite** no MVP (troca para Postgres depois sem dor)
- **pluggy-sdk** (backend) + **react-pluggy-connect** (frontend)
- **Tailwind + shadcn/ui** para a UI
- **Zod** para validar payloads dos endpoints

---

## 5. Modelo de dados (rascunho)

A decisão central do projeto: **tudo vira uma "Transação" na nossa base**, independente da origem. O campo `source` diferencia.

```prisma
model BankItem {          // conexão Pluggy (1 por banco)
  id           String   @id @default(cuid())
  pluggyItemId String   @unique   // itemData.item.id do onSuccess
  institution  String              // nome da instituição
  status       String              // UPDATED, LOGIN_ERROR...
  lastSyncAt   DateTime?
  accounts     Account[]
}

model Account {           // conta corrente ou cartão
  id              String  @id @default(cuid())
  pluggyAccountId String? @unique  // null se for conta manual (ex: "Dinheiro")
  bankItemId      String?
  name            String           // "Banco Teste Conta", "Banco Teste Cartão"...
  type            String           // CHECKING | CREDIT_CARD | CASH
  transactions    Transaction[]
}

model Transaction {
  id                 String   @id @default(cuid())
  pluggyTransactionId String? @unique  // chave de deduplicação no sync
  accountId          String
  date               DateTime
  description        String
  amount             Decimal           // negativo = saída
  category           String?           // categoria Pluggy ou manual
  categoryOverride   String?           // recategorização do usuário
  source             String            // PLUGGY | MANUAL
  method             String?           // PIX | TED | DEBIT | CREDIT | CASH
  recurringBillId    String?           // se essa transação quitou uma conta fixa
}

model RecurringBill {    // contas fixas
  id          String  @id @default(cuid())
  name        String            // "Aluguel", "Luz", "Condomínio"...
  amount      Decimal           // valor estimado
  dueDay      Int               // dia do vencimento (1-31)
  method      String            // PIX | BOLETO | DEBIT_AUTO
  active      Boolean @default(true)
  instances   RecurringBillInstance[]
}

model RecurringBillInstance {  // "a conta de luz de julho/2026"
  id             String   @id @default(cuid())
  recurringBillId String
  month          String            // "2026-07"
  status         String            // PENDING | PAID | OVERDUE
  paidAmount     Decimal?
  transactionId  String?  @unique  // link com a transação que pagou
}
```

### Ponto de atenção: deduplicação ⚠️
Se o usuário lança um Pix manualmente **e** o mesmo Pix chega depois pelo sync da Pluggy, teremos duplicidade. Estratégia do MVP:
1. `pluggyTransactionId` único evita duplicar no sync.
2. Na tela de conciliação, sugerir "match" entre lançamento manual e transação importada (mesmo valor ± data próxima) e permitir fundir os dois.
3. Regra prática: **para contas conectadas via Pluggy, preferir importar em vez de digitar** — o lançamento manual é para dinheiro, contas não conectadas e antecipações.

---

## 6. Fluxos principais

### 6.1 Conectar um banco
```
Usuário clica "Conectar banco"
→ Frontend chama POST /api/connect-token (envia clientUserId = CPF/ID interno)
→ Backend cria Connect Token via pluggy.createConnectToken()
→ Widget PluggyConnect abre → usuário escolhe a instituição → consentimento
→ onSuccess retorna itemData.item.id
→ Frontend envia POST /api/items { pluggyItemId, institution }
→ Backend salva BankItem e dispara primeira sincronização
```
Tratar `onError` (MFA, credenciais inválidas, timeout) com mensagem clara e opção de tentar de novo — o próprio aviso da doc reforça isso.

> **Nota:** em produção (dados reais do seu CPF), remover `includeSandbox={true}` do widget. O sandbox serve para desenvolver sem tocar nas contas reais.

### 6.2 Sincronizar transações
```
POST /api/sync (manual no MVP; cron/webhook na fase 2)
→ Para cada BankItem: listar Accounts → listar Transactions (desde lastSyncAt)
→ Upsert por pluggyTransactionId
→ Tentar auto-vincular a RecurringBillInstance pendente (valor/descrição similares)
→ Atualizar lastSyncAt e status do Item
```

### 6.3 Lançamento manual
```
Formulário: valor, data, descrição, conta, método (PIX/TED/dinheiro), categoria
→ POST /api/entries → cria Transaction com source = MANUAL
```

### 6.4 Contas fixas
```
Cadastro: nome, valor estimado, dia de vencimento, método
→ Todo início de mês (ou on-demand), gerar RecurringBillInstance PENDING
→ Dar baixa: manual ("marquei como pago") ou vinculando uma Transaction
→ Dashboard mostra: pagas / pendentes / vencidas do mês
```

---

## 7. Variáveis de ambiente

```bash
# .env.local (NUNCA commitar — adicionar ao .gitignore)
CLIENT_ID=seu_client_id_do_dashboard_pluggy
CLIENT_SECRET=seu_client_secret_do_dashboard_pluggy
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gestor?schema=public"
```
O Postgres de desenvolvimento sobe via `docker compose up -d` (ver `docker-compose.yml`). Os testes usam um database separado (`gestor_test`) no mesmo servidor.

Credenciais são obtidas no [Dashboard da Pluggy](https://dashboard.pluggy.ai/). Manter um `.env.example` no repositório com as chaves vazias para documentar o que é necessário.

---

## 8. Roadmap

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **0. Fundação** | Repo Next.js + TS + Prisma + schema inicial + `.env` | `npm run dev` sobe, migrations aplicadas |
| **1. Conexão Pluggy** | `/api/connect-token`, widget, salvar Item (direto em contas reais, sem sandbox) | Conecto um banco e o `itemId` fica salvo |
| **2. Sync + listagem** | `/api/sync`, tela de transações com filtros | Vejo minhas transações reais das instituições conectadas |
| **3. Lançamentos manuais** | CRUD de transações manuais + conta "Dinheiro" | Insiro um Pix manual e ele aparece junto com o resto |
| **4. Contas fixas** | CRUD de recorrências + geração mensal + baixa | Vejo o que falta pagar no mês |
| **5. Dashboard** | Totais por categoria, fatura do cartão, pendências | As 3 perguntas da Visão são respondidas em 1 tela |
| **6. Refinos** | Webhooks, conciliação manual↔Pluggy, tratamento de expiração de consentimento | Sync automático confiável |

---

## 9. Restrições operacionais da API (confirmadas antes da Fase 1)

Estas restrições **moldam o desenho do sync** — não são detalhe de infraestrutura.

| Restrição | Valor | Consequência de projeto |
|---|---|---|
| Rate limit | ~30 requisições/minuto | Folga confortável. Não é o fator limitante. |
| Concorrência desejada | **1 requisição por vez** | Nada de disparar chamadas em paralelo por Account. O sync percorre as contas em série. |
| Frequência de atualização na origem | **1× por dia, de madrugada** | Este é o fator limitante real. Sincronizar duas vezes no mesmo dia devolve **os mesmos dados**. Logo: o sync é diário, e chamadas repetidas no mesmo dia são desperdício — devem ser evitadas por `lastSyncAt`, não por confiança no usuário. |
| Ambiente | **Contas reais, sem sandbox** | Não usar `includeSandbox` no widget. Todo teste automatizado usa dados fabricados no nosso Postgres; a API real nunca é chamada em teste. |

### Verificações ainda pendentes
- [ ] **Cobertura por produto:** as instituições conectadas entregam conta corrente, cartão e saldo. Falta confirmar, na prática, o formato exato do que volta (fatura fechada, categorização, campos de saldo) — será descoberto ao exercitar a API na Fase 1/2, e este documento deve ser atualizado com o que aprendermos.
- [ ] **Expiração de consentimento:** Open Finance exige renovação periódica — a UI precisa avisar quando o Item ficar `OUTDATED`. Ver DT-002 em [DEBITO-TECNICO.md](./DEBITO-TECNICO.md).
- [ ] **Fatura do cartão:** validar se a fatura fechada vem via endpoint de Credit Card Bills ou se precisamos agrupar transações por período.

---

## 11. Mapeamento Pluggy → nosso modelo (lido da documentação em 2026-07-21)

> Fonte: `docs.pluggy.ai` — páginas de Transaction, Account, Item Lifecycle e Connect Token.
> Esta seção existe porque **o formato da Pluggy não é o nosso formato**. Importar cru produz
> dados errados. Cada linha aqui é uma tradução obrigatória no sync.

### ⚠️ O sinal do `amount` é invertido no cartão de crédito

A documentação de Transaction diz, literalmente: *"positive for credit card expenses, negative
for payments"*. Ou seja, **num cartão, uma compra chega positiva**. Nosso modelo assume
`negativo = saída` (seção 5). Importar sem normalizar faz um gasto de cartão ser contabilizado
como **receita** no dashboard — um erro de dinheiro que não quebra nada e por isso passa
despercebido. A normalização precisa ser explícita, viver em `lib/` e ter teste dedicado por
tipo de conta.

### Tabela de tradução

| Campo Pluggy | Formato deles | Nosso campo | Tradução necessária |
|---|---|---|---|
| `transaction.id` | UUID string | `pluggyTransactionId` | Direto. É a chave de deduplicação. |
| `transaction.amount` | number, **sinal depende do tipo de conta** | `amount` (Decimal) | **Normalizar o sinal** — ver aviso acima |
| `transaction.date` | ISO8601 UTC | `date` | Direto, atenção a fuso na exibição |
| `transaction.description` / `descriptionRaw` | string | `description` | Preferir `description`; `descriptionRaw` como fallback |
| `transaction.category` | string \| **null sem Pro** | `category` | **Sempre `null` no nosso plano.** A categoria real vem de `categoryOverride` (manual) |
| `transaction.type` | `DEBIT` \| `CREDIT` | — | Usar para validar o sinal normalizado |
| `transaction.status` | `PENDING` \| `POSTED` | — | Decidir se importamos `PENDING` (some/muda depois) |
| `transaction.paymentData.paymentMethod` | `PIX`/`TED`/`DOC`/`BOLETO` | `method` | Direto quando presente |
| `account.type` + `subtype` | `BANK`/`CREDIT` + `CHECKING_ACCOUNT`/`SAVINGS_ACCOUNT`/`CREDIT_CARD` | `type` | Mapear para nosso `CHECKING`/`CREDIT_CARD`/`CASH` |
| `account.taxNumber` | **CPF/CNPJ do titular** | — | **Não persistir.** É PII e não serve a nenhuma das 3 perguntas do MVP |
| `item.status` + `item.executionStatus` | dois campos distintos | `status` | Nosso modelo tem um só. `PARTIAL_SUCCESS` (veio conta, falhou cartão) **não** é sucesso |

### Estado do Item: como traduzimos (implementado na TASK-004)

A Pluggy expõe **dois** campos de estado — `status` (7 valores) e `executionStatus` (33 valores) —
e nosso `BankItem` persiste **os dois crus**, derivando um estado próprio para a aplicação:

| Nosso estado | Quando |
|---|---|
| `OK` | Única combinação: `status = UPDATED` **e** `executionStatus = SUCCESS` |
| `SINCRONIZANDO` | Execução em progresso |
| `PRECISA_ACAO` | Depende do usuário: MFA, credencial inválida, autorização pendente |
| `PARCIAL` | `PARTIAL_SUCCESS` — veio parte dos produtos, faltou algum |
| `ERRO` | Qualquer falha, **e todo valor desconhecido** |

Três garantias verificadas sobre as 615 combinações possíveis (incluindo valores adversariais):

1. **`PARTIAL_SUCCESS` nunca resulta em `OK`.** Zero casos. Um produto que falhou não passa por sucesso.
2. **Valor desconhecido sempre cai em `ERRO`**, nunca lança. A Pluggy pode adicionar valores a
   qualquer momento sem quebrar a aplicação.
3. **Precedência deliberada:** quando o Item precisa de ação do usuário **e** teve
   `PARTIAL_SUCCESS`, o estado é `PRECISA_ACAO`, não `PARCIAL` — o que o usuário precisa fazer é
   mais acionável do que o que faltou coletar. Resolver a ação tende a resolver o parcial junto.

### Outras restrições técnicas

- **Paginação por cursor:** transações vêm em páginas de 500, com um cursor `next`. Um sync que
  não pagina **trunca em silêncio** e aparenta ter funcionado.
- **Connect Token:** `POST /connect_token` com header `X-API-KEY`, resposta `{ accessToken }`.
  O `clientUserId` vai **dentro de `options`**, não na raiz do body (a seção 6.1 dizia o contrário).
- **Campos que exigem Pro** e virão vazios: `category`, `merchant`.

---

## 10. Decisões registradas (ADR resumido)

| # | Decisão | Motivo |
|---|---|---|
| 1 | Next.js full-stack (sem backend separado) | Exemplos da Pluggy já usam esse formato; menos infra para um projeto pessoal |
| 2 | Tudo é `Transaction` com campo `source` | Uma única linha do tempo financeira, relatórios simples |
| 3 | ~~SQLite no MVP~~ → **Postgres via Docker Compose desde o MVP** (revisto na TASK-001) | Evita a migração futura e o risco de divergência entre dev e produção; `Decimal` e constraints se comportam igual desde o dia 1. Custo: exige Docker rodando localmente |
| 4 | Contas fixas geram "instâncias" mensais | Permite histórico (quanto foi a luz em cada mês) e baixa individual |
| 5 | Sync manual no MVP, webhooks na fase 2 | Reduz complexidade inicial |
| 6 | **Direto em contas reais, sem sandbox** (decidido em 2026-07-21) | O sandbox adiaria a descoberta do formato real dos dados, que é justamente o que ainda não conhecemos. Custo: nenhum teste automatizado pode chamar a API real — os testes usam dados fabricados no nosso Postgres |
| 7 | **Sync no máximo 1× por dia, em série** (decidido em 2026-07-21) | A origem atualiza os dados 1× por dia, de madrugada. Sincronizar mais que isso gasta requisição e devolve dados idênticos. O limite vem da origem, não do rate limit |
| 8 | **Repositório público, documentação sem nomes de instituição** (decidido em 2026-07-21) | O projeto serve para qualquer banco e é usado como portfólio. A premissa fala em "instituições" em vez de nomear os bancos do usuário |
