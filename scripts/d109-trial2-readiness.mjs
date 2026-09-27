#!/usr/bin/env node
/**
 * D-109 — what "Trial 2/2" actually is, read from D-088's own sealed text
 * rather than from how earlier entries in this campaign (D-106/107/108)
 * casually described it.
 *
 * ==================== THE CORRECTION THIS MODULE MAKES =====================
 *
 * D-106/107/108 wrote "Trial 2/2 NOT run — awaiting the owner's
 * authorization", as if one human click would run an already-defined
 * experiment. Re-reading D-088's sealed prereg (fc6cf73e63a9e569) precisely:
 * it was ALREADY EXECUTED ONCE — both arms, deterministically, replayed —
 * with outcome BOTH_ARMS_BLOCKED (Arm A MAE 1.1726, Arm B MAE 1.0425, both
 * against MAX_MAE 1.0). The prereg's own `decisionRule.forbidden` clause
 * bars re-running under this seal "with a third representation, a different
 * lambda, a different split seed, or any other knob, in search of a pass",
 * and `armsAreExhaustive` states plainly: "No arm C... a further arm
 * requires a NEW human-sealed preregistration." The execution script itself
 * (`d088-engine-unification.mjs`) says the same thing in its own rationale
 * string.
 *
 * So there is no second experiment currently DEFINED to run. The
 * `attemptBudget.max: 2` in the sealed JSON records that this campaign
 * reserved room for one further attempt — it is not an authorization to
 * mechanically re-invoke D-088; the prereg's own rules say a further attempt
 * is arm C+ by definition and needs its own new seal. This module computes
 * that status directly from the sealed prereg's text (never asserted,
 * always parsed), so it cannot silently drift out of sync with what the
 * prereg actually says.
 *
 * Nothing here proposes, drafts, or seals a new preregistration. That is
 * exactly the kind of decision — new thresholds are not proposed here, but a
 * NEW experiment's premise and arms would need to be, and only a human can
 * seal one (`agentMayNotSelfApprove: true`) — this module refuses to make.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREREG_PATH = path.join(REPO, 'packages', 'backend', 'src', 'campaign', 'glp1r-d088-prereg.json');
export function loadD088Prereg() {
  return JSON.parse(readFileSync(PREREG_PATH, 'utf8'));
}

/**
 * Parses the prereg's OWN forbidding language rather than restating it, so a
 * future edit to the sealed prereg (which would itself require a new
 * fingerprint and D-entry) is what this function reflects — not a second,
 * drifting copy of the rule.
 */
export function trial2Status() {
  const prereg = loadD088Prereg();
  const rule = prereg.prereg.decisionRule;
  const arms = prereg.prereg.armsAreExhaustive;
  const budget = prereg.prereg.attemptBudget;

  // Both checks read the prereg's OWN text; neither restates the rule as a
  // second, driftable copy. Either alone is sufficient to establish BLOCKED.
  const requiresNewSeal = /NEW human-sealed preregistration/i.test(String(arms));
  const forbidsReRunWithNewKnob = typeof rule.forbidden === 'string' && rule.forbidden.length > 0;

  const blocked = requiresNewSeal || forbidsReRunWithNewKnob;

  return Object.freeze({
    status: blocked ? 'BLOCKED' : 'READY',
    reason: blocked
      ? "no second experiment is currently DEFINED or sealed: D-088's own prereg forbids re-running under this seal with any different representation/split/knob, and states a further arm requires a NEW human-sealed preregistration, which does not exist"
      : 'unexpected: the sealed prereg does not forbid a further attempt under this seal',
    preregId: prereg.prereg.id,
    preregFingerprint: prereg.preregFingerprint,
    sealedBy: prereg.prereg.sealedBy,
    agentMayNotSelfApprove: prereg.prereg.approvalProvenance.agentMayNotSelfApprove,
    attemptBudget: budget,
    armsAreExhaustiveStatement: arms,
    forbiddenReRunStatement: rule.forbidden,
    correctiveNote: 'D-106/107/108 described this as "awaiting one authorization to run an already-defined experiment". That was imprecise: the existing experiment already ran and is exhausted; what actually remains is the decision whether to draft and seal a NEW preregistration, informed by everything measured since (C1 CLOSED on CAMP at 43 groups, medianSd 1.0005 vs MAX_MAE 1.0).',
  });
}

function main() {
  const r = trial2Status();
  console.log('=== D-109 — TRIAL_2_STATUS, read from the sealed D-088 prereg itself ===\n');
  console.log(`TRIAL_2_STATUS = ${r.status}`);
  console.log(`reason: ${r.reason}`);
  console.log(`\nsealed prereg: ${r.preregId}  fingerprint ${r.preregFingerprint}  sealedBy=${r.sealedBy}  agentMayNotSelfApprove=${r.agentMayNotSelfApprove}`);
  console.log(`attemptBudget: ${JSON.stringify(r.attemptBudget)}`);
  console.log(`\narmsAreExhaustive (verbatim): "${r.armsAreExhaustiveStatement}"`);
  console.log(`\ndecisionRule.forbidden (verbatim): "${r.forbiddenReRunStatement}"`);
  console.log(`\n${r.correctiveNote}`);
}

if (process.argv[1] && process.argv[1].endsWith('d109-trial2-readiness.mjs')) main();
