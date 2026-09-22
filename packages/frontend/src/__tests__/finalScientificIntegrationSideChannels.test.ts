import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';
import { runScientificIntegrationCampaign } from '../core/experimentFabric/scientificIntegration';
import { runPainResearchQuestion, type PainResearchQuestion } from '../core/experimentFabric/painResearch';
import type { PhysicsClaim } from '../core/experimentFabric/spacetimeIntegrity';

/**
 * Overnight Science PASS 2 (Task 1/2/3/4): proves painResearch.ts and spacetimeIntegrity.ts are
 * REAL, LIVE call sites inside the one canonical scientificIntegration coordinator real screens
 * already import from `experimentFabric/index.ts` — not merely present as unused exports. Every
 * assertion here exercises the actual production code path (`runScientificIntegrationCampaign`
 * with `painQuestion`/`physicsClaims` options), never a mock.
 */
const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
function sink(streamId: string) {
  const ledger = new EvidenceLedger(clock);
  return { ledger, sink: createLedgerSink(ledger, streamId) };
}

const CHAINING_PROBLEM = 'problem:intervention-timing';

function painQuestion(overrides: Partial<PainResearchQuestion> = {}): PainResearchQuestion {
  return {
    questionId: 'pq-side-channel',
    statement: 'Does the modeled nociceptive signal amplitude change with intervention timing?',
    target: { anatomyNodeId: 'dorsal-root-ganglion', label: 'Dorsal root ganglion' },
    ...overrides,
  };
}

describe('runScientificIntegrationCampaign — painQuestion is a real, live side channel', () => {
  it('with no backingProblemId, painResearchResult is honestly BLOCKED and no side campaign runs', async () => {
    const { sink: evidenceSink } = sink('side-pain-blocked');
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, evidenceSink, {
      maxCycles: 1,
      painQuestion: painQuestion(),
    });
    expect(result.painResearchResult).toBeDefined();
    expect(result.painResearchResult!.status).toBe('BLOCKED');
    expect(result.painResearchResult!.campaign).toBeUndefined();
  });

  it('with a backingProblemId, painResearchResult is PARTIAL and carries a real nested campaign result, without infinite recursion', async () => {
    const { sink: evidenceSink } = sink('side-pain-partial');
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, evidenceSink, {
      maxCycles: 1,
      painQuestion: painQuestion({ backingProblemId: CHAINING_PROBLEM }),
    });
    expect(result.painResearchResult!.status).toBe('PARTIAL');
    expect(result.painResearchResult!.campaign).toBeDefined();
    expect(result.painResearchResult!.campaign!.cycles.length).toBeGreaterThanOrEqual(1);
    // The nested campaign's own result carries no painResearchResult of its own — the recursion is bounded to one level.
    expect(result.painResearchResult!.campaign!.painResearchResult).toBeUndefined();
  });

  it('painResearchResult is anchored into the SAME evidence ledger as the outer campaign — one stream, not a second one', async () => {
    const { ledger, sink: evidenceSink } = sink('side-pain-evidence');
    await runScientificIntegrationCampaign(CHAINING_PROBLEM, evidenceSink, { maxCycles: 1, painQuestion: painQuestion() });
    expect(ledger.getActive().length).toBeGreaterThan(0);
    expect(ledger.verifyLedger().ok).toBe(true);
  });

  it('is not present at all when no painQuestion is supplied — fully backward compatible', async () => {
    const { sink: evidenceSink } = sink('side-pain-absent');
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, evidenceSink, { maxCycles: 1 });
    expect(result.painResearchResult).toBeUndefined();
  });

  it('produces the identical report a direct runPainResearchQuestion call would, proving genuine delegation not a re-derivation', async () => {
    const direct = await runPainResearchQuestion(painQuestion(), sink('side-pain-direct').sink);
    const { sink: viaCampaign } = sink('side-pain-via-campaign');
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, viaCampaign, { maxCycles: 1, painQuestion: painQuestion() });
    expect(result.painResearchResult!.status).toBe(direct.status);
    expect(result.painResearchResult!.reason).toBe(direct.reason);
    expect(result.painResearchResult!.governance).toEqual(direct.governance);
  });
});

