import type { EpistemicLabel } from './epistemic';

export type OrganSystemId =
  | 'INTEGUMENTARY' | 'SKELETAL' | 'MUSCULAR' | 'NERVOUS' | 'ENDOCRINE'
  | 'CARDIOVASCULAR' | 'LYMPHATIC' | 'RESPIRATORY' | 'DIGESTIVE'
  | 'URINARY' | 'REPRODUCTIVE' | 'IMMUNE';

export type AnatomyKind = 'BODY' | 'SYSTEM' | 'REGION' | 'ORGAN' | 'TISSUE' | 'STRUCTURE' | 'CELL' | 'SUBCELLULAR';

export interface AnatomyNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: AnatomyKind;
  readonly label: string;
  readonly latinLabel?: string;
  readonly system?: OrganSystemId;
  readonly scaleMeters: number;
  readonly positionMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly dimensionsMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly children: readonly string[];
  readonly assetSlot: string;
  readonly visibleByDefault: boolean;
  readonly epistemic: EpistemicLabel;
}

export interface HumanBodyParameters {
  readonly heightMeters: number;
  readonly massKg: number;
  readonly shoulderWidthMeters: number;
  readonly eyeHeightMeters: number;
  readonly handSpanMeters: number;
  readonly footLengthMeters: number;
}

export interface HumanDigitalTwinManifest {
  readonly twinId: string;
  readonly scale: 'REAL_WORLD_1_TO_1';
  readonly parameters: HumanBodyParameters;
  readonly rootNodeId: string;
  readonly anatomyVersion: string;
  readonly nodes: readonly AnatomyNode[];
  readonly supportedSystems: readonly OrganSystemId[];
  readonly clinicalUse: 'NOT_A_MEDICAL_DEVICE';
  readonly notes: readonly string[];
}

export type AnatomyDisplayMode = 'NORMAL' | 'XRAY' | 'VASCULAR' | 'NERVOUS' | 'LYMPHATIC' | 'ORGANS' | 'BRAIN' | 'TISSUE' | 'CELLULAR';

export interface AnatomyViewState {
  readonly twinId: string;
  readonly selectedNodeId: string;
  readonly displayMode: AnatomyDisplayMode;
  readonly isolatedNodeIds: readonly string[];
  readonly hiddenNodeIds: readonly string[];
  readonly cutawayEnabled: boolean;
  readonly explodedOffsetMeters: number;
}

export interface PhysiologicalState {
  readonly heartRateBpm: number;
  readonly respiratoryRatePerMin: number;
  readonly oxygenSaturationPercent: number;
  readonly bloodPressureMmHg: { readonly systolic: number; readonly diastolic: number };
  readonly bodyTemperatureC: number;
  readonly cerebralPerfusionIndex: number;
  readonly stateLabel: EpistemicLabel;
}

export interface NeuroRegion {
  readonly id: string;
  readonly label: string;
  readonly parentId: string | null;
  readonly positionMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly volumeMl: number;
  readonly assetSlot: string;
}

export interface NeuronSignal {
  readonly id: string;
  readonly fromRegionId: string;
  readonly toRegionId: string;
  readonly amplitude: number;
  readonly latencyMs: number;
  readonly epistemic: EpistemicLabel;
}

export interface NeuroLabState {
  readonly selectedRegionId: string;
  readonly visibleRegions: readonly string[];
  readonly activeSignals: readonly NeuronSignal[];
  readonly modelTimeMs: number;
  readonly label: EpistemicLabel;
}

export type ScopeMode = 'OPTICAL_OBSERVATION' | 'DIGITAL_ZOOM' | 'RECONSTRUCTION' | 'CELL_MODEL' | 'SUBCELLULAR_MODEL';
export type MagnificationLevel = 1 | 5 | 25 | 100 | 500 | 1000;

export interface HyperscopeCaptureRequest {
  readonly specimenId: string;
  readonly mode: ScopeMode;
  readonly magnification: MagnificationLevel;
  readonly fieldOfViewMicrometers: number;
  readonly resolutionWidthPx: number;
  readonly resolutionHeightPx: number;
}

export interface HyperscopeCapture {
  readonly captureId: string;
  readonly specimenId: string;
  readonly request: HyperscopeCaptureRequest;
  readonly generatedAtLogicalTime: number;
  readonly outputHash: string;
  readonly epistemic: EpistemicLabel;
  readonly visualResolutionMultiplier: number;
  readonly sourceNote: string;
}

