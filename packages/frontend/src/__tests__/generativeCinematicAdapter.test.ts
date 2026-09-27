import { describe, expect, it } from 'vitest';
import {
  buildGenerativeCinematicControlPackage,
  createUnavailableGenerativeVideoProvider,
  executeGenerativeCinematic,
  type GenerativeVideoProviderAdapter,
} from '../core/temporalCinematic/generativeCinematicAdapter';

const SHA = 'a'.repeat(64);

function control(mode: 'TEXT_TO_VIDEO' | 'IMAGE_TO_VIDEO' | 'VIDEO_TO_VIDEO' = 'TEXT_TO_VIDEO') {
  return buildGenerativeCinematicControlPackage({
    mode,
    prompt: 'Show the modeled collision step by step.',
    worldId: 'world:cern:model',
    scientificStateFingerprint: 'state-123',
    epistemicStatus: 'SIMULATION',
    durationSeconds: 8,
    cameraKeyframes: [
      { t: 0, position: { x: 0, y: 2, z: 8 }, lookAt: { x: 0, y: 0, z: 0 } },
      { t: 8, position: { x: 8, y: 2, z: 0 }, lookAt: { x: 0, y: 0, z: 0 } },
    ],
    controlFrames: [{ frameId: 'f0', timeSeconds: 0, imageRef: 'capture://f0', depthRef: 'depth://f0', segmentationRef: 'ids://f0' }],
    ...(mode === 'VIDEO_TO_VIDEO' ? { sourceVideoRef: 'capture://source.mp4' } : {}),
  });
}

function provider(overrides: Partial<GenerativeVideoProviderAdapter> = {}): GenerativeVideoProviderAdapter {
  return {
    providerId: 'test-provider',
    available: true,
    supportedModes: ['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'VIDEO_TO_VIDEO'],
    generate: async () => ({
      mediaRef: 'generated://movie.mp4',
      outputSha256: SHA,
      model: 'test-video-model',
      modelVersion: '1',
      providerExecutionId: 'exec-1',
    }),
    ...overrides,
  };
}

describe('Generative Cinematic Layer contract', () => {
  it('creates the same source fingerprint for the same scientific state and camera package', () => {
    expect(control().source.deterministicSourceFingerprint).toBe(control().source.deterministicSourceFingerprint);
  });

  it('changes the source fingerprint when the scientific state changes', () => {
    const a = control();
    const b = buildGenerativeCinematicControlPackage({
      mode: 'TEXT_TO_VIDEO', prompt: a.prompt, worldId: a.source.worldId,
      scientificStateFingerprint: 'state-CHANGED', epistemicStatus: 'SIMULATION',
      durationSeconds: a.camera.durationSeconds, cameraKeyframes: a.camera.keyframes,
    });
    expect(b.source.deterministicSourceFingerprint).not.toBe(a.source.deterministicSourceFingerprint);
  });

  it('keeps generated media permanently non-authoritative and Evidence-ineligible', async () => {
    const result = await executeGenerativeCinematic(provider(), control());
    expect(result).toMatchObject({
      status: 'GENERATED', classification: 'GENERATED_MEDIA', authority: 'VISUALIZATION_ONLY',
      evidenceEligible: false, scientificStateMutation: false,
    });
  });

  it('preserves provider/model/output provenance and the source fingerprint', async () => {
    const input = control();
    const result = await executeGenerativeCinematic(provider(), input);
    expect(result.sourceFingerprint).toBe(input.source.deterministicSourceFingerprint);
    expect(result.provenance).toEqual({
      providerId: 'test-provider', providerExecutionId: 'exec-1', model: 'test-video-model',
      modelVersion: '1', outputSha256: SHA, mediaRef: 'generated://movie.mp4',
    });
  });

  it('returns BLOCKED when no provider is configured', async () => {
    const result = await executeGenerativeCinematic(
      createUnavailableGenerativeVideoProvider('none', 'No credentials configured'), control(),
    );
    expect(result.status).toBe('BLOCKED_PROVIDER_UNAVAILABLE');
  });

  it('returns BLOCKED for an unsupported mode', async () => {
    const result = await executeGenerativeCinematic(provider({ supportedModes: ['TEXT_TO_VIDEO'] }), control('IMAGE_TO_VIDEO'));
    expect(result.status).toBe('BLOCKED_UNSUPPORTED_MODE');
  });

  it('requires actual image/video references for conditioned modes', () => {
    expect(() => buildGenerativeCinematicControlPackage({
      mode: 'IMAGE_TO_VIDEO', prompt: 'x', worldId: 'w', scientificStateFingerprint: 's',
      epistemicStatus: 'MODEL', durationSeconds: 1, cameraKeyframes: [],
    })).toThrow('GENERATIVE_CINEMATIC_IMAGE_REFERENCE_REQUIRED');
    expect(() => buildGenerativeCinematicControlPackage({
      mode: 'VIDEO_TO_VIDEO', prompt: 'x', worldId: 'w', scientificStateFingerprint: 's',
      epistemicStatus: 'MODEL', durationSeconds: 1, cameraKeyframes: [],
    })).toThrow('GENERATIVE_CINEMATIC_VIDEO_REFERENCE_REQUIRED');
  });

  it('does not let a provider mutate the canonical source package', async () => {
    const input = control();
    const before = JSON.stringify(input);
    const mutatingProvider = provider({
      generate: async (request) => {
        (request.controlPackage.source as { worldId: string }).worldId = 'tampered';
        return { mediaRef: 'generated://movie.mp4', outputSha256: SHA, model: 'm', providerExecutionId: 'e' };
      },
    });
    const result = await executeGenerativeCinematic(mutatingProvider, input);
    expect(result.status).toBe('GENERATED');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('blocks unverifiable provider output instead of claiming success', async () => {
    const result = await executeGenerativeCinematic(provider({
      generate: async () => ({ mediaRef: 'generated://movie.mp4', outputSha256: 'not-a-sha', model: 'm', providerExecutionId: 'e' }),
    }), control());
    expect(result.status).toBe('BLOCKED_INVALID_OUTPUT');
    expect(result.provenance).toBeUndefined();
  });

  it('is provider-agnostic', async () => {
    const second = provider({ providerId: 'another-provider' });
    const result = await executeGenerativeCinematic(second, control());
    expect(result.provenance?.providerId).toBe('another-provider');
  });
});
