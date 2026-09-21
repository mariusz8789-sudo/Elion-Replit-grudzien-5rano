import { describe, expect, it } from 'vitest';
import {
  audit,
  compare,
  execute,
  freeze,
  preRegister,
  readjudicate,
  printReport,
  GENESIS_RECIPE,
  type AuditedEvidenceRecord,
  type ComparisonNarrative,
} from '../core/agent/genesisAdjudicationProtocol';

interface Rule {
  readonly threshold: number;
  readonly doseSelectionRule: string;
  readonly policy: 'A' | 'B';
}

const DECLARED_AT = '2026-01-01T00:00:00.000Z';

function evidence(overrides: Partial<AuditedEvidenceRecord> = {}): AuditedEvidenceRecord {
  return { source: 'TestRegistry', sourceId: 'STUDY-1', hash: 'abc123', custodyStatus: 'PINNED_VERIFIED', evidenceClass: 'DIRECT_RANDOMISED', classificationMethod: 'test', rankingFingerprint: 'rf1', ...overrides };
}

function rule(overrides: Partial<Rule> = {}): Rule {
  return { threshold: 1.0, doseSelectionRule: 'HIGHEST_DOSE', policy: 'A', ...overrides };
}

describe('preRegister — item A/B: must exist and be complete before anything else can happen', () => {
  it('rejects an empty protocolId', () => {
    expect(() => preRegister({ protocolId: '', subjectId: 's', question: 'q', rule: rule(), declaredAt: DECLARED_AT })).toThrow(/protocolId/);
  });
  it('rejects an empty subjectId', () => {
    expect(() => preRegister({ protocolId: 'p', subjectId: '', question: 'q', rule: rule(), declaredAt: DECLARED_AT })).toThrow(/subjectId/);
  });
  it('rejects an empty question — a rule frozen for no stated question cannot be audited', () => {
    expect(() => preRegister({ protocolId: 'p', subjectId: 's', question: '', rule: rule(), declaredAt: DECLARED_AT })).toThrow(/question/);
  });
  it('rejects a non-object rule (cannot be fingerprinted/diffed)', () => {
    expect(() => preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: 'not-an-object' as unknown as Rule, declaredAt: DECLARED_AT })).toThrow(/plain object/);
  });
});

describe('freeze — item B: cannot run out of order', () => {
  it('refuses a record that is not in PRE_REGISTRATION phase', () => {
    const pre = preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: rule(), declaredAt: DECLARED_AT });
    const frozen = freeze(pre, DECLARED_AT);
    // @ts-expect-error — deliberately feeding a FROZEN record where a PRE_REGISTRATION one is required
    expect(() => freeze(frozen, DECLARED_AT)).toThrow(/PRE_REGISTRATION.*FROZEN/s);
  });

  it('the ruleFingerprint is a pure function of the rule, not of when it was frozen', () => {
    const pre = preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: rule(), declaredAt: DECLARED_AT });
    const a = freeze(pre, '2020-01-01T00:00:00.000Z');
    const b = freeze(pre, '2099-12-31T23:59:59.000Z');
    expect(a.ruleFingerprint).toBe(b.ruleFingerprint);
  });
});

describe('execute — item C/G: HARK guard #1, fail closed if the rule moved after freeze', () => {
  it('refuses when the rule passed to execute differs from what was frozen', () => {
    const frozen = freeze(preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: rule(), declaredAt: DECLARED_AT }), DECLARED_AT);
    expect(() =>
      execute(frozen, { rule: rule({ threshold: 999 }), evidenceUsed: [evidence()], runResult: () => 'x' }),
    ).toThrow(/HARK GUARD.*does not match the rule frozen/s);
  });

  it('proceeds when the rule is unchanged', () => {
    const r = rule();
    const frozen = freeze(preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: r, declaredAt: DECLARED_AT }), DECLARED_AT);
    expect(() => execute(frozen, { rule: r, evidenceUsed: [evidence()], runResult: () => 'x' })).not.toThrow();
  });

  it('refuses to run out of order (not FROZEN)', () => {
    const pre = preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: rule(), declaredAt: DECLARED_AT });
    // @ts-expect-error — deliberately feeding a PRE_REGISTRATION record where FROZEN is required
    expect(() => execute(pre, { rule: rule(), evidenceUsed: [evidence()], runResult: () => 'x' })).toThrow(/expected a "FROZEN"/);
  });
});

