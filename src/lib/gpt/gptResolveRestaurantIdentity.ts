// src/lib/gpt/gptResolveRestaurantIdentity.ts
import { openai } from "@/lib/openai/server";
import { zodTextFormat } from "openai/helpers/zod";
import { RestaurantIdentityV1 } from "@/lib/schemas/restaurant/restaurantIdentity";
import type { ScrapeSources } from "@/lib/scrape/scrapeRestaurantSources";

export async function gptResolveRestaurantIdentity(args: {
    input_url: string;
    name_hint?: string | null;
    address_hint?: string | null;
    sources: ScrapeSources;
}) {
    const { input_url, name_hint, address_hint, sources } = args;

    const system = `
You are a factual information extraction agent.

Goal:
Identify the single, canonical restaurant entity referenced by the input URL.  If the input URL is not responding, you can available web/search tools to find possible candidates with similar URLs.

Rules:
- Do NOT guess or invent facts.
- Prefer schema.org JSON-LD when present.
- Prefer contact/footer NAP (name, address, phone) over marketing text.
- If multiple restaurants are plausible, set identity_confidence="low"
  and populate candidates[].

Evidence rules:
- evidence.excerpts must be copied verbatim from the sources.
- Each excerpt must be ≤ 240 characters.
- If confidence is "low", candidates[] must not be empty.

STRICT RULES:
- Output ONLY valid JSON. No markdown. No commentary.
- Never invent names, roles, emails, or phone numbers.



ALLOWED SOURCES (ranked by preference):
1) Official restaurant website
2) Official restaurant social accounts
3) Mainstream press interviews/profiles
4) Trusted restaurant guides and critics (explicitly allowed)
5) Other reputable media clearly stating role + name


CONFIDENCE (0..1):
- 0.90–1.00 official site explicit
- 0.80–0.89 mainstream press / top-tier guide explicit
- 0.60–0.79 reputable food media / city guide explicit
- 0.40–0.59 official Instagram explicit
- 0.20–0.39 other web references
- < 0.20 do not include


`.trim();

    const user = `
input_url: ${input_url}
name_hint: ${name_hint ?? "null"}
address_hint: ${address_hint ?? "null"}
`.trim();

    const response = await openai.responses.parse({
        model: "gpt-5",
        reasoning: { effort: "medium" },
        input: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        tools: [{ type: "web_search" }],      // <- critical
        tool_choice: "auto",                 // <- let it use the tool
        response_format: RestaurantIdentityV1,  // <- your strict schema
        text: {
            format: zodTextFormat(RestaurantIdentityV1, "restaurant_identity"),
        },
    });

    return response.output_parsed;
}
