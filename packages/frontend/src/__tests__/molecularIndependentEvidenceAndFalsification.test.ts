import { describe, expect, it } from 'vitest';
import { assessIndependentEvidence, type EvidenceAxisEntry } from '../core/discovery/molecular/independentEvidence';
import { falsifyCandidateMechanism, TOXICITY_SIGNAL_THRESHOLD } from '../core/discovery/molecular/mechanismFalsification';
import { redTeamCandidate } from '../core/discovery/molecular/redTeam';

/**
 * NATURAL-DISCOVERY MISSION, ETAP 5/6/8 — INDEPENDENT EVIDENCE,
 * FALSIFICATION-FIRST, RED-TEAM.
 */
describe('assessIndependentEvidence', () => {
  const axesOf = (present: EvidenceAxis[]): EvidenceAxisEntry[] => ([
    { axis: 'NATURAL_OCCURRENCE_LITERATURE', present: present.includes('NATURAL_OCCURRENCE_LITERATURE'), detail: 'x' },
    { axis: 'MECHANISM_LITERATURE', present: present.includes('MECHANISM_LITERATURE'), detail: 'x' },
    { axis: 'DATABASE_RECORD', present: present.includes('DATABASE_RECORD'), detail: 'x' },
    { axis: 'STRUCTURAL_COMPUTATION', present: present.includes('STRUCTURAL_COMPUTATION'), detail: 'x' },
    { axis: 'ADMET_PREDICTION', present: present.includes('ADMET_PREDICTION'), detail: 'x' },
  ] as const);
  type EvidenceAxis = 'NATURAL_OCCURRENCE_LITERATURE' | 'MECHANISM_LITERATURE' | 'DATABASE_RECORD' | 'STRUCTURAL_COMPUTATION' | 'ADMET_PREDICTION';

  it('brak osi obecnych => NONE / NONE', () => {
    const result = assessIndependentEvidence('x', axesOf([]), []);
    expect(result.evidenceQuality).toBe('NONE');
    expect(result.evidenceIndependence).toBe('NONE');
    expect(result.missingEvidence.length).toBe(5);
  });

  it('jedna oś obecna => WEAK / SINGLE_AXIS, niezależnie od liczby wpisów na tej osi', () => {
    const result = assessIndependentEvidence('x', axesOf(['MECHANISM_LITERATURE']), []);
    expect(result.evidenceQuality).toBe('WEAK');
    expect(result.evidenceIndependence).toBe('SINGLE_AXIS');
  });

  it('dwie niezależne osie => MODERATE / INDEPENDENT_MULTI_AXIS', () => {
    const result = assessIndependentEvidence('x', axesOf(['MECHANISM_LITERATURE', 'NATURAL_OCCURRENCE_LITERATURE']), []);
    expect(result.evidenceQuality).toBe('MODERATE');
    expect(result.evidenceIndependence).toBe('INDEPENDENT_MULTI_AXIS');
  });

  it('trzy lub więcej niezależnych osi => STRONG', () => {
    const result = assessIndependentEvidence('x', axesOf(['MECHANISM_LITERATURE', 'NATURAL_OCCURRENCE_LITERATURE', 'STRUCTURAL_COMPUTATION']), []);
    expect(result.evidenceQuality).toBe('STRONG');
  });

  it('sprzeczność obniża jakość do WEAK nawet przy wielu osiach', () => {
    const result = assessIndependentEvidence('x', axesOf(['MECHANISM_LITERATURE', 'NATURAL_OCCURRENCE_LITERATURE', 'STRUCTURAL_COMPUTATION', 'ADMET_PREDICTION']), ['target mismatch vs reference']);
    expect(result.evidenceQuality).toBe('WEAK');
  });
});

