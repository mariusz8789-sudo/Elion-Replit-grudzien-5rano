import { describe, expect, it } from 'vitest';
import { runDiscoveryCampaign } from '../core/agent/discoveryCampaign';
import { makeKeplerCampaignLab, makeQe4CampaignLab } from '../core/biotechData/campaignLabs';
import {
  buildDiscoveryGraph,
  compareDiscoveryGraphReplay,
  transferKnowledge,
} from '../core/agent/discoveryGraph';

/** Both graphs come from REAL campaigns over pinned data — no hand-built fixtures. */
const qe4 = () => buildDiscoveryGraph(runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 }));
const kepler = () => buildDiscoveryGraph(runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 }));

describe('discoveryGraph — the campaign as lineage', () => {
  it('carries the whole chain: question, models, experiments, observations, revisions, discovery', () => {
    const graph = qe4();
    const kinds = new Set(graph.nodes.map((n) => n.kind));
    for (const required of ['QUESTION', 'MODEL', 'EXPERIMENT', 'OBSERVATION', 'REVISION', 'DISCOVERY']) {
      expect(kinds).toContain(required);
    }
  }, 30000);

  it('derives epistemic status from what the campaign did, never declaring it', () => {
    const graph = qe4();
    // A real admitted measurement is OBSERVED; a model still standing is a HYPOTHESIS.
    expect(graph.nodes.filter((n) => n.kind === 'OBSERVATION').every((n) => n.epistemicStatus === 'OBSERVED')).toBe(true);
    const models = graph.nodes.filter((n) => n.kind === 'MODEL');
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((n) => n.epistemicStatus === 'HYPOTHESIS' || n.epistemicStatus === 'BLOCKED')).toBe(true);
  }, 30000);

  it('gives a model derived mid-campaign a lineage edge back to its parent', () => {
    const derivedRun = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 8, maxTerms: 1, excludeBases: ['LOG'] });
    const graph = buildDiscoveryGraph(derivedRun);
    const derived = graph.nodes.filter((n) => n.kind === 'NEW_MODEL');
    expect(derived.length).toBeGreaterThan(0);
    for (const model of derived) {
      expect(model.lineage.length).toBeGreaterThan(0);
      expect(graph.edges.some((e) => e.to === model.nodeId && e.kind === 'supersedes')).toBe(true);
    }
    // And the residual that motivated it points at it.
    expect(graph.edges.some((e) => e.kind === 'motivates')).toBe(true);
  }, 30000);

  it('records a raised observation gap as VERIFY_REQUIRED — the status that says what it wants', () => {
    const graph = qe4();
    const gaps = graph.nodes.filter((n) => n.kind === 'OBSERVATION_GAP');
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((n) => n.epistemicStatus === 'VERIFY_REQUIRED')).toBe(true);
  }, 30000);

  it('is replay-deterministic on real data', () => {
    expect(compareDiscoveryGraphReplay(qe4(), qe4())).toBe('MATCH');
    expect(compareDiscoveryGraphReplay(qe4(), kepler())).toBe('DRIFT');
  }, 60000);
});

describe('discoveryGraph — cross-campaign transfer preserves epistemic status', () => {
  it('imports knowledge from one real campaign into another and stamps its origin', () => {
    const outcome = transferKnowledge(kepler(), qe4());
    expect(outcome.imported.length).toBeGreaterThan(0);
    for (const imported of outcome.imported) {
      expect(imported.importedFrom).toBe('qe4-brydges-disorder-k5');
      expect(imported.detail.join(' ')).toContain('epistemic status preserved');
    }
  }, 60000);

  it('NEVER upgrades a status on import: every imported node keeps exactly what it earned', () => {
    const source = qe4();
    const outcome = transferKnowledge(kepler(), source);
    for (const imported of outcome.imported) {
      const original = source.nodes.find((n) => n.nodeId === imported.nodeId)!;
      expect(imported.epistemicStatus).toBe(original.epistemicStatus);
    }
    // Specifically: nothing that was a HYPOTHESIS arrives as OBSERVED.
    const upgraded = outcome.imported.filter((n) => n.epistemicStatus === 'OBSERVED'
      && source.nodes.find((s) => s.nodeId === n.nodeId)?.epistemicStatus !== 'OBSERVED');
    expect(upgraded).toEqual([]);
  }, 60000);

  it('refuses to resurrect a falsified model without a declared change of assumptions', () => {
    const source = qe4();
    const outcome = transferKnowledge(kepler(), source);
    const blockedInSource = source.nodes.filter((n) => n.epistemicStatus === 'BLOCKED');
    expect(blockedInSource.length).toBeGreaterThan(0);
    const refusedForFalsification = outcome.refused.filter((r) => r.reason === 'FALSIFIED_WITHOUT_ASSUMPTION_CHANGE');
    expect(refusedForFalsification.length).toBeGreaterThan(0);
    expect(refusedForFalsification[0]!.detail).toContain('which assumption is now different');
    // None of them slipped through.
    expect(outcome.imported.some((n) => n.epistemicStatus === 'BLOCKED')).toBe(false);
  }, 60000);

  it('admits a falsified model ONLY when the changed assumption is named, and says so on the node', () => {
    const source = qe4();
    const outcome = transferKnowledge(kepler(), source, {
      changedAssumptions: ['sigmas are no longer assumed independent across time points'],
    });
    const revived = outcome.imported.filter((n) => n.epistemicStatus === 'BLOCKED');
    expect(revived.length).toBeGreaterThan(0);
    expect(revived[0]!.detail.join(' ')).toContain('Imported under changed assumptions');
    // Its status is STILL BLOCKED — a changed assumption permits re-examination, not a promotion.
    expect(revived.every((n) => n.epistemicStatus === 'BLOCKED')).toBe(true);
  }, 60000);

  it('deduplicates by fingerprint: importing the same graph twice adds nothing the second time', () => {
    const source = qe4();
    const first = transferKnowledge(kepler(), source);
    const second = transferKnowledge(first.graph, source);
    expect(second.imported).toEqual([]);
    expect(second.graph.nodes.length).toBe(first.graph.nodes.length);
    // Everything that came in the first time is now refused as a duplicate. The
    // falsified nodes are refused a second time for the SAME reason as before —
    // they never entered, so there is nothing to duplicate.
    expect(second.refused.some((r) => r.reason === 'DUPLICATE_FINGERPRINT')).toBe(true);
    expect(second.refused.every((r) => r.reason === 'DUPLICATE_FINGERPRINT' || r.reason === 'FALSIFIED_WITHOUT_ASSUMPTION_CHANGE')).toBe(true);
    expect(second.refused.filter((r) => r.reason === 'FALSIFIED_WITHOUT_ASSUMPTION_CHANGE').length)
      .toBe(first.refused.filter((r) => r.reason === 'FALSIFIED_WITHOUT_ASSUMPTION_CHANGE').length);
  }, 60000);

  it('records the transfer as a real edge, so an imported claim is never mistaken for a native one', () => {
    const outcome = transferKnowledge(kepler(), qe4());
    const transferEdges = outcome.graph.edges.filter((e) => e.kind === 'transfers_to');
    expect(transferEdges.length).toBe(outcome.imported.length);
  }, 60000);
});
