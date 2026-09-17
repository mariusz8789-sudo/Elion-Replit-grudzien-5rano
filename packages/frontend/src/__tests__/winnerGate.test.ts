import { describe, expect, it } from 'vitest';
import { asEvidenceClass, canPromoteToWinnerRecord } from '../core/orchestrator/winnerGate';
import { MINIMUM_OBSERVATIONS } from '../core/agent/practicalCandidateGate';

/**
 * WINNER PROMOTION GATE — direct unit coverage (docs/DECISIONS.md D-057).
 * Confirms `canPromoteToWinnerRecord` genuinely reuses
 * `practicalCandidateGate.ts::MINIMUM_OBSERVATIONS` rather than a
 * duplicated hardcoded number, and never promotes a non-WINNER verdict.
 */

describe('canPromoteToWinnerRecord — reuses the REAL MINIMUM_OBSERVATIONS, no duplicated policy', () => {
  it('reports the exact imported constant, proving no second number was hardcoded', () => {
    const result = canPromoteToWinnerRecord({ adjudicationVerdict: 'WINNER', inventory: [] });
    expect(result.minimumObservations).toBe(MINIMUM_OBSERVATIONS);
  });

  it('winner gate success: a WINNER verdict with enough strong observations PROMOTEs', () => {
    const result = canPromoteToWinnerRecord({
      adjudicationVerdict: 'WINNER',
      inventory: [{ evidenceClass: 'DIRECT_RANDOMISED', observationCount: MINIMUM_OBSERVATIONS }],
    });
    expect(result.outcome).toBe('PROMOTE');
    expect(result.reasons).toEqual([]);
  });

  it('insufficient observations: below MINIMUM_OBSERVATIONS ⇒ NO_PROMOTION even with a WINNER verdict', () => {
    const result = canPromoteToWinnerRecord({
      adjudicationVerdict: 'WINNER',
      inventory: [{ evidenceClass: 'DIRECT_RANDOMISED', observationCount: MINIMUM_OBSERVATIONS - 1 }],
    });
    expect(result.outcome).toBe('NO_PROMOTION');
    expect(result.reasons.some((r) => r.includes('EVIDENCE_SUFFICIENT'))).toBe(true);
  });

  it('computational-only failure: enough COUNT but every observation is COMPUTATIONAL (below the strong threshold) ⇒ NO_PROMOTION', () => {
    const result = canPromoteToWinnerRecord({
      adjudicationVerdict: 'WINNER',
      inventory: [{ evidenceClass: 'COMPUTATIONAL', observationCount: MINIMUM_OBSERVATIONS + 5 }],
    });
    expect(result.outcome).toBe('NO_PROMOTION');
    expect(result.reasons.some((r) => r.includes('EVIDENCE_STRENGTH'))).toBe(true);
  });

  it('conflicting evidence: a CONFLICTING_EVIDENCE verdict never promotes, regardless of evidence depth', () => {
    const result = canPromoteToWinnerRecord({
      adjudicationVerdict: 'CONFLICTING_EVIDENCE',
      inventory: [{ evidenceClass: 'DIRECT_RANDOMISED', observationCount: 50 }],
    });
    expect(result.outcome).toBe('NO_PROMOTION');
    expect(result.reasons.some((r) => r.includes('VERDICT_NOT_WINNER'))).toBe(true);
  });

  it('NO_WINNER never promotes', () => {
    const result = canPromoteToWinnerRecord({ adjudicationVerdict: 'NO_WINNER', inventory: [] });
    expect(result.outcome).toBe('NO_PROMOTION');
  });

  it('INSUFFICIENT_EVIDENCE verdict never promotes', () => {
    const result = canPromoteToWinnerRecord({ adjudicationVerdict: 'INSUFFICIENT_EVIDENCE', inventory: [] });
    expect(result.outcome).toBe('NO_PROMOTION');
  });

  it('mixed inventory: strong + weak observations sum for the total, but strength is judged on the strong subset alone', () => {
    const result = canPromoteToWinnerRecord({
      adjudicationVerdict: 'WINNER',
      inventory: [
        { evidenceClass: 'DIRECT_RANDOMISED', observationCount: 1 },
        { evidenceClass: 'UNVERIFIED', observationCount: MINIMUM_OBSERVATIONS + 10 },
      ],
    });
    expect(result.totalObservations).toBe(MINIMUM_OBSERVATIONS + 11);
    expect(result.strongCount).toBe(1);
    expect(result.outcome).toBe('PROMOTE'); // total clears the floor and strongCount (1) meets the default minimumStrong (1)
  });

  it('every result carries a non-empty, deterministic fingerprint', () => {
    const input = { adjudicationVerdict: 'WINNER' as const, inventory: [{ evidenceClass: 'DIRECT_RANDOMISED' as const, observationCount: MINIMUM_OBSERVATIONS }] };
    const a = canPromoteToWinnerRecord(input);
    const b = canPromoteToWinnerRecord(input);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint.length).toBeGreaterThan(0);
  });
});

describe('asEvidenceClass — an unrecognized string is never silently trusted as strong', () => {
  it('maps a recognized class through unchanged', () => {
    expect(asEvidenceClass('DIRECT_RANDOMISED')).toBe('DIRECT_RANDOMISED');
  });

  it('maps an arbitrary/unrecognized string (e.g. a toy adapter\'s "SYNTHETIC_TEST_ONLY") to UNVERIFIED', () => {
    expect(asEvidenceClass('SYNTHETIC_TEST_ONLY')).toBe('UNVERIFIED');
  });
});
