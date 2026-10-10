import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test",
    NEXT_PUBLIC_APP_URL: "https://crm.example.com",
  },
}));
vi.mock("@/lib/auth/public-paths", () => ({ isPublicPath: () => false }));
const { proxy } = await import("@/proxy");

beforeEach(() => getUser.mockReset());
describe("proxy não confunde timeout com logout", () => {
  it.each(["/api/v1/conversations", "/app/inbox"])(
    "falha fechado sem redirecionar %s",
    async (path) => {
      getUser.mockResolvedValue({
        data: { user: null },
        error: { status: 504, name: "AuthRetryableFetchError" },
      });
      const response = await proxy(new NextRequest(`https://crm.example.com${path}`));
      expect(response.status).toBe(503);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("retry-after")).toBe("5");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBeNull();
    },
  );
  it("sessão inválida continua recusada com 401 na API", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401, name: "AuthApiError" },
    });
    const response = await proxy(new NextRequest("https://crm.example.com/api/v1/conversations"));
    expect(response.status).toBe(401);
  });
  it("visitante deslogado continua indo para login", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 400, name: "AuthSessionMissingError" },
    });
    const response = await proxy(new NextRequest("https://crm.example.com/app/inbox"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
  it("sessão válida segue para o guard da rota", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const response = await proxy(new NextRequest("https://crm.example.com/api/v1/conversations"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
