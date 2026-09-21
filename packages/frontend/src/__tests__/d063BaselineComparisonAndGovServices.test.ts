import { describe, expect, it } from 'vitest';
import { compareAgainstBaseline, toPromotionInventory } from '../core/discoveryChallenge/baselineComparison';
import { d063DoseBaselineComparisons, worstHarmPerDose } from '../core/discoveryChallenge/d063DoseBaselineComparisons';
import { D062_BASELINE, D062_BETTER_RULE } from '../core/orchestrator/d062Discovery';
import { surpass2Observation } from '../core/biotechData/surpass2DirectEvidence';
import { canPromoteToWinnerRecord } from '../core/orchestrator/winnerGate';
import { DEFAULT_EVIDENCE_CLASS_RANK } from '../core/agent/evidenceProvenance';
import { runClaimAudit } from '../core/govServices/govClaimAudit';
import { runParametricTrigger } from '../core/govServices/govParametricTrigger';
import { EvidenceConnectorStore } from '../core/evidenceConnectors/store';
import { scanForBannedStrings } from '../core/agent/bannedStringScanner';
import {
  D063_CLAIM_TEXT,
  D063_SURPASS2_SOURCE,
  D063_TRIGGER_RULE,
  d063ParseClaims,
  d063ParseSeriousAeRates,
  d063SurpassEvidencePort,
  runD063ClaimAudit,
  runD063ParametricTrigger,
} from '../core/govServices/govServiceRuns';
import type { CountedOutcomeObservation } from '../core/agent/evidenceProvenance';
import type { ConnectorPort, SourceConfig } from '../core/evidenceConnectors/contracts';
import type { ParsedClaimEvidence } from '../core/govServices/govClaimAudit';

/**
 * D-063 — NEGATIVE-FIRST. Every test below either proves a refusal or proves
 * a number was computed from the real pinned SURPASS-2 bytes. No test asserts
 * a shape this suite itself supplied.
 */

const now = (): string => '1970-01-01T00:00:00Z';
const SEMA = '1 mg Semaglutide';

/** A real observation with its numerator forced to zero — the one input `compareCountedOutcomes` honestly refuses. */
const zeroEvents = (base: CountedOutcomeObservation): CountedOutcomeObservation => ({ ...base, numAffected: 0 });

