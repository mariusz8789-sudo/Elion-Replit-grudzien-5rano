/**
 * scientificDecision (Stage 5) — the Scientific Decision Engine.
 *
 * Turns RDKit-verified descriptors + structural alerts into a decision report that a
 * medicinal chemist can trust: it separates what has been VERIFIED (real computation)
 * from what is a GROUNDED interpretation (deterministic rule over verified facts) from
 * GENERAL scientific knowledge — and, crucially, from what remains UNKNOWN and what
 * REQUIRES EXPERIMENTAL VALIDATION.
 *
 * Hard rules (mandated):
 *   • Never present an interpretation as a verified fact — every statement is tagged.
 *   • Never predict experimental outcomes; never invent biological activity.
 *   • Suggested validation lists STANDARD lab workflows only, each ending with the
 *     explicit reminder that experimental validation is required.
 *
 * Pure + deterministic + unit-tested. No AI, no new computation, no network. It only
 * re-reads numbers RDKit already produced.
 */
import type { MoleculeProps } from './moleculeInterpretation';
import type { IconName } from '../components/Icon';
import { t } from './i18n';

/** How a statement is justified. Ordered weakest-claim-first in meaning. */
export type EvidenceTag = 'VERIFIED' | 'GROUNDED' | 'GENERAL';
export type DecisionCategory = 'VERIFIED' | 'PROMISING' | 'UNKNOWN' | 'VALIDATION' | 'NEXT';

/** Machine-readable "explain this statement" payload for the expandable UI. */
export interface Explanation {
  descriptors: string[]; // RDKit descriptors that support the statement
  rule: string;          // the exact rule / threshold applied ('' when none)
  origin: string;        // where the statement comes from (computation / rule / general knowledge)
  assumptions: string[]; // what the statement assumes
  limitations: string[]; // what it does NOT establish
}

export interface DecisionStatement {
  category: DecisionCategory;
  tag: EvidenceTag;
  text: string;
  explain: Explanation;
}

/** A suggested next experiment — a STANDARD workflow, never a predicted result. */
export interface ValidationStep {
  workflow: string;     // e.g. "Oznaczenie rozpuszczalności kinetycznej"
  purpose: string;      // what it would measure (not what it will show)
  note: string;         // always the experimental-validation reminder
}

export interface DecisionReport {
  statements: DecisionStatement[];
  strengths: string[];
  risks: string[];
  unknowns: string[];
  validation: ValidationStep[];
  transparency: {
    verifiedDescriptors: string[]; // descriptors actually used
    groundingRules: string[];      // rules that fired
    removedClaims: string[];       // claims we deliberately do NOT make
    confidenceNote: string;        // how confidence was classified
    limitations: string[];         // scientific limitations of the whole report
  };
}

const f = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);

function st(category: DecisionCategory, tag: EvidenceTag, text: string, explain: Partial<Explanation>): DecisionStatement {
  return {
    category, tag, text,
    explain: { descriptors: explain.descriptors ?? [], rule: explain.rule ?? '', origin: explain.origin ?? '', assumptions: explain.assumptions ?? [], limitations: explain.limitations ?? [] },
  };
}

/**
 * Build the full decision report from verified descriptors + structural alerts.
 * `alerts` is the list of RDKit structural-alert names (may be empty/absent).
 */
