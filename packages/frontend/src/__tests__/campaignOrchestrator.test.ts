import { describe, expect, it, beforeEach } from 'vitest';
import { runAutonomousOrchestrator } from '../core/agent/campaignOrchestrator';
import { makeKeplerDomainAdapter, makeQe4DomainAdapter } from '../core/biotechData/domainAdapterRegistry';
import { KEPLER_MARS_ANCHOR_ID } from '../core/biotechData/externalAnchor';
import type { DomainAdapter } from '../core/agent/domainAdapter';
import type { CampaignLaboratory } from '../core/agent/discoveryCampaign';
import { resetFalsifiedModelRegistryForTests } from '../core/agent/falsifiedModelRegistry';
import { resetNoveltyGateRegistryForTests } from '../core/agent/noveltyGate';

/**
 * E3 acceptance criteria this suite exercises directly:
 *  H. next campaign runs WITHOUT a human providing the question.
 *  B. every direction carries provenance + a generation reason (via E1, reused here).
 *  I. Science-Memory-shaped outcome: this orchestrator records DISCOVERY findings into noveltyGate's registry (checked below).
 *  O. zero DONE claimed without runtime evidence — every assertion here reads real CampaignResult/CandidateDirection fields, never a hand-typed trace.
 */

function quadLabMissingIntercept(labId: string, sigma = 0.05): CampaignLaboratory {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const byX = new Map(xs.map((x) => [x, { x, y: 2 + 0.5 * x * x, sigma }]));
  return {
    labId,
    problem: `Synthetic (${labId}): y = 2 + 0.5x^2 — a frozen 1-term, no-POWER grammar cannot see the intercept.`,
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: 1, max: 10 },
    xLabel: 'x',
    yLabel: 'y',
  };
}

function adapterFor(lab: CampaignLaboratory): DomainAdapter {
  return {
    capabilities: { domainId: lab.labId, description: lab.problem, xLabel: lab.xLabel, yLabel: lab.yLabel },
    availableData: () => lab.candidateX,
    laboratory: lab,
    provenance: { sourceUrl: 'synthetic://test-fixture', sourceVersion: '1', license: null, retrievedAt: null },
    limitations: ['Synthetic test fixture.'],
  };
}

beforeEach(() => {
  resetFalsifiedModelRegistryForTests();
  resetNoveltyGateRegistryForTests();
});

describe('E3 — autonomous orchestrator, real multi-round continuation (criterion H)', () => {
  it('a residual left by a frozen grammar drives a SECOND campaign with no human input, which then stops honestly', () => {
    const seed = adapterFor(quadLabMissingIntercept('quad-orch-1'));
    const trace = runAutonomousOrchestrator({
      seedAdapter: seed,
      options: { maxRounds: 8, maxTerms: 1, excludeBases: ['POWER'] },
      maxCampaigns: 5,
    });

    // Criterion H: more than one campaign ran, and every campaign after the
    // seed was launched from a real CandidateDirection, not a human question.
    expect(trace.campaigns.length).toBeGreaterThanOrEqual(2);
    expect(trace.autonomyProven).toBe(true);
    expect(trace.campaigns[0]!.direction).toBeNull();
    for (const campaign of trace.campaigns.slice(1)) {
      expect(campaign.direction).not.toBeNull();
      expect(campaign.direction!.generationMethod).toBe('RESIDUAL_STRUCTURE_UNEXPLAINED');
      // Criterion B: provenance + generation reason, real fields off the finished campaign.
      expect(campaign.direction!.provenance.sourceCampaignFingerprint.length).toBeGreaterThan(0);
      expect(campaign.direction!.whyNow.length).toBeGreaterThan(0);
      expect(campaign.launchedAutonomously).toBe(true);
    }

    // The second campaign's own laboratory is the SAME domain — a relaxed
    // grammar rerun, never a fabricated new laboratory.
    expect(trace.campaigns[1]!.result.labId).toBe(trace.campaigns[0]!.result.labId);

    // Each campaign's result label passed E2's own assertion (assertValidResultLabel
    // never throws inside runAutonomousOrchestrator, or this test would have thrown too).
    for (const campaign of trace.campaigns) {
      expect(['DISCOVERY', 'REPRODUCTION', 'HYPOTHESIS_UNKNOWN', 'NO_ACCESS_DECLARED']).toContain(campaign.resultLabel);
    }

    expect(['NO_INFORMATION_GAIN', 'CONVERGED', 'MAX_CAMPAIGNS_REACHED']).toContain(trace.stopReason);
  });

  it('the seed campaign\'s DISCOVERY is recorded into the novelty gate\'s known-findings registry, so re-running the identical seed reads NOT_NEW next time', () => {
    const seedLab = quadLabMissingIntercept('quad-orch-registry');
    const first = runAutonomousOrchestrator({ seedAdapter: adapterFor(seedLab), options: { maxRounds: 8, maxTerms: 1, excludeBases: ['POWER'] }, maxCampaigns: 1 });
    expect(first.campaigns[0]!.resultLabel).toBe('DISCOVERY');

    const second = runAutonomousOrchestrator({ seedAdapter: adapterFor(quadLabMissingIntercept('quad-orch-registry')), options: { maxRounds: 8, maxTerms: 1, excludeBases: ['POWER'] }, maxCampaigns: 1 });
    expect(second.campaigns[0]!.noveltyAssessment.level).toBe('NOT_NEW');
    expect(second.campaigns[0]!.resultLabel).toBe('REPRODUCTION');
  });
});

