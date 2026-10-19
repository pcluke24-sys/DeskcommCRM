import { loadAuthUser, orgAtivaSemPortao } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeAcompanharComoManager } from "./acompanhamento-principal";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

/** Controle global server-only, não uma consulta de dados da organização ativa.
 * A página recebe somente a capacidade de exibir a porta; a API revalida tudo.
 */
export async function principalDoManagerNaApresentacao(user: AuthUser, active: ActiveOrg | null) {
  if (!active || active.role !== "manager" || user.support) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("platform_primary_organization")
      .select("organization_id")
      .eq("id", 1)
      .maybeSingle();
    if (error || !podeAcompanharComoManager(user, data?.organization_id, active.orgId)) return null;
    return active.orgId;
  } catch {
    // Consulta de apresentação opcional: falha não derruba o CRM nem concede acesso.
    return null;
  }
}

/** Falha de consulta não vira autorização. O cliente nunca escolhe a Principal. */
export async function managerDaPrincipal() {
  const user = await loadAuthUser();
  if (!user || user.support) return null;
  const active = await orgAtivaSemPortao(user);
  if (!active || active.role !== "manager") return null;
  const { data, error } = await createAdminClient()
    .from("platform_primary_organization")
    .select("organization_id")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível confirmar a organização principal.");
  if (!podeAcompanharComoManager(user, data?.organization_id, active.orgId)) return null;
  const { data: authorized, error: authorityError } = await createAdminClient().rpc(
    "fn_manager_principal",
    { p_actor: user.id },
  );
  if (authorityError) throw new Error("Não foi possível confirmar a autoridade do manager.");
  if (authorized !== true) return null;
  return { user, principalId: active.orgId };
}
