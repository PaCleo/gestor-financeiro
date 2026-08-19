import {
  listBillsByCard,
  type CardBillsGroup,
  type CreditCardBillListItem,
} from "@/lib/bills";

/**
 * Pagina de faturas (TASK-011, fecha a Fase 5) - Server Component (sem
 * `"use client"`): busca `listBillsByCard` direto de `lib/bills.ts`, sem
 * round-trip HTTP (mesmo padrao de `app/transacoes/page.tsx` e
 * `app/dashboard/page.tsx`). Uma secao por cartao, com a fatura mais recente
 * em destaque e as anteriores como historico (Criterio de aceite #7,
 * secao 2 do TASK-011.md).
 */

const NO_MINIMUM_PLACEHOLDER = "Nao informado";

/** "YYYY-MM-DD" a partir da Date, sem depender de fuso do runtime (sempre UTC). */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatAmount(amount: string | null): string {
  return amount === null ? NO_MINIMUM_PLACEHOLDER : amount;
}

function CurrentBill({ bill, accountId }: { bill: CreditCardBillListItem; accountId: string }) {
  return (
    <div data-testid={`current-bill-${accountId}`}>
      <p>Vencimento: {formatDate(bill.dueDate)}</p>
      <p>Total: {bill.totalAmount}</p>
      <p>Minimo: {formatAmount(bill.minimumPaymentAmount)}</p>
    </div>
  );
}

function HistoryBill({ bill }: { bill: CreditCardBillListItem }) {
  return (
    <li data-testid={`history-bill-${bill.id}`}>
      {formatDate(bill.dueDate)} - {bill.totalAmount}
    </li>
  );
}

function CardSection({ card }: { card: CardBillsGroup }) {
  return (
    <section data-testid={`card-${card.accountId}`}>
      <h2>{card.accountName}</h2>

      {card.current ? (
        <CurrentBill bill={card.current} accountId={card.accountId} />
      ) : (
        <p>Nenhuma fatura encontrada para este cartão ainda.</p>
      )}

      {card.history.length > 0 ? (
        <ul>
          {card.history.map((bill) => (
            <HistoryBill key={bill.id} bill={bill} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default async function FaturasPage() {
  const cards = await listBillsByCard();

  return (
    <main>
      <h1>Faturas</h1>

      {cards.length === 0 ? (
        <p>Nenhum cartão conectado.</p>
      ) : (
        cards.map((card) => <CardSection key={card.accountId} card={card} />)
      )}
    </main>
  );
}
