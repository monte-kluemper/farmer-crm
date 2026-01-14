import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enrichRestaurantPeople } from "@/lib/restaurant/enrichRestaurantPeople";

export async function enrichPeopleAndPersist(args: {
    farmId: string;
    restaurantId: string;
    restaurantName: string;
    city?: string | null;
    websiteUrl?: string | null;
    instagramUrl?: string | null;
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
        restaurantName,
        city = null,
        websiteUrl = null,
        instagramUrl = null,
        peopleSources = {},
    } = args;

    const { people } = await enrichRestaurantPeople({
        restaurantName,
        city,
        websiteUrl,
        instagramUrl,
        sources: peopleSources,
    });

    if (!people.length) return { people: [] };

    const supabase = createSupabaseAdminClient();

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

    const { error } = await supabase
        .from("restaurant_people")
        .upsert(rows, { onConflict: "restaurant_id,role,full_name" })
        .eq("restaurant_id", restaurantId);

    if (error) throw new Error(error.message);

    return { people };
}
