import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GOV_AGENT_A, GOV_ORG, GOV_VIEWER, seedGov } from "./gov-helpers";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 2,
});

beforeAll(() => seedGov());
afterAll(() => pool.end());

async function comoUsuario(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await client.query(sql, params);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

const comoAgente = (sql: string, params: unknown[] = []) =>
  comoUsuario(GOV_AGENT_A, sql, params);

describe("exclusão atômica de contato com follow-up", () => {
  it("remove contato e job em cascata, mas continua proibindo apagar o job diretamente", async () => {
    const contato = randomUUID();
    const job = randomUUID();
    await pool.query(
      "insert into contacts(id,organization_id,display_name) values($1,$2,'Contato para excluir')",
      [contato, GOV_ORG],
    );
    await pool.query(
      "insert into job_queue(id,organization_id,contact_id,kind,payload) values($1,$2,$3,'followup_turn','{}')",
      [job, GOV_ORG, contato],
    );

    await expect(comoAgente("delete from job_queue where id=$1", [job])).rejects.toThrow(
      /followup_job_internal/,
    );

    const resultado = await comoAgente("select fn_delete_contact_atomic($1,$2) id", [
      GOV_ORG,
      contato,
    ]);
    expect(resultado.rows[0]?.id).toBe(contato);
    const restante = await pool.query(
      "select (select count(*) from contacts where id=$1)::int contatos,(select count(*) from job_queue where id=$2)::int jobs",
      [contato, job],
    );
    expect(restante.rows[0]).toEqual({ contatos: 0, jobs: 0 });
  });

  it("mantém compatibilidade com o DELETE da ficha feito por versões anteriores do app", async () => {
    const contato = randomUUID();
    const job = randomUUID();
    await pool.query(
      "insert into contacts(id,organization_id,display_name) values($1,$2,'Contato legado')",
      [contato, GOV_ORG],
    );
    await pool.query(
      "insert into job_queue(id,organization_id,contact_id,kind,payload) values($1,$2,$3,'followup_turn','{}')",
      [job, GOV_ORG, contato],
    );

    const resultado = await comoAgente(
      "delete from contacts where organization_id=$1 and id=$2 returning id",
      [GOV_ORG, contato],
    );
    expect(resultado.rows[0]?.id).toBe(contato);
    const jobs = await pool.query("select count(*)::int total from job_queue where id=$1", [job]);
    expect(jobs.rows[0]?.total).toBe(0);
  });

  it("recusa viewer antes de tocar na ficha", async () => {
    const contato = randomUUID();
    await pool.query(
      "insert into contacts(id,organization_id,display_name) values($1,$2,'Contato protegido')",
      [contato, GOV_ORG],
    );

    await expect(
      comoUsuario(GOV_VIEWER, "select fn_delete_contact_atomic($1,$2)", [GOV_ORG, contato]),
    ).rejects.toThrow(/forbidden/);
    const restante = await pool.query("select count(*)::int total from contacts where id=$1", [contato]);
    expect(restante.rows[0]?.total).toBe(1);
    await pool.query("delete from contacts where id=$1", [contato]);
  });

  it("um vínculo RESTRICT reverte também a remoção de mensagens e conversas", async () => {
    const contato = randomUUID();
    const compromisso = randomUUID();
    await pool.query(
      "insert into contacts(id,organization_id,display_name) values($1,$2,'Contato com agenda')",
      [contato, GOV_ORG],
    );
    await pool.query(
      "insert into calendar_appointments(id,organization_id,contact_id,title,starts_at,ends_at,status) values($1,$2,$3,'Teste',now(),now()+interval '1 hour','confirmed')",
      [compromisso, GOV_ORG, contato],
    );

    await expect(
      comoAgente("select fn_delete_contact_atomic($1,$2)", [GOV_ORG, contato]),
    ).rejects.toThrow(/foreign key constraint/);
    const restante = await pool.query("select count(*)::int total from contacts where id=$1", [contato]);
    expect(restante.rows[0]?.total).toBe(1);

    await pool.query("delete from calendar_appointments where id=$1", [compromisso]);
    await pool.query("delete from contacts where id=$1", [contato]);
  });
});
