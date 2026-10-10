/**
 * A FAIXA DE CONEXÃO CAÍDA VEM DO SEAM — provado EXECUTANDO o layout.
 *
 * ─── Por que este arquivo existe ────────────────────────────────────────────
 *
 * A propriedade protegida é uma só: a faixa que o usuário vê e o aviso da
 * Central leem a MESMA lista de estados. Quem garante isso é a tela chamar
 * `listarConexoesCaidas` (`lib/channels/health.ts`) e entregar O RETORNO DELA ao
 * `<ConexaoCaidaBanner>`. Duas listas divergem com o tempo, e uma faixa que não
 * aparece para um estado que a Central considera grave ensina que a tela está
 * tranquila quando não está.
 *
 * ─── O defeito que esta cerca substitui ─────────────────────────────────────
 *
 * Até 2026-09-14 essa propriedade era vigiada por
 * `tests/unit/channel-health-aviso.test.ts` com
 * `expect(layout).toMatch(/await listarConexoesCaidas\(/)` — uma asserção sobre
 * o TEXTO-FONTE de `app/app/layout.tsx`. Uma asserção assim não vigia
 * comportamento: ela cimenta uma implementação. O PR #762 (@maugarciasa) moveu a
 * chamada para dentro de um `Promise.all` — o mesmo seam, o mesmo retorno, a
 * mesma faixa — e a guarda ficou VERMELHA sem que nada tivesse quebrado. A
 * recíproca é pior: a regex fica VERDE com a chamada dentro de um `if (false)`,
 * ou com o retorno descartado antes de chegar ao banner.
 *
 * Este arquivo invoca o Server Component `AppLayout` de verdade e mede o que
 * importa: que o seam foi chamado com o cliente admin e a organização ativa, e
 * que o array que ele devolveu é EXATAMENTE o que a faixa recebeu. Sobrevive a
 * `Promise.all`, a reordenação e a qualquer reescrita que preserve o efeito.
 */
import type { ReactElement, ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const adminClient = { marcador: "admin-client-do-teste" };
const conexoesDoSeam = [
  { id: "sess-1", apelido: "Vendas", status: "FAILED" },
  { id: "sess-2", apelido: "Suporte", status: "SCAN_QR_CODE" },
];
const listarConexoesCaidas = vi.fn(async () => conexoesDoSeam);
const acesso = vi.hoisted(() => ({
  org: { orgId: "org-1", role: "admin", interface_settings: null } as { orgId: string; role: string; interface_settings: null } | null,
  onboardedAt: "2026-01-01" as string | null,
  revogado: false,
}));

vi.mock("@/lib/channels/health", () => ({
  listarConexoesCaidas: (...args: unknown[]) => listarConexoesCaidas(...(args as [])),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminClient }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({
    id: "user-1",
    idioma: "pt-BR",
    is_platform_admin: false,
    support: null,
    organizations: [],
  }),
  resolveActiveOrg: async () => acesso.org,
  isMfaEnrolled: async () => true,
  requiresMfa: async () => false,
}));
vi.mock("@/lib/auth/vinculo-revogado", () => ({ acessoFoiRevogado: async () => acesso.revogado }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect inesperado para ${destino}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/branding/instalacao", () => ({ marcaDaInstalacao: async () => ({}) }));
vi.mock("@/lib/branding/organizacao", () => ({
  resolverMarcaDaOrganizacao: () => ({
    name: "Deskcomm",
    logoUrl: null,
    cor: "#000000",
    origens: { nome: "instalacao", logoUrl: "instalacao", cor: "instalacao" },
  }),
}));

/**
 * O `admin.from("organizations")…maybeSingle()` do layout, encurtado a uma
 * organização já onboardada e ativa — qualquer outro estado dispara `redirect`,
 * e o que está sob medição aqui é o caminho normal.
 */
Object.assign(adminClient, {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { onboarded_at: acesso.onboardedAt, status: "active", settings: null } }) }),
    }),
  }),
});

function achar(no: ReactNode, alvo: unknown): ReactElement | null {
  if (!no || typeof no !== "object") return null;
  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = achar(filho as ReactNode, alvo);
      if (achado) return achado;
    }
    return null;
  }
  const elemento = no as ReactElement<{ children?: ReactNode }>;
  if (elemento.type === alvo) return elemento;
  return achar(elemento.props?.children, alvo);
}

// Carregar a árvore uma vez, fora da medição dos casos de redirecionamento.
beforeAll(async () => {
  await import("@/app/app/layout");
}, 120_000);

beforeEach(() => {
  listarConexoesCaidas.mockClear();
  acesso.org = { orgId: "org-1", role: "admin", interface_settings: null };
  acesso.onboardedAt = "2026-01-01";
  acesso.revogado = false;
});

describe("a faixa de conexão caída", () => {
  it.each(["agent", "viewer"])("não exige onboarding de %s", async (role) => {
    acesso.org!.role = role;
    acesso.onboardedAt = null;
    const { default: AppLayout } = await import("@/app/app/layout");
    await expect(AppLayout({ children: null })).resolves.toBeTruthy();
  });
  it.each(["admin", "manager"])("exige onboarding de %s", async (role) => {
    acesso.org!.role = role;
    acesso.onboardedAt = null;
    const { default: AppLayout } = await import("@/app/app/layout");
    await expect(AppLayout({ children: null })).rejects.toThrow("/onboarding");
  });
  it("encaminha quem nunca teve organização para criação", async () => {
    acesso.org = null;
    const { default: AppLayout } = await import("@/app/app/layout");
    await expect(AppLayout({ children: null })).rejects.toThrow("/get-started");
  });
  it("não oferece criar organização a quem perdeu acesso", async () => {
    acesso.org = null;
    acesso.revogado = true;
    const { default: AppLayout } = await import("@/app/app/layout");
    await expect(AppLayout({ children: null })).rejects.toThrow("/acesso-revogado");
  });
  it("recebe EXATAMENTE o que o seam devolveu — não uma lista montada na tela", async () => {
    const { ConexaoCaidaBanner } = await import("@/components/app/ConexaoCaidaBanner");
    const { default: AppLayout } = await import("@/app/app/layout");

    const arvore = (await AppLayout({ children: null })) as ReactElement;

    const faixa = achar(arvore, ConexaoCaidaBanner) as ReactElement<{
      caidas: unknown;
    }> | null;
    expect(faixa, "o layout não renderizou a faixa de conexão caída").not.toBeNull();
    // Identidade, não igualdade estrutural: um `toEqual` passaria com a tela
    // remontando a lista à mão desde que os campos coincidissem HOJE — que é
    // exatamente a divergência que esta cerca existe para impedir.
    expect(faixa!.props.caidas).toBe(conexoesDoSeam);
  });

  it("pergunta ao seam com o cliente admin e a organização ativa", async () => {
    const { default: AppLayout } = await import("@/app/app/layout");
    await AppLayout({ children: null });

    expect(listarConexoesCaidas).toHaveBeenCalledTimes(1);
    // A organização vem do seam de autenticação (cookie validado), nunca do
    // corpo da requisição — e o cliente é o admin, porque a consulta cruza RLS.
    expect(listarConexoesCaidas).toHaveBeenCalledWith(adminClient, "org-1");
  });
});
