/**
 * Constantes de lancamentos manuais (TASK-009) extraidas para um modulo SEM
 * I/O - nenhum import de `@/lib/db`/Prisma. Componentes client-side ("use
 * client") como `AddEntryForm`/`EditEntryForm` importam
 * `ENTRY_METHODS`/`ENTRY_DIRECTIONS` DAQUI, nunca de `lib/entries.ts`
 * diretamente, para nao arrastar o driver `pg` (server-only) para o bundle
 * do browser - isso quebra `npm run build` com "Module not found: Can't
 * resolve 'net'/'tls'/'util/types'" (o driver `pg` so roda em Node).
 *
 * `lib/entries.ts` reexporta estes mesmos simbolos, entao o contrato
 * `import { ENTRY_METHODS } from "@/lib/entries"` (usado pelos testes e
 * pelas rotas server-side) continua valendo.
 */
export const ENTRY_METHODS = ["PIX", "TED", "DEBIT", "CREDIT", "CASH"] as const;
export type EntryMethod = (typeof ENTRY_METHODS)[number];

export const ENTRY_DIRECTIONS = ["entrada", "saida"] as const;
export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];
