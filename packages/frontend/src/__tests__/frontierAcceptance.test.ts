import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDiscoveryCampaign } from '../core/agent/discoveryCampaign';
import { makeQe4CampaignLab } from '../core/biotechData/campaignLabs';
import { buildDiscoveryGraph, compareDiscoveryGraphReplay, transferKnowledge } from '../core/agent/discoveryGraph';

import { resetFalsifiedModelRegistryForTests } from '../core/agent/falsifiedModelRegistry';

/**
 * AUTONOMOUS_FRONTIER_ACCEPTANCE — §9.
 *
 * One campaign over REAL pinned data (Brydges et al. 2019, Zenodo
 * 10.5281/zenodo.2527010), asserted end to end:
 *
 *   QUESTION -> competing models -> predictions -> planner -> experiment ->
 *   observation -> residual -> structurally NEW model -> further experiments ->
 *   belief revision -> falsification/support -> stop -> memory -> replay
 *
 * The grammar is denied LOG, which the disorder data genuinely follows, so the
 * true shape is NOT reachable by enumeration and the engine must build the
 * missing term from residual structure or settle for something worse.
 */

/**
 * `maxTerms: 2` with LOG denied is the configuration that exercises the WHOLE
 * chain on this dataset: the starting space is rich enough for rounds to become
 * decisive (so beliefs actually move, in both directions, and models are really
 * falsified), and still cannot express the logarithm the data follows, so the
 * engine must build that term from residual structure.
 */
const DENY_LOG = { maxRounds: 8, maxTerms: 2, excludeBases: ['LOG'] as const };
const campaign = () => runDiscoveryCampaign(makeQe4CampaignLab(5), DENY_LOG);

/** Same fake-localStorage idiom `scienceMemory.test.ts` already uses — this runtime has no real `window`. */
function makeFakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

beforeEach(() => {
  // The registry is process-lifetime state (see D-027's recorded debt), so each
  // acceptance run starts from a clean one rather than inheriting another test's.
  resetFalsifiedModelRegistryForTests();
});

afterEach(() => vi.unstubAllGlobals());

