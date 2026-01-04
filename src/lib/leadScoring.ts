import { z } from "zod";
import { RestaurantLeadFeaturesV1 as RestaurantLeadFeaturesV1Schema } from "@/lib/schemas/restaurant";

export type RestaurantLeadFeaturesV1 = z.infer<typeof RestaurantLeadFeaturesV1Schema>;

export type LeadScoreWeightsV1 = {
    signals: {
        geo: { delivery_feasible: number; distance: number; neighborhood_match: number };
        menu: { menu_fit: number; seasonality_alignment: number; uses_target_products: number };
        brand: { sustainability_affinity: number; local_sourcing_language: number };
        operations: { volume_potential: number; operational_risk: number }; // risk inverted internally
        outreach: { has_contact_page: number; has_email_or_phone: number; chef_or_owner_named: number };
        pipeline: { stage_bonus: number; inbound_interest: number; recency: number };
    };
    rubric: {
        menu_fit_score: number;
        local_affinity_score: number;
        volume_score: number;
        outreach_ease_score: number;
        brand_alignment_score: number;
        risk_score: number; // inverted internally
    };
    blend: { signals: number; rubric: number };
    confidence: { min_multiplier: number };
    rules: {
        delivery_not_feasible: { mode: "hard_zero" | "cap"; cap_score: number };
        distance_unknown: { cap_score: number };
        stage_freeze: { won_score: number; lost_score: number };
        chain_bonus: number;
        fine_dining_bonus: number;
        fast_casual_penalty: number;
    };
};

export type LeadScoreBreakdown = {
    raw: number;
    after_confidence: number;
    final: number;
    confidence_multiplier: number;
    reasons: string[];
    components: {
        signals_score_0_1: number;
        rubric_score_0_1: number;
        blended_score_0_1: number;
    };
};

