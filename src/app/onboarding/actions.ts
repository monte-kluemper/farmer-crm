// src/app/onboarding/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createFarm(formData: FormData) {
    const supabase = await createSupabaseServerClient();

    const farmName = String(formData.get("farm_name") ?? "").trim();
    if (!farmName) return;

    // Call your Postgres function
    const { data: farmId, error } = await supabase.rpc(
        "create_my_farm",
        { p_farm_name: farmName }
    );

    if (error) {
        throw new Error(error.message);
    }

    // Go back through the gate
    redirect("/gate");
}
