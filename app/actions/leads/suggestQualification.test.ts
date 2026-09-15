import { describe, expect, it } from "vitest";

import { INTERNOS } from "./suggestQualification";

describe("resposta da sugestao de qualificacao", () => {
  it("extrai JSON mesmo quando o provedor cerca a resposta", () => {
    const value = INTERNOS.extrairJson(
      'Resposta: {"classificacao":"qualificado","confianca":82,"justificativa":"Tem perfil.","criterios_encontrados":["regiao"],"informacoes_ausentes":[]}',
    );
    expect(INTERNOS.respostaSchema.parse(value).classificacao).toBe("qualificado");
  });

  it("recusa classificacao fora do contrato", () => {
    const value = INTERNOS.extrairJson(
      '{"classificacao":"comprador","confianca":100,"justificativa":"x","criterios_encontrados":[],"informacoes_ausentes":[]}',
    );
    expect(INTERNOS.respostaSchema.safeParse(value).success).toBe(false);
  });
});
