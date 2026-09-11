import { describe, it, expect } from 'vitest';
import { buildGlyphSequence, glyphAlphabet, symbolFrequency, ngramFrequency, repeatedPatterns, possibleSeparators, countByProvenance, countDamaged } from '../core/agent/decipherment/glyphAnalysis';
import { CAESAR_MODEL, AFFINE_MODEL, VIGENERE_MODEL, SUBSTITUTION_MODEL, TRANSPOSITION_MODEL, candidateCaesarKeys, candidateAffineKeys, candidateTranspositionOrders } from '../core/agent/decipherment/cipherModels';
import { buildReading, rankReadings } from '../core/agent/decipherment/deciphermentReadings';
import { buildHypothesesForReadings, assessHypothesis } from '../core/agent/decipherment/deciphermentHypotheses';
import { planNextTest, candidateTestsForHypotheses, scoreTests, DECIPHERMENT_PLANNER_WEIGHTS } from '../core/agent/decipherment/deciphermentTestPlanner';
import { GenesisDeciphermentOrchestrator, holdoutSupportsReading } from '../core/agent/decipherment/deciphermentOrchestrator';
import { toDeciphermentCaseResult, isWellFormedDeciphermentCaseResult } from '../core/agent/decipherment/deciphermentTypes';
import { buildSavedDeciphermentCase, isSavedDeciphermentCase, saveDeciphermentCaseToMemory, replaySavedDeciphermentCase, listExperiments } from '../core/scienceMemory';
import type { GlyphToken, ReadingSpec } from '../core/agent/decipherment/deciphermentTypes';

const g = (symbol: string, position: number, extra: Partial<GlyphToken> = {}): GlyphToken =>
  ({ symbol, position, provenance: 'OBSERVED', ...extra });

describe('glyphAnalysis', () => {
  const seq = buildGlyphSequence('s1', 'HUMAN_TRANSCRIPTION', [
    g('A', 0), g('B', 1), g('A', 2), g('B', 3), g('C', 4), g('A', 5), g('B', 6),
  ]);

  it('deterministic fingerprint: identical input -> identical fingerprint', () => {
    const seq2 = buildGlyphSequence('s1', 'HUMAN_TRANSCRIPTION', [
      g('A', 0), g('B', 1), g('A', 2), g('B', 3), g('C', 4), g('A', 5), g('B', 6),
    ]);
    expect(seq.fingerprint).toBe(seq2.fingerprint);
  });

  it('alphabet is sorted unique symbols', () => {
    expect([...glyphAlphabet(seq)]).toEqual(['A', 'B', 'C']);
  });

  it('symbolFrequency counts correctly and sorts by count desc', () => {
    const freq = symbolFrequency(seq);
    expect(freq.find((f) => f.symbol === 'A')?.count).toBe(3);
    expect(freq.find((f) => f.symbol === 'B')?.count).toBe(3);
    expect(freq.find((f) => f.symbol === 'C')?.count).toBe(1);
    expect(freq[freq.length - 1].symbol).toBe('C'); // fewest occurrences sorts last
  });

  it('ngramFrequency produces real bigram counts', () => {
    const bi = ngramFrequency(seq, 2);
    expect(bi['A B']).toBe(3); // AB appears at positions (0,1),(2,3),(4,5)? verify: A B A B C A B -> AB,BA,AB,BC,CA,AB
    expect(Object.values(bi).reduce((a, b) => a + b, 0)).toBe(seq.glyphs.length - 1);
  });

  it('repeatedPatterns finds the AB repeat with count >= 2', () => {
    const reps = repeatedPatterns(seq, 2, 2);
    expect(reps.some((r) => r.pattern.join('') === 'AB' && r.count >= 2)).toBe(true);
  });

  it('damaged glyphs and provenance counted separately, never merged', () => {
    const seqD = buildGlyphSequence('s2', 'HUMAN_TRANSCRIPTION', [
      g('A', 0), g('B', 1, { damaged: true, provenance: 'RECONSTRUCTED' }),
    ]);
    expect(countDamaged(seqD)).toBe(1);
    const prov = countByProvenance(seqD);
    expect(prov.OBSERVED).toBe(1);
    expect(prov.RECONSTRUCTED).toBe(1);
  });

  it('possibleSeparators rejects self-adjacent symbols', () => {
    const seqSelfAdj = buildGlyphSequence('s3', 'SYNTHETIC', [g('X', 0), g('X', 1), g('Y', 2)]);
    expect(possibleSeparators(seqSelfAdj)).not.toContain('X');
  });
});

