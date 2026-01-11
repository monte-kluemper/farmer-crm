// src/lib/schemas/restaurant/index.ts
//
// Central export surface for restaurant schemas + versioned helpers.
// Keep Zod schemas as the runtime source of truth.
// JSON schema files (if you keep them) can be imported as artifacts for prompts/docs.
export {
    RestaurantProfileV1,
    type RestaurantProfileV1 as RestaurantProfileV1Type,
    RestaurantPersonCandidateV1,
    RestaurantPeopleCandidatesV1,
    type RestaurantPersonCandidateV1 as RestaurantPersonCandidateV1Type,
    RestaurantLeadFeaturesV1,
    type RestaurantLeadFeaturesV1 as RestaurantLeadFeaturesV1Type,
    RestaurantEnrichOutputV1,
    type RestaurantEnrichOutputV1 as RestaurantEnrichOutputV1Type,
} from "./restaurant";

// -------------------------
// Version constants
// -------------------------
export const RESTAURANT_SCHEMA_VERSION_V1 = "v1" as const;
export const ENRICH_PROMPT_VERSION_V1 = "enrich_v1.0" as const;

// -------------------------
// Optional: load JSON schema artifacts for prompts/docs
// (Works if you keep .json files colocated and your bundler supports JSON imports.
//  In Next.js this is typically fine. If not, you can remove these exports.)
// -------------------------
import restaurantProfileV1Json from "./restaurantProfile.v1.json";
import restaurantLeadFeaturesV1Json from "./restaurantLeadFeatures.v1.json";
import restaurantPeopleV1Json from "./restaurantPeopleCandidates.v1.json";
import restaurantEnrichOutputV1Json from "./restaurantEnrichOutput.v1.json";

export const RestaurantProfileV1JsonSchema = restaurantProfileV1Json;
export const RestaurantLeadFeaturesV1JsonSchema = restaurantLeadFeaturesV1Json;
export const RestaurantPeopleCandidatesV1JsonSchema = restaurantPeopleV1Json;
export const RestaurantEnrichOutputV1JsonSchema = restaurantEnrichOutputV1Json;

// -------------------------
// Tiny helper types/utilities
// -------------------------
export type SchemaVersion = typeof RESTAURANT_SCHEMA_VERSION_V1;

/**
 * Minimal “assert” helper for narrowing at runtime without re-parsing:
 * Prefer parsing with Zod for untrusted input (GPT/web/DB).
 */
export function isSchemaV1(obj: unknown): obj is { schema_version: "v1" } {
    return Boolean(obj && typeof obj === "object" && (obj as { schema_version?: string }).schema_version === "v1");
}

/**
 * Helper to stringify JSON schema for embedding in prompts.
 * Use sparingly to keep token usage low.
 */
export function stringifyJsonSchemaForPrompt(schemaArtifact: unknown, maxLen = 12_000): string {
    const s = JSON.stringify(schemaArtifact, null, 2);
    return s.length > maxLen ? s.slice(0, maxLen) + "\n/* …truncated… */" : s;
}
