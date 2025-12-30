-- ============================================================
-- Seed file: Madrid cuisine taxonomy (Lead Scoring v2)
-- ============================================================

with madrid as (
  select id
  from public.cities
  where country_code = 'ES'
    and name = 'Madrid'
)

insert into public.cuisine_taxonomy (
  city_id,
  name,
  slug,
  fit_tier,
  description,
  signals
)
select
  madrid.id,
  c.name,
  c.slug,
  c.fit_tier::cuisine_fit_tier,
  c.description,
  c.signals::jsonb
from madrid
cross join (
  values
    -- ========================================================
    -- TIER A – HIGH FIT
    -- ========================================================
    (
      'Contemporary / Modern European',
      'modern-european',
      'high',
      'Author-driven European cuisine with strong focus on plating, seasonality, and ingredient differentiation.',
      '{"keywords":["contemporary","creative","author","seasonal","plated","degustation"]}'
    ),
    (
      'Author / Neo-bistró',
      'neo-bistro',
      'high',
      'Chef-led bistró concepts combining technique, creativity, and accessible formats.',
      '{"keywords":["chef","author","neo","creative","bistró moderno"]}'
    ),
    (
      'Japanese (Kaiseki / Omakase / Modern)',
      'japanese-modern',
      'high',
      'Japanese cuisine with strong aesthetic, precision, and micro-component usage.',
      '{"keywords":["omakase","kaiseki","japanese","counter","tasting"]}'
    ),
    (
      'Nikkei (Japanese–Peruvian)',
      'nikkei',
      'high',
      'Fusion cuisine emphasizing freshness, herbs, and visual contrast.',
      '{"keywords":["nikkei","peruvian","japanese","fusion"]}'
    ),
    (
      'Modern Italian (Fine Dining)',
      'modern-italian',
      'high',
      'Italian cuisine reinterpreted with fine dining techniques and refined plating.',
      '{"keywords":["italian","contemporary","degustation","fine dining"]}'
    ),
    (
      'Nordic / New Nordic',
      'nordic',
      'high',
      'Nordic-inspired cuisine focused on seasonality, foraging, and minimalism.',
      '{"keywords":["nordic","new nordic","foraging","seasonal"]}'
    ),
    (
      'Vegetarian / Plant-Forward Fine Dining',
      'plant-forward-fine-dining',
      'high',
      'Vegetable-centric cuisine where microgreens and herbs play a central role.',
      '{"keywords":["vegetarian","plant-based","vegetables","seasonal"]}'
    ),

    -- ========================================================
    -- TIER B – MEDIUM FIT
    -- ========================================================
    (
      'Contemporary Mediterranean',
      'contemporary-mediterranean',
      'medium',
      'Modern Mediterranean cuisine with selective use of garnish and fresh herbs.',
      '{"keywords":["mediterranean","modern","seasonal"]}'
    ),
    (
      'Creative Tapas',
      'creative-tapas',
      'medium',
      'Tapas concepts with creative plating and chef-driven dishes.',
      '{"keywords":["tapas","creative","modern tapas"]}'
    ),
    (
      'Modern Middle Eastern',
      'modern-middle-eastern',
      'medium',
      'Middle Eastern cuisine with contemporary presentation and herb usage.',
      '{"keywords":["middle eastern","levant","modern"]}'
    ),
    (
      'Contemporary Mexican',
      'contemporary-mexican',
      'medium',
      'Modern Mexican cuisine emphasizing plating and reinterpretation.',
      '{"keywords":["mexican","contemporary","creative"]}'
    ),
    (
      'Asian Fusion (Non-Traditional)',
      'asian-fusion',
      'medium',
      'Fusion concepts blending Asian techniques with modern presentation.',
      '{"keywords":["fusion","asian","modern"]}'
    ),

    -- ========================================================
    -- TIER C – LOW FIT
    -- ========================================================
    (
      'Traditional Spanish (Classic)',
      'traditional-spanish',
      'low',
      'Traditional Spanish cuisine focused on volume and classic execution.',
      '{"keywords":["tradicional","clásico","asador","taberna"]}'
    ),
    (
      'Menú del Día / High Volume',
      'menu-del-dia',
      'low',
      'Price-sensitive daily menu concepts optimized for speed and margin.',
      '{"keywords":["menú del día","daily menu","rápido"]}'
    ),
    (
      'Fast Casual / Chain',
      'fast-casual-chain',
      'low',
      'Chain or fast-casual concepts with standardized menus.',
      '{"keywords":["chain","franchise","fast casual"]}'
    ),
    (
      'Bulk Ethnic (Traditional)',
      'bulk-ethnic',
      'low',
      'Traditional ethnic cuisines focused on volume rather than plating.',
      '{"keywords":["traditional","authentic","bulk"]}'
    )
) as c(name, slug, fit_tier, description, signals)
on conflict (city_id, slug) do nothing;

-- ============================================================
-- End seed
-- ============================================================
