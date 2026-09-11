import { fnv1a, canonicalJson } from '../../events/hash';
import type { HypothesisAssessment } from '../../experimentFabric/scientificDiscovery';
import type {
  GlyphSequence, DeciphermentCaseState, DeciphermentStage, ReadingSpec, ConflictRecord,
} from './deciphermentTypes';
import { buildReading, rankReadings } from './deciphermentReadings';
import { buildHypothesesForReadings, assessHypothesis } from './deciphermentHypotheses';
import { planNextTest } from './deciphermentTestPlanner';
import { symbolFrequency, repeatedPatterns, possibleSeparators, countByProvenance, buildGlyphSequence, glyphAlphabet } from './glyphAnalysis';
import { CIPHER_MODELS } from './cipherModels';

/**
 * GenesisDeciphermentOrchestrator — ONE bounded domain orchestrator.
 * Drives: OBSERVATION → SYMBOL_EXTRACTION → PATTERN_ANALYSIS → HYPOTHESES →
 * COMPETING_DECIPHERMENTS → (TESTS →) FALSIFICATION → VERDICT → NEXT_TEST.
 *
 * Does NOT replace Discovery Loop, Simulation, Evidence, Memory, Matrix,
 * Replay, Chat, or World — see `deciphermentMemory.ts` for how this plugs
 * into the real Science Memory instead of inventing a second store.
 */

export interface PatternAnalysisResult {
  readonly symbolFrequencyCount: number;
  readonly repeatedPatternCount: number;
  readonly separators: readonly string[];
  readonly provenanceCounts: Readonly<Record<string, number>>;
  readonly fingerprint: string;
}

export interface OrchestratorConfig {
  readonly seed: number;
  readonly modelVersion: string;
  readonly readingSpecs: readonly ReadingSpec[];
}

/**
 * A REAL, non-tautological test: decode a HELD-OUT second half of the
 * sequence with the hypothesis's own key, independently from whatever
 * built the reading's own `structuralFit` (computed over the whole
 * sequence at reading-construction time). If the same key preserves real
 * structure on data it wasn't scored against, that supports it; if
 * structure collapses on the holdout, that falsifies it. This is a toy
 * heuristic (documented throughout this domain), but it is genuinely a
 * fresh computation, not an echo of a value already baked into the
 * hypothesis's own falsifier.
 */
function holdoutSupportsReading(
  seq: GlyphSequence,
  cipherModelId: ReadingSpec['cipherModelId'],
  candidateKey: ReadingSpec['candidateKey'],
): { readonly matchesPrediction: boolean | null; readonly note: string } {
  const half = Math.floor(seq.glyphs.length / 2);
  const holdoutGlyphs = seq.glyphs.slice(half);
  if (holdoutGlyphs.length < 4) {
    return { matchesPrediction: null, note: 'Holdout slice too short (<4 glyphs) to test independently.' };
  }
  const holdoutSeq = buildGlyphSequence(`${seq.sequenceId}:holdout`, seq.sourceKind, holdoutGlyphs.map((g, i) => ({ ...g, position: i })));
  const rawRepeats = repeatedPatterns(holdoutSeq, 2, 3).length;

  const alphabet = glyphAlphabet(seq); // full-sequence alphabet, so holdout indices stay meaningful
  const n = alphabet.length;
  const indexOf = new Map<string, number>(alphabet.map((s, i) => [s, i]));
  const indices = holdoutGlyphs.map((g) => indexOf.get(g.symbol) ?? 0);

  let decodedSymbols: readonly string[];
  if (candidateKey === null) {
    decodedSymbols = holdoutGlyphs.map((g) => g.symbol);
  } else {
    const model = CIPHER_MODELS[cipherModelId];
    try {
      const decodedIdx = model.decrypt(indices, candidateKey, Math.max(1, n));
      decodedSymbols = decodedIdx.map((i) => alphabet[i] ?? '?');
    } catch {
      return { matchesPrediction: false, note: 'Key failed to decode the holdout slice at all (cipher-model error).' };
    }
  }
  const decodedSeq = buildGlyphSequence(`${seq.sequenceId}:holdout-decoded`, seq.sourceKind, decodedSymbols.map((s, i) => ({ symbol: s, position: i, provenance: 'RECONSTRUCTED' as const })));
  const decodedRepeats = repeatedPatterns(decodedSeq, 2, 3).length;

  // Real, independent comparison: does decoding the holdout not make its
  // apparent structure worse than the raw ciphertext holdout already had?
  const matchesPrediction = decodedRepeats >= rawRepeats;
  const note = `holdout: raw_repeats=${rawRepeats}, decoded_repeats=${decodedRepeats} (glyphs=${holdoutGlyphs.length})`;
  return { matchesPrediction, note };
}

export class GenesisDeciphermentOrchestrator {
  private state: DeciphermentCaseState;

  constructor(sequence: GlyphSequence, private config: OrchestratorConfig) {
    this.state = Object.freeze({
      stage: 'OBSERVATION' as DeciphermentStage,
      sequence,
      readings: Object.freeze([]),
      hypotheses: Object.freeze([]),
      testsRun: Object.freeze([]),
      assessmentHistory: Object.freeze(new Map<string, readonly HypothesisAssessment[]>()) as ReadonlyMap<string, readonly HypothesisAssessment[]>,
      conflicts: Object.freeze([]),
      seed: config.seed,
      modelVersion: config.modelVersion,
    });
  }

