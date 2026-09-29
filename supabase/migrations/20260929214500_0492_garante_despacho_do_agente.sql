-- 0492 — uma mensagem de entrada não pode existir sem a chance de resposta.
--
-- O INSERT da mensagem e o evento do agente são duas escritas. Antes, se a
-- segunda falhasse, a primeira ficava gravada; a reentrega encontrava 23505 e
-- deliberadamente não despachava de novo. Resultado: Inbox atualizada, agente
-- mudo, e o follow-up (pipeline separado) aparecendo minutos depois.
--
-- Esta função transforma o despacho em ENSURE idempotente. A trava transacional
-- fecha a corrida entre duas reentregas, e a própria mensagem fornece todos os
-- ids do payload — o chamador não pode misturar contato/conversa/sessão.

create or replace function public.fn_garantir_despacho_agente(
  p_organization_id uuid,
  p_message_id uuid,
  p_source text,
  p_request_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_message public.messages%rowtype;
  v_event_id uuid;
begin
  if p_organization_id is null or p_message_id is null then
    raise exception 'dispatch_requires_org_and_message' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_message_id::text, 0));

  select * into v_message
    from public.messages
   where organization_id = p_organization_id
     and id = p_message_id
     and direction = 'inbound';
  if not found then
    raise exception 'inbound_message_not_found_for_org' using errcode = 'P0001';
  end if;

  select id into v_event_id
    from public.event_log
   where organization_id = p_organization_id
     and event_type = 'ai_agent.dispatch_requested'
     and entity_kind = 'message'
     and entity_id = p_message_id
   order by created_at asc, id asc
   limit 1;

  if v_event_id is null then
    insert into public.event_log
      (organization_id, event_type, entity_kind, entity_id, payload, metadata)
    values (
      p_organization_id,
      'ai_agent.dispatch_requested',
      'message',
      p_message_id,
      jsonb_build_object(
        'organization_id', p_organization_id,
        'conversation_id', v_message.conversation_id,
        'contact_id', v_message.contact_id,
        'channel_session_id', v_message.channel_session_id,
        'inbound_message_id', p_message_id
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'source', coalesce(nullif(p_source, ''), 'inbound_webhook'),
        'request_id', p_request_id,
        'emitted_at', extract(epoch from now())
      ))
    ) returning id into v_event_id;
  end if;

  return v_event_id;
end
$function$;

revoke all on function public.fn_garantir_despacho_agente(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_garantir_despacho_agente(uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