export const DEFAULT_WEIGHTS_V1: LeadScoreWeightsV1 = {
    signals: {
        geo: { delivery_feasible: 0.10, distance: 0.10, neighborhood_match: 0.05 },
        menu: { menu_fit: 0.20, seasonality_alignment: 0.05, uses_target_products: 0.05 },
        brand: { sustainability_affinity: 0.08, local_sourcing_language: 0.05 },
        operations: { volume_potential: 0.12, operational_risk: 0.12 },
        outreach: { has_contact_page: 0.04, has_email_or_phone: 0.07, chef_or_owner_named: 0.02 },
        pipeline: { stage_bonus: 0.03, inbound_interest: 0.04, recency: 0.03 }
    },
    rubric: {
        menu_fit_score: 0.20,
        local_affinity_score: 0.15,
        volume_score: 0.15,
        outreach_ease_score: 0.20,
        brand_alignment_score: 0.20,
        risk_score: 0.10
    },
    blend: { signals: 0.65, rubric: 0.35 },
    confidence: { min_multiplier: 0.70 },
    rules: {
        delivery_not_feasible: { mode: "cap", cap_score: 20 },
        distance_unknown: { cap_score: 60 },
        stage_freeze: { won_score: 100, lost_score: 0 },
        chain_bonus: 3,
        fine_dining_bonus: 2,
        fast_casual_penalty: 2
    }
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function clamp100(x: number) { return Math.max(0, Math.min(100, x)); }
function boolTo01(b: boolean) { return b ? 1 : 0; }

function distanceToScore(distance_km: number, radius_km: number) {
    if (radius_km <= 0) return 0;
    return clamp01(1 - distance_km / radius_km);
}

function neighborhoodMatchToScore(v: "high" | "medium" | "low" | "unknown") {
    switch (v) {
        case "high": return 1.0;
        case "medium": return 0.6;
        case "low": return 0.2;
        default: return 0.4;
    }
}

function rubric05To01(x: number) {
    return clamp01(x / 5);
}

function stageBonusTo01(stage: RestaurantLeadFeaturesV1["signals"]["pipeline"]["stage"]) {
    switch (stage) {
        case "new": return 0.0;
        case "researched": return 0.1;
        case "contacted": return 0.2;
        case "responded": return 0.45;
        case "meeting_set": return 0.7;
        case "won": return 1.0;
        case "lost": return 0.0;
        default: return 0.0;
    }
}

function recencyToScore(last_contacted_at: string | null) {
    if (!last_contacted_at) return 0;
    const t = Date.parse(last_contacted_at);
    if (Number.isNaN(t)) return 0;

    const now = Date.now();
    const days = (now - t) / (1000 * 60 * 60 * 24);

    if (days <= 7) return 1.0;
    if (days <= 30) return 0.6;
    if (days <= 120) return 0.3;
    return 0.0;
}

function hasEmailOrPhone(contact: RestaurantLeadFeaturesV1["restaurant"]["contact"]) {
    return Boolean((contact.email && contact.email.trim()) || (contact.phone && contact.phone.trim()));
}

function sumWeights(obj: unknown): number {
    if (typeof obj === "number") return obj;
    if (!obj || typeof obj !== "object") return 0;
    let s = 0;
    for (const v of Object.values(obj as Record<string, unknown>)) s += sumWeights(v);
    return s;
}

export function scoreRestaurantLead(
    input: unknown,
    opts: { radius_km: number; weights?: LeadScoreWeightsV1 }
): LeadScoreBreakdown {
    const features = RestaurantLeadFeaturesV1Schema.parse(input);
    const w = opts.weights ?? DEFAULT_WEIGHTS_V1;
    const reasons: string[] = [];

    // Stage freeze
    const stage = features.signals.pipeline.stage;
    if (stage === "won") {
        reasons.push(`Stage is "won" → freezing score at ${w.rules.stage_freeze.won_score}.`);
        return {
            raw: w.rules.stage_freeze.won_score,
            after_confidence: w.rules.stage_freeze.won_score,
            final: w.rules.stage_freeze.won_score,
            confidence_multiplier: 1,
            reasons,
            components: { signals_score_0_1: 1, rubric_score_0_1: 1, blended_score_0_1: 1 }
        };
    }
    if (stage === "lost") {
        reasons.push(`Stage is "lost" → freezing score at ${w.rules.stage_freeze.lost_score}.`);
        return {
            raw: w.rules.stage_freeze.lost_score,
            after_confidence: w.rules.stage_freeze.lost_score,
            final: w.rules.stage_freeze.lost_score,
            confidence_multiplier: 1,
            reasons,
            components: { signals_score_0_1: 0, rubric_score_0_1: 0, blended_score_0_1: 0 }
        };
    }

    const radius_km = opts.radius_km;

    const distance_km = features.signals.geo.distance_km;
    const distance_score = distance_km === null ? 0 : distanceToScore(distance_km, radius_km);

    const neighborhood_score = neighborhoodMatchToScore(features.signals.geo.neighborhood_match);
    const outreach_has_email_or_phone = boolTo01(hasEmailOrPhone(features.restaurant.contact));

    const stage_bonus = stageBonusTo01(stage);
    const recency_score = recencyToScore(features.signals.pipeline.last_contacted_at);

    const operational_risk_inverted = 1 - clamp01(features.signals.operations.operational_risk);

    const signalsWeightedSum =
        w.signals.geo.delivery_feasible * boolTo01(features.signals.geo.delivery_feasible) +
        w.signals.geo.distance * (distance_km === null ? 0 : distance_score) +
        w.signals.geo.neighborhood_match * neighborhood_score +

        w.signals.menu.menu_fit * clamp01(features.signals.menu.menu_fit) +
        w.signals.menu.seasonality_alignment * clamp01(features.signals.menu.seasonality_alignment) +
        w.signals.menu.uses_target_products * boolTo01(features.signals.menu.uses_target_products) +

        w.signals.brand.sustainability_affinity * clamp01(features.signals.brand.sustainability_affinity) +
        w.signals.brand.local_sourcing_language * boolTo01(features.signals.brand.local_sourcing_language) +

        w.signals.operations.volume_potential * clamp01(features.signals.operations.volume_potential) +
        w.signals.operations.operational_risk * operational_risk_inverted +

        w.signals.outreach.has_contact_page * boolTo01(features.restaurant.contact.has_contact_page) +
        w.signals.outreach.has_email_or_phone * outreach_has_email_or_phone +
        w.signals.outreach.chef_or_owner_named * boolTo01(features.restaurant.contact.chef_or_owner_named) +

        w.signals.pipeline.stage_bonus * stage_bonus +
        w.signals.pipeline.inbound_interest * boolTo01(features.signals.pipeline.inbound_interest) +
        w.signals.pipeline.recency * recency_score;

    const signalsWeightTotal = sumWeights(w.signals);
    const signalsScore01 = signalsWeightTotal > 0 ? clamp01(signalsWeightedSum / signalsWeightTotal) : 0;

    const rubricRiskInverted = 1 - rubric05To01(features.rubric.risk_score);

    const rubricWeightedSum =
        w.rubric.menu_fit_score * rubric05To01(features.rubric.menu_fit_score) +
        w.rubric.local_affinity_score * rubric05To01(features.rubric.local_affinity_score) +
        w.rubric.volume_score * rubric05To01(features.rubric.volume_score) +
        w.rubric.outreach_ease_score * rubric05To01(features.rubric.outreach_ease_score) +
        w.rubric.brand_alignment_score * rubric05To01(features.rubric.brand_alignment_score) +
        w.rubric.risk_score * rubricRiskInverted;

    const rubricWeightTotal =
        w.rubric.menu_fit_score +
        w.rubric.local_affinity_score +
        w.rubric.volume_score +
        w.rubric.outreach_ease_score +
        w.rubric.brand_alignment_score +
        w.rubric.risk_score;

    const rubricScore01 = rubricWeightTotal > 0 ? clamp01(rubricWeightedSum / rubricWeightTotal) : 0;

    const blendTotal = w.blend.signals + w.blend.rubric;
    const blendSignals = blendTotal > 0 ? w.blend.signals / blendTotal : 0.5;
    const blendRubric = blendTotal > 0 ? w.blend.rubric / blendTotal : 0.5;

    const blended01 = clamp01(signalsScore01 * blendSignals + rubricScore01 * blendRubric);

    let raw = clamp100(blended01 * 100);

    // Segment tweaks
    if (features.restaurant.locations.is_chain_guess && features.restaurant.locations.location_count_guess >= 2) {
        raw = clamp100(raw + w.rules.chain_bonus);
        reasons.push(`Multi-location/chain guess → +${w.rules.chain_bonus}.`);
    }
    if (features.restaurant.service_style === "fine_dining") {
        raw = clamp100(raw + w.rules.fine_dining_bonus);
        reasons.push(`Service style fine_dining → +${w.rules.fine_dining_bonus}.`);
    }
    if (features.restaurant.service_style === "fast_casual") {
        raw = clamp100(raw - w.rules.fast_casual_penalty);
        reasons.push(`Service style fast_casual → -${w.rules.fast_casual_penalty}.`);
    }

    const conf = clamp01(features.confidence.overall);
    const minMult = clamp01(w.confidence.min_multiplier);
    const confidence_multiplier = minMult + (1 - minMult) * conf;
    const after_confidence = clamp100(raw * confidence_multiplier);

    if (conf < 0.4) reasons.push(`Low confidence (${conf.toFixed(2)}) → downweighted.`);
    if (features.missing_info.length > 0) reasons.push(`Missing info: ${features.missing_info.join("; ")}`);

    let final = after_confidence;

    if (!features.signals.geo.delivery_feasible) {
        if (w.rules.delivery_not_feasible.mode === "hard_zero") {
            final = 0;
            reasons.push(`Delivery not feasible → hard_zero.`);
        } else {
            final = Math.min(final, w.rules.delivery_not_feasible.cap_score);
            reasons.push(`Delivery not feasible → capped at ${w.rules.delivery_not_feasible.cap_score}.`);
        }
    }

    if (features.signals.geo.distance_km === null) {
        final = Math.min(final, w.rules.distance_unknown.cap_score);
        reasons.push(`Distance unknown → capped at ${w.rules.distance_unknown.cap_score}.`);
    } else if (radius_km > 0 && features.signals.geo.distance_km > radius_km) {
        if (w.rules.delivery_not_feasible.mode === "hard_zero") {
            final = 0;
            reasons.push(`Distance ${features.signals.geo.distance_km.toFixed(1)}km exceeds radius ${radius_km}km → hard_zero.`);
        } else {
            final = Math.min(final, w.rules.delivery_not_feasible.cap_score);
            reasons.push(`Distance ${features.signals.geo.distance_km.toFixed(1)}km exceeds radius ${radius_km}km → capped at ${w.rules.delivery_not_feasible.cap_score}.`);
        }
    }

    final = clamp100(final);

    if (features.signals.menu.menu_fit >= 0.8) reasons.push(`Strong menu_fit signal (${features.signals.menu.menu_fit.toFixed(2)}).`);
    if (features.signals.brand.sustainability_affinity >= 0.8) reasons.push(`Strong sustainability_affinity (${features.signals.brand.sustainability_affinity.toFixed(2)}).`);
    if (features.signals.operations.operational_risk >= 0.7) reasons.push(`High operational risk (${features.signals.operations.operational_risk.toFixed(2)}).`);

    return {
        raw,
        after_confidence,
        final,
        confidence_multiplier,
        reasons,
        components: {
            signals_score_0_1: signalsScore01,
            rubric_score_0_1: rubricScore01,
            blended_score_0_1: blended01
        }
    };
}
