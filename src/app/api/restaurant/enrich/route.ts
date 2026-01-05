import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import crypto from "crypto";

import {
    RestaurantEnrichOutputV1,
    RestaurantLeadFeaturesV1 as LeadFeaturesSchema,
    RestaurantProfileV1,
    RestaurantPeopleCandidatesV1,
} from "@/lib/schemas/restaurant";
import { scoreRestaurantLead, DEFAULT_WEIGHTS_V1 } from "@/lib/leadScoring";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Implement these in your codebase:
import { scrapeRestaurantSources } from "@/lib/scrape/scrapeRestaurantSources";
import { gptEnrichRestaurant } from "@/lib/gpt/gptEnrichRestaurant";
// Optional people search (only used when needed):
import { peopleSearchSnippets } from "@/lib/search/peopleSearchSnippets";
import { gptExtractPeopleFromSnippets } from "@/lib/gpt/gptExtractPeopleFromSnippets";

export const runtime = "nodejs";

const ReqSchema = z.object({
    mode: z.enum(["dry_run", "commit"]).default("dry_run"),
    website_url: z.string().url(),
    restaurant_name_hint: z.string().nullable().optional(),
    address_hint: z.string().nullable().optional(),

    pipeline: z.object({
        stage: z.enum(["new", "researched", "contacted", "responded", "meeting_set", "won", "lost"]),
        last_contacted_at: z.string().datetime().nullable(),
        inbound_interest: z.boolean().default(false),
    }),

    radius_km: z.number().positive().default(8),
    target_products: z.array(z.string()).min(1),

    force_refresh: z.boolean().default(false),
    deep_people_enrich: z.boolean().default(false), // if true, do people search when missing
});

function sha256(s: string) {
    return crypto.createHash("sha256").update(s).digest("hex");
}

