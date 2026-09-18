// Prova transacional: fixtures aleatórias e rollback incondicional. Sem dados pessoais.
/* eslint-disable @typescript-eslint/no-require-imports -- Script CommonJS executado via stdin no container Node. */
const pg = require("pg");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
async function main() {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin");
    const migration = fs.readFileSync("/tmp/tenant-deletion.sql", "utf8");
    await db.query(migration);
    await db.query(migration);
    const owner = (await db.query("select user_id from platform_admins where granted_by=user_id and scope='full' order by granted_at,user_id limit 1")).rows[0]?.user_id;
    assert.ok(owner, "Dono original não encontrado; nenhuma exclusão autorizada");
    const a = randomUUID(), b = randomUUID(), outsider = randomUUID();
    for (const org of [a,b]) await db.query("insert into organizations(id,slug,legal_name,display_name) values($1,$2,'Teste transacional','Teste transacional')", [org, "test-" + org]);
    await db.query("update platform_primary_organization set organization_id=null where id=1");
    for (const org of [a,b]) await db.query("insert into contacts(organization_id,name) values($1,'Contato fictício')", [org]);
    const loginCount = (await db.query("select count(*)::int as n from auth.users")).rows[0].n;
    for (const org of [a,b]) {
      const pipeline = randomUUID(), stage = randomUUID();
      await db.query("insert into crm_pipelines(id,organization_id,name,slug) values($1,$2,'Teste','teste')", [pipeline,org]);
      await db.query("insert into crm_stages(id,organization_id,pipeline_id,name,slug,position) values($1,$2,$3,'Teste','teste',1)", [stage,org,pipeline]);
      await db.query("insert into crm_leads(organization_id,pipeline_id,stage_id,title) values($1,$2,$3,'Lead fictício')", [org,pipeline,stage]);
    }
    for (const org of [a,b]) await db.query("insert into storage.objects(bucket_id,name) values('whatsapp-media',$1)", [org + "/teste.jpg"]);
    async function refused(actor, slug, code) {
      await db.query("savepoint refusal");
      try {
        await db.query("select fn_delete_suspended_tenant($1,$2,$3,'Teste de encerramento',$4)", [a, actor, slug, randomUUID()]);
        assert.fail("Exclusão deveria ter sido bloqueada");
      } catch (err) { assert.equal(err.code, code); }
      finally { await db.query("rollback to savepoint refusal"); }
    }
    await refused(outsider, "test-" + a, "42501");
    await refused(owner, "test-" + a, "P0001");
    await db.query("update organizations set status='suspended' where id=$1", [a]);
    await refused(owner, "test-" + a, "P0001");
    await db.query("select fn_set_primary_organization($1,$2,$3)", [b,owner,randomUUID()]);
    await refused(owner, "identificador-errado", "22023");
    await db.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,'admin',now())", [owner,a]);
    await db.query("savepoint self_org");
    await db.query("update platform_primary_organization set organization_id=$1 where id=1", [a]);
    await refused(owner, "test-" + a, "P0001");
    await db.query("rollback to savepoint self_org");
    await db.query("savepoint principal_fk");
    try { await db.query("delete from organizations where id=$1", [b]); assert.fail("Principal apagada"); }
    catch (err) { assert.equal(err.code, "23503"); }
    await db.query("rollback to savepoint principal_fk");
    await db.query("savepoint connected");
    await db.query("insert into channel_sessions(organization_id,waha_session_name,webhook_secret_encrypted) values($1,$2,decode('01','hex'))", [a,"test-" + a]);
    await refused(owner, "test-" + a, "P0001");
    await db.query("rollback to savepoint connected");
    await db.query("select fn_delete_suspended_tenant($1,$2,$3,'Teste de encerramento',$4)", [a, owner, "test-" + a, randomUUID()]);
    assert.equal((await db.query("select count(*)::int as n from organizations where id=$1", [a])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from contacts where organization_id=$1", [a])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from organizations where id=$1", [b])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int as n from contacts where organization_id=$1", [b])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int as n from crm_leads where organization_id=$1", [b])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int as n from crm_leads where organization_id=$1", [a])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from auth.users")).rows[0].n, loginCount);
    assert.equal((await db.query("select count(*)::int as n from platform_tenant_deletion_storage where deleted_organization_id=$1", [a])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int as n from platform_tenant_deletion_storage where deleted_organization_id=$1", [b])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from api_audit_log where action='tenant.deleted' and resource_id=$1", [a])).rows[0].n, 1);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.fn_delete_suspended_tenant(uuid,uuid,text,text,uuid)','execute') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.fn_set_primary_organization(uuid,uuid,uuid)','execute') as allowed")).rows[0].allowed, false);
    console.log("PASS: migration idempotente, dono exclusivo, suspensão, confirmação, cascade, isolamento e auditoria. Tudo revertido.");
  } finally { await db.query("rollback"); await db.end(); }
}
main().catch(err => { console.error(JSON.stringify({ code: err.code, message: err.message })); process.exitCode = 1; });
