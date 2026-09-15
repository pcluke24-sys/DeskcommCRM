import { describe, expect, it } from "vitest";

import { INTERNOS } from "./envio.handler";

describe("configuracao de conversoes do funil", () => {
  it("le regras validas e ignora lixo sem inventar evento", () => {
    const config = INTERNOS.configuracaoDoFunil({
      meta_conversion_activated_at: "2026-09-14T12:00:00.000Z",
      meta_conversion_rules: {
        "11111111-1111-4111-8111-111111111111": {
          event_name: " QualifiedLead ",
          requires_value: false,
        },
        vazio: { event_name: " " },
        invalido: "Purchase",
      },
    });

    expect(config.regras).toEqual({
      "11111111-1111-4111-8111-111111111111": {
        event_name: "QualifiedLead",
        requires_value: false,
      },
    });
    expect(config.ativadaEm?.toISOString()).toBe("2026-09-14T12:00:00.000Z");
  });

  it("degrada configuracao ausente sem ativar retroativo", () => {
    expect(INTERNOS.configuracaoDoFunil(null)).toEqual({ regras: {}, ativadaEm: null });
  });
});
