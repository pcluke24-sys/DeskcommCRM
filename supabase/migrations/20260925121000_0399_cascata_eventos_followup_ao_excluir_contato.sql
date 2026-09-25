-- Completa a 0398: contatos reais possuem eventos das inscricoes de follow-up.
-- Ao excluir a ficha, a FK apaga esses eventos em cascata. A protecao deve
-- continuar recusando DELETE direto, mas reconhecer a cascata legitima e a
-- marca local da transacao atomica de exclusao do contato.
create or replace function public.fn_followup_generation_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='job_queue' then
  if auth.uid() is not null
     and pg_trigger_depth() <= 1
     and current_setting('deskcomm.exclusao_contato', true) is distinct from 'on'
     and ((tg_op<>'DELETE' and new.kind='followup_turn') or (tg_op<>'INSERT' and old.kind='followup_turn')) then
   raise exception 'followup_job_internal' using errcode='42501';
  end if;
  if tg_op='UPDATE' and old.kind='followup_turn' then
   if new.organization_id<>old.organization_id or new.contact_id is distinct from old.contact_id or new.kind<>old.kind
    or new.payload->'followup_enrollment_id' is distinct from old.payload->'followup_enrollment_id'
    or new.payload->'node_id' is distinct from old.payload->'node_id'
    or new.payload->'source_step_key' is distinct from old.payload->'source_step_key'
   then raise exception 'followup_job_origin_immutable' using errcode='42501'; end if;
  end if;
 elsif auth.uid() is not null
       and pg_trigger_depth() <= 1
       and current_setting('deskcomm.exclusao_contato', true) is distinct from 'on'
       and ((tg_op<>'DELETE' and new.idempotency_key ~ ':[0-9]+$') or (tg_op<>'INSERT' and old.idempotency_key ~ ':[0-9]+$')) then
  raise exception 'followup_step_internal' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function public.fn_followup_generation_write() from public,anon,authenticated;
