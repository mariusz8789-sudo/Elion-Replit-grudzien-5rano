import { canonicalJson, fnv1a } from '../events/hash';

/**
 * GENESIS ADJUDICATION PROTOCOL — the canonical, repeatable, phase-locked
 * procedure any re-adjudication in Genesis follows.
 *
 * WHY THIS EXISTS. `a2Surpass2ReAdjudication.ts` (docs/DECISIONS.md D-046)
 * did the right thing once, by hand: freeze the rule, compare it against
 * itself before use, never overwrite the historical result. This file makes
 * that discipline a REUSABLE, MACHINE-ENFORCED CONTRACT so the next
 * adjudication (a different candidate, a different trial, a different
 * domain entirely) cannot skip a step by accident.
 *
 * THIS FILE MAKES NO SCIENTIFIC DECISIONS. It never computes a risk ratio,
 * never picks a dose, never decides a verdict. It only enforces WHEN a
 * domain's own decision functions may run, and preserves WHAT they produced.
 * The domain (see `a2AdjudicationReferenceImplementation.ts` for the first
 * one) supplies its own rule type, its own evidence records, and its own
 * `runResult` callback — this file calls that callback and nothing else. No
 * second scoring engine, no second veto rule, lives here.
 *
 * THE ENFORCED ORDER (cannot be skipped or reordered — each function's
 * input type IS the previous phase's output type, so calling them out of
 * order is a compile error before it is ever a runtime one):
 *
 *   preRegister -> freeze -> execute -> readjudicate -> compare -> audit
 *
 * THE CENTRAL RULE THIS FILE EXISTS TO ENFORCE:
 *   "ustal regułę -> zamroź ją -> dopiero potem zobacz wynik"
 *   never
 *   "zobacz wynik -> wybierz regułę"
 *
 * TWO DISTINCT HARK GUARDS, DOING DIFFERENT JOBS:
 *   1. `execute()` re-fingerprints the rule at the moment of use and refuses
 *      to run if it differs from what was frozen — catches a rule silently
 *      mutated between freeze and execution.
 *   2. `readjudicate()` diffs the historical rule against the new rule
 *      field-by-field and refuses unless every difference was named in
 *      advance in `allowedRuleChanges` — catches a re-adjudication that
 *      quietly changes more than the one thing it was allowed to change
 *      (the exact failure mode `a2Surpass2ReAdjudication.ts` was built to
 *      avoid: "one change at a time").
 *
 * REPRODUCIBILITY IS NOT A SEPARATE STEP TO REMEMBER — `execute()` calls the
 * domain's `runResult` TWICE on the identical input and refuses to proceed
 * if the two runs disagree, so non-determinism is caught at the moment it
 * would otherwise enter the record, not discovered later by re-running.
 */

export const GENESIS_ADJUDICATION_PROTOCOL_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Evidence identity — deliberately the SAME vocabulary as
// core/agent/evidenceProvenance.ts (SourceStudyIdentity, EvidenceClass,
// classifyComparisonEvidenceClass, DEFAULT_EVIDENCE_CLASS_RANK,
// rankingFingerprint), re-exported/imported by callers rather than
// duplicated here, so this protocol and that contract share one definition
// of "what a piece of evidence is" — see requirement E and finding L below.
// ---------------------------------------------------------------------------

export type CustodyStatus = 'PINNED_VERIFIED' | 'PINNED_UNVERIFIED_HASH' | 'NO_ACCESS' | 'FABRICATED_REJECTED';

/** One evidence record's full identity, as the audit trail must carry it — requirement E. */
export interface AuditedEvidenceRecord {
  readonly source: string;
  readonly sourceId: string;
  readonly hash: string | null;
  readonly custodyStatus: CustodyStatus;
  readonly evidenceClass: string;
  readonly classificationMethod: string;
  readonly rankingFingerprint: string;
}

