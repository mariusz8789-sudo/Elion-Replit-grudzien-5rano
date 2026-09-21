import { describe, expect, it } from 'vitest';
import { renderTemporalScene, NOT_IMPLEMENTED_FRAME_RENDERER, type FrameRenderer } from '../core/lookingGlass/urbanTransformation/temporalRenderController';
import { encodeTemporalVideo, NOT_IMPLEMENTED_VIDEO_ENCODER, type VideoEncoder } from '../core/lookingGlass/urbanTransformation/videoRenderPipeline';
import { generateCameraPath } from '../core/lookingGlass/urbanTransformation/cinematicDirector';
import { buildHistoricalWorldState } from '../core/lookingGlass/urbanTransformation/historicalWorldState';

const anchor = buildHistoricalWorldState('warsaw', 1900)!.anchor;

describe('TemporalRenderController — honest BLOCKED_BY_RUNTIME when no historical renderer exists (renderer unavailable)', () => {
  it('the default renderer reports NOT_RENDERED for every frame, never a fabricated one', () => {
    const states = [buildHistoricalWorldState('warsaw', 1900)!];
    const path = generateCameraPath(anchor, 'OBSERVER', 1, 4);
    const result = renderTemporalScene(states, path, NOT_IMPLEMENTED_FRAME_RENDERER);
    expect(result.allBlocked).toBe(true);
    expect(result.frames.every((f) => f.source === 'NOT_RENDERED')).toBe(true);
    expect(result.frames).toHaveLength(4);
  });

  it('an injected real renderer produces CAPTURED frames — proves the orchestration plumbing genuinely works once a renderer exists', () => {
    const fakeRenderer: FrameRenderer = { renderFrame: () => ({ byteLength: 12345 }) };
    const states = [buildHistoricalWorldState('warsaw', 1900)!];
    const path = generateCameraPath(anchor, 'OBSERVER', 1, 4);
    const result = renderTemporalScene(states, path, fakeRenderer);
    expect(result.allBlocked).toBe(false);
    expect(result.frames.every((f) => f.source === 'CAPTURED' && f.byteLength === 12345)).toBe(true);
  });

  it('a multi-year sequence maps camera frames onto the correct year in proportion', () => {
    const states = [buildHistoricalWorldState('warsaw', 1900)!, buildHistoricalWorldState('warsaw', 2026)!];
    const path = generateCameraPath(anchor, 'OBSERVER', 2, 10); // 20 frames
    const result = renderTemporalScene(states, path, NOT_IMPLEMENTED_FRAME_RENDERER);
    expect(result.frames[0].year).toBe(1900);
    expect(result.frames.at(-1)!.year).toBe(2026);
  });
});

describe('VideoRenderPipeline — real ffmpeg-absence handling, never a fabricated video artifact', () => {
  it('BLOCKED_BY_RUNTIME when no frames were captured at all', () => {
    const video = encodeTemporalVideo([], NOT_IMPLEMENTED_VIDEO_ENCODER);
    expect(video.status).toBe('BLOCKED_BY_RUNTIME');
  });

  it('BLOCKED_BY_RUNTIME (VIDEO_ENCODER_UNAVAILABLE) when frames exist but no encoder is available — this environment genuinely has no ffmpeg', () => {
    const frames = [{ year: 1900, timestampSeconds: 0, source: 'CAPTURED' as const, byteLength: 100, note: 'test' }];
    const video = encodeTemporalVideo(frames, NOT_IMPLEMENTED_VIDEO_ENCODER);
    expect(video.status).toBe('BLOCKED_BY_RUNTIME');
    expect(video.note).toContain('VIDEO_ENCODER_UNAVAILABLE');
  });

  it('an available injected encoder actually gets invoked and its real result is returned unmodified', () => {
    const frames = [{ year: 1900, timestampSeconds: 0, source: 'CAPTURED' as const, byteLength: 100, note: 'test' }];
    const fakeEncoder: VideoEncoder = {
      available: () => true,
      encode: (f) => ({ status: 'AVAILABLE', format: 'MP4', frameCount: f.length, note: 'encoded by fake encoder' }),
    };
    const video = encodeTemporalVideo(frames, fakeEncoder);
    expect(video).toEqual({ status: 'AVAILABLE', format: 'MP4', frameCount: 1, note: 'encoded by fake encoder' });
  });
});
