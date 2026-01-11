// src/app/api/restaurants/add/route.ts

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMadridCityId, getMyFarmIdOrThrow } from "@/lib/farm";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

export const runtime = "nodejs";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

function normalizeUrl(url: string) {
    const u = url.trim();
    if (!u) throw new Error("Missing URL");
    const withProto = u.startsWith("http://") || u.startsWith("https://") ? u : `https://${u}`;
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
    menu_signals: z.looseObject({
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

function getErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "object" && e !== null && "message" in e) {
        const m = (e as { message?: unknown }).message;
        if (typeof m === "string") return m;
    }
    if (typeof e === "string") return e;
    try {
        return JSON.stringify(e);
    } catch {
        return "Unknown error";
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const url = normalizeUrl(String(body?.url ?? ""));

        // ------------------------------------------------------------
        // Auth + farm context (cookie-aware)
        // ------------------------------------------------------------
        const supabaseAuth = await createSupabaseRouteClient();

        const {
            data: { user },
            error: userErr,
        } = await supabaseAuth.auth.getUser();

        if (!user || userErr) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        // IMPORTANT: getMyFarmIdOrThrow must accept the cookie-aware client
        const { farmId, userId } = await getMyFarmIdOrThrow(supabaseAuth);
        const cityId = await getMadridCityId();

        // ------------------------------------------------------------
        // Fetch page HTML
        // ------------------------------------------------------------
        const pageRes = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; IsifarmerCRM/1.0)",
                Accept: "text/html,*/*",
            },
            cache: "no-store",
        });

        if (!pageRes.ok) {
            throw new Error(`Failed to fetch URL (${pageRes.status})`);
        }

        const html = await pageRes.text();
        const text = htmlToText(html);

        const prompt = `
You are helping an urban farmer CRM create a restaurant profile from a restaurant website or menu page.

Rules:
- Do NOT invent facts.
- If a field is not present, return null (for nullable fields).
- Cuisine slugs must be short kebab-case (e.g., modern-european, creative-tapas, japanese-modern, nikkei).
- Use "unknown" for service_style if unclear.
- Use plating_intensity = unknown if unclear.

We are focusing on Madrid (Spain) for MVP, but the content may not always mention Madrid explicitly.

Extract:
- restaurant name
- website_url (or null)
- address (or null)
- neighborhood_guess (or null)
- cuisine_slugs array
- cuisine_fit: high|medium|low for microgreens + premium mushrooms
- service_style: fine_dining|casual|fast_casual|mixed|unknown
- price_architecture numbers if present (else nulls)
- menu_signals.plating_intensity
- off_menu_signals booleans based on language (chef selection, seasonal specials, market driven, frequent specials)
- sustainability_signals booleans for km0/local/seasonal

URL: ${url}

PAGE TEXT:
${text}
    `.trim();

        // ------------------------------------------------------------
        // GPT-5 Structured Outputs (Zod-enforced)
        // ------------------------------------------------------------
        const response = await openai.responses.parse({
            model: "gpt-5",
            reasoning: { effort: "medium" },
            input: [
                {
                    role: "system",
                    content: "Extract accurate structured restaurant profiles. Do not hallucinate.",
                },
                { role: "user", content: prompt },
            ],
            text: {
                format: zodTextFormat(RestaurantProfileZ, "restaurant_profile"),
            },
        });

        const profile = response.output_parsed;
        if (!profile) {
            throw new Error("GPT-5 did not return structured output (output_parsed was empty).");
        }

        // ------------------------------------------------------------
        // Insert into DB
        // Choose ONE:
        // - supabaseAuth: respects RLS as the user
        // - supabaseAdmin: bypasses RLS (server-only)
        // ------------------------------------------------------------
        const supabaseAdmin = createSupabaseAdminClient();
        const supabase = supabaseAdmin; // ← change to supabaseAuth if your RLS allows inserts

        const { data: restaurant, error: restaurantError } = await supabase
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

        if (restaurantError) throw new Error(restaurantError.message);

        const restaurantId = restaurant.id as string;

        const { error: menuError } = await supabase.from("menus").insert({
            farm_id: farmId,
            restaurant_id: restaurantId,
            source_url: url,
            parsed: profile,
        });

        if (menuError) {
            console.warn("menus insert failed:", menuError.message);
        }

        return NextResponse.json({ restaurant_id: restaurantId });
    } catch (e: unknown) {
        return NextResponse.json({ error: getErrorMessage(e) }, { status: 400 });
    }
}
