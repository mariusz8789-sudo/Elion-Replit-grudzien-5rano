import { describe, expect, it } from 'vitest';
import { createScientificEvidencePack } from '../core/experimentFabric/evidencePack';
import { exportEvidencePackRoCrate } from '../core/experimentFabric/evidencePackRoCrate';
import type { ScientificEvidenceChain } from '../core/experimentFabric/scientificDiscovery';

/**
 * Executable enforcement of docs/CTO_CAMPAIGN_EVIDENCE_INTEROPERABILITY.md.
 *
 * That decision records Campaign -> Fabric Evidence Pack / RO-Crate as
 * BLOCKED: the Campaign backend's persisted "evidence" is real within its own
 * contract (per-tool `evidenceClass: 'MODEL_ESTIMATE' | 'DETERMINISTIC'`
 * predictions and `{ paretoSize, retainedCount }` search-decision metrics),
 * but it is NOT a `ScientificEvidenceChain` of completed Fabric `ExperimentRun`s.
 *
 * Until this file existed, that boundary rested on a single unguarded runtime
 * check (`evidencePack.ts`'s `createdFromRealRunsOnly !== true` throw) with only
 * positive-path coverage — a later refactor could have silently removed it and
 * made a fabricated pack possible. These tests pin the refusal itself, so
 * turning campaign search decisions into apparent validated-experiment evidence
 * becomes a failing test rather than a quiet regression.
 *
 * This file adds NO exporter, adapter, or second Evidence/Replay system. It
 * only proves the existing one refuses input it cannot honestly represent.
 */

/** Shape a campaign-derived projection would realistically try to pass in. */
function campaignShapedChain(): ScientificEvidenceChain {
  return {
    contractVersion: '1.0.0',
    evidenceId: 'campaign_candidate_projection',
    design: {
      protocolFingerprint: 'campaign-generation-3',
    } as unknown as ScientificEvidenceChain['design'],
    arms: [],
    assessment: {
      assessment: 'INCONCLUSIVE',
      message: 'Campaign pareto decision',
      criterion: {} as unknown as ScientificEvidenceChain['assessment']['criterion'],
      referenceRunIds: [],
    },
    allRuns: [],
    provenanceFingerprint: 'campaign-state-hash',
    // A campaign decision is not a completed real Fabric run; a projection can
    // only honestly say so by NOT setting this flag.
    createdFromRealRunsOnly: false as unknown as true,
  };
}

describe('Campaign -> Fabric Evidence Pack boundary (BLOCKED, enforced in code)', () => {
  it('refuses to build an Evidence Pack from a chain not created from real runs only', () => {
    expect(() => createScientificEvidencePack(campaignShapedChain()))
      .toThrow('Evidence Pack requires an evidence chain created from real runs only.');
  });

  it('refuses every falsy/absent variant of the real-runs flag, not just literal false', () => {
    for (const flag of [undefined, null, 0, '', 'true']) {
      const chain = { ...campaignShapedChain(), createdFromRealRunsOnly: flag as unknown as true };
      expect(() => createScientificEvidencePack(chain)).toThrow();
    }
  });

  it('does not accept the string "true" as equivalent to the boolean flag (no coercion escape hatch)', () => {
    const chain = { ...campaignShapedChain(), createdFromRealRunsOnly: 'true' as unknown as true };
    expect(() => createScientificEvidencePack(chain)).toThrow();
  });

  it('blocks the RO-Crate path too, because RO-Crate is a projection of a pack that was never built', () => {
    // The refusal must happen before any serialization, so no partial campaign
    // artifact can leak out of the Fabric contract.
    expect(() => exportEvidencePackRoCrate(createScientificEvidencePack(campaignShapedChain()))).toThrow();
  });
});

describe('Why the boundary exists — structural gap, not a missing field', () => {
  it('a campaign decision carries no ExperimentRun, so runCount/runs would be empty even if the flag were forced', () => {
    // Forcing the flag is exactly what a "quick exporter" would do. Even then the
    // pack would report zero real runs and vacuously "all arms matched" — an
    // Evidence Pack that looks reproducible while attesting to nothing. This is
    // the false-confidence failure mode the CTO decision names.
    const forced = { ...campaignShapedChain(), createdFromRealRunsOnly: true as const };
    const pack = createScientificEvidencePack(forced);
    expect(pack.runCount).toBe(0);
    expect(pack.runs).toEqual([]);
    expect(pack.reproducibility.allArmsMatched).toBe(true);
    // Documented here so the emptiness is understood as vacuous, never as proof:
    // a real pack's guarantee comes from allRuns, and campaign data supplies none.
    expect(pack.eventSummaries).toEqual([]);
  });
});
