import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateDemonstratorDataset,
  measurementNoiseUnit,
  reviseBeliefFromSelfFalsification,
  runStructuralDiscovery,
} from '../core/agent/structuralDiscovery';
import { recordFalsification, resetFalsifiedModelRegistryForTests } from '../core/agent/falsifiedModelRegistry';
import { createHypothesis, updateConfidence } from '../core/experimentFabric/beliefRevision';
import { modelSpecFingerprint, type ModelSpec } from '../core/agent/modelSpace';

/**
 * M3 STRUCTURAL DISCOVERY — the permanent guard on the capability the
 * demonstrator exercises. These tests must FAIL if the winning structure is
 * ever pre-registered, hardcoded, or produced anywhere but the runtime search.
 */

const DEMO_XS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const FLAT_GRAMMAR = ['LOG', 'POWER', 'EXP_SATURATION', 'RECIPROCAL'] as const;

function mainRun(respectRegistry = false) {
  return runStructuralDiscovery({
    dataset: generateDemonstratorDataset({ linear: 1.7, quadratic: 0.45, sigma: 0.25 }, DEMO_XS),
    labId: 'm3-structural-demonstrator',
    problem: 'How does y depend on x? The generating process is not disclosed to the engine.',
    excludeBases: [...FLAT_GRAMMAR],
    maxTerms: 2,
    maxRounds: 12,
    respectFalsifiedModelRegistry: respectRegistry,
  });
}

afterEach(() => {
  resetFalsifiedModelRegistryForTests();
  vi.unstubAllGlobals();
});

describe('M3 — the demonstrator data is honest', () => {
  it('its measurement offsets are NOISE, not a second signal: |r(x, offset)| stays small', () => {
    const offsets = DEMO_XS.map((x) => measurementNoiseUnit(x));
    const n = DEMO_XS.length;
    const mx = DEMO_XS.reduce((a, b) => a + b, 0) / n;
    const mo = offsets.reduce((a, b) => a + b, 0) / n;
    let sxy = 0; let sxx = 0; let soo = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = DEMO_XS[i]! - mx;
      const doff = offsets[i]! - mo;
      sxy += dx * doff; sxx += dx * dx; soo += doff * doff;
    }
    const r = sxy / Math.sqrt(sxx * soo);
    /*
     * The first version of this function left r at -0.83, which made the
     * straight-line control "discover" a trend the generator had put there.
     *
     * The bound is 2/sqrt(n), the conventional ~95% limit under NO association,
     * and not a tighter number: for n = 16 the sampling SD of r under
     * independence is 1/sqrt(15) = 0.258, so demanding |r| < 0.15 would reject
     * most genuinely independent sequences and could only be met by shopping
     * for a lucky salt. Measured here: 0.2590.
     */
    expect(Math.abs(r)).toBeLessThan(2 / Math.sqrt(n));
    // And it must actually disperse the data, not sit in two flat bands.
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(1);
  });

  it('is deterministic: same declaration, same data, same fingerprint', () => {
    const a = generateDemonstratorDataset({ linear: 1.7, quadratic: 0.45, sigma: 0.25 }, DEMO_XS);
    const b = generateDemonstratorDataset({ linear: 1.7, quadratic: 0.45, sigma: 0.25 }, DEMO_XS);
    expect(a.datasetFingerprint).toBe(b.datasetFingerprint);
    expect(a.points).toEqual(b.points);
  });

  it('holds the hold-out genuinely apart: no held-out x appears among the fitted points', () => {
    const dataset = generateDemonstratorDataset({ linear: 1.7, quadratic: 0.45, sigma: 0.25 }, DEMO_XS);
    expect(dataset.heldOut.length).toBeGreaterThan(0);
    const fittedX = new Set(dataset.points.map((p) => p.x));
    for (const p of dataset.heldOut) expect(fittedX.has(p.x)).toBe(false);
  });
});

