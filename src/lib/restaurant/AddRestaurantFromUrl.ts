// addRestaurantFromUrl.ts
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enrichScoreAndPersistRestaurant } from "@/lib/restaurant/enrichScoreAndPersist";
import { getMyFarmIdOrThrow, getMadridCityId } from "@/lib/farm";

// NEW: deterministic scrape + GPT modules (adjust paths to your repo)
import { scrapeRestaurantSources } from "@/lib/scrape/scrapeRestaurantSources";
import { gptResolveRestaurantIdentity } from "@/lib/gpt/gptResolveRestaurantIdentity";
import { gptEnrichRestaurant } from "@/lib/gpt/gptEnrichRestaurant";

// addRestaurantFromUrl.ts
import { z } from "zod";

/**
 * Minimal shape we need from identity resolution.
 * Keep this aligned with your RestaurantIdentityV1 Zod schema in the identity module.
 */
const RestaurantIdentityZ = z.object({
    canonical_name: z.string(),
    canonical_website_url: z.string().url().nullable(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    city: z.string().nullable(),
    geo: z.object({ lat: z.number().nullable(), lng: z.number().nullable() }),
    identity_confidence: z.enum(["low", "medium", "high"]),
    evidence: z.object({
        matched_schema_org: z.boolean(),
        matched_footer_nap: z.boolean(),
        matched_contact_page: z.boolean(),
        excerpts: z.array(z.string()),
        notes: z.string().nullable(),
    }),
    candidates: z.array(
        z.object({
            name: z.string(),
            address: z.string().nullable(),
            website_url: z.string().url().nullable(),
            reason: z.string(),
        })
    ),
});

type RestaurantIdentity = z.infer<typeof RestaurantIdentityZ>;

/**
 * Minimal shape we need from enrichment output for persistence.
 * (Your gptEnrichRestaurant returns unknown; we validate here.)
 */
const EnrichedOutputZ = z.object({
    profile: z.object({
        restaurant_name: z.string(),
        website_url: z.string().nullable(),
        address: z.string().nullable(),
        cuisine_slugs: z.array(z.string()),
        cuisine_fit: z.enum(["high", "medium", "low"]),
        service_style: z.enum(["fine_dining", "casual", "fast_casual", "mixed", "unknown"]),
        ai_confidence: z.enum(["low", "medium", "high"]),
        price_architecture: z
            .object({
                daily_menu_eur: z.number().nullable(),
                tasting_menu_eur: z.number().nullable(),
                ala_carte_main_eur: z.number().nullable(),
            })
            .nullable()
            .optional(),
        menu_signals: z.unknown().nullable().optional(),
        off_menu_signals: z.unknown().nullable().optional(),
        sustainability_signals: z.unknown().nullable().optional(),
    }),
    lead_features: z.unknown().optional(),
    people: z.unknown().optional(),
});

type EnrichedOutput = z.infer<typeof EnrichedOutputZ>;

function normalizeUrl(url: string) {
    const u = url.trim();
    if (!u) throw new Error("Missing URL");
    const withProto =
        u.startsWith("http://") || u.startsWith("https://") ? u : `https://${u}`;
    return new URL(withProto).toString();
}

function hostOf(url: string): string | null {
    try {
        return new URL(url).host.replace(/^www\./, "");
    } catch {
        return null;
    }
}

async function findExistingRestaurantIdByHost(args: {
    supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
    farmId: string;
    websiteUrl: string;
}): Promise<string | null> {
    const { supabaseAdmin, farmId, websiteUrl } = args;

    const targetHost = hostOf(websiteUrl);
    if (!targetHost) return null;

    const { data, error } = await supabaseAdmin
        .from("restaurants")
        .select("id, website_url")
        .eq("farm_id", farmId)
        .not("website_url", "is", null)
        .limit(200);

    if (error || !data) return null;

    for (const row of data as Array<{ id: string; website_url: string | null }>) {
        if (!row.website_url) continue;
        const h = hostOf(row.website_url);
        if (h && h === targetHost) return row.id;
    }
    return null;
}

export async function addRestaurantFromUrl(inputUrl: string) {
    const supabaseAuth = await createSupabaseRouteClient();

    const {
        data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { farmId, userId } = await getMyFarmIdOrThrow(supabaseAuth);
    const cityId = await getMadridCityId();

    const url = normalizeUrl(inputUrl);

    // 1) Deterministic scraping (no GPT here)
    // NOTE: your TS error indicates this function expects a STRING, not { url: string }.
    const sources = await scrapeRestaurantSources(url);

    // 2) GPT identity resolution (gatekeeper)
    const identityUnknown = await gptResolveRestaurantIdentity({
        input_url: url,
        name_hint: null,
        address_hint: null,
        sources,
    });

    // Fix: identity possibly null + ensure runtime validity
    const identityParsed = RestaurantIdentityZ.safeParse(identityUnknown);
    if (!identityParsed.success) {
        throw new Error(
            `Identity resolution returned invalid output: ${identityParsed.error.message}`
        );
    }
    const identity: RestaurantIdentity = identityParsed.data;

    const canonicalWebsiteUrl = identity.canonical_website_url ?? url;

    const supabaseAdmin = createSupabaseAdminClient();

    // Optional dedupe by website host
    const existingRestaurantId = await findExistingRestaurantIdByHost({
        supabaseAdmin,
        farmId,
        websiteUrl: canonicalWebsiteUrl,
    });

    // 3) If identity confidence is low, persist minimal record and stop (needs review)
    // If your DB enum doesn't allow "needs_review", change it to "identified" and store the review state elsewhere.
    const stage = identity.identity_confidence === "low" ? "needs_review" : "identified";

    if (identity.identity_confidence === "low") {
        const payload = {
            farm_id: farmId,
            city_id: cityId,
            name: identity.canonical_name,
            address: identity.address,
            website_url: canonicalWebsiteUrl,
            source_url: url,
            cuisine_types: [] as string[],
            cuisine_fit: "low",
            service_style: "unknown",
            stage,
            owner_user_id: userId,
            ai_confidence: "low",
            price_architecture: null,
            menu_signals: null,
            off_menu_signals: null,
            sustainability_signals: null,
        };

        if (existingRestaurantId) {
            const { error } = await supabaseAdmin
                .from("restaurants")
                .update(payload)
                .eq("id", existingRestaurantId);

            if (error) throw new Error(error.message);

            return {
                restaurantId: existingRestaurantId,
                stage,
                identity_confidence: identity.identity_confidence,
                candidates: identity.candidates,
            };
        }

        const { data: restaurant, error } = await supabaseAdmin
            .from("restaurants")
            .insert(payload)
            .select("id")
            .single();

        if (error) throw new Error(error.message);

        return {
            restaurantId: restaurant.id as string,
            stage,
            identity_confidence: identity.identity_confidence,
            candidates: identity.candidates,
        };
    }

    // 4) Identity is medium/high → GPT enrichment module (YOUR existing signature)
    const enrichedUnknown = await gptEnrichRestaurant({
        website_url: canonicalWebsiteUrl,
        restaurant_name_hint: identity.canonical_name,
        address_hint: identity.address,
        pipeline: {
            stage: "new",
            last_contacted_at: null,
            inbound_interest: false,
        },
        radius_km: 8,
        target_products: [],
        sources,
    });

    const enrichedParsed = EnrichedOutputZ.safeParse(enrichedUnknown);
    if (!enrichedParsed.success) {
        throw new Error(
            `Enrichment returned invalid output: ${enrichedParsed.error.message}`
        );
    }
    const enriched: EnrichedOutput = enrichedParsed.data;
    const profile = enriched.profile;

    // 5) Persist restaurant (insert/update)
    const restaurantPayload = {
        farm_id: farmId,
        city_id: cityId,
        name: profile.restaurant_name,
        address: profile.address ?? identity.address,
        website_url: profile.website_url ?? canonicalWebsiteUrl,
        source_url: url,
        cuisine_types: profile.cuisine_slugs,
        cuisine_fit: profile.cuisine_fit,
        service_style: profile.service_style,
        stage: "identified",
        owner_user_id: userId,
        ai_confidence: profile.ai_confidence,
        price_architecture: profile.price_architecture ?? null,
        menu_signals: profile.menu_signals ?? null,
        off_menu_signals: profile.off_menu_signals ?? null,
        sustainability_signals: profile.sustainability_signals ?? null,
    };

    let restaurantId: string;

    if (existingRestaurantId) {
        const { error } = await supabaseAdmin
            .from("restaurants")
            .update(restaurantPayload)
            .eq("id", existingRestaurantId);

        if (error) throw new Error(error.message);
        restaurantId = existingRestaurantId;
    } else {
        const { data: restaurant, error } = await supabaseAdmin
            .from("restaurants")
            .insert(restaurantPayload)
            .select("id")
            .single();

        if (error) throw new Error(error.message);
        restaurantId = restaurant.id as string;
    }

    // 6) Persist menus parse artifact (unchanged behavior)
    await supabaseAdmin.from("menus").insert({
        farm_id: farmId,
        restaurant_id: restaurantId,
        source_url: url,
        parsed: enriched, // store full enriched output (profile + lead_features + people)
    });

    // 7) Score + persist downstream
    // Fix: your error showed a { url: string } being passed somewhere a string was expected;
    // here we pass the string URL, same as your old file.
    await enrichScoreAndPersistRestaurant({
        farmId,
        restaurantId,
        url: profile.website_url ?? canonicalWebsiteUrl,
        radius_km: 8,
    });

    return { restaurantId };
}
