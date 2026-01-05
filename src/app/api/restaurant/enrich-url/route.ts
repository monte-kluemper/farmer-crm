import { NextResponse } from "next/server";
import { z } from "zod";

import {
    RestaurantEnrichOutputV1,
    RestaurantProfileV1,
    RestaurantLeadFeaturesV1,
    RestaurantPeopleCandidatesV1,
    type RestaurantLeadFeaturesV1 as RestaurantLeadFeaturesV1Type,
    type RestaurantPersonCandidateV1 as RestaurantPersonCandidateV1Type,
} from "@/lib/schemas/restaurant";
import { scrapeRestaurantSources } from "@/lib/scrape/scrapeRestaurantSources";
import { gptEnrichRestaurant } from "@/lib/gpt/gptEnrichRestaurant";
import { scoreRestaurantLead, DEFAULT_WEIGHTS_V1 } from "@/lib/leadScoring";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Q = z.object({
    url: z.url({ message: "Invalid website URL" }),
    commit: z.string().optional(), // "1" to commit
    radius_km: z.string().optional(),
});

export async function GET(req: Request) {
    const u = new URL(req.url);
    const q = Q.parse({
        url: u.searchParams.get("url"),
        commit: u.searchParams.get("commit") ?? "0",
        radius_km: u.searchParams.get("radius_km") ?? "8",
    });

    const commit = q.commit === "1";
    const radius_km = Math.max(1, Number(q.radius_km || 8));

    // Default target products for quick tests; change to your real set
    const target_products = ["microgreens", "basil", "edible_flowers", "baby_leaf_mix"];

    //const pipeline = { stage: "new", last_contacted_at: null, inbound_interest: false };
    const pipeline: RestaurantLeadFeaturesV1Type["signals"]["pipeline"] = {
        stage: "new",
        last_contacted_at: null,
        inbound_interest: false,
    };

    // 1) scrape
    const sources = await scrapeRestaurantSources(q.url);

    // 2) GPT enrich
    const raw = await gptEnrichRestaurant({
        website_url: q.url,
        restaurant_name_hint: null,
        address_hint: null,
        pipeline,
        radius_km,
        target_products,
        sources,
    });

    const enriched = RestaurantEnrichOutputV1.parse(raw);

    // force pipeline to current
//    enriched.lead_features.signals.pipeline = pipeline as any;
    enriched.lead_features.signals.pipeline = pipeline;

    // 3) score
    const score = scoreRestaurantLead(enriched.lead_features, {
        radius_km,
        weights: DEFAULT_WEIGHTS_V1,
    });

    // 4) optional commit
    if (commit) {
        const supabase = await createSupabaseServerClient();

        const profile = RestaurantProfileV1.parse(enriched.profile);
        const people = RestaurantPeopleCandidatesV1.parse(enriched.people);
        //const lead_features = RestaurantLeadFeaturesV1.parse(enriched.lead_features);
        RestaurantLeadFeaturesV1.parse(enriched.lead_features);

        // Upsert restaurant
        const { data: restaurantRow, error: upsertErr } = await supabase
            .from("restaurants")
            .upsert(
                {
                    website_url: q.url,
                    name: profile.name,
                    address: profile.address ?? null,
                    city: profile.city ?? null,
                    neighborhood_guess: profile.neighborhood_guess ?? null,
                    service_style: profile.service_style,
                    price_tier: profile.price_tier,
                    cuisine_slugs: profile.cuisine_slugs,
                    contact: profile.contact,
                    locations: profile.locations,
                },
                { onConflict: "website_url" }
            )
            .select("id")
            .single();

        if (upsertErr) throw upsertErr;
        const restaurant_id = restaurantRow.id as string;

        // People upsert
        if (people.length > 0) {
            const rows = people.map((p: RestaurantPersonCandidateV1Type) => ({
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
                .upsert(rows, { onConflict: "restaurant_id,role,full_name,source_url" });

            if (peopleErr) throw peopleErr;
        }

        // Snapshot score (no hashes here—quick test; your /enrich route uses hashes)
        const { error: scoreErr } = await supabase.from("restaurant_score_snapshots").insert({
            website_url: q.url,
            restaurant_id,
            features_hash: "quick_test",
            radius_km,
            weights_version: "default_v1",
            score_json: score,
        });

        if (scoreErr) throw scoreErr;
    }

    return NextResponse.json({
        ok: true,
        committed: commit,
        resolved_urls: sources.resolved_urls,
        profile: enriched.profile,
        people: enriched.people,
        lead_features: enriched.lead_features,
        score,
    });
}
