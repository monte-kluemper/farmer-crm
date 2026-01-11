"use server";

import { redirect } from "next/navigation";
import { addRestaurantFromUrl } from "@/lib/restaurant/addRestaurantFromUrl";

export async function addRestaurantByUrl(formData: FormData) {
    const url = String(formData.get("url") || "").trim();
    if (!url) redirect("/restaurant/new?error=missing_url");

    try {
        const { restaurantId } = await addRestaurantFromUrl(url);
        redirect(`/restaurant/${restaurantId}?created=1`);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to add restaurant";
        redirect(`/restaurant/new?error=${encodeURIComponent(msg)}`);
    }
}
