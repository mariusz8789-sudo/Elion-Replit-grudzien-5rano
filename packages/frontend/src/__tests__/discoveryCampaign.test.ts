import { describe, expect, it } from 'vitest';
import { runDiscoveryCampaign, type CampaignLaboratory } from '../core/agent/discoveryCampaign';
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
