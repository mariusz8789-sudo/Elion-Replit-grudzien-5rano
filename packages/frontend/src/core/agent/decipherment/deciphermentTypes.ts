import type { HypothesisAssessment } from '../../experimentFabric/scientificDiscovery';

/**
 * GENESIS DECIPHERMENT LAB — types.
 *
 * A bounded scientific domain: classical cryptanalysis, unknown-symbol
 * analysis, and structural ancient-script decipherment. It reuses Genesis's
 * real falsification vocabulary (`HypothesisAssessment`, imported here, never
 * redeclared) and plugs into the real Science Memory / Evidence / Matrix /
 * Replay layers via `scienceMemory.ts`'s `buildSavedDeciphermentCase`/
 * `saveDeciphermentCaseToMemory` (the ninth investigation shape, same seam
 * every other domain uses) — there is no second Evidence store, no second
 * Replay engine, no second Matrix, no second orchestrator beyond this one
 * bounded domain's own loop driver.
 *
 * NO OCR. Verified against the full repo: no image-to-text pipeline exists
 * anywhere in Genesis (`uploadKnowledgeMaterial` accepts only
 * text/plain|text/markdown|application/pdf|application/json). So the input
 * boundary here is an ALREADY-SEGMENTED glyph sequence — a human or a future
 * real OCR seam produces the tokens. `LOAD_ARTEFACT` loads that structure,
 * never an image.
 */

/** Where a glyph value actually came from — never conflated across these. */
export type GlyphProvenance =
  | 'OBSERVED'        // recorded exactly as given in the structured sequence
  | 'RECONSTRUCTED'   // a damaged/missing glyph filled in by a stated rule — NEVER "OBSERVED"
  | 'INFERRED'        // read from surrounding pattern/context, not given directly
  | 'HYPOTHESIS'      // posited by one candidate reading, untested
  | 'SYNTHETIC';      // produced by a toy/synthetic generator for testing this module itself

export interface GlyphToken {
  readonly symbol: string;
  readonly damaged?: boolean;
  readonly variantOf?: string | null;
  readonly position: number;
  readonly provenance: GlyphProvenance;
}

export interface GlyphSequence {
  readonly sequenceId: string;
  readonly sourceKind: 'HUMAN_TRANSCRIPTION' | 'STRUCTURAL_IMPORT' | 'SYNTHETIC' | 'FUTURE_OCR_SEAM';
  readonly glyphs: readonly GlyphToken[];
  readonly fingerprint: string;
}

export type CipherModelId = 'CAESAR' | 'AFFINE' | 'VIGENERE' | 'SUBSTITUTION' | 'TRANSPOSITION';

export type CipherKey =
  | { readonly kind: 'CAESAR'; readonly shift: number }
  | { readonly kind: 'AFFINE'; readonly a: number; readonly b: number }
  | { readonly kind: 'VIGENERE'; readonly shifts: readonly number[] }
  | { readonly kind: 'SUBSTITUTION'; readonly mapping: Readonly<Record<number, number>> }
  | { readonly kind: 'TRANSPOSITION'; readonly order: readonly number[] };

export interface CipherModel {
  readonly modelId: CipherModelId;
  readonly assumptions: readonly string[];
  readonly encrypt: (indices: readonly number[], key: CipherKey, alphabetSize: number) => readonly number[];
  readonly decrypt: (indices: readonly number[], key: CipherKey, alphabetSize: number) => readonly number[];
}

/** One candidate interpretation of the sequence. Never OBSERVED, never EVIDENCE — see deciphermentReadings.ts. */
export interface DeciphermentReading {
  readonly readingId: string;
  readonly label: string;
  readonly cipherModelId: CipherModelId;
  readonly candidateKey: CipherKey | null;
  readonly mapping: Readonly<Record<string, string>>;
  readonly output: string;
  readonly matchedGlyphs: number;
  readonly unresolvedGlyphs: number;
  readonly reconstructedGlyphs: number;
  readonly structuralFit: number;
  readonly linguisticFit: number;
  readonly assumptions: readonly string[];
  readonly epistemicStatus: GlyphProvenance;
  readonly fingerprint: string;
}

export type DeciphermentTestKind =
  | 'FREQUENCY_MATCH'
  | 'CRIB_ALIGNMENT'
  | 'NGRAM_COHERENCE'
  | 'POSITIONAL_CHECK'
  | 'REPEAT_STRUCTURE'
  | 'CROSS_READING_CONSISTENCY';

export interface DeciphermentFalsifier {
  readonly predictedObservable: string;
  readonly falsifyingObservable: string;
  readonly testKind: DeciphermentTestKind;
}

export interface DeciphermentHypothesis {
  readonly hypothesisId: string;
  readonly readingId: string;
  readonly statement: string;
  readonly falsifier: DeciphermentFalsifier;
  readonly supportingObservations: readonly string[];
  readonly contradictions: readonly string[];
  readonly assumptions: readonly string[];
  readonly unresolvedSymbols: readonly string[];
  readonly assessment: HypothesisAssessment;
  readonly fingerprint: string;
}

export interface DeciphermentTest {
  readonly testId: string;
  readonly hypothesisIds: readonly string[];
  readonly kind: DeciphermentTestKind;
  readonly description: string;
  readonly expectedObservation: string;
  readonly falsifyingObservation: string;
  readonly cost: number;
  readonly safety: number;
  readonly discriminationPower: number;
  readonly fingerprint: string;
}

