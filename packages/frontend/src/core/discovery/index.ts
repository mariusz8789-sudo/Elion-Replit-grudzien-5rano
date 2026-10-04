/**
 * DISCOVERY ENGINE — publiczna powierzchnia warstwy odkrycia.
 *
 * Konsument (UI, API, World Engine) korzysta wyłącznie stąd. Warstwa jest
 * niezależna od renderera: nie importuje Three.js, nie zna kamer ani sceny i
 * nie wie, czy ktokolwiek te wyniki wyświetla.
 */
export {
  DISCOVERY_ENGINE_VERSION,
  evaluateGate,
  promoteCase,
  highestEarnedStatus,
  type DiscoveryCase,
  type DiscoveryCaseSpec,
  type DiscoveryCaseStatus,
  type DiscoveryComparison,
  type DiscoveryConclusion,
  type LocalSimulationSnapshotPack,
  type DiscoveryFollowUp,
  type DiscoveryFollowUpPlan,
  type DiscoveryHypothesis,
  type DiscoveryInitialConditions,
  type DemoReplay,
  type DiscoveryVerdict,
  type MultiRunSpec,
  type SweepSpec,
  type TimingSweepSpec,
} from './discoveryCase';

export { runDiscoveryCase, runFollowUp, runFollowUpPlan, type DiscoveryFollowUpRun } from './discoveryEngine';
export { executeDiscoveryCase, compareDiscoveryArms, discoveryModelIdentity, leverOf, DISCOVERY_LIMITATIONS, DISCOVERY_METRIC_KEYS } from './discoveryExecution';
export { runDemoReplay, runDemoReplayWithTolerance } from './demoReplay';
export { deriveDiscoveryConclusion } from './discoveryConclusion';
export { createLocalSimulationSnapshotPack, serializeLocalSimulationSnapshotPack, LOCAL_SIMULATION_SNAPSHOT_PACK_VERSION } from './localSimulationSnapshotPack';
export { generateFollowUps, isRunnable } from './discoveryFollowUp';
export { runParameterSweep, runInterventionTimingSweep, SWEEPABLE_PARAMETERS, NON_SWEEPABLE_PARAMETERS, type SweepResult } from './discoverySweep';
export { runMultiSeed, median, STATISTICAL_NOTE, type MultiRunResult } from './discoveryMultiRun';
export { validateLocalSimulationSnapshot, type LocalSimulationSnapshot, type LocalSimulationSnapshotValidation, type LocalSimulationSnapshotStore } from './localSimulationSnapshotStore';
export {
  runProtectionPriorityStudy,
  PROTECTION_OBJECTIVES,
  PROTECTION_SCENARIOS,
  type ProtectionObjective,
  type ProtectionPriorityStudy,
  type ProtectionPrioritySpec,
} from './protectionPriority';
export { bandMetricsOf, contactMetricsOf, cohortLimitations, DISCOVERY_BAND_METRIC_KEYS, DISCOVERY_CONTACT_METRIC_KEYS } from './discoveryExecution';

/**
 * The NL front door onto the unrelated chemistry Discovery Engine
 * (`packages/backend/src/campaign/*`, wired into `CampaignScreen.tsx`) — a
 * different "discovery" than the epidemiological `DiscoveryCase` family
 * exported above. Re-exported here so this barrel is the one real place to
 * find every NL-goal parser this layer owns, not because the two systems
 * share any logic.
 */
export {
  parseDiscoveryGoal, buildCampaignRequest,
  type DiscoveryGoalIntent, type DiscoveryGoalUnresolved,
  type DiscoveryCampaignRequest, type DiscoveryCampaignObjective, type DiscoveryCampaignConstraint,
} from './discoveryGoalIntent';
export { parseCampaignWhyQuestion, type CampaignWhyIntent, type CampaignWhyKind, type CampaignWhyUnresolved } from './campaignWhyIntent';

/**
 * Warstwa kontaktów. Typ kontaktu, gospodarstwa i ogniska pochodzą z realnych
 * zdarzeń transmisji; konsument dostaje je razem z deklaracją, czego model nie
 * potrafi rozpoznać.
 */
export {
  CONTACT_TYPES,
  CONTACT_TYPE_DECLARATIONS,
  CONTACT_TYPES_NOT_MODELED,
  CONTACT_GRAPH_PARAMETERS,
  CONTACT_NETWORK_NOT_MODELED,
  HOUSEHOLD_PROVENANCE_NOTE,
  classifyContact,
  type ContactType,
  type TransmissionEdge,
  type HouseholdStructure,
} from '../contacts/contactNetwork';
export {
  analyseTransmissionClusters,
  dominantContactType,
  shareIntoBand,
  type ClusterAnalysis,
  type TransmissionCluster,
} from '../contacts/clusterAnalysis';

/**
 * Warstwa kohortowa. Konsument dostaje ją stąd razem z Discovery Engine, bo
 * bez profilu i jego prowenancji nie wolno czytać wyników w rozbiciu na grupy.
 */
export {
  NEUTRAL_COHORT_PROFILE,
  COHORT_VARIABLES,
  COHORT_NOT_MODELED,
  AGE_BANDS,
  bandOfAge,
  defineCohortProfile,
  differentiatesCohorts,
  type AgeBand,
  type CohortProfile,
  type CohortVariable,
} from '../agents/cohortModel';

/**
 * Kontrakt dla World Engine. Wystawiony razem z warstwą naukową, bo to Core
 * definiuje, czego potrzebuje — implementacja świata należy do Manusa.
 */
export {
  WORLD_ENGINE_INTERFACE_VERSION,
  WORLD_ENGINE_FIELD_CONTRACT,
  REQUIRED_LOCATION_TYPES,
  CAPABILITY_REQUIREMENTS,
  AVAILABLE_EXPERIMENTS,
  OTHER_REFINEMENT,
  REPLAY_REQUIREMENTS,
  INTERFACE_NOT_MODELED,
  capabilityFor,
  isCapabilityUnlocked,
  validateWorldPayload,
  type ScientificCapability,
  type WorldPayload,
  type WorldPayloadValidation,
} from '../world/worldEngineInterface';
