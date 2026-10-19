import type { AuthUser } from "@/lib/auth/types";
import { ehOperante } from "@/lib/organizacao/operante";

/** Regra de entrada, não substitui a revalidação transacional no banco.
 * IDs e papéis vêm do servidor, nunca do body ou do seletor do navegador.
 */
export function podeAcompanharComoManager(
  user: Pick<AuthUser, "organizations" | "support">,
  principalId: string | null | undefined,
  activeOrgId: string | null | undefined,
): boolean {
  if (!principalId || activeOrgId !== principalId || user.support) return false;
  return user.organizations.some(
    (membership) =>
      membership.organization_id === principalId &&
      membership.role === "manager" &&
      ehOperante(membership.org_status),
  );
}
