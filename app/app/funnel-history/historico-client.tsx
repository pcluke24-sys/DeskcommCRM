"use client";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  csvDeAtribuicao,
  csvDoFunil,
  type AgrupamentoDeAtribuicao,
  type HistoricoDeAtribuicao,
  type HistoricoDoFunil,
} from "@/lib/reports/historico-do-funil";

interface Resposta {
  pipelines: Array<{ id: string; name: string }>;
  pipeline: { id: string; name: string } | null;
  report: HistoricoDoFunil | null;
  window: { from: string; to: string };
}
interface RespostaAtribuicao {
  pipelines: Array<{ id: string; name: string }>;
  pipeline: { id: string; name: string } | null;
  attribution: HistoricoDeAtribuicao | null;
  window: { from: string; to: string };
}
const nomesDosAgrupamentos: Record<AgrupamentoDeAtribuicao, string> = {
  origem: "Origem",
  utm_source: "UTM source",
  utm_campaign: "UTM campaign",
  ad_reference: "Referência de anúncio",
};
function rotuloDoGrupo(groupBy: AgrupamentoDeAtribuicao, key: string) {
  const semValor: Partial<Record<AgrupamentoDeAtribuicao, string>> = {
    origem: "Sem origem informada",
    utm_source: "Sem UTM source",
    utm_campaign: "Sem UTM campaign",
    ad_reference: "Sem referência de anúncio",
  };
  if (
    key === "sem_origem" ||
    key === "sem_utm_source" ||
    key === "sem_utm_campaign" ||
    key === "sem_referencia_de_anuncio"
  )
    return semValor[groupBy];
  return key;
}
function dataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function janela(de: string, ate: string) {
  const inicio = new Date(`${de}T00:00:00`);
  const fim = new Date(`${ate}T00:00:00`);
  fim.setDate(fim.getDate() + 1);
  if (
    !Number.isFinite(+inicio) ||
    !Number.isFinite(+fim) ||
    +fim <= +inicio ||
    +fim - +inicio > 366 * 86400000
  )
    return null;
  return { from: inicio.toISOString(), to: fim.toISOString() };
}
export function HistoricoClient() {
  const t = useT();
  const idioma = useIdioma();
  const [de, setDe] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return dataLocal(d);
  });
  const [ate, setAte] = useState(() => dataLocal(new Date()));
  const [pipelineId, setPipelineId] = useState("");
  const [visao, setVisao] = useState<"etapas" | "atribuicao">("etapas");
  const [agrupamento, setAgrupamento] = useState<AgrupamentoDeAtribuicao>("origem");
  const periodo = janela(de, ate);
  const consulta = useQuery({
    queryKey: ["reports", "funnel-history", de, ate, pipelineId],
    enabled: !!periodo,
    queryFn: () =>
      apiClient.get<{ data: Resposta }>(
        `/api/v1/reports/funnel?${new URLSearchParams({ ...periodo!, ...(pipelineId ? { pipeline_id: pipelineId } : {}) })}`,
      ),
    staleTime: 30000,
  });
  const dados = consulta.data?.data;
  const report = dados?.report;
  const atribuicaoConsulta = useQuery({
    queryKey: [
      "reports",
      "funnel-attribution",
      de,
      ate,
      pipelineId,
      dados?.pipeline?.id,
      agrupamento,
    ],
    enabled: !!periodo && visao === "atribuicao",
    queryFn: () =>
      apiClient.get<{ data: RespostaAtribuicao }>(
        `/api/v1/reports/funnel?${new URLSearchParams({
          ...periodo!,
          group_by: agrupamento,
          ...(pipelineId ? { pipeline_id: pipelineId } : {}),
        })}`,
      ),
    staleTime: 30000,
  });
  const attribution = atribuicaoConsulta.data?.data.attribution;
  function baixar() {
    if (!dados?.pipeline) return;
    const conteudo =
      visao === "atribuicao" && attribution
        ? csvDeAtribuicao(attribution, dados.pipeline.name, dados.window.from, dados.window.to)
        : report
          ? csvDoFunil(report, dados.pipeline.name, dados.window.from, dados.window.to)
          : null;
    if (!conteudo) return;
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${visao === "atribuicao" ? "atribuicao-funil" : "historico-funil"}-${de}-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          {t("De")}
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          {t("Até (inclusive)")}
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          {t("Funil")}
          <select
            aria-label={t("Funil")}
            className="flex h-9 w-full rounded-md border bg-background px-3"
            value={pipelineId || dados?.pipeline?.id || ""}
            onChange={(e) => setPipelineId(e.target.value)}
          >
            {dados?.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            void consulta.refetch();
            if (visao === "atribuicao") void atribuicaoConsulta.refetch();
          }}
          disabled={!periodo || consulta.isFetching}
        >
          {t("Atualizar")}
        </Button>
        <Button
          onClick={baixar}
          disabled={
            !periodo ||
            consulta.isFetching ||
            consulta.isError ||
            (visao === "etapas" ? !report : !attribution || atribuicaoConsulta.isFetching)
          }
        >
          {t("Baixar CSV")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Datas no fuso do seu navegador (")}
        {Intl.DateTimeFormat().resolvedOptions().timeZone}
        {t("). Máximo: 366 dias. Entradas repetidas contam uma vez por lead em cada etapa.")}
      </p>
      <div className="flex flex-wrap items-center gap-2" aria-label={t("Tipo de relatório")}>
        <Button
          variant={visao === "etapas" ? "default" : "outline"}
          onClick={() => setVisao("etapas")}
        >
          {t("Por etapas")}
        </Button>
        <Button
          variant={visao === "atribuicao" ? "default" : "outline"}
          onClick={() => setVisao("atribuicao")}
        >
          {t("Por origem e campanhas")}
        </Button>
        {visao === "atribuicao" && (
          <label className="ml-1 space-y-1 text-sm">
            {t("Agrupar por")}
            <select
              aria-label={t("Agrupar relatório de atribuição por")}
              className="flex h-9 w-full rounded-md border bg-background px-3"
              value={agrupamento}
              onChange={(e) => setAgrupamento(e.target.value as AgrupamentoDeAtribuicao)}
            >
              {Object.entries(nomesDosAgrupamentos).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(String(label))}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!periodo && <p role="alert">{t("Selecione um período válido de até 366 dias.")}</p>}
      {consulta.isLoading && <p role="status">{t("Carregando histórico…")}</p>}
      {consulta.isError && (
        <p role="alert" className="text-destructive">
          {t("Não foi possível carregar o relatório. Clique em Atualizar para tentar novamente.")}
        </p>
      )}
      {visao === "etapas" && periodo && report && (
        <>
          <p className="rounded-md border p-3 text-sm">
            {t("Coleta iniciada:")}{" "}
            {report.enabled_since
              ? new Date(report.enabled_since).toLocaleString(idioma)
              : t("no primeiro novo registro")}
            {t(". Nenhum histórico anterior foi recuperado.")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [t("Leads com atividade no período"), report.totals.leads],
              ["Novos leads recebidos", report.totals.received],
              [t("Leads com venda"), report.totals.won],
              ["Leads perdidos", report.totals.lost],
            ].map(([label, n]) => (
              <Card key={t(String(label))}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{t(String(label))}</p>
                  <p className="text-2xl font-semibold">{n}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {report.totals.leads === 0 && (
            <p className="rounded-md border p-4">
              {t(
                "Ainda não há entradas registradas neste período. Crie ou mova um lead no Kanban e clique em Atualizar.",
              )}
            </p>
          )}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {[
                    "Etapa",
                    t("Leads únicos"),
                    "Entradas",
                    t("Próxima etapa"),
                    t("Avançaram"),
                    t("Taxa de avanço"),
                  ].map((h) => (
                    <th key={t(h)} className="p-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.stages.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3">{s.leads}</td>
                    <td className="p-3">{s.entries}</td>
                    <td className="p-3">
                      {s.advanced === null
                        ? "—"
                        : (report.stages.find((n) => n.id === s.next_stage_id)?.name ?? "—")}
                    </td>
                    <td className="p-3">{s.advanced ?? "—"}</td>
                    <td className="p-3">{s.advance_rate === null ? "—" : `${s.advance_rate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Taxa: entre os leads que entraram na etapa, quantos depois entraram na próxima etapa não perdida, dentro do mesmo período. Não é uma previsão nem a divisão dos totais entre colunas. Saltos, retornos e entradas anteriores ao período podem explicar diferenças. Ganhos e perdas são desfechos registrados no período, não o estado atual; um lead reaberto pode aparecer nos dois.",
            )}
          </p>
          <Link className="text-sm underline" href="/app/kanban">
            {t("Abrir Kanban para acompanhar e agir")}
          </Link>
        </>
      )}
      {visao === "atribuicao" && atribuicaoConsulta.isLoading && (
        <p role="status">{t("Carregando atribuição…")}</p>
      )}
      {visao === "atribuicao" && atribuicaoConsulta.isError && (
        <p role="alert" className="text-destructive">
          {t("Não foi possível carregar a atribuição. Clique em Atualizar para tentar novamente.")}
        </p>
      )}
      {visao === "atribuicao" && attribution && (
        <>
          <p className="rounded-md border p-3 text-sm">
            {t(
              "Cada célula é o número de leads únicos que entraram naquela etapa no período, agrupados pela origem registrada quando o lead nasceu. Um lead pode aparecer em mais de uma etapa.",
            )}
          </p>
          {attribution.groups.length === 0 ? (
            <p className="rounded-md border p-4">
              {t(
                "Ainda não há entradas registradas neste período. Crie ou mova um lead no Kanban e clique em Atualizar.",
              )}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 whitespace-nowrap">
                      {t(nomesDosAgrupamentos[agrupamento])}
                    </th>
                    {agrupamento === "ad_reference" && (
                      <th className="p-3 whitespace-nowrap">{t("Título recebido")}</th>
                    )}
                    {attribution.stages.map((stage) => (
                      <th key={stage.id} className="p-3 whitespace-nowrap">
                        {stage.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attribution.groups.map((group) => (
                    <tr key={group.key} className="border-t">
                      <td className="p-3 font-medium">
                        {t(rotuloDoGrupo(agrupamento, group.key) ?? group.key)}
                      </td>
                      {agrupamento === "ad_reference" && (
                        <td className="p-3">{group.ad_title ?? "—"}</td>
                      )}
                      {attribution.stages.map((stage) => (
                        <td key={stage.id} className="p-3">
                          {group.stage_counts[stage.id] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t(
              "“Referência de anúncio” mostra o identificador capturado no clique, como o CTWA CLID; ele não é o ID interno do anúncio na plataforma. O título só aparece quando veio no payload de origem. Dados sem UTM ou referência ficam agrupados separadamente.",
            )}
          </p>
        </>
      )}
      {dados && !dados.pipeline && <p>{t("Nenhum funil disponível nesta empresa.")}</p>}
    </div>
  );
}