function normalizeText(s: string) {
    return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function stableJsonHash(value: unknown) {
    // basic stable stringification: sort arrays where it matters before hashing
    return sha256(JSON.stringify(value));
}

export async function POST(req: Request) {
    const supabase = createSupabaseServerClient();

    try {
        const input = ReqSchema.parse(await req.json());

        const schema_version = "v1";
        const prompt_version = "enrich_v1.0"; // bump when you change prompts/logic

        // 1) Scrape sources (you can add TTL-based reuse later)
        const sources = await scrapeRestaurantSources(input.website_url);

        const combinedText = normalizeText(
            [sources.homepage, sources.menu, sources.about, sources.contact, sources.listing]
                .filter(Boolean)
                .join("\n\n")
        );

        const content_hash = sha256(combinedText);
        const settings_hash = stableJsonHash({
            schema_version,
            prompt_version,
            target_products: [...input.target_products].sort(),
        });
        const features_hash = sha256(content_hash + settings_hash);

        // 2) Try cache reuse from restaurant_enrichments
        if (!input.force_refresh) {
            const { data: cached } = await supabase
                .from("restaurant_enrichments")
                .select("id, features_hash, profile_json, lead_features_json, people_json")
                .eq("website_url", input.website_url)
                .eq("features_hash", features_hash)
                .order("generated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (cached?.lead_features_json) {
                const profile = cached.profile_json ? RestaurantProfileV1.parse(cached.profile_json) : null;
                const lead_features = LeadFeaturesSchema.parse(cached.lead_features_json);
                const people = cached.people_json ? RestaurantPeopleCandidatesV1.parse(cached.people_json) : [];

                // Ensure pipeline is current (don’t rely on cached pipeline)
                lead_features.signals.pipeline = input.pipeline;

                const score = scoreRestaurantLead(lead_features, {
                    radius_km: input.radius_km,
                    weights: DEFAULT_WEIGHTS_V1,
                });

                return NextResponse.json({
                    ok: true,
                    profile,
                    lead_features,
                    people,
                    score,
                    cache: { hit: true, reason: "features_hash_match" },
                    meta: { content_hash, settings_hash, features_hash },
                });
            }
        }

        // 3) GPT enrichment from sources (profile + lead_features + people)
        const gptOutRaw = await gptEnrichRestaurant({
            website_url: input.website_url,
            restaurant_name_hint: input.restaurant_name_hint ?? null,
            address_hint: input.address_hint ?? null,
            pipeline: input.pipeline,
            radius_km: input.radius_km,
            target_products: input.target_products,
            sources,
        });

        const gptOut = RestaurantEnrichOutputV1.parse(gptOutRaw);

        // Always enforce current pipeline
        gptOut.lead_features.signals.pipeline = input.pipeline;

        // 4) If people missing and deep_people_enrich is enabled, do a targeted search + extraction
        let people = gptOut.people;
        const needsChef = !people.some((p) => ["chef", "head_chef", "executive_chef"].includes(p.role));
        const needsManager = !people.some((p) => ["general_manager", "restaurant_manager", "owner"].includes(p.role));

        if (input.deep_people_enrich && (needsChef || needsManager)) {
            const snippets = await peopleSearchSnippets({
                website_url: input.website_url,
                restaurant_name: gptOut.profile.name,
                city_hint: gptOut.profile.city ?? "Madrid",
            });

            if (snippets && snippets.trim().length > 0) {
                const extraPeopleRaw = await gptExtractPeopleFromSnippets({
                    restaurant_name: gptOut.profile.name,
                    website_url: input.website_url,
                    snippets,
                });

                const extraPeople = RestaurantPeopleCandidatesV1.parse(extraPeopleRaw);

                // merge + dedupe (role+name+source_url)
                const key = (p: any) => `${p.role}|${p.full_name}|${p.source_url ?? ""}`;
                const merged = new Map < string, any> ();
                for (const p of [...people, ...extraPeople]) merged.set(key(p), p);
                people = Array.from(merged.values()).slice(0, 8);
            }
        }

        // 5) Score
        const score = scoreRestaurantLead(gptOut.lead_features, {
            radius_km: input.radius_km,
            weights: DEFAULT_WEIGHTS_V1,
        });

        // 6) Commit optional: upsert restaurant + enrichment + people + score snapshot
        if (input.mode === "commit") {
            // a) Upsert restaurant row
            const restaurantUpsert = {
                website_url: input.website_url,
                name: gptOut.profile.name,
                address: gptOut.profile.address ?? null,
                city: gptOut.profile.city ?? null,
                neighborhood_guess: gptOut.profile.neighborhood_guess ?? null,
                service_style: gptOut.profile.service_style,
                price_tier: gptOut.profile.price_tier,
                cuisine_slugs: gptOut.profile.cuisine_slugs,
                contact: gptOut.profile.contact,
                locations: gptOut.profile.locations,
            };

            const { data: restaurantRow, error: upsertErr } = await supabase
                .from("restaurants")
                .upsert(restaurantUpsert, { onConflict: "website_url" })
                .select("id")
                .single();

            if (upsertErr) throw upsertErr;

            const restaurant_id = restaurantRow.id as string;

            // b) Insert enrichment row (cache/audit)
            const { error: enrichErr } = await supabase.from("restaurant_enrichments").insert({
                website_url: input.website_url,
                restaurant_id,
                kind: "profile_and_features",
                schema_version,
                prompt_version,
                target_products: input.target_products,
                content_hash,
                settings_hash,
                features_hash,
                profile_json: gptOut.profile,
                lead_features_json: gptOut.lead_features,
                people_json: people,
                generated_at: gptOut.lead_features.generated_at,
            });

            if (enrichErr) throw enrichErr;

            // c) Upsert people rows (dedupe enforced by unique index)
            if (people.length > 0) {
                const peopleRows = people.map((p) => ({
                    restaurant_id,
                    role: p.role,
                    full_name: p.full_name,
                    title: p.title ?? null,
                    email: p.email ?? null,
                    phone: p.phone ?? null,
                    linkedin_url: p.linkedin_url ?? null,
                    source_url: p.source_url ?? null,
                    source_type: p.source_type,
                    evidence_excerpt: p.evidence_excerpt,
                    confidence: p.confidence,
                    last_verified_at: new Date().toISOString(),
                }));

                const { error: peopleErr } = await supabase
                    .from("restaurant_people")
                    .upsert(peopleRows, { onConflict: "restaurant_id,role,full_name,source_url" });

                if (peopleErr) throw peopleErr;
            }

            // d) Insert score snapshot
            const { error: scoreErr } = await supabase.from("restaurant_score_snapshots").insert({
                website_url: input.website_url,
                restaurant_id,
                features_hash,
                radius_km: input.radius_km,
                weights_version: "default_v1",
                score_json: score,
            });

            if (scoreErr) throw scoreErr;
        }

        return NextResponse.json({
            ok: true,
            profile: gptOut.profile,
            lead_features: gptOut.lead_features,
            people,
            score,
            cache: { hit: false, reason: "fresh_enrichment" },
            meta: { content_hash, settings_hash, features_hash },
        });
    } catch (e: any) {
        if (e instanceof ZodError) {
            return NextResponse.json({ ok: false, error: "Validation failed", details: e.flatten() }, { status: 422 });
        }
        return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
    }
}
