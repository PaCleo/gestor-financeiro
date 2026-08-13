import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../../setup/reset-db";

/**
 * Teste de integracao ponta a ponta de POST /api/items (TASK-004): rota
 * real + `lib/bank-item.ts` real + Postgres real, com SOMENTE `@/lib/pluggy`
 * mockado (nenhuma chamada de rede a Pluggy e possivel). Complementa (sem
 * duplicar) os dois arquivos mais granulares:
 *   - tests/unit/api/items-route.test.ts (rota isolada, lib/bank-item
 *     mockada) - cobre validacao Zod e formato de erro em detalhe;
 *   - tests/integration/bank-item-creation.integration.test.ts
 *     (upsertBankItem isolado, lib/pluggy mockada) - cobre cada estado
 *     derivado e os cenarios de PII/falha parcial em detalhe.
 *
 * Este arquivo prova que a FIACAO entre as tres camadas (rota -> lib ->
 * banco) funciona de verdade, algo que nenhum dos dois testes acima
 * consegue provar sozinho (cada um mocka a camada logo abaixo da que
 * testa).
 */

const { fetchPluggyItemMock } = vi.hoisted(() => ({
  fetchPluggyItemMock: vi.fn(),
}));

vi.mock("@/lib/pluggy", () => ({
  fetchPluggyItem: fetchPluggyItemMock,
}));

let uniqueCounter = 0;
function uniquePluggyItemId(): string {
  uniqueCounter += 1;
  // Precisa ser um UUID valido (formato 8-4-4-4-12 hex) - a rota valida o
  // formato com Zod (Criterio de aceite #1). O ultimo grupo tem exatamente
  // 12 caracteres: "2c963f66" (8) + um sufixo numerico de 4 digitos
  // (digitos 0-9 sao hex validos), gerando valores unicos e ainda validos.
  const suffix = uniqueCounter.toString().padStart(4, "0").slice(-4);
  return `3fa85f64-5717-4562-b3fc-2c963f66${suffix}`;
}

function postRequest(body?: unknown): Request {
  return new Request("http://localhost:3000/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
  vi.clearAllMocks();
});

afterEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/items (integracao ponta a ponta: rota + lib + Postgres real, Pluggy mockada)", () => {
  it("persiste o BankItem no Postgres e responde 201 com ApiResponse<T> (Criterio de aceite #1)", async () => {
    const pluggyItemId = uniquePluggyItemId();
    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco Teste",
      status: "UPDATED",
      executionStatus: "SUCCESS",
    });

    const { POST } = await import("@/app/api/items/route");
    const response = await POST(postRequest({ pluggyItemId }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.pluggyItemId).toBe(pluggyItemId);
    expect(body.data.institution).toBe("Banco Teste");
    expect(body.data.status).toBe("UPDATED");
    expect(body.data.executionStatus).toBe("SUCCESS");
    expect(body.data.state).toBe("OK");

    const row = await prisma.bankItem.findUnique({ where: { pluggyItemId } });
    expect(row).not.toBeNull();
    expect(row?.institution).toBe("Banco Teste");
  });

  it("chamar a rota duas vezes com o mesmo pluggyItemId nao duplica o BankItem (idempotencia ponta a ponta, Criterio de aceite #5)", async () => {
    const pluggyItemId = uniquePluggyItemId();
    const { POST } = await import("@/app/api/items/route");

    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco Teste",
      status: "UPDATING",
      executionStatus: "ACCOUNTS_IN_PROGRESS",
    });
    const firstResponse = await POST(postRequest({ pluggyItemId }));
    expect(firstResponse.status).toBe(201);

    fetchPluggyItemMock.mockResolvedValueOnce({
      institution: "Banco Teste",
      status: "UPDATED",
      executionStatus: "SUCCESS",
    });
    const secondResponse = await POST(postRequest({ pluggyItemId }));
    const secondBody = await secondResponse.json();

    expect(secondBody.success).toBe(true);
    expect(secondBody.data.status).toBe("UPDATED");

    const rows = await prisma.bankItem.findMany({ where: { pluggyItemId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("UPDATED");
    expect(rows[0].executionStatus).toBe("SUCCESS");
  });

  it("corpo invalido (sem pluggyItemId) responde 400 e nao toca o banco", async () => {
    const { POST } = await import("@/app/api/items/route");
    const countBefore = await prisma.bankItem.count();

    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(fetchPluggyItemMock).not.toHaveBeenCalled();
    expect(await prisma.bankItem.count()).toBe(countBefore);
  });

  it("Pluggy fora do ar (fetchPluggyItem rejeitando) responde erro tratado e nao persiste nada", async () => {
    const pluggyItemId = uniquePluggyItemId();
    fetchPluggyItemMock.mockRejectedValueOnce(
      new Error("PluggyItemFetchError simulado"),
    );

    const { POST } = await import("@/app/api/items/route");
    const response = await POST(postRequest({ pluggyItemId }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);

    const row = await prisma.bankItem.findUnique({ where: { pluggyItemId } });
    expect(row).toBeNull();
  });
});
