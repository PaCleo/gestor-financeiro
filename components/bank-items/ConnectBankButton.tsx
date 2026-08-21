"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { ApiResponse } from "@/lib/api-response";

/**
 * `react-pluggy-connect` executa codigo com efeito colateral em `window` na
 * AVALIACAO do modulo (`window.__REACT_PLUGGY_CONNECT_SDK_VERSION = ...` em
 * `dist/main/version.js`), nao so em tempo de render - isso quebra
 * `next build` (prerender de `/bancos`) e qualquer SSR, porque o Node nao
 * tem `window`. Import dinamico com `ssr: false` (padrao documentado em
 * node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md, secao
 * "Skipping SSR") adia o import do modulo para depois da hidratacao, so no
 * browser - unica forma de usar esta biblioteca sem quebrar o servidor.
 */
const PluggyConnect = dynamic(
  () => import("react-pluggy-connect").then((mod) => mod.PluggyConnect),
  { ssr: false },
);

type ConnectState = "idle" | "loading" | "widget" | "error";

type PluggyConnectSuccessData = { item: { id: string } };

/**
 * Botao "Conectar banco" - abre o widget `react-pluggy-connect` com um
 * Connect Token obtido de `POST /api/connect-token` (TASK-005, Criterio de
 * aceite #7).
 *
 * Estados (em ordem):
 *   1. `idle` - so o botao "Conectar banco".
 *   2. `loading` - `POST /api/connect-token` em voo, mensagem "Conectando...".
 *   3. `widget` - Connect Token obtido, `<PluggyConnect>` renderizado
 *      (**sem** `includeSandbox` - ADR 6, Criterio de aceite #10).
 *   4. `error` - `/api/connect-token` falhou (HTTP nao-2xx OU
 *      `success: false`) OU o widget chamou `onError` - mensagem generica
 *      fixa, NUNCA o detalhe tecnico do backend/widget, com o botao
 *      "Conectar banco" disponivel para tentar de novo.
 *
 * `onSuccess(itemData)` do widget envia `{ pluggyItemId: itemData.item.id }`
 * para `POST /api/items` (persistencia do BankItem, TASK-004) e volta ao
 * estado `idle`.
 *
 * O Connect Token nunca e logado (`console.*`) nem persistido
 * (`localStorage`/`sessionStorage`) - fica somente em estado de componente,
 * em memoria (Criterio de aceite #9).
 */
export function ConnectBankButton() {
  const [state, setState] = useState<ConnectState>("idle");
  const [connectToken, setConnectToken] = useState<string | null>(null);

  async function handleConnectClick(): Promise<void> {
    setState("loading");

    try {
      const response = await fetch("/api/connect-token", { method: "POST" });
      const body = (await response
        .json()
        .catch(() => null)) as ApiResponse<{ accessToken: string }> | null;

      if (!response.ok || !body?.success || !body.data?.accessToken) {
        setState("error");
        return;
      }

      setConnectToken(body.data.accessToken);
      setState("widget");
    } catch {
      setState("error");
    }
  }

  async function handleWidgetSuccess(
    itemData: PluggyConnectSuccessData,
  ): Promise<void> {
    try {
      await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluggyItemId: itemData.item.id }),
      });
    } finally {
      setConnectToken(null);
      setState("idle");
    }
  }

  function handleWidgetError(): void {
    setConnectToken(null);
    setState("error");
  }

  return (
    <div className="flex flex-col gap-2">
      {state !== "widget" && (
        <button
          type="button"
          onClick={handleConnectClick}
          disabled={state === "loading"}
          className="btn-primary w-fit"
        >
          Conectar banco
        </button>
      )}
      {state === "loading" && <p className="hint-text">Conectando...</p>}
      {state === "error" && (
        <p className="text-sm text-[var(--neg)]">
          Nao foi possivel conectar seu banco. Tente novamente.
        </p>
      )}
      {state === "widget" && connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          onSuccess={handleWidgetSuccess}
          onError={() => handleWidgetError()}
        />
      )}
    </div>
  );
}
