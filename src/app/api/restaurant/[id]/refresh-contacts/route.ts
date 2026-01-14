import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enrichPeopleAndPersist } from "@/lib/restaurant/enrichPeopleAndPersist";
import { revalidatePath } from "next/cache";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: restaurantId } = await params;

    const supabase = await createSupabaseServerClient();

    const { data: r, error } = await supabase
        .from("restaurants")
        .select("id,farm_id,name,city,website_url,instagram_url")
        .eq("id", restaurantId)
        .single();

    if (error || !r) {
        return NextResponse.json({ ok: false, error: error?.message ?? "Not found" }, { status: 404 });
    }

    // TODO: authz check: ensure user can refresh for this farm_id

    await enrichPeopleAndPersist({
        farmId: r.farm_id,
        restaurantId: r.id,
        restaurantName: r.name,
        city: r.city,
        websiteUrl: r.website_url,
        instagramUrl: r.instagram_url,
        // optionally pass external sources if you collect them server-side
        peopleSources: {},
    });

    revalidatePath(`/restaurant/${restaurantId}`);

    return NextResponse.json({ ok: true });
}
