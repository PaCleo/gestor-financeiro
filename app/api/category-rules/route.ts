import {
  categoryRuleInputSchema,
  upsertCategoryRule,
  listCategoryRules,
} from "@/lib/category-rules";
import type { ApiResponse } from "@/lib/api-response";

/**
 * POST /api/category-rules - Criterio de aceite #3 da TASK-008 (DT-019).
 *
 * Rota casca fina: toda a logica (hashear o documento, upsert por hash)
 * vive em `upsertCategoryRule` (lib/category-rules.ts). Aqui so validamos o
 * corpo com Zod (`categoryRuleInputSchema`, a MESMA validacao usada em
 * `lib/category-rules.ts`) e traduzimos o resultado/erro para
 * `ApiResponse<T>`.
 *
 * O corpo e tolerante a ausencia/`null`/JSON malformado, mesmo padrao de
 * `app/api/items/route.ts` (TASK-004) - `request.json()` protegido por
 * `.catch(() => null)`, e o parse fica dentro do `safeParse` do Zod.
 *
 * Validacao falhando: 400 com `success: false`, SEM chamar
 * `upsertCategoryRule`.
 *
 * Sucesso: 200 com `{ success: true, data: { id, label, category } }`
 * RECONSTRUIDO campo a campo a partir do retorno de `upsertCategoryRule` -
 * o documento NUNCA aparece na resposta, mesmo que `upsertCategoryRule`
 * devolva um campo extra por engano (defesa em profundidade).
 *
 * Qualquer erro capturado -> 500 generico, sem vazar stack/detalhe.
 *
 * Nenhum `console.*` em nenhum caminho (o documento passa por aqui).
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.json().catch(() => null);
  const parsedBody = categoryRuleInputSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    const body: ApiResponse<never> = {
      success: false,
      error:
        "Corpo da requisicao invalido: document e category sao obrigatorios.",
    };
    return Response.json(body, { status: 400 });
  }

  try {
    const result = await upsertCategoryRule(parsedBody.data);
    const body: ApiResponse<{
      id: string;
      label: string | null;
      category: string;
    }> = {
      success: true,
      data: {
        id: result.id,
        label: result.label,
        category: result.category,
      },
    };
    return Response.json(body, { status: 200 });
  } catch {
    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel cadastrar esta regra. Tente novamente.",
    };
    return Response.json(body, { status: 500 });
  }
}

/**
 * GET /api/category-rules - Criterio de aceite #4 da TASK-008.
 *
 * Casca fina: chama `listCategoryRules()` e responde 200 com
 * `{ success: true, data: [...] }` - cada item reconstruido campo a campo
 * dentro de `listCategoryRules`, nunca `document`/`documentHash`.
 *
 * Erro capturado -> 500 generico. Nenhum `console.*`.
 */
export async function GET(): Promise<Response> {
  try {
    const rules = await listCategoryRules();
    const body: ApiResponse<
      Array<{ id: string; label: string | null; category: string }>
    > = {
      success: true,
      data: rules.map((rule) => ({
        id: rule.id,
        label: rule.label,
        category: rule.category,
      })),
    };
    return Response.json(body, { status: 200 });
  } catch {
    const body: ApiResponse<never> = {
      success: false,
      error: "Nao foi possivel carregar as regras de categorizacao.",
    };
    return Response.json(body, { status: 500 });
  }
}
