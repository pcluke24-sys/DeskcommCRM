/**
 * Ler de qual anúncio o contato veio — o outro lado da 0164.
 *
 * A 0164 (`lib/leads/atribuicao-de-anuncio.ts`) ESTAMPA a atribuição no contato,
 * com guarda de primeiro toque e merge atômico no banco. Este arquivo é o
 * primeiro consumidor dela: até aqui o dado era só de escrita.
 *
 * Não reaproveito o tipo `AtribuicaoDeAnuncio` daquele módulo de propósito. Ele
 * é o formato de ESCRITA e carrega `bruto` — o payload inteiro de onde o dado
 * saiu, que existe para ser prova e pode ter qualquer tamanho. Quem vai enviar
 * precisa de três campos, e arrastar o payload cru para dentro do caminho de
 * envio só criaria chance de ele vazar para um log ou para o fio.
 */
import {
  lerIdentificadoresGoogle,
  type IdentificadoresGoogle,
} from "@/lib/plataformas-de-anuncio/google/identificadores";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ehPlataformaConhecida } from "@/lib/plataformas-de-anuncio/registry";
import type {
  IdentidadeParaCorrespondencia,
  PlataformaDeAnuncio,
} from "@/lib/plataformas-de-anuncio/types";

export interface AtribuicaoParaEnvio {
  plataforma: PlataformaDeAnuncio;
  /** `ad_source_id` — o `ctwa_clid`, o clique que abriu a conversa. */
  cliqueDeOrigem: string;
  telefone: string | null;
  identidade: IdentidadeParaCorrespondencia;
  identificadoresGoogle?: IdentificadoresGoogle;
}

export type LeituraDeAtribuicao =
  | { temAtribuicao: true; atribuicao: AtribuicaoParaEnvio }
  | { temAtribuicao: false; motivo: "sem_contato" | "sem_atribuicao" | "plataforma_desconhecida" };

/**
 * ⚠️ FILTRA `organization_id` MESMO TENDO O ID DO CONTATO. O chamador é um
 * worker com client service-role, que bypassa RLS: um `contact_id` de outra
 * organização (por dado corrompido ou por bug de quem monta o evento) leria o
 * telefone e o clique de um terceiro e reportaria a venda na conta de anúncios
 * errada. O mesmo padrão de `encerraDemanda`, e pelo mesmo motivo.
 */
export async function lerAtribuicao(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string | null,
): Promise<LeituraDeAtribuicao> {
  if (!contactId) return { temAtribuicao: false, motivo: "sem_contato" };

  const { data, error } = await admin
    .from("contacts")
    .select("phone_number, email, name, is_anonymized, source_metadata")
    .eq("id", contactId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível ler a origem do contato.");
  if (!data) return { temAtribuicao: false, motivo: "sem_contato" };

  const linha = data as {
    phone_number: string | null;
    email?: string | null;
    name?: string | null;
    is_anonymized?: boolean;
    source_metadata: unknown;
  };
  if (linha.is_anonymized) return { temAtribuicao: false, motivo: "sem_contato" };
  const meta =
    linha.source_metadata && typeof linha.source_metadata === "object"
      ? (linha.source_metadata as Record<string, unknown>)
      : {};

  const clique = typeof meta.ad_source_id === "string" ? meta.ad_source_id.trim() : "";
  const telefone = linha.phone_number ? linha.phone_number.replace(/\D/g, "") || null : null;
  const web =
    meta.web_tracking && typeof meta.web_tracking === "object"
      ? (meta.web_tracking as Record<string, unknown>)
      : {};
  const texto = (valor: unknown): string | undefined =>
    typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
  const partes = linha.name?.trim().split(/\s+/) ?? [];
  const identidade: IdentidadeParaCorrespondencia = {
    identificadorExterno: `${organizationId}:${contactId}`,
    email: texto(linha.email),
    nome: partes[0] || undefined,
    sobrenome: partes.length > 1 ? partes.slice(1).join(" ") : undefined,
    identificadorDeCliqueWeb: texto(web.fbc ?? meta.fbc),
    identificadorDoNavegador: texto(web.fbp ?? meta.fbp),
    ipDoContato: texto(web.client_ip_address),
    agenteDoNavegadorDoContato: texto(web.client_user_agent),
  };

  // Com clique, a plataforma precisa ser conhecida. Sem clique, é conversão
  // offline/CRM e a conexão Meta da própria organização define o destino.
  if (clique && !ehPlataformaConhecida(meta.ad_platform)) {
    return { temAtribuicao: false, motivo: "plataforma_desconhecida" };
  }

  const bruto =
    meta.ad_raw && typeof meta.ad_raw === "object" ? (meta.ad_raw as Record<string, unknown>) : {};
  const ids =
    meta.ad_platform === "google_ads"
      ? lerIdentificadoresGoogle(bruto.click_identifiers ?? { gclid: clique })
      : null;
  if (meta.ad_platform === "google_ads" && !ids)
    return { temAtribuicao: false, motivo: "sem_atribuicao" };

  return {
    temAtribuicao: true,
    atribuicao: {
      plataforma: ehPlataformaConhecida(meta.ad_platform) ? meta.ad_platform : "meta_ads",
      ...(ids ? { identificadoresGoogle: ids } : {}),
      cliqueDeOrigem: clique,
      // Só dígitos: a plataforma exige E.164 sem `+` nem separadores ANTES do
      // hash. Normalizar depois do hash seria tarde — o hash já estaria errado.
      telefone,
      identidade,
    },
  };
}

/**
 * Os `utm_source` que significam "anúncio da Meta". Lista fechada e explícita:
 * quem monta o link escolhe o texto, e casar por "contém face" pegaria
 * `facebook_organico` e mandaria venda orgânica para a conta de anúncios.
 */
export const UTM_SOURCES_DA_META: ReadonlySet<string> = new Set([
  "meta",
  "facebook",
  "fb",
  "instagram",
  "ig",
]);
