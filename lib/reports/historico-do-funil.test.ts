import { describe, expect, it } from "vitest";
import { csvDoFunil, type HistoricoDoFunil } from "./historico-do-funil";
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
});
