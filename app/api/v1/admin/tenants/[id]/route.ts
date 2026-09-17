import { type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { mfaEmDivida } from "@/lib/auth/server";

// ---------------------------------------------------------------------------
// GET /api/v1/admin/tenants/[id]
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const { id } = await params;

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const admin = createAdminClient();

  // Load the organization (service-role bypasses RLS — intentional cross-tenant)
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select(
      `
      id,
      slug,
      display_name,
      legal_name,
      cnpj,
      status,
      onboarded_at,
      suspended_at,
      created_at,
      settings
    `,
    )
    .eq("id", id)
    .single();

  if (orgError || !org) {
    return fail("not_found", "Tenant not found", 404, { requestId });
  }

  // Run counts in parallel — service role, all cross-tenant reads are intentional
  const [
    usersRes,
    conversationsRes,
    messagesRes,
    leadsRes,
    ordersRes,
    lgpdRes,
    aiRes,
    wahaRes,
    integrationRes,
  ] = await Promise.all([
    admin
      .from("user_organizations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id),
    admin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id),
    admin.from("messages").select("*", { count: "exact", head: true }).eq("organization_id", id),
    admin.from("crm_leads").select("*", { count: "exact", head: true }).eq("organization_id", id),
    admin.from("orders").select("*", { count: "exact", head: true }).eq("organization_id", id),
    admin
      .from("lgpd_requests")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id)
      // `pending` não existe em `lgpd_requests_status_check`
      // (received/processing/completed/failed/expired), então este contador era
      // sempre 0 e a tela jurava que o tenant não devia nada à LGPD. Aqui
      // pendente = TUDO que ainda não fechou, sem recorte de prazo. O KPI de
      // plataforma (`app/api/v1/admin/dashboard/kpis/route.ts`) parte do mesmo
      // "não fechado" mas soma só o que vence nos próximos 5 dias — os dois
      // números divergem de propósito: este é o total do tenant, aquele é a
      // fila de SLA da plataforma.
      .not("status", "in", "(completed,failed)"),
    // `llm_calls` e não `ai_invocations`: a migration 0130 deixou a segunda sem
    // nenhum escritor (`lib/ai/log-invocation.ts` passou a gravar na primeira).
    // Lendo a tabela morta, este contador viraria ZERO em 30 dias para todo
    // tenant — com o dinheiro saindo. É o mesmo sintoma que a 0130 veio matar.
    admin
      .from("llm_calls")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    admin
      .from("channel_sessions")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id),
    admin
      .from("tenant_integrations")
      // `connected_at` não existe: a linha passa a existir quando a integração
      // é conectada, então `created_at` é essa mesma data com o nome real.
      .select("id, provider, status, created_at")
      .eq("organization_id", id)
      .eq("provider", "nuvemshop")
      .limit(1),
  ]);

  const counts = {
    user_count: usersRes.count ?? 0,
    conversations_count: conversationsRes.count ?? 0,
    messages_count: messagesRes.count ?? 0,
    leads_count: leadsRes.count ?? 0,
    orders_count: ordersRes.count ?? 0,
    lgpd_requests_pending: lgpdRes.count ?? 0,
    ai_invocations_30d: aiRes.count ?? 0,
    waha_sessions_count: wahaRes.count ?? 0,
  };

  const nuvemshopIntegration =
    integrationRes.data && integrationRes.data.length > 0 ? integrationRes.data[0] : null;

  const integrations = {
    nuvemshop_status: nuvemshopIntegration?.status ?? null,
    // Nome de SAÍDA preservado: é o que TenantOverview já lê. Só a coluna de
    // origem estava errada.
    nuvemshop_connected_at: nuvemshopIntegration?.created_at ?? null,
  };

  // Audit lightweight — fire-and-forget
  void audit({
    action: "platform_admin.tenant_viewed",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: id,
    resourceType: "organization",
    resourceId: id,
    requestId,
    metadata: { tenant_slug: org.slug },
  });

  const { data: deletionOwner, error: deletionError } = await admin.rpc(
    "fn_tenant_deletion_owner",
    { p_actor: adminCtx.user.id },
  );
  return ok(
    {
      organization: org,
      counts,
      integrations,
      can_delete_tenant: !deletionError && deletionOwner === true,
    },
    { requestId },
  );
}

/** Liga/desliga o módulo comercial de IA. Somente a plataforma decide isso. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  if (adminCtx.platformAdmin.scope !== "full")
    return fail("forbidden", "Acesso somente leitura", 403, { requestId });
  if (await mfaEmDivida())
    return fail("mfa_required", "Confirme a verificação em duas etapas", 403, { requestId });
  const body = await req.json().catch(() => null);
  const parsed = z
    .object({
      ai_module_enabled: z.boolean().optional(),
      onboarding_complete: z.literal(true).optional(),
    })
    .refine((v) => v.ai_module_enabled !== undefined || v.onboarding_complete === true)
    .safeParse(body);
  if (!parsed.success) return fail("validation_error", "Configuração inválida", 400, { requestId });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return fail("validation_error", "ID inválido", 400, { requestId });
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("settings, onboarded_at, status")
    .eq("id", id)
    .maybeSingle();
  if (!org) return fail("not_found", "Tenant not found", 404, { requestId });
  if (org.status !== "active")
    return fail("conflict", "Organização não está ativa", 409, { requestId });
  const { error } = await admin
    .from("organizations")
    .update({
      ...(parsed.data.ai_module_enabled !== undefined
        ? {
            settings: {
              ...((org.settings as Record<string, unknown> | null) ?? {}),
              ai_module_enabled: parsed.data.ai_module_enabled,
            },
          }
        : {}),
      ...(parsed.data.onboarding_complete
        ? { onboarded_at: org.onboarded_at ?? new Date().toISOString() }
        : {}),
    })
    .eq("id", id);
  if (error)
    return fail("internal_error", "Não foi possível atualizar o módulo de IA", 500, { requestId });
  await audit({
    action: parsed.data.onboarding_complete ? "onboarding.completed" : "tenant.ai_module_updated",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: id,
    resourceType: "organization",
    resourceId: id,
    requestId,
    metadata: parsed.data,
  });
  return ok(parsed.data, { requestId });
}
