// Deterministic, documented CRM scoring - same convention as crewMatching.ts and
// environmentalCalculation.ts: real weighted rules over real data, never a black-box AI call.
export const LEAD_SCORE_METHODOLOGY = "movex-lead-score-v1";
export const CUSTOMER_HEALTH_METHODOLOGY = "movex-customer-health-v1";

const STAGE_BASE_SCORE: Record<string, number> = {
  new: 10,
  contacted: 30,
  qualified: 50,
  proposal: 70,
  won: 100,
  lost: 0,
};

export interface LeadScoreInput {
  stage: string;
  estimatedValueEur?: number | null;
  email?: string | null;
  phone?: string | null;
  createdAt: Date;
  now?: Date;
}

// 0-100. Stage is the dominant signal (how far through the pipeline); contact completeness and
// deal size add bounded bonuses; a lead that's gone stale (no stage movement signal available,
// so we use age as a proxy) loses a small amount of urgency.
export function scoreLead(input: LeadScoreInput): number {
  const now = input.now ?? new Date();
  let score = STAGE_BASE_SCORE[input.stage] ?? 10;

  if (input.email && input.phone) score += 10;
  else if (input.email || input.phone) score += 5;

  if (input.estimatedValueEur && input.estimatedValueEur > 0) {
    score += Math.min(20, input.estimatedValueEur / 500);
  }

  const ageDays = (now.getTime() - input.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 30 && input.stage !== "won" && input.stage !== "lost") {
    score -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export type CustomerHealthStatus = "new" | "healthy" | "at_risk" | "churned";

export interface CustomerHealthInput {
  totalBookings: number;
  daysSinceLastBooking: number | null; // null = no bookings yet
}

// Thresholds are intentionally simple and explainable: a customer's health is a function of
// recency and frequency, not a fabricated "engagement score".
export function customerHealth(input: CustomerHealthInput): CustomerHealthStatus {
  if (input.totalBookings === 0 || input.daysSinceLastBooking === null) return "new";
  if (input.daysSinceLastBooking <= 60) return "healthy";
  if (input.daysSinceLastBooking <= 180) return "at_risk";
  return "churned";
}

// Real upsell suggestions: services in the catalog this repeat customer has never booked.
// Only suggested once there's a track record (>=2 bookings) - a single booking isn't a pattern.
export function suggestUpsells(usedServiceNames: string[], allServiceNames: string[], totalBookings: number): string[] {
  if (totalBookings < 2) return [];
  const used = new Set(usedServiceNames);
  return allServiceNames.filter((name) => !used.has(name));
}
