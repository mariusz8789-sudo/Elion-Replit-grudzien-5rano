import { describe, expect, it } from 'vitest';
import { buildQe4EvidenceCase, QE4_EVIDENCE_CASE_ID } from '../core/biotechData/qe4EvidenceCase';
import { runQe4BrydgesAnalysis } from '../core/biotechData/qe4BrydgesAnalysis';
import { compareExternalDatasetCaseReplay } from '../core/agent/externalDatasetCase';

/**
 * Contract tests for the QE4 <-> ExternalDatasetCase adapter. These assert
 * the ADAPTER reshapes correctly and changes nothing scientific — they never
 * re-derive or loosen any P1-P4 threshold, which lives entirely in
 * `qe4BrydgesAnalysis.ts` (see `qe4BrydgesAnalysis.test.ts` for that).
 */
describe('qe4EvidenceCase — QE4 wired through the generic ExternalDatasetCase container', () => {
  it('preserves all four QE4 verdicts exactly as computed by qe4BrydgesAnalysis.ts, independently', () => {
    const analysis = runQe4BrydgesAnalysis();
    const evidenceCase = buildQe4EvidenceCase(analysis);

    expect(evidenceCase.caseId).toBe(QE4_EVIDENCE_CASE_ID);
    expect(evidenceCase.hypotheses).toHaveLength(4);
    const byId = new Map(evidenceCase.hypotheses.map((h) => [h.id, h]));
    expect(byId.get('P1')!.verdict).toBe(analysis.p1.verdict);
    expect(byId.get('P2')!.verdict).toBe(analysis.p2.verdict);
    expect(byId.get('P3')!.verdict).toBe(analysis.p3.verdict);
    expect(byId.get('P4')!.verdict).toBe(analysis.p4.verdict);

    // No case-level scalar verdict exists — only a tally, so four independent
    // verdicts stay visibly four, not one aggregated "PASS".
    expect(evidenceCase).not.toHaveProperty('verdict');
    expect(Object.values(evidenceCase.verdictCounts).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('preserves each hypothesis\'s own Tautology Gate classification unchanged from qe4BrydgesAnalysis.ts', () => {
    const analysis = runQe4BrydgesAnalysis();
    const evidenceCase = buildQe4EvidenceCase(analysis);
    const byId = new Map(evidenceCase.hypotheses.map((h) => [h.id, h]));
    expect(byId.get('P1')!.tautology.classification).toBe(analysis.p1.tautology.classification);
    expect(byId.get('P2')!.tautology.classification).toBe(analysis.p2.tautology.classification);
    expect(byId.get('P3')!.tautology.classification).toBe(analysis.p3.tautology.classification);
    expect(byId.get('P4')!.tautology.classification).toBe(analysis.p4.tautology.classification);
  });

  it('runs independent belief revision for each hypothesis, starting from a fresh 0.5 prior', () => {
    const evidenceCase = buildQe4EvidenceCase();
    for (const h of evidenceCase.hypotheses) {
      expect(h.belief.before).toBeCloseTo(0.5, 6);
      expect(Number.isFinite(h.belief.after)).toBe(true);
    }
  });

  it('carries real dataset provenance (DOI, license, retrieval date, archive checksum) at the case level', () => {
    const evidenceCase = buildQe4EvidenceCase();
    expect(evidenceCase.provenance.sourceUrl).toBe('https://zenodo.org/records/2527010');
    expect(evidenceCase.provenance.sourceVersion).toContain('10.5281/zenodo.2527010');
    expect(evidenceCase.provenance.license).toBe('cc-by-4.0');
    expect(evidenceCase.provenance.archiveSha256).toBe('87424c2ddfbc9e68361d70a41878b63919ceb7257bdb70b4fad65d4179cd8389');
  });

  it('passes through QE4\'s own deterministic resultFingerprint unchanged, and is itself replay-deterministic', () => {
    const analysis = runQe4BrydgesAnalysis();
    const first = buildQe4EvidenceCase(analysis);
    const second = buildQe4EvidenceCase(runQe4BrydgesAnalysis());
    expect(first.domainResultFingerprint).toBe(analysis.resultFingerprint);
    expect(first.caseFingerprint).toBe(second.caseFingerprint);
    expect(compareExternalDatasetCaseReplay(first, second)).toBe('MATCH');
  });

  it('produces a next-question for every one of the four hypotheses', () => {
    const evidenceCase = buildQe4EvidenceCase();
    for (const h of evidenceCase.hypotheses) {
      expect(h.nextQuestion.length).toBeGreaterThan(20);
    }
  });
});
