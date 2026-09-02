import { describe, expect, it } from 'vitest';
import {
  buildClaim,
  isClaimStrengthEscalation,
} from '../core/discovery/molecular/precisionClaimControl';
import { runPrecisionFalsification } from '../core/discovery/molecular/precisionFalsification';
import {
  inferredTransporterEvidence,
  transporterClaimGuard,
  unavailableTransporterEvidence,
  unknownTransporterEvidence,
  verifiedTransporterEvidence,
} from '../core/discovery/molecular/transporterEvidence';

/**
 * 3-MMC / 4-CMC PRECISION MISSION — transporter evidence + claim control +
 * falsification (tests 5, 7, 8, 12 of the mission's 12-item list).
 */
describe('transporterEvidence — status jest zarobiony, nie deklarowany', () => {
  it('VERIFIED bez cytacji rzuca błąd', () => {
    expect(() => verifiedTransporterEvidence('X', 'DAT', 'claim', [])).toThrow(/at least one real citation/i);
  });

  it('VERIFIED z realną cytacją jest budowane poprawnie', () => {
    const record = verifiedTransporterEvidence('X', 'SERT', 'X inhibits SERT reuptake in vitro.', [
      { source: 'LITERATURE', identifier: 'Author et al. Journal. Year.', establishes: 'SERT reuptake inhibition, in vitro.' },
    ]);
    expect(record.status).toBe('VERIFIED');
    expect(record.evidence).toHaveLength(1);
  });

  it('INFERRED nie niesie żadnej cytacji (to rozumowanie klasowe, nie źródło)', () => {
    const record = inferredTransporterEvidence('X', 'DAT', 'class-level claim', 'structural reasoning only');
    expect(record.status).toBe('INFERRED');
    expect(record.evidence).toHaveLength(0);
    expect(record.statusReason.length).toBeGreaterThan(0);
  });

  it('UNKNOWN i NOT_AVAILABLE zawsze niosą realny powód', () => {
    const unknown = unknownTransporterEvidence('X', 'NET', 'no compound-specific data');
    const notAvailable = unavailableTransporterEvidence('X', 'NET', 'no source reachable');
    expect(unknown.status).toBe('UNKNOWN');
    expect(notAvailable.status).toBe('NOT_AVAILABLE');
    expect(unknown.statusReason.length).toBeGreaterThan(0);
    expect(notAvailable.statusReason.length).toBeGreaterThan(0);
  });
});

describe('transporterClaimGuard — fail-closed przeciw dwóm konkretnym skrótom', () => {
  it('odrzuca binding/affinity → efekt funkcjonalny/human', () => {
    const result = transporterClaimGuard('The binding affinity at SERT causes a psychoactive effect in humans.');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/binding\/affinity value/i);
  });

  it('odrzuca in-vitro → efekt u ludzi', () => {
    const result = transporterClaimGuard('This in vitro result shows the human effect users experience.');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/in-vitro result/i);
  });

  it('pozwala na czyste stwierdzenie in-vitro bez skoku do człowieka', () => {
    const result = transporterClaimGuard('This compound showed IC50 = 200 nM at SERT in a transfected cell line in vitro.');
    expect(result.allowed).toBe(true);
  });
});

