/**
 * Formato padrao de resposta das API routes do projeto
 * (.claude/rules/typescript-patterns.md).
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}
