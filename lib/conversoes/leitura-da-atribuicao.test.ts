import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { lerAtribuicao } from "./leitura-da-atribuicao";

function banco(contato: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: contato }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { client: { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient, query };
}
describe("identidade do contato para conversoes", () => {
  it("le a identidade da propria organizacao e nao inclui metadados do operador", async () => {
    const { client, query } = banco({
      phone_number: "+55 11 99999-9999",
      name: "Ana Maria Silva",
      email: "ana@example.com",
      source_metadata: {
        fbc: "fb.1.1789730000000.click",
        operator_ip: "192.0.2.1",
        operator_user_agent: "vendedor",
      },
    });
    const result = await lerAtribuicao(client, "org-1", "contact-1");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(query.eq).toHaveBeenCalledWith("id", "contact-1");
    expect(result.temAtribuicao).toBe(true);
    if (!result.temAtribuicao) throw new Error("Contato deveria estar disponivel");
    expect(result.atribuicao.identidade).toMatchObject({
      identificadorExterno: "org-1:contact-1",
      email: "ana@example.com",
      nome: "Ana",
      sobrenome: "Maria Silva",
      identificadorDeCliqueWeb: "fb.1.1789730000000.click",
    });
    expect(result.atribuicao.identidade.ipDoContato).toBeUndefined();
    expect(result.atribuicao.identidade.agenteDoNavegadorDoContato).toBeUndefined();
  });
  it("nao envia identidade de um contato anonimizado", async () => {
    const { client } = banco({
      phone_number: "5511999999999",
      is_anonymized: true,
      name: "Cliente Anonimizado",
    });
    expect(await lerAtribuicao(client, "org-1", "contact-1")).toEqual({
      temAtribuicao: false,
      motivo: "sem_contato",
    });
  });
});
