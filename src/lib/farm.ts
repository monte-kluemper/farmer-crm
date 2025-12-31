import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getMyFarmIdOrThrow() {
    const supabase = await createSupabaseServerClient();

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) throw new Error("Not authenticated");

    const { data: membership, error } = await supabase
        .from("farm_memberships")
        .select("farm_id, role")
        .eq("user_id", userData.user.id)
        .order("role", { ascending: true }) // owner likely sorts first depending on your enum/text; ok for MVP
        .limit(1)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!membership?.farm_id) throw new Error("No farm membership found. Complete onboarding.");

    return { farmId: membership.farm_id as string, userId: userData.user.id };
}

export async function getMadridCityId() {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
        .from("cities")
        .select("id")
        .eq("country_code", "ES")
        .eq("name", "Madrid")
        .maybeSingle();

    return (data?.id as string | undefined) ?? null;
}
