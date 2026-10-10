import { describe, expect, it, vi } from "vitest";

import { markConversationUnreadHandler } from "@/app/api/v1/conversations/_handler";

function banco(conversa: Record<string, unknown> | null) {
  const chamadas: Array<[string, unknown]> = [];
  const builder = {
    update: vi.fn((value: unknown) => {
      chamadas.push(["update", value]);
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      chamadas.push([column, value]);
      return builder;
    }),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: conversa, error: null })),
  };
  return {
    client: { from: vi.fn(() => builder) },
    chamadas,
  };
}

const ctx = {
  organization_id: "org-certa",
  actor: { type: "user" as const, id: "usuario" },
  requestId: "req",
    idioma: "pt-BR" as const,
};

describe("marcar conversa como não lida", () => {
  it("grava uma pendência visual e mantém o filtro da organização", async () => {
    const db = banco({ id: "conv", organization_id: "org-certa" });

    await markConversationUnreadHandler(db.client as never, ctx, "conv");

    expect(db.chamadas).toContainEqual(["update", { unread_count_for_assignee: 1 }]);
    expect(db.chamadas).toContainEqual(["id", "conv"]);
    expect(db.chamadas).toContainEqual(["organization_id", "org-certa"]);
  });

  it("não revela conversa ausente ou de outra organização", async () => {
    const db = banco(null);
    await expect(
      markConversationUnreadHandler(db.client as never, ctx, "conv-de-outra-org"),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });
});
