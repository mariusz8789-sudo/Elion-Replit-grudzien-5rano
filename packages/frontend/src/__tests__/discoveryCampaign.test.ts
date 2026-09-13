import { describe, expect, it } from 'vitest';
import { falsificationPowerAt, redundancyAt, runDiscoveryCampaign, type CampaignLaboratory } from '../core/agent/discoveryCampaign';
import type { ModelPoint } from '../core/agent/modelSpace';
import { makeKeplerCampaignLab, makeQe4CampaignLab } from '../core/biotechData/campaignLabs';

/**
 * The acceptance criteria the engine exists to satisfy:
 *  §13 two real end-to-end cases on ONE engine,
 *  §14 proof it is not hardcoded (swap the laboratory, the behaviour changes),
 *  §15 proof a model can enter the campaign AFTER a residual is observed.
 */

/**
 * A synthetic laboratory whose truth needs THREE terms (`2 + 0.5x² + 3·ln x`),
 * so with `maxTerms: 2` the best model the starting space can offer leaves
 * real structure behind — which is precisely the condition under which a new
 * model must be derived rather than enumerated.
 */
function syntheticQuadraticLab(): CampaignLaboratory {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const byX = new Map(xs.map((x) => [x, { x, y: 2 + 0.5 * x * x + 3 * Math.log(x), sigma: 0.05 }]));
  return {
    labId: 'synthetic-quadratic',
    problem: 'Synthetic: y = 2 + 0.5x² + 3·ln(x) with tight sigmas — deliberately outside a two-term grammar.',
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: 1, max: 8 },
    xLabel: 'x',
    yLabel: 'y',
  };
}

/**
 * Pure `y = 2 + 0.5x²` — deliberately outside a CONSTANT/LINEAR-only grammar
 * that also excludes every basis (`LOG`, `RECIPROCAL`, `POWER`,
 * `EXP_SATURATION`) `termsForFinding('CURVATURE')` would reach for. Any
 * residual-derived model this lab produces is therefore guaranteed to
 * reintroduce something the campaign froze out — the real, un-contrived case
 * the excluded-basis smuggling gate (F2/F5-3) exists to catch.
 */
function pureQuadraticLab(): CampaignLaboratory {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const byX = new Map(xs.map((x) => [x, { x, y: 2 + 0.5 * x * x, sigma: 0.05 }]));
  return {
    labId: 'synthetic-pure-quadratic',
    problem: 'Synthetic: y = 2 + 0.5x², deliberately outside a CONSTANT/LINEAR-only grammar.',
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: 1, max: 8 },
    xLabel: 'x',
    yLabel: 'y',
  };
}
const FROZEN_GRAMMAR_OPTIONS = { maxRounds: 6, maxTerms: 1, excludeBases: ['LOG', 'RECIPROCAL', 'POWER', 'EXP_SATURATION'] as const };

