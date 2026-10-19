import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ insert: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: "local-test-value" } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert: h.insert }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) } }) }));
vi.mock("@/lib/impersonate/support", () => ({ readSupportContext: h.context }));
import { audit } from "./index";
beforeEach(() => {
  vi.clearAllMocks();
  h.insert.mockResolvedValue({ error: null });
  h.context.mockResolvedValue({ id: "session", organization_id: "cliente", access_mode: "support_readonly", auth_session_id: "auth", actor_is_platform_admin: false });
});
it("audita manager sem afirmar que ele é administrador da plataforma", async () => {
  await audit({ action: "support.manager_started", actorUserId: "actor", organizationId: "cliente", actingAsPlatformAdmin: false });
  expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({
    actor_user_id: "actor", organization_id: "cliente", acting_as_platform_admin: false,
    metadata: expect.objectContaining({ support_session_id: "session", support_actor_is_platform_admin: false }),
  }));
});
it("preserva autoria administrativa das sessões existentes", async () => {
  h.context.mockResolvedValue({ id: "session", organization_id: "cliente", access_mode: "support_readonly", auth_session_id: "auth", actor_is_platform_admin: true });
  await audit({ action: "platform_admin.impersonate_started", actorUserId: "actor", organizationId: "cliente" });
  expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({ acting_as_platform_admin: true }));
});
