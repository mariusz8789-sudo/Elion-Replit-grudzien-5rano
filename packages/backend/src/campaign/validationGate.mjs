/**
 * GENERIC frozen-validation-gate loader (D-081). Extracted behaviour-for-
 * behaviour from `glp1rQsar.mjs::loadGlp1rValidationGate` when the GIPR track
 * needed the same custody rule. There is ONE gate loader in this repository;
 * `glp1rQsar.mjs` and `giprQsar.mjs` both delegate here and differ only in
 * which file they point at and which target name appears in the refusal.
 *
 * FAIL-CLOSED, IN FOUR DISTINCT WAYS, none of which degrades into a default:
 *   GATE_NOT_FROZEN  the file is missing, unreadable, or carries no fingerprint
 *   GATE_TAMPERED    the recorded fingerprint does not match the gate object's
 *                    own hash — i.e. somebody edited a threshold without
 *                    re-freezing, which is exactly the move D-069/D-074/D-077
 *                    forbid
 *   GATE_MISMATCH    the gate is internally consistent but is not the gate the
 *                    caller pre-registered against
 * A model is never validated against a gate this function refused.
 */

import { readFileSync, existsSync } from 'node:fs';
import { canonicalHash } from '../provenance.mjs';

export function loadValidationGate(gatePath, { targetLabel = 'target', expectedRuleFingerprint } = {}) {
  if (!existsSync(gatePath)) {
    return { ok: false, code: 'GATE_NOT_FROZEN', reason: `${targetLabel} validation gate file missing — refusing to validate a model against an unfrozen gate` };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(gatePath, 'utf8'));
  } catch {
    return { ok: false, code: 'GATE_NOT_FROZEN', reason: `${targetLabel} validation gate file unreadable` };
  }
  if (typeof raw.ruleFingerprint !== 'string' || raw.ruleFingerprint === '') {
    return { ok: false, code: 'GATE_NOT_FROZEN', reason: 'gate file carries no ruleFingerprint — was never produced by a real freeze' };
  }
  const actual = canonicalHash(raw.gate).slice(0, 16);
  if (actual !== raw.ruleFingerprint) {
    return { ok: false, code: 'GATE_TAMPERED', reason: `gate file ruleFingerprint (${raw.ruleFingerprint}) does not match its own gate object's hash (${actual}) — the file was edited without re-freezing` };
  }
  if (expectedRuleFingerprint !== undefined && raw.ruleFingerprint !== expectedRuleFingerprint) {
    return { ok: false, code: 'GATE_MISMATCH', reason: `gate ruleFingerprint (${raw.ruleFingerprint}) does not match the frozen rule (${expectedRuleFingerprint}) — a gate may not change after freeze` };
  }
  return { ok: true, gate: raw.gate, ruleFingerprint: raw.ruleFingerprint };
}
