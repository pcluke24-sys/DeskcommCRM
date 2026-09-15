import { afterEach, describe, expect, it, vi } from "vitest";

import { INTERNOS, transporteMeta } from "./conversions";

afterEach(() => vi.unstubAllGlobals());

describe("transporte Meta", () => {
  it("nao inventa valor para evento que nao e compra", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await transporteMeta.enviar(
      { datasetId: "123456", accessToken: "token-secreto", testEventCode: "TEST1" },
      {
        organizationId: "org-1",
        leadId: "lead-1",
        evento: "Contact",
        eventoId: "lead-1:Contact",
        ocorridoEm: new Date(),
        cliqueDeOrigem: "ctwa-1",
        telefone: "5511999999999",
        valorCentavos: null,
        moeda: null,
      },
    );

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const corpo = JSON.parse(String(init.body));
    expect(corpo.data[0].event_name).toBe("Contact");
    expect(corpo.data[0].action_source).toBe("business_messaging");
    expect(corpo.data[0].messaging_channel).toBe("whatsapp");
    expect(corpo.data[0].user_data.ctwa_clid).toBe("ctwa-1");
    expect(corpo.data[0]).not.toHaveProperty("custom_data");
    expect(corpo.test_event_code).toBe("TEST1");
  });

  it("converte centavos em numero decimal para Purchase", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await transporteMeta.enviar(
      { datasetId: "123456", accessToken: "token-secreto", testEventCode: null },
      {
        organizationId: "org-1",
        leadId: "lead-1",
        evento: "Purchase",
        eventoId: "lead-1:Purchase",
        ocorridoEm: new Date(),
        cliqueDeOrigem: "ctwa-1",
        telefone: null,
        valorCentavos: 150050,
        moeda: "BRL",
      },
    );

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const corpo = JSON.parse(String(init.body));
    expect(corpo.data[0].custom_data).toEqual({ value: 1500.5, currency: "BRL" });
  });

  it("envia conversao organica pelo telefone sem inventar ctwa_clid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await transporteMeta.enviar(
      { datasetId: "123456", accessToken: "token-secreto", testEventCode: "TEST1" },
      {
        organizationId: "org-1",
        leadId: "lead-organico",
        evento: "Contact",
        eventoId: "lead-organico:Contact",
        ocorridoEm: new Date(),
        cliqueDeOrigem: null,
        telefone: "5511999999999",
        valorCentavos: null,
        moeda: null,
      },
    );

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const corpo = JSON.parse(String(init.body));
    expect(corpo.data[0].action_source).toBe("system_generated");
    expect(corpo.data[0]).not.toHaveProperty("messaging_channel");
    expect(corpo.data[0].user_data).not.toHaveProperty("ctwa_clid");
    expect(corpo.data[0].user_data.ph[0]).toBe(INTERNOS.hash("5511999999999"));
  });
});
