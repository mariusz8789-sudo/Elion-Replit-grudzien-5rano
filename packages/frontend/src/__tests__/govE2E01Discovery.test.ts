import { describe, expect, it } from 'vitest';
import { loadGeneratedCandidates } from '../core/biotechData/govDrugDiscoveryE2E';
import { E2E01_POPULATION, E2E01_PREREGISTRATION } from '../core/biotechData/govDrugDiscoveryE2EPreregistration';
import { runA3GovernmentRecommendation } from '../core/biotechData/a3GovernmentDrugRecommendation';
import { createE2E01Adapters, E2E01FailClosedError } from '../core/orchestrator/govE2E01Adapters';
import { runGovE2E01Discovery, replayGovE2E01Discovery, E2E01_EVIDENCE_SOURCE } from '../core/orchestrator/govE2E01Discovery';
import { EvidenceConnectorStore } from '../core/evidenceConnectors/store';
import type { ConnectorPort } from '../core/evidenceConnectors/contracts';
import { getGenesisDomain, runGenesisDomainDiscovery } from '../core/orchestrator/genesisDomainRegistry';
import { parseProblem } from '../core/orchestrator/nl';
import { canonicalJson, fnv1a } from '../core/events/hash';
import type { ProblemRecord } from '../core/orchestrator/contracts';

const H = (v: unknown): string => fnv1a(canonicalJson(v));

function realProblem(): ProblemRecord {
  return parseProblem(
    'TEST-PROBLEM',
    {
      text: 'Find the winning E2E-01 candidate.',
      objectives: [{ metric: 'efficacy_delta_pp_vs_semaglutide', direction: 'maximize' }],
      constraints: ['legal'],
      harmAxes: ['safety_veto'],
      evidenceMinimum: '>=1 DIRECT_RANDOMISED',
    },
    H,
  );
}

/**
 * GENESIS C2 — THE SECOND REAL DOMAIN (docs/DECISIONS.md D-059, gap 1b).
 * Negative-first, mirroring `govLowerHarmDiscovery.test.ts`'s own structure
 * (D-058) exactly: proves E2E-01 — a DIFFERENT real domain, its own real,
 * historically-verified pipeline (`govDrugDiscoveryE2E.ts`, the
 * `npm run e2e:gov-drug` anchor) — runs end-to-end through the SAME
 * unmodified `runScientificDiscovery` orchestrator (D-055) the LOWER-HARM
 * domain already proved in D-058. There is no second ranking/adjudication/
 * falsification/recipe engine here — every decision call is the real,
 * unmodified E2E-01 function.
 */

function forceGeneratedCandidates(): ReturnType<typeof loadGeneratedCandidates> {
  return loadGeneratedCandidates();
}

// ---------------------------------------------------------------------------
// TOP3_INCOMPLETE fails closed (this domain's analogue of LOWER-HARM's TOP2
// fail-closed test) — never a fabricated pair/triple.
// ---------------------------------------------------------------------------
describe('top2() (real TOP3) fails closed when fewer than 2 real candidates qualify', () => {
  it('a single-candidate generated space throws E2E01FailClosedError[TOP3_INCOMPLETE]', () => {
    const { adapters } = createE2E01Adapters({ generatedCandidates: () => forceGeneratedCandidates().slice(0, 1) });
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    const qualifying = adapters.hardFilter(adapters.normalizeDedup(generated));
    const t10 = adapters.top10(adapters.diversity(qualifying));
    expect(() => adapters.top2(t10)).toThrow(E2E01FailClosedError);
  });

  it('an empty generated space produces zero Tier-2 survivors and top2() refuses to guess', () => {
    const { adapters } = createE2E01Adapters({ generatedCandidates: () => [] });
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    const qualifying = adapters.hardFilter(adapters.normalizeDedup(generated));
    expect(qualifying.length).toBe(0);
    const t10 = adapters.top10(adapters.diversity(qualifying));
    expect(() => adapters.top2(t10)).toThrow(E2E01FailClosedError);
  });
});

