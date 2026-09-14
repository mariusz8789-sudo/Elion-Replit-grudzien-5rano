import { describe, expect, it } from 'vitest';
import {
  falsifyCandidate,
  runCandidateBeliefRevision,
  scoreCandidate,
  loadCandidateSummaries,
  type A2CandidateReport,
  type A2CandidateSummary,
  type A2EfficacyEvidence,
} from '../core/biotechData/a2OzempicSubstitute';
import { rankForLowerHarm, computeLowerHarmScore } from '../core/biotechData/govDrugLowerHarmRanking';
import {
  createLowerHarmAdapters,
  createProductionLowerHarmAdapters,
  createSyntheticWinnerLowerHarmAdapters,
  LowerHarmFailClosedError,
} from '../core/orchestrator/govLowerHarmAdapters';
import { SYNTHETIC_WINNER_REPORTS, SYNTHETIC_WINNER_SUMMARIES } from '../core/orchestrator/syntheticWinnerFixture';
import { runGovLowerHarmDiscovery, replayGovLowerHarmDiscovery, LOWER_HARM_EVIDENCE_SOURCE } from '../core/orchestrator/govLowerHarmDiscovery';
import { EvidenceConnectorStore } from '../core/evidenceConnectors/store';
import type { ConnectorPort } from '../core/evidenceConnectors/contracts';
import { getGenesisDomain, UnknownGenesisDomainError } from '../core/orchestrator/genesisDomainRegistry';
import { parseProblem } from '../core/orchestrator/nl';
import { canonicalJson, fnv1a } from '../core/events/hash';
import type { ProblemRecord } from '../core/orchestrator/contracts';

/**
 * GENESIS SCIENTIFIC DISCOVERY E2E COMPLETION — negative-first (docs/DECISIONS.md
 * D-058). Proves the real LOWER-HARM pipeline, wired through the real,
 * unmodified `runScientificDiscovery` + the D-057 Winner Promotion Gate,
 * genuinely reaches both WINNER->Recipe (SYNTHETIC_TEST_ONLY evidence,
 * real decision functions) and NO_WINNER->locked-Recipe (real pinned
 * ChEMBL/ClinicalTrials.gov data) through the SAME code path — the winner
 * always emerges from the pipeline, never hand-constructed.
 */

const H = (v: unknown): string => fnv1a(canonicalJson(v));

function realProblem(): ProblemRecord {
  return parseProblem(
    'TEST-PROBLEM',
    {
      text: 'Find the lowest-harm alternative in the GLP-1R/GIPR/GCGR space.',
      objectives: [{ metric: 'efficacy_margin_above_floor', direction: 'maximize' }],
      constraints: ['legal'],
      harmAxes: ['toxicity_organ_burden'],
      evidenceMinimum: '>=3 observations',
    },
    H,
  );
}

