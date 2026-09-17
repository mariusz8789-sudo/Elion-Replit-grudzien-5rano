import type { BioExperimentRecord, PublicValueDraft, TaggedValue } from './contracts';

/**
 * G4 — Public Value draft. ZERO fabricated numbers: every field is tagged
 * NO_DATA (no external source exists for this yet), ASSUMPTION (a stated
 * caveat, not a number), or MODEL_OUTPUT (a value the in-silico model
 * itself actually produced). Mandate item 5: this stays strictly
 * downstream — nothing here feeds back into ranking, verdict, or any
 * decision; `draftPublicValue` only ever READS a `BioExperimentRecord`,
 * it is never called from `experiment.ts` or any decision path.
 */

const NO_DATA: TaggedValue = { value: 'NO_DATA', tag: 'NO_DATA' };

export function draftPublicValue(rec: BioExperimentRecord): PublicValueDraft {
  const fields: Record<string, TaggedValue> = {
    populationImpact: NO_DATA,
    avoidedHarm: NO_DATA,
    avoidedCost: NO_DATA,
    modelOutput: { value: `${rec.result.observable}=${JSON.stringify(rec.result.summary)}`, tag: 'MODEL_OUTPUT' },
    evidenceClass: { value: `${rec.evidenceClass} (hypothesis generation only, never sufficient for WINNER)`, tag: 'MODEL_OUTPUT' },
    implementationScale: NO_DATA,
    timeToDeployment: NO_DATA,
    assumptionNote: { value: 'every NO_DATA field requires an external source before any decision rests on it', tag: 'ASSUMPTION' },
  };
  return { pillar: rec.pillar, fields, firewall: 'public value/ROI has ZERO input into scientific ranking or verdicts' };
}
