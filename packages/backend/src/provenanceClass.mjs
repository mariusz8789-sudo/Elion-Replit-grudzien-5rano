/**
 * PROVENANCE CLASS — where a piece of a ResearchRun comes from, in one closed vocabulary.
 *
 *  - SOURCE_FACT: what an official external source reports about its own record (bibliographic metadata,
 *    a deposited structure). It says nothing about whether the source's findings support a claim.
 *  - MODEL_PROPOSAL: anything a language model or automatic extractor proposed (a plan, a hypothesis,
 *    a claim-to-source relationship). Never evidence on its own.
 *  - GENESIS_COMPUTATION: the output of an engine Genesis actually ran, with its input and output hashes.
 *  - REAL_MEASUREMENT: a physical measurement from a laboratory or instrument. Only a lab adapter may
 *    assign it; nothing in the ResearchRun or literature layer does, so a run without a lab reports none.
 *  - UNKNOWN: not established. Retrieval alone, an unread relationship, a failed step.
 *
 * The class is a label on provenance, not a verdict: SUPPORTED_WITHIN_PROTOCOL and friends stay where
 * they are, and Evidence still waits for a human.
 */
export const PROVENANCE_CLASS = Object.freeze({
  SOURCE_FACT: 'SOURCE_FACT',
  MODEL_PROPOSAL: 'MODEL_PROPOSAL',
  GENESIS_COMPUTATION: 'GENESIS_COMPUTATION',
  REAL_MEASUREMENT: 'REAL_MEASUREMENT',
  UNKNOWN: 'UNKNOWN',
});

const CLASSES = new Set(Object.values(PROVENANCE_CLASS));

export function isProvenanceClass(value) {
  return CLASSES.has(value);
}

/** The class of one ResearchRun experiment's execution record: computed only when an engine ran. */
export function executionProvenanceClass(execution) {
  return execution?.status === 'EXECUTED' && execution?.outputHash
    ? PROVENANCE_CLASS.GENESIS_COMPUTATION
    : PROVENANCE_CLASS.UNKNOWN;
}

/**
 * Per-section provenance of a ResearchRun view. Derived on read from the persisted chain, so no stored
 * record or fingerprint changes. `realMeasurements` is always empty here: no lab adapter feeds a ResearchRun.
 */
export function researchRunProvenance({ plan, literatureSnapshots = [], experiments = [] }) {
  return {
    plan: plan ? PROVENANCE_CLASS.MODEL_PROPOSAL : null,
    literatureSources: literatureSnapshots.some((s) => (s.sourceCount ?? 0) > 0) ? PROVENANCE_CLASS.SOURCE_FACT : null,
    claimSourceLinks: literatureSnapshots.length > 0 ? 'PER_LINK' : null,
    experimentExecutions: experiments.map((x) => ({ experimentId: x.experimentId, provenanceClass: executionProvenanceClass(x.execution) })),
    realMeasurements: [],
  };
}