function assertAuditedEvidenceRecord(e: AuditedEvidenceRecord, context: string): void {
  if (e.source.trim() === '') throw new Error(`${context}: evidence record has an empty source.`);
  if (e.sourceId.trim() === '') throw new Error(`${context}: evidence record has an empty sourceId.`);
  if (e.custodyStatus !== 'FABRICATED_REJECTED' && e.custodyStatus !== 'NO_ACCESS' && e.hash === null) {
    throw new Error(`${context}: evidence record for ${e.sourceId} claims custody "${e.custodyStatus}" but carries no hash — pinned evidence without a hash is not verifiable custody.`);
  }
  if (e.evidenceClass.trim() === '') throw new Error(`${context}: evidence record for ${e.sourceId} has no evidenceClass — classification is mandatory, not optional.`);
  if (e.classificationMethod.trim() === '') throw new Error(`${context}: evidence record for ${e.sourceId} does not name the method that classified it — an unattributed classification cannot be audited.`);
}

// ---------------------------------------------------------------------------
// PHASE 1 — PRE_REGISTRATION
// ---------------------------------------------------------------------------

export interface PreRegistration<TRule> {
  readonly phase: 'PRE_REGISTRATION';
  readonly protocolId: string;
  readonly subjectId: string;
  readonly question: string;
  readonly rule: TRule;
  /** Provenance only. Never enters any fingerprint below. */
  readonly declaredAt: string;
}

export function preRegister<TRule>(input: {
  readonly protocolId: string;
  readonly subjectId: string;
  readonly question: string;
  readonly rule: TRule;
  readonly declaredAt: string;
}): PreRegistration<TRule> {
  if (input.protocolId.trim() === '') throw new Error('preRegister: protocolId is required.');
  if (input.subjectId.trim() === '') throw new Error('preRegister: subjectId is required.');
  if (input.question.trim() === '') throw new Error('preRegister: question is required — a rule frozen for no stated question cannot be audited.');
  if (input.rule === null || typeof input.rule !== 'object') throw new Error('preRegister: rule must be a plain object so it can be fingerprinted and diffed field-by-field.');
  return { phase: 'PRE_REGISTRATION', ...input };
}

// ---------------------------------------------------------------------------
// PHASE 2 — FROZEN
// ---------------------------------------------------------------------------

export interface FrozenProtocol<TRule> {
  readonly phase: 'FROZEN';
  readonly preRegistration: PreRegistration<TRule>;
  readonly ruleFingerprint: string;
  /** Provenance only. Never enters any fingerprint. */
  readonly frozenAt: string;
}

function assertPhase(value: { readonly phase: string }, expected: string, fn: string): void {
  if (value.phase !== expected) {
    throw new Error(`${fn}: expected a "${expected}" record but received phase "${value.phase}". The protocol enforces PRE_REGISTRATION -> FROZEN -> EXECUTED -> READJUDICATED -> COMPARED -> AUDITED in that order; this call is out of sequence.`);
  }
}

/** Fingerprints the rule EXACTLY as declared. Called once; nothing after this may change what it covers without the HARK guards below firing. */
export function freeze<TRule>(pre: PreRegistration<TRule>, frozenAt: string): FrozenProtocol<TRule> {
  assertPhase(pre, 'PRE_REGISTRATION', 'freeze');
  return { phase: 'FROZEN', preRegistration: pre, ruleFingerprint: fnv1a(canonicalJson(pre.rule)), frozenAt };
}

// ---------------------------------------------------------------------------
// PHASE 3 — EXECUTED
// ---------------------------------------------------------------------------

export interface ExecutedProtocol<TRule, TResult> {
  readonly phase: 'EXECUTED';
  readonly frozen: FrozenProtocol<TRule>;
  readonly evidenceUsed: readonly AuditedEvidenceRecord[];
  readonly inputFingerprint: string;
  readonly result: TResult;
}

export interface ExecuteInput<TRule, TResult> {
  /** The SAME rule object the caller intends to use. Re-fingerprinted and compared to what was frozen — HARK guard #1. */
  readonly rule: TRule;
  readonly evidenceUsed: readonly AuditedEvidenceRecord[];
  /** The domain's own, UNMODIFIED decision logic. This protocol never substitutes its own. */
  readonly runResult: (rule: TRule, evidence: readonly AuditedEvidenceRecord[]) => TResult;
}

