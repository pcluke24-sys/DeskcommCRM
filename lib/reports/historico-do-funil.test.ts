import { describe, expect, it } from "vitest";
import {
  csvDeAtribuicao,
  csvDoFunil,
  type HistoricoDeAtribuicao,
  type HistoricoDoFunil,
} from "./historico-do-funil";
const report: HistoricoDoFunil = {
  enabled_since: "2026-09-16T14:00:00Z",
  totals: { leads: 2, received: 2, won: 0, lost: 0 },
  stages: [
    {
      id: "s",
      name: '=HYPERLINK("url")',
      leads: 2,
      entries: 3,
      is_won: false,
      is_lost: false,
      next_stage_id: null,
      advanced: null,
      advance_rate: null,
    },
  ],
};
const attribution: HistoricoDeAtribuicao = {
  enabled_since: "2026-09-16T14:00:00Z",
  group_by: "ad_reference",
  stages: [{ id: "stage", name: "Em contato", is_won: false, is_lost: false }],
  groups: [
    {
      key: '=HYPERLINK("url")',
      ad_title: "+Anúncio",
      stage_counts: { stage: 2 },
    },
  ],
};
describe("CSV do histórico do funil", () => {
  it("exporta únicos separados de entradas e declara janela/ativação", () => {
    const csv = csvDoFunil(report, "Comercial", "inicio", "fim");
    expect(csv).toContain('"2";"3"');
    expect(csv).toContain(report.enabled_since);
    expect(csv).toContain('"inicio";"fim"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
  it("neutraliza fórmulas e escapa aspas de nomes configuráveis", () => {
    expect(csvDoFunil(report, "+FUNIL", "de", "ate")).toContain('"\'+FUNIL"');
    expect(csvDoFunil(report, "F", "de", "ate")).toContain('"\'=HYPERLINK(""url"")"');
  });
  it("não inclui dados pessoais ou inventa taxa sem amostra", () => {
    const csv = csvDoFunil(report, "F", "de", "ate");
    expect(csv).not.toMatch(/phone|contact_id|telefone/);
    expect(csv).not.toContain("NaN");
    expect(csv.endsWith(';"";"";""')).toBe(true);
  });
  it("exporta atribuição por etapa sem deixar UTM ou referência virar fórmula", () => {
    const csv = csvDeAtribuicao(attribution, "F", "de", "ate");
    expect(csv).toContain('"\'=HYPERLINK(""url"")"');
    expect(csv).toContain('"\'+Anúncio"');
    expect(csv).toContain('"2"');
    expect(csv).not.toMatch(/phone|contact_id|telefone/);
  });
});
