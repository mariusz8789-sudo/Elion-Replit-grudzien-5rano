import type { ExperimentSession, ExperimentRunResult, SessionInputs, EpistemicStatus } from '../experimentSession';
import type { LabStation as WorldLabStation } from '../labWorld';

/**
 * Regenerative Medicine / Biomedical Intervention Bay.
 *
 * This is an extension of the existing Canonical Laboratory. It is NOT a
 * second laboratory system, experiment system, renderer, or Evidence Ledger.
 * The host should register the returned station in the existing BIOLOGY_STATIONS
 * catalog and the existing AgentController / ExperimentSession pipeline.
 *
 * Scientific boundary:
 * - The bay is a research/simulation environment.
 * - No field below is a clinical diagnosis or treatment recommendation.
 * - Results produced by the bundled runner are explicitly MODEL/SIMULATION.
 */

export const REGENERATIVE_BAY_STATION_ID = 'station:regenerative-medicine';

export const REGENERATIVE_BAY_EXPERIMENTS = [
  'regenerative-baseline',
  'perfusion-counterfactual',
  'tissue-repair-model',
  'intervention-comparison',
  'biosignal-fusion',
] as const;

export type RegenerativeBayExperimentId = typeof REGENERATIVE_BAY_EXPERIMENTS[number];

export type InterventionScenario =
  | 'NO_INTERVENTION'
  | 'PERFUSION_SUPPORT_MODEL'
  | 'REGENERATIVE_SIGNAL_MODEL'
  | 'TARGETED_REPAIR_MODEL';

export interface BiomedicalSensorSpec {
  readonly id: string;
  readonly label: string;
  readonly signal: 'ECG' | 'RESPIRATION' | 'SPO2' | 'TEMPERATURE' | 'PERFUSION_PROXY' | 'TISSUE_OXYGEN_PROXY';
  readonly unit: string;
  readonly sourceClass: 'SIMULATED_SENSOR' | 'EXTERNAL_DATASET' | 'USER_DATASET';
  readonly epistemic: EpistemicStatus;
}

export interface RegenerativeBayEquipmentSpec {
  readonly id: string;
  readonly label: string;
  readonly assetSlot: string;
  readonly capabilities: readonly string[];
}

export interface RegenerativeBayProtocol {
  readonly experimentId: RegenerativeBayExperimentId;
  readonly title: string;
  readonly purpose: string;
  readonly steps: readonly string[];
  readonly safety: 'CONCEPTUAL_ONLY' | 'SIMULATION_ONLY';
  readonly epistemic: EpistemicStatus;
}

export interface RegenerativeBayExperimentAlias {
  readonly experimentId: RegenerativeBayExperimentId;
  readonly keywords: readonly string[];
}

export interface RegenerativeBayStation extends WorldLabStation {
  readonly kind: 'biomedical';
  readonly experimentIds: readonly RegenerativeBayExperimentId[];
  readonly experimentAliases: readonly RegenerativeBayExperimentAlias[];
  readonly bayRole: 'PATIENT_INTAKE' | 'SENSOR_ARRAY' | 'IMAGING_RING' | 'ROBOTIC_MANIPULATION' | 'CONTROL_CONSOLE';
}

export const REGENERATIVE_BAY_SENSORS: readonly BiomedicalSensorSpec[] = [
  { id: 'sensor:ecg', label: 'ECG', signal: 'ECG', unit: 'bpm', sourceClass: 'SIMULATED_SENSOR', epistemic: 'SIMULATION' },
  { id: 'sensor:respiration', label: 'Respiration', signal: 'RESPIRATION', unit: 'breaths/min', sourceClass: 'SIMULATED_SENSOR', epistemic: 'SIMULATION' },
  { id: 'sensor:spo2', label: 'Oxygen Saturation', signal: 'SPO2', unit: '%', sourceClass: 'SIMULATED_SENSOR', epistemic: 'SIMULATION' },
  { id: 'sensor:temperature', label: 'Temperature', signal: 'TEMPERATURE', unit: '°C', sourceClass: 'SIMULATED_SENSOR', epistemic: 'SIMULATION' },
  { id: 'sensor:perfusion', label: 'Perfusion Proxy', signal: 'PERFUSION_PROXY', unit: 'a.u.', sourceClass: 'SIMULATED_SENSOR', epistemic: 'MODEL' },
  { id: 'sensor:tissue-oxygen', label: 'Tissue Oxygen Proxy', signal: 'TISSUE_OXYGEN_PROXY', unit: 'a.u.', sourceClass: 'SIMULATED_SENSOR', epistemic: 'MODEL' },
];

