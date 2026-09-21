/**
 * D-102 — the readout-family classifier the seal (D-102-READOUT-FAMILY-PREREG)
 * requires. Written ONCE, against the rule text, before being run against the
 * data. Not adjusted afterward: D-096 already documented why that sequence —
 * build a rule, see the number, adjust the rule, see a better number — is the
 * shape of tuning an analysis toward a result, whichever direction the
 * adjustment happens to be correct in.
 *
 * Method carried over unchanged from the fix D-096 already validated: the
 * readout belongs to the "assessed as …" clause, not to any mention anywhere
 * in the description (a cell-line property like "coexpressing beta-arrestin-2"
 * is not a readout).
 */
import { READOUT_FAMILIES } from './d102-readout-family-prereg.mjs';

const ASSESSED_AS = /assessed as (.*?)(?: incubated| measured| after| by | in presence| in absence|$)/i;

export function readoutFamilyOf(description) {
  const text = description.toLowerCase();
  const m = ASSESSED_AS.exec(text);
  const segment = m ? m[1] : text;
  if (segment.includes('arrestin')) return 'ARRESTIN';
  if (segment.includes('calcium')) return 'CALCIUM';
  if (segment.includes('internali')) return 'INTERNALIZATION';
  if (segment.includes('camp')) return 'CAMP';
  if (text.includes('displacement') || text.includes('radioligand')) return 'BINDING';
  if (text.includes('camp')) return 'CAMP';
  return 'OTHER';
}

/** "0% HSA" / "4.4% HSA" / "in presence of HSA" / "absence of human serum albumin" -> a stable condition tag, or null. */
export function hsaConditionOf(description) {
  const pct = /([\d.]+)%\s*hsa/i.exec(description);
  if (pct) return `${pct[1]}% HSA`;
  if (/absence of human serum albumin/i.exec(description)) return '0% HSA (stated absence)';
  if (/presence of hsa/i.exec(description)) return 'HSA present (unquantified)';
  return null;
}

if (Object.freeze(READOUT_FAMILIES).length !== 6) throw new Error('FAIL_CLOSED: family list drifted from the seal');