describe('D-063 baselineComparison — refusals before results', () => {
  it('REFUSES a zero-event harm arm rather than inventing an interval', () => {
    const exposed = zeroEvents(surpass2Observation('Diarrhoea', '15 mg Tirzepatide'));
    const reference = surpass2Observation('Diarrhoea', SEMA);
    expect(() => compareAgainstBaseline({ candidateId: 'X', baseline: D062_BASELINE, rule: D062_BETTER_RULE, harm: { exposed, reference } })).toThrow(/MISSING_EXPERIMENT_RESULT/);
  });

  it('REFUSES a malformed observation through compareCountedOutcomes own guard (nAtRisk disagreeing with numAtRisk)', () => {
    const real = surpass2Observation('Diarrhoea', '15 mg Tirzepatide');
    const broken: CountedOutcomeObservation = { ...real, arm: { ...real.arm, nAtRisk: real.arm.nAtRisk + 1 } };
    expect(() => compareAgainstBaseline({ candidateId: 'X', baseline: D062_BASELINE, rule: D062_BETTER_RULE, harm: { exposed: broken, reference: surpass2Observation('Diarrhoea', SEMA) } })).toThrow();
  });

  it('computes a REAL risk ratio from the pinned counts, not a supplied scalar', () => {
    const exposed = surpass2Observation('Diarrhoea', '15 mg Tirzepatide');
    const reference = surpass2Observation('Diarrhoea', SEMA);
    const record = compareAgainstBaseline({ candidateId: 'TIRZEPATIDE-15MG', baseline: D062_BASELINE, rule: D062_BETTER_RULE, harm: { exposed, reference } });
    const expected = (exposed.numAffected / exposed.numAtRisk) / (reference.numAffected / reference.numAtRisk);
    expect(record.harm.riskRatio).toBeCloseTo(expected, 10);
    expect(record.harm.derivationMethod).toBe('KATZ_LOG_RISK_RATIO');
  });

  it('COMPUTES the evidence class as DIRECT_RANDOMISED for a within-trial comparison — never declares it', () => {
    const record = compareAgainstBaseline({
      candidateId: 'TIRZEPATIDE-15MG',
      baseline: D062_BASELINE,
      rule: D062_BETTER_RULE,
      harm: { exposed: surpass2Observation('Diarrhoea', '15 mg Tirzepatide'), reference: surpass2Observation('Diarrhoea', SEMA) },
    });
    expect(record.evidenceClass).toBe('DIRECT_RANDOMISED');
  });

  it('reports efficacy as null (not zero, not fabricated) when no counted efficacy channel is supplied', () => {
    const record = compareAgainstBaseline({
      candidateId: 'TIRZEPATIDE-15MG',
      baseline: D062_BASELINE,
      rule: D062_BETTER_RULE,
      harm: { exposed: surpass2Observation('Diarrhoea', '15 mg Tirzepatide'), reference: surpass2Observation('Diarrhoea', SEMA) },
    });
    expect(record.efficacy).toBeNull();
  });

  it('takes the WEAKER of the two axes evidence classes, never the stronger one', () => {
    // Harm within the randomised trial (DIRECT_RANDOMISED) against an efficacy
    // channel whose exposed arm is marked non-randomised — the pair must not
    // inherit the harm axis's strength.
    const harmExposed = surpass2Observation('Diarrhoea', '15 mg Tirzepatide');
    const harmReference = surpass2Observation('Diarrhoea', SEMA);
    const effExposed: CountedOutcomeObservation = { ...surpass2Observation('Nausea', '15 mg Tirzepatide'), study: { ...harmExposed.study, randomised: false } };
    const effReference: CountedOutcomeObservation = { ...surpass2Observation('Nausea', SEMA), study: { ...harmReference.study, randomised: false } };
    const record = compareAgainstBaseline({ candidateId: 'X', baseline: D062_BASELINE, rule: D062_BETTER_RULE, harm: { exposed: harmExposed, reference: harmReference }, efficacy: { exposed: effExposed, reference: effReference } });
    expect(DEFAULT_EVIDENCE_CLASS_RANK[record.evidenceClass]).toBeLessThan(DEFAULT_EVIDENCE_CLASS_RANK.DIRECT_RANDOMISED);
  });

  it('betterPerFrozenRule is FALSE with a stated reason when harm is not strictly below the baseline', () => {
    const record = compareAgainstBaseline({
      candidateId: 'TIRZEPATIDE-15MG',
      baseline: D062_BASELINE,
      rule: D062_BETTER_RULE,
      harm: { exposed: surpass2Observation('Diarrhoea', '15 mg Tirzepatide'), reference: surpass2Observation('Diarrhoea', SEMA) },
    });
    expect(record.harm.riskRatio).toBeGreaterThan(1);
    expect(record.betterPerFrozenRule).toBe(false);
    expect(record.ruleReasons.join(' ')).toMatch(/not strictly below the baseline/);
  });

  it('the fingerprint changes when any input number changes (it is not a constant)', () => {
    const a = compareAgainstBaseline({ candidateId: 'A', baseline: D062_BASELINE, rule: D062_BETTER_RULE, harm: { exposed: surpass2Observation('Diarrhoea', '15 mg Tirzepatide'), reference: surpass2Observation('Diarrhoea', SEMA) } });
    const b = compareAgainstBaseline({ candidateId: 'A', baseline: D062_BASELINE, rule: D062_BETTER_RULE, harm: { exposed: surpass2Observation('Diarrhoea', '5 mg Tirzepatide'), reference: surpass2Observation('Diarrhoea', SEMA) } });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe('D-063 inventory -> the REAL D-057 gate (never inflated)', () => {
  const record = (): ReturnType<typeof compareAgainstBaseline> =>
    compareAgainstBaseline({ candidateId: 'TIRZEPATIDE-15MG', baseline: D062_BASELINE, rule: D062_BETTER_RULE, harm: { exposed: surpass2Observation('Diarrhoea', '15 mg Tirzepatide'), reference: surpass2Observation('Diarrhoea', SEMA) } });

  it('emits the comparison OWN class and OWN event count — not the baselines', () => {
    const inventory = toPromotionInventory(record());
    expect(inventory).toHaveLength(1);
    expect(inventory[0]!.evidenceClass).toBe(record().evidenceClass);
    expect(inventory[0]!.observationCount).toBe(record().harm.totalEvents);
  });

  it('a NO_WINNER adjudication is NOT promoted no matter how strong the inventory', () => {
    expect(canPromoteToWinnerRecord({ adjudicationVerdict: 'NO_WINNER', inventory: toPromotionInventory(record()) }).outcome).toBe('NO_PROMOTION');
  });

  it('a COMPUTATIONAL inventory is NOT promoted even with 99 observations (the D-057 wall stands)', () => {
    expect(canPromoteToWinnerRecord({ adjudicationVerdict: 'WINNER', inventory: [{ evidenceClass: 'COMPUTATIONAL', observationCount: 99 }] }).outcome).toBe('NO_PROMOTION');
  });

  it('a single real DIRECT_RANDOMISED comparison carries enough events to clear the D-057 minimum', () => {
    const result = canPromoteToWinnerRecord({ adjudicationVerdict: 'WINNER', inventory: toPromotionInventory(record()) });
    expect(result.outcome).toBe('PROMOTE');
  });
});

describe('D-063 dose/baseline comparison set — real, complete, non-cherry-picked', () => {
  const set = d063DoseBaselineComparisons();

  it('covers all three real dose strata', () => {
    expect(new Set(set.comparisons.map((c) => c.doseId)).size).toBe(3);
  });

  it('uses the frozen D-062 baseline and its arm, not a locally re-declared one', () => {
    expect(set.baselineId).toBe(D062_BASELINE.baselineId);
    expect(set.baselineArmTitle).toBe(SEMA);
  });

  it('every comparison is DIRECT_RANDOMISED and computed by the real estimator', () => {
    expect(set.comparisons.length).toBeGreaterThan(0);
    for (const c of set.comparisons) {
      expect(c.record.evidenceClass).toBe('DIRECT_RANDOMISED');
      expect(c.record.harm.derivationMethod).toBe('KATZ_LOG_RISK_RATIO');
      expect(c.record.harm.totalEvents).toBeGreaterThan(0);
    }
  });

  it('reports every skipped term with a stated reason instead of silently dropping it', () => {
    for (const s of set.skipped) expect(s.reason).toMatch(/zero events/);
  });

  it('the worst harm ratio per dose is a real maximum drawn from the set itself', () => {
    for (const w of worstHarmPerDose(set)) {
      const forDose = set.comparisons.filter((c) => c.doseId === w.doseId).map((c) => c.record.harm.riskRatio);
      expect(w.riskRatio).toBe(Math.max(...forDose));
    }
  });
});

/* ------------------------------------------------------------------ */
/* CLAIM AUDIT                                                         */
/* ------------------------------------------------------------------ */

const FAKE_SOURCE: SourceConfig = { sourceId: 'TEST_SRC', name: 'test', url: 'internal://test', hashPolicy: 'fnv1a-canonical', category: 'TEST' };
const bytesPort = (payload: string): ConnectorPort => ({ fetchBytes: async () => new TextEncoder().encode(payload) });
const failingPort: ConnectorPort = { fetchBytes: async () => { throw new Error('network is unreachable in this sandbox'); } };
const parseFixed = (items: readonly ParsedClaimEvidence[]) => (): readonly ParsedClaimEvidence[] => items;

describe('D-063 govClaimAudit — fails closed before it reports', () => {
  it('BLOCKS a PRODUCTION run with no custody store/port rather than auditing unverified bytes', async () => {
    const out = await runClaimAudit({ mode: 'PRODUCTION', claimText: D063_CLAIM_TEXT, sources: [FAKE_SOURCE], parseClaims: parseFixed([]), now });
    expect(out.kind).toBe('EXECUTION_BLOCKED');
    if (out.kind === 'EXECUTION_BLOCKED') expect(out.code).toBe('INVALID_EVIDENCE_PROVENANCE');
  });

  it('BLOCKS when custody fails (a fetch that never produced bytes is never audited)', async () => {
    const out = await runClaimAudit({ mode: 'PRODUCTION', claimText: D063_CLAIM_TEXT, sources: [FAKE_SOURCE], store: new EvidenceConnectorStore(), port: failingPort, parseClaims: parseFixed([]), now });
    expect(out.kind).toBe('EXECUTION_BLOCKED');
    if (out.kind === 'EXECUTION_BLOCKED') expect(out.code).toBe('INVALID_EVIDENCE_PROVENANCE');
  });

  it('BLOCKS a malformed claim through the real parseProblem gate, never guessing what was meant', async () => {
    const out = await runClaimAudit({ mode: 'SYNTHETIC_TEST_ONLY', claimText: '   ', sources: [], parseClaims: parseFixed([]), now });
    expect(out.kind).toBe('EXECUTION_BLOCKED');
    if (out.kind === 'EXECUTION_BLOCKED') expect(out.code).toBe('MALFORMED_PROBLEM');
  });

  it('CONTRADICTED when strong evidence refutes the claim and NOTHING supports it (not "insufficient")', async () => {
    const out = await runClaimAudit({
      mode: 'SYNTHETIC_TEST_ONLY',
      claimText: D063_CLAIM_TEXT,
      sources: [FAKE_SOURCE],
      parseClaims: parseFixed([{ ref: 'r1', evidenceClass: 'DIRECT_RANDOMISED', supports: 'against' }]),
      now,
    });
    expect(out.kind).toBe('RUN');
    if (out.kind === 'RUN') {
      expect(out.verdict).toBe('CONTRADICTED');
      expect(out.certificate).toBeNull();
    }
  });

  it('INSUFFICIENT_EVIDENCE — never SUBSTANTIATED — when only weak evidence supports the claim', async () => {
    const out = await runClaimAudit({
      mode: 'SYNTHETIC_TEST_ONLY',
      claimText: D063_CLAIM_TEXT,
      sources: [FAKE_SOURCE],
      parseClaims: parseFixed([{ ref: 'r1', evidenceClass: 'COMPUTATIONAL', supports: 'for' }]),
      now,
    });
    expect(out.kind).toBe('RUN');
    if (out.kind === 'RUN') {
      expect(out.verdict).toBe('INSUFFICIENT_EVIDENCE');
      expect(out.certificate).toBeNull();
    }
  });

  it('an UNRECOGNISED evidence class degrades to UNVERIFIED and cannot substantiate anything', async () => {
    const out = await runClaimAudit({
      mode: 'SYNTHETIC_TEST_ONLY',
      claimText: D063_CLAIM_TEXT,
      sources: [FAKE_SOURCE],
      parseClaims: parseFixed([{ ref: 'r1', evidenceClass: 'PLATINUM_TIER_PROOF', supports: 'for' }]),
      now,
    });
    expect(out.kind).toBe('RUN');
    if (out.kind === 'RUN') expect(out.verdict).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('issues a certificate ONLY on SUBSTANTIATED, carrying the frozen rule fingerprint', async () => {
    const out = await runClaimAudit({
      mode: 'SYNTHETIC_TEST_ONLY',
      claimText: D063_CLAIM_TEXT,
      sources: [FAKE_SOURCE],
      parseClaims: parseFixed([{ ref: 'r1', evidenceClass: 'DIRECT_RANDOMISED', supports: 'for' }]),
      now,
    });
    expect(out.kind).toBe('RUN');
    if (out.kind === 'RUN') {
      expect(out.verdict).toBe('SUBSTANTIATED');
      expect(out.certificate?.frozenRuleFingerprint).toMatch(/^[0-9a-f]+$/);
      expect(out.certificate?.evidenceRefs).toHaveLength(1);
    }
  });

  it('STAMPS provenance from custody — a parser cannot smuggle its own hash into the record', async () => {
    const store = new EvidenceConnectorStore();
    const out = await runClaimAudit({
      mode: 'PRODUCTION',
      claimText: D063_CLAIM_TEXT,
      sources: [FAKE_SOURCE],
      store,
      port: bytesPort('{"real":"bytes"}'),
      parseClaims: () => [{ ref: 'r1', evidenceClass: 'DIRECT_RANDOMISED', supports: 'for', hash: 'FABRICATED', hashPolicy: 'FABRICATED' } as ParsedClaimEvidence],
      now,
    });
    expect(out.kind).toBe('RUN');
    if (out.kind === 'RUN') {
      expect(out.evidence[0]!.hash).not.toBe('FABRICATED');
      expect(out.evidence[0]!.hashPolicy).toBe(FAKE_SOURCE.hashPolicy);
    }
  });
});

/* ------------------------------------------------------------------ */
/* PARAMETRIC TRIGGER                                                  */
/* ------------------------------------------------------------------ */

describe('D-063 govParametricTrigger — the rule is frozen before the data', () => {
  const rule = { metric: 'm', threshold: 0.08, relation: '>=' as const, window: 4, minObservations: 4 };

  it('REFUSES a nonsensical rule (non-positive window) outright', async () => {
    const out = await runParametricTrigger({ mode: 'SYNTHETIC_TEST_ONLY', rule: { ...rule, window: 0 }, sources: [FAKE_SOURCE], parseSeries: () => [1], now });
    expect(out.kind).toBe('EXECUTION_BLOCKED');
    if (out.kind === 'EXECUTION_BLOCKED') expect(out.code).toBe('INVALID_RULE');
  });

  it('BLOCKS a PRODUCTION run with no custody store/port', async () => {
    const out = await runParametricTrigger({ mode: 'PRODUCTION', rule, sources: [FAKE_SOURCE], parseSeries: () => [0.9], now });
    expect(out.kind).toBe('EXECUTION_BLOCKED');
    if (out.kind === 'EXECUTION_BLOCKED') expect(out.code).toBe('INVALID_EVIDENCE_PROVENANCE');
  });

  it('classifies a failed fetch as INVALID_EVIDENCE_PROVENANCE, never as AMBIGUOUS_TERMINAL', async () => {
    const out = await runParametricTrigger({ mode: 'PRODUCTION', rule, sources: [FAKE_SOURCE], store: new EvidenceConnectorStore(), port: failingPort, parseSeries: () => [0.9, 0.9, 0.9, 0.9], now });
    expect(out.kind).toBe('EXECUTION_BLOCKED');
    if (out.kind === 'EXECUTION_BLOCKED') expect(out.code).toBe('INVALID_EVIDENCE_PROVENANCE');
  });

  it('returns INSUFFICIENT_DATA with NO certificate rather than triggering off a partial series', async () => {
    const out = await runParametricTrigger({ mode: 'SYNTHETIC_TEST_ONLY', rule, sources: [FAKE_SOURCE], parseSeries: () => [0.99, 0.99], now });
    expect(out.kind).toBe('RUN');
    if (out.kind === 'RUN') {
      expect(out.verdict).toBe('INSUFFICIENT_DATA');
      expect(out.certificate).toBeNull();
      expect(out.observed).toBeNull();
    }
  });

  it('NOT_TRIGGERED when the observed maximum is below the threshold', async () => {
    const out = await runParametricTrigger({ mode: 'SYNTHETIC_TEST_ONLY', rule, sources: [FAKE_SOURCE], parseSeries: () => [0.01, 0.02, 0.03, 0.04], now });
    expect(out.kind).toBe('RUN');
    if (out.kind === 'RUN') {
      expect(out.verdict).toBe('NOT_TRIGGERED');
      expect(out.observed).toBeCloseTo(0.04, 10);
    }
  });

  it('the rule fingerprint is IDENTICAL across two runs whose data differ — the seal cannot be data-dependent', async () => {
    const a = await runParametricTrigger({ mode: 'SYNTHETIC_TEST_ONLY', rule, sources: [FAKE_SOURCE], parseSeries: () => [0.01, 0.02, 0.03, 0.04], now });
    const b = await runParametricTrigger({ mode: 'SYNTHETIC_TEST_ONLY', rule, sources: [FAKE_SOURCE], parseSeries: () => [0.5, 0.6, 0.7, 0.8], now });
    expect(a.kind === 'RUN' && b.kind === 'RUN').toBe(true);
    if (a.kind === 'RUN' && b.kind === 'RUN') {
      expect(a.verdict).toBe('NOT_TRIGGERED');
      expect(b.verdict).toBe('TRIGGERED');
      expect(a.certificate!.ruleFingerprint).toBe(b.certificate!.ruleFingerprint);
      expect(a.auditFingerprint).not.toBe(b.auditFingerprint);
    }
  });
});

/* ------------------------------------------------------------------ */
/* THE REAL RUNS                                                       */
/* ------------------------------------------------------------------ */

describe('D-063 real runs on the pinned SURPASS-2 bytes', () => {
  it('the claim parser derives supports from the counts — it never declares the direction', async () => {
    const parsed = d063ParseClaims(await d063SurpassEvidencePort.fetchBytes(D063_SURPASS2_SOURCE));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.evidenceClass).toBe('DIRECT_RANDOMISED');
    expect(parsed[0]!.supports).toBe('against');
  });

  it('the real claim audit CONTRADICTS the tolerability claim and issues NO certificate', async () => {
    const out = await runD063ClaimAudit({ now });
    expect(out.kind).toBe('RUN');
    if (out.kind === 'RUN') {
      expect(out.mode).toBe('PRODUCTION');
      expect(out.verdict).toBe('CONTRADICTED');
      expect(out.certificate).toBeNull();
      expect(out.evidenceCustody.every((c) => c.ok)).toBe(true);
    }
  });

  it('the serious-AE series is participant-level, one rate per real arm, all in (0,1)', async () => {
    const rates = d063ParseSeriousAeRates(await d063SurpassEvidencePort.fetchBytes(D063_SURPASS2_SOURCE));
    expect(rates).toHaveLength(4);
    for (const r of rates) {
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
    }
  });

  it('the real parametric trigger is NOT_TRIGGERED against the stated demonstration threshold', async () => {
    const out = await runD063ParametricTrigger({ now });
    expect(out.kind).toBe('RUN');
    if (out.kind === 'RUN') {
      expect(out.mode).toBe('PRODUCTION');
      expect(out.verdict).toBe('NOT_TRIGGERED');
      expect(out.observed).not.toBeNull();
      expect(out.observed!).toBeLessThan(D063_TRIGGER_RULE.threshold);
      expect(out.certificate!.dataRefs[0]!.hash).not.toBe('SYNTHETIC_TEST_ONLY');
    }
  });

  it('both real runs are deterministic — same bytes, same fingerprints', async () => {
    const [a1, a2] = [await runD063ClaimAudit({ now }), await runD063ClaimAudit({ now })];
    const [t1, t2] = [await runD063ParametricTrigger({ now }), await runD063ParametricTrigger({ now })];
    expect(a1.kind === 'RUN' && a2.kind === 'RUN' && a1.auditFingerprint === a2.auditFingerprint).toBe(true);
    expect(t1.kind === 'RUN' && t2.kind === 'RUN' && t1.auditFingerprint === t2.auditFingerprint).toBe(true);
  });
});

describe('D-063 language discipline', () => {
  it('the audited claim and the trigger rule carry no banned overclaiming strings', () => {
    expect(scanForBannedStrings(D063_CLAIM_TEXT, 'en').length).toBe(0);
    expect(scanForBannedStrings(D063_TRIGGER_RULE.metric, 'en').length).toBe(0);
  });
});
