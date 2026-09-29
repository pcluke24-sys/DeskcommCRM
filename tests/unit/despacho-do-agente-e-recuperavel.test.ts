import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const POS = readFileSync("lib/channels/pos-entrada.ts", "utf8");
const WAHA = readFileSync("lib/waha/ingest.ts", "utf8");
const MIGRATION = readFileSync(
  "supabase/migrations/20260929214500_0492_garante_despacho_do_agente.sql",
  "utf8",
);
const BASELINE = readFileSync("supabase/baseline.sql", "utf8");

describe("a resposta imediata sobrevive a uma falha entre mensagem e despacho", () => {
  it("não engole a falha do despacho e usa o ensure idempotente", () => {
    expect(POS).toContain('rpc("fn_garantir_despacho_agente"');
    expect(POS).toContain('lancarFalhaDeIngestao("fn_garantir_despacho_agente"');
    expect(POS).not.toMatch(/emit ai_agent\.dispatch_requested falhou/);
  });

  it("a reentrega deduplicada repara os efeitos, inclusive o despacho", () => {
    const ramo = WAHA.slice(WAHA.indexOf('if (insertErr?.code === "23505")'));
    expect(ramo).toContain("await aplicarEfeitosPosEntrada(admin, {");
    expect(ramo).toContain('origem: "waha_webhook_reentrega"');
  });

  it("o banco serializa duas tentativas e devolve o mesmo evento", () => {
    for (const sql of [MIGRATION, BASELINE]) {
      expect(sql).toContain("pg_advisory_xact_lock");
      expect(sql).toContain("event_type = 'ai_agent.dispatch_requested'");
      expect(sql).toContain("direction = 'inbound'");
      expect(sql).toContain("grant execute on function public.fn_garantir_despacho_agente");
    }
  });
});
