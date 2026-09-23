import { describe, expect, it } from "vitest";
import { moduloIaEstaLiberado, ModuloIaBloqueadoError } from "./modulo";
import { searchable, sidebarGroups } from "@/lib/navigation/registry";
import { passosVisiveis } from "@/lib/onboarding/passos";

describe("módulo comercial por organização", () => {
  it("não oferece treinamento nem teste de IA no onboarding sem contratação", () => {
    const steps = passosVisiveis({ lojaLigada: false, iaLiberada: false }).map((p) => p.segmento);
    expect(steps).not.toContain("setup-ai");
    expect(steps).not.toContain("testar");
    expect(steps).toContain("funil");
    expect(steps).toContain("invite-team");
  });
  it("preserva organizações existentes e bloqueia somente a flag explícita", () => {
    expect(moduloIaEstaLiberado(null)).toBe(true);
    expect(moduloIaEstaLiberado({})).toBe(true);
    expect(moduloIaEstaLiberado({ ai_module_enabled: true })).toBe(true);
    expect(moduloIaEstaLiberado({ ai_module_enabled: false })).toBe(false);
    expect(new ModuloIaBloqueadoError().terminal).toBe(true);
  });
  it("esconde IA sem remover outros hubs nem afetar outra organização", () => {
    const enabled = sidebarGroups(false, "admin");
    const disabled = sidebarGroups(false, "admin", undefined, undefined, false);
    expect(disabled.map((g) => g.group.id)).toEqual(
      enabled.filter((g) => g.group.id !== "ia").map((g) => g.group.id),
    );
    expect(searchable(false, "admin", undefined, undefined, false).some((d) => d.group === "ia")).toBe(false);
    expect(searchable(false, "admin").some((d) => d.group === "ia")).toBe(true);
  });
});
