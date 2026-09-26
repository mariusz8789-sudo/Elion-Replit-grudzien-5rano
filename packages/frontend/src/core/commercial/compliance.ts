/**
 * COMPLIANCE NOTES — static, informational text keyed by vertical. NOT a
 * compliance engine, NOT legal advice, and not wired into any legal
 * transition check in `ledger.ts` — a caller who wants to surface these to
 * a human reader may, but nothing here blocks or permits a state change.
 */
export const GENERIC_COMPLIANCE_NOTE =
  'These notes are informational only and are not legal, regulatory, or compliance advice. A real engagement in any vertical needs its own counsel review before a contract, invoice, or payment is issued.';

const VERTICAL_NOTES: Readonly<Record<string, readonly string[]>> = {
  GOV_DRUG_DISCOVERY: [
    'Government research findings are informational research output, not a regulatory submission or a treatment recommendation.',
    'Any candidate this repo surfaces as a WINNER still requires independent institutional review before any action is taken on it — see core/agent/practicalCandidateGate.ts.',
  ],
  PHYSICS: [
    'All physics results in this repo are toy/pipeline-validation models unless a real backend (PYTHIA/Geant4) is wired in, which it is not in this pass.',
  ],
  GENERIC: [
    'No payment is processed by this repo — core/commercial ships contracts and a fail-closed ledger only, with no PaymentAdapter implementation.',
  ],
};

export function complianceNotes(vertical: string): readonly string[] {
  return [...(VERTICAL_NOTES[vertical] ?? VERTICAL_NOTES.GENERIC!), GENERIC_COMPLIANCE_NOTE];
}
