import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

export async function middleware(req: NextRequest) {
    const { supabase, res } = await createSupabaseMiddlewareClient(req);

    const { data } = await supabase.auth.getUser();
    const user = data.user;

    const pathname = req.nextUrl.pathname;

    const protectedPaths = ["/dashboard", "/restaurant", "/customers", "/settings"];
    const isProtected = protectedPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));

    console.log("isProtected:", isProtected, "Pathname:", pathname, "User:", user);

    if (isProtected) {
        if (!user) {
            const url = req.nextUrl.clone();
            url.pathname = "/login";
            url.searchParams.set("next", pathname);
            return NextResponse.redirect(url);
        }

        // If logged in but not onboarded, send to onboarding
        const { data: memberships } = await supabase
            .from("farm_memberships")
            .select("farm_id")
            .limit(1);

        console.log("Memberships:", memberships);

        if (!memberships || memberships.length === 0) {
            const url = req.nextUrl.clone();
            url.pathname = "/onboarding";
            return NextResponse.redirect(url);
        } else if (pathname === "/login" && user) {
            const url = req.nextUrl.clone();
            url.pathname = "/gate";
            return NextResponse.redirect(url);
        }
    }

    return res;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