/**
 * Runs the domain's decision function exactly once, logically — but calls it
 * TWICE internally and requires byte-identical output, so non-determinism is
 * caught here rather than assumed. Requirement I.
 */
export function execute<TRule, TResult>(frozen: FrozenProtocol<TRule>, input: ExecuteInput<TRule, TResult>): ExecutedProtocol<TRule, TResult> {
  assertPhase(frozen, 'FROZEN', 'execute');

  const ruleFingerprintNow = fnv1a(canonicalJson(input.rule));
  if (ruleFingerprintNow !== frozen.ruleFingerprint) {
    throw new Error(
      `execute: HARK GUARD — the rule supplied at execution (fingerprint ${ruleFingerprintNow}) does not match the rule frozen for protocol "${frozen.preRegistration.protocolId}" (fingerprint ${frozen.ruleFingerprint}). ` +
        'A rule may not be changed after freeze. FAIL CLOSED.',
    );
  }

  if (input.evidenceUsed.length === 0) throw new Error('execute: no evidence supplied — a veto or a clean pass without evidence is a fabrication, not an adjudication.');
  input.evidenceUsed.forEach((e, i) => assertAuditedEvidenceRecord(e, `execute evidence[${i}]`));

  const inputFingerprint = fnv1a(canonicalJson({ ruleFingerprint: frozen.ruleFingerprint, evidence: input.evidenceUsed }));

  const first = input.runResult(input.rule, input.evidenceUsed);
  const second = input.runResult(input.rule, input.evidenceUsed);
  if (canonicalJson(first) !== canonicalJson(second)) {
    throw new Error(`execute: REPRODUCIBILITY GUARD — running the identical rule (${frozen.ruleFingerprint}) over the identical evidence (${inputFingerprint}) twice produced two different results. A non-reproducible result cannot be adjudicated. FAIL CLOSED.`);
  }

  return { phase: 'EXECUTED', frozen, evidenceUsed: input.evidenceUsed, inputFingerprint, result: first };
}

// ---------------------------------------------------------------------------
// PHASE 4 — READJUDICATED
// ---------------------------------------------------------------------------

export interface ReAdjudicatedProtocol<TRule, TResult> {
  readonly phase: 'READJUDICATED';
  readonly historical: ExecutedProtocol<TRule, TResult>;
  readonly reAdjudicated: ExecutedProtocol<TRule, TResult>;
  readonly changedRuleFields: readonly (keyof TRule)[];
}

/**
 * The second HARK guard. `allowedRuleChanges` must be declared by the
 * caller BEFORE this runs (it is a parameter, not something computed from
 * the results) and names every rule field that is permitted to differ
 * between the historical run and the new one. Any OTHER difference is
 * refused. Requirement C/D: a re-adjudication may change what it declared
 * it would change, and nothing else — and never because a different choice
 * looked more favourable.
 */
export function readjudicate<TRule, TResult>(
  historical: ExecutedProtocol<TRule, TResult>,
  reAdjudicated: ExecutedProtocol<TRule, TResult>,
  allowedRuleChanges: readonly (keyof TRule)[],
): ReAdjudicatedProtocol<TRule, TResult> {
  assertPhase(historical, 'EXECUTED', 'readjudicate(historical)');
  assertPhase(reAdjudicated, 'EXECUTED', 'readjudicate(reAdjudicated)');

  const oldRule = historical.frozen.preRegistration.rule as Record<string, unknown>;
  const newRule = reAdjudicated.frozen.preRegistration.rule as Record<string, unknown>;
  const allKeys = Array.from(new Set([...Object.keys(oldRule), ...Object.keys(newRule)])) as (keyof TRule)[];
  const changedRuleFields = allKeys.filter((k) => canonicalJson(oldRule[k as string]) !== canonicalJson(newRule[k as string]));
  const undeclared = changedRuleFields.filter((k) => !allowedRuleChanges.includes(k));

  if (undeclared.length > 0) {
    throw new Error(
      `readjudicate: HARK GUARD — this re-adjudication changed undeclared rule field(s): ${undeclared.map(String).join(', ')}. ` +
        `Only ${allowedRuleChanges.map(String).join(', ') || '(none)'} were declared changeable. FAIL CLOSED.`,
    );
  }
  if (historical.frozen.preRegistration.subjectId !== reAdjudicated.frozen.preRegistration.subjectId) {
    throw new Error(`readjudicate: subjectId mismatch — historical is about "${historical.frozen.preRegistration.subjectId}", re-adjudication is about "${reAdjudicated.frozen.preRegistration.subjectId}". These are not the same adjudication.`);
  }

  return { phase: 'READJUDICATED', historical, reAdjudicated, changedRuleFields };
}

