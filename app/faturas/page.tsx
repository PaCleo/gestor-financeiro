import {
  listBillsByCard,
  type CardBillsGroup,
  type CreditCardBillListItem,
} from "@/lib/bills";
import { formatBRL } from "@/lib/format";

/**
 * Pagina de faturas (TASK-011, fecha a Fase 5) - Server Component (sem
 * `"use client"`): busca `listBillsByCard` direto de `lib/bills.ts`, sem
 * round-trip HTTP (mesmo padrao de `app/transacoes/page.tsx` e
 * `app/dashboard/page.tsx`). Uma secao por cartao, com a fatura mais recente
 * em destaque e as anteriores como historico (Criterio de aceite #7,
 * secao 2 do TASK-011.md).
 *
 * TASK-013 (sistema de design Fintech Premium): so a apresentacao muda -
 * cada cartao vira um `.card`, a fatura atual ganha `.bill-amount`/
 * `.bill-meta-*`. Os valores (`bill.totalAmount`, `minimumPaymentAmount`) sao
 * exibidos FORMATADOS via `formatBRL` (`lib/format.ts`, mesmo helper puro ja
 * usado por `app/dashboard/page.tsx` desde TASK-012 Parte 2) - ajuste
 * posterior da TASK-013 (o qa atualizou tests/unit/app/faturas-page.test.tsx
 * para exigir "R$" em vez do valor cru do Decimal, fechando a
 * inconsistencia visual com o resto do app). A DATA continua
 * `formatDate`/"YYYY-MM-DD" - isso nao mudou, so o valor monetario.
 */

const NO_MINIMUM_PLACEHOLDER = "Nao informado";

/** "YYYY-MM-DD" a partir da Date, sem depender de fuso do runtime (sempre UTC). */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatAmount(amount: string | null): string {
  return amount === null ? NO_MINIMUM_PLACEHOLDER : formatBRL(amount);
}

function CurrentBill({ bill, accountId }: { bill: CreditCardBillListItem; accountId: string }) {
  return (
    <div data-testid={`current-bill-${accountId}`} className="mt-2 flex flex-col gap-4">
      <div>
        <p className="eyebrow">Fatura atual</p>
        <p className="bill-amount num">{formatBRL(bill.totalAmount)}</p>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="bill-meta-label">Vencimento</p>
          <p className="bill-meta-value num">{formatDate(bill.dueDate)}</p>
        </div>
        <div>
          <p className="bill-meta-label">Mínimo</p>
          <p className="bill-meta-value num">{formatAmount(bill.minimumPaymentAmount)}</p>
        </div>
      </div>
    </div>
  );
}

function HistoryBill({ bill }: { bill: CreditCardBillListItem }) {
  return (
    <li
      data-testid={`history-bill-${bill.id}`}
      className="flex items-center justify-between border-t border-[var(--line-soft)] py-2 text-sm text-[var(--text-2)]"
    >
      <span className="num">{formatDate(bill.dueDate)}</span>
      <span className="num">{formatBRL(bill.totalAmount)}</span>
    </li>
  );
}

function CardSection({ card }: { card: CardBillsGroup }) {
  return (
    <section data-testid={`card-${card.accountId}`} className="card">
      <div className="card-head">
        <h2 className="card-title">{card.accountName}</h2>
        <span className="chip chip-muted">cartão</span>
      </div>

      {card.current ? (
        <CurrentBill bill={card.current} accountId={card.accountId} />
      ) : (
        <p className="empty-text">Nenhuma fatura encontrada para este cartão ainda.</p>
      )}

      {card.history.length > 0 ? (
        <>
          <div className="divider" />
          <ul className="mt-2 flex flex-col">
            {card.history.map((bill) => (
              <HistoryBill key={bill.id} bill={bill} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

export default async function FaturasPage() {
  const cards = await listBillsByCard();

  return (
    <main className="flex flex-col gap-6">
      <div className="page-head">
        <p className="eyebrow">Cartões de crédito</p>
        <h1>Faturas</h1>
      </div>

      {cards.length === 0 ? (
        <p className="empty-text">Nenhum cartão conectado.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <CardSection key={card.accountId} card={card} />
          ))}
        </div>
      )}
    </main>
  );
}
