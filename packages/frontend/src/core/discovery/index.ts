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
  type DiscoveryEvidencePack,
  type DiscoveryFollowUp,
  type DiscoveryFollowUpPlan,
  type DiscoveryHypothesis,
  type DiscoveryInitialConditions,
  type DiscoveryReplay,
  type DiscoveryVerdict,
  type MultiRunSpec,
  type SweepSpec,
  type TimingSweepSpec,
} from './discoveryCase';

export { runDiscoveryCase, runFollowUp, runFollowUpPlan, type DiscoveryFollowUpRun } from './discoveryEngine';
export { executeDiscoveryCase, compareDiscoveryArms, discoveryModelIdentity, leverOf, DISCOVERY_LIMITATIONS, DISCOVERY_METRIC_KEYS } from './discoveryExecution';
export { replayDiscoveryCase, replayDiscoveryCaseWithTolerance } from './discoveryReplay';
export { deriveDiscoveryConclusion } from './discoveryConclusion';
export { createDiscoveryEvidencePack, serializeDiscoveryEvidencePack, DISCOVERY_EVIDENCE_PACK_VERSION } from './discoveryEvidence';
export { generateFollowUps, isRunnable } from './discoveryFollowUp';
export { runParameterSweep, runInterventionTimingSweep, SWEEPABLE_PARAMETERS, NON_SWEEPABLE_PARAMETERS, type SweepResult } from './discoverySweep';
export { runMultiSeed, median, STATISTICAL_NOTE, type MultiRunResult } from './discoveryMultiRun';
