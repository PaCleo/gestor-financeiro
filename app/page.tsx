import { redirect } from "next/navigation";

/**
 * Home ("/") redireciona para "/dashboard" (TASK-012, Critério de aceite
 * #3). Server Component síncrono: `redirect()` interrompe a renderização
 * lançando um erro especial - por isso o tipo de retorno é `never`.
 */
export default function Home(): never {
  redirect("/dashboard");
}