describe('FRONTIER ACCEPTANCE — the full chain on real pinned data', () => {
  it('runs QUESTION -> models -> experiments -> observations -> residual -> new model -> stop', () => {
    const result = campaign();

    // QUESTION
    expect(result.problem.length).toBeGreaterThan(20);
    // COMPETING MODELS, more than one, all from a declared grammar
    expect(result.rounds[0]!.models.length).toBeGreaterThan(1);
    // PLANNER chose experiments, and the loop acted on its own choices
    const chosen = result.rounds.map((r) => r.selectedNextX).filter((x) => x !== null);
    expect(chosen.length).toBeGreaterThan(0);
    for (let i = 0; i + 1 < result.rounds.length; i += 1) {
      const pick = result.rounds[i]!.selectedNextX;
      if (pick !== null) expect(result.rounds[i + 1]!.admittedX).toContain(pick);
    }
    // OBSERVATIONS accumulated
    expect(result.rounds[result.rounds.length - 1]!.admittedX.length).toBeGreaterThan(result.rounds[0]!.admittedX.length);
    // RESIDUAL: a named, measured structure — never a bare "residual was non-zero"
    const findings = result.rounds.flatMap((r) => r.residualFindings);
    expect(findings.length).toBeGreaterThan(0);
    // A NAMED, measured structure with real numbers behind it — never a bare
    // "the residual was non-zero", which every real measurement has.
    expect(findings.every((f) => f.evidence.length > 40 && f.strength > 0)).toBe(true);
    expect(new Set(findings.map((f) => f.kind)).size).toBeGreaterThan(0);
    // BELIEF REVISION really happened, both directions
    const finalBeliefs = result.rounds[result.rounds.length - 1]!.beliefs;
    expect(finalBeliefs.some((h) => h.confidence > 0.5)).toBe(true);
    expect(finalBeliefs.some((h) => h.confidence < 0.5)).toBe(true);
    // STOP with a real, named reason
    expect(result.stopReason.length).toBeGreaterThan(0);
    expect(result.discovery.decisionBasis).toContain(result.stopReason);
  }, 60000);

  it('CRITICAL 1 — the new model arose AFTER an observation, was never pre-registered, and traces to the residual', () => {
    const result = campaign();
    const derived = result.rounds.flatMap((r) => r.derivedThisRound);
    expect(derived.length).toBeGreaterThan(0);

    const preRegistered = new Set(result.rounds[0]!.models.map((m) => m.fingerprint));
    for (const model of derived) {
      // arose after observation
      expect(model.enteredAtRound).toBeGreaterThan(0);
      // was not a pre-registered candidate
      expect(preRegistered.has(model.fingerprint)).toBe(false);
      // has lineage to the residual that motivated it
      expect(model.derivedFrom).not.toBeNull();
      expect(model.derivationOperator).toContain('RESIDUAL_');
    }
    // It contains the basis the grammar was denied — built, not enumerated.
    expect(derived.some((m) => m.formula.includes('log'))).toBe(true);

    // And the graph carries that lineage as a real edge, not as a claim.
    const graph = buildDiscoveryGraph(result);
    const newModels = graph.nodes.filter((n) => n.kind === 'NEW_MODEL');
    expect(newModels.length).toBeGreaterThan(0);
    expect(graph.edges.some((e) => e.kind === 'motivates')).toBe(true);
    expect(graph.edges.some((e) => e.kind === 'supersedes')).toBe(true);
  }, 60000);

  it('CRITICAL 1b — the derived model was not blocked by M2: the registry was consulted and let it through', () => {
    const result = campaign();
    const derivedPrints = new Set(result.rounds.flatMap((r) => r.derivedThisRound).map((m) => m.fingerprint));
    expect(derivedPrints.size).toBeGreaterThan(0);
    // Nothing that entered was also recorded as a registry skip.
    for (const skipped of result.registrySkips) expect(derivedPrints.has(skipped.fingerprint)).toBe(false);
  }, 60000);

  it('CRITICAL 2 — when no attached experiment can discriminate, the engine asks instead of guessing', () => {
    // Same real dataset, grammar cut to a single live model: nothing left to discriminate.
    const degenerate = runDiscoveryCampaign(makeQe4CampaignLab(5), {
      maxRounds: 5,
      maxTerms: 1,
      excludeBases: ['CONSTANT', 'LINEAR', 'POWER', 'EXP_SATURATION', 'RECIPROCAL'],
    });
    expect(degenerate.observationGaps.length).toBeGreaterThan(0);
    expect(degenerate.stopReason).toBe('OBSERVATION_GAP');
    expect(degenerate.rounds.every((r) => r.selectedNextX === null)).toBe(true);
    expect(degenerate.observationGaps[0]!.status).toBe('OPEN');
  }, 60000);

  it('CRITICAL 3 — replay is MATCH across the campaign, the gap ledger and the graph', () => {
    const first = campaign();
    const second = campaign();
    expect(first.campaignFingerprint).toBe(second.campaignFingerprint);
    expect(first.gapLedgerFingerprint).toBe(second.gapLedgerFingerprint);
    expect(compareDiscoveryGraphReplay(buildDiscoveryGraph(first), buildDiscoveryGraph(second))).toBe('MATCH');
  }, 60000);

  it('CRITICAL 4 — the campaign is written to Science Memory, and what is written is verifiable', async () => {
    const result = campaign();
    const graph = buildDiscoveryGraph(result);
    const winner = result.discovery.winningModel;

    // The established scienceMemory idiom (see discoveryOrchestratorMemory.test.ts):
    // stub the storage global FIRST, reset the module registry, then import, so
    // the module reads this stub rather than a cached availability verdict.
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    vi.resetModules();
    const { saveDiscoveryCampaignToMemory, listExperiments } = await import('../core/scienceMemory');

    const before = listExperiments().length;
    const record = saveDiscoveryCampaignToMemory({
      labId: result.labId,
      problem: result.problem,
      rounds: result.rounds.length,
      stopReason: result.stopReason,
      winningFormula: winner?.formula ?? null,
      winnerEnteredAtRound: winner?.enteredAtRound ?? 0,
      winnerDerivedFrom: winner?.derivedFrom ?? null,
      derivedModelFormulas: result.rounds.flatMap((r) => r.derivedThisRound.map((d) => d.formula)),
      observationsAdmitted: result.rounds[result.rounds.length - 1]!.admittedX.length,
      observationGapTriggers: result.observationGaps.map((g) => g.trigger),
      campaignFingerprint: result.campaignFingerprint,
      gapLedgerFingerprint: result.gapLedgerFingerprint,
      graphFingerprint: graph.graphFingerprint,
    });

    expect(listExperiments().length).toBe(before + 1);
    expect(record.experimentId).toContain(result.campaignFingerprint);
    // The record is honest about what it is: a model-level claim, not a fact.
    expect(record.epistemicStatus).toBe('PREDICTION');
    // It carries what a later reader needs to reproduce and to doubt it.
    const bodies = record.analysis!.map((a) => a.body).join(' ');
    const titles = record.analysis!.map((a) => a.title);
    expect(bodies).toContain(result.campaignFingerprint);
    // It states its own limits, not only its result — a record that only says
    // what it found is a claim, not evidence.
    expect(titles.some((t) => t.includes('NIE ustalila'))).toBe(true);
    expect(record.analysis!.some((a) => a.kind === 'discovery-campaign-replay')).toBe(true);
  }, 60000);
});

describe('FRONTIER ACCEPTANCE — what the campaign learned can move, without gaining strength', () => {
  it('transfers into a second campaign with every epistemic status preserved', () => {
    const source = buildDiscoveryGraph(campaign());
    const target = buildDiscoveryGraph(runDiscoveryCampaign(makeQe4CampaignLab(10), DENY_LOG));
    const outcome = transferKnowledge(target, source);

    expect(outcome.imported.length).toBeGreaterThan(0);
    for (const moved of outcome.imported) {
      const original = source.nodes.find((n) => n.nodeId === moved.nodeId)!;
      expect(moved.epistemicStatus).toBe(original.epistemicStatus);
      expect(moved.importedFrom).toBe(original.campaignId);
    }
    // Falsified models do not cross without a declared change of assumptions.
    expect(outcome.imported.some((n) => n.epistemicStatus === 'BLOCKED')).toBe(false);
    expect(outcome.refused.some((r) => r.reason === 'FALSIFIED_WITHOUT_ASSUMPTION_CHANGE')).toBe(true);
  }, 60000);
});
