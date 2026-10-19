import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { managerDaPrincipal } from "@/lib/auth/acompanhamento-principal-server";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatedSessionId, requireSupportWrite } from "@/lib/impersonate/support";
import {
  IMPERSONATE_COOKIE_NAME,
  IMPERSONATE_TTL_SECONDS,
  isImpersonateSecretReady,
  signImpersonateCookie,
} from "@/lib/impersonate/cookie";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";

const inputSchema = z.object({ organization_id: z.string().uuid() }).strict();

export async function GET() {
  const requestId = randomUUID();
  try {
    const authz = await requireRole("manager", { requestId });
    if (!authz.ok) return authz.response;
    const actor = await managerDaPrincipal();
    if (!actor)
      return fail(
        "forbidden",
        "Acompanhamento disponível apenas para managers da Principal.",
        403,
        { requestId },
      );
    if (await mfaEmDivida())
      return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId });
    // Listagem transversal intencional, autorizada acima; não expõe configurações.
    const { data, error } = await createAdminClient()
      .from("organizations")
      .select("id, display_name")
      .eq("status", "active")
      .neq("id", actor.principalId)
      .order("display_name")
      .limit(500);
    if (error) throw new Error("organizations_unavailable");
    return ok(data ?? [], { requestId });
  } catch {
    return fail(
      "upstream_unavailable",
      "Não foi possível confirmar o acesso ao acompanhamento.",
      503,
      { requestId },
    );
  }
}

export async function POST(req: Request) {
  const requestId = randomUUID();
  const input = inputSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return fail("validation_failed", "Organização inválida.", 422, { requestId });
  const blocked = await requireSupportWrite();
  if (blocked) return blocked;
  try {
    const authz = await requireRole("manager", { requestId });
    if (!authz.ok) return authz.response;
    const actor = await managerDaPrincipal();
    if (!actor)
      return fail(
        "forbidden",
        "Acompanhamento disponível apenas para managers da Principal.",
        403,
        { requestId },
      );
    if (await mfaEmDivida())
      return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId });
    if (!isImpersonateSecretReady())
      return fail("upstream_unavailable", "Acompanhamento não configurado nesta instalação.", 503, {
        requestId,
      });
    const sessionId = await authenticatedSessionId();
    const admin = createAdminClient();
    const { data: id, error } = await admin.rpc("fn_start_support", {
      p_actor: actor.user.id,
      p_session: sessionId,
      p_org: input.data.organization_id,
      p_previous: actor.principalId,
      p_mode: "support_readonly",
      p_ttl: IMPERSONATE_TTL_SECONDS,
    });
    if (error || !id)
      return fail(
        "state_conflict",
        "Não foi possível iniciar. Confira seu acesso e a organização.",
        409,
        { requestId },
      );
    const { data: session } = await admin
      .from("platform_support_sessions")
      .select("expires_at")
      .eq("id", id)
      .eq("actor_user_id", actor.user.id)
      .eq("organization_id", input.data.organization_id)
      .single();
    if (!session)
      return fail(
        "upstream_unavailable",
        "Acompanhamento iniciado. Recarregue para confirmar.",
        503,
        { requestId },
      );
    (await cookies()).set(
      IMPERSONATE_COOKIE_NAME,
      signImpersonateCookie({
        tenantId: input.data.organization_id,
        platformAdminId: actor.user.id,
        sessionId: id,
        exp: Math.floor(new Date(session.expires_at).getTime() / 1000),
      }),
      { httpOnly: true, secure: cookieSecure(), sameSite: "strict", path: "/", maxAge: 3600 },
    );
    await audit({
      action: "support.manager_started",
      actorUserId: actor.user.id,
      actingAsPlatformAdmin: false,
      bypassedRls: true,
      organizationId: input.data.organization_id,
      resourceType: "organization",
      resourceId: input.data.organization_id,
      requestId,
      metadata: {
        support_session_id: id,
        auth_session_id: sessionId,
        access_mode: "support_readonly",
        authority: "primary_manager",
      },
    });
    return ok({ redirect_url: "/app/inbox" }, { requestId });
  } catch {
    return fail(
      "upstream_unavailable",
      "Não foi possível confirmar o acesso ao acompanhamento.",
      503,
      { requestId },
    );
  }
}
