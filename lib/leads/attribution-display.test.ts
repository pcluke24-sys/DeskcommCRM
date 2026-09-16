import { describe, expect, it } from "vitest";

import { atributosDeOrigem } from "./attribution-display";

describe("atributosDeOrigem", () => {
  it("prioriza a UTM de origem e preserva os parâmetros úteis", () => {
    expect(atributosDeOrigem("webhook", {
      utm_source: "instagram", utm_medium: "bio", utm_campaign: "setembro",
    })).toEqual([
      { rotulo: "Origem", valor: "instagram" },
      { rotulo: "Mídia", valor: "bio" },
      { rotulo: "Campanha", valor: "setembro" },
    ]);
  });

  it("mostra o CTWA recebido do anúncio sem inventar UTM", () => {
    expect(atributosDeOrigem("meta_ads", { ad_source_id: "clid-123" })).toEqual([
      { rotulo: "Origem", valor: "Anúncio da Meta" },
      { rotulo: "CTWA CLID", valor: "clid-123" },
    ]);
  });
});