export const REGENERATIVE_BAY_EQUIPMENT: readonly RegenerativeBayEquipmentSpec[] = [
  {
    id: 'equipment:regenerative-bed',
    label: 'Biomedical Intervention Bed',
    assetSlot: 'lab.equipment.biomedical-bed.hero',
    capabilities: ['PATIENT_POSITIONING', 'HUMAN_TWIN_LINK', 'PROTOCOL_SETUP'],
  },
  {
    id: 'equipment:regenerative-sensor-arch',
    label: 'Multimodal Biosensor Arch',
    assetSlot: 'lab.equipment.biomedical-sensor-arch.hero',
    capabilities: ['ECG', 'RESPIRATION', 'SPO2', 'TEMPERATURE', 'PERFUSION_PROXY', 'TISSUE_OXYGEN_PROXY'],
  },
  {
    id: 'equipment:regenerative-imaging-ring',
    label: 'Multimodal Imaging Ring',
    assetSlot: 'lab.equipment.biomedical-imaging-ring.hero',
    capabilities: ['ULTRASOUND_LIKE', 'CT_RECONSTRUCTION', 'MRI_LIKE', 'VOLUME_RECONSTRUCTION'],
  },
  {
    id: 'equipment:regenerative-arm-left',
    label: 'Robotic Research Arm — Left',
    assetSlot: 'lab.equipment.biomedical-arm.left',
    capabilities: ['POSITIONING', 'SENSOR_PLACEMENT', 'SIMULATED_INTERVENTION'],
  },
  {
    id: 'equipment:regenerative-arm-right',
    label: 'Robotic Research Arm — Right',
    assetSlot: 'lab.equipment.biomedical-arm.right',
    capabilities: ['POSITIONING', 'SENSOR_PLACEMENT', 'SIMULATED_INTERVENTION'],
  },
  {
    id: 'equipment:regenerative-console',
    label: 'Biomedical Science Console',
    assetSlot: 'lab.equipment.biomedical-console.hero',
    capabilities: ['BIOSIGNAL_FUSION', 'COUNTERFACTUAL_SIMULATION', 'PROTOCOL_CONTROL', 'EVIDENCE_HANDOFF'],
  },
];

export const REGENERATIVE_BAY_PROTOCOLS: readonly RegenerativeBayProtocol[] = [
  {
    experimentId: 'regenerative-baseline',
    title: 'Baseline physiology capture',
    purpose: 'Capture a deterministic baseline state for subsequent model comparisons.',
    steps: ['PRECHECK', 'ACQUIRE_SENSORS', 'ACQUIRE_IMAGING_MODEL', 'VERIFY', 'REPORT'],
    safety: 'SIMULATION_ONLY',
    epistemic: 'SIMULATION',
  },
  {
    experimentId: 'perfusion-counterfactual',
    title: 'Perfusion counterfactual',
    purpose: 'Compare baseline perfusion proxy with a deterministic model perturbation.',
    steps: ['LOAD_BASELINE', 'APPLY_MODEL_DELTA', 'PROPAGATE', 'OBSERVE', 'REPORT'],
    safety: 'CONCEPTUAL_ONLY',
    epistemic: 'MODEL',
  },
  {
    experimentId: 'tissue-repair-model',
    title: 'Tissue repair progression model',
    purpose: 'Simulate a toy repair trajectory and expose the parameters that drive it.',
    steps: ['LOAD_TISSUE_STATE', 'PROPAGATE_REPAIR_MODEL', 'COMPARE', 'REPORT'],
    safety: 'CONCEPTUAL_ONLY',
    epistemic: 'MODEL',
  },
  {
    experimentId: 'intervention-comparison',
    title: 'Counterfactual intervention comparison',
    purpose: 'Run multiple deterministic intervention scenarios against one baseline.',
    steps: ['CAPTURE_BASELINE', 'RUN_SCENARIO_A', 'RUN_SCENARIO_B', 'COMPARE', 'REPORT'],
    safety: 'CONCEPTUAL_ONLY',
    epistemic: 'SIMULATION',
  },
  {
    experimentId: 'biosignal-fusion',
    title: 'Multimodal biosignal fusion',
    purpose: 'Fuse model sensor streams into a compact state vector for downstream research.',
    steps: ['ACQUIRE_CHANNELS', 'NORMALIZE', 'FUSE', 'VERIFY', 'REPORT'],
    safety: 'SIMULATION_ONLY',
    epistemic: 'SIMULATION',
  },
];