describe('M3 — the structure is discovered, not supplied', () => {
  it('the winner was absent from the preregistered space and entered AFTER observation', () => {
    const { report } = mainRun();
    expect(report.winner).not.toBeNull();
    // THE TEST THAT MUST FAIL IF THE ANSWER IS EVER PRE-REGISTERED OR HARDCODED.
    expect(report.preregisteredFingerprints).not.toContain(report.winner!.fingerprint);
    expect(report.winnerWasPreregistered).toBe(false);
    expect(report.winnerEnteredAtRound).toBeGreaterThan(0);
  });

  it('no preregistered model could bend at all — a curved winner had to be built', () => {
    const { report } = mainRun();
    for (const formula of report.preregisteredFormulas) {
      expect(formula).not.toContain('^2');
      expect(formula).not.toContain('log');
      expect(formula).not.toContain('^0.5');
    }
    expect(report.winner!.formula).toContain('^2');
  });

  it('lineage traces to the parent and to the residual operator that motivated it', () => {
    const { report } = mainRun();
    expect(report.winnerDerivedFrom).not.toBeNull();
    expect(report.winnerOperator).toMatch(/^RESIDUAL_/);
    expect(report.residualFindingKinds.length).toBeGreaterThan(0);
    expect((report.residualEvidence ?? '').length).toBeGreaterThan(40);
  });

  it('the winner is structurally different, not the same model refitted', () => {
    const { report } = mainRun();
    expect(report.winnerIsStructurallyDifferent).toBe(true);
    expect(report.winner!.coefficientCount).toBeGreaterThan(report.parent.coefficientCount);
  });

  it('the answer had real competition: several structures were proposed and one won on merit', () => {
    const { report } = mainRun();
    const distinct = new Set(report.generatedCandidates.map((c) => c.formula));
    expect(distinct.size).toBeGreaterThan(1);
    // Competitors that were proposed and did NOT win.
    expect([...distinct].some((f) => f.includes('log') || f.includes('^0.5'))).toBe(true);
  });

  it('beats the parent both in-sample and out-of-sample', () => {
    const { report } = mainRun();
    expect(report.winner!.trainingRss!).toBeLessThan(report.parent.trainingRss!);
    expect(report.winner!.holdoutScore!).toBeLessThan(report.parent.holdoutScore!);
  });
});

describe('M3 — self-falsification and belief', () => {
  it('runs a real self-falsification against held-out data, classified by the Tautology Gate', () => {
    const { report } = mainRun();
    expect(report.selfFalsification).not.toBeNull();
    expect(report.selfFalsification!.tautology.classification).toBe('EMPIRICAL_TEST');
    expect(report.selfFalsification!.falsified).toBe(false);
    expect(report.selfFalsification!.criterion).toContain('chi-square');
  });

  it('moves belief through the existing BeliefRevision rather than by assignment', () => {
    const { report } = mainRun();
    const belief = reviseBeliefFromSelfFalsification(
      report.winner!.fingerprint, report.winner!.formula, report.selfFalsification!, report.winnerEnteredAtRound,
    );
    expect(belief.before.confidence).toBe(0.5);
    expect(belief.after.confidence).toBeGreaterThan(0.5);
    expect(belief.after.status).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(belief.after.history.length).toBeGreaterThan(0);
  });
});

describe('M3 — replay', () => {
  it('two independent runs agree on the campaign and on the whole report', () => {
    const a = mainRun().report;
    const b = mainRun().report;
    expect(a.campaignFingerprint).toBe(b.campaignFingerprint);
    expect(a.reportFingerprint).toBe(b.reportFingerprint);
  });
});

describe('M3 — negative control: no real structure', () => {
  const flatRun = () => runStructuralDiscovery({
    dataset: generateDemonstratorDataset({ linear: 1.7, quadratic: 0, sigma: 0.25 }, DEMO_XS),
    labId: 'm3-negative-control-no-structure',
    problem: 'How does y depend on x, where the process is genuinely a straight line?',
    excludeBases: [...FLAT_GRAMMAR],
    maxTerms: 2,
    maxRounds: 12,
  }).report;

  it('does NOT put an invented model into the scientific record', () => {
    const report = flatRun();
    expect(report.winnerWasPreregistered).toBe(true);
    expect(report.winnerEnteredAtRound).toBe(0);
    expect(report.winner!.formula).not.toContain('^2');
  });

  it('AUDITS the near-threshold detection instead of hiding it or tuning it away', () => {
    const report = flatRun();
    // The detector fires on this noise (measured ratio 0.4978 against a 0.5
    // threshold). Selection rejects everything it proposed, and the flag says so
    // with the evidence attached — Government Research rules: flag, never hide.
    expect(report.specificityFlag).not.toBeNull();
    expect(report.specificityFlag!).toContain('AUDIT');
    expect(report.specificityFlag!).toContain('rejected every one');
  });
});

