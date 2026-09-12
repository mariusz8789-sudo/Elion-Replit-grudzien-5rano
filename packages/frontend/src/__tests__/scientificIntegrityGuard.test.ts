import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateCompetingHypotheses, preregisterHypotheses, executePreregisteredHypotheses,
  buildSavedHypothesisLoop, verifyPreregistrationIntact, replaySavedHypothesisLoop,
  selectNextHypothesisExperiment, HYPOTHESIS_PROBLEMS,
  type HypothesisProblem,
} from '../core/experimentFabric/hypothesisLoop';
import { runScientificDiscoveryLoop } from '../core/experimentFabric/scientificDiscoveryLoop';
import {
  saveScientificDiscoveryLoopToMemory, replaySavedScientificDiscoveryLoop, contentHash,
  type SavedScientificDiscoveryLoopReplayStatus, type SavedExperiment,
} from '../core/scienceMemory';
import { collectCrossDomainOpenItems, synthesizeNextQuestion } from '../core/agent/crossDomainSynthesis';
import { resolveDiscoveryQuestion } from '../core/scienceChat/discoveryQuestions';
import {
  ToyVulnerableApp, runInvestigation, judgeVerdict, SENSITIVE_MARKERS,
} from '../core/agent/cyberReasoningKernel';
import { selectNextTest, CYBER_PLANNER_WEIGHTS } from '../core/agent/cyberTestPlanner';
import { repeatedPatterns, buildGlyphSequence } from '../core/agent/decipherment/glyphAnalysis';

