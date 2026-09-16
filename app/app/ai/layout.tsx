/**
 * As abas de seção que viviam aqui foram removidas: só apareciam para quem já
 * estava dentro de `/app/ai/*`, o que deixava Conhecimento, Credenciais, Uso,
 * Casos e Alertas invisíveis do resto do sistema. Quem faz esse trabalho agora
 * é o hub em `/app/ai`, alcançável pelo sidebar.
 */
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { moduloIaEstaLiberado } from "@/lib/ai/modulo";

export default async function AiLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/inbox");
  const { data } = await createAdminClient()
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (!moduloIaEstaLiberado(data?.settings)) redirect("/app/inbox");
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