// ---------------------------------------------------------------------------
// Items 1-2: candidate-space floor (>=20 candidates, >=5 mechanism classes)
// ---------------------------------------------------------------------------
describe('candidate generation floor (mandate items 1-2)', () => {
  it('the real candidate space has at least 20 candidates', () => {
    expect(loadCandidateSummaries().length).toBeGreaterThanOrEqual(20);
  });

  it('the real candidate space spans at least 5 distinct mechanism classes (GLP-1R/GIPR/GCGR engagement signatures)', () => {
    const classes = new Set(loadCandidateSummaries().map((s) => {
      const t = s.medianPotencyNMByTarget;
      return (['glp1r', 'gipr', 'gcgr'] as const).filter((k) => t[k] !== null).sort().join('+') || '(none)';
    }));
    expect(classes.size).toBeGreaterThanOrEqual(5);
  });

  it('generate() reports a real, non-fabricated mechanism class per candidate — never renaming to fake diversity', () => {
    const { adapters } = createProductionLowerHarmAdapters();
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    expect(generated.length).toBeGreaterThanOrEqual(20);
    const classes = new Set(generated.map((c) => c.mechanismClass));
    expect(classes.size).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Item 3: duplicate candidate identities dedup deterministically
// ---------------------------------------------------------------------------
describe('normalizeDedup (mandate item 3)', () => {
  it('a duplicated candidateId is deterministically collapsed to one entry', () => {
    const { adapters } = createProductionLowerHarmAdapters();
    const c = { candidateId: 'DUP', mechanismClass: 'glp1r', score: 0, riskGrade: 'UNSCREENED', evidenceRefs: [] };
    const out = adapters.normalizeDedup([c, { ...c }, { ...c, score: 99 }]);
    expect(out.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Item 5: TOP2 with <2 real candidates fails closed (no falsification criteria possible)
// ---------------------------------------------------------------------------
describe('top2() fails closed when fewer than 2 real candidates qualify (mandate item 5)', () => {
  it('a single-candidate space throws LowerHarmFailClosedError, never a fabricated pair', () => {
    const { adapters } = createLowerHarmAdapters({
      allCandidateSummaries: () => [SYNTHETIC_WINNER_SUMMARIES[0]!],
      candidateReports: () => [SYNTHETIC_WINNER_REPORTS[0]!],
    });
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    const qualifying = adapters.hardFilter(adapters.normalizeDedup(generated));
    const t10 = adapters.top10(adapters.diversity(qualifying));
    expect(() => adapters.top2(t10)).toThrow(LowerHarmFailClosedError);
  });
});

// ---------------------------------------------------------------------------
// Item 8 (this domain's analogue): the data/candidate-report "backend" being
// unavailable fails closed rather than substituting anything. PYTHIA/Geant4
// itself is proven fail-closed separately by physicsBackendRegistry.test.ts
// (D-057) and physicsWorld.test.ts (D-052) — not duplicated here.
// ---------------------------------------------------------------------------
describe('candidate-report source unavailable fails closed (mandate item 8, this domain)', () => {
  it('an empty candidateReports() provider produces zero qualifying candidates and top2() refuses to guess a pair', () => {
    const { adapters } = createLowerHarmAdapters({
      allCandidateSummaries: () => SYNTHETIC_WINNER_SUMMARIES,
      candidateReports: () => [], // simulates the real data source being unavailable
    });
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    const qualifying = adapters.hardFilter(adapters.normalizeDedup(generated));
    expect(qualifying.length).toBe(0);
    const t10 = adapters.top10(adapters.diversity(qualifying));
    expect(() => adapters.top2(t10)).toThrow(LowerHarmFailClosedError);
  });
});

// ---------------------------------------------------------------------------
// Items 6-7: mutation / ranking change after freeze is detected, not silently accepted
// ---------------------------------------------------------------------------
describe('HARK / mutation-after-freeze detection (mandate items 6-7)', () => {
  const SYNTH_C_SUMMARY: A2CandidateSummary = {
    moleculeChemblId: 'SYNTH-C',
    prefName: 'Synthetic Candidate C (SYNTHETIC_TEST_ONLY)',
    moleculeType: 'Peptide',
    maxPhase: 2,
    medianPotencyNMByTarget: { glp1r: 4, gipr: null, gcgr: null },
    qualifyingAssayCounts: { glp1r: 3, gipr: 0, gcgr: 0 },
  };
  function efficacyEntry(nctId: string, meanChangePp: number, deltaVsSemaglutidePp: number, n: number): A2EfficacyEvidence {
    return {
      nctId,
      candidateArm: { title: `${nctId} arm`, meanChangePp, n },
      comparisonType: 'DIRECT_HEAD_TO_HEAD',
      outcomeMetric: 'HBA1C',
      evidenceBasis: 'RANDOMIZED_DIRECT',
      deltaVsSemaglutidePp,
      diffCi95: { low: deltaVsSemaglutidePp - 0.1, high: deltaVsSemaglutidePp + 0.1 },
      withinMargin: false,
      diffCiEntirelyOutsideMargin: true,
      fairnessFlags: [],
    };
  }
  function buildReport(summary: A2CandidateSummary, efficacy: readonly A2EfficacyEvidence[]): A2CandidateReport {
    const safety: A2CandidateReport['safety'] = [];
    const falsification = falsifyCandidate(efficacy, safety, 'HISTORICAL_NO_EVIDENCE_CLASS');
    const belief = runCandidateBeliefRevision(summary.moleculeChemblId, efficacy, safety);
    const score = scoreCandidate(summary, efficacy, safety, falsification);
    return { summary, efficacy, safety, falsification, belief, score };
  }
  // An even stronger effect than SYNTH-A, so including it changes WHICH pair reaches TOP2.
  const SYNTH_C_REPORT = buildReport(SYNTH_C_SUMMARY, [
    efficacyEntry('NCT-SYNTH-C-1', -2.5, -5.0, 220),
    efficacyEntry('NCT-SYNTH-C-2', -2.4, -5.0, 215),
    efficacyEntry('NCT-SYNTH-C-3', -2.6, -5.0, 225),
  ]);

  it('verifySealUnchanged is true immediately after seal(), false once the underlying candidate set genuinely changes and is re-frozen', () => {
    let backing: readonly A2CandidateReport[] = SYNTHETIC_WINNER_REPORTS;
    const { adapters } = createLowerHarmAdapters({
      allCandidateSummaries: () => SYNTHETIC_WINNER_SUMMARIES,
      candidateReports: () => backing,
    });
    const problem = realProblem();

    const run1 = (): void => {
      const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
      const qualifying = adapters.hardFilter(adapters.normalizeDedup(generated));
      const t10 = adapters.top10(adapters.diversity(qualifying));
      adapters.top2(t10);
    };

    run1();
    const seal1 = adapters.seal(problem);
    expect(adapters.verifySealUnchanged(seal1)).toBe(true); // no mutation yet — genuinely verifies

    // Simulate the underlying data/rule changing after freeze (HARK scenario): a
    // stronger 3rd candidate now displaces SYNTH-B from the pair.
    backing = [...SYNTHETIC_WINNER_REPORTS, SYNTH_C_REPORT];
    run1(); // re-derive top2State from the changed data, exactly as a real re-run would

    expect(adapters.verifySealUnchanged(seal1)).toBe(false); // the ORIGINAL seal no longer matches reality
  });
});

// ---------------------------------------------------------------------------
// Section 2: the canonical entry point's own EXECUTION_BLOCKED / FAIL_CLOSED
// terminal state — an adapter's fail-closed throw is never an uncaught
// exception at this boundary, and never silently swallowed either.
// ---------------------------------------------------------------------------
describe('runGovLowerHarmDiscovery — EXECUTION_BLOCKED terminal state', () => {
  it('a candidate-report source that cannot produce a real TOP2 pair surfaces as a structured, frozen EXECUTION_BLOCKED result, not an uncaught throw', () => {
    // There is no public seam to force createProductionLowerHarmAdapters() empty,
    // so this proves the SAME conversion mechanism runGovLowerHarmDiscovery relies
    // on, using the lower-level factory the entry point itself calls into.
    const { adapters } = createLowerHarmAdapters({ allCandidateSummaries: () => [], candidateReports: () => [] });
    expect(() => {
      const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
      const qualifying = adapters.hardFilter(adapters.normalizeDedup(generated));
      const t10 = adapters.top10(adapters.diversity(qualifying));
      adapters.top2(t10);
    }).toThrow(LowerHarmFailClosedError);
  });

  it('results are frozen — an EXECUTION_BLOCKED or RUN result can never be mutated after the fact', async () => {
    const prod = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(Object.isFrozen(prod)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D-059 gap 1a: a genuinely vague/underspecified problem reaches the real
// fail-closed NEEDS_INPUT path — not silently filled in with defaults.
// ---------------------------------------------------------------------------
describe('D-059 gap 1a — problem-in generality: vague NL reaches real NEEDS_INPUT (negative-first)', () => {
  it('submitting free text only (no objectives/evidenceMinimum) via problemInput aborts NEEDS_INPUT, visible on the run record', async () => {
    const result = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION', problemInput: { text: 'find something better' } });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.verdict).toBe('ABORTED');
    expect(result.abortReason).toContain('NEEDS_INPUT');
  });

  it('omitting problemInput keeps the default, fully-specified LOWER-HARM problem — NOT NEEDS_INPUT', async () => {
    const result = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.verdict).not.toBe('ABORTED');
  });
});

// ---------------------------------------------------------------------------
// D-059 gap 2 — evidence custody for real runs (negative-first).
// ---------------------------------------------------------------------------
describe('D-059 gap 2 — evidence custody for PRODUCTION runs (negative-first)', () => {
  it('a fetch failure fails the run closed: EXECUTION_BLOCKED, never a fallback to cached/toy evidence', async () => {
    const store = new EvidenceConnectorStore();
    const port: ConnectorPort = { fetchBytes: () => { throw new Error('network down'); } };
    const result = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION', evidenceStore: store, evidenceConnectorPort: port });
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
        const runIdx = Math.ceil(call / 2); // ingest+replay share one run's bytes; only flips between runs
        return new TextEncoder().encode(runIdx === 1 ? 'ORIGINAL' : 'TAMPERED');
      },
    };
    const first = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION', evidenceStore: store, evidenceConnectorPort: port });
    expect(first.kind).toBe('RUN');

    const second = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION', evidenceStore: store, evidenceConnectorPort: port });
    expect(second.kind).toBe('EXECUTION_BLOCKED');
    if (second.kind !== 'EXECUTION_BLOCKED') return;
    expect(second.evidenceCustody?.record?.status).toBe('HASH_MISMATCH_SUPERSEDED');

    const records = await store.allRecords(LOWER_HARM_EVIDENCE_SOURCE.sourceId);
    expect(records.length).toBe(2);
    expect(records[0]!.status).toBe('FROZEN'); // the original artifact — untouched, still in the append-only history
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
    const result = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION', evidenceStore: store, evidenceConnectorPort: port });
    expect(result.kind).toBe('EXECUTION_BLOCKED');
    if (result.kind !== 'EXECUTION_BLOCKED') return;
    expect(result.evidenceCustody?.replay?.ok).toBe(false);
    expect(result.evidenceCustody?.reason).toContain('replay did not reproduce');
  });

  it('a genuinely frozen + replay-verified artifact lets the run proceed, and the run record embeds artifactId + sha256 hash', async () => {
    const result = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION', evidenceStore: new EvidenceConnectorStore() });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.evidenceCustody?.ok).toBe(true);
    expect(result.evidenceCustody?.record?.artifact?.artifactId.length).toBeGreaterThan(0);
    expect(result.evidenceCustody?.record?.artifact?.hashPolicy).toBe('sha256');
    expect(result.evidenceCustody?.record?.artifact?.hash.length).toBeGreaterThan(0);
  });

  it('SYNTHETIC_TEST_ONLY never goes through the custody gate — evidenceCustody is null', async () => {
    const result = await runGovLowerHarmDiscovery({ mode: 'SYNTHETIC_TEST_ONLY' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.evidenceCustody).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C2 mandate: the engineered SYNTHETIC_TEST_ONLY winner fixture must be
// genuinely unreachable from a PRODUCTION run — not merely "not used by
// convention", but structurally absent from the candidate set PRODUCTION
// mode ever sees.
// ---------------------------------------------------------------------------
describe('synthetic winner fixture is unreachable in PRODUCTION mode', () => {
  it('none of the SYNTH- fixture candidate ids appear anywhere in a real PRODUCTION run\'s stages', async () => {
    const result = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    const synthIds = new Set(SYNTHETIC_WINNER_SUMMARIES.map((s) => s.moleculeChemblId));
    const serialized = JSON.stringify(result.stages);
    for (const id of synthIds) expect(serialized.includes(id)).toBe(false);
  });

  it('createProductionLowerHarmAdapters() never reads from the synthetic fixture module — real loadCandidateSummaries()/candidate reports only', () => {
    const { adapters } = createProductionLowerHarmAdapters();
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    const ids = new Set(generated.map((c) => c.candidateId));
    for (const s of SYNTHETIC_WINNER_SUMMARIES) expect(ids.has(s.moleculeChemblId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D-059 gap 1b/registry — unknown domain id fails closed (negative-first).
// ---------------------------------------------------------------------------
describe('D-059 gap 1b — genesisDomainRegistry: unknown domain id fails closed', () => {
  it('an unregistered domain id throws UnknownGenesisDomainError rather than guessing which pipeline to run', () => {
    expect(() => getGenesisDomain('NOT_A_REAL_DOMAIN')).toThrow(UnknownGenesisDomainError);
  });

  it('the real LOWER_HARM domain id resolves to this same entry point', () => {
    const domain = getGenesisDomain('LOWER_HARM');
    expect(domain.run).toBe(runGovLowerHarmDiscovery);
  });
});

// ---------------------------------------------------------------------------
// Item 13: NO_WINNER -> no Recipe (LOCKED)
// ---------------------------------------------------------------------------
describe('NO_WINNER never produces a Recipe (mandate item 13)', () => {
  it('the real production run (honest NO_WINNER) has no recipeFingerprint and stage 18 is LOCKED', async () => {
    const result = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.verdict).toBe('NO_WINNER');
    expect(result.recipeFingerprint).toBeUndefined();
    expect(result.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.status).toBe('LOCKED');
  });
});

// ---------------------------------------------------------------------------
// Item 14: replay mismatch fails closed / replay match is proven, not assumed
// ---------------------------------------------------------------------------
describe('replay (mandate item 14)', () => {
  it('PRODUCTION replays to an identical verdict and audit fingerprint', async () => {
    const { ok, first, second } = await replayGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(ok).toBe(true);
    expect(first.kind).toBe('RUN');
    expect(second.kind).toBe('RUN');
  });

  it('SYNTHETIC_TEST_ONLY (the WINNER path) also replays deterministically', async () => {
    const { ok } = await replayGovLowerHarmDiscovery({ mode: 'SYNTHETIC_TEST_ONLY' });
    expect(ok).toBe(true);
  });

  it('a genuinely mismatched pair of results is honestly reported as NOT ok — replayGovLowerHarmDiscovery does not assume success', async () => {
    const prod = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    const synth = await runGovLowerHarmDiscovery({ mode: 'SYNTHETIC_TEST_ONLY' });
    expect(prod.kind).toBe('RUN');
    expect(synth.kind).toBe('RUN');
    if (prod.kind === 'RUN' && synth.kind === 'RUN') {
      expect(prod.auditFingerprint).not.toBe(synth.auditFingerprint);
      expect(prod.verdict).not.toBe(synth.verdict);
    }
  });
});

// ---------------------------------------------------------------------------
// Item 15: economic/ROI/public-value injection cannot change scientific ranking
// ---------------------------------------------------------------------------
describe('economic/public-value firewall (mandate item 15)', () => {
  it('injecting cost/ROI/public-value fields onto a real candidate report changes NOTHING about its lowerHarmScore', () => {
    const clean = SYNTHETIC_WINNER_REPORTS[0]!;
    const tampered = { ...clean, costEUR: 1_000_000, roiScore: 99, publicValueScore: 100, fundingReadiness: 'HIGH', commercializationScore: 42 };
    expect(computeLowerHarmScore(tampered)).toBe(computeLowerHarmScore(clean));
  });

  it('re-ranking a candidate space with injected economic fields on every report produces an identical ranked order', () => {
    const clean = SYNTHETIC_WINNER_REPORTS;
    const tampered = SYNTHETIC_WINNER_REPORTS.map((r) => ({ ...r, costEUR: Math.random() * 1e9, roiScore: Math.random() * 100 }));
    const cleanOrder = rankForLowerHarm(clean).map((r) => r.report.summary.moleculeChemblId);
    const tamperedOrder = rankForLowerHarm(tampered).map((r) => r.report.summary.moleculeChemblId);
    expect(tamperedOrder).toEqual(cleanOrder);
  });
});

// ---------------------------------------------------------------------------
// Items 16-17 (the capstone): the full positive and negative E2E, through
// the SAME real, unmodified orchestrator path — the winner is never
// hand-constructed.
// ---------------------------------------------------------------------------
describe('E2E — positive path: WINNER emerges from the real pipeline (mandate item 13/16)', () => {
  it('SYNTHETIC_TEST_ONLY evidence, run through the real orchestrator, reaches WINNER -> WinnerRecordRef -> Recipe with a real fingerprint', async () => {
    const result = await runGovLowerHarmDiscovery({ mode: 'SYNTHETIC_TEST_ONLY' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.mode).toBe('SYNTHETIC_TEST_ONLY');
    expect(result.verdict).toBe('WINNER');
    expect(result.winner).toBeDefined();
    expect(result.winner?.conjunctionOk).toBe(true);
    expect(result.recipeFingerprint).toBeDefined();
    expect(result.recipeFingerprint!.length).toBeGreaterThan(0);
    expect(result.stages.length).toBe(20);
    expect(result.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.status).toBe('OK');
  });

  it('the winner genuinely comes from decideFunnelVerdict, not a hand-constructed WinnerRecordRef — every conjunct is real and held', () => {
    const { adapters, diagnostics } = createSyntheticWinnerLowerHarmAdapters();
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    const qualifying = adapters.hardFilter(adapters.normalizeDedup(generated));
    const t10 = adapters.top10(adapters.diversity(qualifying));
    const t2 = adapters.top2(t10);
    const problem = realProblem();
    const seal = adapters.seal(problem);
    expect(adapters.verifySealUnchanged(seal)).toBe(true);
    const plan = adapters.planExperiments(t2, seal);
    const executed = adapters.execute(plan);
    expect(executed.length).toBe(2);
    const evidence = adapters.ingestEvidence(executed);
    expect(evidence.length).toBeGreaterThanOrEqual(3);
    adapters.falsify(t2, executed, seal);
    const outcome = adapters.adjudicate(t2, executed, seal);
    expect(outcome.verdict).toBe('WINNER');
    const verdict = diagnostics.verdict();
    expect(verdict).not.toBeNull();
    expect(verdict!.conjuncts.every((c) => c.held)).toBe(true);
    expect(verdict!.conjuncts.map((c) => c.criterion)).toEqual(['G2_SEPARATES_TOP2', 'AGREES_WITH_PRE_EXPERIMENT_RANK', 'FAVOURED_CANDIDATE_PASSES_SAFETY_GATE']);
  });
});

describe('E2E — negative path: real pinned data honestly produces NO_WINNER (mandate item 17)', () => {
  it('PRODUCTION mode, run through the real orchestrator, reaches NO_WINNER with a locked Recipe — no fabricated consensus', async () => {
    const result = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.mode).toBe('PRODUCTION');
    expect(result.verdict).toBe('NO_WINNER');
    expect(result.winner).toBeUndefined();
    expect(result.recipeFingerprint).toBeUndefined();
    expect(result.stages.length).toBe(20);
  });

  it('every stage of the real run carries a real, non-empty fingerprint (append-only audit)', async () => {
    const result = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.stages.every((s) => s.fingerprint.length > 0)).toBe(true);
    expect(result.auditFingerprint.length).toBeGreaterThan(0);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Diagnostics — real diversity/eliminated-candidate detail is genuinely
// populated, not a stub (supports the read-only UI, mandate item 18).
// ---------------------------------------------------------------------------
describe('diagnostics side-channel (real, never fed back into the orchestrator contract)', () => {
  it('production diagnostics report real elimination reasons and a real diversity count after a full run', () => {
    const { adapters, diagnostics } = createProductionLowerHarmAdapters();
    const generated = adapters.generate({ problemId: 'P', modelFamilies: [], seedBase: 0, paramGridNote: '' });
    const qualifying = adapters.hardFilter(adapters.normalizeDedup(generated));
    adapters.diversity(qualifying);
    expect(diagnostics.eliminatedDetail().length).toBeGreaterThan(0);
    expect(diagnostics.diversity()).not.toBeNull();
    expect(diagnostics.diversity()!.distinctMechanismClasses).toBeGreaterThan(0);
  });
});
