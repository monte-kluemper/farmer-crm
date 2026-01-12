import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RestaurantEnrichOutputV1 } from "@/lib/schemas/restaurant"; // adjust import to your zod export
import { scoreRestaurantLead } from "@/lib/scoreRestaurantLead"; // your scoring fn
import { gptEnrichRestaurant } from "@/lib/gpt/gptEnrichRestaurant"; // existing GPT enrich

type PipelineSignals = {
    stage: string;
    last_contacted_at: string | null;
    inbound_interest: boolean;
};

export async function enrichAndScoreRestaurant(args: {
    farmId: string;
    restaurantId: string;
    websiteUrl: string;
    pipeline: PipelineSignals;
    commit: boolean; // true when you want to persist results
}) {
    const { farmId, restaurantId, websiteUrl, pipeline, commit } = args;

    // 1) run GPT enrichment (the same thing your enrich-url route does)
    const raw = await gptEnrichRestaurant({
        website_url: websiteUrl,
        restaurant_name_hint: null,
        address_hint: null,
        pipeline,
        radius_km: 8,
        target_products: ["microgreens", "premium-mushrooms"],
        sources: {
            homepage: "",
            menu: "",
            about: "",
            contact: "",
            listing: "",
            jsonld: "",
        },
    });

    // 2) validate (and optionally clamp rubric here like we discussed)
    const enriched = RestaurantEnrichOutputV1.parse(raw);

    // 3) compute final score (your deterministic scoring function)
    const score = scoreRestaurantLead(enriched.lead_features);

    if (!commit) {
        return { enriched, score };
    }

    // 4) persist (admin client or auth client depending on your RLS)
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
        .from("restaurants")
        .update({
            // adjust column names to your schema
            lead_score: score.total,
            lead_score_breakdown: score.breakdown,
            lead_features: enriched.lead_features,
            restaurant_profile: enriched.profile,
            enriched_at: new Date().toISOString(),
        })
        .eq("id", restaurantId)
        .eq("farm_id", farmId);

    if (error) throw new Error(error.message);

    return { enriched, score };
}
