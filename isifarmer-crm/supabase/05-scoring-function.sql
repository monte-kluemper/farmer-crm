-- ============================================================
-- Lead scoring function (MVP)
-- Weights:
-- - Cuisine fit: 35
-- - Price architecture: 30
-- - Menu structure / plating: 20
-- - Off-menu / chef discretion: 10
-- - Sustainability language: 5
-- - Proximity: low weight handled as feasibility elsewhere (0 here)
-- ============================================================

create or replace function public.compute_restaurant_lead_score(p_restaurant_id uuid)
returns table (
  lead_score int,
  lead_score_explanation text,
  factor_breakdown jsonb
)
language plpgsql
stable
as $$
declare
  r public.restaurants%rowtype;
  norms jsonb;

  cuisine_points int := 0;
  price_points int := 0;
  plating_points int := 0;
  offmenu_points int := 0;
  sust_points int := 0;

  daily numeric;
  tasting numeric;
  main numeric;

  daily_good numeric := 28;
  daily_high numeric := 35;
  tasting_good numeric := 55;
  tasting_high numeric := 70;

  plating text;
  expl text := '';
begin
  select * into r
  from public.restaurants
  where id = p_restaurant_id;

  if not found then
    return;
  end if;

  -- City norms (fallbacks exist if not set)
  select coalesce(c.scoring_norms, '{}'::jsonb) into norms
  from public.cities c
  where c.id = r.city_id;

  daily_good   := coalesce(nullif((norms->>'daily_menu_good_min')::numeric, null), daily_good);
  daily_high   := coalesce(nullif((norms->>'daily_menu_high_min')::numeric, null), daily_high);
  tasting_good := coalesce(nullif((norms->>'tasting_menu_good_min')::numeric, null), tasting_good);
  tasting_high := coalesce(nullif((norms->>'tasting_menu_high_min')::numeric, null), tasting_high);

  -- 1) Cuisine fit (max 35)
  if r.cuisine_fit = 'high' then
    cuisine_points := 35;
  elsif r.cuisine_fit = 'medium' then
    cuisine_points := 22;
  else
    cuisine_points := 8;
  end if;

  -- 2) Price architecture (max 30)
  daily   := nullif((r.price_architecture->>'daily_menu_eur')::numeric, null);
  tasting := nullif((r.price_architecture->>'tasting_menu_eur')::numeric, null);
  main    := nullif((r.price_architecture->>'ala_carte_main_eur')::numeric, null);

  -- Score from strongest available signal
  if tasting is not null then
    if tasting >= tasting_high then price_points := 30;
    elsif tasting >= tasting_good then price_points := 24;
    else price_points := 10;
    end if;
  elsif daily is not null then
    if daily >= daily_high then price_points := 26;
    elsif daily >= daily_good then price_points := 20;
    else price_points := 8;
    end if;
  elsif main is not null then
    if main >= 28 then price_points := 22;
    elsif main >= 22 then price_points := 16;
    else price_points := 8;
    end if;
  else
    price_points := 12; -- unknown; keep neutral-ish
  end if;

  -- 3) Menu structure / plating intensity (max 20)
  plating := coalesce(r.menu_signals->>'plating_intensity', 'unknown');
  if plating in ('high','very_high') then
    plating_points := 20;
  elsif plating = 'medium' then
    plating_points := 12;
  elsif plating = 'low' then
    plating_points := 6;
  else
    plating_points := 10; -- unknown neutral
  end if;

  -- 4) Off-menu / chef discretion (max 10)
  offmenu_points :=
    (case when coalesce((r.off_menu_signals->>'chef_selection_language')::boolean, false) then 3 else 0 end) +
    (case when coalesce((r.off_menu_signals->>'market_driven')::boolean, false) then 3 else 0 end) +
    (case when coalesce((r.off_menu_signals->>'seasonal_variation')::boolean, false) then 2 else 0 end) +
    (case when coalesce((r.off_menu_signals->>'frequent_specials')::boolean, false) then 2 else 0 end);

  if offmenu_points > 10 then offmenu_points := 10; end if;

  -- 5) Sustainability / local sourcing language (max 5)
  sust_points :=
    (case when coalesce((r.sustainability_signals->>'km0')::boolean, false) then 2 else 0 end) +
    (case when coalesce((r.sustainability_signals->>'seasonal')::boolean, false) then 2 else 0 end) +
    (case when coalesce((r.sustainability_signals->>'local')::boolean, false) then 1 else 0 end);

  if sust_points > 5 then sust_points := 5; end if;

  -- Explanation (short, user-facing)
  expl := '';
  if r.cuisine_fit = 'high' then
    expl := expl || 'Strong cuisine fit. ';
  elsif r.cuisine_fit = 'medium' then
    expl := expl || 'Moderate cuisine fit. ';
  else
    expl := expl || 'Weaker cuisine fit. ';
  end if;

  if tasting is not null then
    expl := expl || format('Tasting menu ~€%s. ', tasting);
  elsif daily is not null then
    expl := expl || format('Daily menu ~€%s. ', daily);
  elsif main is not null then
    expl := expl || format('Mains ~€%s. ', main);
  else
    expl := expl || 'Price point unknown. ';
  end if;

  if plating in ('high','very_high') then
    expl := expl || 'High plating intensity. ';
  elsif plating = 'medium' then
    expl := expl || 'Medium plating intensity. ';
  end if;

  if offmenu_points >= 6 then
    expl := expl || 'Strong off-menu/chef discretion signals. ';
  elsif offmenu_points >= 3 then
    expl := expl || 'Some off-menu/chef discretion signals. ';
  end if;

  if sust_points >= 3 then
    expl := expl || 'Local/seasonal language present.';
  end if;

  lead_score := cuisine_points + price_points + plating_points + offmenu_points + sust_points;
  if lead_score > 100 then lead_score := 100; end if;
  if lead_score < 0 then lead_score := 0; end if;

  lead_score_explanation := trim(expl);

  factor_breakdown := jsonb_build_object(
    'cuisine_points', cuisine_points,
    'price_points', price_points,
    'plating_points', plating_points,
    'offmenu_points', offmenu_points,
    'sustainability_points', sust_points,
    'norms', jsonb_build_object(
      'daily_menu_good_min', daily_good,
      'daily_menu_high_min', daily_high,
      'tasting_menu_good_min', tasting_good,
      'tasting_menu_high_min', tasting_high
    )
  );

  return next;
end $$;


create or replace function public.trg_set_lead_score()
returns trigger
language plpgsql
as $$
declare
  res record;
begin
  select * into res
  from public.compute_restaurant_lead_score(new.id);

  if found then
    new.lead_score := res.lead_score;
    new.lead_score_explanation := res.lead_score_explanation;
  end if;

  return new;
end $$;



-- ============================================================
-- Lead scoring Trigger
-- ============================================================

drop trigger if exists trg_restaurants_lead_score on public.restaurants;
create trigger trg_restaurants_lead_score
before insert or update of
  cuisine_fit,
  city_id,
  price_architecture,
  menu_signals,
  off_menu_signals,
  sustainability_signals
on public.restaurants
for each row
execute function public.trg_set_lead_score();
