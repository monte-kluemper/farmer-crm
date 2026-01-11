// src/lib/restaurant/enrichScoreAndPersist.ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { scoreRestaurantLead, DEFAULT_WEIGHTS_V1 } from "@/lib/leadScoring";
import type { RestaurantLeadFeaturesV1 } from "@/lib/leadScoring";

// Use your existing enrich function that returns lead_features of type RestaurantLeadFeaturesV1.
// Replace this import with your actual one.
import { enrichRestaurantLeadFeaturesFromUrl } from "@/lib/restaurant/enrichRestaurantLeadFeaturesFromUrl";

export async function enrichScoreAndPersistRestaurant(args: {
    farmId: string;
    restaurantId: string;
    url: string;
    radius_km: number;
}) {
    const { farmId, restaurantId, url, radius_km } = args;

    // 1) Enrich (produce RestaurantLeadFeaturesV1)
    const leadFeatures: RestaurantLeadFeaturesV1 =
        await enrichRestaurantLeadFeaturesFromUrl({ url, radius_km });

    // 2) Score (0..100 float)
    const breakdown = scoreRestaurantLead(leadFeatures, { radius_km, weights: DEFAULT_WEIGHTS_V1 });

    // 3) Persist score + explanation + ai_profile (optional)
    const supabase = createSupabaseAdminClient();

    const explanation =
        breakdown.reasons.length > 0 ? breakdown.reasons.join(" | ") : null;

    const { error } = await supabase
        .from("restaurants")
        .update({
            lead_score: Math.round(breakdown.final), // integer column
            lead_score_explanation: explanation,
            ai_profile: leadFeatures, // jsonb column (you already have ai_profile)
            // Optionally: also persist contact/locations if you included them in leadFeatures.restaurant
            contact: leadFeatures.restaurant.contact ?? null,
            locations: leadFeatures.restaurant.locations ?? null,
            cuisine_slugs: leadFeatures.restaurant.cuisine_slugs ?? null,
            price_tier: leadFeatures.restaurant.price_tier ?? null,
            neighborhood_guess: leadFeatures.restaurant.neighborhood_guess ?? null,
            city: leadFeatures.restaurant.city ?? null,
            website_url: leadFeatures.restaurant.website_url ?? null,
            address: leadFeatures.restaurant.address ?? null,
            service_style: leadFeatures.restaurant.service_style, // enum in DB
            stage: leadFeatures.signals.pipeline.stage, // pipeline stage enum in DB
        })
        .eq("id", restaurantId)
        .eq("farm_id", farmId);

    if (error) throw new Error(error.message);

    return { leadFeatures, breakdown };
}
