import { describe, expect, it } from 'vitest';
import {
  buildCandidateCombinationHypothesis,
  rankNaturalCompositionHypotheses,
  COMPOSITION_RANKING_CRITERIA,
  type CandidateDiscoveryReport,
  type CandidateRanking,
} from '../core/biotechDiscoveryContract';

/**
 * NATURAL COMPOSITION DISCOVERY — TOP N hipotez.
 *
 * `buildCandidateCombinationHypothesis` zwracał dokładnie JEDNĄ kompozycję —
 * parę o najwyższych ocenach — i nie miał żadnego testu. Użytkownik ma
 * zobaczyć TOP 3 alternatywnych kompozycji z jawnym uzasadnieniem, więc te
 * testy pilnują dwóch rzeczy naraz: że pojedyncza kompozycja liczy się tak
 * jak deklaruje kontrakt, i że ranking jest jawny, deterministyczny i nie
 * obiecuje więcej, niż wolno.
 */

function ranking(candidateId: string, score: number): CandidateRanking {
  return {
    candidateId,
    score,
    components: { evidenceQuality: score, targetRelevance: score, safetyPenalty: 0, uncertaintyPenalty: 0 },
    rationale: 'Fixture ranking — deterministic, not a real assay result.',
    uncertainty: 'Model estimate; validation required.',
    epistemicStatus: 'PREDICTION',
  };
}

function report(candidateId: string, targetIds: string[], evidenceIds: string[], score: number): CandidateDiscoveryReport {
  return {
    reportId: `report:${candidateId}`,
    candidateId,
    materialId: `material:${candidateId}`,
    compoundIds: [`compound:${candidateId}`],
    targetIds,
    mechanismIds: [`mech:${candidateId}`],
    evidenceIds,
    safetySignalIds: [],
    hypothesisId: `hyp:${candidateId}`,
    ranking: ranking(candidateId, score),
    epistemicStatus: 'PREDICTION',
    scientificEvidenceStatus: 'PREDICTION',
    clinicalEfficacy: 'UNKNOWN',
    uncertainty: 'Fixture record; no clinical claim.',
    provenance: [],
    scientificFingerprint: `fp:${candidateId}`,
  };
}

const alpha = report('nat:alpha', ['target:A', 'target:B'], ['ev:1', 'ev:2'], 0.9);
const beta = report('nat:beta', ['target:C'], ['ev:3'], 0.7);
const gamma = report('nat:gamma', ['target:A'], [], 0.8);
const delta = report('nat:delta', ['target:B', 'target:C'], ['ev:4', 'ev:5', 'ev:6'], 0.6);

const REQUESTED = ['target:A', 'target:B', 'target:C'];

describe('Pojedyncza hipoteza kompozycji', () => {
  it('poniżej dwóch raportów nie ma czego łączyć', () => {
    expect(buildCandidateCombinationHypothesis([], REQUESTED)).toBeUndefined();
    expect(buildCandidateCombinationHypothesis([alpha], REQUESTED)).toBeUndefined();
  });

  it('sumuje targety, mechanizmy i evidence obu kandydatów', () => {
    const built = buildCandidateCombinationHypothesis([alpha, delta], REQUESTED)!;

    expect(built.candidateIds).toHaveLength(2);
    expect([...built.coveredTargetIds].sort()).toEqual(['target:A', 'target:B', 'target:C']);
    expect([...built.coveredEvidenceIds].sort()).toEqual(['ev:1', 'ev:2', 'ev:4', 'ev:5', 'ev:6']);
    expect(built.uncoveredTargetIds).toEqual([]);
    expect(built.status).toBe('HYPOTHESIS');
  });

  it('nazywa kandydata bez evidence zamiast go przemilczeć', () => {
    const built = buildCandidateCombinationHypothesis([alpha, gamma], REQUESTED)!;

    expect(built.missingEvidenceIds).toContain('nat:gamma');
    expect(built.uncoveredTargetIds).toEqual(['target:C']);
  });

  it('nie orzeka o synergii, skuteczności ani bezpieczeństwie', () => {
    const built = buildCandidateCombinationHypothesis([alpha, delta], REQUESTED)!;

    expect(built.status).toBe('HYPOTHESIS');
    expect(built.uncertainty).toMatch(/no synergy, efficacy or safety conclusion/i);
    expect(built.validationPlan.length).toBeGreaterThan(0);
  });

  it('identyczne wejście daje identyczny combinationId, inne wejście inny', () => {
    const a = buildCandidateCombinationHypothesis([alpha, delta], REQUESTED)!;
    const b = buildCandidateCombinationHypothesis([alpha, delta], REQUESTED)!;
    const c = buildCandidateCombinationHypothesis([alpha, beta], REQUESTED)!;

    expect(b.combinationId).toBe(a.combinationId);
    expect(c.combinationId).not.toBe(a.combinationId);
  });
});

