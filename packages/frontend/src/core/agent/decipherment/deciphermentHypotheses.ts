import { fnv1a, canonicalJson } from '../../events/hash';
import type { HypothesisAssessment } from '../../experimentFabric/scientificDiscovery';
import type { DeciphermentReading, DeciphermentHypothesis, DeciphermentFalsifier, DeciphermentTestKind } from './deciphermentTypes';

/**
 * One hypothesis per competing reading, each with a REAL falsifier — mirror
 * of `SecurityFalsifier` in `cyberInvestigation.ts`: a predicted observable
 * and a falsifying observable, both checkable, neither prose alone.
 */

function falsifierForReading(reading: DeciphermentReading): DeciphermentFalsifier {
  const predicted = `structural_fit>=${reading.structuralFit} AND unresolved<=${reading.unresolvedGlyphs}`;
  const falsifying = `structural_fit<${reading.structuralFit} OR unresolved>${reading.unresolvedGlyphs}`;
  const kind: DeciphermentTestKind = reading.cipherModelId === 'TRANSPOSITION' ? 'REPEAT_STRUCTURE' : 'FREQUENCY_MATCH';
  return Object.freeze({ predictedObservable: predicted, falsifyingObservable: falsifying, testKind: kind });
}

export function buildHypothesesForReadings(readings: readonly DeciphermentReading[], seed: number): readonly DeciphermentHypothesis[] {
  return Object.freeze(readings.map((reading, i) => {
    const core = {
      hypothesisId: `hyp:${seed}:${i}`,
      readingId: reading.readingId,
      statement: `Reading ${reading.label} (${reading.cipherModelId}) is the correct interpretation of the glyph sequence.`,
      falsifier: falsifierForReading(reading),
      supportingObservations: Object.freeze([] as string[]),
      contradictions: Object.freeze([] as string[]),
      assumptions: reading.assumptions,
      unresolvedSymbols: Object.freeze(Object.entries(reading.mapping).filter(([, v]) => v === '?').map(([k]) => k)),
      assessment: 'CANDIDATE' as HypothesisAssessment,
    };
    return Object.freeze({ ...core, fingerprint: fnv1a(canonicalJson(core)) });
  }));
}

/**
 * Applies a real test outcome to a hypothesis, returning the canonical
 * assessment. `matchesPrediction` must come from an actual comparison
 * against the reading (see `deciphermentOrchestrator.ts::runTest`) — never
 * read straight off reading metadata.
 */
export function assessHypothesis(
  hypothesis: DeciphermentHypothesis,
  observation: { readonly matchesPrediction: boolean | null; readonly note: string },
): { readonly hypothesis: DeciphermentHypothesis; readonly assessment: HypothesisAssessment } {
  const assessment: HypothesisAssessment =
    observation.matchesPrediction === null ? 'INCONCLUSIVE'
      : observation.matchesPrediction ? 'SUPPORTED_WITHIN_PROTOCOL'
        : 'FALSIFIED_WITHIN_PROTOCOL';

  const supportingObservations = assessment === 'SUPPORTED_WITHIN_PROTOCOL'
    ? Object.freeze([...hypothesis.supportingObservations, observation.note])
    : hypothesis.supportingObservations;
  const contradictions = assessment === 'FALSIFIED_WITHIN_PROTOCOL'
    ? Object.freeze([...hypothesis.contradictions, observation.note])
    : hypothesis.contradictions;

  const updated: DeciphermentHypothesis = Object.freeze({ ...hypothesis, assessment, supportingObservations, contradictions });
  return { hypothesis: updated, assessment };
}
