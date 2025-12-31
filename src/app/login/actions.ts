"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithMagicLink(formData: FormData) {
    const email = String(formData.get("email") || "").trim();
    const next = String(formData.get("next") || "/gate");

    if (!email) redirect("/login?error=missing_email");

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(
                next
            )}`,
        },
    });

    if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

    redirect("/login?check_email=1");
}
