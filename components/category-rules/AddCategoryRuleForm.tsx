"use client";

import { useState, type FormEvent } from "react";
import type { ApiResponse } from "@/lib/api-response";

type FormState = "idle" | "loading" | "success" | "error";

/**
 * Formulario de cadastro de regra de categorizacao por CPF/CNPJ (TASK-008 -
 * Criterio de aceite #9, secao 3 "DADO um CPF/CNPJ e uma categoria QUANDO
 * crio uma regra").
 *
 * Ao submeter, chama `POST /api/category-rules` com `{ document, category,
 * label }` (`label` omitido quando o campo ficou vazio):
 *   - sucesso (`body.success === true`): mostra confirmacao, LIMPA os
 *     campos (o documento nao pode continuar visivel na tela - higiene de
 *     privacidade) e chama `onCreated` se fornecido;
 *   - falha (HTTP nao-2xx, `success: false` ou rejeicao de rede): mostra
 *     mensagem generica fixa (NUNCA `body.error` bruto) e MANTEM os valores
 *     digitados para o usuario tentar de novo.
 *
 * NUNCA chama `console.*` com o documento digitado, em nenhum momento do
 * fluxo (a regra de ouro de privacidade da task).
 */
export function AddCategoryRuleForm({
  onCreated,
}: {
  onCreated?: () => void;
} = {}) {
  const [document, setDocument] = useState("");
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [state, setState] = useState<FormState>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setState("loading");

    try {
      const response = await fetch("/api/category-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          label
            ? { document, category, label }
            : { document, category },
        ),
      });
      const body = (await response
        .json()
        .catch(() => null)) as ApiResponse<{
        id: string;
        label: string | null;
        category: string;
      }> | null;

      if (!response.ok || !body?.success) {
        setState("error");
        return;
      }

      setDocument("");
      setCategory("");
      setLabel("");
      setState("success");
      onCreated?.();
    } catch {
      setState("error");
    }
  }

  return (
    <form aria-label="Adicionar regra de categorizacao" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="category-rule-document">Documento (CPF/CNPJ)</label>
        <input
          id="category-rule-document"
          type="text"
          value={document}
          onChange={(event) => setDocument(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="category-rule-category">Categoria</label>
        <input
          id="category-rule-category"
          type="text"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="category-rule-label">Rótulo (opcional)</label>
        <input
          id="category-rule-label"
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <button type="submit" disabled={state === "loading"}>
        Adicionar regra
      </button>
      {state === "loading" && <p>Salvando...</p>}
      {state === "success" && <p>Regra adicionada com sucesso.</p>}
      {state === "error" && (
        <p>Nao foi possivel cadastrar esta regra. Tente novamente.</p>
      )}
    </form>
  );
}
