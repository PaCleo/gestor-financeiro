import { listActiveBankItems, type BankItemState } from "@/lib/bank-item";
import { ConnectBankButton } from "@/components/bank-items/ConnectBankButton";
import { DeactivateBankButton } from "@/components/bank-items/DeactivateBankButton";

/**
 * Pagina de bancos conectados (TASK-005, Criterio de aceite #8) - Server
 * Component (sem `"use client"`): busca `listActiveBankItems()` direto de
 * `lib/bank-item.ts`, sem round-trip HTTP (ver
 * node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md).
 *
 * Renderiza `<ConnectBankButton />` (widget de conexao, Criterio de aceite
 * #7) e, para cada banco ativo, a instituicao, o `state` derivado
 * (OK/PRECISA_ACAO/SINCRONIZANDO/PARCIAL/ERRO - ver
 * `lib/bank-item.ts#deriveBankItemState`) e um
 * `<DeactivateBankButton bankItemId={item.id} />`. Bancos arquivados nunca
 * aparecem aqui - `listActiveBankItems` ja filtra (Criterio de aceite #6).
 *
 * TASK-013 (sistema de design Fintech Premium): so a apresentacao muda -
 * cada banco vira um `.card`, o `state` ganha uma `.pill` colorida (so a
 * cor muda por `state` - o TEXTO continua o valor cru do enum, ex. "OK"/
 * "PRECISA_ACAO", porque tests/unit/app/bancos-page.test.tsx faz
 * `getByText("OK")`/`getByText("PRECISA_ACAO")` literal).
 */
type BankItem = Awaited<ReturnType<typeof listActiveBankItems>>[number];

function statePillClass(state: BankItemState): string {
  switch (state) {
    case "OK":
      return "pill-posted";
    case "ERRO":
      return "pill-danger";
    case "PRECISA_ACAO":
      return "pill-pending";
    default:
      return "pill-neutral";
  }
}

function BankItemRow({ item }: { item: BankItem }) {
  return (
    <li className="card flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--text)]">{item.institution}</span>
        <span className={`pill ${statePillClass(item.state)} w-fit`}>{item.state}</span>
      </div>
      <DeactivateBankButton bankItemId={item.id} />
    </li>
  );
}

export default async function BancosPage() {
  const bankItems = await listActiveBankItems();

  return (
    <main className="flex flex-col gap-6">
      <div className="page-head">
        <p className="eyebrow">Conexões</p>
        <h1>Bancos conectados</h1>
      </div>

      <div className="card">
        <ConnectBankButton />
      </div>

      {bankItems.length === 0 ? (
        <p className="empty-text">Voce ainda nao conectou nenhum banco.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bankItems.map((item) => (
            <BankItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}