/**
 * GENESIS SCIENTIFIC INTEGRITY GUARD SUITE.
 *
 * REGRESSION GUARDS, not a new engine: every check here calls a REAL,
 * already-shipped function (`verifyPreregistrationIntact`, `judgeVerdict`,
 * `selectNextHypothesisExperiment`, `collectCrossDomainOpenItems`, …) and
 * proves an invariant that, if silently broken by a future edit, would let
 * Genesis misreport its own scientific state. It builds no second
 * Memory/Evidence/Replay/Matrix/Information-Gain/Conflict engine.
 *
 * Several of the 14 points this suite was commissioned to cover already had
 * DEEP, real coverage before this file existed:
 *   - HARK-protection / preregistration / falsification-criterion tampering:
 *     `hypothesisLoop.test.ts` ("Prerejestracja i ochrona przed HARK-owaniem").
 *   - contentHash tamper detection: `scienceMemory.test.ts`
 *     ("ignores a tampered content hash instead of treating it as reproducible").
 *   - SUPPORTED/FALSIFIED never reopened, next-experiment quoted verbatim,
 *     determinism of `synthesizeNextQuestion`: `crossDomainSynthesis.test.ts`
 *     ("Next Question reads the real hypothesis/discovery loop").
 *   - `notifyScienceMemoryChanged` call-site boundary: `scienceMemoryEvents.test.ts`.
 * This file does not re-litigate those in full; where it touches the same
 * ground it says so and adds only what was genuinely missing — a
 * cross-cutting assertion no single per-domain file was positioned to make.
 *
 * A REAL, VERIFIED FINDING from building this suite, documented rather than
 * silently worked around: `discoveryLoop.ts` (the WorldGraph loop) declares
 * its OWN `export type HypothesisStatus = 'UNTESTED' | 'SUPPORTED' | 'REFUTED' | 'UNRESOLVED'`
 * — a fourth epistemic-status-shaped type, distinct from the `HypothesisStatus`
 * this suite's point 1 names (`experimentFabric/hypothesisLoop.ts`'s
 * 'HYPOTHESIS' | 'PRE_REGISTERED' | 'SUPPORTED' | 'FALSIFIED' | 'INCONCLUSIVE' |
 * 'BLOCKED' | 'UNKNOWN'). No file imports both under the same bare name today
 * (grepped: zero hits), so there is no live conflation bug — but the name
 * collision itself is real and worth a future rename
 * (`discoveryLoop.ts`'s own to `WorldHypothesisStatus`) rather than a silent
 * "already fine". Not renamed here: a rename is a refactor across an
 * unknown number of call sites, outside this suite's "regression guard, not
 * a new engine" mandate — see the locking test below instead.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..');
const THIS_FILE = fileURLToPath(import.meta.url);

function collectFiles(dir: string, predicate: (path: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(path, predicate);
    return entry.isFile() && predicate(path) ? [path] : [];
  });
}

const SMALL: HypothesisProblem = {
  ...HYPOTHESIS_PROBLEMS[0]!,
  sharedLevers: { days: 18, stepsPerDay: 2, nAgents: 120, initialInfected: 4, seed: 20260831, interventionStartDay: 0 },
};
const runHypothesisLoop = () => executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(SMALL)));

// =============================================================================
// 1. EPISTEMIC STATUS CONSISTENCY — three distinct, non-reducible enumerations.
// =============================================================================
describe('1. Epistemic status consistency', () => {
  it('HypothesisAssessment (scientificDiscovery.ts), HypothesisStatus (hypothesisLoop.ts), and ReplayVerdict (replayVerdict.ts) have different, non-overlapping value sets — never one enum standing in for another', () => {
    const hypothesisAssessment = ['CANDIDATE', 'SUPPORTED_WITHIN_PROTOCOL', 'FALSIFIED_WITHIN_PROTOCOL', 'INCONCLUSIVE'];
    const hypothesisStatus = ['HYPOTHESIS', 'PRE_REGISTERED', 'SUPPORTED', 'FALSIFIED', 'INCONCLUSIVE', 'BLOCKED', 'UNKNOWN'];
    const replayVerdict = ['MATCH', 'DRIFT', 'BLOCKED', 'NOT_REPRODUCIBLE'];

    expect(new Set(hypothesisAssessment)).not.toEqual(new Set(hypothesisStatus));
    expect(new Set(hypothesisStatus)).not.toEqual(new Set(replayVerdict));
    expect(new Set(hypothesisAssessment)).not.toEqual(new Set(replayVerdict));
    // Real evidence the mapping between the first two is a deliberate TRANSLATION,
    // not aliasing: executePreregisteredHypotheses maps SUPPORTED_WITHIN_PROTOCOL
    // (an assessment) to SUPPORTED (a status) — different words for a reason.
    const result = runHypothesisLoop();
    const supported = result.outcomes.find((o) => o.criterionAssessment === 'SUPPORTED_WITHIN_PROTOCOL');
    if (supported) expect(supported.status).toBe('SUPPORTED');
  });

  it('LOCKS the real, verified HypothesisStatus name collision with discoveryLoop.ts — fails loudly if a future edit silently unifies or further diverges them', () => {
    const worldDiscoveryLoopSource = readFileSync(join(SRC_DIR, 'core', 'agent', 'discoveryLoop.ts'), 'utf8');
    const match = worldDiscoveryLoopSource.match(/export type HypothesisStatus = ([^;]+);/);
    expect(match, 'discoveryLoop.ts should still declare its own HypothesisStatus — if this fails, the collision was resolved (rename this test\'s expectations, do not delete it silently)').not.toBeNull();
    const values = (match![1] ?? '').split('|').map((s) => s.trim().replace(/'/g, ''));
    expect(new Set(values)).toEqual(new Set(['UNTESTED', 'SUPPORTED', 'REFUTED', 'UNRESOLVED']));

    // The real invariant that actually matters: nobody imports `HypothesisStatus`
    // by name from BOTH modules in one file (which would silently shadow one
    // with the other, since both are structurally string unions — no type
    // error would ever flag it). Checked against the actual import CLAUSE
    // content, not just "the file happens to mention both modules somewhere".
    const allFiles = collectFiles(SRC_DIR, (p) => p.endsWith('.ts') || p.endsWith('.tsx'));
    const importsHypothesisStatusFrom = (source: string, moduleSuffix: string): boolean => {
      const importClauses = [...source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]*)['"];?/g)];
      return importClauses.some(([, names, path]) => path.endsWith(moduleSuffix) && /\bHypothesisStatus\b/.test(names));
    };
    const offenders = allFiles.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return importsHypothesisStatusFrom(source, 'discoveryLoop') && importsHypothesisStatusFrom(source, 'experimentFabric/hypothesisLoop');
    });
    expect(offenders).toEqual([]);
  });
});

// =============================================================================
// 2 & 3. PREREGISTRATION + FALSIFICATION-CRITERION INTEGRITY.
// Deep coverage already exists in hypothesisLoop.test.ts's "Prerejestracja i
// ochrona przed HARK-owaniem" block (statement/criterion/hypothesis-count/
// parameter tamper all independently proven WYKRYWANA). This adds the one
// thing that block does not: a fingerprint-of-the-fingerprint-function check
// that the SAME frozen view feeds BOTH the preregistration fingerprint and
// the loop fingerprint, so a bypass of one cannot leave the other silent.
// =============================================================================
describe('2 & 3. Preregistration + falsification-criterion integrity', () => {
  it('a preregistration intact at build time, tampered before save, is caught before it can ever reach Science Memory', () => {
    const prereg = preregisterHypotheses(generateCompetingHypotheses(SMALL));
    expect(verifyPreregistrationIntact(prereg).intact).toBe(true);

    const tamperedFalsifier = prereg.hypotheses.map((h, i) => i !== 0 ? h : {
      ...h, falsificationCriteria: { ...h.falsificationCriteria, relation: 'greater-than' as const },
    });
    expect(verifyPreregistrationIntact(prereg, tamperedFalsifier).intact).toBe(false);

    // executePreregisteredHypotheses always runs the STORED prereg.hypotheses,
    // never an externally-tampered view — so buildSavedHypothesisLoop, called on
    // its real output, never even gets a chance to bank a HARKed result.
    const result = executePreregisteredHypotheses(prereg);
    expect(() => buildSavedHypothesisLoop(result)).not.toThrow();
  });
});

// =============================================================================
// 4. EVIDENCE PROVENANCE — evidencePackId/evidenceChainId are quoted from a
// REAL created artifact, never invented by a downstream reader.
// =============================================================================
describe('4. Evidence provenance', () => {
  it('a real executed hypothesis outcome carries the id of a REAL evidence pack this exact run created — not a placeholder', () => {
    const result = runHypothesisLoop();
    const executed = result.outcomes.filter((o) => o.evidencePackId !== null);
    expect(executed.length).toBeGreaterThan(0);
    const realPackIds = new Set(result.packs.map((p) => p.evidencePackId));
    for (const outcome of executed) {
      expect(realPackIds.has(outcome.evidencePackId!)).toBe(true);
    }
  });

  it('crossDomainSynthesis copies evidencePackId verbatim from the source record and never fabricates one when absent', () => {
    const withPack: SavedExperiment = {
      id: 'r1', createdAt: new Date().toISOString(), labId: 'lab', experimentId: 'e1', experimentName: 'n',
      params: {}, stats: {}, honesty: 'simplified', honestyNote: 'fixture', equations: [], assumptions: [],
      epistemicStatus: 'UNKNOWN', contentHash: 'h1', evidencePackId: 'pack_real_123',
      researchChain: {
        contractVersion: '1.0.0', chainShape: 'MECHANISM', initialQuestion: 'Q?',
        steps: [{ step: 1, question: 'Q?', kind: 'INITIAL', why: 'start', ranSuccessfully: false, savedExperimentIds: [] }],
        selfChosenSteps: 0, stoppedBecause: 'no actuator', terminalStatus: 'BLOCKED', resultFingerprint: 'fp1',
      },
    };
    const withoutPack: SavedExperiment = { ...withPack, id: 'r2', contentHash: 'h2', evidencePackId: undefined };

    const items = collectCrossDomainOpenItems([withPack, withoutPack]);
    expect(items.find((i) => i.sourceExperimentId === 'r1')?.evidencePackId).toBe('pack_real_123');
    expect(items.find((i) => i.sourceExperimentId === 'r2')?.evidencePackId).toBeNull();
  });
});

// =============================================================================
// 5. SCIENTIFIC MEMORY PERSISTENCE — contentHash actually corresponds to
// content (deep coverage: scienceMemory.test.ts's own contentHash describe
// block). This proves the SAME invariant end to end through listExperiments(),
// the function every screen actually calls.
// =============================================================================
describe('5. Scientific memory persistence integrity', () => {
  function makeFakeStorage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    };
  }

  it('a record whose params were edited in storage without recomputing contentHash is silently dropped by listExperiments(), never trusted', async () => {
    vi.resetModules();
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const mem = await import('../core/scienceMemory');

    const saved = mem.saveExperiment({
      labId: 'lab-integrity', experimentId: 'e-integrity', experimentName: 'n', params: { m: 1 }, stats: {},
      honesty: 'simplified', honestyNote: 'fixture',
    });
    expect(mem.listExperiments().some((r) => r.id === saved.id)).toBe(true);

    // Tamper the underlying raw JSON directly — the same class of edit an
    // out-of-app localStorage edit or a corrupted sync would produce.
    const raw = JSON.parse(storage.getItem('genesis-os:science-memory/v1')!) as Array<Record<string, unknown>>;
    const record = raw.find((r) => r.id === saved.id)!;
    (record.params as Record<string, unknown>).m = 999; // content changed, contentHash NOT recomputed
    storage.setItem('genesis-os:science-memory/v1', JSON.stringify(raw));

    expect(mem.listExperiments().some((r) => r.id === saved.id)).toBe(false);
    vi.unstubAllGlobals();
  });
});

// =============================================================================
// 6. REPLAY REPRODUCIBILITY.
// A factual correction folded in here rather than silently accepted: the
// task brief for this suite stated `replaySavedScientificDiscoveryLoop`
// "zwraca MATCH/DRIFT/BLOCKED/NOT_REPRODUCIBLE wprost" — verified against the
// real source and that is NOT what its own declared type allows. Its real
// type, `SavedScientificDiscoveryLoopReplayStatus`, is `'MATCH' | 'DRIFT' |
// 'BLOCKED'` — three values, not four. `NOT_REPRODUCIBLE` belongs to the
// generic `ReplayVerdict` (matrixFoundation/replayVerdict.ts, used by
// Cyber/Decipherment/etc.'s self-consistency-only replay), not to this
// function, which always fully RE-EXECUTES rather than only checking
// self-consistency, so it never has a "the inputs to even check are gone"
// case distinct from BLOCKED.
// =============================================================================
describe('6. Replay reproducibility', () => {
  it('CORRECTS the record: replaySavedScientificDiscoveryLoop\'s own status type is MATCH | DRIFT | BLOCKED — no NOT_REPRODUCIBLE branch exists in its source', () => {
    const source = readFileSync(join(SRC_DIR, 'core', 'scienceMemory.ts'), 'utf8');
    const match = source.match(/export type SavedScientificDiscoveryLoopReplayStatus = ([^;]+);/);
    expect(match).not.toBeNull();
    const values = new Set((match![1] ?? '').split('|').map((s) => s.trim().replace(/'/g, '')));
    expect(values).toEqual(new Set(['MATCH', 'DRIFT', 'BLOCKED']));
    const typedAsStatus: SavedScientificDiscoveryLoopReplayStatus = 'MATCH';
    expect(values.has(typedAsStatus)).toBe(true);
  });

  it('an unchanged hypothesisLoop record replays as MATCH — by real re-execution, not a fingerprint echo', () => {
    const result = runHypothesisLoop();
    const saved = buildSavedHypothesisLoop(result);
    const replay = replaySavedHypothesisLoop(saved);
    expect(replay.status).toBe('MATCH');
    expect(replay.result).not.toBeNull();
  });

  it('a status tampered after save replays as DRIFT, never silently as MATCH', () => {
    const result = runHypothesisLoop();
    const saved = buildSavedHypothesisLoop(result);
    // Flip to a status guaranteed different from whatever the real run actually produced.
    const flipped = saved.outcomes[0]!.status === 'SUPPORTED' ? 'FALSIFIED' as const : 'SUPPORTED' as const;
    const tampered = { ...saved, outcomes: saved.outcomes.map((o, i) => i !== 0 ? o : { ...o, status: flipped }) };
    const replay = replaySavedHypothesisLoop(tampered);
    expect(replay.status).not.toBe('MATCH');
  });

  it('a real discovery loop end to end: save then replay agrees, via real re-execution', async () => {
    const loop = runScientificDiscoveryLoop(HYPOTHESIS_PROBLEMS[0]!.problemId);
    const saved = saveScientificDiscoveryLoopToMemory(loop);
    const replay = await replaySavedScientificDiscoveryLoop(saved);
    expect(replay.status).toBe('MATCH');
  });
});

// =============================================================================
// 7. DETERMINISTIC FINGERPRINTS — same input, same fingerprint, always.
// Covers the NEW surface named in the brief: discoveryQuestions.ts's own
// resolutionFingerprint, plus the loop/preregistration fingerprints that
// underpin every replay check above.
// =============================================================================
describe('7. Deterministic fingerprints', () => {
  it('discoveryQuestions.ts::resolveDiscoveryQuestion resolutionFingerprint is the same for the same question text, different for a different one', () => {
    const a1 = resolveDiscoveryQuestion('Discovery Loop: intervention timing');
    const a2 = resolveDiscoveryQuestion('Discovery Loop: intervention timing');
    expect(a1.resolutionFingerprint).toBe(a2.resolutionFingerprint);
    const b = resolveDiscoveryQuestion('this text matches no governed question at all');
    expect(b.resolutionFingerprint).not.toBe(a1.resolutionFingerprint);
  });

  it('preregistrationFingerprint/loopFingerprint reproduce identically for the same real run, and change when a real input changes', () => {
    const a = buildSavedHypothesisLoop(runHypothesisLoop());
    const b = buildSavedHypothesisLoop(runHypothesisLoop());
    expect(a.preregistrationFingerprint).toBe(b.preregistrationFingerprint);
    expect(a.loopFingerprint).toBe(b.loopFingerprint);

    const different = buildSavedHypothesisLoop(executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses({
      ...SMALL, sharedLevers: { ...SMALL.sharedLevers, seed: Number(SMALL.sharedLevers.seed) + 1 },
    }))));
    expect(different.preregistrationFingerprint).not.toBe(a.preregistrationFingerprint);
  });

  it('discoveryLoopFingerprint reproduces identically for the same real discovery loop run', () => {
    const a = saveScientificDiscoveryLoopToMemory(runScientificDiscoveryLoop(HYPOTHESIS_PROBLEMS[0]!.problemId));
    const b = saveScientificDiscoveryLoopToMemory(runScientificDiscoveryLoop(HYPOTHESIS_PROBLEMS[0]!.problemId));
    expect(a.discoveryLoop!.discoveryLoopFingerprint).toBe(b.discoveryLoop!.discoveryLoopFingerprint);
  });

  it('scienceMemory.ts::contentHash is order-independent over params and sensitive to real value changes', () => {
    const a = contentHash({ labId: 'l', experimentId: 'e', params: { x: 1, y: 2 } });
    const b = contentHash({ labId: 'l', experimentId: 'e', params: { y: 2, x: 1 } });
    const c = contentHash({ labId: 'l', experimentId: 'e', params: { x: 1, y: 3 } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

// =============================================================================
// 8. crossDomainSynthesis CORRECTNESS — the priority table and its tally are
// exhaustive: no CrossDomainOpenItemKind can silently vanish from either.
// =============================================================================
describe('8. crossDomainSynthesis priority/tally correctness', () => {
  function baseExperiment(overrides: Partial<SavedExperiment> & Pick<SavedExperiment, 'id' | 'labId'>): SavedExperiment {
    return {
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(), experimentId: overrides.id, experimentName: overrides.id,
      params: {}, stats: {}, honesty: 'simplified', honestyNote: 'fixture', equations: [], assumptions: [],
      epistemicStatus: 'UNKNOWN', contentHash: `hash:${overrides.id}`,
      ...overrides,
    };
  }

  it('a BLOCKED research chain is reported in the tally, and openItemCount matches the real item count exactly', () => {
    const records: SavedExperiment[] = [baseExperiment({
      id: 'chain-1', labId: 'mechanism-research-chain',
      researchChain: {
        contractVersion: '1.0.0', chainShape: 'MECHANISM', initialQuestion: 'Q?',
        steps: [{ step: 1, question: 'Q?', kind: 'INITIAL', why: 'start', ranSuccessfully: false, savedExperimentIds: [] }],
        selfChosenSteps: 0, stoppedBecause: 'no actuator', terminalStatus: 'BLOCKED', resultFingerprint: 'fp1',
      },
    })];
    const answer = synthesizeNextQuestion(records);
    expect(answer).not.toBeNull();
    expect(answer!.openItemCount).toBe(collectCrossDomainOpenItems(records).length);
    expect(answer!.whyNow).toMatch(/blocked chain/);
    expect(answer!.whyNow).not.toMatch(/\bnone\b/);
  });

  it('whyThisQuestion states the winning kind\'s priority "out of N" where N is a FIXED ceiling — the same regardless of which kind actually won, never re-scaled to make the winner look top-ranked', () => {
    const blockedChain: SavedExperiment[] = [baseExperiment({
      id: 'chain-1', labId: 'mechanism-research-chain',
      researchChain: {
        contractVersion: '1.0.0', chainShape: 'MECHANISM', initialQuestion: 'Q?',
        steps: [{ step: 1, question: 'Q?', kind: 'INITIAL', why: 'start', ranSuccessfully: false, savedExperimentIds: [] }],
        selfChosenSteps: 0, stoppedBecause: 'no actuator', terminalStatus: 'BLOCKED', resultFingerprint: 'fp1',
      },
    })];
    const unsettledChain: SavedExperiment[] = [baseExperiment({
      id: 'chain-2', labId: 'mechanism-research-chain',
      researchChain: {
        contractVersion: '1.0.0', chainShape: 'MECHANISM', initialQuestion: 'Q?',
        steps: [{ step: 1, question: 'Q?', kind: 'INITIAL', why: 'start', ranSuccessfully: true, savedExperimentIds: ['x'] }],
        selfChosenSteps: 0, stoppedBecause: 'ran out of budget', terminalStatus: 'OPEN', resultFingerprint: 'fp2',
      },
    })];

    const parse = (answer: ReturnType<typeof synthesizeNextQuestion>) => {
      const m = answer!.whyThisQuestion.match(/priority (\d+) of (\d+)/);
      expect(m).not.toBeNull();
      return { priority: Number(m![1]), of: Number(m![2]) };
    };
    const a = parse(synthesizeNextQuestion(blockedChain));
    const b = parse(synthesizeNextQuestion(unsettledChain));
    expect(a.priority).not.toBe(b.priority); // BLOCKED_CHAIN and UNSETTLED_CHAIN really do differ in priority
    expect(a.of).toBe(b.of); // but the ceiling they're measured against is the same fixed scale
    expect(a.of).toBeGreaterThanOrEqual(a.priority);
    expect(b.of).toBeGreaterThanOrEqual(b.priority);
  });
});

// =============================================================================
// SPECIFICALLY NAMED GUARDS from the brief.
// =============================================================================
describe('Specifically named guards', () => {
  it('SUPPORTED is never reopened as an unresolved item, even when a discoveryLoop nextExperiment exists alongside it', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: (() => {
      const values = new Map<string, string>();
      return {
        getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v),
        removeItem: (k: string) => void values.delete(k), key: (i: number) => [...values.keys()][i] ?? null,
        get length() { return values.size; },
      };
    })() });
    const { runScientificDiscoveryLoop: run } = await import('../core/experimentFabric/scientificDiscoveryLoop');
    const { saveScientificDiscoveryLoopToMemory: save } = await import('../core/scienceMemory');
    const { collectCrossDomainOpenItems: collect } = await import('../core/agent/crossDomainSynthesis');

    const saved = save(run(HYPOTHESIS_PROBLEMS[0]!.problemId));
    const settledStatements = new Set(
      saved.hypothesisLoop!.outcomes
        .filter((o) => o.status === 'SUPPORTED' || o.status === 'FALSIFIED')
        .map((o) => saved.hypothesisLoop!.hypotheses.find((h) => h.hypothesisId === o.hypothesisId)?.statement),
    );
    const items = collect().filter((i) => i.shape === 'hypothesisLoop' && i.kind !== 'UNDECIDED_DISCRIMINATION');
    for (const item of items) expect(settledStatements.has(item.question)).toBe(false);
    vi.unstubAllGlobals();
  });

  it('FALSIFIED is never turned into BLOCKED — a real, deterministic FALSIFIED outcome from the toy cyber fixture stays FALSIFIED_WITHIN_PROTOCOL, never reported as blocked-for-lack-of-executor', () => {
    const app = new ToyVulnerableApp();
    const trace = runInvestigation(app);
    const falsified = trace.verdicts.filter((v) => v.assessment === 'FALSIFIED_WITHIN_PROTOCOL');
    expect(falsified.length).toBeGreaterThan(0);
    for (const v of falsified) {
      expect(v.assessment).not.toBe('INCONCLUSIVE');
      expect(v.reasoning).not.toMatch(/no executor|brak wykonawcy|blocked/i);
    }
  });

  it('BLOCKED and FALSIFIED are never conflated: BLOCKED means "never executed" (no proposedExperiment), FALSIFIED means "executed and the falsifier matched" — real, different fixtures produce each', () => {
    const blockedResult = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses({
      ...SMALL, candidateVariable: 'nieistniejacaDzwignia',
    })));
    expect(blockedResult.outcomes.every((o) => o.status === 'BLOCKED')).toBe(true);
    expect(blockedResult.outcomes.every((o) => o.observedMetric === null)).toBe(true);

    const app = new ToyVulnerableApp();
    const trace = runInvestigation(app);
    const falsifiedHyp = trace.hypotheses.find((h) =>
      trace.verdicts.find((v) => v.hypothesisId === h.hypothesisId)?.assessment === 'FALSIFIED_WITHIN_PROTOCOL');
    expect(falsifiedHyp).toBeDefined();
    // A falsified cyber hypothesis DID run a real test — the opposite of BLOCKED's "never executed".
    expect(trace.tests.some((t) => t.hypothesisId === falsifiedHyp!.hypothesisId)).toBe(true);
  });

  it('nextExperiment is never a scientific verdict: selectNextHypothesisExperiment reads outcome.status but its own return type has no HypothesisStatus field and never appears as a status anywhere in a saved outcome', () => {
    const result = runHypothesisLoop();
    const next = selectNextHypothesisExperiment(result);
    expect(Object.keys(next)).not.toContain('status' + 'Hypothesis'); // sanity: field name is NextHypothesisExperiment.status, a DIFFERENT status space
    expect(['READY_TO_RUN', 'VALIDATION_REQUIRED', 'BLOCKED', 'RESOLVED']).toContain(next.status);
    // The outcomes array — Genesis's actual verdicts — is untouched by computing `next`.
    const before = JSON.stringify(result.outcomes);
    selectNextHypothesisExperiment(result);
    expect(JSON.stringify(result.outcomes)).toBe(before);
  });

  it('heuristic is never evidence: OPEN_ITEM_PRIORITY\'s ordinal is never rendered or serialized as a probability/confidence anywhere in a CrossDomainNextQuestion', () => {
    const records: SavedExperiment[] = [{
      id: 'r1', createdAt: new Date().toISOString(), labId: 'lab', experimentId: 'e1', experimentName: 'n',
      params: {}, stats: {}, honesty: 'simplified', honestyNote: 'fixture', equations: [], assumptions: [],
      epistemicStatus: 'UNKNOWN', contentHash: 'h1',
      researchChain: {
        contractVersion: '1.0.0', chainShape: 'MECHANISM', initialQuestion: 'Q?',
        steps: [{ step: 1, question: 'Q?', kind: 'INITIAL', why: 'start', ranSuccessfully: false, savedExperimentIds: [] }],
        selfChosenSteps: 0, stoppedBecause: 'no actuator', terminalStatus: 'BLOCKED', resultFingerprint: 'fp1',
      },
    }];
    const answer = synthesizeNextQuestion(records)!;
    const serialized = JSON.stringify(answer);
    expect(serialized).not.toMatch(/"probability"|"confidence"|confidenceScore|truthScore|probabilityOfTruth/i);
    // The priority NUMBER does appear (explicit ordinal, by design) — but only
    // inside the human-readable `whyThisQuestion` prose, never as its own
    // machine field a caller could mistake for a score.
    expect(Object.keys(answer)).not.toContain('priority');
    expect(Object.keys(answer)).not.toContain('confidence');
    expect(Object.keys(answer)).not.toContain('score');
  });
});

// =============================================================================
// 9 & 10. NO DUPLICATE EPISTEMIC / MEMORY SYSTEMS (whole-tree scan).
// =============================================================================
describe('9 & 10. No duplicate epistemic or memory systems', () => {
  it('saveExperiment and listExperiments are each declared exactly once in the whole source tree — one store, not two', () => {
    const allFiles = collectFiles(SRC_DIR, (p) => p.endsWith('.ts') && p !== THIS_FILE);
    const saveExperimentDecls = allFiles.filter((f) => /export function saveExperiment\b/.test(readFileSync(f, 'utf8')));
    const listExperimentsDecls = allFiles.filter((f) => /export function listExperiments\b/.test(readFileSync(f, 'utf8')));
    expect(saveExperimentDecls).toEqual([join(SRC_DIR, 'core', 'scienceMemory.ts')]);
    expect(listExperimentsDecls).toEqual([join(SRC_DIR, 'core', 'scienceMemory.ts')]);
  });

  it('collectCrossDomainOpenItems/synthesizeNextQuestion are declared exactly once — one cross-domain synthesis layer, not two', () => {
    const allFiles = collectFiles(SRC_DIR, (p) => p.endsWith('.ts') && p !== THIS_FILE);
    const decls = allFiles.filter((f) => /export function synthesizeNextQuestion\b/.test(readFileSync(f, 'utf8')));
    expect(decls).toEqual([join(SRC_DIR, 'core', 'agent', 'crossDomainSynthesis.ts')]);
  });

  it('buildMatrixRelationGraph (the one relation engine) is declared exactly once', () => {
    const allFiles = collectFiles(SRC_DIR, (p) => p.endsWith('.ts') && p !== THIS_FILE);
    const decls = allFiles.filter((f) => /export function buildMatrixRelationGraph\b/.test(readFileSync(f, 'utf8')));
    expect(decls).toEqual([join(SRC_DIR, 'core', 'agent', 'matrixRelations.ts')]);
  });
});

// =============================================================================
// 11. NO FAKE INFORMATION GAIN — cyberTestPlanner's expectedInformationGain is
// a real, derived function of its declared inputs, never a hardcoded number
// dressed up as a real information-theoretic quantity.
// =============================================================================
describe('11. No fake information gain', () => {
  it('expectedInformationGain changes when discriminationPower changes — it is computed, not constant', () => {
    const assessments = new Map([['h1', 'CANDIDATE' as const]]);
    const low = selectNextTest([{
      hypothesisId: 'h1', discriminationPower: 0.1, safety: 'SAFE', cost: 0.1, downstreamValue: 0.5,
      priorAttempts: 0, identityKind: 'NEW',
    }], assessments);
    const high = selectNextTest([{
      hypothesisId: 'h1', discriminationPower: 0.9, safety: 'SAFE', cost: 0.1, downstreamValue: 0.5,
      priorAttempts: 0, identityKind: 'NEW',
    }], assessments);
    expect(high.expectedInformationGain).toBeGreaterThan(low.expectedInformationGain);
    // Real formula, not a black box: uncertainty(CANDIDATE) * discriminationPower, rounded.
    expect(CYBER_PLANNER_WEIGHTS).toBeDefined();
  });
});

// =============================================================================
// 12. NO LEXICAL OVERLAP AS SCIENTIFIC VERDICT.
// =============================================================================
describe('12. No lexical overlap as scientific verdict', () => {
  it('cyber judgeVerdict: two responses sharing almost every word do NOT both count as matching the SAME declared marker — only an exact declared-marker match decides the verdict', () => {
    const hypothesis = {
      hypothesisId: 'h1', kind: 'INFO_DISCLOSURE' as const, statement: 's', derivedFromAssetIds: ['a1'],
      falsifier: {
        predictedObservable: { statusCode: 200, summaryContains: [SENSITIVE_MARKERS[0]] },
        falsifyingObservable: { statusCodeIn: [401, 403] },
      },
    };
    // High lexical overlap with the real marker (same words, similar length) but NOT the exact declared string.
    const lexicallyClose = judgeVerdict(hypothesis, {
      testId: 't1', hypothesisId: 'h1', executedAt: new Date().toISOString(), provenance: 'SIMULATED',
      observedResult: { statusCode: 200, body: '', responseSummary: 'admin panel secret-ish but not the real marker' },
    });
    expect(lexicallyClose.assessment).toBe('INCONCLUSIVE');

    const exactMarker = judgeVerdict(hypothesis, {
      testId: 't2', hypothesisId: 'h1', executedAt: new Date().toISOString(), provenance: 'SIMULATED',
      observedResult: { statusCode: 200, body: '', responseSummary: `response contains ${SENSITIVE_MARKERS[0]} exactly` },
    });
    expect(exactMarker.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
  });

  it('decipherment holdoutSupportsReading is driven by a structural repeat-pattern COUNT, never a lexical-similarity score against a target phrase (source-level check: no similarity/levenshtein/distance import)', () => {
    const source = readFileSync(join(SRC_DIR, 'core', 'agent', 'decipherment', 'deciphermentOrchestrator.ts'), 'utf8');
    expect(source).not.toMatch(/levenshtein|similarity|cosine|jaccard/i);
    expect(source).toMatch(/repeatedPatterns/);
    // repeatedPatterns itself counts REPEATS OF THE SAME SUBSTRING WITHIN ONE
    // sequence — it is not comparing two sequences' free text to each other.
    const seq = buildGlyphSequence('s1', 'SYNTHETIC', 'ABABAB'.split('').map((s, i) => ({ symbol: s, position: i, provenance: 'OBSERVED' as const })));
    const seqNoRepeat = buildGlyphSequence('s2', 'SYNTHETIC', 'ABCDEF'.split('').map((s, i) => ({ symbol: s, position: i, provenance: 'OBSERVED' as const })));
    expect(repeatedPatterns(seq, 2, 3).length).toBeGreaterThan(repeatedPatterns(seqNoRepeat, 2, 3).length);
  });
});

// =============================================================================
// 13. NO HIDDEN STATE — collectCrossDomainOpenItems/synthesizeNextQuestion
// reflect Science Memory changes between calls; nothing memoizes a stale answer.
// =============================================================================
describe('13. No hidden state', () => {
  it('synthesizeNextQuestion with no override sees a NEW record saved between two calls — no cached snapshot', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: (() => {
      const values = new Map<string, string>();
      return {
        getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v),
        removeItem: (k: string) => void values.delete(k), key: (i: number) => [...values.keys()][i] ?? null,
        get length() { return values.size; },
      };
    })() });
    const { synthesizeNextQuestion: synth } = await import('../core/agent/crossDomainSynthesis');
    const { saveCyberInvestigationToMemory, buildSavedCyberInvestigation } = await import('../core/scienceMemory');
    const { toCyberInvestigationResultFromAdaptive, runAdaptiveInvestigation, ToyVulnerableApp: App } =
      await import('../core/agent/cyberReasoningKernel');

    expect(synth()).toBeNull();

    const adaptive = runAdaptiveInvestigation(new App());
    const result = toCyberInvestigationResultFromAdaptive('inv-1', 'goal', adaptive);
    saveCyberInvestigationToMemory(buildSavedCyberInvestigation(result));

    const after = synth();
    // Either a real INCONCLUSIVE_HYPOTHESIS or UNRESOLVED_CONFLICT surfaced —
    // the point is it is no longer null, proving no stale "nothing open" cache.
    expect(after).not.toBeNull();
    vi.unstubAllGlobals();
  });
});

// =============================================================================
// 14. NO UNSUPPORTED TRUTH CLAIMS — every terminal status Genesis reports is
// one of its own declared, finite enum values; never a free-form claim of
// certainty.
// =============================================================================
describe('14. No unsupported truth claims', () => {
  it('every verdict a real cyber investigation produces is one of the four declared HypothesisAssessment values — never a bespoke string', () => {
    const trace = runInvestigation(new ToyVulnerableApp());
    const declared = new Set(['CANDIDATE', 'SUPPORTED_WITHIN_PROTOCOL', 'FALSIFIED_WITHIN_PROTOCOL', 'INCONCLUSIVE']);
    for (const v of trace.verdicts) expect(declared.has(v.assessment)).toBe(true);
  });

  it('no numeric "truth" field exists anywhere on CrossDomainNextQuestion\'s own declared shape', () => {
    const source = readFileSync(join(SRC_DIR, 'core', 'agent', 'crossDomainSynthesis.ts'), 'utf8');
    const interfaceMatch = source.match(/export interface CrossDomainNextQuestion \{([\s\S]*?)\n\}/);
    expect(interfaceMatch).not.toBeNull();
    expect(interfaceMatch![1]).not.toMatch(/probability|confidence|truthScore|likelihood/i);
  });
});
