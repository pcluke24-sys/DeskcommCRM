"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SuspendDialog } from "./SuspendDialog";
import { ReactivateDialog } from "./ReactivateDialog";
import { ImpersonateButton } from "@/components/admin/ImpersonateButton";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { DeleteTenantDialog } from "./DeleteTenantDialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TenantActionsProps {
  organizationId: string;
  status: "active" | "suspended" | "redacted";
  displayName: string;
  aiModuleEnabled: boolean;
  onboardedAt?: string | null;
  slug?: string;
  canDeleteTenant?: boolean;
  primaryOrganizationId?: string | null;
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
  slug,
  canDeleteTenant = false,
  primaryOrganizationId = null,
}: TenantActionsProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [savingPrimary, setSavingPrimary] = useState(false);
  const isPrimary = primaryOrganizationId === organizationId;
  async function setPrimary() {
    setSavingPrimary(true);
    try {
      await apiClient.put(`/api/v1/admin/tenants/${organizationId}/primary`, {
        confirmation: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "tenant"] });
      setPrimaryOpen(false);
      toast.success("Organização principal definida e protegida contra exclusão.");
    } catch {
      toast.error("Não foi possível definir a organização principal.");
    } finally {
      setSavingPrimary(false);
    }
  }
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(aiModuleEnabled);
  const [savingAi, setSavingAi] = useState(false);
  const [completed, setCompleted] = useState(!!onboardedAt);
  const [savingSetup, setSavingSetup] = useState(false);
  async function completeSetup() {
    setSavingSetup(true);
    try {
      await apiClient.patch(`/api/v1/admin/tenants/${organizationId}`, {
        onboarding_complete: true,
      });
      setCompleted(true);
      toast.success(t("Implantação concluída. O cliente já pode acessar o CRM."));
    } catch {
      toast.error(t("Não foi possível concluir a implantação."));
    } finally {
      setSavingSetup(false);
    }
  }
  async function toggleAi() {
    setSavingAi(true);
    try {
      const next = !aiEnabled;
      await apiClient.patch(`/api/v1/admin/tenants/${organizationId}`, { ai_module_enabled: next });
      setAiEnabled(next);
      toast.success(next ? t("Módulo de IA liberado.") : t("Módulo de IA bloqueado."));
    } catch {
      toast.error(t("Não foi possível atualizar o módulo de IA."));
    } finally {
      setSavingAi(false);
    }
  }

  const canSuspend = status === "active";
  const isSuspended = status === "suspended";
  const isRedacted = status === "redacted";

  return (
    <>
      <div className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          {t("Ações")}
        </h2>

        {/* Impersonate (S-11.07) */}
        <ImpersonateButton
          organizationId={organizationId}
          displayName={displayName}
          disabled={isRedacted}
          disabledReason={isRedacted ? t("Tenant redigido — ação não disponível") : undefined}
        />
        <Button
          className="w-full"
          variant={aiEnabled ? "outline" : "default"}
          disabled={isRedacted || savingAi}
          onClick={toggleAi}
        >
          {aiEnabled ? t("Bloquear módulo de IA") : t("Liberar módulo de IA")}
        </Button>
        {!completed && status === "active" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t(
                "Configure a organização pelo acompanhamento ou pelo seletor de organizações. Depois marque a implantação como concluída.",
              )}
            </p>
            <Button
              className="w-full"
              variant="outline"
              disabled={savingSetup}
              onClick={completeSetup}
            >
              {t("Concluir implantação")}
            </Button>
          </div>
        )}

        {/* Suspend */}
        {canDeleteTenant && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {isPrimary
                ? t("Sua organização principal — protegida contra exclusão.")
                : !primaryOrganizationId
                  ? t("Defina sua organização principal antes de excluir qualquer tenant.")
                  : t("Esta é uma organização de cliente, não a principal.")}
            </p>
            {!isPrimary && status === "active" && (
              <Button className="w-full" variant="outline" onClick={() => setPrimaryOpen(true)}>
                {t("Definir como minha organização principal")}
              </Button>
            )}
          </div>
        )}
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

        {isSuspended && canDeleteTenant && slug && primaryOrganizationId && !isPrimary && (
          <Button className="w-full" variant="destructive" onClick={() => setDeleteOpen(true)}>
            {t("Excluir tenant definitivamente")}
          </Button>
        )}
        {isRedacted && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            {t("Tenant redigido — ações de gestão não disponíveis.")}
          </p>
        )}
      </div>

      <AlertDialog open={primaryOpen} onOpenChange={setPrimaryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Definir organização principal?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {displayName}
              {t(
                "será sua única organização principal e não poderá ser excluída. Se já houver outra principal, ela deixará de ter essa proteção. Nenhum dado será apagado.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPrimary}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingPrimary}
              onClick={(event) => {
                event.preventDefault();
                void setPrimary();
              }}
            >
              {savingPrimary ? t("Salvando...") : t("Confirmar organização principal")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canDeleteTenant && slug && (
        <DeleteTenantDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          organizationId={organizationId}
          slug={slug}
        />
      )}
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
