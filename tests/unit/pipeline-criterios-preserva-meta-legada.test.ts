import { beforeEach, describe, expect, it, vi } from "vitest";
import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";

const estado = vi.hoisted(() => ({
  patches: [] as Record<string, unknown>[],
  usuario: { id: "user-1", support: null } as unknown,
  settings: {
    meta_conversion_rules: { "etapa-1": { event_name: "Schedule", requires_value: false } },
    meta_conversion_activated_at: "2026-09-14T12:00:00Z",
    fields: [{ key: "origem" }],
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => estado.usuario,
  resolveActiveOrg: async () => ({ orgId: "org-1" }),
}));
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({ podeAdministrarEmpresa: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: { settings: estado.settings, vocabulary: {}, organization_id: "org-1" },
          error: null,
        }),
        update: (patch: Record<string, unknown>) => (estado.patches.push(patch), q),
        then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      return q;
    },
  }),
}));

beforeEach(() => {
  estado.patches.length = 0;
  estado.usuario = { id: "user-1", support: null };
});

describe("critérios não reescrevem configuração legada", () => {
  it("preserva integralmente as regras, o marco e demais settings", async () => {
    const qualification_policy = {
      qualified_description: "Perfil alvo",
      disqualified_description: "Fora da região",
    };
    expect(await updatePipelineConfig("funil-1", { qualification_policy })).toEqual({ ok: true });
    expect(estado.patches).toEqual([
      { vocabulary: {}, settings: { ...estado.settings, qualification_policy } },
    ]);
  });
  it("recusa uma aba antiga tentando salvar mapa de eventos não consumido", async () => {
    const resultado = await updatePipelineConfig("funil-1", { meta_conversion_rules: {} } as never);
    expect(resultado).toMatchObject({ ok: false, error: "validation_failed" });
    expect(estado.patches).toHaveLength(0);
  });
  it("não grava critérios sem sessão", async () => {
    estado.usuario = null;
    expect(
      await updatePipelineConfig("funil-1", {
        qualification_policy: { qualified_description: "", disqualified_description: "" },
      }),
    ).toEqual({ ok: false, error: "unauthenticated" });
    expect(estado.patches).toHaveLength(0);
  });
});
