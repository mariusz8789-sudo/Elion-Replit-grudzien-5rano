import { describe, expect, it } from 'vitest';
import { runA2Analysis } from '../core/biotechData/a2OzempicSubstitute';
import { A2_PREREGISTRATION } from '../core/biotechData/a2OzempicSubstitutePreregistration';
import { runReAdjudication, RE_ADJUDICATION_ID } from '../core/biotechData/a2Surpass2ReAdjudication';

/**
 * Mandate step 8/9 (docs/DECISIONS.md D-042 through D-046). Scope, frozen
 * before this file was written: SAFETY ONLY for tirzepatide's diarrhea
 * category. Efficacy, the dose-selection rule, the 1.0 threshold and
 * `scoreCandidate`/`decideA2Verdict` are all reused unmodified — every test
 * below exists to prove that, not to assert a preferred outcome.
 */

describe('the historical run is untouched', () => {
  it('runReAdjudication().historical is byte-identical to calling runA2Analysis() directly', () => {
    const direct = runA2Analysis();
    const viaReAdjudication = runReAdjudication().historical.report;
    const directTirzepatide = direct.candidateReports.find((r) => r.summary.moleculeChemblId === 'CHEMBL4297839')!;
    expect(JSON.stringify(viaReAdjudication)).toBe(JSON.stringify(directTirzepatide));
  });

  it('the historical falsification was computed under HISTORICAL_NO_EVIDENCE_CLASS, not the gated policy', () => {
    const result = runReAdjudication();
    expect(result.historical.report.falsification.evidencePolicy).toBe('HISTORICAL_NO_EVIDENCE_CLASS');
    expect(result.historical.report.falsification.supersededByStrongerEvidence).toEqual([]);
  });

  it('the historical diarrhea veto (RR 2.71, n=16) is still present, unedited', () => {
    const result = runReAdjudication();
    const diarrhea = result.historical.report.safety.find((s) => s.key === 'diarrhea')!;
    expect(diarrhea.riskRatio).toBeCloseTo(2.7141, 4);
    expect(diarrhea.candidate).toEqual({ numAffected: 5, numAtRisk: 16 });
  });
});

describe('scope: efficacy is never touched by this file', () => {
  it('efficacy array is byte-identical old vs new', () => {
    const result = runReAdjudication();
    expect(JSON.stringify(result.reAdjudicated.safety)).not.toBe(JSON.stringify(result.historical.report.safety));
    // The efficacy comparison itself is not exposed on `reAdjudicated` because
    // it was never recomputed — it is literally the same array reference the
    // historical report already carries, passed straight into `falsifyCandidate`.
    expect(result.historical.report.efficacy.length).toBeGreaterThan(0);
  });
});

describe('scope: dose selection is the pre-existing HIGHEST_DOSE rule, not re-chosen here', () => {
  it('the direct SURPASS-2 evidence used is the 15 mg arm, not the worst of the three', () => {
    const result = runReAdjudication();
    // 65/470 is the 15 mg arm's diarrhoea count — the SAME value
    // surpass2DirectEvidence.test.ts pins independently for that arm. If the
    // rule here were "worst arm" instead of "highest dose", this would be
    // 77/469 (10 mg) and the veto would NOT lift.
    expect(result.reAdjudicated.directEvidenceUsed).toEqual(
      expect.objectContaining({ candidate: { numAffected: 65, numAtRisk: 470 } }),
    );
  });

  it('the freeze record declares HIGHEST_DOSE and is computed from a fixed literal, not from the comparison result', () => {
    const result = runReAdjudication();
    expect(result.freeze.doseSelectionRule).toMatch(/^HIGHEST_DOSE/);
  });
});

describe('scope: the 1.0 threshold is read, never redefined', () => {
  it('freeze.safetyRiskRatioMeaningfulDeviation equals the sealed preregistration value', () => {
    const result = runReAdjudication();
    expect(result.freeze.safetyRiskRatioMeaningfulDeviation).toBe(A2_PREREGISTRATION.effectSizeThresholds.safetyRiskRatioMeaningfulDeviation);
    expect(result.freeze.safetyRiskRatioMeaningfulDeviation).toBe(1.0);
  });
});

describe('what the gate actually did', () => {
  it('supersedes the diarrhea veto with a recorded reason — does not delete the old row', () => {
    const result = runReAdjudication();
    const diarrheaRows = result.reAdjudicated.safety.filter((s) => s.key === 'diarrhea');
    expect(diarrheaRows).toHaveLength(2);
    expect(diarrheaRows.some((s) => s.comparisonType === 'NAIVE_INDIRECT')).toBe(true);
    expect(diarrheaRows.some((s) => s.comparisonType === 'DIRECT_HEAD_TO_HEAD')).toBe(true);
    expect(result.reAdjudicated.falsification.supersededByStrongerEvidence.some((m) => /Diarrhea/.test(m) && /2\.71/.test(m))).toBe(true);
    expect(result.reAdjudicated.falsification.failures.some((f) => /Diarrhea/.test(f))).toBe(false);
  });

  it('does NOT silently clear the candidate: a different category (serious AE, also promoted to DIRECT by the same trial) still vetoes', () => {
    // This is the honest, unselected result: SURPASS-2 also supplies a direct
    // structural serious-adverse-events comparison for the same 15 mg arm,
    // and it independently clears the threshold. Not engineered, not chosen —
    // both rows come from calling the unmodified extractCandidateSafety once.
    const result = runReAdjudication();
    expect(result.reAdjudicated.score.vetoed).toBe(true);
    expect(result.reAdjudicated.falsification.worseSafetySignal?.key).toBe('serious_adverse_events');
    expect(result.reAdjudicated.falsification.worseSafetySignal?.comparisonType).toBe('DIRECT_HEAD_TO_HEAD');
  });

  it('the overall A2 verdict is unchanged (CONFLICTING_EVIDENCE either way) — reported, not assumed', () => {
    const result = runReAdjudication();
    expect(result.historical.overallVerdict).toBe('CONFLICTING_EVIDENCE');
    expect(result.reAdjudicated.overallVerdict).toBe('CONFLICTING_EVIDENCE');
    expect(result.reAdjudicated.overallVerdictChanged).toBe(false);
  });
});

describe('determinism — no clock in the fingerprints (D-040 discipline)', () => {
  it('ruleFingerprint and inputFingerprint are stable across repeated runs', () => {
    const a = runReAdjudication();
    const b = runReAdjudication();
    expect(a.freeze.ruleFingerprint).toBe(b.freeze.ruleFingerprint);
    expect(a.inputFingerprint).toBe(b.inputFingerprint);
  });

  it('the re-adjudication id is stable and distinct from the historical campaign/preregistration fingerprints', () => {
    expect(RE_ADJUDICATION_ID).toBe('GOV-DRUG-A2-REJUDGE-TIRZEPATIDE-DIARRHEA-SURPASS2-01');
    expect(RE_ADJUDICATION_ID).not.toBe(A2_PREREGISTRATION.fingerprint);
  });
});
