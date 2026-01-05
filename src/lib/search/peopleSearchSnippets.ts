export async function peopleSearchSnippets(_args: {
    website_url: string;
    restaurant_name: string;
    city_hint: string;
}): Promise<string> {
    // Quick-test mode: no external search provider wired.
    // Return empty so the pipeline still works without extra calls.
    return "";
}
