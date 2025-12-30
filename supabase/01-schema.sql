-- =====================================================================
-- Isifarmer Chef CRM (Madrid-first, multi-city scalable)
-- Supabase Postgres schema + RLS (v0.1)
--
-- Assumptions:
-- - Supabase Auth enabled (auth.users)
-- - Multi-tenant via "farms" (a farm = a tenant/workspace)
-- - Users join farms via farm_memberships
-- - City/neighborhood data is configurable and reusable across farms
-- =====================================================================

-- Enable useful extensions (safe defaults)
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------
-- 1) Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.cuisine_fit_tier as enum ('high', 'medium', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_style as enum ('tasting', 'a_la_carte', 'casual', 'fine_dining', 'mixed', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pipeline_stage as enum ('identified', 'contacted', 'visit_tasting', 'trial_order', 'recurring_customer', 'dormant_lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_type as enum ('call', 'email', 'whatsapp', 'visit', 'tasting', 'delivery', 'note', 'task');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_confidence as enum ('high', 'medium', 'low', 'unknown');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2) Core tenant model: farms + memberships
-- ---------------------------------------------------------------------
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.farm_memberships (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member', -- 'owner' | 'member' (simple for MVP)
  created_at timestamptz not null default now(),
  unique (farm_id, user_id)
);

-- Helper: current user's farm_ids (for RLS policies)
create or replace function public.current_user_farm_ids()
returns table(farm_id uuid)
language sql
stable
as $$
  select fm.farm_id
  from public.farm_memberships fm
  where fm.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 3) Geography config: cities + neighborhoods (scalable beyond Madrid)
-- ---------------------------------------------------------------------
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null,         -- e.g., 'ES'
  name text not null,                    -- e.g., 'Madrid'
  timezone text not null default 'Europe/Madrid',
  currency_code char(3) not null default 'EUR',
  -- Optional: city-level norms for scoring (store as JSON for flexibility)
  scoring_norms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (country_code, name)
);

create table if not exists public.neighborhoods (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,                    -- e.g., 'Chamberí'
  slug text not null,                    -- e.g., 'chamberi'
  -- Optional geometry placeholders (keep MVP simple)
  centroid_lat double precision,
  centroid_lng double precision,
  created_at timestamptz not null default now(),
  unique (city_id, slug)
);

-- ---------------------------------------------------------------------
-- 4) Products catalog (per farm)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  category text not null,                -- 'microgreen' | 'mushroom' (free text MVP)
  name text not null,                    -- e.g., 'Pea shoots'
  description text,
  flavor_notes text,
  shelf_life_days int,
  lead_time_days int,
  packaging_options jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_farm on public.products(farm_id);

-- ---------------------------------------------------------------------
-- 5) Restaurants + contacts + menus (per farm)
-- ---------------------------------------------------------------------
create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,

  -- geography
  city_id uuid references public.cities(id) on delete set null,
  neighborhood_id uuid references public.neighborhoods(id) on delete set null,

  -- identity
  name text not null,
  address text,
  website_url text,
  instagram_url text,
  reservation_url text,

  -- classification
  cuisine_types text[] not null default '{}',
  cuisine_fit public.cuisine_fit_tier not null default 'medium',
  service_style public.service_style not null default 'unknown',

  -- pipeline
  stage public.pipeline_stage not null default 'identified',

  -- inferred economics / structure (AI-assisted)
  price_architecture jsonb not null default '{}'::jsonb,        -- e.g. {"tasting_menu_eur": 65, "daily_menu_eur": 34}
  menu_signals jsonb not null default '{}'::jsonb,             -- e.g. {"plating_intensity":"high","garnish_presence":true}
  off_menu_signals jsonb not null default '{}'::jsonb,         -- e.g. {"chef_selection_language":true,"market_driven":true}

  sustainability_signals jsonb not null default '{}'::jsonb,   -- e.g. {"km0":true,"seasonal":true,"snippets":[...]}

  -- AI provenance
  source_url text,
  ai_profile jsonb not null default '{}'::jsonb,               -- raw structured AI output
  ai_confidence public.ai_confidence not null default 'unknown',

  -- lead score
  lead_score int not null default 0 check (lead_score between 0 and 100),
  lead_score_explanation text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurants_farm on public.restaurants(farm_id);
create index if not exists idx_restaurants_city on public.restaurants(city_id);
create index if not exists idx_restaurants_stage on public.restaurants(stage);
create index if not exists idx_restaurants_lead_score on public.restaurants(lead_score desc);

