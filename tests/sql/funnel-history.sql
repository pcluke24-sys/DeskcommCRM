-- Teste transacional, dados sintéticos; rollback impede side effects externos.
begin;
insert into auth.users (id,email) values ('f0261000-1111-4000-8000-000000000001','funnel-test@example.invalid');
insert into public.organizations (id,slug,legal_name,display_name) values
 ('f0261000-0000-4000-8000-000000000001','funnel-test-a','Teste A','Teste A'),
 ('f0261000-0000-4000-8000-000000000002','funnel-test-b','Teste B','Teste B');
insert into public.user_organizations (user_id,organization_id,role,accepted_at) values
 ('f0261000-1111-4000-8000-000000000001','f0261000-0000-4000-8000-000000000001','manager',now());
insert into public.crm_pipelines (id,organization_id,name,slug) values
 ('f0261000-2222-4000-8000-000000000001','f0261000-0000-4000-8000-000000000001','Funil A','test-a'),
 ('f0261000-2222-4000-8000-000000000002','f0261000-0000-4000-8000-000000000002','Funil B','test-b');
insert into public.crm_stages (id,organization_id,pipeline_id,name,slug,position) values
 ('f0261000-3333-4000-8000-000000000001','f0261000-0000-4000-8000-000000000001','f0261000-2222-4000-8000-000000000001','Entrada','entrada',1),
 ('f0261000-3333-4000-8000-000000000002','f0261000-0000-4000-8000-000000000001','f0261000-2222-4000-8000-000000000001','Agenda','agenda',2),
 ('f0261000-3333-4000-8000-000000000003','f0261000-0000-4000-8000-000000000002','f0261000-2222-4000-8000-000000000002','Entrada B','entrada',1);
insert into public.crm_leads (id,organization_id,pipeline_id,stage_id,title) values
 ('f0261000-4444-4000-8000-000000000001','f0261000-0000-4000-8000-000000000001','f0261000-2222-4000-8000-000000000001','f0261000-3333-4000-8000-000000000001','Teste'),
 ('f0261000-4444-4000-8000-000000000002','f0261000-0000-4000-8000-000000000002','f0261000-2222-4000-8000-000000000002','f0261000-3333-4000-8000-000000000003','Teste');
update public.crm_leads set stage_id='f0261000-3333-4000-8000-000000000002' where id='f0261000-4444-4000-8000-000000000001';
update public.crm_leads set stage_id='f0261000-3333-4000-8000-000000000001' where id='f0261000-4444-4000-8000-000000000001';
update public.crm_leads set stage_id='f0261000-3333-4000-8000-000000000002' where id='f0261000-4444-4000-8000-000000000001';
update public.crm_leads set position_in_stage=2 where id='f0261000-4444-4000-8000-000000000001';
do $$ declare r jsonb; begin
 r := public.fn_funnel_history('f0261000-0000-4000-8000-000000000001','f0261000-2222-4000-8000-000000000001',now()-interval '1 hour',clock_timestamp()+interval '1 hour');
 if r#>>'{totals,received}' <> '1' or r#>>'{stages,0,leads}' <> '1' or r#>>'{stages,0,entries}' <> '2'
    or r#>>'{stages,1,leads}' <> '1' or r#>>'{stages,1,entries}' <> '2' or (r#>>'{stages,0,advance_rate}')::numeric <> 100 then
   raise exception 'Contagem/avanço incorretos: %',r;
 end if;
 r := public.fn_funnel_history('f0261000-0000-4000-8000-000000000001','f0261000-2222-4000-8000-000000000001',now()-interval '2 days',now()-interval '1 day');
 if r#>>'{totals,leads}' <> '0' then raise exception 'Histórico anterior indevido'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f0261000-1111-4000-8000-000000000001"}',true);
do $$ declare r jsonb; begin
 if (select count(*) from public.crm_funnel_entries) <> 4 then raise exception 'RLS vazou ou ocultou dados próprios'; end if;
 r := public.fn_funnel_history('f0261000-0000-4000-8000-000000000002','f0261000-2222-4000-8000-000000000002',now()-interval '1 hour',clock_timestamp()+interval '1 hour');
 if r#>>'{totals,leads}' <> '0' then raise exception 'RPC vazou tenant vizinho'; end if;
 if has_table_privilege(current_user,'public.crm_funnel_entries','INSERT') or has_table_privilege(current_user,'public.crm_funnel_entries','DELETE') then raise exception 'Ledger editável'; end if;
 if has_function_privilege('anon','public.fn_funnel_history(uuid,uuid,timestamptz,timestamptz)','EXECUTE') then raise exception 'RPC pública'; end if;
end $$;
reset role;
rollback;
select 'funnel_history: contagens, período, avanço, RLS e permissões OK' as resultado;
