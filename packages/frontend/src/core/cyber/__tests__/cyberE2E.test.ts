/**
 * Genesis Cyber Reasoning Engine — E2E Acceptance Test
 *
 * This test runs the ENTIRE chain from start to finish.
 * It FAILS if ANY stage is skipped.
 * It FAILS if fixture metadata is directly mapped to verdict.
 * It FAILS if any stage produces empty results.
 */

import { describe, it, expect } from 'vitest';
import { runCyberReasoningE2E } from '../cyberReasoningEngine';

describe('Genesis Cyber Reasoning Engine — E2E', () => {
  it('executes the complete E2E chain without skipping any stage', () => {
    const investigation = runCyberReasoningE2E();

    // ================================================================
    // STAGE 1: OBSERVATION — must produce observations
    // ================================================================
    expect(investigation.observations.length).toBeGreaterThan(0);
    for (const obs of investigation.observations) {
      expect(obs.observationId).toBeTruthy();
      expect(obs.dataProvenance).toBeTruthy();
    }

    // ================================================================
    // STAGE 2: ATTACK SURFACE — must enumerate assets
    // ================================================================
    expect(investigation.attackSurface).toBeTruthy();
    expect(investigation.attackSurface.assets.length).toBeGreaterThan(0);
    expect(investigation.attackSurface.totalExposed).toBeGreaterThan(0);

    // ================================================================
    // STAGE 3: HYPOTHESES — must generate at least 2
    // ================================================================
    expect(investigation.hypotheses.length).toBeGreaterThanOrEqual(2);
    for (const hyp of investigation.hypotheses) {
      expect(hyp.hypothesisId).toBeTruthy();
      expect(hyp.statement).toBeTruthy();
      expect(hyp.falsifier).toBeTruthy();
      expect(hyp.prediction).toBeTruthy();
      expect(hyp.prediction.expectedObservable).toBeTruthy();
      expect(hyp.prediction.falsifyingObservable).toBeTruthy();
    }

    // ================================================================
    // STAGE 4: TEST SPECS — must have a test for each hypothesis
    // ================================================================
    expect(investigation.testSpecs.length).toBe(investigation.hypotheses.length);
    for (const spec of investigation.testSpecs) {
      expect(spec.testId).toBeTruthy();
      expect(spec.hypothesisId).toBeTruthy();
      expect(spec.safetyConstraints).toContain('SYNTHETIC_TARGET_ONLY');
    }

    // ================================================================
    // STAGE 5: TEST EXECUTION — must produce observed results
    // Results must come from EXECUTION, not fixture metadata.
    // ================================================================
    expect(investigation.testResults.length).toBe(investigation.testSpecs.length);
    for (const result of investigation.testResults) {
      expect(result.testId).toBeTruthy();
      expect(result.executedAt).toBeTruthy();
      expect(result.observedResult).toBeTruthy();
      expect(Object.keys(result.observedResult).length).toBeGreaterThan(0);
      expect(result.dataProvenance).toBe('SIMULATED');
    }

    // ================================================================
    // STAGE 6: EVIDENCE — must generate evidence for each test
    // ================================================================
    expect(investigation.evidence.length).toBe(investigation.testResults.length);
    for (const ev of investigation.evidence) {
      expect(ev.evidenceId).toBeTruthy();
      expect(ev.comparison).toBeTruthy();
      expect(ev.comparison.verdict).toBeTruthy();
      expect(['SUPPORTED', 'FALSIFIED', 'INCONCLUSIVE', 'BLOCKED']).toContain(ev.comparison.verdict);
    }

    // ================================================================
    // STAGE 7: VERDICTS — must have verdict for each hypothesis
    // At least one SUPPORTED and at least one FALSIFIED.
    // ================================================================
    expect(investigation.verdicts.size).toBe(investigation.hypotheses.length);

    const allVerdicts = [...investigation.verdicts.values()];
    expect(allVerdicts).toContain('SUPPORTED');
    expect(allVerdicts).toContain('FALSIFIED');

    // Verify: the IDOR hypothesis (hyp2) must be FALSIFIED
    // because the toy app actually checks ownership.
    // This verdict comes from execution, not metadata.
    const hyp2 = investigation.hypotheses.find((h) => h.vulnClass === 'BROKEN_ACCESS_CONTROL');
    expect(hyp2).toBeTruthy();
    expect(investigation.verdicts.get(hyp2!.hypothesisId)).toBe('FALSIFIED');

    // Verify: the auth bypass hypothesis (hyp1) must be SUPPORTED
    const hyp1 = investigation.hypotheses.find((h) => h.vulnClass === 'AUTH_BYPASS');
    expect(hyp1).toBeTruthy();
    expect(investigation.verdicts.get(hyp1!.hypothesisId)).toBe('SUPPORTED');

    // ================================================================
    // STAGE 8: ATTACK PATH — must construct and verify path
    // ================================================================
    expect(investigation.attackPaths.length).toBeGreaterThan(0);
    for (const path of investigation.attackPaths) {
      expect(path.pathId).toBeTruthy();
      expect(path.nodes.length).toBeGreaterThan(0);
      expect(path.overallStatus).toBeTruthy();
      expect(path.verificationCoverage).toBeGreaterThanOrEqual(0);
      expect(path.verificationCoverage).toBeLessThanOrEqual(1);
    }

    // The two SUPPORTED hypotheses (AUTH_BYPASS, INJECTION) chain into one
    // reachable, correctly-ordered, coherent path — it should read VERIFIED,
    // not merely PARTIALLY_VERIFIED from node/edge status alone.
    expect(investigation.attackPaths[0]?.overallStatus).toBe('VERIFIED');

    // ================================================================
    // STAGE 9: REMEDIATION — must remediate and independently re-test
    // ================================================================
    expect(investigation.remediations.length).toBeGreaterThan(0);
    for (const rem of investigation.remediations) {
      expect(rem.remediationId).toBeTruthy();
      expect(rem.retestResult).toBeTruthy();
      expect(rem.retestResult.observedResult).toBeTruthy();
      expect(['VERIFIED', 'FAILED', 'DRIFT', 'BLOCKED']).toContain(rem.outcomeVerdict);
      // The re-test must have been executed (has observedResult)
      expect(Object.keys(rem.retestResult.observedResult).length).toBeGreaterThan(0);
    }

    // Verify: remediation should be VERIFIED (auth fix works) — the
    // observed status really does flip from 200 to 403 after the fix is
    // applied, and the before/after comparison uses one consistent
    // convention (see cyberRemediation.ts) to read that correctly.
    expect(investigation.remediations[0]?.outcomeVerdict).toBe('VERIFIED');
    expect(investigation.remediations[0]?.beforeVerdict).toBe('SUPPORTED');
    expect(investigation.remediations[0]?.afterVerdict).toBe('FALSIFIED');
    expect(investigation.remediations[0]?.retestResult.observedResult['httpStatus']).toBe(403);

    // ================================================================
    // STAGE 10: MEMORY — must produce replay fingerprint
    // ================================================================
    expect(investigation.replayFingerprint).toBeTruthy();
    // Real SHA-256 hex digest, not a small non-cryptographic hash.
    expect(investigation.replayFingerprint).toMatch(/^[0-9a-f]{64}$/);

    // ================================================================
    // STAGE 11: NEXT QUESTION — must generate next question
    // ================================================================
    expect(investigation.nextQuestion).toBeTruthy();
    expect(investigation.nextQuestion!.length).toBeGreaterThan(0);

    // ================================================================
    // PROVENANCE — must be consistent
    // ================================================================
    expect(investigation.dataProvenance).toBe('SIMULATED');
    for (const ev of investigation.evidence) {
      expect(ev.dataProvenance).toBe('SIMULATED');
    }
    for (const result of investigation.testResults) {
      expect(result.dataProvenance).toBe('SIMULATED');
    }
  });

  it('does NOT produce fake success from fixture metadata', () => {
    const investigation = runCyberReasoningE2E();

    // The IDOR hypothesis must be FALSIFIED through execution,
    // not because fixture metadata says reachable=false.
    const hyp2 = investigation.hypotheses.find((h) => h.vulnClass === 'BROKEN_ACCESS_CONTROL');
    expect(hyp2).toBeTruthy();

    const hyp2Evidence = investigation.evidence.filter((e) => e.hypothesisId === hyp2!.hypothesisId);
    expect(hyp2Evidence.length).toBeGreaterThan(0);

    // The evidence must have a real comparison with observed result
    for (const ev of hyp2Evidence) {
      expect(ev.comparison.metricComparisons.length).toBeGreaterThan(0);
      // The observed httpStatus must be 403 (ownership check works)
      const statusComparison = ev.comparison.metricComparisons.find((m) => m.fieldName === 'httpStatus');
      expect(statusComparison).toBeTruthy();
      expect(statusComparison!.observedValue).toBe(403);
    }

    // Verdict must be FALSIFIED because observed 403 matches falsifyingObservable
    expect(investigation.verdicts.get(hyp2!.hypothesisId)).toBe('FALSIFIED');
  });

  it('produces deterministic results on re-run', () => {
    const run1 = runCyberReasoningE2E();
    const run2 = runCyberReasoningE2E();

    // Same hypotheses generated
    expect(run1.hypotheses.length).toBe(run2.hypotheses.length);

    // Same verdicts
    for (const [hypId, verdict] of run1.verdicts) {
      expect(run2.verdicts.get(hypId)).toBe(verdict);
    }

    // Same number of evidence items
    expect(run1.evidence.length).toBe(run2.evidence.length);

    // Same replay fingerprint — same canonical shape hashed the same way
    expect(run1.replayFingerprint).toBe(run2.replayFingerprint);

    // Same remediation outcome
    expect(run1.remediations.length).toBe(run2.remediations.length);
    if (run1.remediations.length > 0) {
      expect(run1.remediations[0]!.outcomeVerdict).toBe(run2.remediations[0]!.outcomeVerdict);
    }
  });
});
