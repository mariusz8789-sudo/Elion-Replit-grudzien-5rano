/**
 * GIS / DIGITAL TWIN / MULTI-AGENT — contracts only.
 *
 * Per the mission's economy rule: these are the interfaces a future real
 * implementation needs to slot into, not a real implementation. Genesis
 * already has a real GIS OSM importer elsewhere in this codebase for
 * current-state city data — this module does not duplicate it. It exists so
 * a later real digital-twin or multi-agent feature has a declared shape to
 * target, and so "not built yet" is a typed, honest `NOT_AVAILABLE` rather
 * than an undeclared gap.
 */
export const GIS_DIGITAL_TWIN_MULTI_AGENT_CONTRACTS_VERSION = '1.0.0';

/* ---------------------------- GIS / real-world data --------------------------- */

export interface GisDatasetDescriptor {
  datasetId: string;
  /** e.g. "OpenStreetMap", "USGS", "national water-quality portal". */
  provider: string;
  /** Real-world time the data describes, not the retrieval time. */
  temporalValidity: { from: string; to: string | null };
  licence: string;
}

export type GisDataAvailability = 'AVAILABLE' | 'NOT_AVAILABLE' | 'BLOCKED';

export interface GisDataStatus {
  descriptor: GisDatasetDescriptor;
  status: GisDataAvailability;
  reason: string;
}

/* ------------------------------- Digital twin ------------------------------- */

/**
 * A digital twin state is EITHER a real-world measurement snapshot OR a
 * simulated projection from one — this union exists so a caller cannot
 * accidentally treat a simulated future state as an observed one.
 */
export type DigitalTwinStateKind = 'OBSERVED_SNAPSHOT' | 'SIMULATED_PROJECTION';

export interface DigitalTwinState {
  stateId: string;
  kind: DigitalTwinStateKind;
  asOf: string;
  /** Present only for SIMULATED_PROJECTION: what produced it. */
  simulatedBy: string | null;
  sourceDatasetIds: readonly string[];
}

/* -------------------------------- Multi-agent -------------------------------- */

/**
 * Roles a discovery run MIGHT delegate to separate agents. Declared here so a
 * future orchestrator has a fixed vocabulary; this module runs none of them —
 * `runScientificDiscoveryFlow` already performs the equivalent work as plain
 * function calls, which is simpler and remains the default until a real case
 * for actual multi-agent parallelism or specialisation exists.
 */
export type DiscoveryAgentRole =
  | 'RESEARCHER'
  | 'EVIDENCE_AGENT'
  | 'HYPOTHESIS_AGENT'
  | 'MODELER'
  | 'EXPERIMENT_DESIGNER'
  | 'EXECUTOR'
  | 'FALSIFIER'
  | 'EVIDENCE_AUDITOR';

export interface AgentAssignment {
  role: DiscoveryAgentRole;
  /** Whether a real implementation currently backs this role in Genesis, and what it is. */
  implementedBy: string | null;
}

/** Maps each declared role to what ALREADY performs that function in Genesis today, honestly. */
export const CURRENT_AGENT_ASSIGNMENTS: readonly AgentAssignment[] = [
  { role: 'RESEARCHER', implementedBy: 'httpSourceConnector.node.ts + datasetEvidenceIngestion.ts (real retrieval and extraction)' },
  { role: 'EVIDENCE_AGENT', implementedBy: 'acquiredEvidenceRegistry.ts + sourceBackedKnowledgeRegistry.ts' },
  { role: 'HYPOTHESIS_AGENT', implementedBy: 'competingHypotheses.ts' },
  { role: 'MODELER', implementedBy: 'scientificModel.ts' },
  { role: 'EXPERIMENT_DESIGNER', implementedBy: 'discriminatingExperiment.ts' },
  { role: 'EXECUTOR', implementedBy: 'naturalAnalogueCampaign.ts (real RDKit + real ADMET-AI)' },
  { role: 'FALSIFIER', implementedBy: 'mechanismFalsification.ts + competingHypotheses.ts' },
  { role: 'EVIDENCE_AUDITOR', implementedBy: null },
];

export function unimplementedAgentRoles(): readonly DiscoveryAgentRole[] {
  return CURRENT_AGENT_ASSIGNMENTS.filter((a) => a.implementedBy === null).map((a) => a.role);
}
