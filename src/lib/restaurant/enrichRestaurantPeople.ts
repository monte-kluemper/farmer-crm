// src/lib/restaurant/enrichRestaurantPeopleWithGPT.ts
import { gptEnrichRestaurantPeople } from "@/lib/gpt/gptEnrichRestaurantPeople";

/**
 * Normalized person record to persist into public.restaurant_people
 * (matches your earlier approach).
 */
export type EnrichedPerson = {
    role: "chef" | "manager";
    full_name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    source_url: string | null;
    source_type: "website" | "linkedin" | "press" | "directory" | "social" | "other";
    evidence_excerpt: string;
    confidence: number; // 0..1
};

type GptPeopleOutput = {
    people: EnrichedPerson[];
    missing_info: Array<"chef_name_missing" | "manager_name_missing">;
};

function safeUrl(url?: string | null) {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    return hasProtocol ? trimmed : `https://${trimmed}`;
}

/**
 * A very light sanitizer to protect your DB from bad outputs.
 * (Structured outputs should already enforce shape.)
 */
function normalizePeople(raw: unknown): GptPeopleOutput {
    const obj = raw as Partial<GptPeopleOutput>;
    const people = Array.isArray(obj?.people) ? obj!.people : [];
    const missing_info = Array.isArray(obj?.missing_info) ? obj!.missing_info : [];

    const normalizedPeople: EnrichedPerson[] = people
        .filter((p) => p && (p.role === "chef" || p.role === "manager") && typeof p.full_name === "string" && p.full_name.trim())
        .map((p) => ({
            role: p.role,
            full_name: p.full_name.trim(),
            title: p.title ?? null,
            email: p.email ?? null,
            phone: p.phone ?? null,
            linkedin_url: safeUrl(p.linkedin_url),
            source_url: safeUrl(p.source_url),
            source_type: (p.source_type ?? "other") as EnrichedPerson["source_type"],
            evidence_excerpt: (p.evidence_excerpt ?? "").slice(0, 240),
            confidence: typeof p.confidence === "number" ? Math.min(1, Math.max(0, p.confidence)) : 0.5,
        }));

    const normalizedMissing: GptPeopleOutput["missing_info"] = missing_info.filter(
        (x): x is "chef_name_missing" | "manager_name_missing" =>
            x === "chef_name_missing" || x === "manager_name_missing"
    );

    return { people: normalizedPeople, missing_info: normalizedMissing };
}

/**
 * This is the "external research" enrichment step for chef/manager contacts.
 *
 * NOTE: This function does NOT fetch/search the web itself.
 * It expects you to pass in "external source text" (snippets, press excerpts, directory text, etc.)
 * that you already collected upstream.
 *
 * If you want it to also perform web search itself, wire in your own search/scrape pipeline
 * and pass the resulting text into `sources`.
 */
export async function enrichRestaurantPeople(args: {
    restaurantName: string;
    city?: string | null;
    websiteUrl?: string | null;
    instagramUrl?: string | null;

    /**
     * Text you gathered from outside the restaurant website
     * (search result snippets, LinkedIn previews, press articles, directories, etc.)
     */
    sources?: {
        search_snippets?: string | null;
        press?: string | null;
        directories?: string | null;
        social?: string | null;
    };
}) {
    const {
        restaurantName,
        city = null,
        websiteUrl = null,
        instagramUrl = null,
        sources = {},
    } = args;

    const raw = await gptEnrichRestaurantPeople({
        restaurant_name: restaurantName,
        city,
        website_url: websiteUrl,
        instagram_url: instagramUrl,
        sources,
    });

    const { people, missing_info } = normalizePeople(raw);

    return { people, missing_info };
}
