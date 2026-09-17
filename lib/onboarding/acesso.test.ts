import { describe, expect, it } from "vitest";
import { podeConfigurarOrganizacao, deveAbrirImplantacao } from "./acesso";
describe("implantação por papel e responsável", () => {
  it.each(["agent", "viewer", "ai_operator", "unknown"])("%s nunca configura", role => {
    expect(podeConfigurarOrganizacao(role)).toBe(false);
    expect(deveAbrirImplantacao({role, completed:false, support:false, platform:false, settings:null})).toBe(false);
  });
  it.each(["admin", "manager"])("%s configura quando delegado ao cliente", role => {
    expect(deveAbrirImplantacao({role, completed:false, support:false, platform:false, settings:null})).toBe(true);
  });
  it("agência prepara sem obrigar o cliente ao wizard", () => {
    const base={role:"admin",completed:false,support:false,settings:{setup_mode:"agency"}};
    expect(deveAbrirImplantacao({...base,platform:false})).toBe(false);
    expect(deveAbrirImplantacao({...base,platform:true})).toBe(true);
    expect(deveAbrirImplantacao({...base,platform:true,completed:true})).toBe(false);
    expect(deveAbrirImplantacao({...base,platform:true,support:true})).toBe(false);
  });
});
