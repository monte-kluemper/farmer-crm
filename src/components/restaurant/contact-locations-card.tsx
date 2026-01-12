import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type ContactV1 = {
    has_contact_page: boolean;
    email?: string | null;
    phone?: string | null;
    contact_url?: string | null;
    reservation_platform:
    | "opentable"
    | "thefork"
    | "resy"
    | "sevenrooms"
    | "phone_only"
    | "unknown"
    | "none";
};

type LocationsV1 = {
    location_count_guess: number;
    is_chain_guess: boolean;
};

export type ContactLocationsCardProps = {
    contactJson?: unknown | null;
    locationsJson?: unknown | null;
};

function safeUrl(url?: string | null) {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    return hasProtocol ? trimmed : `https://${trimmed}`;
}

function parseContactV1(v: unknown): ContactV1 | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;

    const has_contact_page = typeof o.has_contact_page === "boolean" ? o.has_contact_page : null;
    const reservation_platform =
        typeof o.reservation_platform === "string" ? (o.reservation_platform as ContactV1["reservation_platform"]) : null;

    if (has_contact_page == null || reservation_platform == null) return null;

    return {
        has_contact_page,
        reservation_platform,
        email: typeof o.email === "string" || o.email === null ? (o.email as string | null) : null,
        phone: typeof o.phone === "string" || o.phone === null ? (o.phone as string | null) : null,
        contact_url:
            typeof o.contact_url === "string" || o.contact_url === null ? (o.contact_url as string | null) : null,
    };
}

function parseLocationsV1(v: unknown): LocationsV1 | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const location_count_guess = typeof o.location_count_guess === "number" ? o.location_count_guess : null;
    const is_chain_guess = typeof o.is_chain_guess === "boolean" ? o.is_chain_guess : null;
    if (location_count_guess == null || is_chain_guess == null) return null;
    return { location_count_guess, is_chain_guess };
}

export function ContactLocationsCard({ contactJson, locationsJson }: ContactLocationsCardProps) {
    const contact = parseContactV1(contactJson);
    const locations = parseLocationsV1(locationsJson);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Contact & Locations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <div className="text-sm text-muted-foreground">Contact</div>
                    {contact ? (
                        <div className="mt-2 space-y-1 text-sm">
                            <div>
                                Contact page: <span className="font-medium">{contact.has_contact_page ? "Yes" : "No"}</span>
                            </div>
                            <div>
                                Reservation platform: <span className="font-medium">{contact.reservation_platform}</span>
                            </div>
                            <div>Email: {contact.email ? <span className="font-mono">{contact.email}</span> : "—"}</div>
                            <div>Phone: {contact.phone ? <span className="font-mono">{contact.phone}</span> : "—"}</div>
                            <div>
                                Contact URL:{" "}
                                {contact.contact_url ? (
                                    <a
                                        className="underline underline-offset-2"
                                        href={safeUrl(contact.contact_url) ?? undefined}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {contact.contact_url}
                                    </a>
                                ) : (
                                    "—"
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-1 text-sm text-muted-foreground">—</div>
                    )}
                </div>

                <Separator />

                <div>
                    <div className="text-sm text-muted-foreground">Locations</div>
                    {locations ? (
                        <div className="mt-2 space-y-1 text-sm">
                            <div>
                                Location count (guess): <span className="font-medium">{locations.location_count_guess}</span>
                            </div>
                            <div>
                                Chain (guess): <span className="font-medium">{locations.is_chain_guess ? "Yes" : "No"}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-1 text-sm text-muted-foreground">—</div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
