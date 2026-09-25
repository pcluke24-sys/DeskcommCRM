import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerCtx } from "@/lib/api/handlers/types";

const auditSpy = vi.fn(async () => undefined);

vi.mock("@/lib/audit", () => ({
  audit: auditSpy,
  isServiceRoleConfigured: () => false,
  hashEmail: (e: string) => e,
}));

const ORG = "c05e7a00-0000-4000-8000-000000000001";
const CONTATO = "c05e7a00-0000-4000-8000-0000000000c1";
const USUARIO = "c05e7a00-0000-4000-8000-0000000000a1";

const chamadas: Array<{ tabela: string; op: string }> = [];
const contagens: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];

interface CadeiaContagem {
  eq: (coluna: string, valor: unknown) => CadeiaContagem;
  maybeSingle: () => Promise<{ data: null; error: null }>;
  then: (resolve: (valor: unknown) => unknown) => unknown;
}

interface OpcoesFake {
  missing?: boolean;
  /** Quantos vínculos RESTRICT a pré-checagem encontra na agenda. */
  vinculos?: number;
  /** A contagem do vínculo falha (tabela/RLS fora do ar). */
  erroContagem?: { message: string };
  /** A RPC atômica falha como uma FK RESTRICT; nada pode ficar parcialmente apagado. */
  fkNaFicha?: boolean;
}

function clienteFalso(opts?: OpcoesFake): unknown {
  return {
    from: (tabela: string) => {
      return {
        // `select("id", {count, head})` é a pré-checagem de vínculo: só conta.
        select: (_colunas?: string, opcoes?: { count?: string; head?: boolean }) => {
          if (opcoes?.count) {
            const filtros: Array<[string, unknown]> = [];
            const cadeia: CadeiaContagem = {
              eq: (coluna, valor) => {
                filtros.push([coluna, valor]);
                return cadeia;
              },
              maybeSingle: async () => ({ data: null, error: null }),
              then: (resolve) => {
                contagens.push({ tabela, filtros });
                return resolve(
                  opts?.erroContagem
                    ? { count: null, error: opts.erroContagem }
                    : { count: opts?.vinculos ?? 0, error: null },
                );
              },
            };
            return cadeia;
          }
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: async () =>
                  opts?.missing
                    ? { data: null, error: null }
                    : { data: { id: CONTATO, organization_id: ORG }, error: null },
              }),
            }),
          };
        },
      };
    },
    rpc: (nome: string) => {
      if (nome === "fn_delete_contact_atomic") {
        chamadas.push({ tabela: "fn_delete_contact_atomic", op: "rpc" });
        return Promise.resolve({
          data: opts?.missing ? null : CONTATO,
          error: opts?.fkNaFicha ? { code: "23503", message: "fk" } : null,
        });
      }
      return { then: (r: (v: unknown) => unknown) => r({ error: null }) };
    },
  };
}

function ctxFalso(): HandlerCtx {
  return { organization_id: ORG, actor: { type: "user", id: USUARIO }, requestId: "req-1" };
}

function ultimaAuditoria(): Record<string, unknown> | undefined {
  return (auditSpy.mock.calls.at(-1) as unknown as [Record<string, unknown>] | undefined)?.[0];
}

describe("deleteContactHandler", () => {
  beforeEach(() => {
    auditSpy.mockClear();
    chamadas.length = 0;
  });

  it("apaga histórico e contato numa única RPC atômica e audita", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    const out = await deleteContactHandler(
      clienteFalso() as never,
      { organization_id: ORG, actor: { type: "user", id: USUARIO }, requestId: "req-1" },
      CONTATO,
    );
    expect(out).toEqual({ id: CONTATO });
    expect(chamadas.map((c) => c.tabela)).toEqual(["fn_delete_contact_atomic"]);
    // A pré-checagem da #752 conta o vínculo com os DOIS filtros (contato +
    // organização): sem o de organização, contato de outra org bloquearia.
    expect(contagens).toEqual([
      { tabela: "calendar_appointments", filtros: [["contact_id", CONTATO], ["organization_id", ORG]] },
    ]);
    const ultima = (auditSpy.mock.calls.at(-1) as unknown as [Record<string, unknown>] | undefined)?.[0];
    expect(ultima).toMatchObject({
      action: "contact.deleted",
      resourceId: CONTATO,
      organizationId: ORG,
    });
  });

  it("contato com compromisso na agenda: 409 e o histórico fica intacto (issue #752)", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(
      deleteContactHandler(clienteFalso({ vinculos: 1 }) as never, ctxFalso(), CONTATO),
    ).rejects.toMatchObject({ status: 409, code: "state_conflict" });
    // O ponto da issue: nada foi apagado antes de saber que a ficha não sai.
    expect(chamadas).toEqual([]);
    expect(auditSpy).not.toHaveBeenCalledWith(expect.objectContaining({ action: "contact.deleted" }));
    expect(ultimaAuditoria()).toMatchObject({
      action: "contact.delete_blocked",
      resourceId: CONTATO,
      organizationId: ORG,
      metadata: { motivo: "vinculo_restrict", vinculos: ["1 compromisso(s) na agenda"], apagados: [] },
    });
  });

  it("falha atomica da ficha: audita e nao deixa historico parcialmente apagado", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(
      deleteContactHandler(clienteFalso({ fkNaFicha: true }) as never, ctxFalso(), CONTATO),
    ).rejects.toMatchObject({ status: 409, code: "state_conflict" });
    expect(chamadas.map((c) => c.tabela)).toEqual(["fn_delete_contact_atomic"]);
    expect(ultimaAuditoria()).toMatchObject({
      action: "contact.delete_blocked",
      resourceId: CONTATO,
      metadata: { motivo: "falha_ao_apagar", vinculos: [], apagados: [] },
    });
  });

  it("falha ao contar o vínculo não segue apagando o histórico", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(
      deleteContactHandler(clienteFalso({ erroContagem: { message: "contagem fora do ar" } }) as never, ctxFalso(), CONTATO),
    ).rejects.toMatchObject({ status: 500, code: "internal_error" });
    expect(chamadas).toEqual([]);
  });

  it("404 se o contato não existe na org", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(
      deleteContactHandler(
        clienteFalso({ missing: true }) as never,
        { organization_id: ORG, actor: { type: "user", id: USUARIO }, requestId: "req-1" },
        CONTATO,
      ),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
