import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export type RestaurantProfileCardProps = {
    name?: string | null;
    address?: string | null;

    stage?: string | null;
    cuisineFit?: string | null;
    aiConfidence?: string | null;

    serviceStyle?: string | null;
    priceTier?: string | null;

    city?: string | null;
    cityId?: string | null;

    neighborhoodGuess?: string | null;
    neighborhoodId?: string | null;

    leadScore?: number | null;
    leadScoreExplanation?: string | null;

    createdAt?: string | null;
    updatedAt?: string | null;
};

function formatDate(iso?: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="grid grid-cols-3 gap-3 py-2">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className={`col-span-2 text-sm ${mono ? "font-mono" : ""}`}>
                {value ?? <span className="text-muted-foreground">—</span>}
            </div>
        </div>
    );
}

function scoreLabel(score: number) {
    return score >= 80 ? "Excellent" : score >= 65 ? "Strong" : score >= 45 ? "Medium" : score >= 25 ? "Low" : "Very low";
}

export function RestaurantProfileCard(props: RestaurantProfileCardProps) {
    const score = typeof props.leadScore === "number" ? props.leadScore : null;

    return (
        <Card>
            <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">Profile</CardTitle>
                    {props.stage ? <Badge variant="secondary">{props.stage}</Badge> : null}
                    {props.cuisineFit ? <Badge variant="outline">Fit: {props.cuisineFit}</Badge> : null}
                    {props.aiConfidence ? <Badge variant="outline">AI: {props.aiConfidence}</Badge> : null}
                </div>

                <div className="space-y-1">
                    <div className="text-xl font-semibold">{props.name ?? "Restaurant"}</div>
                    <div className="text-sm text-muted-foreground">{props.address ?? "—"}</div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Lead score */}
                <div className="rounded-md border p-3">
                    <div className="text-sm text-muted-foreground">Lead score</div>
                    <div className="mt-1 flex items-end justify-between gap-3">
                        <div className="text-3xl font-semibold">{score ?? "—"}</div>
                        {score != null ? (
                            <Badge variant={score >= 75 ? "default" : score >= 50 ? "secondary" : "outline"}>{scoreLabel(score)}</Badge>
                        ) : null}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{props.leadScoreExplanation ?? "—"}</div>
                </div>

                <Separator />

                {/* Quick facts */}
                <div className="divide-y">
                    <Field label="Service style" value={props.serviceStyle ?? "—"} />
                    <Field label="Price tier" value={props.priceTier ?? "—"} />
                    <Field
                        label="City"
                        value={props.city ?? (props.cityId ? <span className="font-mono">{props.cityId}</span> : "—")}
                    />
                    <Field
                        label="Neighborhood"
                        value={
                            props.neighborhoodGuess ??
                            (props.neighborhoodId ? <span className="font-mono">{props.neighborhoodId}</span> : "—")
                        }
                    />
                    <Field label="Created" value={formatDate(props.createdAt)} />
                    <Field label="Updated" value={formatDate(props.updatedAt)} />
                </div>
            </CardContent>
        </Card>
    );
}
