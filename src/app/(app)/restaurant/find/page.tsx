import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function FindRestaurantsPage() {
    return (
        <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold">Find restaurants</h1>
                    <p className="text-sm text-muted-foreground">
                        Search and filter prospects (Madrid first, scalable later).
                    </p>
                </div>
                <Button asChild>
                    <Link href="/restaurants/new">Add restaurant</Link>
                </Button>
            </div>

            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                MVP placeholder. Next we’ll add:
                <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Neighborhood / cuisine fit filters</li>
                    <li>Price-point signals (menú del día vs tasting)</li>
                    <li>Off-menu signals</li>
                    <li>Save as lead</li>
                </ul>
            </div>
        </div>
    );
}
