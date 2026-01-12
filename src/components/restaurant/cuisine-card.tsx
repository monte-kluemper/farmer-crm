import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export type CuisineCardProps = {
    cuisineSlugs?: string[] | null;
    cuisineTypes?: string[] | null;
};

export function CuisineCard({ cuisineSlugs, cuisineTypes }: CuisineCardProps) {
    const slugs = (cuisineSlugs ?? []).filter(Boolean);
    const types = (cuisineTypes ?? []).filter(Boolean);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Cuisine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div>
                    <div className="text-sm text-muted-foreground">Slugs</div>
                    {slugs.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {slugs.map((s) => (
                                <Badge key={s} variant="outline">
                                    {s}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-1 text-sm text-muted-foreground">—</div>
                    )}
                </div>

                <Separator />

                <div>
                    <div className="text-sm text-muted-foreground">Types</div>
                    {types.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {types.map((t) => (
                                <Badge key={t} variant="secondary">
                                    {t}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-1 text-sm text-muted-foreground">—</div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
