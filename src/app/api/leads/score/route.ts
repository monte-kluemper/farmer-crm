import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { RestaurantLeadFeaturesV1 as LeadFeaturesSchema } from "@/lib/schemas/restaurant";
import { scoreRestaurantLead, DEFAULT_WEIGHTS_V1 } from "@/lib/leadScoring";

export const runtime = "nodejs";

const ReqSchema = z.object({
    lead_features: z.unknown(),
    radius_km: z.number().positive().default(8),
});

export async function POST(req: Request) {
    try {
        const body = ReqSchema.parse(await req.json());
        const lead_features = LeadFeaturesSchema.parse(body.lead_features);

        const result = scoreRestaurantLead(lead_features, {
            radius_km: body.radius_km,
            weights: DEFAULT_WEIGHTS_V1,
        });

        return NextResponse.json({ ok: true, result });
    } catch (e: any) {
        if (e instanceof ZodError) {
            return NextResponse.json({ ok: false, error: "Validation failed", details: e.flatten() }, { status: 422 });
        }
        return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
    }
}
