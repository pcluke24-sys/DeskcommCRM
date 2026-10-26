"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export type RegraMetaDaEtapa = { event_name: string; requires_value: boolean };

export interface FunilParaConversoes {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; position: number }>;
  rules: Record<string, RegraMetaDaEtapa>;
  qualifiedDescription: string;
  disqualifiedDescription: string;
}

export function CriteriosDoFunil({
  funis,
  idioma,
}: {
  funis: FunilParaConversoes[];
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t("Critérios de qualificação do funil")}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t(
            "Estes critérios orientam a sugestão de qualificação. Os eventos enviados à Meta são configurados no editor oficial de regras por etapa.",
          )}
        </p>
      </div>
      {funis.map((funil) => (
        <EditorDoFunil key={funil.id} funil={funil} idioma={idioma} />
      ))}
    </section>
  );
}

function EditorDoFunil({ funil, idioma }: { funil: FunilParaConversoes; idioma: Idioma }) {
  const t = (texto: string) => traduzir(texto, idioma);
  const [isPending, startTransition] = useTransition();
  const [qualified, setQualified] = useState(funil.qualifiedDescription);
  const [disqualified, setDisqualified] = useState(funil.disqualifiedDescription);

  const regrasAntigas = Object.entries(funil.rules).filter(
    ([, regra]) => typeof regra?.event_name === "string" && regra.event_name.trim(),
  );

  function salvar() {
    startTransition(async () => {
      const resultado = await updatePipelineConfig(funil.id, {
        qualification_policy: {
          qualified_description: qualified,
          disqualified_description: disqualified,
        },
      });
      if (!resultado.ok) {
        toast.error(t("Não consegui salvar os critérios deste funil."));
        return;
      }
      toast.success(t("Critérios do funil salvos."));
    });
  }

  return (
    <Card className="flex flex-col gap-5 p-6" data-testid={`criterios-funil-${funil.id}`}>
      <div>
        <h3 className="font-medium">{funil.name}</h3>
      </div>

      {regrasAntigas.length > 0 && (
        <section
          className="rounded-md border border-border p-4 text-sm"
          data-testid="regras-meta-antigas"
        >
          <h4 className="font-medium">{t("Regras antigas — somente consulta")}</h4>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Estas regras foram preservadas, mas não são usadas pelo envio atual. Revise os eventos no editor oficial antes de ativá-los. Nada é convertido ou enviado automaticamente.",
            )}
          </p>
          <dl className="mt-3 space-y-1">
            {regrasAntigas.map(([stageId, regra]) => (
              <div key={stageId}>
                <dt className="inline font-medium">
                  {funil.stages.find((s) => s.id === stageId)?.name ?? stageId}:{" "}
                </dt>
                <dd className="inline">
                  {regra.event_name}
                  {regra.requires_value ? ` · ${t("Exigir valor")}` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`qualified-${funil.id}`}>{t("O que é um lead qualificado?")}</Label>
          <Textarea
            id={`qualified-${funil.id}`}
            maxLength={4000}
            rows={5}
            value={qualified}
            onChange={(event) => setQualified(event.target.value)}
            placeholder={t("Descreva perfil, necessidade, orçamento, região e demais critérios.")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`disqualified-${funil.id}`}>{t("O que desqualifica um lead?")}</Label>
          <Textarea
            id={`disqualified-${funil.id}`}
            maxLength={4000}
            rows={5}
            value={disqualified}
            onChange={(event) => setDisqualified(event.target.value)}
            placeholder={t("Descreva impedimentos e sinais objetivos de desqualificação.")}
          />
        </div>
      </div>

      <div>
        <Button onClick={salvar} disabled={isPending}>
          {isPending ? t("Salvando…") : t("Salvar critérios")}
        </Button>
      </div>
    </Card>
  );
}