export type ImagingMode = 'XRAY' | 'CT_RECONSTRUCTION' | 'MRI_LIKE' | 'ULTRASOUND_LIKE' | 'FLUORESCENCE';

export interface ImagingRequest {
  readonly subjectId: string;
  readonly mode: ImagingMode;
  readonly sliceAxis: 'AXIAL' | 'CORONAL' | 'SAGITTAL';
  readonly sliceIndex: number;
  readonly source: 'MODEL' | 'EXTERNAL_DATASET' | 'USER_DATASET';
}

export interface ImagingFrame {
  readonly frameId: string;
  readonly request: ImagingRequest;
  readonly outputHash: string;
  readonly epistemic: EpistemicLabel;
  readonly diagnosticUse: 'PROHIBITED_WITHOUT_VALIDATED_DATA';
}

export interface Specimen {
  readonly specimenId: string;
  readonly label: string;
  readonly tissueType: string;
  readonly sourceDescription: string;
  readonly collectedAt?: string;
  readonly storageState: 'SIMULATED' | 'CONTROLLED' | 'ARCHIVED';
  readonly chainOfCustody: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly epistemic: EpistemicLabel;
}

export type TissueType = 'BLOOD' | 'EPITHELIUM' | 'MUSCLE' | 'NEURAL' | 'CONNECTIVE' | 'BONE' | 'LIVER' | 'LUNG' | 'CARDIAC' | 'GENERIC';

export interface HistologySlide {
  readonly slideId: string;
  readonly specimenId: string;
  readonly tissueType: TissueType;
  readonly stain: 'H_AND_E' | 'FLUORESCENT_SIM' | 'NONE';
  readonly preparationStatus: 'VIRTUAL' | 'IMPORTED_DATASET';
  readonly epistemic: EpistemicLabel;
}

export interface Organelle {
  readonly id: string;
  readonly label: string;
  readonly kind: 'NUCLEUS' | 'MITOCHONDRION' | 'RIBOSOME' | 'ER' | 'GOLGI' | 'LYSOSOME' | 'MEMBRANE';
  readonly positionNormalized: { readonly x: number; readonly y: number; readonly z: number };
  readonly scaleNormalized: number;
}

export interface CellModel {
  readonly cellId: string;
  readonly tissueType: TissueType;
  readonly organelles: readonly Organelle[];
  readonly epistemic: EpistemicLabel;
}

export type LabZoneId = 'ENTRY' | 'HUMAN_STUDY' | 'NEURO' | 'MICROSCOPY' | 'HISTOLOGY' | 'CELL' | 'IMAGING' | 'MOLECULAR' | 'COMPUTE' | 'EVIDENCE' | 'SAFETY';

export interface LabStation {
  readonly stationId: string;
  readonly zone: LabZoneId;
  readonly label: string;
  readonly positionMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly equipmentIds: readonly string[];
  readonly interactionRadiusMeters: number;
  readonly accessLevel: 'PUBLIC_SIMULATION' | 'OPERATOR' | 'RESEARCHER' | 'ADMIN';
}

export type EquipmentKind = 'HYPERSCOPE' | 'MICROSCOPE' | 'IMAGING_CONSOLE' | 'ORPHEUS' | 'SPECIMEN_STORAGE' | 'COMPUTE_RACK' | 'ANATOMY_TABLE' | 'SAFETY_CONSOLE' | 'GENERIC';

export interface EquipmentItem {
  readonly equipmentId: string;
  readonly kind: EquipmentKind;
  readonly label: string;
  readonly stationId: string;
  readonly operational: boolean;
  readonly assetSlot: string;
  readonly capabilities: readonly string[];
}

export interface InventoryItem {
  readonly itemId: string;
  readonly label: string;
  readonly kind: 'PPE' | 'CONTAINER' | 'SLIDE' | 'TOOL' | 'REAGENT' | 'SAMPLE' | 'DOCUMENT';
  readonly quantity: number;
  readonly allowedActions: readonly string[];
}

export type ProtocolStepKind = 'PRECHECK' | 'PREPARE' | 'ACQUIRE' | 'IMAGE' | 'ANALYZE' | 'VERIFY' | 'STORE' | 'REPORT';

