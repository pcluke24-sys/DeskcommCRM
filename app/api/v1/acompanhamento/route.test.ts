import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  actor: vi.fn(),
  rpc: vi.fn(),
  mfa: vi.fn(),
  audit: vi.fn(),
  blocked: vi.fn(),
  cookie: vi.fn(),
  role: vi.fn(),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.role }));
vi.mock("@/lib/auth/acompanhamento-principal-server", () => ({ managerDaPrincipal: h.actor }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: h.mfa }));
vi.mock("@/lib/impersonate/support", () => ({
  authenticatedSessionId: async () => "auth-session",
  requireSupportWrite: h.blocked,
}));
vi.mock("@/lib/impersonate/cookie", () => ({
  IMPERSONATE_COOKIE_NAME: "support",
  IMPERSONATE_TTL_SECONDS: 3600,
  isImpersonateSecretReady: () => true,
  signImpersonateCookie: () => "signed",
}));
vi.mock("@/lib/supabase/cookie-secure", () => ({ cookieSecure: () => false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: h.cookie }) }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: h.rpc,
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        order: () => q,
        limit: async () => ({ data: [{ id: "client", display_name: "Cliente" }], error: null }),
        single: async () => ({ data: { expires_at: "2099-01-01T00:00:00Z" }, error: null }),
      };
      return q;
    },
  }),
}));
import { GET, POST } from "./route";
const target = "bbbbbbbb-0000-4000-8000-000000000001";
const request = (extra = {}) =>
  new Request("http://localhost/api/v1/acompanhamento", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organization_id: target, ...extra }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.role.mockResolvedValue({ ok: true });
  h.actor.mockResolvedValue({ user: { id: "manager" }, principalId: "principal" });
  h.mfa.mockResolvedValue(false);
  h.blocked.mockResolvedValue(null);
  h.rpc.mockResolvedValue({ data: "support-session", error: null });
});

describe("API de acompanhamento somente leitura", () => {
  it("preserva recusa do guard canônico antes da autorização transversal", async () => {
    h.role.mockImplementation(async () => ({ ok: false, response: new Response(null, { status: 403 }) }));
    expect((await GET()).status).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(h.actor).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("manager autorizado lista apenas projeção de clientes", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([{ id: "client", display_name: "Cliente" }]);
  });
  it("manager de cliente ou sessão sem autoridade recebe 403", async () => {
    h.actor.mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("falha ao resolver Principal não libera acesso", async () => {
    h.actor.mockRejectedValue(new Error("db unavailable"));
    expect((await GET()).status).toBe(503);
    expect((await POST(request())).status).toBe(503);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("não aceita modo full nem ator forjado no body", async () => {
    expect((await POST(request({ access_mode: "full" }))).status).toBe(422);
    expect((await POST(request({ actor_user_id: "owner" }))).status).toBe(422);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("inicia somente leitura com ator e Principal do servidor", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith(
      "fn_start_support",
      expect.objectContaining({
        p_actor: "manager",
        p_previous: "principal",
        p_mode: "support_readonly",
        p_org: target,
      }),
    );
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "support.manager_started", actingAsPlatformAdmin: false }),
    );
  });
  it("revogação entre autorização e RPC impede início", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "support_authority_required" } });
    expect((await POST(request())).status).toBe(409);
    expect(h.cookie).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });
  it("MFA em dívida bloqueia leitura e início", async () => {
    h.mfa.mockResolvedValue(true);
    expect((await GET()).status).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
