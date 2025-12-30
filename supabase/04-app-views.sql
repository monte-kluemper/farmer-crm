-- ============================================================
-- Views: dashboards for Isifarmer Chef CRM (MVP)
-- - v_hot_leads: best prospects to work next
-- - v_next_actions: upcoming tasks/activities due
-- - v_at_risk_customers: recurring customers showing risk signals
--
-- Notes:
-- - These views are "tenant-safe" by filtering on farm_id in
--   current_user_farm_ids() (works with RLS + avoids cross-tenant leaks).
-- - You can extend fields later without breaking consumers.
-- ============================================================

-- ------------------------------------------------------------
-- v_hot_leads
-- ------------------------------------------------------------
create or replace view public.v_hot_leads
as
select
  r.farm_id,
  r.id              as restaurant_id,
  r.name            as restaurant_name,
  c.name            as city_name,
  n.name            as neighborhood_name,
  r.stage,
  r.lead_score,
  r.lead_score_explanation,
  r.cuisine_types,
  r.cuisine_fit,
  r.service_style,
  r.source_url,
  r.website_url,
  r.instagram_url,
  r.reservation_url,
  -- simple “next touch” signal: earliest open activity due (if any)
  (
    select min(a.due_at)
    from public.activities a
    where a.restaurant_id = r.id
      and a.completed_at is null
  ) as next_due_at,
  -- last activity timestamp (any type)
  (
    select max(coalesce(a.completed_at, a.created_at))
    from public.activities a
    where a.restaurant_id = r.id
  ) as last_activity_at,
  r.created_at,
  r.updated_at
from public.restaurants r
left join public.cities c on c.id = r.city_id
left join public.neighborhoods n on n.id = r.neighborhood_id
where
  r.farm_id in (select farm_id from public.current_user_farm_ids())
  and r.stage in ('identified','contacted','visit_tasting','trial_order')
order by
  r.lead_score desc,
  next_due_at asc nulls last,
  r.updated_at desc;

-- ------------------------------------------------------------
-- v_next_actions
-- ------------------------------------------------------------
create or replace view public.v_next_actions
as
select
  a.farm_id,
  a.id              as activity_id,
  a.type            as activity_type,
  a.title,
  a.details,
  a.due_at,
  a.created_at,
  a.restaurant_id,
  r.name            as restaurant_name,
  r.stage           as restaurant_stage,
  c.name            as city_name,
  n.name            as neighborhood_name,
  -- optional: latest linked visit (if any)
  a.visit_id
from public.activities a
join public.restaurants r on r.id = a.restaurant_id
left join public.cities c on c.id = r.city_id
left join public.neighborhoods n on n.id = r.neighborhood_id
where
  a.farm_id in (select farm_id from public.current_user_farm_ids())
  and a.completed_at is null
  and (a.due_at is not null) -- MVP: focus on due-dated actions
order by
  a.due_at asc,
  a.created_at asc;

-- ------------------------------------------------------------
-- v_at_risk_customers
--
-- Heuristic risk model (MVP, explainable):
-- - Only considers stage = recurring_customer
-- - "Days since last order" (primary signal)
-- - "Open issues/negative feedback in last 60 days" (secondary)
-- - "No upcoming scheduled action" (nudges farmer to act)
-- ------------------------------------------------------------
create or replace view public.v_at_risk_customers
as
with last_orders as (
  select
    o.farm_id,
    o.restaurant_id,
    max(o.order_date) as last_order_date
  from public.orders o
  where o.farm_id in (select farm_id from public.current_user_farm_ids())
  group by o.farm_id, o.restaurant_id
),
recent_negative_feedback as (
  select
    f.farm_id,
    f.restaurant_id,
    count(*) filter (where lower(coalesce(f.sentiment,'')) = 'negative' or (f.rating is not null and f.rating <= 2)) as neg_count_60d,
    count(*) filter (where f.issues is not null and jsonb_array_length(f.issues) > 0) as issues_count_60d
  from public.customer_feedback f
  where
    f.farm_id in (select farm_id from public.current_user_farm_ids())
    and f.created_at >= now() - interval '60 days'
  group by f.farm_id, f.restaurant_id
),
has_upcoming_action as (
  select
    a.farm_id,
    a.restaurant_id,
    min(a.due_at) as next_due_at
  from public.activities a
  where
    a.farm_id in (select farm_id from public.current_user_farm_ids())
    and a.completed_at is null
    and a.due_at is not null
  group by a.farm_id, a.restaurant_id
)
select
  r.farm_id,
  r.id as restaurant_id,
  r.name as restaurant_name,
  c.name as city_name,
  n.name as neighborhood_name,
  r.stage,
  lo.last_order_date,
  -- days since last order
  case
    when lo.last_order_date is null then null
    else (now()::date - lo.last_order_date)
  end as days_since_last_order,
  coalesce(rnf.neg_count_60d, 0) as negative_feedback_last_60d,
  coalesce(rnf.issues_count_60d, 0) as issues_last_60d,
  hua.next_due_at,
  -- simple risk score (0–100) — tweak later
  greatest(
    0,
    least(
      100,
      -- baseline from days since last order (cap at 70)
      coalesce(least(((now()::date - lo.last_order_date) * 2), 70), 40)
      + (coalesce(rnf.neg_count_60d, 0) * 10)
      + (coalesce(rnf.issues_count_60d, 0) * 5)
      + (case when hua.next_due_at is null then 10 else 0 end)
    )
  )::int as risk_score,
  -- explanation string (MVP)
  trim(both ' ' from
    concat(
      case when lo.last_order_date is null then 'No orders recorded. ' else '' end,
      case when lo.last_order_date is not null and (now()::date - lo.last_order_date) >= 14 then 'No order in 14+ days. ' else '' end,
      case when coalesce(rnf.neg_count_60d, 0) > 0 then 'Recent negative feedback. ' else '' end,
      case when coalesce(rnf.issues_count_60d, 0) > 0 then 'Recent issues logged. ' else '' end,
      case when hua.next_due_at is null then 'No upcoming follow-up scheduled.' else '' end
    )
  ) as risk_explanation,
  r.updated_at
