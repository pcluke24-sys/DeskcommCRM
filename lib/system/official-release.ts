import { logger } from "@/lib/logger";

const REPOSITORIO_OFICIAL_PADRAO = "melgarafael/DeskcommCRM";
const TEMPO_DE_CACHE_MS = 15 * 60 * 1000;

let cache: { versao: string | null; expiraEm: number } | null = null;

function partes(versao: string): [number, number, number] | null {
  const match = versao.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Compara somente releases semver publicadas; SHA e branch nunca viram alerta oficial. */
export function versaoPublicadaMaisNova(candidata: string, instalada: string): boolean {
  const proxima = partes(candidata);
  const atual = partes(instalada);
  if (!proxima || !atual) return false;
  if (proxima[0] !== atual[0]) return proxima[0] > atual[0];
  if (proxima[1] !== atual[1]) return proxima[1] > atual[1];
  if (proxima[2] !== atual[2]) return proxima[2] > atual[2];
  return false;
}

/**
 * Consulta informativa da release oficial. Ela NUNCA define o alvo do update:
 * instalar continua preso à release publicada pelo repositório da instalação.
 */
export async function versaoOficialMaisRecente(): Promise<string | null> {
  const agora = Date.now();
  if (cache && cache.expiraEm > agora) return cache.versao;

  const repositorio = process.env.UPSTREAM_RELEASE_REPOSITORY?.trim() || REPOSITORIO_OFICIAL_PADRAO;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`https://api.github.com/repos/${repositorio}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
      next: { revalidate: 900 },
    });
    if (!response.ok) throw new Error(`GitHub respondeu ${response.status}`);
    const body = (await response.json()) as { tag_name?: unknown };
    const versao = typeof body.tag_name === "string" ? body.tag_name.replace(/^v/i, "") : null;
    cache = { versao, expiraEm: agora + TEMPO_DE_CACHE_MS };
    return versao;
  } catch (error) {
    logger.warn("[system/version] não consegui consultar a release oficial", {
      error: error instanceof Error ? error.message : "erro desconhecido",
    });
    cache = { versao: null, expiraEm: agora + 60_000 };
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function limparCacheDeVersaoOficialParaTeste(): void {
  cache = null;
}