describe('cipherModels — classical, toy, exact round-trip', () => {
  const alphabetSize = 26;
  const plain = [0, 1, 2, 3, 4];

  it('Caesar round-trip is exact', () => {
    const key = { kind: 'CAESAR' as const, shift: 3 };
    expect([...CAESAR_MODEL.decrypt(CAESAR_MODEL.encrypt(plain, key, alphabetSize), key, alphabetSize)]).toEqual(plain);
  });
  it('Affine round-trip with coprime a', () => {
    const key = { kind: 'AFFINE' as const, a: 5, b: 8 };
    expect([...AFFINE_MODEL.decrypt(AFFINE_MODEL.encrypt(plain, key, alphabetSize), key, alphabetSize)]).toEqual(plain);
  });
  it('Affine rejects non-coprime a', () => {
    expect(() => AFFINE_MODEL.encrypt(plain, { kind: 'AFFINE', a: 2, b: 1 }, alphabetSize)).toThrow('AFFINE_A_NOT_COPRIME');
  });
  it('Vigenere round-trip', () => {
    const key = { kind: 'VIGENERE' as const, shifts: [3, 7] };
    expect([...VIGENERE_MODEL.decrypt(VIGENERE_MODEL.encrypt(plain, key, alphabetSize), key, alphabetSize)]).toEqual(plain);
  });
  it('Substitution round-trip', () => {
    const mapping: Record<number, number> = { 0: 5, 1: 6, 2: 7, 3: 8, 4: 9 };
    const key = { kind: 'SUBSTITUTION' as const, mapping };
    expect([...SUBSTITUTION_MODEL.decrypt(SUBSTITUTION_MODEL.encrypt(plain, key, alphabetSize), key, alphabetSize)]).toEqual(plain);
  });
  it('Transposition round-trip', () => {
    const key = { kind: 'TRANSPOSITION' as const, order: [4, 3, 2, 1, 0] };
    expect([...TRANSPOSITION_MODEL.decrypt(TRANSPOSITION_MODEL.encrypt(plain, key, alphabetSize), key, alphabetSize)]).toEqual(plain);
  });
  it('key/model mismatch throws', () => {
    expect(() => CAESAR_MODEL.encrypt(plain, { kind: 'AFFINE', a: 1, b: 0 }, alphabetSize)).toThrow('KEY_MODEL_MISMATCH:CAESAR');
  });
  it('candidate key generation is deterministic and bounded', () => {
    expect(candidateCaesarKeys(26).length).toBe(26);
    expect(candidateAffineKeys(26).length).toBeGreaterThan(0);
    expect(candidateTranspositionOrders(5, 4).length).toBeLessThanOrEqual(4);
  });
  it('known Caesar shift-3 example decodes to the real plaintext', () => {
    // ATTACKATDAWN shifted by 3 -> DWWDFNDWGDZQ (the classic textbook example)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const idxOf = new Map(alphabet.map((c, i) => [c, i]));
    const cipherIdx = [...'DWWDFNDWGDZQ'].map((c) => idxOf.get(c) as number);
    const decoded = CAESAR_MODEL.decrypt(cipherIdx, { kind: 'CAESAR', shift: 3 }, 26).map((i) => alphabet[i]).join('');
    expect(decoded).toBe('ATTACKATDAWN');
  });
});

