import { beforeEach, expect, it, vi } from "vitest";
const { client, redirect } = vi.hoisted(() => ({
  client: vi.fn(),
  redirect: vi.fn((p: string) => {
    throw new Error(`REDIRECT:${p}`);
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(), hashEmail: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  authRateLimited: async () => false,
  contaBloqueadaPorFalhas: async () => false,
  registrarFalhaDeLogin: vi.fn(),
  AUTH_LIMITS: { login: {} },
}));
import { signInWithPassword } from "./signInWithPassword";
const input = { email: "fixture@example.com", password: "fixture-password" };
function setup(invite: boolean, membership: unknown, error: unknown = null) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    maybeSingle: async () => ({ data: membership, error }),
  };
  for (const key of ["select", "eq", "is", "limit"] as const) q[key].mockReturnValue(q);
  client.mockResolvedValue({
    auth: {
      signInWithPassword: async () => ({
        data: { user: { id: "u1", user_metadata: invite ? { invite_token: "old-token" } : {} } },
        error: null,
      }),
      mfa: { listFactors: async () => ({ data: { totp: [] } }) },
    },
    from: vi.fn(() => q),
  });
  return q;
}
beforeEach(() => vi.clearAllMocks());
it("convite antigo com vínculo ativo entra direto", async () => {
  const q = setup(true, { organization_id: "org" });
  await expect(signInWithPassword(input)).rejects.toThrow("REDIRECT:/app");
  expect(q.eq).toHaveBeenCalledWith("user_id", "u1");
  expect(q.is).toHaveBeenCalledWith("revoked_at", null);
});
it("convite sem vínculo continua primeiro acesso", async () => {
  setup(true, null);
  await expect(signInWithPassword(input)).rejects.toThrow("REDIRECT:/auth/complete-invite");
});
it("erro de banco não é interpretado como ausência de vínculo", async () => {
  setup(true, null, { code: "offline" });
  await expect(signInWithPassword(input)).rejects.toThrow("REDIRECT:/503");
});
it("cadastro sem convite mantém entrada normal", async () => {
  setup(false, null);
  await expect(signInWithPassword(input)).rejects.toThrow("REDIRECT:/app");
});
it("next antigo não devolve membro ao convite", async () => {
  setup(true, { organization_id: "org" });
  await expect(signInWithPassword(input, "/auth/complete-invite")).rejects.toThrow("REDIRECT:/app");
});
