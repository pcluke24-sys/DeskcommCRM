import { beforeEach, describe, expect, it, vi } from "vitest";
const { guard, rpc } = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: guard }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/impersonate/support", () => ({
  requireSupportWrite: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { DELETE } from "@/app/api/v1/admin/tenants/[id]/delete/route";
import { deletionPathAllowed } from "@/lib/admin/tenant-deletion-storage";
import type { NextRequest } from "next/server";
const id = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown) =>
  new Request("https://example.test", {
    method: "DELETE",
    body: JSON.stringify(body),
  }) as NextRequest;
beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ user: { id: actor }, platformAdmin: { scope: "full" } });
  rpc.mockResolvedValue({ data: { id }, error: null });
});
describe("exclusão administrativa de tenant", () => {
  it("recusa usuário sem administração de plataforma", async () => {
    guard.mockRejectedValue(new Error("forbidden"));
    expect((await DELETE(req({}), { params: Promise.resolve({ id }) })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("recusa suporte somente leitura", async () => {
    guard.mockResolvedValue({ user: { id: actor }, platformAdmin: { scope: "support_readonly" } });
    expect((await DELETE(req({}), { params: Promise.resolve({ id }) })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("exige confirmação e motivo", async () => {
    expect(
      (
        await DELETE(req({ confirmation: "org", reason: "curto" }), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("usa exclusivamente ator da sessão e tenant do path", async () => {
    const body = { confirmation: "org", reason: "Encerramento do contrato", p_actor: id };
    expect((await DELETE(req(body), { params: Promise.resolve({ id }) })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "fn_delete_suspended_tenant",
      expect.objectContaining({ p_actor: actor, p_org: id }),
    );
  });
  it.each([
    ["42501", 403],
    ["P0001", 409],
    ["P0002", 404],
    ["22023", 400],
  ])("propaga bloqueio do banco %s", async (code, status) => {
    rpc.mockResolvedValue({ error: { code, message: "Bloqueado" } });
    expect(
      (
        await DELETE(req({ confirmation: "org", reason: "Encerramento do contrato" }), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(status);
  });
  it("nunca aceita arquivos de outro tenant, plataforma ou travessia", () => {
    expect(deletionPathAllowed(id, id + "/avatars/a.jpg")).toBe(true);
    for (const path of [
      actor + "/a.jpg",
      "platform/a.jpg",
      id + "/../a.jpg",
      id + "/x/../../a.jpg",
      id + "\\a.jpg",
    ]) {
      expect(deletionPathAllowed(id, path)).toBe(false);
    }
  });
});