// ---------------------------------------------------------------------------
// PHASE 5 — COMPARED
// ---------------------------------------------------------------------------

export interface ComparisonNarrative {
  readonly whatChanged: string;
  readonly why: string;
  readonly whatDidNotChange: readonly string[];
  readonly supersededEvidence: readonly string[];
  readonly remainingVetoes: readonly string[];
  readonly removedVetoes: readonly string[];
}

export interface ComparedProtocol<TRule, TResult> {
  readonly phase: 'COMPARED';
  readonly readjudicated: ReAdjudicatedProtocol<TRule, TResult>;
  readonly narrative: ComparisonNarrative;
}

/** The domain supplies `describe` because only it knows how to read its own `TResult` shape. This function only enforces that the phase precondition held and that the narrative is non-empty where it must not be. */
export function compare<TRule, TResult>(
  r: ReAdjudicatedProtocol<TRule, TResult>,
  describe: (historical: TResult, reAdjudicated: TResult) => ComparisonNarrative,
): ComparedProtocol<TRule, TResult> {
  assertPhase(r, 'READJUDICATED', 'compare');
  const narrative = describe(r.historical.result, r.reAdjudicated.result);
  if (narrative.whatChanged.trim() === '') throw new Error('compare: whatChanged must not be empty — silence about what changed is exactly what this protocol exists to prevent.');
  if (narrative.why.trim() === '') throw new Error('compare: why must not be empty.');
  return { phase: 'COMPARED', readjudicated: r, narrative };
}

// ---------------------------------------------------------------------------
// PHASE 6 — AUDITED (final) — the standard GENESIS ADJUDICATION REPORT
// ---------------------------------------------------------------------------

export interface GenesisAdjudicationReport {
  readonly whatWasTested: string;
  readonly evidenceUsed: readonly AuditedEvidenceRecord[];
  readonly howEvidenceWasClassified: string;
  readonly rulesFrozen: Record<string, unknown>;
  readonly resultObtained: string;
  readonly whatChangedFromHistory: string;
  readonly whatDidNotChange: readonly string[];
  readonly vetoesRemaining: readonly string[];
  readonly vetoesRemoved: readonly string[];
  readonly whyEachVetoRemainedOrDisappeared: string;
  readonly reproducibility: { readonly reproducible: boolean; readonly ruleFingerprint: string; readonly inputFingerprint: string };
  readonly auditStatus: 'PASS' | 'FAIL';
}

export interface AuditedProtocol<TRule, TResult> {
  readonly phase: 'AUDITED';
  readonly compared: ComparedProtocol<TRule, TResult>;
  readonly report: GenesisAdjudicationReport;
}