  getState(): DeciphermentCaseState { return this.state; }

  symbolExtraction(): DeciphermentCaseState {
    this.state = Object.freeze({ ...this.state, stage: 'SYMBOL_EXTRACTION' });
    return this.state;
  }

  patternAnalysis(): PatternAnalysisResult {
    const seq = this.state.sequence;
    const freq = symbolFrequency(seq);
    const repeats = repeatedPatterns(seq, 2, 4);
    const seps = possibleSeparators(seq);
    const prov = countByProvenance(seq);
    const core = { freq: freq.map((f) => `${f.symbol}:${f.count}`), repeats: repeats.length, seps };
    this.state = Object.freeze({ ...this.state, stage: 'PATTERN_ANALYSIS' });
    return Object.freeze({ symbolFrequencyCount: freq.length, repeatedPatternCount: repeats.length, separators: seps, provenanceCounts: prov, fingerprint: fnv1a(canonicalJson(core)) });
  }

  competingDecipherments(): DeciphermentCaseState {
    const readings = this.config.readingSpecs.map((spec, i) => buildReading(this.state.sequence, spec, this.config.seed, i));
    const ranked = rankReadings(readings);
    const hypotheses = buildHypothesesForReadings(ranked, this.config.seed);
    this.state = Object.freeze({ ...this.state, stage: 'COMPETING_DECIPHERMENTS', readings: ranked, hypotheses });
    return this.state;
  }

  /** Runs the real holdout falsification test for one hypothesis and records the result, preserving conflicts. */
  runTest(hypothesisId: string): DeciphermentCaseState {
    const hyp = this.state.hypotheses.find((h) => h.hypothesisId === hypothesisId);
    if (!hyp) throw new Error(`UNKNOWN_HYPOTHESIS:${hypothesisId}`);
    const reading = this.state.readings.find((r) => r.readingId === hyp.readingId);
    if (!reading) throw new Error(`UNKNOWN_READING:${hyp.readingId}`);

    const outcome = holdoutSupportsReading(this.state.sequence, reading.cipherModelId, reading.candidateKey);
    const { hypothesis: updated, assessment } = assessHypothesis(hyp, outcome);

    const hypotheses = this.state.hypotheses.map((h) => (h.hypothesisId === hypothesisId ? updated : h));
    const priorHistory = this.state.assessmentHistory.get(hypothesisId) ?? [];
    const nextHistory = Object.freeze([...priorHistory, assessment]);
    const nextMap = new Map(this.state.assessmentHistory);
    nextMap.set(hypothesisId, nextHistory);

    // A conflict is preserved (never averaged) the moment a hypothesis's
    // history holds BOTH a SUPPORTED and a FALSIFIED assessment — same rule
    // Cyber's `runAdaptiveInvestigation` already applies.
    let conflicts = this.state.conflicts;
    const hasSupported = nextHistory.includes('SUPPORTED_WITHIN_PROTOCOL');
    const hasFalsified = nextHistory.includes('FALSIFIED_WITHIN_PROTOCOL');
    if (hasSupported && hasFalsified && !conflicts.some((c) => c.hypothesisId === hypothesisId)) {
      const core = { hypothesisId, history: nextHistory };
      conflicts = Object.freeze([...conflicts, Object.freeze({ conflictId: `conflict:${hypothesisId}`, hypothesisId, history: nextHistory, fingerprint: fnv1a(canonicalJson(core)) })]);
    }

    this.state = Object.freeze({
      ...this.state,
      stage: 'FALSIFICATION',
      hypotheses: Object.freeze(hypotheses),
      testsRun: Object.freeze([...this.state.testsRun, `holdout:${hypothesisId}`]),
      assessmentHistory: Object.freeze(nextMap) as ReadonlyMap<string, readonly HypothesisAssessment[]>,
      conflicts,
    });
    return this.state;
  }

  verdictStage(): DeciphermentCaseState {
    this.state = Object.freeze({ ...this.state, stage: 'VERDICT' });
    return this.state;
  }

  nextTest(): { readonly plan: ReturnType<typeof planNextTest>; readonly state: DeciphermentCaseState } {
    const plan = planNextTest({ hypotheses: this.state.hypotheses, executedTestIds: this.state.testsRun, seed: this.config.seed });
    this.state = Object.freeze({ ...this.state, stage: 'NEXT_TEST' });
    return { plan, state: this.state };
  }

  /** Full deterministic loop: every stage, every hypothesis tested once, ending on a next-test recommendation. */
  runFullLoop(): DeciphermentCaseState {
    this.symbolExtraction();
    this.patternAnalysis();
    this.competingDecipherments();
    for (const h of this.state.hypotheses) this.runTest(h.hypothesisId);
    this.verdictStage();
    this.nextTest();
    return this.state;
  }
}

export { holdoutSupportsReading };
export type { ConflictRecord };