export interface ProtocolStep {
  readonly stepId: string;
  readonly kind: ProtocolStepKind;
  readonly title: string;
  readonly durationLogicalTicks: number;
  readonly requiredEquipmentIds: readonly string[];
  readonly requiredInventoryIds: readonly string[];
  readonly requiresHumanConfirmation: boolean;
}

export interface ScientificProtocol {
  readonly protocolId: string;
  readonly title: string;
  readonly purpose: string;
  readonly steps: readonly ProtocolStep[];
  readonly safetyLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CONCEPTUAL_ONLY';
  readonly epistemic: EpistemicLabel;
}

export type BiosafetyState = 'CLEAR' | 'PPE_REQUIRED' | 'ACCESS_RESTRICTED' | 'SAFETY_HOLD';

export interface BiosafetyContext {
  readonly zone: LabZoneId;
  readonly state: BiosafetyState;
  readonly requiredPpe: readonly string[];
  readonly reasons: readonly string[];
}

export interface OrpheusRunRequest {
  readonly runId: string;
  readonly specimenId: string;
  readonly protocolId: string;
  readonly seed: number;
  readonly requestedAtLogicalTime: number;
}

export interface OrpheusRunResult {
  readonly runId: string;
  readonly specimenId: string;
  readonly protocolId: string;
  readonly outputMetrics: readonly { readonly name: string; readonly value: number; readonly unit: string }[];
  readonly evidenceIds: readonly string[];
  readonly evidenceHashes: readonly string[];
  readonly outputHash: string;
  readonly status: 'COMPLETED' | 'BLOCKED' | 'FAILED';
  readonly epistemic: EpistemicLabel;
  readonly replayFingerprint: string;
}

export interface VisualMaterialProfile {
  readonly materialId: string;
  readonly baseColorHex: string;
  readonly metalness: number;
  readonly roughness: number;
  readonly transmission: number;
  readonly indexOfRefraction: number;
  readonly emissiveIntensity: number;
  readonly microDetailScale: number;
}

export interface LabRealismProfile {
  readonly renderTier: 'CINEMATIC' | 'BALANCED' | 'PERFORMANCE';
  readonly shadowQuality: 'ULTRA' | 'HIGH' | 'MEDIUM';
  readonly reflectionMode: 'RAY_TRACED' | 'SCREEN_SPACE' | 'CUBEMAP';
  readonly volumetrics: boolean;
  readonly contactShadows: boolean;
  readonly temporalAA: boolean;
  readonly depthOfField: boolean;
  readonly lensDistortion: number;
  readonly chromaticAberration: number;
  readonly filmGrain: number;
  readonly visorCondensation: number;
  readonly visorReflectionStrength: number;
  readonly safeHudInsetPercent: number;
}

export interface HumanVisualProfile {
  readonly realismTier: 'DIGITAL_TWIN' | 'HIGH_FIDELITY' | 'PROXY';
  readonly skinMaterial: VisualMaterialProfile;
  readonly eyeMaterial: VisualMaterialProfile;
  readonly suitMaterial: VisualMaterialProfile;
  readonly gloveMaterial: VisualMaterialProfile;
  readonly requiredAssetSlots: readonly string[];
}

export interface BiologyLabCommand {
  readonly commandId: string;
  readonly kind:
    | 'OPEN_TWIN' | 'FOCUS_ANATOMY' | 'SET_ANATOMY_MODE' | 'OPEN_HYPERSCOPE'
    | 'CAPTURE_HYPERSCOPE' | 'OPEN_IMAGING' | 'CREATE_SLIDE' | 'INSPECT_CELL'
    | 'RUN_ORPHEUS' | 'MOVE_TO_STATION' | 'SELECT_SPECIMEN' | 'SHOW_EVIDENCE';
  readonly targetId?: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly sourceText: string;
  readonly requestedAtLogicalTime: number;
}

export interface BiologyLabState {
  readonly worldId: string;
  readonly twin: HumanDigitalTwinManifest;
  readonly anatomyView: AnatomyViewState;
  readonly neuro: NeuroLabState;
  readonly selectedSpecimenId?: string;
  readonly selectedStationId?: string;
  readonly selectedEquipmentId?: string;
  readonly lastHyperscopeCapture?: HyperscopeCapture;
  readonly lastImagingFrame?: ImagingFrame;
  readonly lastOrpheusRun?: OrpheusRunResult;
}