export function buildDecisionReport(p: MoleculeProps, alerts: string[] = []): DecisionReport {
  const REQUIRED = t('dec.required');
  const statements: DecisionStatement[] = [];
  const strengths: string[] = [];
  const risks: string[] = [];
  const unknowns: string[] = [];
  const groundingRules: string[] = [];
  const alertNames = alerts.map((a) => a.trim()).filter(Boolean);

  // ── VERIFIED: direct RDKit computations (never dressed up as biology) ──────────
  statements.push(st('VERIFIED', 'VERIFIED', t('dec.v.molWt', { molWt: f(p.molWt) }), {
    descriptors: ['molWt'], origin: t('dec.v.molWt.origin'),
    limitations: [t('dec.v.molWt.lim')],
  }));
  statements.push(st('VERIFIED', 'VERIFIED', t('dec.v.logP', { logP: f(p.logP) }), {
    descriptors: ['logP'], origin: t('dec.v.logP.origin'),
    assumptions: [t('dec.v.logP.assum')],
    limitations: [t('dec.v.logP.lim')],
  }));
  statements.push(st('VERIFIED', 'VERIFIED', t('dec.v.tpsa', { tpsa: f(p.tpsa, 1) }), {
    descriptors: ['tpsa'], origin: t('dec.v.tpsa.origin'),
    limitations: [t('dec.v.tpsa.lim')],
  }));
  statements.push(st('VERIFIED', 'VERIFIED', t('dec.v.hbond', { hbd: p.hbd, hba: p.hba }), {
    descriptors: ['hbd', 'hba'], origin: t('dec.v.hbond.origin'),
  }));
  statements.push(st('VERIFIED', 'VERIFIED',
    p.lipinskiPass ? t('dec.v.lipinski.pass', { viol: p.lipinskiViolations }) : t('dec.v.lipinski.fail', { viol: p.lipinskiViolations }), {
    descriptors: ['molWt', 'logP', 'hbd', 'hba', 'lipinskiViolations'],
    rule: t('dec.v.lipinski.rule'), origin: t('dec.v.lipinski.origin'),
    limitations: [t('dec.v.lipinski.lim')],
  }));

  // ── PROMISING: grounded interpretation of favorable verified values ────────────
  if (p.lipinskiPass) {
    groundingRules.push(t('dec.gr.lipinski'));
    statements.push(st('PROMISING', 'GROUNDED', t('dec.p.druglike'), {
      descriptors: ['molWt', 'logP', 'hbd', 'hba'], rule: t('dec.p.druglike.rule'),
      origin: t('dec.p.druglike.origin'),
      assumptions: [t('dec.p.druglike.assum')],
      limitations: [t('dec.p.druglike.lim')],
    }));
    strengths.push(t('dec.p.druglike.strength'));
  } else {
    risks.push(t('dec.p.ro5.risk', { viol: p.lipinskiViolations }));
  }
  if (p.logP >= 0 && p.logP <= 3) {
    groundingRules.push(t('dec.gr.logp'));
    statements.push(st('PROMISING', 'GROUNDED', t('dec.p.logp', { logP: f(p.logP) }), {
      descriptors: ['logP'], rule: t('dec.p.logp.rule'), origin: t('dec.p.logp.origin'),
      assumptions: [t('dec.p.logp.assum')], limitations: [t('dec.p.logp.lim')],
    }));
    strengths.push(t('dec.p.logp.strength', { logP: f(p.logP) }));
  }
  if (p.tpsa < 90) {
    groundingRules.push(t('dec.gr.tpsa'));
    strengths.push(t('dec.p.tpsa.strength', { tpsa: f(p.tpsa, 1) }));
  }

  // ── UNKNOWN + risks: things descriptors CANNOT establish (never fabricate) ──────
  if (p.logP > 5) risks.push(t('dec.risk.logp', { logP: f(p.logP) }));
  if (p.tpsa > 140) risks.push(t('dec.risk.tpsa', { tpsa: f(p.tpsa, 1) }));
  for (const name of alertNames) {
    risks.push(t('dec.risk.alert', { name }));
    statements.push(st('UNKNOWN', 'GENERAL', t('dec.alert.text', { name }), {
      origin: t('dec.alert.origin'),
      assumptions: [t('dec.alert.assum')],
      limitations: [t('dec.alert.lim')],
    }));
  }

  // These are ALWAYS unknown from structure alone — we state that explicitly.
  unknowns.push(t('dec.unk.activity'));
  unknowns.push(t('dec.unk.tox'));
  unknowns.push(t('dec.unk.solub'));
  unknowns.push(t('dec.unk.metab'));
  statements.push(st('UNKNOWN', 'GENERAL', t('dec.unk.statement'), {
    origin: t('dec.unk.statement.origin'), limitations: [t('dec.unk.statement.lim')],
  }));

  // ── VALIDATION: standard workflows only, never predicted outcomes ──────────────
  const validation: ValidationStep[] = [
    { workflow: t('dec.val.solub.wf'), purpose: t('dec.val.solub.p'), note: REQUIRED },
    { workflow: t('dec.val.perm.wf'), purpose: t('dec.val.perm.p'), note: REQUIRED },
    { workflow: t('dec.val.admet.wf'), purpose: t('dec.val.admet.p'), note: REQUIRED },
    { workflow: t('dec.val.dock.wf'), purpose: t('dec.val.dock.p'), note: REQUIRED },
    { workflow: t('dec.val.cell.wf'), purpose: t('dec.val.cell.p'), note: REQUIRED },
    { workflow: t('dec.val.pk.wf'), purpose: t('dec.val.pk.p'), note: REQUIRED },
  ];

  // ── NEXT STEPS: what the scientist should do, honestly ─────────────────────────
  const next: string[] = [];
  if (!p.lipinskiPass || p.logP > 5) next.push(t('dec.next.optimize'));
  if (alertNames.length) next.push(t('dec.next.alerts'));
  next.push(t('dec.next.measure'));
  next.push(t('dec.next.hypothesis'));
  for (const n of next) statements.push(st('NEXT', 'GENERAL', n, { origin: t('dec.next.origin'), limitations: [REQUIRED] }));

  // ── Transparency: why Genesis reached this conclusion ──────────────────────────
  const removedClaims = [
    t('dec.rem.active'),
    t('dec.rem.outcome'),
    t('dec.rem.efficacy'),
    t('dec.rem.interp'),
  ];

  return {
    statements, strengths, risks, unknowns, validation,
    transparency: {
      verifiedDescriptors: ['molWt', 'logP', 'tpsa', 'hbd', 'hba', 'lipinskiViolations'],
      groundingRules,
      removedClaims,
      confidenceNote: t('dec.confidenceNote'),
      limitations: [
        t('dec.lim.rdkit'),
        t('dec.lim.nopredict'),
        t('dec.lim.confirm'),
      ],
    },
  };
}

export const DECISION_CATEGORY_META: Record<DecisionCategory, { labelKey: string; icon: IconName }> = {
  VERIFIED: { labelKey: 'dec.cat.verified', icon: 'check' },
  PROMISING: { labelKey: 'dec.cat.promising', icon: 'alert' },
  UNKNOWN: { labelKey: 'dec.cat.unknown', icon: 'search' },
  VALIDATION: { labelKey: 'dec.cat.validation', icon: 'flask' },
  NEXT: { labelKey: 'dec.cat.next', icon: 'book' },
};

export const EVIDENCE_TAG_META: Record<EvidenceTag, { kind: 'ok' | 'warn' | 'info'; labelKey: string; icon: IconName }> = {
  VERIFIED: { kind: 'ok', labelKey: 'dec.tag.verified', icon: 'check' },
  GROUNDED: { kind: 'warn', labelKey: 'dec.tag.grounded', icon: 'alert' },
  GENERAL: { kind: 'info', labelKey: 'dec.tag.general', icon: 'spark' },
};
