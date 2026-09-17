-- Exclusão exclusivamente pelo dono original da instalação; transacional.
create table if not exists public.platform_tenant_deletion_storage (
  id uuid primary key default gen_random_uuid(),
  deleted_organization_id uuid not null,
  bucket text not null,
  object_path text not null,
  status text not null default 'pending' check (status in ('pending','deleted','failed')),
  attempts integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (bucket, object_path),
  check (starts_with(object_path, deleted_organization_id::text || '/'))
);
-- Fila da plataforma: propositalmente SEM FK para sobreviver ao DELETE do tenant.
alter table public.platform_tenant_deletion_storage enable row level security;
revoke all on public.platform_tenant_deletion_storage from public, anon, authenticated;
grant select, insert, update, delete on public.platform_tenant_deletion_storage to service_role;

create or replace function public.fn_tenant_deletion_owner(p_actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform_admins
    where user_id = p_actor and revoked_at is null and scope = 'full'
      and user_id = (
        select user_id from platform_admins where granted_by = user_id and scope = 'full'
        order by granted_at, user_id limit 1
      )
  );
$$;
revoke execute on function public.fn_tenant_deletion_owner(uuid) from public, anon, authenticated;
grant execute on function public.fn_tenant_deletion_owner(uuid) to service_role;

create or replace function public.fn_delete_suspended_tenant(
  p_org uuid, p_actor uuid, p_confirmation text, p_reason text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target organizations%rowtype;
  media_count integer;
begin
  if not fn_tenant_deletion_owner(p_actor) then
    raise exception 'Somente o dono da instalação pode excluir tenants.' using errcode = '42501';
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
  if exists (select 1 from user_organizations where organization_id = p_org and user_id = p_actor) then
    raise exception 'Não é permitido excluir sua própria organização.' using errcode = 'P0001';
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