export const REGENERATIVE_BAY_KEYWORDS: readonly string[] = [
  'regenerative medicine', 'regeneracja', 'regeneracji', 'medbed', 'bio med', 'biomedical',
  'baseline physiology', 'physiology baseline', 'baseline', 'perfusion', 'przeplyw krwi',
  'tissue repair', 'naprawa tkanki', 'biosignal fusion', 'fuzja sygnalow', 'intervention comparison', 'porownaj interwencje',
  'intervention bay', 'medical bay', 'biomedical bay', 'stanowisko regeneracji',
  'łóżko medyczne', 'lozko medyczne', 'interwencja', 'tissue repair', 'naprawa tkanki',
  'biosensor', 'biosensors', 'biosensory', 'physiology capture', 'physiology', 'fizjologia',
];

/**
 * Creates the host-side station descriptor. Position is deliberately supplied
 * by the caller so the canonical room placement remains the single source of truth.
 */
/**
 * FIX ON INTEGRATION: the delivered package declared a 5.8 x 7.2 m footprint here (and, separately,
 * identical `BAY_W`/`BAY_D` constants in `regenerativeMedicineBayRunner.ts`) that does not match what
 * `regenerativeMedicineBayGeometry.ts` actually builds — measured programmatically
 * (`new THREE.Box3().setFromObject(group)` on the real geometry at scale 1), the true footprint is
 * 7.73 x 5.95 m.
 *
 * An earlier version of this integration scaled the visual geometry down (`REGENERATIVE_BAY_VISUAL_SCALE`,
 * 0.62) to fit the true footprint into the existing `experimental` room. That approach was explicitly
 * rejected: the Bay is a real physical station and must render at its true, unscaled 1:1 size. It now
 * gets its own dedicated room (`biomedical-bay` in `canonicalLaboratory.ts`), sized and
 * placement-validated for the true footprint — see that room's comment. The constant is kept at 1
 * (identity) rather than removed, so every call site that reads it (the scene-mounting geometry call,
 * this file's own footprint numbers below) stays derived from one place instead of two numbers that
 * could drift apart again. (At true scale, the package's own patient bed is 5.22 m long for a 1.78 m
 * occupant — an unchecked proportion error in the supplied package, visible now that nothing scales it
 * down; left as delivered, since correcting it would mean altering the package's own geometry, out of
 * scope here.)
 */
export const REGENERATIVE_BAY_VISUAL_SCALE = 1;

