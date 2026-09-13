import { describe, expect, it } from 'vitest';
import { runDiscoveryCampaign, type CampaignLaboratory } from '../core/agent/discoveryCampaign';
import { QE4_DATASET_LABORATORY, pointsForGrid } from '../core/biotechData/qe4DatasetLaboratory';
import { findQualifiedSource, fulfillExperimentGap, resumeCampaignWithFulfilment } from '../core/agent/experimentFulfillment';
import { classifyObservationGap, createObservationGapRequest, undeclaredFeasibility } from '../core/agent/observationGap';

/** A gap request built the same way discoveryCampaign.ts itself builds one — reused, never hand-faked past what the module actually produces. */
function makeGap(liveIds: readonly string[]): ReturnType<typeof createObservationGapRequest> {
  const trigger = classifyObservationGap({ unobservedCount: 0, bestDiscriminability: null });
  return createObservationGapRequest({
    campaignId: 'qe4-fulfillment-test',
    round: 3,
    liveHypothesisIds: liveIds,
    unobservedCount: 0,
    bestDiscriminability: null,
    trigger: trigger ?? 'NO_ATTACHED_EXPERIMENT',
    requiredObservable: { quantity: 'second Rényi entropy S2', unit: 'dimensionless', instrumentClass: 'trapped-ion quantum simulator' },
    feasibility: undeclaredFeasibility('Test fixture: feasibility left undeclared on purpose.'),
    requestedFrom: 'EXTERNAL_DATASET',
  });
}

describe('E5 step 2 — findQualifiedSource requires an exact point in the source\'s own grid', () => {
  it('finds QE4 for a real pinned point', () => {
    const points = pointsForGrid('disorder', 5);
    expect(points.length).toBeGreaterThan(0);
    const pointId = `disorder:T=${points[0]!.t}:k=5`;
    const found = findQualifiedSource(pointId, [QE4_DATASET_LABORATORY]);
    expect(found?.labId).toBe(QE4_DATASET_LABORATORY.labId);
  });

  it('finds nothing for a point no registered source declares', () => {
    const found = findQualifiedSource('disorder:T=999999:k=5', [QE4_DATASET_LABORATORY]);
    expect(found).toBeNull();
  });
});

describe('E5 steps 2-5 — fulfillExperimentGap: real data, or an honest NO_ACCESS_DECLARED, never fabrication', () => {
  it('fulfills from a real pinned QE4 point, verified reproducible across two independent runs', () => {
    const points = pointsForGrid('disorder', 5);
    const target = points[3]!;
    const pointId = `disorder:T=${target.t}:k=5`;
    const gap = makeGap(['model-a', 'model-b']);

    const result = fulfillExperimentGap({ gap, registry: [QE4_DATASET_LABORATORY], pointId, atX: target.t });

    expect(result.outcome).toBe('FULFILLED');
    expect(result.replayVerified).toBe(true);
    expect(result.sourceLabId).toBe(QE4_DATASET_LABORATORY.labId);
    expect(result.fulfilment).not.toBeNull();
    expect(result.fulfilment!.value).toBeCloseTo(target.s2, 10);
    expect(result.fulfilment!.sigma).toBeCloseTo(target.sigma, 10);
    expect(result.fulfilment!.request.status).toBe('FULFILLED');
    expect(result.fulfilment!.request.custody).not.toBeNull();
    expect(result.fulfilment!.request.custody!.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('declares NO_ACCESS_DECLARED, never a fabricated value, when nothing pinned matches the point', () => {
    const gap = makeGap(['model-a', 'model-b']);
    const result = fulfillExperimentGap({ gap, registry: [QE4_DATASET_LABORATORY], pointId: 'disorder:T=999999:k=5', atX: 999999 });
    expect(result.outcome).toBe('NO_ACCESS_DECLARED');
    expect(result.fulfilment).toBeNull();
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('declares NO_ACCESS_DECLARED when the registry is empty — never invents a source', () => {
    const gap = makeGap(['model-a']);
    const result = fulfillExperimentGap({ gap, registry: [], pointId: 'disorder:T=5:k=5', atX: 5 });
    expect(result.outcome).toBe('NO_ACCESS_DECLARED');
    expect(result.reason).toContain('(empty)');
  });
});

describe('E5 steps 6-7 — resumeCampaignWithFulfilment: real campaign, honest verdict-changed check', () => {
  function truncatedQe4Lab(excludeT: number): CampaignLaboratory {
    const points = pointsForGrid('disorder', 5).filter((p) => p.t !== excludeT);
    const byX = new Map(points.map((p) => [p.t, { x: p.t, y: p.s2, sigma: p.sigma }]));
    const xs = points.map((p) => p.t);
    return {
      labId: 'qe4-truncated-test',
      problem: 'Test: S2 growth with a deliberately withheld point.',
      candidateX: xs,
      observe: (x) => byX.get(x) ?? null,
      xRange: { min: Math.min(...xs), max: Math.max(...xs) },
      xLabel: 'T[ms]',
      yLabel: 'S2',
    };
  }

  it('resuming with a real fulfilled observation reruns the actual engine and reports whether the verdict changed', () => {
    const points = pointsForGrid('disorder', 5);
    const withheld = points[Math.floor(points.length / 2)]!;
    const lab = truncatedQe4Lab(withheld.t);
    const baseline = runDiscoveryCampaign(lab, { maxRounds: 6, maxTerms: 2 });

    const gap = makeGap(baseline.discovery.survivingModels.map((m) => m.fingerprint));
    const pointId = `disorder:T=${withheld.t}:k=5`;
    const fulfillment = fulfillExperimentGap({ gap, registry: [QE4_DATASET_LABORATORY], pointId, atX: withheld.t });
    expect(fulfillment.outcome).toBe('FULFILLED');

    const outcome = resumeCampaignWithFulfilment({
      baseline,
      baseLaboratory: lab,
      options: { maxRounds: 6, maxTerms: 2 },
      fulfilment: fulfillment.fulfilment!,
    });

    // The resumed campaign is a REAL rerun (candidateX genuinely grew by one point).
    expect(outcome.resumed.rounds.length).toBeGreaterThan(0);
    expect(typeof outcome.verdictChanged).toBe('boolean');
    expect(outcome.explanation.length).toBeGreaterThan(0);
    // Whichever way it went, the explanation must name the real before/after stop reasons.
    expect(outcome.explanation).toContain(baseline.stopReason);
  });
});
