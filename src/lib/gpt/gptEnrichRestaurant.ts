// src/lib/gpt/gptEnrichRestaurant.ts
import { openai } from "@/lib/openai/server";
import type { ScrapeSources } from "@/lib/scrape/scrapeRestaurantSources";
import { RestaurantEnrichOutputV1JsonSchema } from "@/lib/schemas/restaurant";

export async function gptEnrichRestaurant(args: {
    website_url: string;
    restaurant_name_hint: string | null;
    address_hint: string | null;
    pipeline: { stage: string; last_contacted_at: string | null; inbound_interest: boolean };
    radius_km: number;
    target_products: string[];
    sources: ScrapeSources;
}): Promise<unknown> {
    const {
        website_url,
        restaurant_name_hint,
        address_hint,
        pipeline,
        radius_km,
        target_products,
        sources,
    } = args;

    const system = `You are a careful data-extraction assistant for a restaurant CRM.

Return ONLY valid JSON, no markdown, no commentary.
Do not add keys not requested. If unknown, use null or "unknown" enums.
Never invent facts not supported by the provided sources.

You will output:
- profile (RestaurantProfileV1)
- lead_features (RestaurantLeadFeaturesV1)
- people (array of RestaurantPersonCandidateV1)

Evidence rules:
- lead_features.evidence[].excerpt must be copied from provided sources and <= 240 chars.
- people[].evidence_excerpt must be copied from provided sources and <= 240 chars.
- If you cannot find chef/manager names, return an empty people array and include missing_info items:
  "chef_name_missing" and/or "manager_name_missing".
- For service_style, you MUST output one of: fine_dining, casual, fast_casual, takeaway, bar_cafe, hotel, unknown.
- For price_tier, you MUST output one of: low, mid, high, unknown.`;

    const user = `Generate a JSON object with:
{
  "profile": RestaurantProfileV1,
  "lead_features": RestaurantLeadFeaturesV1,
  "people": RestaurantPeopleCandidatesV1
}

Context:
- City: Madrid
- target_products: ${JSON.stringify(target_products)}
- delivery radius_km: ${radius_km}

Restaurant input:
- website_url: ${website_url}
- name_hint: ${restaurant_name_hint ?? "null"}
- address_hint: ${address_hint ?? "null"}

Pipeline input (must be copied verbatim into lead_features.signals.pipeline):
- stage: ${pipeline.stage}
- last_contacted_at: ${pipeline.last_contacted_at ?? "null"}
- inbound_interest: ${pipeline.inbound_interest ? "true" : "false"}

Sources (do not assume anything beyond these):

[Source A: homepage text]
${sources.homepage ?? ""}

[Source B: menu text]
${sources.menu ?? ""}

[Source C: about/team text]
${sources.about ?? ""}

[Source D: contact text]
${sources.contact ?? ""}

[Source E: listing snippet text]
${sources.listing ?? ""}

[Source F: JSON-LD blocks (raw)]
${sources.jsonld ?? ""}

Return ONLY the JSON object.`;

    const resp = await openai.responses.create({
        model: "gpt-5",
        input: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        // Structured output (Responses API)
        text: {
            format: {
                type: "json_schema",
                name: RestaurantEnrichOutputV1JsonSchema.name,
                schema: RestaurantEnrichOutputV1JsonSchema.schema,
                strict: false,
            },
        },
    } as unknown as Parameters<typeof openai.responses.create>[0]); // keeps TS happy across SDK versions

    // SDK versions vary: some expose output_parsed, others only output_text.
    const parsed = (resp as unknown as { output_parsed?: unknown }).output_parsed;
    if (parsed) return parsed;

    const outputText = (resp as unknown as { output_text?: string }).output_text ?? "";
    if (!outputText) throw new Error("Model returned no output_text and no output_parsed.");

    // Fallback parse (should be rare if schema format is supported)
    const start = outputText.indexOf("{");
    const end = outputText.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found in output_text");
    return JSON.parse(outputText.slice(start, end + 1)) as unknown;
}
