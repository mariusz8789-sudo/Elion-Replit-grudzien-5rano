export {
  EXPERIMENT_FABRIC_VERSION,
  type ExperimentOperation,
  type ExperimentRunStatus,
  type ExperimentValue,
  type StructuredExperimentRequest,
  type ExperimentIntent,
  type ExperimentPlan,
  type ExperimentParameterSpec,
  type ExperimentRoute,
  type ExperimentProvenance,
  type ExperimentResult,
  type ExperimentRun,
} from './types';

export {
  fingerprintStructuredRequest,
  fingerprintExperimentPlan,
  statusForCapability,
  resultOriginForCapability,
  createExperimentProvenance,
} from './provenance';

export { parseScienceChatMessage } from './parser';
export {
  listRouterModels,
  getRouterModel,
  validateStructuredExperimentRequest,
  createExperimentIntent,
  createExperimentPlan,
  type RequestValidation,
  type RouterModel,
} from './router';

export { runExperiment } from './executor';

export {
  EXTERNAL_ADAPTER_CONTRACT_VERSION,
  listExternalEngineAdapters,
  getExternalEngineAdapter,
  listSpatialImportAdapters,
  getSpatialImportAdapter,
  type ExternalAdapterStatus,
  type ExternalExecutionBackend,
  type ExternalScientificDomain,
  type ExternalAdapterManifest,
  type SpatialImportManifest,
} from './externalAdapters';

export {
  DISCOVERY_SEAM_VERSION,
  analyseExperimentSeries,
  type DiscoveryFindingKind,
  type DiscoveryVerdict,
  type DiscoveryFinding,
  type DiscoveryAnalysis,
} from './discovery';

export {
  SCIENTIFIC_DISCOVERY_VERSION,
  type HypothesisAssessment,
  type ExperimentArmKind,
  type ReproductionVerdict,
  type FalsificationCriterion,
  type ScientificHypothesis,
  type ExperimentArm,
  type ScientificExperimentDesign,
  type ExperimentArmEvidence,
  type HypothesisAssessmentEvidence,
  type ScientificEvidenceChain,
  type ParameterSweepSpec,
  type CrossDomainLink,
  type HypothesisProposal,
  type ScientificExperimentInput,
} from './scientificDiscovery';

export { designScientificExperiment } from './scientificPlanner';
export { executeScientificExperiment } from './scientificExecutor';
export { EVIDENCE_PACK_VERSION, createScientificEvidencePack, serializeScientificEvidencePack, type EvidencePackRun, type ScientificEvidencePack } from './evidencePack';
export { GENESIS_SPATIAL_DATASET_VERSION, OSM_ATTRIBUTION, OSM_LICENSE, normalizeOsmMapXml, importOsmMap, type SpatialLayer, type LonLat, type GenesisSpatialFeature, type GenesisSpatialDataset, type OsmMapImportRequest } from './spatialImport';
