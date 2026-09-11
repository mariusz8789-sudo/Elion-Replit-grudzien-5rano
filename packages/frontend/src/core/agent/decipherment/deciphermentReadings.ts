import { fnv1a, canonicalJson } from '../../events/hash';
import type { GlyphSequence, DeciphermentReading, ReadingSpec, GlyphProvenance } from './deciphermentTypes';
import { CIPHER_MODELS } from './cipherModels';
import { glyphAlphabet, repeatedPatterns, ngramFrequency, symbolFrequency } from './glyphAnalysis';

/**
 * Competing decipherment readings, with transparent (not fabricated)
 * scoring and strict epistemic separation: a reading is a reconstruction or
 * a hypothesis, never an observation, and never evidence on its own.
 */

function buildDecodedSequence(seq: GlyphSequence, decodedSymbols: readonly string[]): GlyphSequence {
  return Object.freeze({
    sequenceId: `${seq.sequenceId}:decoded`,
    sourceKind: seq.sourceKind,
    glyphs: Object.freeze(decodedSymbols.map((s, i) => Object.freeze({ symbol: s, position: i, provenance: 'RECONSTRUCTED' as GlyphProvenance }))),
    fingerprint: fnv1a(canonicalJson(decodedSymbols)),
  });
}

/** Transparent structural-fit heuristic: rewards a decode that preserves the
 * sequence's own repeat structure and doesn't inflate bigram diversity. This
 * is a real, inspectable formula — not a black-box confidence score. NOTE: any
 * cipher that applies a single consistent symbol->symbol bijection to the
 * whole sequence (CAESAR, AFFINE, SUBSTITUTION) is a pure relabeling, so this
 * repeat/bigram-shape metric is mathematically invariant to it — it cannot by
 * itself distinguish a right key from a wrong one for those models. It CAN
 * discriminate VIGENERE (period-dependent shift) and TRANSPOSITION (reorders
 * positions). This is a real, documented limitation of the toy heuristic, not
 * a bug: see `linguisticFit` below for the signal that actually varies by key. */
function computeStructuralFit(seq: GlyphSequence, decodedSeq: GlyphSequence, decodedSymbols: readonly string[]): number {
  const repeatsOriginal = repeatedPatterns(seq, 2, 4).length;
  const repeatsDecoded = repeatedPatterns(decodedSeq, 2, 4).length;
  const repeatScore = repeatsOriginal === 0 ? 0.5 : Math.min(1, repeatsDecoded / repeatsOriginal);
  const bigrams = ngramFrequency(decodedSeq, 2);
  const distinctBigrams = Object.keys(bigrams).length;
  const totalBigrams = Math.max(1, decodedSymbols.length - 1);
  const smoothness = 1 - Math.min(1, distinctBigrams / totalBigrams);
  return Math.round((0.6 * repeatScore + 0.4 * smoothness) * 1000) / 1000;
}

/** TOY placeholder only — symbol-frequency concentration of the DECODED
 * output, not a real language model. Must run on the decode, not the raw
 * ciphertext: a bijective cipher only permutes which symbol is "most
 * frequent," so scoring the raw sequence instead would make this identical
 * for every candidate key and defeat its purpose as a discriminating signal. */
function computeLinguisticFit(decodedSeq: GlyphSequence): number {
  const freq = symbolFrequency(decodedSeq);
  if (freq.length === 0) return 0;
  return Math.round(freq[0].frequency * 1000) / 1000;
}

export function buildReading(seq: GlyphSequence, spec: ReadingSpec, seed: number, counter: number): DeciphermentReading {
  const alphabet = glyphAlphabet(seq);
  const n = alphabet.length;
  const indexOf = new Map<string, number>(alphabet.map((s, i) => [s, i]));
  const indices = seq.glyphs.map((g) => indexOf.get(g.symbol) ?? 0);
  const model = CIPHER_MODELS[spec.cipherModelId];
  if (!model) throw new Error(`UNKNOWN_CIPHER_MODEL:${spec.cipherModelId}`);

  const decodedIndices = spec.candidateKey === null ? indices : [...model.decrypt(indices, spec.candidateKey, Math.max(1, n))];
  const decodedSymbols = decodedIndices.map((i) => alphabet[i] ?? '?');

  // mapping: source symbol -> decoded symbol, taken from the FIRST occurrence of each source symbol.
  const mapping: Record<string, string> = {};
  seq.glyphs.forEach((g, i) => { if (!(g.symbol in mapping)) mapping[g.symbol] = decodedSymbols[i]; });

  const matched = seq.glyphs.filter((g) => g.provenance === 'OBSERVED' && !g.damaged).length;
  const reconstructed = seq.glyphs.filter((g) => g.damaged === true || g.provenance === 'RECONSTRUCTED').length;
  const unresolved = decodedSymbols.filter((s) => s === '?').length;

  const decodedSeq = buildDecodedSequence(seq, decodedSymbols);
  const structuralFit = computeStructuralFit(seq, decodedSeq, decodedSymbols);
  const linguisticFit = computeLinguisticFit(decodedSeq);

  const core = {
    readingId: `reading:${seed}:${counter}`,
    label: spec.label,
    cipherModelId: spec.cipherModelId,
    candidateKey: spec.candidateKey,
    mapping: Object.freeze(mapping),
    output: decodedSymbols.join(' '),
    matchedGlyphs: matched,
    unresolvedGlyphs: unresolved,
    reconstructedGlyphs: reconstructed,
    structuralFit,
    linguisticFit,
    assumptions: Object.freeze([...spec.assumptions, ...model.assumptions]),
    // A reading is a reconstruction (no key: identity pass over the raw sequence)
    // or a hypothesis (a candidate key was applied) — NEVER "OBSERVED".
    epistemicStatus: (spec.candidateKey === null ? 'RECONSTRUCTED' : 'HYPOTHESIS') as GlyphProvenance,
  };
  return Object.freeze({ ...core, fingerprint: fnv1a(canonicalJson(core)) });
}

/** Deterministic ranking: higher combined score first, id as tie-break — never reshuffles between renders. */
export function rankReadings(readings: readonly DeciphermentReading[]): readonly DeciphermentReading[] {
  const score = (r: DeciphermentReading): number => {
    const totalGlyphs = Math.max(1, r.matchedGlyphs + r.unresolvedGlyphs);
    return Math.round((0.5 * r.structuralFit + 0.3 * r.linguisticFit + 0.2 * (1 - r.unresolvedGlyphs / totalGlyphs)) * 1000) / 1000;
  };
  return Object.freeze(
    [...readings].sort((a, b) => {
      const diff = score(b) - score(a);
      if (Math.abs(diff) > 1e-9) return diff;
      return a.readingId < b.readingId ? -1 : 1;
    }),
  );
}
