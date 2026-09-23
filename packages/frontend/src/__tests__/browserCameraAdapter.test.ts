import { describe, expect, it, vi } from 'vitest';
import { createBrowserCameraAdapter, type CameraCapabilityState, type MinimalMediaDevices } from '../core/mirrorProduct/browserCameraAdapter';

/**
 * BROWSER CAMERA ADAPTER — the one real `getUserMedia` integration in this
 * repo. These tests never touch a real camera: `MinimalMediaDevices` is
 * injected, exactly the seam the adapter exists to provide. They prove real
 * consent/capability reporting, that telemetry is NEVER fabricated for a
 * camera that was never opened, that it is NEVER reported as real face
 * tracking (`mode` is always `SYNTHETIC_FALLBACK`, `confidence` is always 0),
 * and that every opened track is really stopped on `stop()` — the GPU/media
 * lifecycle discipline the product brief requires.
 */

function fakeTrack(): MediaStreamTrack {
  return { label: 'Fake Camera 0', stop: vi.fn() } as unknown as MediaStreamTrack;
}

function fakeStream(tracks: MediaStreamTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream;
}

describe('browserCameraAdapter: capability reporting is real, never fabricated', () => {
  it('reports UNAVAILABLE, never crashes, when no mediaDevices exists in this environment', async () => {
    const adapter = createBrowserCameraAdapter(null);
    expect(adapter.getState().status).toBe('UNAVAILABLE');
    const state = await adapter.requestCapability();
    expect(state.status).toBe('UNAVAILABLE');
    expect(adapter.buildTelemetry(0)).toBeNull();
  });

  it('starts NOT_REQUESTED and never invents telemetry before a real request', () => {
    const mediaDevices: MinimalMediaDevices = { getUserMedia: vi.fn() };
    const adapter = createBrowserCameraAdapter(mediaDevices);
    expect(adapter.getState().status).toBe('NOT_REQUESTED');
    expect(adapter.buildTelemetry(1000)).toBeNull();
  });

  it('on a real granted stream: STREAM_OPEN, real device label and track count, honest SYNTHETIC_FALLBACK telemetry', async () => {
    const track = fakeTrack();
    const stream = fakeStream([track]);
    const mediaDevices: MinimalMediaDevices = { getUserMedia: vi.fn().mockResolvedValue(stream) };
    const adapter = createBrowserCameraAdapter(mediaDevices);

    const state = await adapter.requestCapability();
    expect(state).toEqual<CameraCapabilityState>({ status: 'STREAM_OPEN', deviceLabel: 'Fake Camera 0', trackCount: 1, errorMessage: null });

    const telemetry = adapter.buildTelemetry(5000);
    expect(telemetry).toEqual({ consent: true, containsRawImage: false, mode: 'SYNTHETIC_FALLBACK', confidence: 0, sentAt: 5000, ttlMs: 10_000 });
    // Never claims real face tracking — this repo has no MediaPipe integration.
    expect(telemetry?.mode).not.toBe('MEDIAPIPE');
  });

  it('a real permission denial is reported as PERMISSION_DENIED, never a generic/misleading error', async () => {
    const denied = Object.assign(new Error('User denied camera access'), { name: 'NotAllowedError' });
    const mediaDevices: MinimalMediaDevices = { getUserMedia: vi.fn().mockRejectedValue(denied) };
    const adapter = createBrowserCameraAdapter(mediaDevices);

    const state = await adapter.requestCapability();
    expect(state.status).toBe('PERMISSION_DENIED');
    expect(state.errorMessage).toContain('NotAllowedError');
    expect(adapter.buildTelemetry(1)).toBeNull();
  });

  it('any other real failure (e.g. no camera device) is reported as ERROR with the real message, never silently swallowed', async () => {
    const notFound = Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
    const mediaDevices: MinimalMediaDevices = { getUserMedia: vi.fn().mockRejectedValue(notFound) };
    const adapter = createBrowserCameraAdapter(mediaDevices);

    const state = await adapter.requestCapability();
    expect(state.status).toBe('ERROR');
    expect(state.errorMessage).toContain('NotFoundError');
  });
});

describe('browserCameraAdapter: media-track lifecycle discipline (no leaked tracks)', () => {
  it('stop() really stops every opened track exactly once, and telemetry stops after stop()', async () => {
    const trackA = fakeTrack();
    const trackB = fakeTrack();
    const stream = fakeStream([trackA, trackB]);
    const mediaDevices: MinimalMediaDevices = { getUserMedia: vi.fn().mockResolvedValue(stream) };
    const adapter = createBrowserCameraAdapter(mediaDevices);

    await adapter.requestCapability();
    expect(adapter.getState().status).toBe('STREAM_OPEN');

    adapter.stop();
    expect(trackA.stop).toHaveBeenCalledTimes(1);
    expect(trackB.stop).toHaveBeenCalledTimes(1);
    expect(adapter.getState()).toEqual<CameraCapabilityState>({ status: 'STOPPED', deviceLabel: null, trackCount: 0, errorMessage: null });
    expect(adapter.buildTelemetry(999)).toBeNull();
  });

  it('stop() is idempotent and safe when nothing was ever opened (e.g. unmount before consent)', () => {
    const mediaDevices: MinimalMediaDevices = { getUserMedia: vi.fn() };
    const adapter = createBrowserCameraAdapter(mediaDevices);
    expect(() => adapter.stop()).not.toThrow();
    expect(() => adapter.stop()).not.toThrow();
    expect(adapter.getState().status).toBe('NOT_REQUESTED');
  });

  it('calling stop() twice after a real open never double-stops or throws', async () => {
    const track = fakeTrack();
    const stream = fakeStream([track]);
    const mediaDevices: MinimalMediaDevices = { getUserMedia: vi.fn().mockResolvedValue(stream) };
    const adapter = createBrowserCameraAdapter(mediaDevices);
    await adapter.requestCapability();

    adapter.stop();
    adapter.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
