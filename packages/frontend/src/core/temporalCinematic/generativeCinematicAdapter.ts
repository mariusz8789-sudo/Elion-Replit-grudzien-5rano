import { canonicalJson, fnv1a } from '../events/hash';
import type { CameraKeyframe } from './cameraPath';

export type GenerativeVideoMode = 'TEXT_TO_VIDEO' | 'IMAGE_TO_VIDEO' | 'VIDEO_TO_VIDEO';
export type GenerativeVideoStatus =
  | 'GENERATED'
  | 'BLOCKED_PROVIDER_UNAVAILABLE'
  | 'BLOCKED_UNSUPPORTED_MODE'
  | 'BLOCKED_INVALID_INPUT'
  | 'BLOCKED_INVALID_OUTPUT';

export interface GenerativeControlFrame {
  readonly frameId: string;
  readonly timeSeconds: number;
  readonly imageRef?: string;
  readonly depthRef?: string;
  readonly normalsRef?: string;
  readonly segmentationRef?: string;
}

export interface GenerativeCinematicControlPackage {
  readonly contractVersion: '1.0.0';
  readonly mode: GenerativeVideoMode;
  readonly prompt: string;
  readonly source: {
    readonly worldId: string;
    readonly scientificStateFingerprint: string;
    readonly deterministicSourceFingerprint: string;
    readonly epistemicStatus: string;
  };
  readonly camera: {
    readonly durationSeconds: number;
    readonly keyframes: readonly CameraKeyframe[];
  };
  readonly controlFrames: readonly GenerativeControlFrame[];
  readonly sourceVideoRef?: string;
  readonly classification: 'GENERATED_MEDIA';
  readonly authority: 'VISUALIZATION_ONLY';
  readonly evidenceEligible: false;
  readonly scientificStateMutation: false;
}

export interface BuildGenerativeControlPackageInput {
  readonly mode: GenerativeVideoMode;
  readonly prompt: string;
  readonly worldId: string;
  readonly scientificStateFingerprint: string;
  readonly epistemicStatus: string;
  readonly durationSeconds: number;
  readonly cameraKeyframes: readonly CameraKeyframe[];
  readonly controlFrames?: readonly GenerativeControlFrame[];
  readonly sourceVideoRef?: string;
}

export interface GenerativeProviderRequest {
  readonly controlPackage: GenerativeCinematicControlPackage;
}

export interface GenerativeProviderOutput {
  readonly mediaRef: string;
  readonly outputSha256: string;
  readonly model: string;
  readonly modelVersion?: string;
  readonly providerExecutionId: string;
}

export interface GenerativeVideoProviderAdapter {
  readonly providerId: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  readonly supportedModes: readonly GenerativeVideoMode[];
  generate(request: GenerativeProviderRequest): Promise<GenerativeProviderOutput>;
}

export interface GenerativeCinematicResult {
  readonly status: GenerativeVideoStatus;
  readonly reason?: string;
  readonly sourceFingerprint: string;
  readonly classification: 'GENERATED_MEDIA';
  readonly authority: 'VISUALIZATION_ONLY';
  readonly evidenceEligible: false;
  readonly scientificStateMutation: false;
  readonly provenance?: {
    readonly providerId: string;
    readonly providerExecutionId: string;
    readonly model: string;
    readonly modelVersion?: string;
    readonly outputSha256: string;
    readonly mediaRef: string;
  };
}

function detachedClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function buildGenerativeCinematicControlPackage(
  input: BuildGenerativeControlPackageInput,
): GenerativeCinematicControlPackage {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('GENERATIVE_CINEMATIC_PROMPT_REQUIRED');
  if (!input.worldId.trim() || !input.scientificStateFingerprint.trim()) {
    throw new Error('GENERATIVE_CINEMATIC_SOURCE_REQUIRED');
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    throw new Error('GENERATIVE_CINEMATIC_DURATION_INVALID');
  }
  const controlFrames = detachedClone(input.controlFrames ?? []);
  if (input.mode === 'IMAGE_TO_VIDEO' && !controlFrames.some((frame) => Boolean(frame.imageRef))) {
    throw new Error('GENERATIVE_CINEMATIC_IMAGE_REFERENCE_REQUIRED');
  }
  if (input.mode === 'VIDEO_TO_VIDEO' && !input.sourceVideoRef?.trim()) {
    throw new Error('GENERATIVE_CINEMATIC_VIDEO_REFERENCE_REQUIRED');
  }
  const fingerprintBasis = {
    worldId: input.worldId,
    scientificStateFingerprint: input.scientificStateFingerprint,
    epistemicStatus: input.epistemicStatus,
    durationSeconds: input.durationSeconds,
    cameraKeyframes: input.cameraKeyframes,
    controlFrames,
    sourceVideoRef: input.sourceVideoRef ?? null,
  };
  return {
    contractVersion: '1.0.0',
    mode: input.mode,
    prompt,
    source: {
      worldId: input.worldId,
      scientificStateFingerprint: input.scientificStateFingerprint,
      deterministicSourceFingerprint: fnv1a(canonicalJson(fingerprintBasis)),
      epistemicStatus: input.epistemicStatus,
    },
    camera: {
      durationSeconds: input.durationSeconds,
      keyframes: detachedClone(input.cameraKeyframes),
    },
    controlFrames,
    ...(input.sourceVideoRef ? { sourceVideoRef: input.sourceVideoRef } : {}),
    classification: 'GENERATED_MEDIA',
    authority: 'VISUALIZATION_ONLY',
    evidenceEligible: false,
    scientificStateMutation: false,
  };
}

function blocked(
  status: Exclude<GenerativeVideoStatus, 'GENERATED'>,
  sourceFingerprint: string,
  reason: string,
): GenerativeCinematicResult {
  return {
    status,
    reason,
    sourceFingerprint,
    classification: 'GENERATED_MEDIA',
    authority: 'VISUALIZATION_ONLY',
    evidenceEligible: false,
    scientificStateMutation: false,
  };
}

export async function executeGenerativeCinematic(
  provider: GenerativeVideoProviderAdapter,
  controlPackage: GenerativeCinematicControlPackage,
): Promise<GenerativeCinematicResult> {
  const sourceFingerprint = controlPackage.source.deterministicSourceFingerprint;
  if (!provider.available) {
    return blocked('BLOCKED_PROVIDER_UNAVAILABLE', sourceFingerprint, provider.unavailableReason ?? 'Provider unavailable');
  }
  if (!provider.supportedModes.includes(controlPackage.mode)) {
    return blocked('BLOCKED_UNSUPPORTED_MODE', sourceFingerprint, `${provider.providerId} does not support ${controlPackage.mode}`);
  }

  const original = canonicalJson(controlPackage);
  let output: GenerativeProviderOutput;
  try {
    output = await provider.generate({ controlPackage: detachedClone(controlPackage) });
  } catch (error) {
    return blocked('BLOCKED_INVALID_OUTPUT', sourceFingerprint, error instanceof Error ? error.message : String(error));
  }
  if (canonicalJson(controlPackage) !== original) {
    return blocked('BLOCKED_INVALID_OUTPUT', sourceFingerprint, 'Scientific source package was mutated');
  }
  if (!output.mediaRef.trim() || !output.providerExecutionId.trim() || !output.model.trim() || !validSha256(output.outputSha256)) {
    return blocked('BLOCKED_INVALID_OUTPUT', sourceFingerprint, 'Provider returned incomplete or unverifiable media provenance');
  }
  return {
    status: 'GENERATED',
    sourceFingerprint,
    classification: 'GENERATED_MEDIA',
    authority: 'VISUALIZATION_ONLY',
    evidenceEligible: false,
    scientificStateMutation: false,
    provenance: {
      providerId: provider.providerId,
      providerExecutionId: output.providerExecutionId,
      model: output.model,
      ...(output.modelVersion ? { modelVersion: output.modelVersion } : {}),
      outputSha256: output.outputSha256,
      mediaRef: output.mediaRef,
    },
  };
}

export function createUnavailableGenerativeVideoProvider(
  providerId: string,
  reason: string,
): GenerativeVideoProviderAdapter {
  return {
    providerId,
    available: false,
    unavailableReason: reason,
    supportedModes: [],
    generate: async () => { throw new Error(reason); },
  };
}
