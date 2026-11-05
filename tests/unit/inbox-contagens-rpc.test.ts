import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  user: { id: "user-local" } as { id: string } | null,
  org: "11111111-1111-4111-8111-111111111111",
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) }, rpc: state.rpc,
}) }));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: async () => ({ id: "user-local" }) }));
vi.mock("@/lib/auth/require-role", () => ({ orgAtivaDaApi: async () => ({ ok: true, org: { orgId: state.org } }) }));
vi.mock("@/app/api/v1/conversations/_handler", () => ({ idsDeContatosPessoais: async () => ["personal-local"] }));
vi.mock("@/lib/channels/desativado", () => ({ idsDosCanaisDesativados: async () => ["disabled-local"] }));
vi.mock("@/lib/ai/agents/org-tem-automatico", () => ({ orgTemAutomatico: async () => false }));

import { GET } from "@/app/api/v1/conversations/counts/route";

const data = { fila: 2, unassigned: 2, automatico: 1, mine: 3, all: 8, closed: 1, archived: 1 };
beforeEach(() => {
  state.user = { id: "user-local" };
  state.rpc.mockReset().mockResolvedValue({ data, error: null });
});

describe("contagens do Inbox em uma RPC sob a sessão do caller", () => {
  it("faz uma agregação e devolve o contrato existente", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/conversations/counts"));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(data);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith("fn_inbox_counts", expect.objectContaining({
      p_organization_id: state.org,
      p_excluded_channels: ["disabled-local"], p_excluded_contacts: ["personal-local"],
      p_queue_commands: ["aguardando", "automatico"], p_terminal_statuses: ["closed", "archived"],
    }));
  });
  it("envia canal, não lidas e etiquetas normalizadas sem montar predicados SQL", async () => {
    await GET(new NextRequest("http://localhost/api/v1/conversations/counts?channel_session_id=canal&unread=true&tag=%20vip%20&tag=vip&tag=ouro%2C%7D&modo=ou"));
    expect(state.rpc).toHaveBeenCalledWith("fn_inbox_counts", expect.objectContaining({
      p_channel_session_id: "canal", p_unread: true, p_tags: ["vip", "ouro,}"], p_tag_mode: "ou",
    }));
  });
  it("não aceita organization_id de querystring como autorização", async () => {
    await GET(new NextRequest("http://localhost/api/v1/conversations/counts?organization_id=outra-org"));
    expect(state.rpc.mock.calls[0]?.[1].p_organization_id).toBe(state.org);
  });
  it("falha de banco permanece visível, sem converter falha em badges zero", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    const response = await GET(new NextRequest("http://localhost/api/v1/conversations/counts"));
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal_error");
  });
  it("anônimo não chega à RPC", async () => {
    state.user = null;
    const response = await GET(new NextRequest("http://localhost/api/v1/conversations/counts"));
    expect(response.status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