export function createRegenerativeBayStation(input: {
  readonly position: { readonly x: number; readonly z: number };
  readonly facing: number;
  readonly standoff?: number;
}): RegenerativeBayStation {
  // FIX ON INTEGRATION: the delivered package's own default (1.8) is SMALLER than this station's own
  // true half-depth (footprintD/2 = 2.975 below) — the operator "stands" at a point that falls inside
  // the console's own collision footprint. `planPath`'s `nearestFreePoint` masks this by silently
  // substituting the nearest free cell, which can be many metres away and can land the agent outside
  // the room entirely. 3.8 clears footprintD/2 (2.975) by 0.825 m — well past the planner's own
  // default 0.35 m agent radius. See `regenerativeMedicineBayIntegration.ts`'s matching
  // `BAY_STANDOFF`, which is what the canonical placement search actually uses (this default only
  // applies to a station built outside that search).
  const standoff = input.standoff ?? 3.8;
  // True geometry, 7.725 x 5.950 m at scale 1 (== REGENERATIVE_BAY_VISUAL_SCALE), rounded up for
  // real clearance margin rather than an edge-to-edge fit.
  const footprintW = 7.8;
  const footprintD = 6.0;
  const experimentAliases: readonly RegenerativeBayExperimentAlias[] = [
    { experimentId: 'regenerative-baseline', keywords: ['baseline physiology', 'baseline fizjologii', 'zbierz stan fizjologiczny'] },
    { experimentId: 'perfusion-counterfactual', keywords: ['perfusion counterfactual', 'zasymuluj perfuzje', 'symuluj perfuzje', 'przeplyw krwi'] },
    { experimentId: 'tissue-repair-model', keywords: ['tissue repair', 'naprawa tkanki', 'model naprawy tkanki'] },
    { experimentId: 'intervention-comparison', keywords: ['intervention comparison', 'porownaj interwencje', 'porownaj scenariusze'] },
    { experimentId: 'biosignal-fusion', keywords: ['biosignal fusion', 'fuzja biosygnalow', 'fuzja sygnalow'] },
  ];
  return {
    id: REGENERATIVE_BAY_STATION_ID,
    kind: 'biomedical',
    label: 'Biomedical Intervention Bay',
    experimentId: 'regenerative-baseline',
    experimentIds: REGENERATIVE_BAY_EXPERIMENTS,
    experimentAliases,
    keywords: [...new Set(REGENERATIVE_BAY_KEYWORDS)],
    position: { ...input.position },
    facing: input.facing,
    standoff,
    consoleHeight: 1.1,
    footprint: {
      minX: input.position.x - footprintW / 2,
      maxX: input.position.x + footprintW / 2,
      minZ: input.position.z - footprintD / 2,
      maxZ: input.position.z + footprintD / 2,
    },
    bayRole: 'PATIENT_INTAKE',
  };
}

export interface RegenerativeBayInputs extends SessionInputs {
  readonly baselineHeartRateBpm?: number;
  readonly baselineRespiratoryRatePerMin?: number;
  readonly baselineSpo2Percent?: number;
  readonly baselineTemperatureC?: number;
  readonly intervention?: InterventionScenario;
  readonly horizonTicks?: number;
}

export interface RegenerativeBayArtifact {
  readonly type: 'REGENERATIVE_BAY_ARTIFACT';
  readonly subjectId: string;
  readonly baseline: {
    readonly heartRateBpm: number;
    readonly respiratoryRatePerMin: number;
    readonly spo2Percent: number;
    readonly temperatureC: number;
    readonly perfusionProxy: number;
    readonly tissueOxygenProxy: number;
  };
  readonly scenario: InterventionScenario;
  readonly trajectory: readonly {
    readonly tick: number;
    readonly perfusionProxy: number;
    readonly tissueOxygenProxy: number;
    readonly repairIndex: number;
  }[];
  readonly limitations: readonly string[];
}

export function protocolFor(experimentId: string): RegenerativeBayProtocol | null {
  return REGENERATIVE_BAY_PROTOCOLS.find((p) => p.experimentId === experimentId) ?? null;
}

export function isRegenerativeBayExperiment(experimentId: string): experimentId is RegenerativeBayExperimentId {
  return (REGENERATIVE_BAY_EXPERIMENTS as readonly string[]).includes(experimentId);
}

// Prevent unused type-only import drift when the host wants to annotate a session in adapters.
export type RegenerativeBaySession = ExperimentSession;
export type RegenerativeBayRunResult = ExperimentRunResult<RegenerativeBayArtifact>;
