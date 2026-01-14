"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RefreshContactsButton({ restaurantId }: { restaurantId: string }) {
    const [loading, setLoading] = useState(false);

    return (
        <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={async () => {
                setLoading(true);
                try {
                    await fetch(`/api/restaurant/${restaurantId}/refresh-contacts`, { method: "POST" });
                    // simplest: full refresh
                    window.location.reload();
                } finally {
                    setLoading(false);
                }
            }}
        >
            {loading ? "Refreshing..." : "Refresh contacts"}
        </Button>
    );
}
