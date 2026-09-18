-- Histórico prospectivo: nenhuma leitura/backfill das etapas antigas.
-- Fork 9001 (antigo 0261): timestamp e SQL preservados para instalações existentes.
create table if not exists public.crm_funnel_tracking (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled_since timestamptz not null default now()
);
create table if not exists public.crm_funnel_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete cascade,
  stage_id uuid not null references public.crm_stages(id) on delete cascade,
  kind text not null check (kind in ('created', 'stage', 'outcome')),
  status text not null,
  entered_at timestamptz not null default clock_timestamp()
);
create index if not exists crm_funnel_entries_period_idx
  on public.crm_funnel_entries (organization_id, pipeline_id, entered_at);
create index if not exists crm_funnel_entries_lead_idx
  on public.crm_funnel_entries (organization_id, lead_id, stage_id, entered_at);
alter table public.crm_funnel_tracking enable row level security;
alter table public.crm_funnel_entries enable row level security;
drop policy if exists crm_funnel_tracking_select on public.crm_funnel_tracking;
create policy crm_funnel_tracking_select on public.crm_funnel_tracking for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists crm_funnel_entries_select on public.crm_funnel_entries;
create policy crm_funnel_entries_select on public.crm_funnel_entries for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()) and exists (
    select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = crm_funnel_entries.organization_id
  ));
revoke all on public.crm_funnel_tracking, public.crm_funnel_entries from public, anon, authenticated, service_role;
grant select on public.crm_funnel_tracking, public.crm_funnel_entries to authenticated, service_role;
-- Só grava o início da coleta; não cria entradas para leads existentes.
insert into public.crm_funnel_tracking (organization_id)
  select id from public.organizations on conflict do nothing;

create or replace function public.fn_record_funnel_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if tg_op = 'INSERT' then v_kind := 'created';
  elsif new.stage_id is distinct from old.stage_id or new.pipeline_id is distinct from old.pipeline_id then v_kind := 'stage';
  elsif new.status is distinct from old.status then v_kind := 'outcome';
  else return new;
  end if;
  if not exists (select 1 from public.crm_stages s where s.id = new.stage_id
      and s.organization_id = new.organization_id and s.pipeline_id = new.pipeline_id) then
    return new;
  end if;
  insert into public.crm_funnel_tracking (organization_id) values (new.organization_id) on conflict do nothing;
  insert into public.crm_funnel_entries (organization_id, lead_id, pipeline_id, stage_id, kind, status)
    values (new.organization_id, new.id, new.pipeline_id, new.stage_id, v_kind, new.status);
  return new;
end;
$$;
revoke execute on function public.fn_record_funnel_entry() from public, anon, authenticated, service_role;
drop trigger if exists crm_record_funnel_entry on public.crm_leads;
create trigger crm_record_funnel_entry after insert or update of stage_id, pipeline_id, status
  on public.crm_leads for each row execute function public.fn_record_funnel_entry();

create or replace function public.fn_funnel_history(p_org uuid, p_pipeline uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = public as $$
  with entries as materialized (
    select e.* from public.crm_funnel_entries e
    join public.crm_leads l on l.id = e.lead_id and l.organization_id = e.organization_id
    where e.organization_id = p_org and e.pipeline_id = p_pipeline
      and e.entered_at >= p_from and e.entered_at < p_to
  ), visits as materialized (select * from entries where kind <> 'outcome'),
  stages as (
    select s.id, s.name, s.position, s.is_won, s.is_lost,
      (select n.id from public.crm_stages n where n.organization_id = p_org
       and n.pipeline_id = p_pipeline and not n.is_lost and not n.is_archived
       and n.position > s.position order by n.position, n.id limit 1) as next_stage_id
    from public.crm_stages s where s.organization_id = p_org and s.pipeline_id = p_pipeline
      and (not s.is_archived or exists (select 1 from visits v where v.stage_id = s.id))
  ), counts as (
    select s.*, (select count(distinct v.lead_id) from visits v where v.stage_id = s.id) as leads,
      (select count(*) from visits v where v.stage_id = s.id) as entries,
      case when s.is_lost or s.is_won or s.next_stage_id is null then null else
        (select count(distinct v.lead_id) from visits v where v.stage_id = s.id and exists (
          select 1 from visits n where n.lead_id = v.lead_id and n.stage_id = s.next_stage_id
            and n.entered_at > v.entered_at
        )) end as advanced
    from stages s
  )
  select jsonb_build_object(
    'enabled_since', (select enabled_since from public.crm_funnel_tracking where organization_id = p_org),
    'totals', jsonb_build_object(
      'leads', (select count(distinct lead_id) from entries),
      'received', (select count(distinct lead_id) from entries where kind = 'created'),
      'won', (select count(distinct lead_id) from entries where status = 'won'),
      'lost', (select count(distinct lead_id) from entries where status = 'lost')
    ),
    'stages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'leads', leads, 'entries', entries,
      'is_won', is_won, 'is_lost', is_lost, 'next_stage_id', next_stage_id, 'advanced', advanced,
      'advance_rate', case when leads > 0 and advanced is not null then round(100.0 * advanced / leads, 1) else null end
    ) order by position, id) from counts), '[]'::jsonb)
  );
$$;
revoke execute on function public.fn_funnel_history(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.fn_funnel_history(uuid, uuid, timestamptz, timestamptz) to authenticated, service_role;
notify pgrst, 'reload schema';
