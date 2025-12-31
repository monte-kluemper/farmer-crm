import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type RestaurantRow = {
    id: string;
    name: string;
    stage: string;
    lead_score: number | null;
    address: string | null;
    website_url: string | null;
    updated_at: string;
};

function StageBadge({ stage }: { stage: string }) {
    return <Badge variant="secondary">{stage.replaceAll("_", " ")}</Badge>;
}

export default async function RestaurantPage() {
    const supabase = await createSupabaseServerClient();

    const { data: restaurants, error } = await supabase
        .from("restaurants")
        .select("id,name,stage,lead_score,address,website_url,updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold">Restaurants</h1>
                    <p className="text-sm text-muted-foreground">
                        Manage leads and customers. Use “Find restaurants” to discover prospects or “Add restaurant” to generate a profile from a URL.
                    </p>
                </div>

                <div className="flex gap-2">
                    <Button asChild variant="secondary">
                        <Link href="/restaurant/find">Find restaurants</Link>
                    </Button>
                    <Button asChild>
                        <Link href="/restaurant/new">Add restaurant</Link>
                    </Button>
                </div>
            </div>

            {error ? (
                <Card className="border-red-200">
                    <CardHeader>
                        <CardTitle className="text-base">Data error</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-red-700">
                        {error.message}
                    </CardContent>
                </Card>
            ) : null}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Your restaurants {restaurants ? `(${restaurants.length})` : ""}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {!restaurants || restaurants.length === 0 ? (
                        <div className="rounded-lg border p-4 space-y-2">
                            <div className="font-medium">No restaurants yet</div>
                            <div className="text-sm text-muted-foreground">
                                Add your first restaurant by URL, or search for prospects to contact.
                            </div>
                            <div className="pt-2 flex gap-2">
                                <Button asChild variant="secondary" size="sm">
                                    <Link href="/restaurants/find">Find restaurants</Link>
                                </Button>
                                <Button asChild size="sm">
                                    <Link href="/restaurants/new">Add restaurant</Link>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        restaurants.map((r: RestaurantRow) => (
                            <div key={r.id} className="rounded-lg border p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{r.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {r.address ?? "—"}
                                            {" · "}
                                            Score <span className="font-medium">{r.lead_score ?? "—"}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <StageBadge stage={r.stage} />
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={`/restaurants/${r.id}`}>Open</Link>
                                        </Button>
                                    </div>
                                </div>

                                {r.website_url ? (
                                    <div className="pt-2 text-xs text-muted-foreground">
                                        Website:{" "}
                                        <a
                                            className="underline underline-offset-2"
                                            href={r.website_url}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {r.website_url}
                                        </a>
                                    </div>
                                ) : null}
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
