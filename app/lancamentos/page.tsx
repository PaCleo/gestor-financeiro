import {
  ensureCashAccount,
  listManualEntries,
  listManualAccounts,
} from "@/lib/entries";
import { AddEntryForm } from "@/components/entries/AddEntryForm";
import { EditEntryForm } from "@/components/entries/EditEntryForm";
import { DeleteEntryButton } from "@/components/entries/DeleteEntryButton";

/**
 * Pagina de lancamentos manuais (TASK-009, Criterio de aceite #7) - Server
 * Component (sem `"use client"`), mesmo padrao de `app/categorias/page.tsx`
 * (TASK-008) / `app/bancos/page.tsx` (TASK-005): busca direto de
 * `lib/entries.ts`, sem round-trip HTTP.
 *
 * Garante a conta "Dinheiro" (`ensureCashAccount`, Criterio de aceite #1)
 * antes de listar - o formulario sempre tem pelo menos uma conta elegivel
 * disponivel. Renderiza `<AddEntryForm />` e, para cada lancamento manual,
 * um `<EditEntryForm />` + `<DeleteEntryButton />`. Estado vazio quando a
 * lista e `[]`.
 *
 * TASK-013 (sistema de design Fintech Premium): so a apresentacao muda -
 * `<AddEntryForm />` dentro de um `.card`, cada lancamento vira um `.card`
 * na lista. `AddEntryForm`/`EditEntryForm`/`DeleteEntryButton` sao mockados
 * por completo em tests/unit/app/lancamentos-page.test.tsx - o wrapper
 * pode mudar livremente sem tocar o contrato desses filhos.
 */
export default async function LancamentosPage() {
  await ensureCashAccount();
  const entries = await listManualEntries();
  const accounts = await listManualAccounts();

  return (
    <main className="flex flex-col gap-6">
      <div className="page-head">
        <p className="eyebrow">Fluxo manual</p>
        <h1>Lançamentos manuais</h1>
      </div>

      <div className="card">
        <AddEntryForm accounts={accounts} />
      </div>

      {entries.length === 0 ? (
        <p className="empty-text">Nenhum lançamento manual cadastrado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <EditEntryForm
                entry={{
                  id: entry.id,
                  amount: Math.abs(Number(entry.amount)).toFixed(2),
                  direction: entry.direction,
                  date: entry.date.toISOString().slice(0, 10),
                  description: entry.description,
                  method: entry.method ?? "PIX",
                  category: entry.category,
                  accountId: entry.accountId,
                }}
                accounts={accounts}
              />
              <DeleteEntryButton entryId={entry.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
