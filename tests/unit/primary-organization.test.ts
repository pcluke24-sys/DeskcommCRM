import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const { guard, rpc } = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: guard }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/impersonate/support", () => ({
  requireSupportWrite: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
import { PUT } from "@/app/api/v1/admin/tenants/[id]/primary/route";
const id = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown) =>
  new Request("https://example.test", { method: "PUT", body: JSON.stringify(body) }) as NextRequest;
beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ user: { id: actor }, platformAdmin: { scope: "full" } });
  rpc.mockResolvedValue({ data: { primary_organization_id: id }, error: null });
});
it("confirma seleção e usa ator autenticado, nunca ator do corpo", async () => {
  expect(
    (await PUT(req({ confirmation: true, p_actor: id }), { params: Promise.resolve({ id }) }))
      .status,
  ).toBe(200);
  expect(rpc).toHaveBeenCalledWith(
    "fn_set_primary_organization",
    expect.objectContaining({ p_actor: actor, p_org: id }),
  );
});
it("exige confirmação explícita", async () => {
  expect((await PUT(req({}), { params: Promise.resolve({ id }) })).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("recusa suporte somente leitura", async () => {
  guard.mockResolvedValue({ user: { id: actor }, platformAdmin: { scope: "support_readonly" } });
  expect((await PUT(req({ confirmation: true }), { params: Promise.resolve({ id }) })).status).toBe(
    403,
  );
  expect(rpc).not.toHaveBeenCalled();
});
it("recusa administrador que não é dono via guarda do banco", async () => {
  rpc.mockResolvedValue({ error: { code: "42501", message: "Somente dono" } });
  expect((await PUT(req({ confirmation: true }), { params: Promise.resolve({ id }) })).status).toBe(
    403,
  );
});
it("informa conflito para principal inativa", async () => {
  rpc.mockResolvedValue({ error: { code: "P0001", message: "Inativa" } });
  expect((await PUT(req({ confirmation: true }), { params: Promise.resolve({ id }) })).status).toBe(
    409,
  );
});
