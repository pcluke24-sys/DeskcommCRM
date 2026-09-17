"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SuspendDialog } from "./SuspendDialog";
import { ReactivateDialog } from "./ReactivateDialog";
import { ImpersonateButton } from "@/components/admin/ImpersonateButton";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TenantActionsProps {
  organizationId: string;
  status: "active" | "suspended" | "redacted";
  displayName: string;
  aiModuleEnabled: boolean;
  onboardedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TenantActions({
  organizationId,
  status,
  displayName,
  aiModuleEnabled,
  onboardedAt,
}: TenantActionsProps) {
  const t = useT();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(aiModuleEnabled);
  const [savingAi, setSavingAi] = useState(false);
  const [completed, setCompleted] = useState(!!onboardedAt);
  const [savingSetup, setSavingSetup] = useState(false);
  async function completeSetup() {
    setSavingSetup(true);
    try {
      await apiClient.patch(`/api/v1/admin/tenants/${organizationId}`, { onboarding_complete: true });
      setCompleted(true);
      toast.success(t("Implantação concluída. O cliente já pode acessar o CRM."));
    } catch { toast.error(t("Não foi possível concluir a implantação.")); }
    finally { setSavingSetup(false); }
  }
  async function toggleAi() {
    setSavingAi(true);
    try {
      const next = !aiEnabled;
      await apiClient.patch(`/api/v1/admin/tenants/${organizationId}`, { ai_module_enabled: next });
      setAiEnabled(next);
      toast.success(next ? t("Módulo de IA liberado.") : t("Módulo de IA bloqueado."));
    } catch { toast.error(t("Não foi possível atualizar o módulo de IA.")); }
    finally { setSavingAi(false); }
  }

  const canSuspend = status === "active";
  const isSuspended = status === "suspended";
  const isRedacted = status === "redacted";

  return (
    <>
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("Ações")}
        </h2>

        {/* Impersonate (S-11.07) */}
        <ImpersonateButton
          organizationId={organizationId}
          displayName={displayName}
          disabled={isRedacted}
          disabledReason={
            isRedacted ? t("Tenant redigido — ação não disponível") : undefined
          }
        />
        <Button className="w-full" variant={aiEnabled ? "outline" : "default"} disabled={isRedacted || savingAi} onClick={toggleAi}>
          {aiEnabled ? t("Bloquear módulo de IA") : t("Liberar módulo de IA")}
        </Button>
        {!completed && status === "active" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("Configure a organização pelo acompanhamento ou pelo seletor de organizações. Depois marque a implantação como concluída.")}</p>
            <Button className="w-full" variant="outline" disabled={savingSetup} onClick={completeSetup}>
              {t("Concluir implantação")}
            </Button>
          </div>
        )}

        {/* Suspend */}
        {canSuspend && (
          <Button
            className="w-full"
            variant="destructive"
            onClick={() => setSuspendOpen(true)}
            aria-label={t("Suspender tenant")}
          >
            {t("Suspender tenant")}
          </Button>
        )}

        {/* Reactivate */}
        {isSuspended && (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setReactivateOpen(true)}
            aria-label={t("Reativar tenant")}
          >
            {t("Reativar tenant")}
          </Button>
        )}

        {isRedacted && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {t("Tenant redigido — ações de gestão não disponíveis.")}
          </p>
        )}
      </div>

      <SuspendDialog
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        organizationId={organizationId}
      />

      <ReactivateDialog
        open={reactivateOpen}
        onClose={() => setReactivateOpen(false)}
        organizationId={organizationId}
      />
    </>
  );
}
