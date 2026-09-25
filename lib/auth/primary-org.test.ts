import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activeOrg: "org-principal",
  primaryOrg: "org-principal" as string | null,
  primaryError: null as { message: string } | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "active_org" ? { value: state.activeOrg } : undefined),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      expect(table).toBe("platform_primary_organization");
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: state.primaryOrg ? { organization_id: state.primaryOrg } : null,
          error: state.primaryError,
        }),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { isPlatformOwnerInPrimaryOrg } from "./server";
import type { AuthUser } from "./types";

function owner(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-owner",
    email: "owner@example.com",
    full_name: "Owner",
    avatar_url: null,
    is_platform_admin: true,
    idioma: "pt-BR",
    organizations: [
      {
        organization_id: "org-principal",
        organization_name: "Principal",
        role: "admin",
      },
      { organization_id: "org-cliente", organization_name: "Cliente", role: "admin" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  state.activeOrg = "org-principal";
  state.primaryOrg = "org-principal";
  state.primaryError = null;
});

describe("isPlatformOwnerInPrimaryOrg", () => {
  it("libera o dono somente dentro da organização marcada como principal", async () => {
    expect(await isPlatformOwnerInPrimaryOrg(owner())).toBe(true);
  });

  it("bloqueia o mesmo dono enquanto ele navega numa organização cliente", async () => {
    state.activeOrg = "org-cliente";
    expect(await isPlatformOwnerInPrimaryOrg(owner())).toBe(false);
  });

  it("falha fechado quando a organização principal não está configurada", async () => {
    state.primaryOrg = null;
    expect(await isPlatformOwnerInPrimaryOrg(owner())).toBe(false);
  });

  it("não libera suporte temporário nem usuário comum", async () => {
    expect(await isPlatformOwnerInPrimaryOrg(owner({ support: { id: "support" } as never }))).toBe(
      false,
    );
    expect(await isPlatformOwnerInPrimaryOrg(owner({ is_platform_admin: false }))).toBe(false);
  });
});