export interface ScoredTest {
  readonly test: DeciphermentTest;
  readonly score: number;
  readonly components: {
    readonly uncertainty: number;
    readonly discrimination: number;
    readonly downstream: number;
    readonly safety: number;
    readonly cost: number;
    readonly repeatPenalty: number;
  };
}

export interface DeciphermentTestPlan {
  readonly selectedTest: DeciphermentTest | null;
  readonly allScored: readonly ScoredTest[];
  readonly weights: Readonly<Record<string, number>>;
  readonly rationale: string;
}

export interface ConflictRecord {
  readonly conflictId: string;
  readonly hypothesisId: string;
  readonly history: readonly HypothesisAssessment[];
  readonly fingerprint: string;
}

export type DeciphermentStage =
  | 'OBSERVATION' | 'SYMBOL_EXTRACTION' | 'PATTERN_ANALYSIS' | 'HYPOTHESES'
  | 'COMPETING_DECIPHERMENTS' | 'TESTS' | 'FALSIFICATION' | 'VERDICT' | 'NEXT_TEST';

export interface DeciphermentCaseState {
  readonly stage: DeciphermentStage;
  readonly sequence: GlyphSequence;
  readonly readings: readonly DeciphermentReading[];
  readonly hypotheses: readonly DeciphermentHypothesis[];
  readonly testsRun: readonly string[];
  readonly assessmentHistory: ReadonlyMap<string, readonly HypothesisAssessment[]>;
  readonly conflicts: readonly ConflictRecord[];
  readonly seed: number;
  readonly modelVersion: string;
}

export interface ReadingSpec {
  readonly label: string;
  readonly cipherModelId: CipherModelId;
  readonly candidateKey: CipherKey | null;
  readonly assumptions: readonly string[];
}

/**
 * JSON-serializable snapshot of a finished case. `DeciphermentCaseState`
 * (above) is the live orchestrator state — it carries a `ReadonlyMap`, which
 * does not round-trip through `JSON.stringify`. This is what actually gets
 * persisted, the same relationship `CyberInvestigationResult` has to
 * `runAdaptiveInvestigation`'s live `AdaptiveInvestigationResult`.
 */
export interface DeciphermentCaseResult {
  readonly caseId: string;
  readonly sequenceFingerprint: string;
  readonly sourceKind: GlyphSequence['sourceKind'];
  readonly glyphCount: number;
  readonly readings: readonly DeciphermentReading[];
  readonly hypotheses: readonly DeciphermentHypothesis[];
  readonly testsRun: readonly string[];
  readonly assessmentHistory: Readonly<Record<string, readonly HypothesisAssessment[]>>;
  readonly conflicts: readonly ConflictRecord[];
  readonly seed: number;
  readonly modelVersion: string;
}

export function toDeciphermentCaseResult(state: DeciphermentCaseState): DeciphermentCaseResult {
  const assessmentHistory: Record<string, readonly HypothesisAssessment[]> = {};
  for (const [hypothesisId, history] of state.assessmentHistory) assessmentHistory[hypothesisId] = history;
  return Object.freeze({
    caseId: `decipherment:${state.sequence.fingerprint}`,
    sequenceFingerprint: state.sequence.fingerprint,
    sourceKind: state.sequence.sourceKind,
    glyphCount: state.sequence.glyphs.length,
    readings: state.readings,
    hypotheses: state.hypotheses,
    testsRun: state.testsRun,
    assessmentHistory: Object.freeze(assessmentHistory),
    conflicts: state.conflicts,
    seed: state.seed,
    modelVersion: state.modelVersion,
  });
}

/**
 * A decipherment case must actually have run the loop — real glyphs, at
 * least one competing reading with its own falsifier, at least one recorded
 * assessment. Mirrors `isWellFormedCyberInvestigation`'s "not an empty
 * shell" check.
 */
export function isWellFormedDeciphermentCaseResult(value: unknown): value is DeciphermentCaseResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.caseId !== 'string' || v.caseId.length === 0) return false;
  if (typeof v.sequenceFingerprint !== 'string' || v.sequenceFingerprint.length === 0) return false;
  if (typeof v.glyphCount !== 'number' || v.glyphCount <= 0) return false;
  if (!Array.isArray(v.readings) || v.readings.length === 0) return false;
  if (!Array.isArray(v.hypotheses) || v.hypotheses.length === 0) return false;
  if (v.hypotheses.length !== v.readings.length) return false;
  for (const h of v.hypotheses as unknown[]) {
    if (!h || typeof h !== 'object') return false;
    const hyp = h as Record<string, unknown>;
    if (typeof hyp.hypothesisId !== 'string' || hyp.hypothesisId.length === 0) return false;
    if (!hyp.falsifier || typeof hyp.falsifier !== 'object') return false;
    const f = hyp.falsifier as Record<string, unknown>;
    if (typeof f.predictedObservable !== 'string' || f.predictedObservable.length === 0) return false;
    if (typeof f.falsifyingObservable !== 'string' || f.falsifyingObservable.length === 0) return false;
  }
  if (!Array.isArray(v.testsRun)) return false;
  if (typeof v.seed !== 'number') return false;
  if (typeof v.modelVersion !== 'string' || v.modelVersion.length === 0) return false;
  return true;
}
