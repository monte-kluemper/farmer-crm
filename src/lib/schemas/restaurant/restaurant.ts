import { z } from "zod";

/** ---- Restaurant Profile ---- */

export const RestaurantProfileV1 = z
    .object({
        schema_version: z.literal("v1"),

        name: z.string(),
        website_url: z.string().nullable(),

        address: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        neighborhood_guess: z.string().nullable().optional(),

        service_style: z.enum([
            "fine_dining",
            "casual",
            "fast_casual",
            "takeaway",
            "bar_cafe",
            "hotel",
            "unknown",
        ]),

        price_tier: z.enum(["low", "mid", "high", "unknown"]),

        cuisine_slugs: z.array(z.string()).default([]),

        contact: z
            .object({
                has_contact_page: z.boolean(),
                email: z.string().nullable().optional(),
                phone: z.string().nullable().optional(),
                contact_url: z.string().nullable().optional(),
                reservation_platform: z.enum([
                    "opentable",
                    "thefork",
                    "resy",
                    "sevenrooms",
                    "phone_only",
                    "unknown",
                    "none",
                ]),
            })
            .default({
                has_contact_page: false,
                reservation_platform: "unknown",
            }),

        locations: z
            .object({
                location_count_guess: z.number().int().min(0),
                is_chain_guess: z.boolean(),
            })
            .default({ location_count_guess: 0, is_chain_guess: false }),
    })
    .strict();

export type RestaurantProfileV1 = z.infer<typeof RestaurantProfileV1>;

/** ---- People candidates ---- */

export const RestaurantPersonCandidateV1 = z
    .object({
        role: z.enum([
            "chef",
            "head_chef",
            "executive_chef",
            "owner",
            "general_manager",
            "restaurant_manager",
            "sommelier",
            "procurement",
            "unknown",
        ]),
        full_name: z.string().min(1),
        title: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        linkedin_url: z.string().url().nullable().optional(),

        source_url: z.string().url().nullable(),
        source_type: z.enum([
            "website",
            "google_listing",
            "thefork",
            "michelin",
            "linkedin",
            "press",
            "other",
        ]),
        evidence_excerpt: z.string().min(1),
        confidence: z.number().min(0).max(1),
    })
    .strict();

export const RestaurantPeopleCandidatesV1 = z.array(RestaurantPersonCandidateV1);

export type RestaurantPersonCandidateV1 = z.infer<typeof RestaurantPersonCandidateV1>;

/** ---- Lead features (RestaurantLeadFeaturesV1) ---- */

export const RestaurantLeadFeaturesV1 = z
    .object({
        schema_version: z.literal("v1"),

        restaurant: z.object({
            name: z.string(),
            website_url: z.string().nullable(),
            address: z.string().nullable().optional(),
            city: z.string().nullable().optional(),
            neighborhood_guess: z.string().nullable().optional(),

            service_style: z.enum([
                "fine_dining",
                "casual",
                "fast_casual",
                "takeaway",
                "bar_cafe",
                "hotel",
                "unknown",
            ]),
            price_tier: z.enum(["low", "mid", "high", "unknown"]),
            cuisine_slugs: z.array(z.string()).default([]),

            contact: z
                .object({
                    has_contact_page: z.boolean(),
                    email: z.string().nullable().optional(),
                    phone: z.string().nullable().optional(),
                    contact_url: z.string().nullable().optional(),
                    chef_or_owner_named: z.boolean().default(false),
                    reservation_platform: z.enum([
                        "opentable",
                        "thefork",
                        "resy",
                        "sevenrooms",
                        "phone_only",
                        "unknown",
                        "none",
                    ]),
                })
                .default({
                    has_contact_page: false,
                    chef_or_owner_named: false,
                    reservation_platform: "unknown",
                }),

            locations: z
                .object({
                    location_count_guess: z.number().int().min(0),
                    is_chain_guess: z.boolean().default(false),
                })
                .default({ location_count_guess: 0, is_chain_guess: false }),
        }),

        signals: z.object({
            geo: z.object({
                distance_km: z.number().min(0).nullable(),
                delivery_feasible: z.boolean(),
                neighborhood_match: z.enum(["high", "medium", "low", "unknown"]).default("unknown"),
            }),

            menu: z.object({
                menu_fit: z.number().min(0).max(1),
                uses_target_products: z.boolean(),
                target_product_mentions: z.array(
                    z.object({
                        product_slug: z.string(),
                        mention_text: z.string(),
                    })
                ),
                menu_url: z.string().nullable().optional(),
                seasonality_alignment: z.number().min(0).max(1).default(0.5),
            }),

            brand: z.object({
                sustainability_affinity: z.number().min(0).max(1),
                local_sourcing_language: z.boolean(),
                keywords: z.array(z.string()).default([]),
            }),

            operations: z.object({
                volume_potential: z.number().min(0).max(1),
                operational_risk: z.number().min(0).max(1),
                opening_hours_known: z.boolean().default(false),
                catering_or_events: z.boolean().default(false),
                delivery_or_takeaway: z.boolean().default(false),
            }),

            pipeline: z.object({
                stage: z.enum(["new", "researched", "contacted", "responded", "meeting_set", "won", "lost"]),
                last_contacted_at: z.string().datetime().nullable(),
                inbound_interest: z.boolean().default(false),
            }),
        }),

        rubric: z.object({
            menu_fit_score: z.number().int().min(0).max(5),
            local_affinity_score: z.number().int().min(0).max(5),
            volume_score: z.number().int().min(0).max(5),
            outreach_ease_score: z.number().int().min(0).max(5),
            brand_alignment_score: z.number().int().min(0).max(5),
            risk_score: z.number().int().min(0).max(5),
        }),

        confidence: z.object({
            overall: z.number().min(0).max(1),
            by_factor: z.object({
                geo: z.number().min(0).max(1),
                menu: z.number().min(0).max(1),
                brand: z.number().min(0).max(1),
                operations: z.number().min(0).max(1),
                outreach: z.number().min(0).max(1),
            }),
        }),

        evidence: z.array(
            z.object({
                factor: z.enum(["geo", "menu", "brand", "operations", "outreach", "price", "cuisine"]),
                claim: z.string(),
                source_url: z.string().nullable(),
                excerpt: z.string(),
            })
        ),

        missing_info: z.array(z.string()).default([]),

        generated_at: z.string().datetime(),
    })
    .strict();

export type RestaurantLeadFeaturesV1 = z.infer<typeof RestaurantLeadFeaturesV1>;

/** ---- Enrich output object (what GPT returns) ---- */

export const RestaurantEnrichOutputV1 = z
    .object({
        profile: RestaurantProfileV1,
        lead_features: RestaurantLeadFeaturesV1,
        people: RestaurantPeopleCandidatesV1,
    })
    .strict();

export type RestaurantEnrichOutputV1 = z.infer<typeof RestaurantEnrichOutputV1>;
