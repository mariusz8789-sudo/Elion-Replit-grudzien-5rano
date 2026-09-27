import { describe, expect, it } from 'vitest';
import { buildDemoAutomotiveAssessment } from '../core/automotive/demoFixture';
import { buildSavedAutomotiveAssessment, isSavedAutomotiveAssessment, replaySavedAutomotiveAssessment } from '../core/automotive/replay';
import { sourced } from '../core/automotive/types';

/**
 * REPLAY — test matrix items M (MATCH), N (DRIFT), O (BLOCKED), plus
 * determinism ("same inputs twice -> identical result").
 */

describe('M — replay bez zmian daje MATCH', () => {
  it('ta sama ocena odtwarza się identycznie', () => {
    const saved = buildSavedAutomotiveAssessment(buildDemoAutomotiveAssessment());
    const replay = replaySavedAutomotiveAssessment(saved);

    expect(replay.status).toBe('MATCH');
    expect(replay.result).not.toBeNull();
    expect(replay.result!.assessmentId).toBe(saved.assessment.assessmentId);
  });
});

describe('N — zmieniony input po zapisie daje DRIFT', () => {
  it('zmiana ceny linii referencyjnej po zapisie jest wykrywana', () => {
    const saved = buildSavedAutomotiveAssessment(buildDemoAutomotiveAssessment());
    const tampered = {
      ...saved,
      assessment: {
        ...saved.assessment,
        referenceLineItems: saved.assessment.referenceLineItems.map((item, i) => (i === 0 ? { ...item, unitPrice: sourced('TEST_FIXTURE' as const, 999999) } : item)),
      },
    };
    const replay = replaySavedAutomotiveAssessment(tampered);

    expect(replay.status).toBe('DRIFT');
    expect(replay.result).toBeNull();
  });
});

describe('O — brak wymaganego źródła (uszkodzony zapis) daje BLOCKED', () => {
  it('niekompletny zapis nigdy nie daje cichego MATCH', () => {
    expect(replaySavedAutomotiveAssessment(undefined).status).toBe('BLOCKED');
    expect(replaySavedAutomotiveAssessment({}).status).toBe('BLOCKED');
    const saved = buildSavedAutomotiveAssessment(buildDemoAutomotiveAssessment());
    const { assessment: _assessment, ...withoutAssessment } = saved;
    expect(replaySavedAutomotiveAssessment(withoutAssessment).status).toBe('BLOCKED');
  });

  it('isSavedAutomotiveAssessment odrzuca wartości bez assessmentId', () => {
    const saved = buildSavedAutomotiveAssessment(buildDemoAutomotiveAssessment());
    expect(isSavedAutomotiveAssessment({ ...saved, assessment: { ...saved.assessment, assessmentId: '' } })).toBe(false);
  });
});

describe('Determinizm', () => {
  it('ten sam assessment daje identyczny resultFingerprint za każdym razem', () => {
    const assessment = buildDemoAutomotiveAssessment();
    const first = buildSavedAutomotiveAssessment(assessment);
    const second = buildSavedAutomotiveAssessment(assessment);
    expect(second.resultFingerprint).toBe(first.resultFingerprint);
  });
});
