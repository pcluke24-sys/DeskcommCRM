import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decidirConviteDoSignup } from "@/lib/auth/convite-no-signup";
import { aplicarConvite } from "@/lib/auth/aplicar-convite";
import { env } from "@/lib/env";

/** Retoma o convite quando o e-mail confirmou, mas o callback não fechou o vínculo. */
export async function GET() {
  const go = (path: string) => NextResponse.redirect(new URL(path, env.NEXT_PUBLIC_APP_URL));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return go("/login");
  const { data: membership, error } = await supabase.from("user_organizations")
    .select("organization_id").eq("user_id", user.id).is("revoked_at", null).limit(1).maybeSingle();
  if (error) return go("/503");
  if (membership) return go("/app");
  const decision = decidirConviteDoSignup(user);
  if (decision.tipo === "provisionar") return go("/get-started");
  const token = decision.tipo === "convite" ? decision.token : user.user_metadata?.invite_token;
  if (decision.tipo === "convite" && user.email_confirmed_at) {
    const result = await aplicarConvite({ userId: user.id, payload: decision.payload });
    if (result.ok) return go("/app");
  }
  // Erro visível e saída para reenviar; nunca ganha uma organização própria.
  return go(`/team/accept-invite/${encodeURIComponent(String(token))}`);
}
