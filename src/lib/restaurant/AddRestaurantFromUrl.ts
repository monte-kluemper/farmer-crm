import OpenAI from "openai";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMyFarmIdOrThrow, getMadridCityId } from "@/lib/farm";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
});

function normalizeUrl(url: string) {
    const u = url.trim();
    if (!u) throw new Error("Missing URL");
    const withProto =
        u.startsWith("http://") || u.startsWith("https://") ? u : `https://${u}`;
    return new URL(withProto).toString();
}

function htmlToText(html: string) {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
        .replace(/<\/?[^>]+(>|$)/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60_000);
}

const RestaurantProfileZ = z.object({
    restaurant_name: z.string(),
    website_url: z.string().nullable(),
    address: z.string().nullable(),
    neighborhood_guess: z.string().nullable(),
    cuisine_slugs: z.array(z.string()),
    cuisine_fit: z.enum(["high", "medium", "low"]),
    service_style: z.enum(["fine_dining", "casual", "fast_casual", "mixed", "unknown"]),
    price_architecture: z.object({
        daily_menu_eur: z.number().nullable(),
        tasting_menu_eur: z.number().nullable(),
        ala_carte_main_eur: z.number().nullable(),
    }),
    menu_signals: z.object({
        plating_intensity: z.enum(["low", "medium", "high", "very_high", "unknown"]),
    }),
    off_menu_signals: z.object({
        chef_selection_language: z.boolean(),
        market_driven: z.boolean(),
        seasonal_variation: z.boolean(),
        frequent_specials: z.boolean(),
        notes: z.string().nullable(),
    }),
    sustainability_signals: z.object({
        km0: z.boolean(),
        local: z.boolean(),
        seasonal: z.boolean(),
        notes: z.string().nullable(),
    }),
    ai_confidence: z.enum(["low", "medium", "high"]),
});

export async function addRestaurantFromUrl(inputUrl: string) {
    const supabaseAuth = await createSupabaseRouteClient();

    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { farmId, userId } = await getMyFarmIdOrThrow(supabaseAuth);
    const cityId = await getMadridCityId();

    const url = normalizeUrl(inputUrl);

    const pageRes = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (IsifarmerCRM)",
            Accept: "text/html,*/*",
        },
        cache: "no-store",
    });

    if (!pageRes.ok) throw new Error(`Failed to fetch URL (${pageRes.status})`);

    const html = await pageRes.text();
    const text = htmlToText(html);

    const prompt = `
Extract a restaurant profile. Do not hallucinate. Use null when unknown.

URL: ${url}

PAGE TEXT:
${text}
  `.trim();

    const response = await openai.responses.parse({
        model: "gpt-5",
        reasoning: { effort: "medium" },
        input: [
            { role: "system", content: "Extract accurate structured restaurant profiles." },
            { role: "user", content: prompt },
        ],
        text: {
            format: zodTextFormat(RestaurantProfileZ, "restaurant_profile"),
        },
    });

    const profile = response.output_parsed;
    if (!profile) throw new Error("GPT returned no structured output");

    const supabaseAdmin = createSupabaseAdminClient();

    const { data: restaurant, error } = await supabaseAdmin
        .from("restaurants")
        .insert({
            farm_id: farmId,
            city_id: cityId,
            name: profile.restaurant_name,
            address: profile.address,
            website_url: profile.website_url,
            source_url: url,
            cuisine_types: profile.cuisine_slugs,
            cuisine_fit: profile.cuisine_fit,
            service_style: profile.service_style,
            stage: "identified",
            owner_user_id: userId,
            ai_confidence: profile.ai_confidence,
            price_architecture: profile.price_architecture,
            menu_signals: profile.menu_signals,
            off_menu_signals: profile.off_menu_signals,
            sustainability_signals: profile.sustainability_signals,
        })
        .select("id")
        .single();

    if (error) throw new Error(error.message);

    const restaurantId = restaurant.id as string;

    await supabaseAdmin.from("menus").insert({
        farm_id: farmId,
        restaurant_id: restaurantId,
        source_url: url,
        parsed: profile,
    });

    return { restaurantId };
}
