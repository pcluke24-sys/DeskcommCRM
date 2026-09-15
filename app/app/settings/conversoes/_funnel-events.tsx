"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

const SUGESTOES = [
  "Contact",
  "Lead",
  "QualifiedLead",
  "Schedule",
  "AppointmentAttended",
  "DisqualifiedLead",
  "Purchase",
] as const;

export function EventosDoFunil({
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
        <h2 className="text-lg font-semibold">{t("Eventos por etapa do funil")}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t(
            "Escolha o sinal enviado quando um negócio entra em cada etapa. Cada evento sai uma única vez por negócio e somente depois de salvar esta configuração.",
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
  const [rules, setRules] = useState(funil.rules);
  const [qualified, setQualified] = useState(funil.qualifiedDescription);
  const [disqualified, setDisqualified] = useState(funil.disqualifiedDescription);

  const rulesLimpas = useMemo(
    () => Object.fromEntries(Object.entries(rules).filter(([, regra]) => regra.event_name.trim())),
    [rules],
  );

  function salvar() {
    startTransition(async () => {
      const resultado = await updatePipelineConfig(funil.id, {
        meta_conversion_rules: rulesLimpas,
        qualification_policy: {
          qualified_description: qualified,
          disqualified_description: disqualified,
        },
      });
      if (!resultado.ok) {
        toast.error(t("Não consegui salvar os eventos deste funil."));
        return;
      }
      toast.success(t("Eventos do funil salvos. Os próximos movimentos já usam este mapa."));
    });
  }

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div>
        <h3 className="font-medium">{funil.name}</h3>
        <p className="text-xs text-muted-foreground">
          {t("Deixe o evento vazio quando a etapa não deve ensinar nada à plataforma.")}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {funil.stages.map((stage) => {
          const regra = rules[stage.id] ?? { event_name: "", requires_value: false };
          return (
            <div
              key={stage.id}
              className="grid gap-3 rounded-md border p-4 md:grid-cols-[minmax(160px,1fr)_minmax(220px,1fr)_auto] md:items-end"
            >
              <div>
                <Label>{t("Etapa")}</Label>
                <p className="mt-2 text-sm font-medium">{stage.name}</p>
              </div>
              <div>
                <Label htmlFor={`meta-event-${stage.id}`}>{t("Evento enviado")}</Label>
                <Input
                  id={`meta-event-${stage.id}`}
                  list="meta-event-suggestions"
                  maxLength={40}
                  value={regra.event_name}
                  placeholder={t("Nenhum evento")}
                  onChange={(event) =>
                    setRules((current) => ({
                      ...current,
                      [stage.id]: { ...regra, event_name: event.target.value },
                    }))
                  }
                />
              </div>
              <div className="flex min-h-10 items-center gap-2">
                <Switch
                  id={`meta-value-${stage.id}`}
                  checked={regra.event_name === "Purchase" || regra.requires_value}
                  disabled={regra.event_name === "Purchase"}
                  onCheckedChange={(checked) =>
                    setRules((current) => ({
                      ...current,
                      [stage.id]: { ...regra, requires_value: checked },
                    }))
                  }
                />
                <Label htmlFor={`meta-value-${stage.id}`}>{t("Exigir valor")}</Label>
              </div>
            </div>
          );
        })}
      </div>
      <datalist id="meta-event-suggestions">
        {SUGESTOES.map((nome) => (
          <option key={nome} value={nome} />
        ))}
      </datalist>

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
          {isPending ? t("Salvando…") : t("Salvar eventos e critérios")}
        </Button>
      </div>
    </Card>
  );
}
