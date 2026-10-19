import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  user: vi.fn(),
  active: vi.fn(),
  primary: vi.fn(),
  authority: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: h.user, orgAtivaSemPortao: h.active }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: h.authority,
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: h.primary };
      return q;
    },
  }),
}));
import { managerDaPrincipal } from "./acompanhamento-principal-server";
beforeEach(() => {
  vi.clearAllMocks();
  h.user.mockResolvedValue({
    id: "actor",
    organizations: [{ organization_id: "principal", role: "manager", org_status: "active" }],
  });
  h.active.mockResolvedValue({ orgId: "principal", role: "manager" });
  h.primary.mockResolvedValue({ data: { organization_id: "principal" }, error: null });
  h.authority.mockResolvedValue({ data: true, error: null });
});
it("revalida a autoridade real com ator autenticado", async () => {
  expect(await managerDaPrincipal()).toMatchObject({
    principalId: "principal",
    user: { id: "actor" },
  });
  expect(h.authority).toHaveBeenCalledWith("fn_manager_principal", { p_actor: "actor" });
});
it("erro ao consultar a Principal não autoriza", async () => {
  h.primary.mockResolvedValue({ data: null, error: { message: "timeout" } });
  await expect(managerDaPrincipal()).rejects.toThrow("confirmar");
  expect(h.authority).not.toHaveBeenCalled();
});
it("membership revogada ou convite ainda não aceito é recusado pelo banco", async () => {
  h.authority.mockResolvedValue({ data: false, error: null });
  expect(await managerDaPrincipal()).toBeNull();
});
it("falha na revalidação não vira permissão", async () => {
  h.authority.mockResolvedValue({ data: null, error: { message: "timeout" } });
  await expect(managerDaPrincipal()).rejects.toThrow("autoridade");
});
it("manager em organização cliente é recusado", async () => {
  h.active.mockResolvedValue({ orgId: "cliente", role: "manager" });
  expect(await managerDaPrincipal()).toBeNull();
  expect(h.authority).not.toHaveBeenCalled();
});
