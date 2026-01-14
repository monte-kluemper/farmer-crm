// src/lib/restaurant/enrichScoreAndPersist.ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { scoreRestaurantLead, DEFAULT_WEIGHTS_V1 } from "@/lib/scoreRestaurantLead";
import type { RestaurantLeadFeaturesV1 } from "@/lib/scoreRestaurantLead";

import { enrichRestaurantLeadFeaturesFromUrl } from "@/lib/restaurant/enrichRestaurantLeadFeaturesFromUrl";
import { enrichRestaurantPeople } from "@/lib/restaurant/enrichRestaurantPeople";

export async function enrichScoreAndPersistRestaurant(args: {
    farmId: string;
    restaurantId: string;
    url: string;
    radius_km: number;
    refreshPeople?: boolean;
    peopleSources?: {
        search_snippets?: string | null;
        press?: string | null;
        directories?: string | null;
        social?: string | null;
    };
}) {
    const {
        farmId,
        restaurantId,
        url,
        radius_km,
        refreshPeople = true,
        peopleSources = {},
    } = args;

    const supabase = createSupabaseAdminClient();

    // 1) Enrich lead features
    const leadFeatures: RestaurantLeadFeaturesV1 =
        await enrichRestaurantLeadFeaturesFromUrl({ url, radius_km });

    // 2) Score
    const breakdown = scoreRestaurantLead(leadFeatures, {
        radius_km,
        weights: DEFAULT_WEIGHTS_V1,
    });

    const explanation =
        breakdown.reasons.length > 0 ? breakdown.reasons.join(" | ") : null;

    // 3) Persist restaurant
    const { error: restaurantError } = await supabase
        .from("restaurants")
        .update({
            lead_score: Math.round(breakdown.final),
            lead_score_explanation: explanation,
            ai_profile: leadFeatures,

            contact: leadFeatures.restaurant.contact ?? null,
            locations: leadFeatures.restaurant.locations ?? null,
            cuisine_slugs: leadFeatures.restaurant.cuisine_slugs ?? null,
            price_tier: leadFeatures.restaurant.price_tier ?? null,
            neighborhood_guess: leadFeatures.restaurant.neighborhood_guess ?? null,
            city: leadFeatures.restaurant.city ?? null,
            website_url: leadFeatures.restaurant.website_url ?? null,
            address: leadFeatures.restaurant.address ?? null,

            service_style: leadFeatures.restaurant.service_style,
            stage: leadFeatures.signals.pipeline.stage,
        })
        .eq("id", restaurantId)
        .eq("farm_id", farmId);

    if (restaurantError) throw new Error(restaurantError.message);

    // 4) Optional: refresh people via GPT-5
    if (refreshPeople) {
        // Fetch instagram_url (and optionally other canonical fields) from DB
        const { data: rRow, error: rRowErr } = await supabase
            .from("restaurants")
            .select("name, city, website_url, instagram_url")
            .eq("id", restaurantId)
            .eq("farm_id", farmId)
            .single();

        if (rRowErr) throw new Error(rRowErr.message);

        const { people } = await enrichRestaurantPeople({
            restaurantName: rRow?.name ?? leadFeatures.restaurant.name,
            city: rRow?.city ?? leadFeatures.restaurant.city ?? null,
            websiteUrl: rRow?.website_url ?? leadFeatures.restaurant.website_url ?? null,
            instagramUrl: rRow?.instagram_url ?? null, // ✅ no TS error now
            sources: peopleSources,
        });

        if (people.length > 0) {
            const rows = people.map((p) => ({
                restaurant_id: restaurantId,
                role: p.role,
                full_name: p.full_name,
                title: p.title,
                email: p.email,
                phone: p.phone,
                linkedin_url: p.linkedin_url,
                source_url: p.source_url,
                source_type: p.source_type,
                evidence_excerpt: p.evidence_excerpt,
                confidence: p.confidence,
                last_verified_at: new Date().toISOString(),
            }));

            const { error: peopleError } = await supabase
                .from("restaurant_people")
                .upsert(rows, { onConflict: "restaurant_id,role,full_name" });

            if (peopleError) throw new Error(peopleError.message);
        }
    }

    return { leadFeatures, breakdown };
}
