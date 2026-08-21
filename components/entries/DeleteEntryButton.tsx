"use client";

import { useState } from "react";
import type { ApiResponse } from "@/lib/api-response";

type DeleteEntryState = "idle" | "loading" | "success" | "error";

/**
 * Botao "Excluir" de um lancamento manual (TASK-009 - Criterio de aceite
 * #7). Mesmo padrao de `DeleteCategoryRuleButton` (TASK-008).
 *
 * Ao clicar, chama `DELETE /api/entries/{entryId}`:
 *   - sucesso (`body.success === true`) -> mostra confirmacao, chama
 *     `onDeleted` se fornecido, e nao deixa clicar "Excluir" de novo (o
 *     botao some);
 *   - falha (HTTP nao-2xx, `success: false` ou rejeicao de rede) -> mostra
 *     mensagem generica fixa (nunca `body.error` bruto) e mantem "Excluir"
 *     disponivel.
 */
export function DeleteEntryButton({
  entryId,
  onDeleted,
}: {
  entryId: string;
  onDeleted?: () => void;
}) {
  const [state, setState] = useState<DeleteEntryState>("idle");

  async function handleDeleteClick(): Promise<void> {
    setState("loading");

    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: "DELETE",
      });
      const body = (await response
        .json()
        .catch(() => null)) as ApiResponse<{ id: string }> | null;

      if (!response.ok || !body?.success) {
        setState("error");
        return;
      }

      setState("success");
      onDeleted?.();
    } catch {
      setState("error");
    }
  }

  if (state === "success") {
    return <p className="text-sm text-[var(--pos)]">Lançamento excluído com sucesso.</p>;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleDeleteClick}
        disabled={state === "loading"}
        className="btn-danger"
      >
        Excluir
      </button>
      {state === "loading" && <p className="hint-text">Removendo...</p>}
      {state === "error" && (
        <p className="text-sm text-[var(--neg)]">
          Não foi possível remover este lançamento. Tente novamente.
        </p>
      )}
    </div>
  );
}
