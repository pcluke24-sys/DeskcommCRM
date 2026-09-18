"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export function DeleteTenantDialog({
  open,
  onClose,
  organizationId,
  slug,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  slug: string;
}) {
  const t = useT();
  const router = useRouter();
  const queries = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    setPending(true);
    setError(null);
    try {
      await apiClient.delete(`/api/v1/admin/tenants/${organizationId}/delete`, {
        confirmation,
        reason,
      });
      await queries.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Tenant excluído. A limpeza dos arquivos será feita automaticamente.");
      router.replace("/admin/tenants");
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o tenant.");
    } finally {
      setPending(false);
    }
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Excluir tenant definitivamente")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "Esta ação não pode ser desfeita. Apaga os dados desta organização, incluindo leads, conversas, relatórios e credenciais. Outros tenants e contas de login não serão excluídos. Remova as sessões de WhatsApp e desconecte as integrações antes de continuar.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <Label htmlFor="delete-tenant-confirmation">
            {t("Digite")} {slug} {t("para confirmar")}
          </Label>
          <Input
            id="delete-tenant-confirmation"
            value={confirmation}
            disabled={pending}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
          <Label htmlFor="delete-tenant-reason">
            {t("Motivo da exclusão (mínimo 10 caracteres)")}
          </Label>
          <Textarea
            id="delete-tenant-reason"
            value={reason}
            disabled={pending}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending || confirmation !== slug || reason.trim().length < 10}
            onClick={remove}
          >
            {pending ? "Excluindo..." : "Excluir definitivamente"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
