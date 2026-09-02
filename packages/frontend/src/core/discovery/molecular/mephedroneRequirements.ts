import type { Requirement } from './discoveryRequirements';

/**
 * THE 4-MMC CAMPAIGN QUESTION, MADE MACHINE-READABLE.
 *
 * In prose the question is: "find analogues of 4-MMC that PRESERVE the
 * structural basis of its documented mechanism, REDUCE predicted mutagenic
 * liability relative to 4-MMC itself, and stay inside the physicochemical
 * window a central mechanism requires."
 *
 * Each clause below is one checkable requirement. Two properties of this list
 * matter more than its contents:
 *
 *  1. The PRESERVE_ requirements are anchored to ingested records, not to
 *     intuition — the same Saha 2018 / Pifl 2015 basis the mechanism
 *     prerequisites use.
 *  2. `reduce-mutagenicity` is measured against 4-MMC's OWN value, computed in
 *     the same run by the same model. That is what makes it a design goal
 *     rather than an arbitrary cutoff, and it is why a campaign can say
 *     "better than the reference" without inventing a benchmark.
 *
 * `avoid-nitrile` is mandatory and it genuinely bites: the enumerator's
 * `add-nitrile` transformation produces candidates that violate it, and those
 * candidates become inadmissible. A requirement that never excludes anything
 * is not a requirement, it is decoration.
 */
export const MEPHEDRONE_REQUIREMENTS: readonly Requirement[] = [
  {
    requirementId: 'preserve-cathinone-core',
    kind: 'PRESERVE_STRUCTURE',
    statement: 'Retain the beta-keto group adjacent to the amine-bearing carbon (the cathinone signature).',
    rationale: 'This is the feature shared by the ingested cathinone records; losing it puts a candidate outside the scaffold class the evidence describes.',
    smarts: '[CX3](=O)[CX4][NX3]',
    mandatory: true,
  },
  {
    requirementId: 'preserve-basic-amine',
    kind: 'PRESERVE_STRUCTURE',
    statement: 'Retain a protonatable aliphatic nitrogen.',
    rationale: 'Monoamine transporter and VMAT2 recognition in this scaffold class depends on it; an amide or aniline nitrogen does not substitute.',
    smarts: '[NX3;H2,H1,H0;!$(N-C=O);!$(N-S=O);!$(N-[a])]',
    mandatory: true,
  },
  {
    requirementId: 'preserve-aromatic-ring',
    kind: 'PRESERVE_STRUCTURE',
    statement: 'Retain the aryl ring.',
    rationale: 'The scaffold characterised in the ingested records is built on it.',
    smarts: 'c1ccccc1',
    mandatory: true,
  },
  {
    requirementId: 'avoid-nitrile',
    kind: 'AVOID_STRUCTURE',
    statement: 'Do not introduce a nitrile group.',
    rationale: 'Declared campaign exclusion: a nitrile is a metabolic liability this campaign chooses not to explore. This is a design decision, not an experimental finding.',
    smarts: 'C#N',
    mandatory: true,
  },
  {
    requirementId: 'reduce-mutagenicity',
    kind: 'REDUCE_VS_REFERENCE',
    statement: 'Predicted Ames-positive probability must be lower than 4-MMC\'s own predicted value.',
    rationale: 'The campaign\'s liability-reduction goal. Both sides of the comparison are ADMET-AI predictions computed in the same run, so the comparison is like-for-like — and both remain predictions, not measurements.',
    propertyId: 'mutagenicity',
    direction: 'BELOW_REFERENCE',
    mandatory: false,
  },
  {
    requirementId: 'cns-tpsa-window',
    kind: 'PROPERTY_WINDOW',
    statement: 'Topological polar surface area must stay at or below 90 A^2.',
    rationale: 'Declared heuristic for CNS availability, which a central mechanism requires. A heuristic, not an experimentally established threshold.',
    propertyId: 'tpsa',
    max: 90,
    mandatory: false,
  },
];
