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
  AGING_EVIDENCE_RANKING_VERSION,
  AGING_LAB_KNOWLEDGE_SOURCE,
  rankAgingEvidenceCandidates,
  createAgingModelDataRequirement,
  type AgingEpistemicStatus,
  type AgingEvidenceDisposition,
  type AgingEvidenceSource,
  type AgingCandidateEvidenceInput,
  type AgingEvidenceRankingRow,
  type AgingDataRequirement,
} from './agingEvidenceRanking';

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
  EXTERNAL_SOLVER_JOB_MANIFEST_VERSION,
  createExternalSolverJobManifest,
  type ExternalSolverJobStatus,
  type ExternalJobArtifact,
  type ExternalJobResourceLimits,
  type ExternalSolverJobRequest,
  type ExternalSolverJobManifest,
} from './externalJobManifest';

export {
  DISCOVERY_SEAM_VERSION,
  analyseExperimentSeries,
  analyseCategoricalExperimentSeries,
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
  type HypothesisKnowledgeReference,
  type HypothesisKnowledgeReferenceInput,
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
export {
  SCIENTIFIC_HYPOTHESIS_EVIDENCE_VERSION,
  resolveHypothesisKnowledgeReferences,
} from './scientificHypothesisEvidence';
export { executeScientificExperiment } from './scientificExecutor';
export {
  DISCOVERY_CASE_RECORD_VERSION,
  createDiscoveryCaseRecord,
  serializeDiscoveryCaseRecord,
  replayDiscoveryCaseRecord,
  type DiscoveryCaseStatus,
  type DiscoveryCaseRecordInput,
  type DiscoveryCaseRecord,
} from './discoveryCaseRecord';
export {
  GENESIS_RESEARCH_PACKET_VERSION,
  MAX_RESEARCH_QUERY_LENGTH,
  createGenesisResearchPacket,
  replayGenesisResearchPacket,
  type ResearchPacketStatus,
  type ResearchCorpusSource,
  type ResearchSupplementalSource,
  type GenesisResearchPacket,
} from './researchPacket';
export {
  SCIENTIFIC_HYPOTHESIS_CANDIDATE_VERSION,
  formulateScientificHypothesisCandidate,
  replayScientificHypothesisCandidate,
  type HypothesisCandidateStatus,
  type ScientificHypothesisCandidate,
} from './scientificHypothesisCandidate';
export {
  SCIENTIFIC_REVIEW_DECISION_VERSION,
  createScientificReviewDecision,
  serializeScientificReviewDecision,
  replayScientificReviewDecision,
  type ScientificReviewDecisionKind,
  type ScientificReviewDecisionInput,
  type ScientificReviewDecision,
} from './scientificReviewDecision';
export {
  SCIENTIFIC_CONCLUSION_VERSION,
  concludeScientificDiscovery,
  serializeScientificConclusion,
  replayScientificConclusion,
  type ScientificConclusionStatus,
  type ScientificConclusionReviewStatus,
  type ScientificConclusion,
} from './scientificConclusion';
export {
  SEEDED_UNCERTAINTY_VERSION,
  MAX_PREREGISTERED_SEEDS,
  isSeededStochasticModel,
  planSeededUncertainty,
  executeSeededUncertainty,
  replaySeededUncertainty,
  type SeededUncertaintyInput,
  type SeededUncertaintyArm,
  type SeededUncertaintyPlan,
  type SeededUncertaintySummary,
  type SeededUncertaintyEvidence,
} from './seededUncertainty';
export {
  SCIENTIFIC_NEXT_EXPERIMENT_VERSION,
  selectNextScientificExperiment,
  replayNextScientificExperimentSelection,
  type NextExperimentSelectionStatus,
  type CandidateEligibilityStatus,
  type NextExperimentCandidateEvaluation,
  type NextExperimentSelection,
  type NextExperimentSelectionInput,
} from './scientificNextExperiment';
export {
  SCIENTIFIC_BACKEND_EXECUTOR_VERSION,
  executeScientificExperimentOnBackend,
  isBackendDiscoveryDesign,
} from './scientificBackendExecutor';
export { EVIDENCE_PACK_VERSION, createScientificEvidencePack, serializeScientificEvidencePack, type EvidencePackRun, type ScientificEvidencePack } from './evidencePack';
export { RO_CRATE_EVIDENCE_PACK_VERSION, exportEvidencePackRoCrate, serializeEvidencePackRoCrate, type GenesisRoCrate, type RoCrateGraphNode } from './evidencePackRoCrate';
export { COUNTERFACTUAL_COMPARISON_VERSION, compareCounterfactual, serializeCounterfactualComparison, type CounterfactualComparisonStatus, type SeedControlStatus, type CounterfactualComparisonInput, type CounterfactualModelIdentity, type ParameterDifference, type CounterfactualMetric, type CounterfactualEvidence, type CounterfactualComparison } from './counterfactualCompare';
export { EVIDENCE_GUIDED_CHAT_VERSION, planEvidenceGuidedExperiment, confirmEvidenceGuidedExperiment, capsuleFromConfirmedExperiment, type EvidenceGuidedPlanStatus, type EvidenceGuidedModelDisclosure, type EvidenceGuidedExperimentPlan, type EvidenceGuidedOutcomeHandoff, type ConfirmedEvidenceGuidedExperiment, type EvidenceGuidedExperimentCapsule } from './evidenceGuidedChat';
export { BACKEND_EVIDENCE_EXECUTION_VERSION, confirmBackendEvidenceGuidedExperiment, isBackendEvidenceGuidedPlan } from './backendExecution';
export { QUANTUM_EVIDENCE_CARD_VERSION, createMajorana1QuantumEvidenceCard, quantumEvidenceCardsForKnowledge, type QuantumEvidenceCardStatus, type QuantumEvidenceCardEntry, type QuantumEvidenceCard } from '../knowledge/quantumEvidenceCard';
export { SCENARIO_CAPSULE_VERSION, createScenarioCapsule, replayScenarioCapsule, serializeScenarioCapsule, type ScenarioCapsuleReplayStatus, type ScenarioCapsuleInput, type SpatialScenarioAttachment, type DiscoveryScenarioAttachment, type ReproducibleScenarioCapsule, type ScenarioCapsuleReplay } from './scenarioCapsule';
export { GENESIS_SPATIAL_DATASET_VERSION, OSM_ATTRIBUTION, OSM_LICENSE, normalizeOsmMapXml, importOsmMap, type SpatialLayer, type LonLat, type GenesisSpatialFeature, type GenesisSpatialDataset, type OsmMapImportRequest } from './spatialImport';
export {
  ORCHESTRATION_CONTRACT_VERSION,
  planCrossDomainOrchestration,
  confirmCrossDomainOrchestration,
  planAtmosphericTemperatureToArrhenius,
  ATMOSPHERIC_TEMPERATURE_TO_ARRHENIUS_LINK,
  type CrossDomainPlanStatus,
  type CrossDomainOrchestrationPlan,
  type ConfirmedCrossDomainOrchestration,
} from './orchestration';