describe('discoveryCampaign — F2/F5 integrity gates (Government Research mode: flag, never block)', () => {
  it('excluded-basis smuggling (F2/F5-3): a residual-derived model reintroducing a frozen-out basis is flagged, and stays live', () => {
    const result = runDiscoveryCampaign(pureQuadraticLab(), FROZEN_GRAMMAR_OPTIONS);
    const smuggling = result.integrityFlags.filter((f) => f.gate === 'EXCLUDED_BASIS_SMUGGLING');
    expect(smuggling.length).toBeGreaterThan(0);
    expect(smuggling.some((f) => f.reason.includes('POWER') || f.reason.includes('LOG'))).toBe(true);
    // Flagged, never removed: the model this flag names is still present on some round's record.
    for (const flag of smuggling) {
      const stillLive = result.rounds.some((r) => r.models.some((m) => m.fingerprint === flag.modelFingerprint) || r.derivedThisRound.some((m) => m.fingerprint === flag.modelFingerprint));
      expect(stillLive).toBe(true);
    }
  });

  it('hold-out diagnostic (F2/F5-6/F2/F5-7): reported once at least two observations are admitted, carrying the disclosed split method', () => {
    const result = runDiscoveryCampaign(pureQuadraticLab(), FROZEN_GRAMMAR_OPTIONS);
    const withHoldout = result.rounds.filter((r) => r.holdout !== null);
    expect(withHoldout.length).toBeGreaterThan(0);
    for (const round of withHoldout) expect(round.holdout!.method).toBe('LEAVE_LAST_ADMITTED_OUT_V1');
  });

  it('novelty gate (F2/F5-2): every live model across the whole campaign has a distinct fingerprint — no duplicate is ever re-registered', () => {
    const result = runDiscoveryCampaign(pureQuadraticLab(), FROZEN_GRAMMAR_OPTIONS);
    const allFingerprints = [...result.rounds[0]!.models.map((m) => m.fingerprint), ...result.rounds.flatMap((r) => r.derivedThisRound.map((m) => m.fingerprint))];
    expect(new Set(allFingerprints).size).toBe(allFingerprints.length);
  });

  it('temporal lineage (F2/F5-1): a real campaign never violates it — every derivation is genuinely from residuals already on the record', () => {
    const result = runDiscoveryCampaign(pureQuadraticLab(), FROZEN_GRAMMAR_OPTIONS);
    expect(result.integrityFlags.filter((f) => f.gate === 'TEMPORAL_LINEAGE')).toHaveLength(0);
  });

  it('flags never appear in isolation from provenance: every flag names its gate, its model and the round it was raised on', () => {
    const result = runDiscoveryCampaign(pureQuadraticLab(), FROZEN_GRAMMAR_OPTIONS);
    expect(result.integrityFlags.length).toBeGreaterThan(0);
    for (const flag of result.integrityFlags) {
      expect(flag.modelFingerprint.length).toBeGreaterThan(0);
      expect(flag.round).toBeGreaterThan(0);
      expect(flag.reason.length).toBeGreaterThan(20);
    }
  });
});

describe('discoveryCampaign — §15: a model derived from residuals, after observation', () => {
  it('derives at least one model MID-CAMPAIGN that was not in the starting space, and records its parent + operator', () => {
    const result = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 6, maxTerms: 2 });
    const derived = result.rounds.flatMap((r) => r.derivedThisRound);
    expect(derived.length).toBeGreaterThan(0);
    for (const model of derived) {
      expect(model.enteredAtRound).toBeGreaterThan(0);
      expect(model.derivedFrom).not.toBeNull();
      expect(model.derivationOperator).toContain('RESIDUAL');
    }
  });

  it('the derived model is flagged as post-observation by its own lineage, never presented as pre-registered', () => {
    const result = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 6, maxTerms: 2 });
    const seeded = result.rounds[0]!.models.map((m) => m.fingerprint);
    for (const model of result.rounds.flatMap((r) => r.derivedThisRound)) {
      expect(seeded).not.toContain(model.fingerprint);
    }
  });

  it('records the residual finding that motivated the derivation — not a bare "residual was non-zero"', () => {
    const result = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 6, maxTerms: 2 });
    const findings = result.rounds.flatMap((r) => r.residualFindings);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.evidence.length > 20 && f.strength > 0)).toBe(true);
  });
});

describe('discoveryCampaign — autonomous experiment selection', () => {
  it('chooses each next experiment by a real discrimination score, with a stated reason', () => {
    const result = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 5, maxTerms: 2 });
    const withChoice = result.rounds.filter((r) => r.selectedNextX !== null);
    expect(withChoice.length).toBeGreaterThan(0);
    for (const round of withChoice) {
      expect(round.discriminationScore).not.toBeNull();
      expect(round.selectionReason).toContain('disagree');
    }
  });

  it('admits exactly the experiments it selected — the loop acts on its own choice', () => {
    const result = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 5, maxTerms: 2 });
    for (let i = 0; i + 1 < result.rounds.length; i += 1) {
      const chosen = result.rounds[i]!.selectedNextX;
      if (chosen === null) continue;
      expect(result.rounds[i + 1]!.admittedX).toContain(chosen);
    }
  });

  it('every round passes a real anti-HARK check against its own prior rounds', () => {
    const result = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 5, maxTerms: 2 });
    for (const round of result.rounds) expect(round.antiHarking.intact).toBe(true);
  });

  it('is replay-deterministic: two independent runs agree on every round fingerprint', () => {
    const a = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 5, maxTerms: 2 });
    const b = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 5, maxTerms: 2 });
    expect(a.campaignFingerprint).toBe(b.campaignFingerprint);
    expect(a.rounds.map((r) => r.roundFingerprint)).toEqual(b.rounds.map((r) => r.roundFingerprint));
  });
});