describe('falsifyCandidateMechanism — WRONG_TARGET odrzuca niezależnie od reszty', () => {
  const baseInput = {
    candidateKey: 'x',
    referenceTargetKeywords: ['nmda'],
    naturalOccurrenceCited: true,
    mechanismEvidenceCount: 1,
    structuralStatus: 'CONFIRMED' as const,
    admetToxicitySignals: [],
    admetInDomain: true,
  };

  it('target zgodny (case-insensitive substring) => RETAINED', () => {
    const report = falsifyCandidateMechanism({ ...baseInput, reportedTargetFamily: 'NMDA receptor (glycine site)' });
    expect(report.verdict).toBe('RETAINED');
  });

  it('target niezgodny (np. MAO-A) => REJECTED_WRONG_TARGET, mimo mocnych innych dowodów', () => {
    const report = falsifyCandidateMechanism({ ...baseInput, reportedTargetFamily: 'Monoamine oxidase A (MAO-A)' });
    expect(report.verdict).toBe('REJECTED_WRONG_TARGET');
    expect(report.checks.find((c) => c.checkId === 'WRONG_TARGET')!.outcome).toBe('FAIL');
  });

  it('brak dowodu mechanizmu => REJECTED_NO_MECHANISM_EVIDENCE', () => {
    const report = falsifyCandidateMechanism({ ...baseInput, reportedTargetFamily: 'NMDA receptor', mechanismEvidenceCount: 0 });
    expect(report.verdict).toBe('REJECTED_NO_MECHANISM_EVIDENCE');
  });

  it('occurrence bez cytacji => REJECTED_INSUFFICIENT_PROVENANCE', () => {
    const report = falsifyCandidateMechanism({ ...baseInput, reportedTargetFamily: 'NMDA receptor', naturalOccurrenceCited: false });
    expect(report.verdict).toBe('REJECTED_INSUFFICIENT_PROVENANCE');
  });

  it('MISMATCH strukturalny => REJECTED_STRUCTURAL_MISMATCH', () => {
    const report = falsifyCandidateMechanism({ ...baseInput, reportedTargetFamily: 'NMDA receptor', structuralStatus: 'MISMATCH' });
    expect(report.verdict).toBe('REJECTED_STRUCTURAL_MISMATCH');
  });

  it('DECLINED (świadomy brak struktury) NIE jest karany jako MISMATCH', () => {
    const report = falsifyCandidateMechanism({ ...baseInput, reportedTargetFamily: 'NMDA receptor', structuralStatus: 'DECLINED' });
    expect(report.verdict).toBe('RETAINED');
    expect(report.checks.find((c) => c.checkId === 'STRUCTURAL_MISMATCH')!.outcome).toBe('NOT_EVALUATED');
  });

  it('sygnał toksyczności >= progu => REJECTED_TOXICITY_SIGNAL', () => {
    const report = falsifyCandidateMechanism({
      ...baseInput, reportedTargetFamily: 'NMDA receptor',
      admetToxicitySignals: [{ endpoint: 'AMES', probability: TOXICITY_SIGNAL_THRESHOLD }],
    });
    expect(report.verdict).toBe('REJECTED_TOXICITY_SIGNAL');
  });

  it('sygnał poniżej progu NIE odrzuca', () => {
    const report = falsifyCandidateMechanism({
      ...baseInput, reportedTargetFamily: 'NMDA receptor',
      admetToxicitySignals: [{ endpoint: 'AMES', probability: TOXICITY_SIGNAL_THRESHOLD - 0.2 }],
    });
    expect(report.verdict).toBe('RETAINED');
  });

  it('każdy raport niesie WSZYSTKIE sprawdzenia, nie tylko pierwsze niepowodzenie', () => {
    const report = falsifyCandidateMechanism({ ...baseInput, reportedTargetFamily: 'Monoamine oxidase A', naturalOccurrenceCited: false, mechanismEvidenceCount: 0 });
    expect(report.checks).toHaveLength(6);
    expect(report.checks.filter((c) => c.outcome === 'FAIL').length).toBeGreaterThan(1);
  });
});

describe('redTeamCandidate — pięć generycznych kątów, żaden sam w sobie nie odrzuca', () => {
  it('wszystko zaadresowane => zero otwartych obaw', () => {
    const report = redTeamCandidate({
      candidateKey: 'x', rankedBySimilarityAlone: false, mechanismEvidenceIsHumanSystem: true,
      effectiveConcentrationKnown: true, databaseLookupWasAmbiguous: false, admetInDomain: true,
    });
    expect(report.openConcernCount).toBe(0);
    expect(report.findings).toHaveLength(5);
  });

  it('luka gatunkowa (dowód nie z systemu ludzkiego) pozostaje otwarta, ale NIE odrzuca kandydata', () => {
    const report = redTeamCandidate({
      candidateKey: 'x', rankedBySimilarityAlone: false, mechanismEvidenceIsHumanSystem: false,
      effectiveConcentrationKnown: true, databaseLookupWasAmbiguous: false, admetInDomain: true,
    });
    expect(report.openConcernCount).toBe(1);
    expect(report.survived).toBe(true);
    const gap = report.findings.find((f) => f.angle === 'SPECIES_GAP')!;
    expect(gap.addressed).toBe(false);
  });

  it('ranking oparty WYŁĄCZNIE na podobieństwie strukturalnym jest zgłoszony jako otwarta obawa', () => {
    const report = redTeamCandidate({
      candidateKey: 'x', rankedBySimilarityAlone: true, mechanismEvidenceIsHumanSystem: true,
      effectiveConcentrationKnown: true, databaseLookupWasAmbiguous: false, admetInDomain: true,
    });
    const finding = report.findings.find((f) => f.angle === 'FALSE_SIMILARITY')!;
    expect(finding.addressed).toBe(false);
  });
});