describe('M3 — negative control: overfitting', () => {
  it('a model with more freedom is not selected merely for fitting training better', () => {
    const { report, campaign } = mainRun();
    // Every live model with MORE coefficients than the winner must have lost,
    // and must have lost on the penalised score, not on raw RSS alone.
    const finalRound = campaign.rounds[campaign.rounds.length - 1]!;
    const winnerEntry = finalRound.models.find((m) => m.fingerprint === report.winner!.fingerprint)!;
    const moreComplex = finalRound.models.filter((m) => m.complexity > winnerEntry.complexity && m.rss !== null);
    for (const rival of moreComplex) {
      expect(rival.fingerprint).not.toBe(report.winner!.fingerprint);
    }
    expect(finalRound.models[0]!.fingerprint).toBe(report.winner!.fingerprint);
  });
});

describe('M3 — negative control: a globally falsified structure', () => {
  it('is consulted in the registry, blocked, and the block is recorded for audit', () => {
    const quadratic: ModelSpec = {
      id: '',
      terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: 'x' }, { basis: 'POWER', variable: 'x', exponent: 2 }],
      lineage: null,
    };
    const evidence = updateConfidence(
      createHypothesis('pre-falsified', { metric: 'demo', relation: 'less-than', rationale: 'Refuted earlier.' }, 0.5, 'REGIME_FIT_FROM_GRID', null),
      'FALSIFIED_WITHIN_PROTOCOL', 1, 'Refuted on an earlier run.', 1,
    );
    recordFalsification({
      spec: quadratic,
      scope: {
        domain: 'm3-structural-demonstrator',
        assumptions: [
          'Observations are independent and their reported sigmas are correct.',
          'The true relationship lies within the declared model grammar.',
          'Each basis term is linear in its coefficient; nonlinear shape parameters were enumerated, not optimised.',
        ],
        boundary: 'x in [1, 15]',
      },
      reusableAs: 'NEVER',
      evidence,
      campaignId: 'm3-structural-demonstrator',
      round: 1,
      observationIds: ['demo:x=1', 'demo:x=2', 'demo:x=3'],
    });

    const { report } = mainRun(true);
    expect(report.registryConsulted).toBe(true);
    expect(report.registryBlockedFingerprints).toContain(modelSpecFingerprint(quadratic));
    expect(report.registryAudit.join(' ')).toContain('BLOCK');
    // The finding is redirected, not suppressed: the campaign still reports a winner.
    expect(report.winner).not.toBeNull();
    expect(report.winner!.formula).not.toContain('^2');
  });
});

describe('M3 — the run reaches Science Memory', () => {
  it('writes the discovery through the existing saveExperiment path, with its fingerprints', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
        key: (i: number) => [...storage.keys()][i] ?? null,
        get length() { return storage.size; },
      },
    });
    vi.resetModules();
    const { saveDiscoveryCampaignToMemory, listExperiments } = await import('../core/scienceMemory');
    const { report, campaign } = mainRun();

    const before = listExperiments().length;
    const record = saveDiscoveryCampaignToMemory({
      labId: report.labId,
      problem: 'M3 structural discovery demonstrator',
      rounds: campaign.rounds.length,
      stopReason: report.stopReason,
      winningFormula: report.winner!.formula,
      winnerEnteredAtRound: report.winnerEnteredAtRound,
      winnerDerivedFrom: report.winnerDerivedFrom,
      derivedModelFormulas: report.generatedCandidates.map((c) => c.formula),
      observationsAdmitted: campaign.rounds[campaign.rounds.length - 1]!.admittedX.length,
      observationGapTriggers: campaign.observationGaps.map((g) => g.trigger),
      campaignFingerprint: report.campaignFingerprint,
      gapLedgerFingerprint: campaign.gapLedgerFingerprint,
      graphFingerprint: report.reportFingerprint,
    });

    expect(listExperiments().length).toBe(before + 1);
    expect(record.epistemicStatus).toBe('PREDICTION');
    const bodies = record.analysis!.map((a) => a.body).join(' ');
    expect(bodies).toContain(report.campaignFingerprint);
    // The record says the winner did not exist when the campaign began.
    expect(bodies).toContain('NIE istnial');
  });
});
