import { openai } from "@/lib/openai/server";

function extractFirstJsonArray(text: string): any {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) throw new Error("No JSON array found");
    return JSON.parse(text.slice(start, end + 1));
}

export async function gptExtractPeopleFromSnippets(args: {
    restaurant_name: string;
    website_url: string;
    snippets: string;
}): Promise<unknown> {
    const system = `You extract people details from search result snippets.
Return ONLY a JSON array. No markdown. No guessing.`;

    const user = `Extract chef/manager/owner/procurement people for this restaurant from the snippets below.
Restaurant: ${args.restaurant_name} (${args.website_url})

Snippets:
${args.snippets}

Return ONLY a JSON array of RestaurantPersonCandidateV1.
If none are found, return [].`;

    const resp = await openai.responses.create({
        model: "gpt-5",
        input: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        temperature: 0.2,
    });

    const text = resp.output_text ?? "[]";
    return extractFirstJsonArray(text);
}
