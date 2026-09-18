import { afterEach, describe, expect, it, vi } from "vitest";

import { INTERNOS, transporteMeta } from "./conversions";

afterEach(() => vi.unstubAllGlobals());

describe("transporte Meta", () => {
  it("envia dados reais normalizados em hash e preserva os identificadores web", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await transporteMeta.enviar(
      { datasetId: "123456", accessToken: "secreto", testEventCode: "TEST1" },
      {
        organizationId: "org-1",
        leadId: "lead-1",
        evento: "Purchase",
        eventoId: "lead-1:Purchase",
        ocorridoEm: new Date(),
        cliqueDeOrigem: null,
        telefone: "5511999999999",
        valorCentavos: 10000,
        moeda: "BRL",
        identidade: {
          identificadorExterno: "org-1:contact-1",
          email: " Pessoa@Exemplo.com ",
          nome: "Márcio",
          sobrenome: "Da Silva",
          identificadorDeCliqueWeb: "fb.1.1789730000000.CLIQUE_REAL",
          identificadorDoNavegador: "fb.1.1789730000000.123456",
          ipDoContato: "2001:db8::1",
          agenteDoNavegadorDoContato: "Mozilla/5.0",
        },
      },
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.data[0].user_data).toEqual({
      ph: [INTERNOS.hash("5511999999999")],
      em: [INTERNOS.hash("pessoa@exemplo.com")],
      fn: [INTERNOS.hash("marcio")],
      ln: [INTERNOS.hash("dasilva")],
      external_id: [INTERNOS.hash("org-1:contact-1")],
      fbc: "fb.1.1789730000000.CLIQUE_REAL",
      fbp: "fb.1.1789730000000.123456",
      client_ip_address: "2001:db8::1",
      client_user_agent: "Mozilla/5.0",
    });
    expect(JSON.stringify(body)).not.toContain("Pessoa@Exemplo.com");
  });

  it("omite dados invalidos sem inventar cookies ou dados do operador", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await transporteMeta.enviar(
      { datasetId: "123456", accessToken: "secreto", testEventCode: null },
      {
        organizationId: "org-2",
        leadId: "lead-2",
        evento: "Contact",
        eventoId: "lead-2:Contact",
        ocorridoEm: new Date(),
        cliqueDeOrigem: "ctwa-real",
        telefone: "5511999999999",
        valorCentavos: null,
        moeda: null,
        identidade: {
          identificadorExterno: "org-2:contact-1",
          email: "invalido",
          identificadorDeCliqueWeb: "ctwa-real",
          identificadorDoNavegador: "invalido",
          ipDoContato: "invalido",
          agenteDoNavegadorDoContato: "invalid\r\n",
        },
      },
    );
    const user = JSON.parse(String(fetchMock.mock.calls[0]![1].body)).data[0].user_data;
    expect(user).toEqual({
      ph: [INTERNOS.hash("5511999999999")],
      ctwa_clid: "ctwa-real",
      external_id: [INTERNOS.hash("org-2:contact-1")],
    });
    expect(user.external_id[0]).not.toBe(INTERNOS.hash("org-1:contact-1"));
  });
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
