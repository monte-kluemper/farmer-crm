import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GatePage() {
    const supabase = await createSupabaseServerClient();

    // Middleware should guarantee this, but keep it safe
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) redirect("/login");

    const { data: memberships } = await supabase
        .from("farm_memberships")
        .select("farm_id")
        .eq("user_id", user.id)
        .limit(1);

    const onboarded = memberships && memberships.length > 0;

    if (!onboarded) redirect("/onboarding");

    redirect("/dashboard");
}
