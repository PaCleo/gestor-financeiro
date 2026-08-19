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
    return <p>Regra removida com sucesso.</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDeleteClick}
        disabled={state === "loading"}
      >
        Remover
      </button>
      {state === "loading" && <p>Removendo...</p>}
      {state === "error" && (
        <p>Nao foi possivel remover esta regra. Tente novamente.</p>
      )}
    </div>
  );
}
