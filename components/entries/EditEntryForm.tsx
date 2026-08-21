"use client";

import { useState, type FormEvent } from "react";
import {
  ENTRY_METHODS,
  ENTRY_DIRECTIONS,
  type EntryDirection,
} from "@/lib/entry-constants";
import type { ApiResponse } from "@/lib/api-response";

type EditEntryFormState = "idle" | "saving" | "success" | "error";

export interface EditableManualEntry {
  id: string;
  /** Valor ABSOLUTO (sem sinal), ex. "45.90". */
  amount: string;
  direction: EntryDirection;
  /** "YYYY-MM-DD". */
  date: string;
  description: string;
  method: string;
  category: string | null;
  accountId: string;
}

/**
 * Formulario de edicao de um lancamento manual (TASK-009 - Criterio de
 * aceite #7, secao 3 "DADO um lancamento MANUAL QUANDO edito ENTAO
 * funciona"). Sempre visivel (sem toggle "mostrar/esconder"), pre-preenchido
 * a partir de `entry`.
 *
 * Ao submeter, chama `PATCH /api/entries/{entry.id}` com `{ amount,
 * direction, date, description, method, category, accountId }` (`category`
 * omitido quando vazio):
 *   - sucesso: mostra confirmacao e chama `onSaved` se fornecido;
 *   - falha (HTTP nao-2xx, `success: false` ou rejeicao de rede): mostra
 *     mensagem generica fixa (NUNCA `body.error` bruto) e MANTEM os valores
 *     editados no formulario.
 */
export function EditEntryForm({
  entry,
  accounts,
  onSaved,
}: {
  entry: EditableManualEntry;
  accounts: Array<{ id: string; name: string }>;
  onSaved?: () => void;
}) {
  const [amount, setAmount] = useState(entry.amount);
  const [direction, setDirection] = useState<EntryDirection>(entry.direction);
  const [date, setDate] = useState(entry.date);
  const [description, setDescription] = useState(entry.description);
  const [method, setMethod] = useState(entry.method);
  const [category, setCategory] = useState(entry.category ?? "");
  const [accountId, setAccountId] = useState(entry.accountId);
  const [state, setState] = useState<EditEntryFormState>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setState("saving");

    const payload: Record<string, unknown> = {
      amount: Number(amount),
      direction,
      date,
      description,
      method,
      accountId,
    };
    if (category.trim() !== "") {
      payload.category = category;
    }

    try {
      const response = await fetch(`/api/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response
        .json()
        .catch(() => null)) as ApiResponse<unknown> | null;

      if (!response.ok || !body?.success) {
        setState("error");
        return;
      }

      setState("success");
      onSaved?.();
    } catch {
      setState("error");
    }
  }

  return (
    <form
      aria-label={`Editar lancamento ${entry.id}`}
      onSubmit={handleSubmit}
      className="flex flex-1 flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-entry-amount-${entry.id}`} className="field-label">Valor</label>
          <input
            id={`edit-entry-amount-${entry.id}`}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            className="field-input num"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-entry-direction-${entry.id}`} className="field-label">Direção</label>
          <select
            id={`edit-entry-direction-${entry.id}`}
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as EntryDirection)
            }
            className="field-select"
          >
            {ENTRY_DIRECTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "saida" ? "Saída" : "Entrada"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-entry-date-${entry.id}`} className="field-label">Data</label>
          <input
            id={`edit-entry-date-${entry.id}`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-entry-description-${entry.id}`} className="field-label">Descrição</label>
          <input
            id={`edit-entry-description-${entry.id}`}
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-entry-method-${entry.id}`} className="field-label">Método</label>
          <select
            id={`edit-entry-method-${entry.id}`}
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className="field-select"
          >
            {ENTRY_METHODS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-entry-category-${entry.id}`} className="field-label">Categoria</label>
          <input
            id={`edit-entry-category-${entry.id}`}
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-entry-account-${entry.id}`} className="field-label">Conta</label>
          <select
            id={`edit-entry-account-${entry.id}`}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="field-select"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state === "saving"} className="btn-secondary">
          Salvar alterações
        </button>

        {state === "saving" && <p className="hint-text">Salvando...</p>}
        {state === "success" && (
          <p className="text-sm text-[var(--pos)]">Lançamento salvo com sucesso.</p>
        )}
        {state === "error" && (
          <p className="text-sm text-[var(--neg)]">
            Não foi possível salvar as alterações. Tente novamente.
          </p>
        )}
      </div>
    </form>
  );
}
