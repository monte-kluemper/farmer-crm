// src/lib/restaurant/enrichRestaurantLeadFeaturesFromUrl.ts

import { RestaurantEnrichOutputV1 } from "@/lib/schemas/restaurant";
import type { RestaurantLeadFeaturesV1 } from "@/lib/leadScoring";
import { gptEnrichRestaurant } from "@/lib/gpt/gptEnrichRestaurant";
import type { ScrapeSources } from "@/lib/scrape/scrapeRestaurantSources";

function clampInt(n: unknown, min: number, max: number): number {
    if (typeof n !== "number" || !Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
}

type Rubric05 = {
    menu_fit_score: number;
    local_affinity_score: number;
    volume_score: number;
    outreach_ease_score: number;
    brand_alignment_score: number;
    risk_score: number;
};
function hasRubric(
    v: unknown
): v is { lead_features: { rubric: Rubric05 } } {
    if (typeof v !== "object" || v === null) return false;

    const lf = (v as { lead_features?: unknown }).lead_features;
    if (typeof lf !== "object" || lf === null) return false;

    const r = (lf as { rubric?: unknown }).rubric;
    if (typeof r !== "object" || r === null) return false;

    return true;
}

function sanitizeRubric(raw: unknown) {
    if (!hasRubric(raw)) return raw;

    const r = raw.lead_features.rubric;

    r.menu_fit_score = clampInt(r.menu_fit_score, 0, 5);
    r.local_affinity_score = clampInt(r.local_affinity_score, 0, 5);
    r.volume_score = clampInt(r.volume_score, 0, 5);
    r.outreach_ease_score = clampInt(r.outreach_ease_score, 0, 5);
    r.brand_alignment_score = clampInt(r.brand_alignment_score, 0, 5);
    r.risk_score = clampInt(r.risk_score, 0, 5);

    return raw;
}

export async function enrichRestaurantLeadFeaturesFromUrl(args: {
    url: string;
    radius_km: number;
    restaurant_name_hint?: string | null;
    address_hint?: string | null;
    target_products?: string[];
    sources?: Partial<ScrapeSources>;
}): Promise<RestaurantLeadFeaturesV1> {
    const {
        url,
        radius_km,
        restaurant_name_hint = null,
        address_hint = null,
        target_products = ["microgreens", "premium-mushrooms"],
        sources = {},
    } = args;

    // Provide required shape for gptEnrichRestaurant
    const fullSources: ScrapeSources = {
        homepage: sources.homepage ?? "",
        menu: sources.menu ?? "",
        about: sources.about ?? "",
        contact: sources.contact ?? "",
        listing: sources.listing ?? "",
        jsonld: sources.jsonld ?? "",
        resolved_urls: sources.resolved_urls ?? {
            homepage: null,
            menu: null,
            about: null,
            contact: null,
        },
    };

    const raw = await gptEnrichRestaurant({
        website_url: url,
        restaurant_name_hint,
        address_hint,
        pipeline: {
            stage: "new",
            last_contacted_at: null,
            inbound_interest: false,
        },
        radius_km,
        target_products,
        sources: fullSources,
    });

    // Clamp rubric to satisfy Zod + scoring expectations
    const sanitized = sanitizeRubric(raw);

    // Validate the full output, then return the lead_features
    const enriched = RestaurantEnrichOutputV1.parse(sanitized);
    return enriched.lead_features;
}
