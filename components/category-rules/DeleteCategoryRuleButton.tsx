"use client";

import { useState } from "react";
import type { ApiResponse } from "@/lib/api-response";

type DeleteState = "idle" | "loading" | "success" | "error";

/**
 * Botao "Remover" de uma regra de categorizacao (TASK-008 - Criterio de
 * aceite #9, secao 3 "DADO uma regra QUANDO a removo ENTAO ela some").
 *
 * Ao clicar, chama `DELETE /api/category-rules/{ruleId}`:
 *   - sucesso (`body.success === true`) -> mostra confirmacao, chama
 *     `onDeleted` se fornecido, e nao deixa clicar "Remover" de novo (o
 *     botao some);
 *   - falha (HTTP nao-2xx, `success: false` ou rejeicao de rede) -> mostra
 *     mensagem generica fixa (nunca `body.error` bruto) e mantem o botao
 *     "Remover" disponivel para tentar de novo.
 */
export function DeleteCategoryRuleButton({
  ruleId,
  onDeleted,
}: {
  ruleId: string;
  onDeleted?: () => void;
}) {
  const [state, setState] = useState<DeleteState>("idle");

  async function handleDeleteClick(): Promise<void> {
    setState("loading");

    try {
      const response = await fetch(`/api/category-rules/${ruleId}`, {
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
    return <p className="text-sm text-[var(--pos)]">Regra removida com sucesso.</p>;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleDeleteClick}
        disabled={state === "loading"}
        className="btn-danger"
      >
        Remover
      </button>
      {state === "loading" && <p className="hint-text">Removendo...</p>}
      {state === "error" && (
        <p className="text-sm text-[var(--neg)]">
          Nao foi possivel remover esta regra. Tente novamente.
        </p>
      )}
    </div>
  );
}
