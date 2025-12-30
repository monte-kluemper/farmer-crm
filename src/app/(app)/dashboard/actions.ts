"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect("/login");
}

export async function seedDemoData() {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("seed_demo_data");

    if (error) {
        redirect(`/dashboard?seed_error=${encodeURIComponent(error.message)}`);
    }

    // Optionally redirect to the new restaurant
    const restaurantId = data?.restaurant_id as string | undefined;
    if (restaurantId) redirect(`/restaurants/${restaurantId}?seeded=1`);

    redirect("/dashboard?seeded=1");
}

