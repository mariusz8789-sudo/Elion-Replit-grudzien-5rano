import type { BioFamily, GovPillar } from './contracts';

/**
 * G1-G4 — use-case taxonomy + routing hooks, per mandate item 14: "PILLARS
 * są tylko use-case taxonomy + routing hooks do istniejących mechanizmów."
 *
 * `decisionHook` is a DESCRIPTIVE STRING naming which existing Genesis
 * mechanism a pillar's real ranking/falsification/adjudication decision
 * would flow through if wired in — it is NOT a function call. Nothing in
 * this module calls `runGovDrugDiscoveryCampaign`, `runLowerHarmFunnel`,
 * `generateDifferentiatingExperiment`, or `genesisAdjudicationProtocol`;
 * doing so is explicitly future work (see D-054's "What this entry does
 * NOT do"), and wiring it in is exactly where the mandate's "no second
 * ranking/adjudication/falsification engine" constraint would need to be
 * re-verified against a live call site, not just a taxonomy string.
 *
 * G4's `decisionHook` is honestly different from the other three: there is
 * no pre-existing "Public Value layer" in this codebase (confirmed by
 * search before writing this file) — `publicValue.ts::draftPublicValue` in
 * THIS module is the first one, so G4 names its own sibling file rather
 * than an existing mechanism it does not yet have.
 */

export interface PillarSpec {
  readonly id: GovPillar;
  readonly name: string;
  readonly problem: string;
  readonly models: readonly BioFamily[];
  readonly decisionHook: string;
  readonly evidenceRule: string;
}

export const PILLARS: readonly PillarSpec[] = [
  {
    id: 'G1',
    name: 'GOV-DRUG-LOWER-HARM',
    problem: 'drug substitutes with a better benefit-risk profile at preserved efficacy',
    models: ['CELL_POPULATION', 'PBPK'],
    decisionHook: 'EXISTING funnel: govDrugDiscoveryCampaign.ts / govDrugLowerHarmFunnel.ts (docs/DECISIONS.md D-048/D-050) + genesisAdjudicationProtocol.ts (D-047)',
    evidenceRule: 'IN_SILICO_MODEL results are hypotheses for wet-lab follow-up only, never evidence-minimum for a WINNER',
  },
  {
    id: 'G2',
    name: 'GOV-OPIOID-LOWER-HARM',
    problem: 'alternatives with lower dependence/overdose burden at clinically meaningful analgesia',
    models: ['RECEPTOR'],
    decisionHook: 'EXISTING opioid-substitute demonstrator (A2/LOWER-HARM lineage) + G2 falsification (core/agent/observationGap.ts::generateDifferentiatingExperiment)',
    evidenceRule: 'as G1; no medical advice, no dosing or tapering guidance',
  },
  {
    id: 'G3',
    name: 'GOV-AMR-PUBLIC-HEALTH',
    problem: 'antibiotic resistance: where drug pressure generates resistance (mutant prevention window)',
    models: ['AMR'],
    decisionHook: 'EXISTING discovery loop (hypothesis -> experiment -> falsification), same pattern as Phase E/F campaigns',
    evidenceRule: 'as G1; not an epidemiological forecast',
  },
  {
    id: 'G4',
    name: 'GOV-TRUTH-AND-VALUE',
    problem: 'public decisions with an auditable trail and an honestly disclosed public value',
    models: ['CELL_POPULATION', 'PBPK', 'RECEPTOR', 'AMR'],
    decisionHook: 'THIS module\'s own publicValue.ts::draftPublicValue (new in D-054, no prior Public Value layer existed) — read-only, downstream, zero input to ranking/verdict',
    evidenceRule: 'draftPublicValue emits only NO_DATA/ASSUMPTION/MODEL_OUTPUT-tagged fields, never a fabricated number',
  },
];
