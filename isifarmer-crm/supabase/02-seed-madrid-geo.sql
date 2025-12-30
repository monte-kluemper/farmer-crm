-- ============================================================
-- Seed file: Madrid city + neighborhoods (barrios)
-- Target schema: public.cities, public.neighborhoods
-- ============================================================

-- ------------------------------------------------------------
-- 1) Insert Madrid city (if not exists)
-- ------------------------------------------------------------
insert into public.cities (
  country_code,
  name,
  timezone,
  currency_code,
  scoring_norms
)
values (
  'ES',
  'Madrid',
  'Europe/Madrid',
  'EUR',
  '{
    "daily_menu_good_min": 28,
    "daily_menu_high_min": 35,
    "tasting_menu_good_min": 55,
    "tasting_menu_high_min": 70
  }'::jsonb
)
on conflict (country_code, name) do nothing;

-- ------------------------------------------------------------
-- 2) Insert Madrid neighborhoods (barrios)
-- ------------------------------------------------------------
with madrid as (
  select id
  from public.cities
  where country_code = 'ES'
    and name = 'Madrid'
)

insert into public.neighborhoods (city_id, name, slug)
select
  madrid.id,
  n.name,
  n.slug
from madrid
cross join (
  values
    -- Centro
    ('Centro', 'centro'),
    ('Sol', 'sol'),
    ('Cortes', 'cortes'),
    ('Embajadores', 'embajadores'),
    ('Lavapiés', 'lavapies'),
    ('La Latina', 'la-latina'),
    ('Malasaña', 'malasana'),
    ('Chueca', 'chueca'),

    -- Chamberí
    ('Chamberí', 'chamberi'),
    ('Almagro', 'almagro'),
    ('Trafalgar', 'trafalgar'),
    ('Ríos Rosas', 'rios-rosas'),

    -- Salamanca
    ('Salamanca', 'salamanca'),
    ('Recoletos', 'recoletos'),
    ('Goya', 'goya'),
    ('Lista', 'lista'),

    -- Retiro
    ('Retiro', 'retiro'),
    ('Ibiza', 'ibiza'),
    ('Jerónimos', 'jeronimos'),

    -- Chamartín
    ('Chamartín', 'chamartin'),
    ('El Viso', 'el-viso'),
    ('Prosperidad', 'prosperidad'),

    -- Arganzuela
    ('Arganzuela', 'arganzuela'),
    ('Delicias', 'delicias'),
    ('Legazpi', 'legazpi'),

    -- Moncloa - Aravaca
    ('Moncloa', 'moncloa'),
    ('Argüelles', 'arguelles'),
    ('Aravaca', 'aravaca'),

    -- Tetuán
    ('Tetuán', 'tetuan'),
    ('Cuatro Caminos', 'cuatro-caminos'),

    -- Usera / Carabanchel (emerging scenes)
    ('Usera', 'usera'),
    ('Carabanchel', 'carabanchel'),

    -- Other relevant areas
    ('Barrio de las Letras', 'barrio-de-las-letras'),
    ('Madrid Río', 'madrid-rio')
) as n(name, slug)
on conflict (city_id, slug) do nothing;

-- ============================================================
-- End seed
-- ============================================================
