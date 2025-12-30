import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export async function POST(request: Request) {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const next = String(form.get("next") ?? "/dashboard");

    if (!email) {
        return NextResponse.redirect(
            new URL("/login?error=Missing%20email", request.url),
            { status: 303 }
        );
    }

    const { supabase } = await createSupabaseRouteClient();

    const origin = new URL(request.url).origin;
    const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
        next
    )}`;

    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
    });

    console.log("Sending magic link to:", email, "redirect:", emailRedirectTo);

    if (error) {
        return NextResponse.redirect(
            new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
            { status: 303 }
        );
    }

    return NextResponse.redirect(new URL("/login?check_email=1", request.url), {
        status: 303,
    });
}
