import { openai } from "@/lib/openai/server";
import type { ScrapeSources } from "@/lib/scrape/scrapeRestaurantSources";

function extractFirstJsonObject(text: string): any {
    // Find the first {...} block and parse it.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
        throw new Error("No JSON object found in model output");
    }
    const slice = text.slice(start, end + 1);
    return JSON.parse(slice);
}

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
  "chef_name_missing" and/or "manager_name_missing".`;

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

Guidance:
- cuisine_slugs: infer from text (simple slugs like "spanish", "tapas", "italian", "japanese").
- geo.distance_km: if not provided, use null and set delivery_feasible=false unless sources clearly indicate proximity.
- people: extract chef/manager/owner/procurement if explicitly mentioned. Do not guess.
- Provide confidence 0..1 per person and overall lead_features confidence fields.
- Keep lead_features numeric fields within 0..1 and rubric scores integers 0..5.
Return ONLY the JSON object.`;

    const resp = await openai.responses.create({
        model: "gpt-5",
        input: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        // Keep it deterministic-ish
        temperature: 0.2,
    });

    const text =
        resp.output_text ??
        (() => {
            // fallback: try to gather text from output parts
            const parts: string[] = [];
            for (const item of resp.output ?? []) {
                // @ts-expect-error - output shape varies
                for (const c of item?.content ?? []) parts.push(c?.text ?? "");
            }
            return parts.join("\n");
        })();

    return extractFirstJsonObject(text);
}