describe('execute — item F/L: dead-evidence protection, no result without evidence', () => {
  it('refuses execution with zero evidence records', () => {
    const r = rule();
    const frozen = freeze(preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: r, declaredAt: DECLARED_AT }), DECLARED_AT);
    expect(() => execute(frozen, { rule: r, evidenceUsed: [], runResult: () => 'x' })).toThrow(/no evidence supplied/);
  });
});

describe('execute — item E: every evidence record must carry a full identity', () => {
  const r = rule();
  const frozen = () => freeze(preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: r, declaredAt: DECLARED_AT }), DECLARED_AT);

  it('rejects an evidence record with an empty source', () => {
    expect(() => execute(frozen(), { rule: r, evidenceUsed: [evidence({ source: '' })], runResult: () => 'x' })).toThrow(/empty source/);
  });
  it('rejects an evidence record with an empty sourceId', () => {
    expect(() => execute(frozen(), { rule: r, evidenceUsed: [evidence({ sourceId: '' })], runResult: () => 'x' })).toThrow(/empty sourceId/);
  });
  it('rejects PINNED_VERIFIED custody with no hash — unverifiable custody', () => {
    expect(() => execute(frozen(), { rule: r, evidenceUsed: [evidence({ hash: null })], runResult: () => 'x' })).toThrow(/claims custody.*no hash/s);
  });
  it('allows NO_ACCESS custody with no hash — honest absence is not a violation', () => {
    expect(() => execute(frozen(), { rule: r, evidenceUsed: [evidence({ hash: null, custodyStatus: 'NO_ACCESS' })], runResult: () => 'x' })).not.toThrow();
  });
  it('rejects an evidence record with no evidenceClass', () => {
    expect(() => execute(frozen(), { rule: r, evidenceUsed: [evidence({ evidenceClass: '' })], runResult: () => 'x' })).toThrow(/no evidenceClass/);
  });
  it('rejects an evidence record with no classificationMethod — an unattributed classification cannot be audited', () => {
    expect(() => execute(frozen(), { rule: r, evidenceUsed: [evidence({ classificationMethod: '' })], runResult: () => 'x' })).toThrow(/does not name the method that classified it/);
  });
});

describe('execute — item I: reproducibility is enforced at the moment of use, not assumed', () => {
  it('refuses a runResult that returns different output on repeated calls with the same input', () => {
    const r = rule();
    const frozen = freeze(preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: r, declaredAt: DECLARED_AT }), DECLARED_AT);
    let call = 0;
    expect(() =>
      execute(frozen, { rule: r, evidenceUsed: [evidence()], runResult: () => { call += 1; return call; } }),
    ).toThrow(/REPRODUCIBILITY GUARD/);
  });

  it('accepts a deterministic runResult (called twice internally, silently)', () => {
    const r = rule();
    const frozen = freeze(preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: r, declaredAt: DECLARED_AT }), DECLARED_AT);
    let calls = 0;
    const executed = execute(frozen, { rule: r, evidenceUsed: [evidence()], runResult: () => { calls += 1; return { fixed: 42 }; } });
    expect(calls).toBe(2);
    expect(executed.result).toEqual({ fixed: 42 });
  });

  it('the same inputFingerprint is produced for the same rule+evidence, and a different one for different evidence', () => {
    const r = rule();
    const frozen = freeze(preRegister({ protocolId: 'p', subjectId: 's', question: 'q', rule: r, declaredAt: DECLARED_AT }), DECLARED_AT);
    const a = execute(frozen, { rule: r, evidenceUsed: [evidence()], runResult: () => 'x' });
    const b = execute(frozen, { rule: r, evidenceUsed: [evidence()], runResult: () => 'x' });
    const c = execute(frozen, { rule: r, evidenceUsed: [evidence({ sourceId: 'DIFFERENT' })], runResult: () => 'x' });
    expect(a.inputFingerprint).toBe(b.inputFingerprint);
    expect(a.inputFingerprint).not.toBe(c.inputFingerprint);
  });
});