describe('discoveryCampaign — C3-1: Fals and Redund planner-score terms', () => {
  it('reports Fals, Redund and a combined planner score alongside Sep for every real choice, never EIG/Cost/Risk', () => {
    const result = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 5, maxTerms: 2 });
    const withChoice = result.rounds.filter((r) => r.selectedNextX !== null);
    expect(withChoice.length).toBeGreaterThan(0);
    for (const round of withChoice) {
      expect(round.falsificationScore).not.toBeNull();
      expect(round.falsificationScore!).toBeGreaterThanOrEqual(0);
      expect(round.falsificationScore!).toBeLessThanOrEqual(1);
      expect(round.redundancyScore).not.toBeNull();
      expect(round.redundancyScore!).toBeGreaterThanOrEqual(0);
      expect(round.redundancyScore!).toBeLessThanOrEqual(1);
      expect(round.plannerScore).not.toBeNull();
    }
    expect(JSON.stringify(result)).not.toMatch(/\bEIG\b/);
  });

  it('the reported plannerScore is exactly Sep × (1 + w·Fals) × (1 − w·Redund) for its own reported Sep/Fals/Redund', () => {
    const REFINEMENT_WEIGHT = 0.25;
    const result = runDiscoveryCampaign(syntheticQuadraticLab(), { maxRounds: 5, maxTerms: 2 });
    for (const round of result.rounds.filter((r) => r.selectedNextX !== null)) {
      const expected = round.discriminationScore! * (1 + REFINEMENT_WEIGHT * round.falsificationScore!) * (1 - REFINEMENT_WEIGHT * round.redundancyScore!);
      expect(round.plannerScore!).toBeCloseTo(expected, 9);
    }
  });

  it('Redund (F2/F5-8): 0 with no admitted observations, 1 at an already-admitted x, and strictly decreasing with distance from the nearest one', () => {
    const pt = (x: number): ModelPoint => ({ x, y: 0, sigma: 1 });
    expect(redundancyAt(5, [], 10)).toBe(0);
    expect(redundancyAt(5, [pt(5)], 10)).toBe(1);
    const near = redundancyAt(6, [pt(5)], 10);
    const far = redundancyAt(15, [pt(5)], 10);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThanOrEqual(0);
  });

  it('Fals (F2/F5-9): 0 for fewer than two finite predictions, 1 when at least one live pair is separable past 3σ, 0 when every pair agrees within it', () => {
    expect(falsificationPowerAt(5, [{ predict: () => 1 }], 0.1)).toBe(0);
    const allSeparated = [{ predict: () => 0 }, { predict: () => 100 }, { predict: () => -100 }];
    expect(falsificationPowerAt(5, allSeparated, 0.1)).toBe(1);
    const allAgree = [{ predict: () => 5 }, { predict: () => 5.001 }, { predict: () => 4.999 }];
    expect(falsificationPowerAt(5, allAgree, 1)).toBe(0);
  });

  it('Fals asks "can this actually falsify a live model" (sigma-relative), which raw spread (Sep) cannot answer', () => {
    // Identical predictions, identical spread (4) in both calls — only the measurement noise at x differs.
    const fits = [{ predict: () => 0 }, { predict: () => 4 }];
    expect(falsificationPowerAt(0, fits, 10)).toBe(0); // 4 apart is noise under sigma=10: cannot falsify either model
    expect(falsificationPowerAt(0, fits, 1)).toBe(1); // the same 4-unit gap is >3σ under sigma=1: genuinely falsifying
  });
});

