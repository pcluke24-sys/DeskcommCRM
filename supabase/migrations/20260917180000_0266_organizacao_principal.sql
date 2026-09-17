-- Organização principal única da instalação; somente o dono pode configurar.
create table if not exists public.platform_primary_organization (
  id integer primary key default 1 check (id = 1),
  organization_id uuid references public.organizations(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.platform_primary_organization enable row level security;
revoke all on public.platform_primary_organization from public, anon, authenticated;
grant select on public.platform_primary_organization to service_role;
insert into public.platform_primary_organization(id) values(1) on conflict(id) do nothing;

create or replace function public.fn_set_primary_organization(p_org uuid, p_actor uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare prior uuid;
begin
  if not fn_tenant_deletion_owner(p_actor) then
    raise exception 'Somente o dono da instalação pode definir a organização principal.' using errcode='42501';
  end if;
  select organization_id into prior from platform_primary_organization where id=1 for update;
  perform 1 from organizations where id=p_org and status='active' for update;
  if not found then raise exception 'A organização principal precisa estar ativa.' using errcode='P0001'; end if;
  update platform_primary_organization set organization_id=p_org, updated_by=p_actor, updated_at=now() where id=1;
  if prior is distinct from p_org then
    insert into api_audit_log(actor_user_id,acting_as_platform_admin,action,resource_type,resource_id,request_id,bypassed_rls,metadata)
    values(p_actor,true,'platform.primary_organization_updated','organization',p_org,p_request_id,true,jsonb_build_object('previous_organization_id',prior,'organization_id',p_org));
  end if;
  return jsonb_build_object('primary_organization_id',p_org);
end;
$$;
revoke execute on function public.fn_set_primary_organization(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.fn_set_primary_organization(uuid,uuid,uuid) to service_role;

create or replace function public.fn_delete_suspended_tenant(
  p_org uuid, p_actor uuid, p_confirmation text, p_reason text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target organizations%rowtype;
  media_count integer;
  principal uuid;
begin
  if not fn_tenant_deletion_owner(p_actor) then
    raise exception 'Somente o dono da instalação pode excluir tenants.' using errcode = '42501';
  end if;
  select organization_id into principal from platform_primary_organization where id=1 for update;
  if principal is null then
    raise exception 'Defina sua organização principal antes de excluir tenants.' using errcode='P0001';
  end if;
  if principal = p_org then
    raise exception 'Não é permitido excluir a organização principal da instalação.' using errcode='P0001';
  end if;
  select * into target from organizations where id = p_org for update;
  if not found then raise exception 'Tenant não encontrado.' using errcode = 'P0002'; end if;
  if target.status <> 'suspended' then
    raise exception 'Suspenda o tenant antes de excluir.' using errcode = 'P0001';
  end if;
  if p_confirmation is distinct from target.slug or length(trim(coalesce(p_reason,''))) < 10
     or length(p_reason) > 500 then
    raise exception 'Confirme o identificador e informe o motivo da exclusão.' using errcode = '22023';
  end if;
  -- Não deixa conexões remotas órfãs: primeiro encerrar pela tela de Conexões.
  if exists (select 1 from channel_sessions where organization_id = p_org)
     or exists (select 1 from calendar_connections where organization_id = p_org and status <> 'disconnected')
     or exists (select 1 from tenant_integrations where organization_id = p_org and status <> 'disconnected') then
    raise exception 'Remova as sessões de WhatsApp e desconecte as integrações antes de excluir.' using errcode = 'P0001';
  end if;
  -- Só arquivos no prefixo UUID exato. Nunca platform/, usuários ou outros tenants.
  insert into platform_tenant_deletion_storage (deleted_organization_id, bucket, object_path)
    select p_org, bucket_id, name from storage.objects
    where starts_with(name, p_org::text || '/')
    on conflict (bucket, object_path) do update set
      status = 'pending', attempts = 0, error_message = null, processed_at = null;
  get diagnostics media_count = row_count;
  delete from organizations where id = p_org and status = 'suspended';
  -- Sobrevive ao cascade; não apaga contas Auth que podem participar de outros tenants.
  insert into api_audit_log (
    actor_user_id, acting_as_platform_admin, action, resource_type, resource_id,
    request_id, bypassed_rls, metadata
  ) values (
    p_actor, true, 'tenant.deleted', 'organization', p_org, p_request_id, true,
    jsonb_build_object('tenant_id', p_org, 'tenant_slug', target.slug,
      'reason', p_reason, 'storage_pending', media_count)
  );
  return jsonb_build_object('id', p_org, 'storage_pending', media_count);
end;
$$;
revoke execute on function public.fn_delete_suspended_tenant(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.fn_delete_suspended_tenant(uuid,uuid,text,text,uuid) to service_role;
notify pgrst, 'reload schema';

