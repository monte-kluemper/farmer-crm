import { createBrowserClient } from "@supabase/ssr";

export async function createSupabaseBrowserClient() {
    return await createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}
