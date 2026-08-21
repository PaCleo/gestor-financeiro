import {
  DEFAULT_PAGE_SIZE,
  listAccountsForFilter,
  listTransactions,
  transactionsQuerySchema,
  type TransactionListItem,
  type TransactionsQuery,
} from "@/lib/transactions";
import { formatBRL } from "@/lib/format";

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
 *
 * TASK-013 (sistema de design Fintech Premium): so a apresentacao muda -
 * filtro num `.card`, tabela com `.data-table`/`.table-wrap`, categoria
 * como `.chip`, status como `.pill`. O valor da transacao e exibido
 * FORMATADO via `formatBRL` (`lib/format.ts`, mesmo helper puro ja usado
 * por `app/dashboard/page.tsx` desde TASK-012 Parte 2) - ajuste posterior
 * da TASK-013 (o qa atualizou tests/unit/app/transacoes-page.test.tsx para
 * exigir "R$" em vez do valor cru do Decimal, fechando a inconsistencia
 * visual com o resto do app). O sinal explicito ("-"/"+") continua vindo
 * ANTES de `formatBRL`, mesmo contrato de `formatSignedAmount` de
 * `app/dashboard/page.tsx`: `formatBRL` ja poe o "-" antes de "R$" quando o
 * valor e negativo, entao so precisa prefixar "+" quando NAO comeca com
 * "-".
 */

const DEFAULT_QUERY: TransactionsQuery = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
};

/** Sinal explicito e formatado em R$: negativo usa `formatBRL` (o Intl ja poe o "-" antes de "R$"); positivo ganha "+" antes de "R$". */
function formatSignedAmount(amount: string): string {
  return amount.startsWith("-") ? formatBRL(amount) : `+${formatBRL(amount)}`;
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
  const isNegative = transaction.amount.startsWith("-");

  return (
    <tr data-testid={`transaction-row-${transaction.id}`} data-status={transaction.status}>
      <td className="num">{formatDate(transaction.date)}</td>
      <td className="font-medium text-[var(--text)]">{transaction.description}</td>
      <td
        className={`align-right num ${isNegative ? "text-[var(--neg)]" : "text-[var(--pos)]"}`}
      >
        {formatSignedAmount(transaction.amount)}
      </td>
      <td>{transaction.accountName}</td>
      <td>{transaction.method ?? "-"}</td>
      <td>
        {transaction.category ? (
          <span className="chip">{transaction.category}</span>
        ) : (
          <span className="chip chip-muted">Sem categoria</span>
        )}
      </td>
      <td className="align-right">
        {transaction.status === "PENDING" ? (
          <span className="pill pill-pending">Pendente</span>
        ) : (
          <span className="pill pill-posted">Compensado</span>
        )}
      </td>
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
    <main className="flex flex-col gap-6">
      <div className="page-head">
        <p className="eyebrow">Extrato</p>
        <h1>Transações</h1>
      </div>

      <form method="GET" className="card flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="accountId" className="field-label">
            Conta
          </label>
          <select
            id="accountId"
            name="accountId"
            defaultValue={query.accountId ?? ""}
            className="field-select"
          >
            <option value="">Todas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="startDate" className="field-label">
            Data inicial
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={query.startDate ?? ""}
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="endDate" className="field-label">
            Data final
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={query.endDate ?? ""}
            className="field-input"
          />
        </div>

        <button type="submit" className="btn-primary">
          Filtrar
        </button>
      </form>

      <div className="card">
        {result.transactions.length === 0 ? (
          <p className="empty-text">Nenhuma transação encontrada.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th className="align-right">Valor</th>
                  <th>Conta</th>
                  <th>Método</th>
                  <th>Categoria</th>
                  <th className="align-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.transactions.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
        {hasPrevious ? (
          <a href={buildPageHref(query, result.page - 1)} className="btn-secondary">
            Anterior
          </a>
        ) : (
          <span />
        )}
        {hasNext ? (
          <a href={buildPageHref(query, result.page + 1)} className="btn-secondary">
            Próxima
          </a>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
