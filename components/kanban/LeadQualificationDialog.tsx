"use client";

import { useState, useTransition } from "react";

import {
  suggestQualification,
  type SugestaoDeQualificacao,
} from "@/app/actions/leads/suggestQualification";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";

const ERROS: Record<string, string> = {
  qualification_policy_missing: "Defina primeiro os critérios em Configurações → Conversões.",
  ai_not_configured: "Publique um agente de IA para esta empresa antes de analisar.",
  ai_credential_unavailable: "A credencial de IA desta empresa não está disponível.",
  ai_invalid_response: "A IA não devolveu uma análise válida. Tente novamente.",
};

export function LeadQualificationDialog({
  open,
  onOpenChange,
  leadId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<SugestaoDeQualificacao | null>(null);
  const [error, setError] = useState<string | null>(null);

  function changeOpen(next: boolean) {
    if (!next) {
      setSuggestion(null);
      setError(null);
    }
    onOpenChange(next);
  }

  function analyze() {
    setError(null);
    startTransition(async () => {
      const result = await suggestQualification(leadId);
      if (!result.ok) {
        setError(t(ERROS[result.error] ?? "Não consegui analisar este lead agora."));
        return;
      }
      setSuggestion(result.sugestao);
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Ajuda da IA para qualificar")}</DialogTitle>
          <DialogDescription>
            {t(
              "A IA apenas sugere. Você confirma movendo o card para a etapa adequada; só esse gesto humano pode disparar o evento da Meta.",
            )}
          </DialogDescription>
        </DialogHeader>

        {!suggestion && !error && (
          <p className="text-sm text-muted-foreground">
            {t("A análise compara a conversa com os critérios definidos para este funil.")}
          </p>
        )}
        {error && (
          <p className="rounded-md border border-warning bg-warning-bg p-3 text-sm">{error}</p>
        )}
        {suggestion && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="font-medium capitalize">{t(suggestion.classificacao)}</p>
              <p className="text-muted-foreground">
                {t("Confiança")}: {suggestion.confianca}%
              </p>
            </div>
            <p>{suggestion.justificativa}</p>
            <div>
              <p className="font-medium">{t("Critérios encontrados")}</p>
              <ul className="list-disc pl-5">
                {suggestion.criterios_encontrados.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">{t("Informações ausentes")}</p>
              <ul className="list-disc pl-5">
                {suggestion.informacoes_ausentes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => changeOpen(false)}>
            {t("Fechar")}
          </Button>
          <Button onClick={analyze} disabled={isPending}>
            {isPending
              ? t("Analisando…")
              : suggestion
                ? t("Analisar novamente")
                : t("Analisar lead")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
