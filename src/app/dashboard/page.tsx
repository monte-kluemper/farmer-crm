import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type HotLeadRow = {
    restaurant_id: string;
    restaurant_name: string;
    city_name: string | null;
    neighborhood_name: string | null;
    stage: string;
    lead_score: number;
    lead_score_explanation: string | null;
    next_due_at: string | null;
    last_activity_at: string | null;
};

type NextActionRow = {
    activity_id: string;
    activity_type: string;
    title: string | null;
    details: string | null;
    due_at: string | null;
    restaurant_id: string;
    restaurant_name: string;
    restaurant_stage: string;
    city_name: string | null;
    neighborhood_name: string | null;
};

type AtRiskRow = {
    restaurant_id: string;
    restaurant_name: string;
    city_name: string | null;
    neighborhood_name: string | null;
    last_order_date: string | null;
    days_since_last_order: number | null;
    negative_feedback_last_60d: number;
    issues_last_60d: number;
    next_due_at: string | null;
    risk_score: number;
    risk_explanation: string | null;
};

function StageBadge({ stage }: { stage: string }) {
    // Keep this simple for MVP
    return <Badge variant="secondary">{stage.replaceAll("_", " ")}</Badge>;
}

export default async function DashboardPage() {
    const supabase = await createSupabaseServerClient();

    // Pull from your views (RLS/tenant-safe)
    const [
        { data: hotLeads, error: hotErr },
        { data: nextActions, error: actErr },
        { data: atRisk, error: riskErr },
    ] = await Promise.all([
        supabase
            .from("v_hot_leads")
            .select(
                "restaurant_id,restaurant_name,city_name,neighborhood_name,stage,lead_score,lead_score_explanation,next_due_at,last_activity_at"
            )
            .order("lead_score", { ascending: false })
            .limit(8),
        supabase
            .from("v_next_actions")
            .select(
                "activity_id,activity_type,title,details,due_at,restaurant_id,restaurant_name,restaurant_stage,city_name,neighborhood_name"
            )
            .order("due_at", { ascending: true })
            .limit(10),
        supabase
            .from("v_at_risk_customers")
            .select(
                "restaurant_id,restaurant_name,city_name,neighborhood_name,last_order_date,days_since_last_order,negative_feedback_last_60d,issues_last_60d,next_due_at,risk_score,risk_explanation"
            )
            .order("risk_score", { ascending: false })
            .limit(8),
    ]);

    // You can choose to throw, but for MVP we'll show a soft error panel.
    const errors = [hotErr, actErr, riskErr].filter(Boolean);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">
                        Focus on the next best restaurants to visit and customers that need
                        attention.
                    </p>
                </div>

                <Button asChild>
                    <Link href="/restaurants/new">Add restaurant</Link>
                </Button>
            </div>

            {errors.length > 0 ? (
                <Card className="border-red-200">
                    <CardHeader>
                        <CardTitle className="text-base">Data error</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-red-700 space-y-1">
                        {errors.map((e, idx) => (
                            <div key={idx}>{e?.message}</div>
                        ))}
                        <div className="text-muted-foreground">
                            This usually means the views are not created yet, RLS is blocking
                            access, or you are not in a farm membership.
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <HotLeadsWidget rows={(hotLeads ?? []) as HotLeadRow[]} />
                <NextActionsWidget rows={(nextActions ?? []) as NextActionRow[]} />
                <AtRiskWidget rows={(atRisk ?? []) as AtRiskRow[]} />
            </div>
        </div>
    );
}

function HotLeadsWidget({ rows }: { rows: HotLeadRow[] }) {
    return (
        <Card className="lg:col-span-1">
            <CardHeader className="space-y-1">
                <CardTitle className="text-base">Hot leads</CardTitle>
                <p className="text-sm text-muted-foreground">
                    High-scoring prospects that are worth a visit.
                </p>
            </CardHeader>

            <CardContent className="space-y-3">
                {rows.length === 0 ? (
                    <EmptyState
                        title="No leads yet"
                        description="Add a restaurant from URL to generate a profile and lead score."
                        href="/restaurants/new"
                        action="Add restaurant"
                    />
                ) : (
                    rows.map((r) => (
                        <div key={r.restaurant_id} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-medium truncate">{r.restaurant_name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {(r.neighborhood_name ?? r.city_name ?? "—") + " · "}Score{" "}
                                        <span className="font-medium">{r.lead_score}</span>
                                    </div>
                                </div>
                                <StageBadge stage={r.stage} />
                            </div>

                            {r.lead_score_explanation ? (
                                <div className="text-sm text-muted-foreground">
                                    {r.lead_score_explanation}
                                </div>
                            ) : null}

                            <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                                <span>Next: {formatDateTime(r.next_due_at)}</span>
                                <Link
                                    className="text-xs underline underline-offset-2"
                                    href={`/restaurants/${r.restaurant_id}`}
                                >
                                    Open
                                </Link>
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}

function NextActionsWidget({ rows }: { rows: NextActionRow[] }) {
    return (
        <Card className="lg:col-span-1">
            <CardHeader className="space-y-1">
                <CardTitle className="text-base">Next actions</CardTitle>
                <p className="text-sm text-muted-foreground">What is due soon.</p>
            </CardHeader>

            <CardContent className="space-y-3">
                {rows.length === 0 ? (
                    <EmptyState
                        title="No tasks due"
                        description="When you log visits and follow-ups, tasks will show up here."
                        href="/restaurants/new"
                        action="Add restaurant"
                    />
                ) : (
                    rows.map((a) => (
                        <div key={a.activity_id} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-medium truncate">
                                        {a.title || `${a.activity_type.toUpperCase()} follow-up`}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {a.restaurant_name} · {a.neighborhood_name ?? a.city_name ?? "—"}
                                    </div>
                                </div>
                                <Badge variant="outline">{a.activity_type}</Badge>
                            </div>

                            {a.details ? (
                                <div className="text-sm text-muted-foreground">{a.details}</div>
                            ) : null}

                            <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                                <span>Due: {formatDateTime(a.due_at)}</span>
                                <Link
                                    className="text-xs underline underline-offset-2"
                                    href={`/restaurants/${a.restaurant_id}`}
                                >
                                    Open
                                </Link>
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}

function AtRiskWidget({ rows }: { rows: AtRiskRow[] }) {
    return (
        <Card className="lg:col-span-1">
            <CardHeader className="space-y-1">
                <CardTitle className="text-base">At-risk customers</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Recurring customers that may need a check-in.
                </p>
            </CardHeader>

            <CardContent className="space-y-3">
                {rows.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                        No at-risk customers detected yet.
                    </div>
                ) : (
                    rows.map((r) => (
                        <div key={r.restaurant_id} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-medium truncate">{r.restaurant_name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {r.neighborhood_name ?? r.city_name ?? "—"} · Risk{" "}
                                        <span className="font-medium">{r.risk_score}</span>
                                    </div>
                                </div>
                                <Badge variant="secondary">recurring</Badge>
                            </div>

                            <div className="text-sm text-muted-foreground">
                                Last order: {formatDate(r.last_order_date)}{" "}
                                {r.days_since_last_order != null ? `(${r.days_since_last_order}d ago)` : ""}
                            </div>

                            {r.risk_explanation ? (
                                <div className="text-sm text-muted-foreground">{r.risk_explanation}</div>
                            ) : null}

                            <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                                <span>Next: {formatDateTime(r.next_due_at)}</span>
                                <Link
                                    className="text-xs underline underline-offset-2"
                                    href={`/restaurants/${r.restaurant_id}`}
                                >
                                    Open
                                </Link>
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}

function EmptyState({
    title,
    description,
    href,
    action,
}: {
    title: string;
    description: string;
    href: string;
    action: string;
}) {
    return (
        <div className="rounded-lg border p-4 space-y-2">
            <div className="font-medium">{title}</div>
            <div className="text-sm text-muted-foreground">{description}</div>
            <Button asChild size="sm" className="mt-2">
                <Link href={href}>{action}</Link>
            </Button>
        </div>
    );
}