describe('readjudicate — item C/D: HARK guard #2, only declared rule fields may differ', () => {
  function executed(overrides: Partial<Rule> = {}, protocolId = 'p') {
    const r = rule(overrides);
    return execute(freeze(preRegister({ protocolId, subjectId: 's', question: 'q', rule: r, declaredAt: DECLARED_AT }), DECLARED_AT), { rule: r, evidenceUsed: [evidence()], runResult: () => 'x' });
  }

  it('refuses when an undeclared field changed', () => {
    const historical = executed();
    const next = executed({ threshold: 2.0 });
    expect(() => readjudicate(historical, next, ['doseSelectionRule'])).toThrow(/undeclared rule field\(s\): threshold/);
  });

  it('allows when only the declared field changed', () => {
    const historical = executed();
    const next = executed({ policy: 'B' });
    expect(() => readjudicate(historical, next, ['policy'])).not.toThrow();
    expect(readjudicate(historical, next, ['policy']).changedRuleFields).toEqual(['policy']);
  });

  it('allows zero changes (a pure re-run) with an empty allow-list', () => {
    const historical = executed();
    const next = executed();
    expect(() => readjudicate(historical, next, [])).not.toThrow();
  });

  it('refuses when the subjectId differs — this is not the same adjudication', () => {
    const historical = execute(freeze(preRegister({ protocolId: 'p1', subjectId: 'CANDIDATE-A', question: 'q', rule: rule(), declaredAt: DECLARED_AT }), DECLARED_AT), { rule: rule(), evidenceUsed: [evidence()], runResult: () => 'x' });
    const next = execute(freeze(preRegister({ protocolId: 'p2', subjectId: 'CANDIDATE-B', question: 'q', rule: rule(), declaredAt: DECLARED_AT }), DECLARED_AT), { rule: rule(), evidenceUsed: [evidence()], runResult: () => 'x' });
    expect(() => readjudicate(historical, next, [])).toThrow(/subjectId mismatch/);
  });

  it('refuses to run out of order', () => {
    const historical = executed();
    const pre = preRegister({ protocolId: 'p3', subjectId: 's', question: 'q', rule: rule(), declaredAt: DECLARED_AT });
    // @ts-expect-error — deliberately feeding a PRE_REGISTRATION record
    expect(() => readjudicate(historical, pre, [])).toThrow(/expected a "EXECUTED"/);
  });
});

describe('compare — item G: the narrative may not be silent about what changed or why', () => {
  function readjudicated() {
    const historical = execute(freeze(preRegister({ protocolId: 'p1', subjectId: 's', question: 'q', rule: rule(), declaredAt: DECLARED_AT }), DECLARED_AT), { rule: rule(), evidenceUsed: [evidence()], runResult: () => 'old' });
    const next = execute(freeze(preRegister({ protocolId: 'p2', subjectId: 's', question: 'q', rule: rule({ policy: 'B' }), declaredAt: DECLARED_AT }), DECLARED_AT), { rule: rule({ policy: 'B' }), evidenceUsed: [evidence()], runResult: () => 'new' });
    return readjudicate(historical, next, ['policy']);
  }

  it('rejects an empty whatChanged narrative', () => {
    const r = readjudicated();
    const narrative: ComparisonNarrative = { whatChanged: '', why: 'because', whatDidNotChange: [], supersededEvidence: [], remainingVetoes: [], removedVetoes: [] };
    expect(() => compare(r, () => narrative)).toThrow(/whatChanged must not be empty/);
  });

  it('rejects an empty why narrative', () => {
    const r = readjudicated();
    const narrative: ComparisonNarrative = { whatChanged: 'something', why: '', whatDidNotChange: [], supersededEvidence: [], remainingVetoes: [], removedVetoes: [] };
    expect(() => compare(r, () => narrative)).toThrow(/why must not be empty/);
  });

  it('accepts a complete narrative', () => {
    const r = readjudicated();
    const narrative: ComparisonNarrative = { whatChanged: 'x changed', why: 'because y', whatDidNotChange: ['z'], supersededEvidence: [], remainingVetoes: [], removedVetoes: [] };
    expect(() => compare(r, () => narrative)).not.toThrow();
  });
});

