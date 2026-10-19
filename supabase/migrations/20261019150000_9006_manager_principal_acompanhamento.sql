-- manifest: Managers da Principal acompanham clientes apenas em leitura; revogação revalidada em cada contexto.

-- Apenas o backend e as funções definer consultam esta autoridade transversal.
create or replace function public.fn_manager_principal(p_actor uuid)
returns boolean language sql stable security definer set search_path = public as $f$
 select exists (
   select 1 from public.platform_primary_organization p
   join public.user_organizations u on u.organization_id=p.organization_id
   join public.organizations o on o.id=u.organization_id
   where p.id=1 and u.user_id=p_actor and u.role='manager'
     and u.revoked_at is null and u.accepted_at is not null and o.status='active'
 );
$f$;
revoke all on function public.fn_manager_principal(uuid) from public,anon,authenticated;
grant execute on function public.fn_manager_principal(uuid) to service_role;

create or replace function public.fn_start_support(p_actor uuid, p_session uuid, p_org uuid, p_previous uuid, p_mode text default 'full', p_ttl integer default 3600)
returns uuid language plpgsql security definer set search_path = public as $f$
declare v_id uuid; v_scope text; v_manager boolean;
begin
 perform 1 from auth.sessions where id=p_session and user_id=p_actor and (not_after is null or not_after>now()) for update;
 if not found then raise exception 'support_session_invalid'; end if;
 select scope into v_scope from public.platform_admins p where user_id=p_actor and revoked_at is null
 and (not (p.mfa_required or exists(select 1 from auth.mfa_factors f where f.user_id=p_actor and f.status='verified'))
 or exists(select 1 from auth.sessions a where a.id=p_session and a.aal='aal2'));
 v_manager := public.fn_manager_principal(p_actor)
   and p_mode='support_readonly'
   and exists(select 1 from public.platform_primary_organization where id=1 and organization_id=p_previous and organization_id<>p_org)
   and (not exists(select 1 from auth.mfa_factors f where f.user_id=p_actor and f.status='verified')
        or exists(select 1 from auth.sessions a where a.id=p_session and a.aal='aal2'));
 if v_scope is null and not v_manager then raise exception 'support_authority_required'; end if;
 if p_mode is null or p_mode not in ('full','support_readonly') or p_ttl is null or p_ttl<1 then raise exception 'support_invalid_input'; end if;
 if not exists(select 1 from organizations where id=p_org and status='active') then raise exception 'support_target_unavailable'; end if;
 if exists(select 1 from platform_support_sessions where auth_session_id=p_session and ended_at is null) then raise exception 'support_exit_required'; end if;
 if p_previous is not null and not exists(select 1 from user_organizations where user_id=p_actor and organization_id=p_previous and revoked_at is null) then raise exception 'support_previous_invalid'; end if;
 insert into platform_support_sessions(organization_id,actor_user_id,auth_session_id,access_mode,previous_organization_id,expires_at)
 values(p_org,p_actor,p_session,case when v_scope='full' then p_mode else 'support_readonly' end,p_previous,now()+make_interval(secs=>least(p_ttl,3600))) returning id into v_id;
 return v_id;
end $f$;
revoke all on function public.fn_start_support(uuid,uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.fn_start_support(uuid,uuid,uuid,uuid,text,integer) to service_role;

create or replace function public.fn_support_context()
returns jsonb language sql stable security definer set search_path = public as $f$
 select jsonb_build_object('id', s.id, 'organization_id', s.organization_id,
 'actor_user_id', s.actor_user_id, 'auth_session_id', s.auth_session_id,
 'previous_organization_id', s.previous_organization_id, 'expires_at', s.expires_at,
 'name', o.display_name, 'locale', o.locale, 'actor_is_platform_admin', p.user_id is not null,
 'access_mode', case when s.access_mode='full' and p.scope='full' then 'full' else 'support_readonly' end,
 'status', case when s.expires_at<=now() then 'expired'
 when (p.user_id is null and not (
   s.access_mode='support_readonly' and public.fn_manager_principal(s.actor_user_id)
   and exists(select 1 from public.platform_primary_organization x where x.id=1 and x.organization_id=s.previous_organization_id and x.organization_id<>s.organization_id)
 )) or a.id is null or (a.not_after is not null and a.not_after<=now()) or o.status<>'active' then 'revoked'
 when (coalesce(p.mfa_required,false) or exists(select 1 from auth.mfa_factors f where f.user_id=s.actor_user_id and f.status='verified'))
 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then 'revoked'
 else 'active' end)
 from public.platform_support_sessions s
 join public.organizations o on o.id=s.organization_id
 left join public.platform_admins p on p.user_id=s.actor_user_id and p.revoked_at is null
 left join auth.sessions a on a.id=s.auth_session_id and a.user_id=s.actor_user_id
 where s.actor_user_id=auth.uid()
 and s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and s.ended_at is null
 limit 1;
$f$;
revoke all on function public.fn_support_context() from public,anon;
grant execute on function public.fn_support_context() to authenticated,service_role;