describe('TOP N hipotez kompozycji', () => {
  const reports = [alpha, beta, gamma, delta];

  it('zwraca pustą listę, gdy nie ma z czego zbudować pary', () => {
    expect(rankNaturalCompositionHypotheses([], REQUESTED)).toEqual([]);
    expect(rankNaturalCompositionHypotheses([alpha], REQUESTED)).toEqual([]);
    expect(rankNaturalCompositionHypotheses(reports, REQUESTED, 0)).toEqual([]);
  });

  it('domyślnie zwraca TOP 3, ponumerowane od 1', () => {
    const ranked = rankNaturalCompositionHypotheses(reports, REQUESTED);

    expect(ranked).toHaveLength(3);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('rozważa WSZYSTKIE pary, nie tylko dwóch najwyżej ocenionych kandydatów', () => {
    // Sama para o najwyższych ocenach to alpha+gamma (0,9 i 0,8), ale gamma nie
    // ma evidence i nie domyka target:C. Ranking musi umieć wybrać inną parę.
    const ranked = rankNaturalCompositionHypotheses(reports, REQUESTED);
    const winner = [...ranked[0].candidateIds].sort();

    expect(winner).toEqual(['nat:alpha', 'nat:delta']);
    expect(ranked.length).toBeGreaterThan(1);
  });

  it('pokrycie żądanych targetów bije wyższą średnią ocenę', () => {
    const ranked = rankNaturalCompositionHypotheses(reports, REQUESTED);

    expect(ranked[0].rankingBasis.uncoveredTargetCount).toBe(0);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].rankingBasis.uncoveredTargetCount)
        .toBeGreaterThanOrEqual(ranked[i - 1].rankingBasis.uncoveredTargetCount);
    }
  });

  it('każda pozycja niesie jawne WHY, kryterium po kryterium', () => {
    const ranked = rankNaturalCompositionHypotheses(reports, REQUESTED);

    for (const entry of ranked) {
      expect(entry.rankingRationale.length).toBe(4);
      expect(entry.rankingRationale.join(' ')).toMatch(/evidence/i);
      expect(entry.rankingBasis.coveredEvidenceCount).toBe(entry.coveredEvidenceIds.length);
      expect(entry.rankingBasis.missingEvidenceCount).toBe(entry.missingEvidenceIds.length);
      expect(entry.rankingBasis.uncoveredTargetCount).toBe(entry.uncoveredTargetIds.length);
    }
  });

  it('kryteria rankingu są zadeklarowane wprost, a nie ukryte w jednej liczbie', () => {
    expect(COMPOSITION_RANKING_CRITERIA.length).toBeGreaterThanOrEqual(4);
    expect(COMPOSITION_RANKING_CRITERIA.join(' ')).toContain('uncoveredTargetCount');
    expect(COMPOSITION_RANKING_CRITERIA.join(' ')).toContain('coveredEvidenceCount');
    expect(COMPOSITION_RANKING_CRITERIA.join(' ')).toContain('researchPriority');
  });

  it('jest deterministyczny — ta sama lista w innej kolejności daje ten sam ranking', () => {
    const forward = rankNaturalCompositionHypotheses(reports, REQUESTED);
    const shuffled = rankNaturalCompositionHypotheses([delta, gamma, beta, alpha], REQUESTED);

    expect(shuffled.map((entry) => entry.combinationId)).toEqual(forward.map((entry) => entry.combinationId));
  });

  it('nie duplikuje tej samej pary', () => {
    const ranked = rankNaturalCompositionHypotheses(reports, REQUESTED, 99);
    const ids = ranked.map((entry) => entry.combinationId);

    expect(new Set(ids).size).toBe(ids.length);
    // 4 kandydatów → 6 par.
    expect(ranked).toHaveLength(6);
  });

  it('każda pozycja pozostaje HIPOTEZĄ z planem walidacji — nigdy faktem', () => {
    for (const entry of rankNaturalCompositionHypotheses(reports, REQUESTED, 99)) {
      expect(entry.status).toBe('HYPOTHESIS');
      expect(entry.validationPlan.length).toBeGreaterThan(0);
      expect(entry.uncertainty).toBeTruthy();
    }
  });

  it('bez żądanych targetów ranking dalej działa i nikogo nie karze za brak pokrycia', () => {
    const ranked = rankNaturalCompositionHypotheses(reports, []);

    expect(ranked).toHaveLength(3);
    for (const entry of ranked) expect(entry.rankingBasis.uncoveredTargetCount).toBe(0);
    // Przy zerowym pokryciu decyduje liczba evidence — alpha+delta ma ich 5.
    expect([...ranked[0].candidateIds].sort()).toEqual(['nat:alpha', 'nat:delta']);
  });
});
