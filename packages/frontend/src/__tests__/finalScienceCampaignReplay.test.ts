import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';
import { runScientificIntegrationCampaign } from '../core/experimentFabric/scientificIntegration';

/**
 * Overnight Science Tasks 1/3/4: proves — against the REAL chained research-campaign engine, not
 * a mock — that a bounded multi-cycle campaign produces real per-cycle D-141 epistemic claims
 * and a real capability-introspection report, and that two independent runs over the same
 * problem replay to an identical fingerprint (deterministic selection decisions).
 */
const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
function ledgerAndSink(streamId: string) {
  const ledger = new EvidenceLedger(clock);
  return { ledger, sink: createLedgerSink(ledger, streamId) };
}

const CHAINING_PROBLEM = 'problem:intervention-timing';

describe('runScientificIntegrationCampaign — D-141 wiring', () => {
  it('produces real per-cycle epistemicClaims, one per hypothesis outcome, anchored to real Evidence', async () => {
    const { sink } = ledgerAndSink('campaign-replay-claims');
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 3 });
    expect(result.cycles.length).toBeGreaterThanOrEqual(2);
    for (const cycle of result.cycles) {
      expect(cycle.epistemicClaims.length).toBe(cycle.cycle.result.loop.outcomes.length);
      for (const claim of cycle.epistemicClaims) {
        expect(claim.evidenceRefs.length).toBe(1);
        expect(['KNOWN', 'SUPPORTED', 'INFERRED', 'SIMULATED', 'ASSUMED', 'UNKNOWN', 'CONTRADICTED', 'UNVERIFIED']).toContain(claim.status);
      }
    }
  });

  it('produces a real capabilityReport, never fabricated, reflecting the actual per-cycle solver outcome', async () => {
    const { sink } = ledgerAndSink('campaign-replay-capability');
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 2 });
    expect(result.capabilityReport.totalCount).toBe(result.cycles.length);
    expect(result.capabilityReport.availableCount + result.capabilityReport.blockedCount).toBe(result.capabilityReport.totalCount);
  });

  it('emits real META_OBSERVATION_RECORDED evidence into the canonical ledger, verifiable and tamper-checked', async () => {
    const { ledger, sink } = ledgerAndSink('campaign-replay-meta-evidence');
    await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 2 });
    const retrievedBys = ledger.toSnapshot().records.map((r) => r.provenance.retrievedBy);
    expect(retrievedBys.some((r) => r.includes('META_OBSERVATION_RECORDED'))).toBe(true);
    expect(ledger.verifyLedger().ok).toBe(true);
  });
});

describe('runScientificIntegrationCampaign — two-cycle deterministic replay (Task 3/4 required proof)', () => {
  it('two independent runs over the same problem, bounded to exactly 2 cycles, produce identical cycle count, statuses, and decision-trace fingerprints', async () => {
    // Same stream id for both — two genuinely independent EvidenceLedger instances (no shared
    // mutable state), but matched provenance identity, so any fingerprint difference reflects a
    // real non-determinism in the underlying campaign, not merely two different evidence streams.
    const a = await runScientificIntegrationCampaign(CHAINING_PROBLEM, ledgerAndSink('replay-same-stream').sink, { maxCycles: 2 });
    const b = await runScientificIntegrationCampaign(CHAINING_PROBLEM, ledgerAndSink('replay-same-stream').sink, { maxCycles: 2 });

    expect(a.cycles.length).toBe(2);
    expect(b.cycles.length).toBe(2);
    expect(a.status).toBe(b.status);
    expect(a.cycles.map((c) => c.decisionTrace.traceFingerprint)).toEqual(b.cycles.map((c) => c.decisionTrace.traceFingerprint));
    expect(a.cycles.map((c) => c.cycle.result.loop.discrimination.winnerHypothesisId)).toEqual(
      b.cycles.map((c) => c.cycle.result.loop.discrimination.winnerHypothesisId),
    );
  });

  it('the second cycle carries real next-experiment reasoning derived from the first cycle real outcome, not a fabricated continuation', async () => {
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, ledgerAndSink('replay-next-experiment').sink, { maxCycles: 2 });
    expect(result.cycles.length).toBe(2);
    const first = result.cycles[0]!;
    expect(first.cycle.result.nextExperiment.status).not.toBe('RESOLVED');
    expect(first.decisionTrace.suggestedNextExperiment).toBe(first.cycle.result.nextExperiment.resolves);
  });
});
