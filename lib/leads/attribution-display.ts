/** Atributos de origem que o operador precisa enxergar no lead. */
export interface AtributoDeOrigemVisivel {
  rotulo: string;
  valor: string;
}

const ROTULO_DA_FONTE: Record<string, string> = {
  meta_ads: "Anúncio da Meta",
  google_ads: "Anúncio do Google",
  webhook: "Formulário ou integração",
  whatsapp: "WhatsApp",
  manual: "Cadastro manual",
};

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Origem principal + parâmetros de campanha, em ordem estável para a UI. */
export function atributosDeOrigem(
  source: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): AtributoDeOrigemVisivel[] {
  const meta = metadata ?? {};
  const atributos: AtributoDeOrigemVisivel[] = [];
  const fonte = texto(meta.utm_source) ?? ROTULO_DA_FONTE[source ?? ""] ?? texto(source);
  if (fonte) atributos.push({ rotulo: "Origem", valor: fonte });

  const campos: Array<[string, string]> = [
    ["utm_medium", "Mídia"],
    ["utm_campaign", "Campanha"],
    ["utm_content", "Conteúdo"],
    ["utm_term", "Termo"],
    ["ad_source_id", "CTWA CLID"],
  ];
  for (const [chave, rotulo] of campos) {
    const valor = texto(meta[chave]);
    if (valor) atributos.push({ rotulo, valor });
  }
  return atributos;
}