describe('buildClaim — CLAIM/EVIDENCE/TYPE/CONFIDENCE/LIMITATION', () => {
  it('CLINICALLY_EQUIVALENT jest strukturalnie niedostępny', () => {
    expect(() => buildClaim({
      claimId: 'x', statement: 'A is clinically equivalent to B.', strength: 'CLINICALLY_EQUIVALENT',
      evidence: [], evidenceType: 'NONE', limitation: 'x',
    })).toThrow(/CLINICALLY_EQUIVALENT cannot be claimed/i);
  });

  it('claim niesie confidence wyprowadzone z realnej liczby dowodów, nie zadeklarowane', () => {
    const noEvidence = buildClaim({ claimId: 'a', statement: 's', strength: 'STRUCTURAL_SIMILARITY', evidence: [], evidenceType: 'STRUCTURAL_COMPUTATION', limitation: 'x' });
    const oneSource = buildClaim({
      claimId: 'b', statement: 's', strength: 'SAME_TARGET_FAMILY',
      evidence: [{ source: 'LITERATURE', identifier: 'id1', establishes: 'x' }], evidenceType: 'LITERATURE', limitation: 'x',
    });
    expect(noEvidence.confidence).toBe(1);
    expect(oneSource.confidence).toBe(2);
    expect(oneSource.confidenceStatement).toMatch(/SOURCE_SUPPORTED/);
  });

  it('każdy claim niesie niepustą limitację', () => {
    const claim = buildClaim({ claimId: 'a', statement: 's', strength: 'STRUCTURAL_SIMILARITY', evidence: [], evidenceType: 'STRUCTURAL_COMPUTATION', limitation: 'Does not establish mechanism.' });
    expect(claim.limitation.length).toBeGreaterThan(0);
  });
});

describe('isClaimStrengthEscalation — poziomy nie wolno mieszać', () => {
  it('rozpoznaje eskalację i jej brak', () => {
    expect(isClaimStrengthEscalation('STRUCTURAL_SIMILARITY', 'SAME_TARGET_FAMILY')).toBe(true);
    expect(isClaimStrengthEscalation('FUNCTIONAL_SIMILARITY', 'STRUCTURAL_SIMILARITY')).toBe(false);
    expect(isClaimStrengthEscalation('SAME_TARGET', 'SAME_TARGET')).toBe(false);
  });
});

describe('runPrecisionFalsification — pięć pytań misji, żadne nie jest pomijane', () => {
  it('bez VERIFIED dowodu transporterowego dla żadnego związku: max claim = STRUCTURAL_SIMILARITY', () => {
    const report = runPrecisionFalsification({
      compoundAName: '3-MMC', compoundBName: '4-CMC',
      transporterEvidenceA: [inferredTransporterEvidence('3-MMC', 'DAT', 'x', 'class-level')],
      transporterEvidenceB: [inferredTransporterEvidence('4-CMC', 'DAT', 'x', 'class-level')],
      similarity: { candidateSmiles: 'a', referenceSmiles: 'b', available: true, reason: '', tanimoto: 0.51, band: 'LOW', sameScaffold: true, fingerprint: 'morgan_r2_2048', engine: 'RDKit' },
    });
    expect(report.checks).toHaveLength(5);
    expect(report.maxSupportableClaim).toBe('STRUCTURAL_SIMILARITY');
    expect(report.checks.find((c) => c.checkId === 'convergent-transporter-profile')!.concernFound).toBe(true);
  });

  it('z VERIFIED dowodem dla obu związków: convergent-profile przestaje być problemem, reszta nadal jest', () => {
    const report = runPrecisionFalsification({
      compoundAName: '3-MMC', compoundBName: '4-CMC',
      transporterEvidenceA: [verifiedTransporterEvidence('3-MMC', 'SERT', 'x', [{ source: 'LITERATURE', identifier: 'id', establishes: 'x' }])],
      transporterEvidenceB: [verifiedTransporterEvidence('4-CMC', 'SERT', 'x', [{ source: 'LITERATURE', identifier: 'id2', establishes: 'x' }])],
      similarity: { candidateSmiles: 'a', referenceSmiles: 'b', available: true, reason: '', tanimoto: 0.51, band: 'LOW', sameScaffold: true, fingerprint: 'morgan_r2_2048', engine: 'RDKit' },
    });
    expect(report.checks.find((c) => c.checkId === 'convergent-transporter-profile')!.concernFound).toBe(false);
    expect(report.concernCount).toBe(4);
  });

  it('każde sprawdzenie ma niepuste pytanie i finding', () => {
    const report = runPrecisionFalsification({
      compoundAName: '3-MMC', compoundBName: '4-CMC',
      transporterEvidenceA: [], transporterEvidenceB: [], similarity: null,
    });
    for (const check of report.checks) {
      expect(check.question.length).toBeGreaterThan(0);
      expect(check.finding.length).toBeGreaterThan(0);
    }
  });
});
