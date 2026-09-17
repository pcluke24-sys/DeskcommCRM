/**
 * Shared helpers for onboarding Server Actions: resolve auth + active org +
 * admin client (we use service-role here because we do narrow targeted
 * UPDATEs scoped explicitly by `organization_id` resolved from the validated
 * session — no body-derived ids ever).
 */
import { supportWriteError } from "@/lib/impersonate/support";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OnboardingState } from "@/lib/schemas/onboarding";
import { moduloIaEstaLiberado } from "@/lib/ai/modulo";
import { podeConfigurarOrganizacao } from "@/lib/onboarding/acesso";

export class OnboardingError extends Error {
  constructor(
    public readonly code:
      "auth_required" | "no_active_org" | "forbidden" | "not_found" | "db_error",
    message: string,
  ) {
    super(message);
    this.name = "OnboardingError";
  }
}

export interface OnboardingCtx {
  userId: string;
  orgId: string;
  orgName: string;
  role: string;
  fullName: string | null;
  email: string;
}

export async function requireOnboardingCtx(): Promise<OnboardingCtx> {
  const user = await loadAuthUser();
  if (!user) throw new OnboardingError("auth_required", "Auth required.");
  if (supportWriteError(user.support))
    throw new OnboardingError("forbidden", "Acompanhamento somente leitura ou encerrado.");
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) throw new OnboardingError("no_active_org", "Sem organização ativa.");
  if (!podeConfigurarOrganizacao(activeOrg.role))
    throw new OnboardingError("forbidden", "Somente administrador ou manager configura a organização.");
  const { data: configuration, error: configurationError } = await createAdminClient().from("organizations")
    .select("settings").eq("id", activeOrg.orgId).maybeSingle();
  if (configurationError) throw new OnboardingError("db_error", configurationError.message);
  if ((configuration?.settings as Record<string, unknown> | null)?.setup_mode === "agency" && !user.is_platform_admin)
    throw new OnboardingError("forbidden", "A agência está preparando esta organização.");
  return {
    userId: user.id,
    orgId: activeOrg.orgId,
    orgName: activeOrg.name,
    role: activeOrg.role,
    fullName: user.full_name,
    email: user.email,
  };
}

export async function loadOnboardingState(
  orgId: string,
  includeAiModule = false,
): Promise<{
  state: OnboardingState;
  onboardedAt: string | null;
  aiModuleEnabled: boolean;
  setupMode: "agency" | "client";
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select(
      includeAiModule
        ? "onboarding_state, onboarded_at, settings"
        : "onboarding_state, onboarded_at",
    )
    .eq("id", orgId)
    .maybeSingle<{ onboarding_state: unknown; onboarded_at: string | null; settings?: unknown }>();
  if (error) throw new OnboardingError("db_error", error.message);
  if (!data) throw new OnboardingError("not_found", "Organização não encontrada.");
  return {
    state: (data.onboarding_state as OnboardingState | null) ?? {},
    onboardedAt: (data.onboarded_at as string | null) ?? null,
    aiModuleEnabled: moduloIaEstaLiberado(data.settings),
    setupMode: (data.settings as Record<string, unknown> | null)?.setup_mode === "agency" ? "agency" : "client",
  };
}

export async function patchOnboardingState(
  orgId: string,
  patch: Partial<OnboardingState>,
  extra?: { display_name?: string; timezone?: string },
): Promise<void> {
  const admin = createAdminClient();
  const { state } = await loadOnboardingState(orgId);
  const merged: OnboardingState = { ...state, ...patch };
  const update: Record<string, unknown> = { onboarding_state: merged };
  if (extra?.display_name) update.display_name = extra.display_name;
  if (extra?.timezone) update.timezone = extra.timezone;
  const { error } = await admin.from("organizations").update(update).eq("id", orgId);
  if (error) throw new OnboardingError("db_error", error.message);
}
