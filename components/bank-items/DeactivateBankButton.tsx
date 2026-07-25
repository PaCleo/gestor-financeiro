"use client";

import { useState } from "react";
import type { ApiResponse } from "@/lib/api-response";

type DeactivateState = "idle" | "loading" | "success" | "error";

/**
 * Botao "Desativar" de um banco conectado (TASK-005, suporta o Criterio de
 * aceite #8 - a pagina de bancos "permite... desativar").
 *
 * Ao clicar, chama `DELETE /api/items/{bankItemId}`:
 *   - sucesso (`body.success === true`) -> mostra confirmacao e nao deixa
 *     clicar "Desativar" de novo (o botao some).
 *   - falha (HTTP nao-2xx, `success: false` ou rejeicao de rede) -> mostra
 *     mensagem generica fixa (nunca `body.error` bruto do backend, que pode
 *     conter detalhe interno da Pluggy) e mantem o botao disponivel para
 *     tentar de novo.
 */
export function DeactivateBankButton({
  bankItemId,
}: {
  bankItemId: string;
}) {
  const [state, setState] = useState<DeactivateState>("idle");

  async function handleDeactivateClick(): Promise<void> {
    setState("loading");

    try {
      const response = await fetch(`/api/items/${bankItemId}`, {
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
    } catch {
      setState("error");
    }
  }

  if (state === "success") {
    return <p>Banco desativado com sucesso.</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDeactivateClick}
        disabled={state === "loading"}
      >
        Desativar
      </button>
      {state === "loading" && <p>Desativando...</p>}
      {state === "error" && (
        <p>Nao foi possivel desativar este banco. Tente novamente.</p>
      )}
    </div>
  );
}
