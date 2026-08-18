import {
  DEFAULT_PAGE_SIZE,
  listAccountsForFilter,
  listTransactions,
  transactionsQuerySchema,
  type TransactionListItem,
  type TransactionsQuery,
} from "@/lib/transactions";

/**
 * Pagina de transacoes com filtros (TASK-007, fecha a Fase 2) - Server
 * Component (sem `"use client"`): busca `listTransactions`/
 * `listAccountsForFilter` direto de `lib/transactions.ts`, sem round-trip
 * HTTP (mesmo padrao de `app/bancos/page.tsx` da TASK-005).
 *
 * `searchParams` e validado com o MESMO schema Zod da rota
 * (`transactionsQuerySchema`) - se a URL vier digitada a mao com um
 * parametro invalido, a pagina cai no filtro padrao em vez de quebrar
 * (mesmo espirito "nao quebrar" do Criterio de aceite #1/#6, generalizado a
 * tela).
 */

const DEFAULT_QUERY: TransactionsQuery = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
};

/** Sinal explicito: negativo mantem o "-" ja presente na string do Decimal; positivo ganha "+". */
function formatSignedAmount(amount: string): string {
  return amount.startsWith("-") ? amount : `+${amount}`;
}

/** "YYYY-MM-DD" a partir da Date, sem depender de fuso do runtime (sempre UTC). */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildPageHref(query: TransactionsQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.accountId) params.set("accountId", query.accountId);
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  params.set("page", String(page));
  params.set("limit", String(query.limit));
  return `?${params.toString()}`;
}

function TransactionRow({ transaction }: { transaction: TransactionListItem }) {
  return (
    <tr
      data-testid={`transaction-row-${transaction.id}`}
      data-status={transaction.status}
    >
      <td>{formatDate(transaction.date)}</td>
      <td>{transaction.description}</td>
      <td>{formatSignedAmount(transaction.amount)}</td>
      <td>{transaction.accountName}</td>
      <td>{transaction.method ?? "-"}</td>
      <td>{transaction.category ?? "-"}</td>
      <td>{transaction.status === "PENDING" ? "Pendente" : null}</td>
    </tr>
  );
}

export default async function TransacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const rawParams = await searchParams;
  const parsedParams = transactionsQuerySchema.safeParse(rawParams);
  const query = parsedParams.success ? parsedParams.data : DEFAULT_QUERY;

  const [result, accounts] = await Promise.all([
    listTransactions(query),
    listAccountsForFilter(),
  ]);

  const totalPages = Math.ceil(result.total / result.limit);
  const hasPrevious = result.page > 1;
  const hasNext = result.page < totalPages;

  return (
    <main>
      <h1>Transações</h1>

      <form method="GET">
        <label htmlFor="accountId">Conta</label>
        <select id="accountId" name="accountId" defaultValue={query.accountId ?? ""}>
          <option value="">Todas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        <label htmlFor="startDate">Data inicial</label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          defaultValue={query.startDate ?? ""}
        />

        <label htmlFor="endDate">Data final</label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          defaultValue={query.endDate ?? ""}
        />

        <button type="submit">Filtrar</button>
      </form>

      {result.transactions.length === 0 ? (
        <p>Nenhuma transação encontrada.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Conta</th>
              <th>Método</th>
              <th>Categoria</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.transactions.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </tbody>
        </table>
      )}

      <nav aria-label="Paginação">
        {hasPrevious ? (
          <a href={buildPageHref(query, result.page - 1)}>Anterior</a>
        ) : null}
        {hasNext ? (
          <a href={buildPageHref(query, result.page + 1)}>Próxima</a>
        ) : null}
      </nav>
    </main>
  );
}
