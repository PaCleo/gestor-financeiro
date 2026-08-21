"use client";

import { useState, type FormEvent } from "react";
import {
  ENTRY_METHODS,
  ENTRY_DIRECTIONS,
  type EntryMethod,
  type EntryDirection,
} from "@/lib/entry-constants";
import type { ApiResponse } from "@/lib/api-response";

type AddEntryFormState = "idle" | "saving" | "success" | "error";

/**
 * Formulario de novo lancamento manual (TASK-009 - Criterio de aceite #7,
 * secao 3 "DADO valor, data, descricao, metodo, categoria e uma conta
 * manual QUANDO crio").
 *
 * Ao submeter, chama `POST /api/entries` com `{ amount, direction, date,
 * description, method, category, accountId }` (`category` omitido quando
 * vazio - o campo e opcional):
 *   - sucesso (`body.success === true`): mostra confirmacao, LIMPA
 *     valor/data/descricao/categoria e chama `onCreated` se fornecido;
 *   - falha (HTTP nao-2xx, `success: false` ou rejeicao de rede): mostra
 *     mensagem generica fixa (NUNCA `body.error` bruto) e MANTEM os valores
 *     digitados.
 */
export function AddEntryForm({
  accounts,
  onCreated,
}: {
  accounts: Array<{ id: string; name: string }>;
  onCreated?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<EntryDirection>("saida");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<EntryMethod>(ENTRY_METHODS[0]);
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [state, setState] = useState<AddEntryFormState>("idle");

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
      const response = await fetch("/api/entries", {
        method: "POST",
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

      setAmount("");
      setDate("");
      setDescription("");
      setCategory("");
      setState("success");
      onCreated?.();
    } catch {
      setState("error");
    }
  }

  return (
    <form aria-label="Adicionar lancamento" onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="entry-amount" className="field-label">Valor</label>
          <input
            id="entry-amount"
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
          <label htmlFor="entry-direction" className="field-label">Direção</label>
          <select
            id="entry-direction"
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
          <label htmlFor="entry-date" className="field-label">Data</label>
          <input
            id="entry-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="entry-description" className="field-label">Descrição</label>
          <input
            id="entry-description"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="entry-method" className="field-label">Método</label>
          <select
            id="entry-method"
            value={method}
            onChange={(event) => setMethod(event.target.value as EntryMethod)}
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
          <label htmlFor="entry-category" className="field-label">Categoria</label>
          <input
            id="entry-category"
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="entry-account" className="field-label">Conta</label>
          <select
            id="entry-account"
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
        <button type="submit" disabled={state === "saving"} className="btn-primary">
          Adicionar lançamento
        </button>

        {state === "saving" && <p className="hint-text">Salvando...</p>}
        {state === "success" && (
          <p className="text-sm text-[var(--pos)]">Lançamento adicionado com sucesso.</p>
        )}
        {state === "error" && (
          <p className="text-sm text-[var(--neg)]">
            Não foi possível salvar o lançamento. Tente novamente.
          </p>
        )}
      </div>
    </form>
  );
}
