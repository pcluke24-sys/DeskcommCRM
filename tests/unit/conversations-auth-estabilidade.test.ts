import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AuthIndisponivelError } from "@/lib/auth/indisponibilidade";

const { loadAuthUser, orgAtivaDaApi, getUser, listar } = vi.hoisted(() => ({
  loadAuthUser: vi.fn(),
  orgAtivaDaApi: vi.fn(),
  getUser: vi.fn(),
  listar: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser }));
vi.mock("@/lib/auth/require-role", () => ({ orgAtivaDaApi }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/app/api/v1/conversations/_handler", () => ({ listConversationsHandler: listar }));
vi.mock("@/lib/users/com-nome-do-atendente", () => ({
  comNomeDoAtendente: async (x: unknown) => x,
}));
const { GET } = await import("@/app/api/v1/conversations/route");

beforeEach(() => {
  vi.clearAllMocks();
  loadAuthUser.mockResolvedValue({ id: "actor-1", idioma: "pt-BR" });
  orgAtivaDaApi.mockResolvedValue({ ok: true, org: { orgId: "org-1" } });
  listar.mockResolvedValue({ conversations: [], cursor: null, has_more: false });
});
describe("listagem Inbox usa uma validação de identidade no handler", () => {
  it("usa ator e organização do guard, sem repetir getUser", async () => {
    const res = await GET(new NextRequest("https://crm.example.com/api/v1/conversations"));
    expect(res.status).toBe(200);
    expect(loadAuthUser).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
    expect(listar.mock.calls[0]?.[1]).toMatchObject({
      organization_id: "org-1",
      actor: { type: "user", id: "actor-1" },
    });
  });
  it("não consulta conversas se a identidade não foi validada", async () => {
    loadAuthUser.mockResolvedValue(null);
    expect(
      (await GET(new NextRequest("https://crm.example.com/api/v1/conversations"))).status,
    ).toBe(401);
    expect(listar).not.toHaveBeenCalled();
  });
  it("timeout retorna 503 e não 401, sem liberar consulta", async () => {
    loadAuthUser.mockRejectedValue(new AuthIndisponivelError());
    const res = await GET(new NextRequest("https://crm.example.com/api/v1/conversations"));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("auth_unavailable");
    expect(res.headers.get("retry-after")).toBe("5");
    expect(listar).not.toHaveBeenCalled();
  });
});
