-- manifest: Calcula o escopo de leitura por consulta e consolida os badges do Inbox sem contornar RLS.

-- Sem parâmetros de identidade: usa os mesmos helpers canônicos do predicado
-- anterior, mas resolve cada organização uma vez, em vez de uma vez por linha.
create or replace function public.fn_conversation_read_scopes()
returns table (organization_id uuid, visibility text)
language sql stable security definer
set search_path = public
as $$
  with orgs as materialized (
    select distinct x as id from public.fn_user_org_ids() x
  ), roles as materialized (
    select o.id, public.fn_user_role_in_org(o.id) as role,
      coalesce(g.settings->>'visibility_mode', 'own_and_unassigned') as mode
    from orgs o join public.organizations g on g.id = o.id
  )
  select r.id, case
    when r.role in ('viewer', 'manager', 'admin') then 'all'
    when r.role = 'agent' and r.mode = 'all' then 'all'
    when r.role = 'agent' and r.mode = 'own_and_unassigned' then 'own_and_unassigned'
    else 'own'
  end
  from roles r where r.role is not null;
$$;
revoke all on function public.fn_conversation_read_scopes() from public, anon;
grant execute on function public.fn_conversation_read_scopes() to authenticated, service_role;

-- Subconsultas NÃO correlacionadas: o planner materializa os conjuntos por
-- statement. Nada fica em cache entre requisições, usuários ou revogações.
-- Não altera as políticas de escrita nem as guardas de suporte existentes.
alter policy conversations_select on public.conversations using (
  (select public.fn_is_platform_admin())
  or organization_id in (
    select s.organization_id from public.fn_conversation_read_scopes() s where s.visibility = 'all'
  )
  or (assigned_to_user_id = (select auth.uid()) and organization_id in (
    select s.organization_id from public.fn_conversation_read_scopes() s
    where s.visibility in ('own', 'own_and_unassigned')
  ))
  or (assigned_to_user_id is null and organization_id in (
    select s.organization_id from public.fn_conversation_read_scopes() s where s.visibility = 'own_and_unassigned'
  ))
);

-- SECURITY INVOKER é intencional: a consulta continua sob RLS do usuário.
-- Organização/canal e filtros não conferem autorização; apenas recortam o que
-- esse usuário já pode ler. Não recebe user_id e não usa service_role.
create or replace function public.fn_inbox_counts(
  p_organization_id uuid,
  p_channel_session_id uuid default null,
  p_unread boolean default false,
  p_tags text[] default '{}',
  p_tag_mode text default 'e',
  p_queue_commands text[] default array['aguardando'],
  p_terminal_statuses text[] default array['closed','archived'],
  p_excluded_channels uuid[] default '{}',
  p_excluded_contacts uuid[] default '{}'
)
returns jsonb
language sql stable security invoker
set search_path = public
as $$
  with eligible as materialized (
    select c.status, c.assigned_to_user_id, public.comando_da_conversa(c) as comando
    from public.conversations c
    where c.organization_id = p_organization_id
      and (p_channel_session_id is null or c.channel_session_id = p_channel_session_id)
      and (not p_unread or c.unread_count_for_assignee > 0)
      and (cardinality(p_excluded_channels) = 0 or c.channel_session_id <> all(p_excluded_channels))
      and (cardinality(p_excluded_contacts) = 0 or c.contact_id <> all(p_excluded_contacts))
      and (cardinality(p_tags) = 0 or case when p_tag_mode = 'ou' then
        coalesce(c.tags, '{}') && p_tags or coalesce(public.tags_do_contato(c), '{}') && p_tags
      else
        coalesce(c.tags, '{}') @> p_tags or coalesce(public.tags_do_contato(c), '{}') @> p_tags
      end)
  )
  select jsonb_build_object(
    'fila', count(*) filter (where comando = any(p_queue_commands)),
    'unassigned', count(*) filter (where comando = any(p_queue_commands)),
    'automatico', count(*) filter (where comando = 'automatico'),
    'mine', count(*) filter (where assigned_to_user_id = (select auth.uid()) and status <> all(p_terminal_statuses)),
    'all', count(*),
    'closed', count(*) filter (where status = 'closed'),
    'archived', count(*) filter (where status = 'archived')
  ) from eligible;
$$;
revoke all on function public.fn_inbox_counts(uuid,uuid,boolean,text[],text,text[],text[],uuid[],uuid[]) from public, anon;
grant execute on function public.fn_inbox_counts(uuid,uuid,boolean,text[],text,text[],text[],uuid[],uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