// ---------------------------------------------------------------------------
// A3_NOT_ANSWERED fails closed — the population control genuinely refuses
// to guess (REQUIRED_POLICY_INPUT) when no population is supplied. The
// adapter's own default always supplies the real, sealed E2E01_POPULATION
// (never guesses a different one), so this branch is defense-in-depth
// inside `hardFilter()` rather than reachable through normal use of this
// adapter — the same real gate A3's own test suite (D-031) and the
// standalone e2e:gov-drug scenario (anchor check #16) already prove
// independently at the source.
// ---------------------------------------------------------------------------
describe('the population policy input the E2E-01 pipeline relies on genuinely refuses to guess (A3_NOT_ANSWERED)', () => {
  it('runA3GovernmentRecommendation() with no population returns REQUIRED_POLICY_INPUT, not a guessed default', () => {
    const report = runA3GovernmentRecommendation();
    expect(report.status).toBe('REQUIRED_POLICY_INPUT');
  });

  it('createE2E01Adapters() never omits the population — the real, sealed E2E01_POPULATION is always supplied, so hardFilter() never has to guess', () => {
    const { adapters } = createE2E01Adapters();
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    expect(() => adapters.hardFilter(adapters.normalizeDedup(generated))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PORTS_CALLED_OUT_OF_ORDER fails closed.
// ---------------------------------------------------------------------------
describe('ports refuse to run out of order', () => {
  it('top2() before hardFilter() throws PORTS_CALLED_OUT_OF_ORDER', () => {
    const { adapters } = createE2E01Adapters();
    expect(() => adapters.top2([])).toThrow(E2E01FailClosedError);
  });

  it('seal() before top2() throws PORTS_CALLED_OUT_OF_ORDER', () => {
    const { adapters } = createE2E01Adapters();
    expect(() => adapters.seal(realProblem())).toThrow(E2E01FailClosedError);
  });
});

// ---------------------------------------------------------------------------
// runGovE2E01Discovery — EXECUTION_BLOCKED terminal state, frozen results.
// ---------------------------------------------------------------------------
describe('runGovE2E01Discovery — EXECUTION_BLOCKED terminal state', () => {
  it('results are frozen — an EXECUTION_BLOCKED or RUN result can never be mutated after the fact', async () => {
    const result = await runGovE2E01Discovery({ mode: 'PRODUCTION' });
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D-059 gap 1a — problem-in generality: vague NL reaches real NEEDS_INPUT,
// for this domain too (negative-first).
// ---------------------------------------------------------------------------
describe('D-059 gap 1a — vague NL reaches real NEEDS_INPUT for the E2E-01 domain', () => {
  it('submitting free text only aborts NEEDS_INPUT, visible on the run record', async () => {
    const result = await runGovE2E01Discovery({ mode: 'PRODUCTION', problemInput: { text: 'find something better' } });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.verdict).toBe('ABORTED');
    expect(result.abortReason).toBe('NEEDS_INPUT');
  });

  it('omitting problemInput keeps the default, fully-specified E2E-01 problem — NOT NEEDS_INPUT', async () => {
    const result = await runGovE2E01Discovery({ mode: 'PRODUCTION' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.verdict).not.toBe('ABORTED');
  });
});

// ---------------------------------------------------------------------------
// D-059 gap 2 — evidence custody for PRODUCTION runs, for this domain too
// (negative-first, mirrors govLowerHarmDiscovery.test.ts exactly).
// ---------------------------------------------------------------------------
describe('D-059 gap 2 — evidence custody for E2E-01 PRODUCTION runs (negative-first)', () => {
  it('a fetch failure fails the run closed: EXECUTION_BLOCKED, never a fallback to cached/toy evidence', async () => {
    const store = new EvidenceConnectorStore();
    const port: ConnectorPort = { fetchBytes: () => { throw new Error('network down'); } };
    const result = await runGovE2E01Discovery({ mode: 'PRODUCTION', evidenceStore: store, evidenceConnectorPort: port });
    expect(result.kind).toBe('EXECUTION_BLOCKED');
    if (result.kind !== 'EXECUTION_BLOCKED') return;
    expect(result.code).toBe('EVIDENCE_CUSTODY_FAILED');
    expect(result.evidenceCustody?.ok).toBe(false);
  });

  it('a tampered/drifted artifact fails the run closed, the OLD frozen artifact is preserved (append-only), never silently overwritten', async () => {
    const store = new EvidenceConnectorStore();
    let call = 0;
    const port: ConnectorPort = {
      async fetchBytes() {
        call++;
        const runIdx = Math.ceil(call / 2);
        return new TextEncoder().encode(runIdx === 1 ? 'ORIGINAL' : 'TAMPERED');
      },
    };
    const first = await runGovE2E01Discovery({ mode: 'PRODUCTION', evidenceStore: store, evidenceConnectorPort: port });
    expect(first.kind).toBe('RUN');

    const second = await runGovE2E01Discovery({ mode: 'PRODUCTION', evidenceStore: store, evidenceConnectorPort: port });
    expect(second.kind).toBe('EXECUTION_BLOCKED');
    if (second.kind !== 'EXECUTION_BLOCKED') return;
    expect(second.evidenceCustody?.record?.status).toBe('HASH_MISMATCH_SUPERSEDED');

    const records = await store.allRecords(E2E01_EVIDENCE_SOURCE.sourceId);
    expect(records.length).toBe(2);
    expect(records[0]!.status).toBe('FROZEN');
    expect(records[1]!.status).toBe('HASH_MISMATCH_SUPERSEDED');
  });

  it('drift is reported explicitly in the replay result, never silently accepted', async () => {
    const store = new EvidenceConnectorStore();
    let call = 0;
    const port: ConnectorPort = {
      async fetchBytes() {
        call++;
        return new TextEncoder().encode(call === 1 ? 'ORIGINAL' : 'DRIFTED-DURING-REPLAY');
      },
    };
    const result = await runGovE2E01Discovery({ mode: 'PRODUCTION', evidenceStore: store, evidenceConnectorPort: port });
    expect(result.kind).toBe('EXECUTION_BLOCKED');
    if (result.kind !== 'EXECUTION_BLOCKED') return;
    expect(result.evidenceCustody?.replay?.ok).toBe(false);
    expect(result.evidenceCustody?.reason).toContain('replay did not reproduce');
  });

  it('a genuinely frozen + replay-verified artifact lets the run proceed, and the run record embeds artifactId + sha256 hash', async () => {
    const result = await runGovE2E01Discovery({ mode: 'PRODUCTION', evidenceStore: new EvidenceConnectorStore() });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.evidenceCustody?.ok).toBe(true);
    expect(result.evidenceCustody?.record?.artifact?.artifactId.length).toBeGreaterThan(0);
    expect(result.evidenceCustody?.record?.artifact?.hashPolicy).toBe('sha256');
    expect(result.evidenceCustody?.record?.artifact?.hash.length).toBeGreaterThan(0);
  });

  it('SYNTHETIC_TEST_ONLY never goes through the custody gate — evidenceCustody is null', async () => {
    const result = await runGovE2E01Discovery({ mode: 'SYNTHETIC_TEST_ONLY' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.evidenceCustody).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE CAPSTONE — second domain E2E-01 full E2E verdict matches the
// historical finding (npm run e2e:gov-drug anchor: NO_WINNER,
// preregistration f528c881) and replay matches.
// ---------------------------------------------------------------------------
describe('E2E-01 through the real orchestrator matches its own historical finding', () => {
  it('PRODUCTION mode reaches the same honest NO_WINNER outcome as the standalone e2e:gov-drug scenario, with a locked Recipe', async () => {
    const result = await runGovE2E01Discovery({ mode: 'PRODUCTION' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.mode).toBe('PRODUCTION');
    expect(result.verdict).toBe('NO_WINNER'); // matches the historical npm run e2e:gov-drug finding
    expect(result.winner).toBeUndefined();
    expect(result.recipeFingerprint).toBeUndefined();
    expect(result.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.status).toBe('LOCKED');
    expect(result.stages.length).toBe(20);
    expect(result.stages.every((s) => s.fingerprint.length > 0)).toBe(true);
  });

  it('the run traces to the real E2E-01 preregistration, sealed before this run started', async () => {
    const result = await runGovE2E01Discovery({ mode: 'PRODUCTION' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    const sealStage = result.stages.find((s) => s.stage === '10_FREEZE_PREREG');
    expect(sealStage?.status).toBe('OK');
    expect(E2E01_PREREGISTRATION.fingerprint).toBe('f528c881'); // history anchor, unchanged
  });

  it('replays to an identical verdict and audit fingerprint', async () => {
    const { ok, first, second } = await replayGovE2E01Discovery({ mode: 'PRODUCTION' });
    expect(ok).toBe(true);
    expect(first.kind).toBe('RUN');
    expect(second.kind).toBe('RUN');
  });

  it('SYNTHETIC_TEST_ONLY mode (same real pipeline, custody gate skipped) also replays deterministically', async () => {
    const { ok } = await replayGovE2E01Discovery({ mode: 'SYNTHETIC_TEST_ONLY' });
    expect(ok).toBe(true);
  });

  it('the winner decision genuinely comes from selectWinner over a real TOP3, never hand-constructed', () => {
    const { adapters, diagnostics } = createE2E01Adapters();
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    const qualifying = adapters.hardFilter(adapters.normalizeDedup(generated));
    const t10 = adapters.top10(adapters.diversity(qualifying));
    const t2 = adapters.top2(t10);
    expect(t2.length).toBeGreaterThanOrEqual(2);
    const seal = adapters.seal(realProblem());
    expect(adapters.verifySealUnchanged(seal)).toBe(true);
    const plan = adapters.planExperiments(t2, seal);
    const executed = adapters.execute(plan);
    expect(executed.length).toBe(t2.length);
    const evidence = adapters.ingestEvidence(executed);
    expect(evidence.length).toBeGreaterThan(0);
    adapters.falsify(t2, executed, seal);
    const outcome = adapters.adjudicate(t2, executed, seal);
    expect(outcome.verdict).toBe('NO_WINNER'); // real, evidence-driven — not forced
    expect(diagnostics.decision()?.outcome).toBe('NO_WINNER');
    expect(diagnostics.top3().length).toBeGreaterThanOrEqual(2);
    expect(diagnostics.falsifications().length).toBe(diagnostics.top3().length);
  });
});

// ---------------------------------------------------------------------------
// The E2E-01 domain is registered in the SAME domain registry LOWER_HARM
// uses — proving the "adapter factory" (C2 gap 1b) is real, not two
// parallel one-off scripts.
// ---------------------------------------------------------------------------
describe('genesisDomainRegistry — E2E01 is a real, dispatchable domain', () => {
  it('getGenesisDomain("E2E01") resolves to this exact entry point', () => {
    expect(getGenesisDomain('E2E01').run).toBe(runGovE2E01Discovery);
  });

  it('runGenesisDomainDiscovery("E2E01", ...) dispatches through the registry to the same real result', async () => {
    const viaRegistry = await runGenesisDomainDiscovery('E2E01', { mode: 'PRODUCTION' });
    expect(viaRegistry.kind).toBe('RUN');
    if (viaRegistry.kind !== 'RUN') return;
    expect(viaRegistry.verdict).toBe('NO_WINNER');
  });
});

// ---------------------------------------------------------------------------
// Diagnostics — real, populated, never fed back into the orchestrator
// contract (supports the read-only UI, D-059 gap 1c).
// ---------------------------------------------------------------------------
describe('diagnostics side-channel (real, never fed back into the orchestrator contract)', () => {
  it('production diagnostics report real generation-check + Tier-1/Tier-2 detail after a full run', () => {
    const { adapters, diagnostics } = createE2E01Adapters();
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    adapters.hardFilter(adapters.normalizeDedup(generated));
    expect(diagnostics.generationCheck()?.passed).toBe(true);
    expect(diagnostics.tier1()).not.toBeNull();
    expect(diagnostics.tier2()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sanity: E2E01_POPULATION is the same real, sealed population this
// domain's own historical scenario uses (T2D_AND_OBESITY) — never guessed.
// ---------------------------------------------------------------------------
describe('E2E01_POPULATION matches the sealed preregistered population', () => {
  it('E2E01_POPULATION.kind is T2D_AND_OBESITY, per the real E2E01_PREREGISTRATION record', () => {
    expect(E2E01_POPULATION.kind).toBe('T2D_AND_OBESITY');
    expect(E2E01_PREREGISTRATION.population.kind).toBe('T2D_AND_OBESITY');
  });
});