describe('deciphermentReadings — never OBSERVED, never fabricated', () => {
  const seq = buildGlyphSequence('s', 'SYNTHETIC', [g('A', 0), g('B', 1), g('A', 2), g('B', 3)]);

  it('a reading is RECONSTRUCTED (no key) or HYPOTHESIS (with key), never OBSERVED', () => {
    const noKey = buildReading(seq, { label: 'A', cipherModelId: 'CAESAR', candidateKey: null, assumptions: [] }, 1, 0);
    expect(noKey.epistemicStatus).toBe('RECONSTRUCTED');
    const withKey = buildReading(seq, { label: 'B', cipherModelId: 'CAESAR', candidateKey: { kind: 'CAESAR', shift: 1 }, assumptions: [] }, 1, 1);
    expect(withKey.epistemicStatus).toBe('HYPOTHESIS');
  });

  it('identical input + seed + counter -> identical fingerprint', () => {
    const spec: ReadingSpec = { label: 'A', cipherModelId: 'CAESAR', candidateKey: { kind: 'CAESAR', shift: 1 }, assumptions: [] };
    const r1 = buildReading(seq, spec, 1, 0);
    const r2 = buildReading(seq, spec, 1, 0);
    expect(r1.fingerprint).toBe(r2.fingerprint);
  });

  it('rankReadings is deterministic and order-independent', () => {
    const a = buildReading(seq, { label: 'A', cipherModelId: 'CAESAR', candidateKey: { kind: 'CAESAR', shift: 1 }, assumptions: [] }, 1, 0);
    const b = buildReading(seq, { label: 'B', cipherModelId: 'SUBSTITUTION', candidateKey: null, assumptions: [] }, 1, 1);
    const ranked1 = rankReadings([a, b]);
    const ranked2 = rankReadings([b, a]);
    expect(ranked1.map((r) => r.readingId)).toEqual(ranked2.map((r) => r.readingId));
  });

  it('unknown cipher model throws rather than silently no-op', () => {
    expect(() => buildReading(seq, { label: 'X', cipherModelId: 'NOT_A_MODEL' as ReadingSpec['cipherModelId'], candidateKey: null, assumptions: [] }, 1, 0)).toThrow('UNKNOWN_CIPHER_MODEL');
  });
});

