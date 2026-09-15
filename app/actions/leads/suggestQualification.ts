"use server";

import { generateText } from "ai";
import { z } from "zod";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { loadCredential } from "@/lib/ai/credentials";
import { buildModel, chaveDePlataforma } from "@/lib/ai/runtime/agent";
import { createAdminClient } from "@/lib/supabase/admin";

const respostaSchema = z.object({
  classificacao: z.enum(["qualificado", "desqualificado", "inconclusivo"]),
  confianca: z.number().min(0).max(100),
  justificativa: z.string().min(1).max(1200),
  criterios_encontrados: z.array(z.string().max(240)).max(12),
  informacoes_ausentes: z.array(z.string().max(240)).max(12),
});

export type SugestaoDeQualificacao = z.infer<typeof respostaSchema>;
export type ResultadoDaSugestao =
  { ok: true; sugestao: SugestaoDeQualificacao } | { ok: false; error: string };

function extrairJson(texto: string): unknown {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    return JSON.parse(texto.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

export async function suggestQualification(leadId: string): Promise<ResultadoDaSugestao> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("crm_leads")
    .select("id, title, description, contact_id, pipeline_id")
    .eq("id", leadId)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "lead_not_found" };

  const { data: pipeline } = await admin
    .from("crm_pipelines")
    .select("settings")
    .eq("id", lead.pipeline_id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const settings = (pipeline?.settings as Record<string, unknown> | null) ?? {};
  const policy =
    settings.qualification_policy && typeof settings.qualification_policy === "object"
      ? (settings.qualification_policy as Record<string, unknown>)
      : {};
  const qualified =
    typeof policy.qualified_description === "string" ? policy.qualified_description.trim() : "";
  const disqualified =
    typeof policy.disqualified_description === "string"
      ? policy.disqualified_description.trim()
      : "";
  if (!qualified && !disqualified) return { ok: false, error: "qualification_policy_missing" };

  const { data: messages } = lead.contact_id
    ? await admin
        .from("messages")
        .select("direction, body, sent_at")
        .eq("organization_id", org.orgId)
        .eq("contact_id", lead.contact_id)
        .not("body", "is", null)
        .order("sent_at", { ascending: false })
        .limit(30)
    : { data: [] };
  const transcript = (messages ?? [])
    .slice()
    .reverse()
    .map((message) => `${message.direction === "inbound" ? "Lead" : "Empresa"}: ${message.body}`)
    .join("\n")
    .slice(-12_000);

  const { data: agent } = await admin
    .from("ai_agents")
    .select("published_version_id")
    .eq("organization_id", org.orgId)
    .eq("is_default", true)
    .maybeSingle();
  if (!agent?.published_version_id) return { ok: false, error: "ai_not_configured" };
  const { data: version } = await admin
    .from("ai_agent_versions")
    .select("provider, model, credential_id")
    .eq("id", agent.published_version_id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!version) return { ok: false, error: "ai_not_configured" };

  let apiKey: string | null = null;
  if (version.credential_id) {
    try {
      apiKey = (await loadCredential(version.credential_id, org.orgId)).apiKey;
    } catch {
      return { ok: false, error: "ai_credential_unavailable" };
    }
  } else {
    apiKey = chaveDePlataforma(version.provider);
  }
  if (!apiKey) return { ok: false, error: "ai_credential_unavailable" };

  const result = await generateText({
    model: buildModel(version.provider, apiKey, version.model),
    system:
      "Voce auxilia uma pessoa a avaliar um lead. Nunca toma a decisao e nunca altera o CRM. " +
      "Responda somente JSON valido com classificacao, confianca, justificativa, " +
      "criterios_encontrados e informacoes_ausentes.",
    prompt:
      `CRITERIOS DE QUALIFICACAO:\n${qualified || "Nao informados"}\n\n` +
      `CRITERIOS DE DESQUALIFICACAO:\n${disqualified || "Nao informados"}\n\n` +
      `LEAD:\nTitulo: ${lead.title}\nDescricao: ${lead.description ?? ""}\n\n` +
      `CONVERSA:\n${transcript || "Sem mensagens disponiveis"}`,
    maxOutputTokens: 900,
  });
  const parsed = respostaSchema.safeParse(extrairJson(result.text));
  if (!parsed.success) return { ok: false, error: "ai_invalid_response" };
  return { ok: true, sugestao: parsed.data };
}

export const INTERNOS = { extrairJson, respostaSchema } as const;
