import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Use the cookie-aware supabase client (anon key + cookies) that you create in:
 * - Server Components
 * - Server Actions
 * - Route Handlers (API routes)
 */
export async function getMyFarmIdOrThrow(supabaseAuth: SupabaseClient) {
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData.user) throw new Error("Not authenticated");

    const { data: membership, error } = await supabaseAuth
        .from("farm_memberships")
        .select("farm_id, role")
        .eq("user_id", userData.user.id)
        .order("role", { ascending: true }) // MVP: assumes role sorts with owner/admin first
        .limit(1)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!membership?.farm_id) throw new Error("No farm membership found. Complete onboarding.");

    return { farmId: membership.farm_id as string, userId: userData.user.id };
}

/**
 * City lookup does not require user context. Use admin to avoid RLS issues.
 * If your cities table is public-readable, you can switch to the auth client instead.
 */
export async function getMadridCityId() {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data, error } = await supabaseAdmin
        .from("cities")
        .select("id")
        .eq("country_code", "ES")
        .eq("name", "Madrid")
        .maybeSingle();

    if (error) throw new Error(error.message);

    return (data?.id as string | undefined) ?? null;
}