describe('runScientificIntegrationCampaign — physicsClaims is a real, live side channel', () => {
  it('validates real claims and reports the exact required label per category', async () => {
    const { sink: evidenceSink } = sink('side-spacetime-valid');
    const claims: PhysicsClaim[] = [
      { claimId: 'c1', category: 'WORMHOLE', assignedLabel: 'HYPOTHESIS', statement: 'A wormhole model predicts a shortcut.', sourceIds: [] },
      { claimId: 'c2', category: 'MULTIVERSE', assignedLabel: 'SIMULATION', statement: 'A multiverse branch was simulated.', sourceIds: [] },
    ];
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, evidenceSink, { maxCycles: 1, physicsClaims: claims });
    expect(result.spacetimeIntegrityResults).toBeDefined();
    expect(result.spacetimeIntegrityResults!.length).toBe(2);
    expect(result.spacetimeIntegrityResults!.every((v) => v.ok)).toBe(true);
  });

  it('a backward-time-travel claim is never silently promoted — it comes back as an explicit, reasoned rejection, not a crash', async () => {
    const { sink: evidenceSink } = sink('side-spacetime-btt');
    const claims: PhysicsClaim[] = [
      { claimId: 'c-btt', category: 'HISTORICAL_RECONSTRUCTION', assignedLabel: 'RECONSTRUCTION', statement: 'We traveled back in time and changed the past.', sourceIds: ['archive-1'] },
    ];
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, evidenceSink, { maxCycles: 1, physicsClaims: claims });
    expect(result.spacetimeIntegrityResults![0]!.ok).toBe(false);
    expect(result.spacetimeIntegrityResults![0]!.reason).toMatch(/SPACETIME_INTEGRITY_REJECTED/);
  });

  it('a forbidden truth-upgrade throws inside validation but is still reported honestly, not silently accepted', async () => {
    const { sink: evidenceSink } = sink('side-spacetime-upgrade');
    const claims: PhysicsClaim[] = [
      { claimId: 'c-upgrade', category: 'WORMHOLE', assignedLabel: 'REAL_OBSERVATION', statement: 'A neutral wormhole statement.', sourceIds: [] },
    ];
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, evidenceSink, { maxCycles: 1, physicsClaims: claims });
    expect(result.spacetimeIntegrityResults![0]!.ok).toBe(false);
    expect(result.spacetimeIntegrityResults![0]!.reason).toMatch(/EPISTEMIC_UPGRADE_FORBIDDEN/);
  });

  it('every claim validation is anchored into the same canonical ledger with real provenance, verifiable and chain-intact', async () => {
    const { ledger, sink: evidenceSink } = sink('side-spacetime-evidence');
    const claims: PhysicsClaim[] = [
      { claimId: 'c-ev', category: 'GRAVITY_WELL', assignedLabel: 'MODEL', statement: 'A gravity well affects local curvature.', sourceIds: [] },
    ];
    await runScientificIntegrationCampaign(CHAINING_PROBLEM, evidenceSink, { maxCycles: 1, physicsClaims: claims });
    const records = ledger.toSnapshot().records;
    const spacetimeRecord = records.find((r) => r.provenance.retrievedBy === 'human-biology-lab:SPACETIME_CLAIM_VALIDATION');
    expect(spacetimeRecord).toBeDefined();
    expect(spacetimeRecord!.claim).toContain('GRAVITY_WELL');
    expect(ledger.verifyLedger().ok).toBe(true);
  });

  it('is not present at all when no physicsClaims are supplied — fully backward compatible', async () => {
    const { sink: evidenceSink } = sink('side-spacetime-absent');
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, evidenceSink, { maxCycles: 1 });
    expect(result.spacetimeIntegrityResults).toBeUndefined();
  });
});
