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
    <form aria-label="Adicionar lancamento" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="entry-amount">Valor</label>
        <input
          id="entry-amount"
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="entry-direction">Direção</label>
        <select
          id="entry-direction"
          value={direction}
          onChange={(event) =>
            setDirection(event.target.value as EntryDirection)
          }
        >
          {ENTRY_DIRECTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "saida" ? "Saída" : "Entrada"}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="entry-date">Data</label>
        <input
          id="entry-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="entry-description">Descrição</label>
        <input
          id="entry-description"
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="entry-method">Método</label>
        <select
          id="entry-method"
          value={method}
          onChange={(event) => setMethod(event.target.value as EntryMethod)}
        >
          {ENTRY_METHODS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="entry-category">Categoria</label>
        <input
          id="entry-category"
          type="text"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="entry-account">Conta</label>
        <select
          id="entry-account"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" disabled={state === "saving"}>
        Adicionar lançamento
      </button>

      {state === "saving" && <p>Salvando...</p>}
      {state === "success" && <p>Lançamento adicionado com sucesso.</p>}
      {state === "error" && (
        <p>Não foi possível salvar o lançamento. Tente novamente.</p>
      )}
    </form>
  );
}