export function audit<TRule, TResult>(
  c: ComparedProtocol<TRule, TResult>,
  opts: {
    readonly whatWasTested: string;
    readonly howEvidenceWasClassified: string;
    readonly resultObtained: string;
  },
): AuditedProtocol<TRule, TResult> {
  assertPhase(c, 'COMPARED', 'audit');
  const { readjudicated } = c;
  const report: GenesisAdjudicationReport = {
    whatWasTested: opts.whatWasTested,
    evidenceUsed: readjudicated.reAdjudicated.evidenceUsed,
    howEvidenceWasClassified: opts.howEvidenceWasClassified,
    rulesFrozen: readjudicated.reAdjudicated.frozen.preRegistration.rule as Record<string, unknown>,
    resultObtained: opts.resultObtained,
    whatChangedFromHistory: c.narrative.whatChanged,
    whatDidNotChange: c.narrative.whatDidNotChange,
    vetoesRemaining: c.narrative.remainingVetoes,
    vetoesRemoved: c.narrative.removedVetoes,
    whyEachVetoRemainedOrDisappeared: c.narrative.why,
    reproducibility: {
      reproducible: true, // execute() already refused to reach this phase if either run was non-reproducible.
      ruleFingerprint: readjudicated.reAdjudicated.frozen.ruleFingerprint,
      inputFingerprint: readjudicated.reAdjudicated.inputFingerprint,
    },
    auditStatus: 'PASS',
  };
  return { phase: 'AUDITED', compared: c, report };
}

export function printReport(report: GenesisAdjudicationReport): string {
  const lines: string[] = [];
  lines.push('GENESIS ADJUDICATION REPORT');
  lines.push('');
  lines.push('1. WHAT WAS TESTED');
  lines.push(`   ${report.whatWasTested}`);
  lines.push('');
  lines.push('2. WHAT EVIDENCE WAS USED');
  for (const e of report.evidenceUsed) lines.push(`   - ${e.source} / ${e.sourceId} (${e.custodyStatus}, hash=${e.hash ?? 'n/a'})`);
  lines.push('');
  lines.push('3. HOW EVIDENCE WAS CLASSIFIED');
  lines.push(`   ${report.howEvidenceWasClassified}`);
  for (const e of report.evidenceUsed) lines.push(`   - ${e.sourceId}: ${e.evidenceClass} via ${e.classificationMethod} (rankingFingerprint ${e.rankingFingerprint})`);
  lines.push('');
  lines.push('4. WHAT RULES WERE FROZEN');
  lines.push(`   ${JSON.stringify(report.rulesFrozen, null, 2).split('\n').join('\n   ')}`);
  lines.push('');
  lines.push('5. WHAT RESULT WAS OBTAINED');
  lines.push(`   ${report.resultObtained}`);
  lines.push('');
  lines.push('6. WHAT CHANGED FROM HISTORY');
  lines.push(`   ${report.whatChangedFromHistory}`);
  lines.push('');
  lines.push('7. WHAT DID NOT CHANGE');
  for (const d of report.whatDidNotChange) lines.push(`   - ${d}`);
  lines.push('');
  lines.push('8. WHICH VETOES REMAIN');
  for (const v of report.vetoesRemaining) lines.push(`   - ${v}`);
  if (report.vetoesRemaining.length === 0) lines.push('   (none)');
  lines.push('');
  lines.push('9. WHICH VETOES WERE REMOVED');
  for (const v of report.vetoesRemoved) lines.push(`   - ${v}`);
  if (report.vetoesRemoved.length === 0) lines.push('   (none)');
  lines.push('');
  lines.push('10. WHY EACH VETO REMAINED OR DISAPPEARED');
  lines.push(`   ${report.whyEachVetoRemainedOrDisappeared}`);
  lines.push('');
  lines.push('11. REPRODUCIBILITY');
  lines.push(`   reproducible=${report.reproducibility.reproducible} ruleFingerprint=${report.reproducibility.ruleFingerprint} inputFingerprint=${report.reproducibility.inputFingerprint}`);
  lines.push('');
  lines.push('12. AUDIT STATUS');
  lines.push(`   ${report.auditStatus}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// THE RECIPE — the ten-word procedure this whole file exists to make real.
// ---------------------------------------------------------------------------

export const GENESIS_RECIPE = 'INPUT -> VERIFY -> CLASSIFY -> FREEZE -> EXECUTE -> FALSIFY -> RE-ADJUDICATE -> COMPARE -> AUDIT -> REPRODUCE' as const;
