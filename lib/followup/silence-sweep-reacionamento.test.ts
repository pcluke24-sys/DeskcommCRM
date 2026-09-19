import { describe, expect, it, vi } from "vitest";
import { episodioDeSilencioJaAtendido } from "./silence-sweep";

const input = { organization_id: "org", contact_id: "contact", pointer_id: "flow" };
const at = "2026-09-18T10:00:00.000Z";
function banco(data: unknown, error: unknown = null) {
  const chain = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), limit: vi.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  chain.limit.mockResolvedValue({ data, error });
  return { chain, admin: { from: vi.fn().mockReturnValue(chain) } };
}
describe("reacionamento do mesmo episódio de silêncio", () => {
  it("não recomeça um fluxo já executado, mesmo terminal", async () => {
    const { admin, chain } = banco([{ id: "completed-enrollment" }]);
    await expect(episodioDeSilencioJaAtendido(admin as never, input, at)).resolves.toBe(true);
    expect(chain.eq.mock.calls).toEqual([
      ["organization_id", "org"],
      ["contact_id", "contact"],
      ["pointer_id", "flow"],
    ]);
    expect(chain.gte).toHaveBeenCalledWith("started_at", at);
  });
  it("permite execução depois de uma resposta nova sem execução posterior", async () => {
    const { admin } = banco([]);
    await expect(episodioDeSilencioJaAtendido(admin as never, input, at)).resolves.toBe(false);
  });
  it("falha fechado quando não consegue consultar o histórico", async () => {
    const { admin } = banco(null, { message: "history_unavailable" });
    await expect(episodioDeSilencioJaAtendido(admin as never, input, at)).rejects.toThrow(
      "history_unavailable",
    );
  });
});