describe('discoveryCampaign — CASE A: QE4 entanglement growth (real pinned quantum data)', () => {
  it('runs end-to-end and reaches a real winning model over the pinned dataset', () => {
    const result = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
    expect(result.rounds.length).toBeGreaterThan(0);
    expect(result.discovery.winningModel).not.toBeNull();
    expect(result.discovery.winningFormulaWithCoefficients).toContain('y =');
  }, 30000);

  it('produces an honest Discovery record: assumptions, uncertainty and decision basis all present', () => {
    const { discovery } = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
    expect(discovery.assumptions.length).toBeGreaterThan(0);
    expect(discovery.uncertainty).toContain('RSS');
    expect(discovery.decisionBasis.length).toBeGreaterThan(20);
  }, 30000);

  it('withholds a practical protocol rather than inventing one for a descriptive law', () => {
    const { discovery } = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
    expect(discovery.practicalCandidate).not.toBeNull();
    expect(discovery.practicalCandidate!.proposedProtocol).toBeNull();
    expect(discovery.practicalCandidate!.protocolWithheldReason).toContain('DESCRIPTIVE');
  }, 30000);
});

describe('discoveryCampaign — CASE B: planetary orbits (real pinned NASA data, different science)', () => {
  it('recovers Kepler\'s third law from nine published pairs: log-period is linear in log-distance with slope ≈ 1.5', () => {
    const result = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    const formula = result.discovery.winningFormulaWithCoefficients;
    expect(formula).not.toBeNull();
    // The fitted slope is the SECOND coefficient of `c0 + c1·x` (terms are canonically ordered CONSTANT, LINEAR).
    const coefficients = formula!.slice(formula!.indexOf('[') + 1, formula!.indexOf(']')).split(',').map((s) => Number(s.trim()));
    const slope = coefficients[coefficients.length - 1]!;
    expect(slope).toBeGreaterThan(1.45);
    expect(slope).toBeLessThan(1.55);
  });

  it('is the SAME engine as CASE A — different laboratory, different winning shape, no QE4 anything in the record', () => {
    const kepler = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    expect(kepler.labId).toBe('nasa-nssdc-planetary-orbits');
    expect(JSON.stringify(kepler.discovery)).not.toContain('qe4');
    expect(kepler.discovery.winningModel).not.toBeNull();
  });

  it('selects its experiments in a different order than CASE A does — the sequence follows the data, not a script', () => {
    const kepler = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    const qe4 = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
    expect(kepler.rounds.map((r) => r.selectedNextX)).not.toEqual(qe4.rounds.map((r) => r.selectedNextX));
  }, 30000);

  it('is replay-deterministic on real data too', () => {
    const a = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    const b = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    expect(a.campaignFingerprint).toBe(b.campaignFingerprint);
  });
});

describe('discoveryCampaign — §15 on REAL data: the engine re-derives a shape its grammar was denied', () => {
  /**
   * The strongest form of the acceptance criterion. The QE4 disorder data is
   * genuinely logarithmic in T, so LOG is excluded from the grammar up front:
   * the true shape is NOT reachable by enumeration. The engine must therefore
   * either settle for a worse model, or notice the structure its best model
   * leaves behind and build the missing term itself.
   */
  const denyLog = { maxRounds: 7, maxTerms: 2, excludeBases: ['LOG'] as const };

  it('derives a model containing the excluded LOG term, from residual structure alone', () => {
    const result = runDiscoveryCampaign(makeQe4CampaignLab(5), denyLog);
    const derived = result.rounds.flatMap((r) => r.derivedThisRound);
    expect(derived.some((m) => m.formula.includes('log'))).toBe(true);
  }, 30000);

  it('that derived model goes on to WIN the campaign, beating everything the starting space contained', () => {
    const result = runDiscoveryCampaign(makeQe4CampaignLab(5), denyLog);
    const winner = result.discovery.winningModel;
    expect(winner).not.toBeNull();
    expect(winner!.enteredAtRound).toBeGreaterThan(0);
    expect(winner!.derivedFrom).not.toBeNull();
    expect(winner!.formula).toContain('log');
  }, 30000);

  it('the winning derived model fits strictly better than the best model the grammar could enumerate', () => {
    const result = runDiscoveryCampaign(makeQe4CampaignLab(5), denyLog);
    const roundThatDerived = result.rounds.find((r) => r.derivedThisRound.length > 0)!;
    const later = result.rounds[result.rounds.length - 1]!;
    expect(later.models[0]!.rss!).toBeLessThan(roundThatDerived.models[0]!.rss!);
  }, 30000);
});
