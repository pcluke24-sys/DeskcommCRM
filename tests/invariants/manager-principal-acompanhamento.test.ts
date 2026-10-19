import { describe, expect, it } from "vitest";
import { sql } from "./gov-helpers";

const actor = "f9060000-0000-4000-8000-000000000001";
const session = "f9060000-0000-4000-8000-000000000002";
const a = "f9060000-0000-4000-8000-000000000003";
const b = "f9060000-0000-4000-8000-000000000004";
const c = "f9060000-0000-4000-8000-000000000005";
const contact = "f9060000-0000-4000-8000-000000000006";
const seed = `begin;
insert into auth.users(id,email) values('${actor}','manager-principal@invariant.test');
insert into auth.sessions(id,user_id,aal) values('${session}','${actor}','aal1');
insert into organizations(id,slug,display_name,legal_name) values
('${a}','manager-principal-a','A','A'),('${b}','manager-principal-b','B','B'),('${c}','manager-principal-c','C','C');
update platform_primary_organization set organization_id='${a}' where id=1;
insert into user_organizations(organization_id,user_id,role,accepted_at) values('${a}','${actor}','manager',now());
insert into contacts(id,organization_id,name) values('${contact}','${b}','Sintético');`;
const claims = () => `select set_config('request.jwt.claims','{"sub":"${actor}","session_id":"${session}","aal":"aal1"}',true);`;
const start = (mode = "support_readonly") => `select fn_start_support('${actor}','${session}','${b}','${a}','${mode}',3600);`;
const check = (condition: string) => `do $$ begin if (${condition}) is distinct from true then raise exception 'invariant failed'; end if; end $$;`;
function prove(body: string) {
  expect(sql(`${seed}\n${body}\nrollback; select 'proved';`)).toContain("proved");
}
const authorityDenied = (statement: string) => `do $$ begin
 begin ${statement} exception when others then
   if sqlerrm='support_authority_required' then return; else raise; end if;
 end; raise exception 'authority escaped'; end $$;`;

describe("manager Principal acompanha cliente sem virar administrador", () => {
  it("não lê outro tenant antes; passa a ler apenas B, sem membership", () => prove(`
    ${claims()} set local role authenticated;
    ${check(`not exists(select 1 from contacts where id='${contact}')`)}
    reset role; ${start()} ${claims()} set local role authenticated;
    ${check(`exists(select 1 from contacts where id='${contact}')`)}
    ${check(`fn_user_role_in_org('${b}')='viewer'`)}
    ${check(`fn_support_context()->>'actor_is_platform_admin'='false'`)}
    ${check(`not fn_is_platform_admin()`)}
    ${check(`not exists(select 1 from fn_user_org_ids() x where x='${c}')`)}
    reset role;
    ${check(`not exists(select 1 from user_organizations where user_id='${actor}' and organization_id='${b}')`)}
  `));
  it("não permite solicitar full", () => prove(authorityDenied(start("full"))));
  for (const role of ["viewer", "agent", "admin"]) {
    it(`não concede acompanhamento ao ${role} da Principal`, () => prove(`
      update user_organizations set role='${role}' where user_id='${actor}';
      ${authorityDenied(start())}
    `));
  }
  it("manager do cliente não ganha poder transversal", () => prove(`
    update platform_primary_organization set organization_id='${c}' where id=1;
    ${authorityDenied(start())}
  `));
  it("nega alteração direta sob RLS e mantém o contato original", () => prove(`
    ${start()} ${claims()} set local role authenticated;
    do $$ begin
      begin update contacts set name='Alterado' where id='${contact}';
      exception when insufficient_privilege then null; end;
    end $$;
    ${check(`(select name from contacts where id='${contact}')='Sintético'`)}
    ${check(`not fn_support_write_allowed('${b}')`)}
  `));
  for (const revoke of [
    `update user_organizations set revoked_at=now() where user_id='${actor}'`,
    `update user_organizations set role='agent' where user_id='${actor}'`,
    `update platform_primary_organization set organization_id='${c}' where id=1`,
    `update organizations set status='suspended' where id='${a}'`,
    `delete from auth.sessions where id='${session}'`,
  ]) {
    it(`revalida revogação: ${revoke.split(" ").slice(0, 3).join(" ")}`, () => prove(`
      ${start()} ${revoke}; ${claims()} set local role authenticated;
      ${check(`fn_support_context()->>'status'='revoked'`)}
      ${check(`not exists(select 1 from contacts where id='${contact}')`)}
    `));
  }
  it("anon e authenticated não invocam a consulta transversal por UUID", () => prove(`
    ${check(`not has_function_privilege('anon','public.fn_manager_principal(uuid)','EXECUTE')`)}
    ${check(`not has_function_privilege('authenticated','public.fn_manager_principal(uuid)','EXECUTE')`)}
    ${check(`has_function_privilege('service_role','public.fn_manager_principal(uuid)','EXECUTE')`)}
  `));
});
