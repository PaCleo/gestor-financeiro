import { describe, expect, it } from "vitest";

/**
 * Testes unitarios PUROS de `lib/format.ts` (TASK-012 Parte 2 - apresentacao
 * visual, Criterio de aceite P1). `formatBRL` e o UNICO helper de
 * apresentacao testado nesta camada: transforma uma string decimal (o
 * formato que `lib/dashboard.ts`/`lib/transactions.ts` ja devolvem via
 * `Decimal.toString()` - 2 casas fixas, escala `@db.Decimal(14, 2)` no
 * schema Prisma) num valor formatado em Real brasileiro.
 *
 * Contrato assumido para o coder (a QA nao implementa producao):
 *
 *   lib/format.ts
 *     export function formatBRL(decimalString: string): string
 *
 *   Usa `new Intl.NumberFormat("pt-BR", { style: "currency", currency:
 *   "BRL" }).format(Number(decimalString))`. So formatacao de EXIBICAO -
 *   nao faz nenhuma aritmetica (a soma/subtracao continua em `Decimal` em
 *   `lib/`); converter para `Number` aqui e seguro porque a entrada e
 *   SEMPRE um valor unico ja calculado, com 2 casas decimais fixas, sem
 *   acumulo (nao ha erro de ponto flutuante a herdar - Criterio de aceite
 *   P1, ver TASK-012.md).
 *
 * Armadilha de Intl documentada aqui (para o coder NAO "corrigir" a
 * implementacao por engano ao ver o teste falhar): o `Intl.NumberFormat`
 * "pt-BR"/"BRL" do Node insere um ESPACO NAO-QUEBRAVEL (U+00A0), nao um
 * espaco comum (U+0020), entre "R$"/"-R$" e o numero - confirmado
 * empiricamente nesta sessao com o Node do projeto:
 *
 *   new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
 *     .format(3408.84) === "R$ 3.408,84"
 *
 * Os testes abaixo normalizam esse espaco (trocam U+00A0 por espaco comum)
 * ANTES de comparar com a string esperada escrita com espaco comum - assim
 * a asserção prova o valor/formato reais (separador de milhar ".", decimal
 * ",", posicao do sinal) sem ficar refem de qual caractere de espaco o
 * ICU/Node especifico usa (frágil por engano, exatamente o que a task pediu
 * para evitar).
 */

/** Troca U+00A0 (NBSP, usado pelo Intl pt-BR/BRL) por espaco comum, so para a asserção. */
function normalizeSpaces(value: string): string {
  return value.replace(/ /g, " ");
}

describe("lib/format.ts - formatBRL, formatacao de moeda pt-BR/BRL (Criterio de aceite P1)", () => {
  it("formata um valor positivo com separador de milhar '.' e decimal ',' e o prefixo 'R$'", async () => {
    const { formatBRL } = await import("@/lib/format");

    expect(normalizeSpaces(formatBRL("3408.84"))).toBe("R$ 3.408,84");
  });

  it("formata um valor negativo com o sinal '-' ANTES de 'R$' (nao 'R$ -')", async () => {
    const { formatBRL } = await import("@/lib/format");

    expect(normalizeSpaces(formatBRL("-1806.01"))).toBe("-R$ 1.806,01");
  });

  it("formata zero como 'R$ 0,00' (sem sinal)", async () => {
    const { formatBRL } = await import("@/lib/format");

    expect(normalizeSpaces(formatBRL("0.00"))).toBe("R$ 0,00");
  });

  it("formata um valor com milhar exato ('1500.00') com o separador de milhar", async () => {
    const { formatBRL } = await import("@/lib/format");

    expect(normalizeSpaces(formatBRL("1500.00"))).toBe("R$ 1.500,00");
  });

  it("e uma funcao pura: chamar duas vezes com a mesma entrada devolve o mesmo resultado (sem estado/efeito colateral)", async () => {
    const { formatBRL } = await import("@/lib/format");

    expect(formatBRL("938.83")).toBe(formatBRL("938.83"));
  });
});
