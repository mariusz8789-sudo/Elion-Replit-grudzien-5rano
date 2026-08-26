/**
 * HAZARD MODULE REGISTRY & CAPABILITY FENCES.
 *
 * A small, domain-neutral registry describing what each hazard module
 * CLAIMS to do, so nothing downstream (replay, a future projection
 * consumer, a future orchestrator) has to guess or re-derive it. This file
 * contains zero hazard science — it only reads version/label constants that
 * each module already exports and republishes them as one flat descriptor.
 *
 * Adding a NEW hazard here means adding one descriptor entry that points at
 * that hazard's own module constants — never copying its science, its
 * fingerprint logic, or its evidence gate into this file. This module has
 * no opinion about earthquake physics, flood physics, or anything else; it
 * only knows the shape every hazard module must publish about itself.
 */
import { EARTHQUAKE_MODEL_VERSION } from './earthquake/earthquakeModel';
import { EARTHQUAKE_NOT_MODELED, EARTHQUAKE_WORLD_PROJECTION_SCHEMA_VERSION } from './earthquake/earthquakeWorldProjection';
import type { HazardInput, HazardRun } from './contracts';

export interface HazardModuleDescriptor {
  readonly hazardType: string;
  /** Matches HazardRun.hazardModuleVersion for runs this module produced. */
  readonly moduleVersion: string;
  /** Matches the schemaVersion of this module's read-only Digital Twin projection contract. */
  readonly projectionSchemaVersion: string;
  /** True until a module has passed domain review and been approved for anything beyond an architecture demonstration. */
  readonly scenarioOnly: boolean;
  readonly supportedCapabilities: readonly string[];
  /** What this module deliberately does not represent — reused verbatim from the module's own projection contract, never re-typed here. */
  readonly notModeled: readonly string[];
  /** Dotted field paths this module's Evidence Pack gate treats as mandatory — see that module's own evidence file for the actual checks. */
  readonly requiredEvidenceFields: readonly string[];
}

const EARTHQUAKE_REQUIRED_EVIDENCE_FIELDS: readonly string[] = Object.freeze([
  'artifact.artifactId', 'artifact.contentHash', 'artifact.rawContentRef',
  'artifact.provenance.provider', 'artifact.provenance.license', 'artifact.provenance.adapterVersion', 'artifact.provenance.retrievedAt',
  'input.hazardInputId', 'input.hazardType', 'input.sourceArtifactId', 'input.scientificFields', 'input.inputFingerprint',
  'run.hazardRunId', 'run.hazardInputId', 'run.hazardModuleVersion', 'run.codeCommitHash', 'run.resultFingerprint', 'run.status', 'run.createdAt', 'run.outputFields',
  'exposure.exposureSnapshotId', 'exposure.mappingMethod', 'exposure.sites', 'exposure.datasetStatus',
  'impacts',
  'damageAssessments',
]);

const EARTHQUAKE_DESCRIPTOR: HazardModuleDescriptor = Object.freeze({
  hazardType: 'earthquake',
  moduleVersion: EARTHQUAKE_MODEL_VERSION,
  projectionSchemaVersion: EARTHQUAKE_WORLD_PROJECTION_SCHEMA_VERSION,
  scenarioOnly: true,
  supportedCapabilities: Object.freeze([
    'ground-motion-attenuation-synthetic',
    'site-impact-projection',
    'evidence-pack',
    'replay-match-drift-blocked',
  ]),
  notModeled: EARTHQUAKE_NOT_MODELED,
  requiredEvidenceFields: EARTHQUAKE_REQUIRED_EVIDENCE_FIELDS,
});

/** Only `earthquake` is registered. Adding a second hazard type here is explicitly out of this task's scope. */
const REGISTRY: Readonly<Record<string, HazardModuleDescriptor>> = Object.freeze({
  earthquake: EARTHQUAKE_DESCRIPTOR,
});

export class UnknownHazardModuleError extends Error {
  constructor(public readonly hazardType: string) {
    super(`No hazard module registered for hazardType "${hazardType}". Registered: ${Object.keys(REGISTRY).join(', ')}.`);
    this.name = 'UnknownHazardModuleError';
  }
}

export function getHazardModule(hazardType: string): HazardModuleDescriptor {
  const descriptor = REGISTRY[hazardType];
  if (!descriptor) throw new UnknownHazardModuleError(hazardType);
  return descriptor;
}

export function listHazardModules(): readonly HazardModuleDescriptor[] {
  return Object.values(REGISTRY);
}

export class HazardModuleCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HazardModuleCompatibilityError';
  }
}

/**
 * The capability fence: call this before replay or projection consumes a
 * HazardRun, so a run built by an unknown, mismatched, or superseded module
 * version is rejected explicitly instead of silently treated as compatible.
 *
 * - `hazardType` must be registered (otherwise `UnknownHazardModuleError`).
 * - If `input` is provided, its `hazardType` must match, and `run` must
 *   actually reference it (`run.hazardInputId === input.hazardInputId`).
 * - `run.hazardModuleVersion` must match the registered module version.
 * - If `projectionSchemaVersion` is provided, it must match the registered value.
 */
export function assertHazardRunCompatibleWithModule(params: {
  readonly hazardType: string;
  readonly run: HazardRun;
  readonly input?: HazardInput;
  readonly projectionSchemaVersion?: string;
}): void {
  const { hazardType, run, input, projectionSchemaVersion } = params;
  const descriptor = getHazardModule(hazardType);

  if (input !== undefined) {
    if (input.hazardType !== hazardType) {
      throw new HazardModuleCompatibilityError(
        `HazardInput.hazardType "${input.hazardType}" does not match expected hazardType "${hazardType}".`,
      );
    }
    if (run.hazardInputId !== input.hazardInputId) {
      throw new HazardModuleCompatibilityError(
        `HazardRun.hazardInputId "${run.hazardInputId}" does not reference the provided HazardInput "${input.hazardInputId}".`,
      );
    }
  }

  if (run.hazardModuleVersion !== descriptor.moduleVersion) {
    throw new HazardModuleCompatibilityError(
      `HazardRun.hazardModuleVersion "${run.hazardModuleVersion}" does not match registered module version "${descriptor.moduleVersion}" for hazardType "${hazardType}".`,
    );
  }

  if (projectionSchemaVersion !== undefined && projectionSchemaVersion !== descriptor.projectionSchemaVersion) {
    throw new HazardModuleCompatibilityError(
      `Projection schema version "${projectionSchemaVersion}" does not match registered schema version "${descriptor.projectionSchemaVersion}" for hazardType "${hazardType}".`,
    );
  }
}
