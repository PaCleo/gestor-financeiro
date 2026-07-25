import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../../setup/reset-db";
import { buildBankItem } from "../../fixtures/db";

/**
 * Teste de integracao ponta a ponta de DELETE /api/items/[id] (TASK-005):
 * rota real + `lib/bank-item.ts` real + `lib/pluggy.ts` real + Postgres
 * real, com SOMENTE `pluggy-sdk` mockado (nenhuma chamada de rede a Pluggy
 * e possivel). Complementa (sem duplicar) os arquivos mais granulares:
 *   - tests/unit/api/items-delete-route.test.ts (rota isolada,
 *     lib/bank-item mockada) - cobre validacao/formato de erro em detalhe;
 *   - tests/unit/lib/bank-item-archive.test.ts (archiveBankItem isolado,
 *     lib/pluggy mockada) - cobre a ordem de chamadas em detalhe;
 *   - tests/integration/bank-item-archive.integration.test.ts
 *     (archiveBankItem + Postgres real, so lib/pluggy mockada).
 *
 * Este arquivo prova que a FIACAO entre TODAS as camadas (rota -> lib ->
 * lib/pluggy -> Postgres) funciona de verdade, incluindo o Criterio de
 * aceite #3 (ordem obrigatoria) no nivel mais alto possivel sem tocar a
 * rede real.
 */

const { PluggyClientMock, deleteItemMock } = vi.hoisted(() => {
  const deleteItemMock = vi.fn();
  const PluggyClientMock = vi.fn().mockImplementation(function () {
    return { deleteItem: deleteItemMock };
  });
  return { PluggyClientMock, deleteItemMock };
});

vi.mock("pluggy-sdk", () => ({ PluggyClient: PluggyClientMock }));

const ORIGINAL_CLIENT_ID = process.env.CLIENT_ID;
const ORIGINAL_CLIENT_SECRET = process.env.CLIENT_SECRET;

function deleteRequest(id: string): Request {
  return new Request(`http://localhost:3000/api/items/${id}`, {
    method: "DELETE",
  });
}

function contextWithId(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  await resetDatabase(prisma);
  vi.clearAllMocks();
  // deleteItemFromPluggy (lib/pluggy.ts) so instancia o PluggyClient quando
  // CLIENT_ID/CLIENT_SECRET estao configurados - precisamos de valores
  // fabricados (nunca credenciais reais) para exercitar o caminho real do
  // codigo neste teste ponta a ponta.
  process.env.CLIENT_ID = "fake-client-id-para-teste";
  process.env.CLIENT_SECRET = "fake-client-secret-para-teste";
});

afterEach(async () => {
  await resetDatabase(prisma);
  if (ORIGINAL_CLIENT_ID === undefined) {
    delete process.env.CLIENT_ID;
  } else {
    process.env.CLIENT_ID = ORIGINAL_CLIENT_ID;
  }
  if (ORIGINAL_CLIENT_SECRET === undefined) {
    delete process.env.CLIENT_SECRET;
  } else {
    process.env.CLIENT_SECRET = ORIGINAL_CLIENT_SECRET;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("DELETE /api/items/[id] (integracao ponta a ponta: rota + lib + Postgres real, pluggy-sdk mockado)", () => {
  it("deleta o Item na Pluggy e SO ENTAO arquiva o BankItem no Postgres, respondendo 200 (Criterio de aceite #2/#3)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    deleteItemMock.mockResolvedValueOnce(undefined);

    const { DELETE } = await import("@/app/api/items/[id]/route");
    const response = await DELETE(
      deleteRequest(bankItem.id),
      contextWithId(bankItem.id),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(deleteItemMock).toHaveBeenCalledWith(bankItem.pluggyItemId);

    const reloaded = await prisma.bankItem.findUniqueOrThrow({
      where: { id: bankItem.id },
    });
    expect(reloaded.archivedAt).not.toBeNull();
  });

  it("quando a Pluggy falha (client.deleteItem rejeita com erro que NAO e 'item nao encontrado'), o BankItem continua ativo no Postgres e a rota responde erro tratado (Criterio de aceite #3, o mais importante da task)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    // Shape SEM `statusCode` (o SDK real nao usa esse campo - ver
    // tests/unit/lib/pluggy.test.ts) e SEM `code: 404`/`codeDescription:
    // 'ITEM_NOT_FOUND'`, para nao ser confundido com o caso de sucesso do
    // Criterio 4 abaixo. Direcao critica de privacidade: isto NAO pode
    // arquivar nada localmente.
    deleteItemMock.mockRejectedValueOnce({
      message: "Forbidden for this API key",
      code: "FORBIDDEN",
    });

    const { DELETE } = await import("@/app/api/items/[id]/route");
    const response = await DELETE(
      deleteRequest(bankItem.id),
      contextWithId(bankItem.id),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);

    const reloaded = await prisma.bankItem.findUniqueOrThrow({
      where: { id: bankItem.id },
    });
    expect(reloaded.archivedAt).toBeNull();
  });

  it("quando a Pluggy responde com o shape REAL de Item ja inexistente (code: 404, codeDescription: 'ITEM_NOT_FOUND', SEM statusCode), o arquivamento local acontece mesmo assim (Criterio de aceite #4)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    // Shape capturado numa chamada real `deleteItem` contra um Item
    // inexistente (revisao pos-aprovacao da TASK-005) - objeto plano, SEM
    // `.statusCode`/`.response`. Ver o mesmo shape em
    // tests/unit/lib/pluggy.test.ts (buildRealPluggyItemNotFoundError).
    deleteItemMock.mockRejectedValueOnce({
      message: "item not found",
      code: 404,
      codeDescription: "ITEM_NOT_FOUND",
      errorId: "6f6b6f8a-6f9a-4b7a-9b3a-1c2d3e4f5a6b",
    });

    const { DELETE } = await import("@/app/api/items/[id]/route");
    const response = await DELETE(
      deleteRequest(bankItem.id),
      contextWithId(bankItem.id),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const reloaded = await prisma.bankItem.findUniqueOrThrow({
      where: { id: bankItem.id },
    });
    expect(reloaded.archivedAt).not.toBeNull();
  });

  it("id inexistente no banco responde 404 e nao chama a Pluggy", async () => {
    const { DELETE } = await import("@/app/api/items/[id]/route");
    const response = await DELETE(
      deleteRequest("id-que-nao-existe"),
      contextWithId("id-que-nao-existe"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(deleteItemMock).not.toHaveBeenCalled();
  });

  it("chamar DELETE duas vezes seguidas para o mesmo BankItem e idempotente (Criterio de aceite #5)", async () => {
    const bankItem = await prisma.bankItem.create({ data: buildBankItem() });
    deleteItemMock.mockResolvedValueOnce(undefined);

    const { DELETE } = await import("@/app/api/items/[id]/route");
    const firstResponse = await DELETE(
      deleteRequest(bankItem.id),
      contextWithId(bankItem.id),
    );
    const firstBody = await firstResponse.json();

    const secondResponse = await DELETE(
      deleteRequest(bankItem.id),
      contextWithId(bankItem.id),
    );
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondBody.data.archivedAt).toBe(firstBody.data.archivedAt);
    expect(deleteItemMock).toHaveBeenCalledTimes(1);
  });
});
