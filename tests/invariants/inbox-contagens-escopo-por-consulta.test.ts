import { beforeAll, describe, expect, it } from "vitest";
import { countAs, lastLine, sql } from "./gov-helpers";

const id = (n: number) => `a9000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = id(1), MANAGER = id(2), AGENT = id(3), VIEWER = id(4), OUTSIDER = id(5), OTHER = id(6);
const A = id(10), B = id(11), HOME = id(12), SESSION = id(40);
const claims = (user: string) => `select set_config('request.jwt.claims', '${JSON.stringify({ sub: user, session_id: SESSION, aal: "aal1" })}',true);`;
const region = `organization_id in ('${A}','${B}')`;

beforeAll(() => {
  sql(`
    insert into auth.users(id,email) select ('a9000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      'inbox-perf-'||n||'@invariant.test' from generate_series(1,6) n;
    insert into auth.sessions(id,user_id,aal) values('${SESSION}','${OWNER}','aal1');
    insert into organizations(id,slug,display_name,legal_name,settings) values
      ('${A}','inbox-perf-a','A','A','{"visibility_mode":"own_and_unassigned"}'),
      ('${B}','inbox-perf-b','B','B','{"visibility_mode":"own_and_unassigned"}'),
      ('${HOME}','inbox-perf-home','Home','Home','{}');
    insert into user_organizations(organization_id,user_id,role,accepted_at) values
      ('${HOME}','${OWNER}','admin',now()), ('${A}','${MANAGER}','manager',now()),
      ('${A}','${AGENT}','agent',now()), ('${A}','${VIEWER}','viewer',now()),
      ('${A}','${OTHER}','agent',now()), ('${B}','${OTHER}','agent',now());
    insert into platform_admins(user_id,granted_by,scope,mfa_required,reason)
      values('${OWNER}','${OWNER}','full',false,'Synthetic invariant');
    insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values
      ('${id(50)}','${A}','inbox-perf-a','\\x00'::bytea),
      ('${id(51)}','${B}','inbox-perf-b','\\x00'::bytea);
    insert into contacts(id,organization_id,name,tags)
      select ('a9000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,
        case when n<=4 then '${A}'::uuid else '${B}'::uuid end,'Synthetic '||n,
        case when n%4=3 then array['vip'] when n%4=0 then array['vip','orcamento'] else '{}'::text[] end
      from generate_series(1,8) n;
    insert into conversations(id,organization_id,contact_id,channel_session_id,status,
      assigned_to_user_id,assigned_at,unread_count_for_assignee,tags)
      select ('a9000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,
        case when n<=4 then '${A}'::uuid else '${B}'::uuid end,
        ('a9000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,
        case when n<=4 then '${id(50)}'::uuid else '${id(51)}'::uuid end,
        case when n%4=0 then 'closed' when n%4=2 then 'open' else 'claimed' end,
        case when n%4=2 then null when n<=4 and n%4 in (0,1) then '${AGENT}'::uuid else '${OTHER}'::uuid end,
        case when n%4=2 then null else now() end,
        case when n%4 in (1,2) then 1 else 0 end,
        case when n%4=1 then array['vip'] when n%4=2 then array['vip','orcamento'] else '{}'::text[] end
      from generate_series(1,8) n;
  `);
});

/** O oráculo usa o predicado antigo como postgres, portanto não herda a policy nova. */
function equivalent(user: string, mutation = "") {
  const out = sql(`begin; ${mutation} ${claims(user)}
    select set_config('test.expected_ids', coalesce((select array_agg(id order by id)::text
      from conversations where ${region} and fn_can_view_conversation(organization_id,assigned_to_user_id)),'{}'),true);
    set local role authenticated;
    do $$ begin if array(select id from conversations where ${region} order by id)
      is distinct from current_setting('test.expected_ids')::uuid[] then
      raise exception 'optimized scope diverges from canonical authorization'; end if; end $$;
    rollback; select 'equivalent';`);
  expect(lastLine(out)).toBe("equivalent");
}

function counts(user: string, args = "", org = A): Record<string, number> {
  const output = sql(`begin; ${claims(user)} set local role authenticated;
    select fn_inbox_counts(p_organization_id=>'${org}'${args}); rollback;`);
  const value = output.split(/\r?\n/).find((line) => line.startsWith("{") && line.includes('"all"'));
  if (!value) throw new Error("missing aggregate response");
  return JSON.parse(value);
}

describe("escopo de conversas calculado por statement, sem ampliar autorização", () => {
  for (const user of [MANAGER, AGENT, VIEWER, OUTSIDER, OTHER]) {
    for (const mode of ["own", "own_and_unassigned", "all", "unknown"]) {
      it(`${user.slice(-1)} em modo ${mode} preserva exatamente os IDs visíveis`, () => {
        equivalent(user, `update organizations set settings=jsonb_build_object('visibility_mode','${mode}') where id='${A}';`);
      });
    }
  }
  it("membership revogada não reaparece em nenhuma organização", () => equivalent(AGENT,
    `update user_organizations set revoked_at=now() where user_id='${AGENT}';`));
  it("revogação entre statements não fica em cache na conexão", () => {
    const output = sql(`begin; ${claims(AGENT)} set local role authenticated;
      select count(*) from conversations where organization_id='${A}'; reset role;
      update user_organizations set revoked_at=now() where user_id='${AGENT}'; set local role authenticated;
      select count(*) from conversations where organization_id='${A}'; rollback;`);
    expect(output.split(/\r?\n/).filter((line) => /^\d+$/.test(line)).at(-1)).toBe("0");
  });
  for (const mode of ["full", "support_readonly"]) {
    it(`suporte ${mode} preserva os IDs e não cria membership física`, () => equivalent(OWNER,
      `select fn_start_support('${OWNER}','${SESSION}','${B}','${HOME}','${mode}');`));
  }
  it("suporte revogado junto à autoridade não deixa acesso ao cliente", () => {
    equivalent(OWNER, `select fn_start_support('${OWNER}','${SESSION}','${B}','${HOME}','support_readonly');
      update platform_admins set revoked_at=now() where user_id='${OWNER}';`);
  });
  it("agent não vê conversa alheia nem conta outra organização", () => {
    expect(countAs(AGENT, `select count(*) from conversations where id='${id(203)}'`)).toBe(0);
    expect(counts(AGENT, "", B).all).toBe(0);
  });
  it("anônimo não executa os novos helpers via RPC", () => {
    expect(lastLine(sql(`select has_function_privilege('anon','public.fn_conversation_read_scopes()','execute')
      or has_function_privilege('anon','public.fn_inbox_counts(uuid,uuid,boolean,text[],text,text[],text[],uuid[],uuid[])','execute');`))).toBe("f");
  });
  it("o plano resolve os conjuntos uma vez por statement, não por conversa", () => {
    const output = sql(`begin; ${claims(MANAGER)} set local role authenticated;
      explain (analyze,format json) select count(*) from conversations where organization_id='${A}'; rollback;`);
    const start = output.indexOf("[\n");
    const end = output.lastIndexOf("]");
    const plan = JSON.parse(output.slice(start, end + 1)) as Array<{ Plan: PlanNode }>;
    interface PlanNode { "Function Name"?: string; "Actual Loops"?: number; Plans?: PlanNode[] }
    const scopes: PlanNode[] = [];
    const visit = (node: PlanNode) => {
      if (node["Function Name"] === "fn_conversation_read_scopes") scopes.push(node);
      node.Plans?.forEach(visit);
    };
    visit(plan[0]!.Plan);
    expect(scopes.length).toBeGreaterThan(0);
    expect(scopes.every((node) => (node["Actual Loops"] ?? 0) <= 1)).toBe(true);
  });
});

describe("uma agregação mantém todos os badges e filtros", () => {
  it("preserva o contrato das sete chaves sem revelar linhas", () => {
    expect(counts(MANAGER)).toEqual({ fila: 0, unassigned: 0, automatico: 1, mine: 0, all: 4, closed: 1, archived: 0 });
  });
  it("agent own+fila mantém seu escopo e Minhas exclui encerradas", () => {
    expect(counts(AGENT)).toMatchObject({ all: 3, mine: 1, closed: 1 });
  });
  it("organização sem automático mantém a mesma régua de fila", () => {
    expect(counts(MANAGER, ",p_queue_commands=>array['aguardando','automatico']")).toMatchObject({ fila: 1, unassigned: 1 });
  });
  it("não lidas e canal recortam todas as contagens", () => {
    expect(counts(MANAGER, ",p_unread=>true").all).toBe(2);
    expect(counts(MANAGER, `,p_channel_session_id=>'${id(51)}'`).all).toBe(0);
  });
  it("exclusões de canal e contato são preservadas", () => {
    expect(counts(MANAGER, `,p_excluded_channels=>array['${id(50)}']::uuid[]`).all).toBe(0);
    expect(counts(MANAGER, `,p_excluded_contacts=>array['${id(103)}']::uuid[]`).all).toBe(3);
  });
  it("etiquetas E exigem a mesma caixa; OU admite qualquer caixa", () => {
    expect(counts(MANAGER, ",p_tags=>array['vip','orcamento'],p_tag_mode=>'e'").all).toBe(2);
    expect(counts(MANAGER, ",p_tags=>array['vip','orcamento'],p_tag_mode=>'ou'").all).toBe(4);
    expect(counts(MANAGER, ",p_tags=>array['vip']").all).toBe(4);
  });
});