from public.restaurants r
left join public.cities c on c.id = r.city_id
left join public.neighborhoods n on n.id = r.neighborhood_id
left join last_orders lo
  on lo.farm_id = r.farm_id and lo.restaurant_id = r.id
left join recent_negative_feedback rnf
  on rnf.farm_id = r.farm_id and rnf.restaurant_id = r.id
left join has_upcoming_action hua
  on hua.farm_id = r.farm_id and hua.restaurant_id = r.id
where
  r.farm_id in (select farm_id from public.current_user_farm_ids())
  and r.stage = 'recurring_customer'
order by
  risk_score desc,
  days_since_last_order desc nulls last,
  r.updated_at desc;

-- ------------------------------------------------------------
-- Optional: v_restaurant_snapshot (handy for profile pages)
-- - latest menu
-- - last visit
-- - last order
-- ------------------------------------------------------------
create or replace view public.v_restaurant_snapshot
as
with latest_menu as (
  select distinct on (m.restaurant_id)
    m.restaurant_id,
    m.id as menu_id,
    m.created_at as menu_created_at,
    m.source_url as menu_source_url,
    m.ai_confidence as menu_ai_confidence
  from public.menus m
  where m.farm_id in (select farm_id from public.current_user_farm_ids())
  order by m.restaurant_id, m.created_at desc
),
latest_visit as (
  select distinct on (v.restaurant_id)
    v.restaurant_id,
    v.id as visit_id,
    coalesce(v.occurred_at, v.planned_at) as visit_time,
    v.outcome as visit_outcome
  from public.visits v
  where v.farm_id in (select farm_id from public.current_user_farm_ids())
  order by v.restaurant_id, coalesce(v.occurred_at, v.planned_at) desc nulls last, v.created_at desc
),
latest_order as (
  select distinct on (o.restaurant_id)
    o.restaurant_id,
    o.id as order_id,
    o.order_date,
    o.status,
    o.total_amount,
    o.currency_code
  from public.orders o
  where o.farm_id in (select farm_id from public.current_user_farm_ids())
  order by o.restaurant_id, o.order_date desc, o.created_at desc
)
select
  r.farm_id,
  r.id as restaurant_id,
  r.name as restaurant_name,
  r.stage,
  r.lead_score,
  r.lead_score_explanation,
  c.name as city_name,
  n.name as neighborhood_name,
  lm.menu_id,
  lm.menu_created_at,
  lm.menu_source_url,
  lv.visit_id,
  lv.visit_time,
  lv.visit_outcome,
  lo.order_id,
  lo.order_date,
  lo.status as order_status,
  lo.total_amount,
  lo.currency_code,
  r.updated_at
from public.restaurants r
left join public.cities c on c.id = r.city_id
left join public.neighborhoods n on n.id = r.neighborhood_id
left join latest_menu lm on lm.restaurant_id = r.id
left join latest_visit lv on lv.restaurant_id = r.id
left join latest_order lo on lo.restaurant_id = r.id
where
  r.farm_id in (select farm_id from public.current_user_farm_ids());
