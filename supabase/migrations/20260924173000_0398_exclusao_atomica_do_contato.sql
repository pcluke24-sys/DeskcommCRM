-- A exclusao de um contato com job de follow-up falhava no CASCADE:
-- `trg_followup_generation_job` via auth.uid() e recusava o DELETE interno
-- como se o operador estivesse adulterando a fila diretamente. Pior: a rota
-- ja tinha apagado mensagens e conversas em requisicoes separadas quando a
-- ficha falhava, deixando a operacao pela metade.
--
-- A funcao abaixo e a unica porta atomica. Ela valida agent+ na propria
-- transacao, liga uma marca local que somente este SECURITY DEFINER pode usar,
-- remove historico e ficha no mesmo commit e deixa o CASCADE limpar a fila.
-- A protecao original continua recusando escrita direta em followup_turn.

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
 elsif auth.uid() is not null and ((tg_op<>'DELETE' and new.idempotency_key ~ ':[0-9]+$') or (tg_op<>'INSERT' and old.idempotency_key ~ ':[0-9]+$')) then
  raise exception 'followup_step_internal' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function public.fn_followup_generation_write() from public,anon,authenticated;

create or replace function public.fn_delete_contact_atomic(
  p_organization_id uuid,
  p_contact_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_deleted uuid;
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
  );
begin
  if v_jwt_role is distinct from 'service_role'
     and (auth.uid() is null or not public.fn_role_at_least(p_organization_id, 'agent')) then
    raise exception 'forbidden' using errcode='42501';
  end if;

  -- Marca LOCAL a esta transacao. O gatilho continua fechado em qualquer
  -- DELETE direto de job_queue feito pelo mesmo usuario.
  perform set_config('deskcomm.exclusao_contato', 'on', true);

  delete from public.messages
   where organization_id=p_organization_id and contact_id=p_contact_id;
  delete from public.conversations
   where organization_id=p_organization_id and contact_id=p_contact_id;
  delete from public.contacts
   where organization_id=p_organization_id and id=p_contact_id
   returning id into v_deleted;

  return v_deleted;
end;
$$;

revoke execute on function public.fn_delete_contact_atomic(uuid,uuid) from public,anon;
grant execute on function public.fn_delete_contact_atomic(uuid,uuid) to authenticated,service_role;