-- auto-update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_restaurants_updated_at on public.restaurants;
create trigger trg_restaurants_updated_at
before update on public.restaurants
for each row execute function public.set_updated_at();

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  name text not null,
  role_title text,                       -- e.g., 'Chef', 'CDC', 'Purchasing'
  email citext,
  phone text,
  preferred_channel text,                -- 'whatsapp'|'email'|'phone' etc (free text MVP)
  notes text,

  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_restaurant on public.contacts(restaurant_id);
create index if not exists idx_contacts_farm on public.contacts(farm_id);

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  source_url text,
  raw_text text,                         -- extracted or pasted text
  parsed jsonb not null default '{}'::jsonb, -- structured extraction (dishes, ingredients, etc.)
  ai_confidence public.ai_confidence not null default 'unknown',
  created_at timestamptz not null default now()
);

create index if not exists idx_menus_restaurant on public.menus(restaurant_id);




-- ---------------------------------------------------------------------
-- 5.b) Cuisine
-- ---------------------------------------------------------------------


create table if not exists public.cuisine_taxonomy (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete cascade,
  name text not null,                         -- e.g. "Modern Italian"
  slug text not null,                         -- e.g. "modern-italian"
  fit_tier public.cuisine_fit_tier not null,  -- high | medium | low
  description text,
  signals jsonb not null default '{}'::jsonb, -- keywords, patterns, hints
  created_at timestamptz not null default now(),
  unique (city_id, slug)
);

alter table public.cuisine_taxonomy enable row level security;

create policy "cuisine_taxonomy_select_auth"
on public.cuisine_taxonomy for select
to authenticated
using (true);




-- ---------------------------------------------------------------------
-- 6) Visits + activities (pipeline execution)
-- ---------------------------------------------------------------------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,

  planned_at timestamptz,
  occurred_at timestamptz,

  -- AI outputs
  visit_brief jsonb not null default '{}'::jsonb,
  sample_kit jsonb not null default '{}'::jsonb,               -- recommended products, quantities, pairings
  follow_up_draft jsonb not null default '{}'::jsonb,          -- email/whatsapp drafts

  notes text,
  outcome text,                                                -- free text MVP
  created_at timestamptz not null default now()
);

create index if not exists idx_visits_restaurant on public.visits(restaurant_id);
create index if not exists idx_visits_farm on public.visits(farm_id);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,

  type public.activity_type not null,
  title text,
  details text,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_activities_restaurant on public.activities(restaurant_id);
create index if not exists idx_activities_due on public.activities(due_at) where completed_at is null;

-- ---------------------------------------------------------------------
-- 7) Orders + customer feedback (customer management)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  order_date date not null default (now()::date),
  status text not null default 'placed',   -- placed|delivered|cancelled etc (free text MVP)
  total_amount numeric(12,2),
  currency_code char(3) not null default 'EUR',
  line_items jsonb not null default '[]'::jsonb, -- [{product_id, qty, unit, price}]
  notes text,

  created_at timestamptz not null default now()
);

create index if not exists idx_orders_restaurant on public.orders(restaurant_id);
create index if not exists idx_orders_date on public.orders(order_date desc);

create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,

  rating int check (rating between 1 and 5),
  sentiment text,                          -- positive|neutral|negative (free text MVP)
  issues jsonb not null default '[]'::jsonb,
  comments text,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_restaurant on public.customer_feedback(restaurant_id);

-- ---------------------------------------------------------------------
-- 8) Row Level Security (RLS)
-- ---------------------------------------------------------------------
alter table public.farms enable row level security;
alter table public.farm_memberships enable row level security;

alter table public.products enable row level security;
alter table public.restaurants enable row level security;
alter table public.contacts enable row level security;
alter table public.menus enable row level security;
alter table public.visits enable row level security;
alter table public.activities enable row level security;
alter table public.orders enable row level security;
alter table public.customer_feedback enable row level security;

-- Geography config can be public read (optional). Keep RLS disabled or allow read-only.
-- If you want geography fully public, you can leave RLS off for cities/neighborhoods.
-- We'll keep them readable to authenticated users and writable only by service role/admin later.
alter table public.cities enable row level security;
alter table public.neighborhoods enable row level security;

-- ---------------------------------------------------------------------
-- 9) Policies
-- ---------------------------------------------------------------------

-- Farms: user can read farms they belong to; create farm allowed; updates only by owners (simple)
drop policy if exists "farms_select_member" on public.farms;
create policy "farms_select_member"
on public.farms for select
using (id in (select farm_id from public.current_user_farm_ids()));

drop policy if exists "farms_insert_any_auth" on public.farms;
create policy "farms_insert_any_auth"
on public.farms for insert
to authenticated
with check (true);

