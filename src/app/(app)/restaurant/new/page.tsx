import Link from "next/link";
import { addRestaurantByUrl } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AddRestaurantPage({
    searchParams,
}: {
    searchParams?: { [key: string]: string | string[] | undefined };
}) {
    const error = typeof searchParams?.error === "string" ? searchParams.error : "";

    return (
        <div className="p-6 space-y-6 max-w-2xl">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold">Add restaurant by URL</h1>
                    <p className="text-sm text-muted-foreground">
                        Paste a restaurant website or menu URL. We’ll generate a profile and compute a lead score.
                    </p>
                </div>

                <Button asChild variant="outline">
                    <Link href="/restaurants">Back</Link>
                </Button>
            </div>

            {error ? (
                <Card className="border-red-200">
                    <CardHeader>
                        <CardTitle className="text-base">Error</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-red-700">
                        {decodeURIComponent(error)}
                    </CardContent>
                </Card>
            ) : null}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Restaurant URL</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <form action={addRestaurantByUrl} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="url">
                                URL
                            </label>
                            <input
                                id="url"
                                name="url"
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                placeholder="https://..."
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                Tip: menu pages tend to work best.
                            </p>
                        </div>

                        <Button type="submit" className="w-full">
                            Generate profile
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
