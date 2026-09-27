// MoveX Team Matching: a real, deterministic, documented scoring engine over Skills Engine
// data - not a black-box "AI" call. Ranks workers who hold a given skill by experience,
// rating, track record, rate, language match, distance, and a real sustainability signal
// (the worker's company's actual average CO2 saved per trip, from the shared environmental
// calculation service - never a fabricated "carbon score"). Upgradeable later by MoveX AI
// Core without changing this module's contract.

export const CREW_MATCH_METHODOLOGY = "movex-crew-match-v1";

export type ExperienceLevel = "beginner" | "intermediate" | "experienced" | "expert";

const EXPERIENCE_WEIGHTS: Record<ExperienceLevel, number> = {
  beginner: 1,
  intermediate: 2,
  experienced: 3,
  expert: 4,
};

export interface CrewCandidate {
  profileId: string;
  experienceLevel: ExperienceLevel;
  yearsExperience: number | null;
  rating: number; // 0-5
  completedJobs: number;
  hourlyRateEur: number | null;
  hasRequiredCertification: boolean; // false only if the skill requires a license the worker doesn't (verifiably, unexpired) hold
  languages: string[];
  distanceKm: number | null; // null when job/worker coordinates aren't known
  serviceRadiusKm: number | null;
  companyAvgCo2SavedKgPerTrip: number | null; // real data from getCompanyEnvironmentalSummary, or null if no company/no data yet
}

export interface CrewMatchOptions {
  requiredLanguages?: string[];
}

export interface ScoredCrewCandidate extends CrewCandidate {
  score: number;
  eligible: boolean;
  ineligibleReason?: string;
  scoreBreakdown: Record<string, number>;
}

export function scoreCrewCandidate(candidate: CrewCandidate, options: CrewMatchOptions = {}): ScoredCrewCandidate {
  const breakdown: Record<string, number> = {};

  breakdown.experienceLevel = EXPERIENCE_WEIGHTS[candidate.experienceLevel] * 10;
  breakdown.yearsExperience = Math.min(candidate.yearsExperience ?? 0, 20);
  breakdown.rating = candidate.rating * 10;
  breakdown.trackRecord = Math.min(candidate.completedJobs, 50) * 0.5;
  breakdown.rate = candidate.hourlyRateEur != null ? -(candidate.hourlyRateEur * 0.5) : 0;

  const requestedLanguages = options.requiredLanguages ?? [];
  const matchedLanguages = requestedLanguages.filter((l) => candidate.languages.includes(l)).length;
  breakdown.languageMatch = matchedLanguages * 10;

  breakdown.sustainability = candidate.companyAvgCo2SavedKgPerTrip != null
    ? Math.min(candidate.companyAvgCo2SavedKgPerTrip, 50) * 0.2
    : 0;

  let outOfRange = false;
  if (candidate.distanceKm != null) {
    breakdown.distance = -(candidate.distanceKm * 0.3);
    if (candidate.serviceRadiusKm != null && candidate.distanceKm > candidate.serviceRadiusKm) {
      outOfRange = true;
    }
  } else {
    breakdown.distance = 0;
  }

  const score = Math.round(Object.values(breakdown).reduce((sum, v) => sum + v, 0) * 100) / 100;

  let eligible = true;
  let ineligibleReason: string | undefined;
  if (!candidate.hasRequiredCertification) {
    eligible = false;
    ineligibleReason = "Missing a required, verified, unexpired certification for this skill";
  } else if (outOfRange) {
    eligible = false;
    ineligibleReason = "Job location is outside this worker's service radius";
  }

  return { ...candidate, score, eligible, ineligibleReason, scoreBreakdown: breakdown };
}

// Eligible candidates first (ranked by score), then ineligible ones (also ranked by score, so
// a near-miss surfaces at the top of the "not currently eligible" group instead of being lost).
export function rankCrewCandidates(candidates: CrewCandidate[], options: CrewMatchOptions = {}): ScoredCrewCandidate[] {
  return candidates
    .map((c) => scoreCrewCandidate(c, options))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.score - a.score;
    });
}
