import { listActiveBankItems } from "@/lib/bank-item";
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
 */
export default async function BancosPage() {
  const bankItems = await listActiveBankItems();

  return (
    <main>
      <h1>Bancos conectados</h1>
      <ConnectBankButton />
      {bankItems.length === 0 ? (
        <p>Voce ainda nao conectou nenhum banco.</p>
      ) : (
        <ul>
          {bankItems.map((item) => (
            <li key={item.id}>
              <span>{item.institution}</span>
              <span>{item.state}</span>
              <DeactivateBankButton bankItemId={item.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
