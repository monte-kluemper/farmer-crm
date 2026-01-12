import { openai } from "@/lib/openai/server";

/**
 * Output shape is intentionally narrow and safe to upsert
 * into restaurant_people.
 */
export const RestaurantPeopleEnrichOutputV1JsonSchema = {
    name: "restaurant_people_enrich_v1",
    strict: true,
    schema: {
        type: "object",
        additionalProperties: false,
        required: ["people", "missing_info"],
        properties: {
            people: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                        "role",
                        "full_name",
                        "title",
                        "email",
                        "phone",
                        "linkedin_url",
                        "source_url",
                        "source_type",
                        "evidence_excerpt",
                        "confidence",
                    ],
                    properties: {
                        role: {
                            type: "string",
                            enum: ["chef", "manager"],
                        },
                        full_name: { type: "string" },
                        title: { type: ["string", "null"] },
                        email: { type: ["string", "null"] },
                        phone: { type: ["string", "null"] },
                        linkedin_url: { type: ["string", "null"] },
                        source_url: { type: ["string", "null"] },
                        source_type: {
                            type: "string",
                            enum: ["website", "linkedin", "press", "directory", "social", "other"],
                        },
                        evidence_excerpt: {
                            type: "string",
                            description: "Copied verbatim from a source, <= 240 chars",
                        },
                        confidence: {
                            type: "number",
                            minimum: 0,
                            maximum: 1,
                        },
                    },
                },
            },
            missing_info: {
                type: "array",
                items: {
                    type: "string",
                    enum: ["chef_name_missing", "manager_name_missing"],
                },
            },
        },
    },
} as const;

export async function gptEnrichRestaurantPeople(args: {
    restaurant_name: string;
    city: string | null;
    website_url: string | null;
    instagram_url?: string | null;

    /**
     * Pre-collected text from outside the website:
     * Google snippets, press, directories, LinkedIn previews, etc.
     * You stay in control of scraping/search upstream.
     */
    sources: {
        search_snippets?: string | null;
        press?: string | null;
        directories?: string | null;
        social?: string | null;
    };
}): Promise<unknown> {
    const {
        restaurant_name,
        city,
        website_url,
        instagram_url,
        sources,
    } = args;

    const system = `
You are a careful research assistant for a restaurant CRM.

Your task:
Identify the CHEF and the GENERAL MANAGER (or equivalent leadership roles).

Rules:
- Return ONLY valid JSON. No markdown. No commentary.
- Never invent names, emails, or phone numbers.
- Only include a person if supported by a source + evidence excerpt.
- Prefer official or high-confidence sources (website, press, LinkedIn).
- Evidence excerpts must be copied verbatim and <= 240 characters.
- If a role cannot be found, include it in missing_info.
- Confidence must reflect source quality and clarity (0..1).

Roles:
- chef = executive chef, head chef, chef-owner
- manager = general manager, restaurant manager, operations manager
`;

    const user = `
Produce a JSON object:

{
  "people": RestaurantPeople[],
  "missing_info": string[]
}

Restaurant context:
- name: ${restaurant_name}
- city: ${city ?? "unknown"}
- website_url: ${website_url ?? "null"}
- instagram_url: ${instagram_url ?? "null"}

External research sources (do NOT assume beyond these):

[Search snippets]
${sources.search_snippets ?? ""}

[Press / articles]
${sources.press ?? ""}

[Directories / listings]
${sources.directories ?? ""}

[Social / LinkedIn previews]
${sources.social ?? ""}

Important:
- If no chef is found → include "chef_name_missing"
- If no manager is found → include "manager_name_missing"
- It is acceptable for people[] to be empty.
- Do not guess based on restaurant fame or cuisine.
- Return ONLY the JSON object.
`;

    const resp = await openai.responses.create(
        {
            model: "gpt-5",
            input: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: RestaurantPeopleEnrichOutputV1JsonSchema.name,
                    schema: RestaurantPeopleEnrichOutputV1JsonSchema.schema,
                    strict: true,
                },
            },
        } as unknown as Parameters<typeof openai.responses.create>[0]
    );

    // SDK variance handling (same pattern you already use)
    const parsed = (resp as unknown as { output_parsed?: unknown }).output_parsed;
    if (parsed) return parsed;

    const outputText = (resp as unknown as { output_text?: string }).output_text ?? "";
    if (!outputText) {
        throw new Error("GPT returned no output_text and no output_parsed.");
    }

    const start = outputText.indexOf("{");
    const end = outputText.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
        throw new Error("No JSON object found in GPT output_text.");
    }

    return JSON.parse(outputText.slice(start, end + 1));
}
