import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GOV_MANAGER, GOV_ORG, seedGov } from "./gov-helpers";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 1,
});
beforeAll(() => seedGov());
afterAll(() => pool.end());

describe("organização principal é controle exclusivo do servidor", () => {
  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} não lê nem altera a principal, mesmo com JWT de membro`, async () => {
      const db = await pool.connect();
      try {
        for (const statement of [
          "select * from platform_primary_organization",
          "update platform_primary_organization set organization_id=null where id=1",
          "delete from platform_primary_organization where id=1",
        ]) {
          await db.query("begin");
          await db.query(`set local role ${role}`);
          await db.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub: GOV_MANAGER, role }),
          ]);
          await expect(db.query(statement)).rejects.toMatchObject({ code: "42501" });
          await db.query("rollback");
        }
      } finally {
        await db.query("rollback");
        db.release();
      }
    });
  }
  it("service_role lê mas não muda a principal diretamente", async () => {
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("set local role service_role");
      expect((await db.query("select id from platform_primary_organization")).rowCount).toBe(1);
      await expect(
        db.query("update platform_primary_organization set organization_id=null"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.query("rollback");
      db.release();
    }
  });
  it("a FK protege a principal contra exclusão e a prova não altera dados", async () => {
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("update platform_primary_organization set organization_id=$1 where id=1", [
        GOV_ORG,
      ]);
      await expect(
        db.query("delete from organizations where id=$1", [GOV_ORG]),
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await db.query("rollback");
      db.release();
    }
  });
});