describe('audit — item G/J: OLD and NEW are both preserved, nothing overwritten', () => {
  it('the final report is built from the RE-ADJUDICATED result, but both historical and new remain reachable in the phase chain', () => {
    const historical = execute(freeze(preRegister({ protocolId: 'p1', subjectId: 's', question: 'q', rule: rule(), declaredAt: DECLARED_AT }), DECLARED_AT), { rule: rule(), evidenceUsed: [evidence()], runResult: () => ({ label: 'OLD_RESULT' }) });
    const next = execute(freeze(preRegister({ protocolId: 'p2', subjectId: 's', question: 'q', rule: rule({ policy: 'B' }), declaredAt: DECLARED_AT }), DECLARED_AT), { rule: rule({ policy: 'B' }), evidenceUsed: [evidence()], runResult: () => ({ label: 'NEW_RESULT' }) });
    const readjudicated = readjudicate(historical, next, ['policy']);
    const compared = compare(readjudicated, () => ({ whatChanged: 'label flipped', why: 'policy change', whatDidNotChange: [], supersededEvidence: [], remainingVetoes: [], removedVetoes: [] }));
    const audited = audit(compared, { whatWasTested: 't', howEvidenceWasClassified: 'c', resultObtained: 'r' });

    expect(audited.compared.readjudicated.historical.result).toEqual({ label: 'OLD_RESULT' });
    expect(audited.compared.readjudicated.reAdjudicated.result).toEqual({ label: 'NEW_RESULT' });
    expect(audited.report.auditStatus).toBe('PASS');
  });
});

describe('printReport — the standard 12-section report is always emitted in order', () => {
  it('every numbered section header appears, in order', () => {
    const historical = execute(freeze(preRegister({ protocolId: 'p1', subjectId: 's', question: 'q', rule: rule(), declaredAt: DECLARED_AT }), DECLARED_AT), { rule: rule(), evidenceUsed: [evidence()], runResult: () => 'old' });
    const next = execute(freeze(preRegister({ protocolId: 'p2', subjectId: 's', question: 'q', rule: rule({ policy: 'B' }), declaredAt: DECLARED_AT }), DECLARED_AT), { rule: rule({ policy: 'B' }), evidenceUsed: [evidence()], runResult: () => 'new' });
    const compared = compare(readjudicate(historical, next, ['policy']), () => ({ whatChanged: 'x', why: 'y', whatDidNotChange: [], supersededEvidence: [], remainingVetoes: [], removedVetoes: [] }));
    const text = printReport(audit(compared, { whatWasTested: 't', howEvidenceWasClassified: 'c', resultObtained: 'r' }).report);
    const headers = ['1. WHAT WAS TESTED', '2. WHAT EVIDENCE WAS USED', '3. HOW EVIDENCE WAS CLASSIFIED', '4. WHAT RULES WERE FROZEN', '5. WHAT RESULT WAS OBTAINED', '6. WHAT CHANGED FROM HISTORY', '7. WHAT DID NOT CHANGE', '8. WHICH VETOES REMAIN', '9. WHICH VETOES WERE REMOVED', '10. WHY EACH VETO REMAINED OR DISAPPEARED', '11. REPRODUCIBILITY', '12. AUDIT STATUS'];
    let lastIndex = -1;
    for (const h of headers) {
      const idx = text.indexOf(h);
      expect(idx, `missing or out of order: ${h}`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });
});

describe('the recipe itself', () => {
  it('GENESIS_RECIPE names all ten steps in order', () => {
    expect(GENESIS_RECIPE).toBe('INPUT -> VERIFY -> CLASSIFY -> FREEZE -> EXECUTE -> FALSIFY -> RE-ADJUDICATE -> COMPARE -> AUDIT -> REPRODUCE');
  });
});
