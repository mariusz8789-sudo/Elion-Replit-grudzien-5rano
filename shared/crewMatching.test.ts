import { describe, it, expect } from "vitest";
import { scoreCrewCandidate, rankCrewCandidates, type CrewCandidate } from "./crewMatching";

function baseCandidate(overrides: Partial<CrewCandidate> = {}): CrewCandidate {
  return {
    profileId: "p1",
    experienceLevel: "intermediate",
    yearsExperience: 3,
    rating: 4,
    completedJobs: 10,
    hourlyRateEur: 20,
    hasRequiredCertification: true,
    languages: ["en"],
    distanceKm: null,
    serviceRadiusKm: null,
    companyAvgCo2SavedKgPerTrip: null,
    ...overrides,
  };
}

describe("scoreCrewCandidate", () => {
  it("scores a more experienced worker higher, all else equal", () => {
    const beginner = scoreCrewCandidate(baseCandidate({ experienceLevel: "beginner" }));
    const expert = scoreCrewCandidate(baseCandidate({ experienceLevel: "expert" }));
    expect(expert.score).toBeGreaterThan(beginner.score);
  });

  it("scores a higher-rated worker higher", () => {
    const low = scoreCrewCandidate(baseCandidate({ rating: 2 }));
    const high = scoreCrewCandidate(baseCandidate({ rating: 5 }));
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("penalizes a higher hourly rate", () => {
    const cheap = scoreCrewCandidate(baseCandidate({ hourlyRateEur: 15 }));
    const expensive = scoreCrewCandidate(baseCandidate({ hourlyRateEur: 60 }));
    expect(cheap.score).toBeGreaterThan(expensive.score);
  });

  it("is marked ineligible when missing a required certification, regardless of score", () => {
    const uncertified = scoreCrewCandidate(baseCandidate({ hasRequiredCertification: false, rating: 5, experienceLevel: "expert" }));
    expect(uncertified.eligible).toBe(false);
    expect(uncertified.ineligibleReason).toBeTruthy();
  });

  it("is marked ineligible when the job is outside the worker's service radius", () => {
    const tooFar = scoreCrewCandidate(baseCandidate({ distanceKm: 50, serviceRadiusKm: 20 }));
    expect(tooFar.eligible).toBe(false);
  });

  it("is eligible when within the service radius", () => {
    const withinRange = scoreCrewCandidate(baseCandidate({ distanceKm: 10, serviceRadiusKm: 20 }));
    expect(withinRange.eligible).toBe(true);
  });

  it("does not penalize distance when no radius is set (radius unknown, not enforced)", () => {
    const noRadius = scoreCrewCandidate(baseCandidate({ distanceKm: 1000, serviceRadiusKm: null }));
    expect(noRadius.eligible).toBe(true);
  });

  it("rewards matching requested languages", () => {
    const noMatch = scoreCrewCandidate(baseCandidate({ languages: ["de"] }), { requiredLanguages: ["en", "pl"] });
    const oneMatch = scoreCrewCandidate(baseCandidate({ languages: ["en"] }), { requiredLanguages: ["en", "pl"] });
    const bothMatch = scoreCrewCandidate(baseCandidate({ languages: ["en", "pl"] }), { requiredLanguages: ["en", "pl"] });
    expect(oneMatch.score).toBeGreaterThan(noMatch.score);
    expect(bothMatch.score).toBeGreaterThan(oneMatch.score);
  });

  it("rewards a real, non-fabricated sustainability signal from the worker's company", () => {
    const noData = scoreCrewCandidate(baseCandidate({ companyAvgCo2SavedKgPerTrip: null }));
    const greenCompany = scoreCrewCandidate(baseCandidate({ companyAvgCo2SavedKgPerTrip: 40 }));
    expect(greenCompany.score).toBeGreaterThan(noData.score);
  });

  it("is deterministic - identical input always produces an identical score", () => {
    const a = scoreCrewCandidate(baseCandidate());
    const b = scoreCrewCandidate(baseCandidate());
    expect(a.score).toBe(b.score);
  });
});

describe("rankCrewCandidates", () => {
  it("always sorts eligible candidates before ineligible ones, regardless of raw score", () => {
    const candidates: CrewCandidate[] = [
      baseCandidate({ profileId: "uncertified-but-high-score", hasRequiredCertification: false, rating: 5, experienceLevel: "expert" }),
      baseCandidate({ profileId: "certified-lower-score", rating: 3, experienceLevel: "beginner" }),
    ];
    const ranked = rankCrewCandidates(candidates);
    expect(ranked[0].profileId).toBe("certified-lower-score");
    expect(ranked[0].eligible).toBe(true);
    expect(ranked[1].eligible).toBe(false);
  });

  it("sorts eligible candidates by score descending", () => {
    const candidates: CrewCandidate[] = [
      baseCandidate({ profileId: "lower", rating: 2 }),
      baseCandidate({ profileId: "higher", rating: 5 }),
    ];
    const ranked = rankCrewCandidates(candidates);
    expect(ranked[0].profileId).toBe("higher");
    expect(ranked[1].profileId).toBe("lower");
  });
});
