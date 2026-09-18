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
import type { SupabaseClient } from "@supabase/supabase-js";

import { ehPlataformaConhecida } from "@/lib/plataformas-de-anuncio/registry";
import type {
  IdentidadeParaCorrespondencia,
  PlataformaDeAnuncio,
} from "@/lib/plataformas-de-anuncio/types";

export interface AtribuicaoParaEnvio {
  plataforma: PlataformaDeAnuncio;
  /** `ad_source_id` — o `ctwa_clid`, quando o clique que abriu a conversa existe. */
  cliqueDeOrigem: string | null;
  telefone: string;
  identidade: IdentidadeParaCorrespondencia;
}

export type LeituraDeAtribuicao =
  | { temAtribuicao: true; atribuicao: AtribuicaoParaEnvio }
  | { temAtribuicao: false; motivo: "sem_contato" | "sem_telefone" | "plataforma_desconhecida" };

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

  const { data } = await admin
    .from("contacts")
    .select("phone_number, email, name, is_anonymized, source_metadata")
    .eq("id", contactId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return { temAtribuicao: false, motivo: "sem_contato" };

  const linha = data as {
    phone_number: string | null;
    email?: string | null;
    name?: string | null;
    is_anonymized?: boolean;
    source_metadata: unknown;
  };
  if (linha.is_anonymized) return { temAtribuicao: false, motivo: "sem_contato" };
  const telefone = linha.phone_number ? linha.phone_number.replace(/\D/g, "") : "";
  if (!telefone) return { temAtribuicao: false, motivo: "sem_telefone" };

  const meta =
    linha.source_metadata && typeof linha.source_metadata === "object"
      ? (linha.source_metadata as Record<string, unknown>)
      : {};

  const clique = typeof meta.ad_source_id === "string" ? meta.ad_source_id.trim() : "";
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
    // IP e navegador so entram quando a origem web os registrou no contato.
    ipDoContato: texto(web.client_ip_address),
    agenteDoNavegadorDoContato: texto(web.client_user_agent),
  };
  // Se há clique, preservamos a plataforma que o originou. Sem clique, trata-se
  // de conversão offline/CRM: o telefone identifica a pessoa e a conexão Meta
  // da própria organização define o destino, sem inventar atribuição ao anúncio.
  if (clique && !ehPlataformaConhecida(meta.ad_platform)) {
    return { temAtribuicao: false, motivo: "plataforma_desconhecida" };
  }

  return {
    temAtribuicao: true,
    atribuicao: {
      plataforma: clique ? (meta.ad_platform as PlataformaDeAnuncio) : "meta_ads",
      cliqueDeOrigem: clique || null,
      // Só dígitos: a plataforma exige E.164 sem `+` nem separadores ANTES do
      // hash. Normalizar depois do hash seria tarde — o hash já estaria errado.
      telefone,
      identidade,
    },
  };
}
