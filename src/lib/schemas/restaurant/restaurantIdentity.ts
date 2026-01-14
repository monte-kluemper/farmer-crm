import { z } from "zod";

export const RestaurantIdentityV1 = z.object({
    canonical_name: z.string(),

    canonical_website_url: z.string().url().nullable(),

    address: z.string().nullable(),
    phone: z.string().nullable(),
    city: z.string().nullable(),

    geo: z.object({
        lat: z.number().nullable(),
        lng: z.number().nullable(),
    }),

    identity_confidence: z.enum(["low", "medium", "high"]),

    evidence: z.object({
        matched_schema_org: z.boolean(),
        matched_footer_nap: z.boolean(),
        matched_contact_page: z.boolean(),
        excerpts: z.array(
            z.string().max(240)
        ),
        notes: z.string().nullable(),
    }),

    candidates: z.array(
        z.object({
            name: z.string(),
            address: z.string().nullable(),
            website_url: z.string().url().nullable(),
            reason: z.string(),
        })
    ),
});

export type RestaurantIdentityV1 = z.infer<typeof RestaurantIdentityV1>;
