import { loadAuthUser, orgAtivaSemPortao } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeAcompanharComoManager } from "./acompanhamento-principal";

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