drop policy if exists "farms_update_owner" on public.farms;
create policy "farms_update_owner"
on public.farms for update
using (
  id in (
    select fm.farm_id
    from public.farm_memberships fm
    where fm.user_id = auth.uid() and fm.role = 'owner'
  )
)
with check (
  id in (
    select fm.farm_id
    from public.farm_memberships fm
    where fm.user_id = auth.uid() and fm.role = 'owner'
  )
);

-- Memberships: members can see memberships for their farm; only owners can add/remove
drop policy if exists "memberships_select_same_farm" on public.farm_memberships;
create policy "memberships_select_same_farm"
on public.farm_memberships for select
using (farm_id in (select farm_id from public.current_user_farm_ids()));

drop policy if exists "memberships_insert_owner" on public.farm_memberships;
create policy "memberships_insert_owner"
on public.farm_memberships for insert
with check (
  farm_id in (
    select fm.farm_id
    from public.farm_memberships fm
    where fm.user_id = auth.uid() and fm.role = 'owner'
  )
);

drop policy if exists "memberships_delete_owner" on public.farm_memberships;
create policy "memberships_delete_owner"
on public.farm_memberships for delete
using (
  farm_id in (
    select fm.farm_id
    from public.farm_memberships fm
    where fm.user_id = auth.uid() and fm.role = 'owner'
  )
);

-- Cities / Neighborhoods: authenticated read, no write (MVP)
drop policy if exists "cities_select_auth" on public.cities;
create policy "cities_select_auth"
on public.cities for select
to authenticated
using (true);

drop policy if exists "neighborhoods_select_auth" on public.neighborhoods;
create policy "neighborhoods_select_auth"
on public.neighborhoods for select
to authenticated
using (true);

-- Helper macro: tenant isolation by farm_id
-- Products
drop policy if exists "products_tenant_rw" on public.products;
create policy "products_tenant_rw"
on public.products for all
using (farm_id in (select farm_id from public.current_user_farm_ids()))
with check (farm_id in (select farm_id from public.current_user_farm_ids()));

-- Restaurants
drop policy if exists "restaurants_tenant_rw" on public.restaurants;
create policy "restaurants_tenant_rw"
on public.restaurants for all
using (farm_id in (select farm_id from public.current_user_farm_ids()))
with check (farm_id in (select farm_id from public.current_user_farm_ids()));

-- Contacts
drop policy if exists "contacts_tenant_rw" on public.contacts;
create policy "contacts_tenant_rw"
on public.contacts for all
using (farm_id in (select farm_id from public.current_user_farm_ids()))
with check (farm_id in (select farm_id from public.current_user_farm_ids()));

-- Menus
drop policy if exists "menus_tenant_rw" on public.menus;
create policy "menus_tenant_rw"
on public.menus for all
using (farm_id in (select farm_id from public.current_user_farm_ids()))
with check (farm_id in (select farm_id from public.current_user_farm_ids()));

-- Visits
drop policy if exists "visits_tenant_rw" on public.visits;
create policy "visits_tenant_rw"
on public.visits for all
using (farm_id in (select farm_id from public.current_user_farm_ids()))
with check (farm_id in (select farm_id from public.current_user_farm_ids()));

-- Activities
drop policy if exists "activities_tenant_rw" on public.activities;
create policy "activities_tenant_rw"
on public.activities for all
using (farm_id in (select farm_id from public.current_user_farm_ids()))
with check (farm_id in (select farm_id from public.current_user_farm_ids()));

-- Orders
drop policy if exists "orders_tenant_rw" on public.orders;
create policy "orders_tenant_rw"
on public.orders for all
using (farm_id in (select farm_id from public.current_user_farm_ids()))
with check (farm_id in (select farm_id from public.current_user_farm_ids()));

-- Customer feedback
drop policy if exists "feedback_tenant_rw" on public.customer_feedback;
create policy "feedback_tenant_rw"
on public.customer_feedback for all
using (farm_id in (select farm_id from public.current_user_farm_ids()))
with check (farm_id in (select farm_id from public.current_user_farm_ids()));

-- ---------------------------------------------------------------------
-- 10) Minimal seed suggestion (optional): create Madrid city record
--     (Run manually once; keep commented in migrations if you prefer)
-- ---------------------------------------------------------------------
-- insert into public.cities (country_code, name, timezone, currency_code, scoring_norms)
-- values ('ES', 'Madrid', 'Europe/Madrid', 'EUR', '{"daily_menu_good_min":28,"tasting_menu_good_min":55}'::jsonb)
-- on conflict (country_code, name) do nothing;

-- =====================================================================
-- End schema
-- =====================================================================
