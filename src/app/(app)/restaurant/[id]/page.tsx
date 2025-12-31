import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function RestaurantPage({ params }: { params: { id: string } }) {
    const supabase = createSupabaseServerClient();

    const { data: r, error } = await supabase
        .from("restaurants")
        .select("id,name,stage,lead_score,lead_score_explanation,address,website_url,source_url,updated_at")
        .eq("id", params.id)
        .single();

    return (
        <div className="p-6 space-y-6 max-w-3xl">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold">{r?.name ?? "Restaurant"}</h1>
                    <p className="text-sm text-muted-foreground">{r?.address ?? "—"}</p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/restaurants">Back</Link>
                </Button>
            </div>

            {error ? (
                <Card className="border-red-200">
                    <CardHeader>
                        <CardTitle className="text-base">Data error</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-red-700">{error.message}</CardContent>
                </Card>
            ) : null}

            {r ? (
                <div className="grid gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Lead score</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="text-3xl font-semibold">{r.lead_score ?? "—"}</div>
                            <div className="text-sm text-muted-foreground">
                                {r.lead_score_explanation ?? "—"}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Links</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                            {r.website_url ? (
                                <div>
                                    Website:{" "}
                                    <a className="underline underline-offset-2" href={r.website_url} target="_blank" rel="noreferrer">
                                        {r.website_url}
                                    </a>
                                </div>
                            ) : null}
                            {r.source_url ? (
                                <div>
                                    Source URL:{" "}
                                    <a className="underline underline-offset-2" href={r.source_url} target="_blank" rel="noreferrer">
                                        {r.source_url}
                                    </a>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