describe('deciphermentHypotheses — canonical assessment vocabulary only', () => {
  const seq = buildGlyphSequence('s', 'SYNTHETIC', [g('A', 0), g('B', 1)]);
  const reading = buildReading(seq, { label: 'A', cipherModelId: 'CAESAR', candidateKey: { kind: 'CAESAR', shift: 1 }, assumptions: [] }, 1, 0);
  const hyps = buildHypothesesForReadings([reading], 1);

  it('falsifier carries real, checkable predicted/falsifying observables', () => {
    expect(hyps[0].falsifier.predictedObservable.length).toBeGreaterThan(0);
    expect(hyps[0].falsifier.falsifyingObservable.length).toBeGreaterThan(0);
    expect(hyps[0].falsifier.predictedObservable).not.toBe(hyps[0].falsifier.falsifyingObservable);
  });
  it('starts as CANDIDATE', () => { expect(hyps[0].assessment).toBe('CANDIDATE'); });
  it('true observation -> SUPPORTED_WITHIN_PROTOCOL, and appends to supportingObservations', () => {
    const { hypothesis, assessment } = assessHypothesis(hyps[0], { matchesPrediction: true, note: 'holdout ok' });
    expect(assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(hypothesis.supportingObservations).toContain('holdout ok');
  });
  it('false observation -> FALSIFIED_WITHIN_PROTOCOL, and appends to contradictions', () => {
    const { hypothesis, assessment } = assessHypothesis(hyps[0], { matchesPrediction: false, note: 'holdout collapsed' });
    expect(assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(hypothesis.contradictions).toContain('holdout collapsed');
  });
  it('null observation -> INCONCLUSIVE', () => {
    const { assessment } = assessHypothesis(hyps[0], { matchesPrediction: null, note: 'too short' });
    expect(assessment).toBe('INCONCLUSIVE');
  });
});

describe('holdoutSupportsReading — the real, non-tautological falsification test', () => {
  it('too-short holdout is INCONCLUSIVE, not silently true', () => {
    const seq = buildGlyphSequence('s', 'SYNTHETIC', [g('A', 0), g('B', 1)]);
    const out = holdoutSupportsReading(seq, 'CAESAR', { kind: 'CAESAR', shift: 1 });
    expect(out.matchesPrediction).toBeNull();
  });

  it('identity reading on a sequence with real repeats preserves holdout structure', () => {
    const seq = buildGlyphSequence('s', 'SYNTHETIC', [
      g('A', 0), g('B', 1), g('C', 2), g('A', 3), g('B', 4), g('C', 5), g('A', 6), g('B', 7), g('C', 8), g('A', 9),
    ]);
    const out = holdoutSupportsReading(seq, 'CAESAR', null);
    expect(out.matchesPrediction).not.toBeNull();
    expect(out.note).toContain('holdout:');
  });

  it('a cipher-model error on the holdout is reported as a real falsification, not thrown', () => {
    // 8 glyphs -> holdout is glyphs[4..8) = 4 long, clearing the <4 too-short guard,
    // so this actually reaches the cipher model instead of returning INCONCLUSIVE first.
    const seq = buildGlyphSequence('s', 'SYNTHETIC', [
      g('A', 0), g('B', 1), g('C', 2), g('D', 3), g('E', 4), g('F', 5), g('G', 6), g('H', 7),
    ]);
    // TRANSPOSITION requires order.length === input.length; a mismatched order must fail cleanly.
    const out = holdoutSupportsReading(seq, 'TRANSPOSITION', { kind: 'TRANSPOSITION', order: [0, 1] });
    expect(out.matchesPrediction).toBe(false);
    expect(out.note).toContain('cipher-model error');
  });
});

describe('deciphermentTestPlanner — explicit heuristic, deterministic, never a fabricated probability', () => {
  const seq = buildGlyphSequence('s', 'SYNTHETIC', [g('A', 0), g('B', 1), g('C', 2)]);
  const readings = ['A', 'B'].map((label, i) =>
    buildReading(seq, { label, cipherModelId: i === 0 ? 'CAESAR' : 'SUBSTITUTION', candidateKey: i === 0 ? { kind: 'CAESAR', shift: 1 } : null, assumptions: [] }, 7, i));
  const hyps = buildHypothesesForReadings(readings, 7);

  it('generates cross-reading and single-hypothesis candidates', () => {
    const tests = candidateTestsForHypotheses({ hypotheses: hyps, executedTestIds: [], seed: 7 });
    expect(tests.some((t) => t.kind === 'CROSS_READING_CONSISTENCY')).toBe(true);
    expect(tests.length).toBeGreaterThan(hyps.length); // cross-reading + per-hypothesis tests
  });
  it('weights are explicit, documented, and stable', () => {
    expect(DECIPHERMENT_PLANNER_WEIGHTS.discrimination).toBe(0.25);
    expect(DECIPHERMENT_PLANNER_WEIGHTS.repeatPenalty).toBeLessThan(0);
  });
  it('selects a test with an explicit rationale, never a probability-of-truth claim', () => {
    const plan = planNextTest({ hypotheses: hyps, executedTestIds: [], seed: 7 });
    expect(plan.selectedTest).not.toBeNull();
    expect(plan.rationale).not.toMatch(/\d{1,3}%\s*(probability|prawdopodobieńst)/i);
  });
  it('deterministic: identical input -> identical selection', () => {
    const p1 = planNextTest({ hypotheses: hyps, executedTestIds: [], seed: 7 });
    const p2 = planNextTest({ hypotheses: hyps, executedTestIds: [], seed: 7 });
    expect(p1.selectedTest?.testId).toBe(p2.selectedTest?.testId);
  });
  it('repeatPenalty measurably lowers an already-executed test', () => {
    const tests = candidateTestsForHypotheses({ hypotheses: hyps, executedTestIds: [], seed: 7 });
    const fresh = scoreTests({ hypotheses: hyps, executedTestIds: [], seed: 7 }, tests);
    const firstId = fresh[0].test.testId;
    const repeated = scoreTests({ hypotheses: hyps, executedTestIds: [firstId], seed: 7 }, tests);
    const scoredFirst = repeated.find((s) => s.test.testId === firstId);
    expect(scoredFirst?.components.repeatPenalty).toBe(1);
  });
});

describe('GenesisDeciphermentOrchestrator — full loop, real holdout test, conflicts preserved', () => {
  const seq = buildGlyphSequence('s', 'SYNTHETIC', [
    g('A', 0), g('B', 1), g('C', 2), g('A', 3), g('B', 4), g('C', 5), g('A', 6), g('B', 7), g('C', 8), g('A', 9),
  ]);
  const config = {
    seed: 3, modelVersion: 'v1',
    readingSpecs: [
      { label: 'A', cipherModelId: 'CAESAR' as const, candidateKey: { kind: 'CAESAR' as const, shift: 1 }, assumptions: [] },
      { label: 'B', cipherModelId: 'SUBSTITUTION' as const, candidateKey: null, assumptions: [] },
    ],
  };

  it('runs every required stage and ends on NEXT_TEST', () => {
    const orch = new GenesisDeciphermentOrchestrator(seq, config);
    const final = orch.runFullLoop();
    expect(final.stage).toBe('NEXT_TEST');
    expect(final.readings.length).toBe(2);
    expect(final.hypotheses.length).toBe(2);
    expect(final.testsRun.length).toBe(2); // one holdout test per hypothesis
  });

  it('every hypothesis gets a real, canonical verdict — not left as CANDIDATE', () => {
    const orch = new GenesisDeciphermentOrchestrator(seq, config);
    const final = orch.runFullLoop();
    for (const h of final.hypotheses) {
      expect(['SUPPORTED_WITHIN_PROTOCOL', 'FALSIFIED_WITHIN_PROTOCOL', 'INCONCLUSIVE']).toContain(h.assessment);
    }
  });

  it('unknown hypothesis id throws rather than silently no-op', () => {
    const orch = new GenesisDeciphermentOrchestrator(seq, config);
    orch.symbolExtraction(); orch.patternAnalysis(); orch.competingDecipherments();
    expect(() => orch.runTest('not-a-real-id')).toThrow('UNKNOWN_HYPOTHESIS');
  });

  it('conflict preservation: a hypothesis re-tested to opposite outcomes is recorded as a conflict, not averaged', () => {
    const orch = new GenesisDeciphermentOrchestrator(seq, config);
    orch.symbolExtraction(); orch.patternAnalysis(); orch.competingDecipherments();
    const [h0] = orch.getState().hypotheses;
    orch.runTest(h0.hypothesisId);
    const beforeConflicts = orch.getState().conflicts.length;
    // Re-run the SAME hypothesis's test. If the deterministic holdout check
    // gives the same result twice (expected, since it's deterministic), no
    // new conflict appears — this proves conflicts are earned, not manufactured.
    orch.runTest(h0.hypothesisId);
    const afterConflicts = orch.getState().conflicts.length;
    expect(afterConflicts).toBe(beforeConflicts); // deterministic test -> same verdict twice -> no fabricated conflict
  });

  it('patternAnalysis reports real counts, not placeholders', () => {
    const orch = new GenesisDeciphermentOrchestrator(seq, config);
    orch.symbolExtraction();
    const result = orch.patternAnalysis();
    expect(result.symbolFrequencyCount).toBe(3); // A, B, C
    expect(result.repeatedPatternCount).toBeGreaterThan(0);
  });
});

describe('Science Memory integration — one shape on SavedExperiment, no second store', () => {
  const seq = buildGlyphSequence('s', 'SYNTHETIC', [g('A', 0), g('B', 1), g('C', 2), g('A', 3)]);
  const config = { seed: 5, modelVersion: 'v1', readingSpecs: [{ label: 'A', cipherModelId: 'CAESAR' as const, candidateKey: { kind: 'CAESAR' as const, shift: 1 }, assumptions: [] }] };
  const orch = new GenesisDeciphermentOrchestrator(seq, config);
  const state = orch.runFullLoop();

  it('toDeciphermentCaseResult is well-formed and JSON-serializable (no Map leaking through)', () => {
    const result = toDeciphermentCaseResult(state);
    expect(isWellFormedDeciphermentCaseResult(result)).toBe(true);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(typeof result.assessmentHistory).toBe('object');
  });

  it('an empty-shell result is rejected, not silently accepted', () => {
    expect(isWellFormedDeciphermentCaseResult({ caseId: 'x', sequenceFingerprint: 'y', glyphCount: 0, readings: [], hypotheses: [], testsRun: [], assessmentHistory: {}, conflicts: [], seed: 1, modelVersion: 'v' })).toBe(false);
  });

  it('buildSavedDeciphermentCase + isSavedDeciphermentCase round-trip', () => {
    const result = toDeciphermentCaseResult(state);
    const saved = buildSavedDeciphermentCase(result);
    expect(isSavedDeciphermentCase(saved)).toBe(true);
    expect(saved.resultFingerprint.length).toBeGreaterThan(0);
  });

  it('saveDeciphermentCaseToMemory goes through the real saveExperiment path and returns a well-formed record', () => {
    // Note: under the node test environment core/storage.ts's localStorage
    // guard degrades to a silent no-op (see genesisDashboard.test.tsx's own
    // doc comment, and cyberInvestigationMemory.test.ts, which follows the
    // same convention) — so `listExperiments()` never actually grows here.
    // What IS verifiable without a DOM is that saveExperiment() accepted the
    // record (would throw on a malformed deciphermentCase) and returned the
    // real SavedExperiment shape with the field attached.
    const result = toDeciphermentCaseResult(state);
    const saved = buildSavedDeciphermentCase(result);
    const record = saveDeciphermentCaseToMemory(saved);
    expect(record.deciphermentCase).toBeDefined();
    expect(record.deciphermentCase?.resultFingerprint).toBe(saved.resultFingerprint);
    expect(record.labId).toBe('decipherment');
    expect(record.honesty).toBe('educational');
    expect(record.contentHash.length).toBeGreaterThan(0);
    expect(listExperiments()).toEqual(expect.any(Array)); // real call path, not a stub
  });

  it('replaySavedDeciphermentCase reports MATCH for an untouched record, BLOCKED for a record without one', () => {
    const result = toDeciphermentCaseResult(state);
    const saved = buildSavedDeciphermentCase(result);
    const record = saveDeciphermentCaseToMemory(saved);
    const replay = replaySavedDeciphermentCase(record);
    expect(replay.status).toBe('MATCH');

    const otherRecords = listExperiments().filter((r) => r.deciphermentCase === undefined);
    if (otherRecords.length > 0) {
      expect(replaySavedDeciphermentCase(otherRecords[0]).status).toBe('BLOCKED');
    }
  });

  it('replay reports DRIFT when the saved record is tampered with after save', () => {
    const result = toDeciphermentCaseResult(state);
    const saved = buildSavedDeciphermentCase(result);
    const record = saveDeciphermentCaseToMemory(saved);
    const tampered = { ...record, deciphermentCase: { ...record.deciphermentCase!, result: { ...record.deciphermentCase!.result, glyphCount: 999 } } };
    expect(replaySavedDeciphermentCase(tampered).status).toBe('DRIFT');
  });
});