describe('E3 — honest stopping rules on real domains (never forced infinite autonomy)', () => {
  it('Kepler: a cleanly converged real campaign stops at NO_INFORMATION_GAIN after exactly one campaign', () => {
    const trace = runAutonomousOrchestrator({ seedAdapter: makeKeplerDomainAdapter(), options: { maxRounds: 7, maxTerms: 2 }, maxCampaigns: 4 });
    expect(trace.campaigns.length).toBe(1);
    expect(trace.stopReason).toBe('NO_INFORMATION_GAIN');
    expect(trace.autonomyProven).toBe(false); // nothing to prove with only the seed campaign
  });

  it('QE4: an unresolved observation gap with no gapResolver declared stops at INSUFFICIENT_DATA, never fabricated', () => {
    const trace = runAutonomousOrchestrator({ seedAdapter: makeQe4DomainAdapter(), options: { maxRounds: 6, maxTerms: 2 }, maxCampaigns: 4 });
    expect(trace.stopReason).toBe('INSUFFICIENT_DATA');
    expect(trace.campaigns.length).toBe(1);
  });

  it('maxCampaigns guards against unbounded autonomy: a tiny cap is honored even mid-progress', () => {
    const seed = adapterFor(quadLabMissingIntercept('quad-orch-cap'));
    const trace = runAutonomousOrchestrator({ seedAdapter: seed, options: { maxRounds: 8, maxTerms: 1, excludeBases: ['POWER'] }, maxCampaigns: 1 });
    expect(trace.campaigns.length).toBe(1);
    expect(trace.stopReason).toBe('MAX_CAMPAIGNS_REACHED');
  });
});

describe('E3 — determinism: replaying the same seed produces the same trace shape', () => {
  it('two independent orchestrator runs on the same synthetic seed produce identical campaign fingerprints', () => {
    resetFalsifiedModelRegistryForTests();
    resetNoveltyGateRegistryForTests();
    const a = runAutonomousOrchestrator({ seedAdapter: adapterFor(quadLabMissingIntercept('quad-orch-replay')), options: { maxRounds: 8, maxTerms: 1, excludeBases: ['POWER'] }, maxCampaigns: 5 });
    resetFalsifiedModelRegistryForTests();
    resetNoveltyGateRegistryForTests();
    const b = runAutonomousOrchestrator({ seedAdapter: adapterFor(quadLabMissingIntercept('quad-orch-replay')), options: { maxRounds: 8, maxTerms: 1, excludeBases: ['POWER'] }, maxCampaigns: 5 });

    expect(a.stopReason).toBe(b.stopReason);
    expect(a.campaigns.map((c) => c.result.campaignFingerprint)).toEqual(b.campaigns.map((c) => c.result.campaignFingerprint));
  });
});

describe('TE5 — Full Autonomous Discovery E2E, the mandate\'s own Kepler fixture', () => {
  it('"characterize period vs semi-major axis without assuming the functional form" reproduces Kepler\'s third law, labeled REPRODUCTION, never a fabricated DISCOVERY', () => {
    const trace = runAutonomousOrchestrator({
      seedAdapter: makeKeplerDomainAdapter(),
      options: { maxRounds: 7, maxTerms: 2 },
      maxCampaigns: 3,
      // Declared, not inferred — the same anchor externalAnchor.ts already
      // uses to state this relation is 17th-century public knowledge.
      declaredPublicAnchorResolver: () => ({
        anchorId: KEPLER_MARS_ANCHOR_ID,
        summary: 'Kepler\'s third law over the NASA NSSDC fact sheet — established public knowledge, per externalAnchor.ts.',
      }),
    });

    expect(trace.campaigns.length).toBe(1);
    const campaign = trace.campaigns[0]!;

    // The mandate's own stated PASS condition for this fixture.
    expect(campaign.resultLabel).toBe('REPRODUCTION');
    expect(campaign.noveltyAssessment.level).toBe('NOT_NEW');

    // The recovered slope is the real evidence, not an assumed 3/2 — read
    // off the actual fitted coefficients.
    const formula = campaign.result.discovery.winningFormulaWithCoefficients ?? '';
    const coefficients = /\[([-\d.]+),\s*([-\d.]+)\]/.exec(formula);
    expect(coefficients).not.toBeNull();
    const slope = Number(coefficients![2]);
    expect(slope).toBeCloseTo(1.5, 1);

    expect(trace.stopReason).toBe('NO_INFORMATION_GAIN');
  });

  it('WITHOUT the declared anchor, the same real data would wrongly clear the novelty bar — proving the anchor is load-bearing, not decorative', () => {
    const trace = runAutonomousOrchestrator({
      seedAdapter: makeKeplerDomainAdapter(),
      options: { maxRounds: 7, maxTerms: 2 },
      maxCampaigns: 1,
      // No declaredPublicAnchorResolver this time.
    });
    const campaign = trace.campaigns[0]!;
    // Without a declared anchor, nothing in the checked corpus knows this
    // is centuries-old — the gate honestly reports NOVEL_WITHIN_CHECKED_CORPUS
    // and (with full evidence present) DISCOVERY, which is exactly the
    // failure mode a real caller MUST supply the anchor to avoid.
    expect(campaign.noveltyAssessment.level).toBe('NOVEL_WITHIN_CHECKED_CORPUS');
    expect(campaign.resultLabel).toBe('DISCOVERY');
  });
});
