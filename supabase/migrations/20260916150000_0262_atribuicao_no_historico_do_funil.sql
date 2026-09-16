-- Histórico prospectivo por origem. Não cria nem reinterpreta entradas antigas.
create or replace function public.fn_funnel_attribution_history(
  p_org uuid,
  p_pipeline uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_group_by text
)
returns jsonb language sql stable security invoker set search_path = public as $$
  with entries as materialized (
    select e.lead_id, e.stage_id,
      case p_group_by
        when 'utm_source' then coalesce(nullif(l.source_metadata->>'utm_source', ''), 'sem_utm_source')
        when 'utm_campaign' then coalesce(nullif(l.source_metadata->>'utm_campaign', ''), 'sem_utm_campaign')
        when 'ad_reference' then coalesce(nullif(l.source_metadata->>'ad_source_id', ''), 'sem_referencia_de_anuncio')
        else coalesce(nullif(l.source, ''), 'sem_origem')
      end as group_key,
      nullif(l.source_metadata->>'ad_title', '') as ad_title
    from public.crm_funnel_entries e
    join public.crm_leads l on l.id = e.lead_id and l.organization_id = e.organization_id
    where e.organization_id = p_org and e.pipeline_id = p_pipeline
      and e.entered_at >= p_from and e.entered_at < p_to and e.kind <> 'outcome'
  ), stages as (
    select s.id, s.name, s.position, s.is_won, s.is_lost
    from public.crm_stages s
    where s.organization_id = p_org and s.pipeline_id = p_pipeline
      and (not s.is_archived or exists (select 1 from entries e where e.stage_id = s.id))
  ), counts as (
    select e.group_key, max(e.ad_title) as ad_title, e.stage_id, count(distinct e.lead_id) as leads
    from entries e group by e.group_key, e.stage_id
  ), groups as (
    select group_key, max(ad_title) as ad_title,
      jsonb_object_agg(stage_id::text, leads) as stage_counts
    from counts group by group_key
  )
  select jsonb_build_object(
    'enabled_since', (select enabled_since from public.crm_funnel_tracking where organization_id = p_org),
    'group_by', p_group_by,
    'stages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'is_won', is_won, 'is_lost', is_lost
    ) order by position, id) from stages), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
      'key', group_key, 'ad_title', ad_title, 'stage_counts', stage_counts
    ) order by group_key) from groups), '[]'::jsonb)
  );
$$;
revoke execute on function public.fn_funnel_attribution_history(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.fn_funnel_attribution_history(uuid, uuid, timestamptz, timestamptz, text) to authenticated, service_role;
notify pgrst, 'reload schema';
