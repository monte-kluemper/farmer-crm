import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { RestaurantProfileCard } from "@/components/restaurant/restaurant-profile-card";
import { CuisineCard } from "@/components/restaurant/cuisine-card";
import { ContactLocationsCard } from "@/components/restaurant/contact-locations-card";

type PageProps = {
    params: Promise<{ id: string }>;
};

type RestaurantPerson = {
    id: string;
    restaurant_id: string;
    role: string;
    full_name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    source_url: string | null;
    source_type: string;
    evidence_excerpt: string;
    confidence: number;
    last_verified_at: string | null;
};

function safeUrl(url?: string | null) {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    return hasProtocol ? trimmed : `https://${trimmed}`;
}

function formatDate(iso?: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function prettyJson(value: unknown) {
    if (value == null) return null;
    if (typeof value !== "object") return String(value);
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function JsonDisclosure({ title, value }: { title: string; value: unknown }) {
    const text = prettyJson(value);
    const empty = !text || text === "{}" || text === "[]";

    return (
        <Card>
            <CardContent className="py-3">
                <details>
                    <summary className="cursor-pointer list-none select-none">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium">{title}</div>
                            <span className="text-xs text-muted-foreground">{empty ? "—" : "View"}</span>
                        </div>
                    </summary>

                    <div className="mt-3">
                        {empty ? (
                            <div className="text-sm text-muted-foreground">—</div>
                        ) : (
                            <pre className="text-xs whitespace-pre-wrap break-words rounded-md border p-3 bg-muted/40">
                                {text}
                            </pre>
                        )}
                    </div>
                </details>
            </CardContent>
        </Card>
    );
}

function PersonRow({
    p,
    linkedin,
    source,
    confidence,
}: {
    p: RestaurantPerson;
    linkedin: string | null;
    source: string | null;
    confidence: number;
}) {
    return (
        <div className="rounded-md border px-3 py-2">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium truncate">{p.full_name}</div>
                        <span className="text-sm text-muted-foreground">
                            {p.role}
                            {p.title ? ` • ${p.title}` : ""}
                        </span>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <div>
                            Email:{" "}
                            {p.email ? <span className="font-mono text-foreground">{p.email}</span> : "—"}
                        </div>
                        <div>
                            Phone:{" "}
                            {p.phone ? <span className="font-mono text-foreground">{p.phone}</span> : "—"}
                        </div>
                        <div>
                            LinkedIn:{" "}
                            {linkedin ? (
                                <a className="underline underline-offset-2 text-foreground" href={linkedin} target="_blank" rel="noreferrer">
                                    link
                                </a>
                            ) : (
                                "—"
                            )}
                        </div>
                        <div>
                            Source:{" "}
                            {source ? (
                                <a className="underline underline-offset-2 text-foreground" href={source} target="_blank" rel="noreferrer">
                                    link
                                </a>
                            ) : (
                                "—"
                            )}
                        </div>
                    </div>

                    {p.evidence_excerpt ? (
                        <div className="mt-2 text-sm text-muted-foreground line-clamp-2">{p.evidence_excerpt}</div>
                    ) : null}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">
                        {confidence}%
                    </Badge>
                    {p.source_type ? (
                        <Badge variant="secondary" className="text-xs">
                            {p.source_type}
                        </Badge>
                    ) : null}
                    {p.last_verified_at ? (
                        <Badge variant="outline" className="text-xs">
                            {formatDate(p.last_verified_at)}
                        </Badge>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export default async function RestaurantPage(props: PageProps) {
    const { id } = await props.params;

    const supabase = await createSupabaseServerClient();

    const { data: r, error } = await supabase
        .from("restaurants")
        .select(
            `
      id,farm_id,city_id,neighborhood_id,
      name,address,website_url,instagram_url,reservation_url,
      cuisine_types,cuisine_fit,service_style,stage,
      cuisine_slugs,price_tier,neighborhood_guess,city,
      contact,locations,
      lead_score,lead_score_explanation,
      ai_confidence,ai_profile,
      price_architecture,menu_signals,off_menu_signals,sustainability_signals,
      source_url,created_at,updated_at
    `
        )
        .eq("id", id)
        .single();

    const { data: people, error: peopleError } = await supabase
        .from("restaurant_people")
        .select(
            "id,restaurant_id,role,full_name,title,email,phone,linkedin_url,source_url,source_type,evidence_excerpt,confidence,last_verified_at"
        )
        .eq("restaurant_id", id)
        .order("confidence", { ascending: false })
        .returns<RestaurantPerson[]>();

    if (!error && !r) notFound();

    const website = safeUrl(r?.website_url);
    const instagram = safeUrl(r?.instagram_url);
    const reservation = safeUrl(r?.reservation_url);
    const sourceUrl = safeUrl(r?.source_url);

    return (
        <div className="mx-auto max-w-5xl px-4 py-4 space-y-4">
            {/* Header (compact) */}
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-semibold truncate">{r?.name ?? "Restaurant"}</h1>
                        {r?.stage ? <Badge variant="secondary">{r.stage}</Badge> : null}
                        {r?.cuisine_fit ? <Badge variant="outline">Fit: {r.cuisine_fit}</Badge> : null}
                        {r?.ai_confidence ? <Badge variant="outline">AI: {r.ai_confidence}</Badge> : null}
                    </div>

                    <p className="text-sm text-muted-foreground truncate">{r?.address ?? "—"}</p>

                    <div className="flex flex-wrap gap-2">
                        {website ? (
                            <Button asChild size="sm" variant="outline" className="h-8 px-2">
                                <a href={website} target="_blank" rel="noreferrer">
                                    Website
                                </a>
                            </Button>
                        ) : null}
                        {instagram ? (
                            <Button asChild size="sm" variant="outline" className="h-8 px-2">
                                <a href={instagram} target="_blank" rel="noreferrer">
                                    Instagram
                                </a>
                            </Button>
                        ) : null}
                        {reservation ? (
                            <Button asChild size="sm" variant="outline" className="h-8 px-2">
                                <a href={reservation} target="_blank" rel="noreferrer">
                                    Reservations
                                </a>
                            </Button>
                        ) : null}
                        {sourceUrl ? (
                            <Button asChild size="sm" variant="outline" className="h-8 px-2">
                                <a href={sourceUrl} target="_blank" rel="noreferrer">
                                    Source
                                </a>
                            </Button>
                        ) : null}
                    </div>
                </div>

                <Button asChild variant="outline" className="h-8">
                    <Link href="/restaurant">Back</Link>
                </Button>
            </div>

            {/* Errors */}
            {error ? (
                <Card className="border-red-200">
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm">Restaurant data error</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 pb-3 text-sm text-red-700">{error.message}</CardContent>
                </Card>
            ) : null}

            {peopleError ? (
                <Card className="border-red-200">
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm">People data error</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 pb-3 text-sm text-red-700">{peopleError.message}</CardContent>
                </Card>
            ) : null}

            {/* Main */}
            {r ? (
                <div className="grid gap-3 lg:grid-cols-3">
                    <div className="space-y-3 lg:col-span-1">
                        <RestaurantProfileCard
                            name={r.name}
                            address={r.address}
                            stage={r.stage}
                            cuisineFit={r.cuisine_fit}
                            aiConfidence={r.ai_confidence}
                            serviceStyle={r.service_style}
                            priceTier={r.price_tier}
                            city={r.city}
                            cityId={r.city_id}
                            neighborhoodGuess={r.neighborhood_guess}
                            neighborhoodId={r.neighborhood_id}
                            leadScore={r.lead_score}
                            leadScoreExplanation={r.lead_score_explanation}
                            createdAt={r.created_at}
                            updatedAt={r.updated_at}
                        />
                    </div>

                    <div className="space-y-3 lg:col-span-2">
                        <div className="grid gap-3 md:grid-cols-2">
                            <CuisineCard cuisineSlugs={r.cuisine_slugs} cuisineTypes={r.cuisine_types} />
                            <ContactLocationsCard contactJson={r.contact} locationsJson={r.locations} />
                        </div>

                        {/* People (compact rows) */}
                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle className="text-sm">People</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3 space-y-2">
                                {people && people.length ? (
                                    people.map((p) => {
                                        const linkedin = safeUrl(p.linkedin_url);
                                        const source = safeUrl(p.source_url);
                                        const confidence = Math.round((p.confidence ?? 0) * 100);

                                        return (
                                            <PersonRow
                                                key={p.id}
                                                p={p}
                                                linkedin={linkedin}
                                                source={source}
                                                confidence={confidence}
                                            />
                                        );
                                    })
                                ) : (
                                    <div className="text-sm text-muted-foreground">No people records yet.</div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Signals / AI (collapsible) */}
                        <div className="grid gap-3 lg:grid-cols-2">
                            <JsonDisclosure title="Price architecture" value={r.price_architecture} />
                            <JsonDisclosure title="Menu signals" value={r.menu_signals} />
                            <JsonDisclosure title="Off-menu signals" value={r.off_menu_signals} />
                            <JsonDisclosure title="Sustainability signals" value={r.sustainability_signals} />
                            <JsonDisclosure title="AI profile" value={r.ai_profile} />
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
