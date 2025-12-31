"use server";

import { redirect } from "next/navigation";

export async function addRestaurantByUrl(formData: FormData) {
    const url = String(formData.get("url") || "").trim();
    if (!url) redirect("/restaurant/new?error=missing_url");

    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/restaurant/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok) {
        redirect(`/restaurant/new?error=${encodeURIComponent(json?.error ?? "Failed to add restaurant")}`);
    }

    redirect(`/restaurant/${json.restaurant_id}?created=1`);
}
