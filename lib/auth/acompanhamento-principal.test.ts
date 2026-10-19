import { describe, expect, it } from "vitest";
import type { AuthUser, Role } from "@/lib/auth/types";
import { podeAcompanharComoManager } from "./acompanhamento-principal";

function user(
  role: Role,
  organizationId = "principal",
  status = "active",
): Pick<AuthUser, "organizations" | "support"> {
  return {
    organizations: [
      { organization_id: organizationId, organization_name: "Teste", role, org_status: status },
    ],
  };
}

describe("entrada de acompanhamento por manager da Principal", () => {
  it("permite manager ativo na Principal", () => {
    expect(podeAcompanharComoManager(user("manager"), "principal", "principal")).toBe(true);
  });
  for (const role of ["viewer", "agent", "ai_operator", "admin"] as const) {
    it(`não promove ${role} por esta capacidade`, () => {
      expect(podeAcompanharComoManager(user(role), "principal", "principal")).toBe(false);
    });
  }
  it("manager de cliente não ganha acesso transversal", () => {
    expect(podeAcompanharComoManager(user("manager", "cliente"), "principal", "cliente")).toBe(
      false,
    );
  });
  it("exige estar na Principal para iniciar", () => {
    expect(podeAcompanharComoManager(user("manager"), "principal", "cliente")).toBe(false);
  });
  it("ausência da Principal e organização suspensa falham fechado", () => {
    expect(podeAcompanharComoManager(user("manager"), null, "principal")).toBe(false);
    expect(
      podeAcompanharComoManager(
        user("manager", "principal", "suspended"),
        "principal",
        "principal",
      ),
    ).toBe(false);
  });
  it("não aninha sessões de acompanhamento", () => {
    const actor = user("manager");
    actor.support = {
      id: "session",
      organization_id: "cliente",
      actor_user_id: "actor",
      auth_session_id: "auth",
      previous_organization_id: "principal",
      expires_at: "2099-01-01",
      name: "Cliente",
      locale: null,
      access_mode: "support_readonly",
      status: "active",
    };
    expect(podeAcompanharComoManager(actor, "principal", "principal")).toBe(false);
  });
  it("membership removida não autoriza", () => {
    expect(podeAcompanharComoManager({ organizations: [] }, "principal", "principal")).toBe(false);
  });
});
