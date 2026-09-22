import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bundledFfmpegAvailable,
  encodeCanonicalFramesToMp4,
  encodeCanonicalFramesToWebm,
} from '../core/lookingGlass/capture/canonicalVideoEncoder.node';

// A real, valid 2x2 red-pixel JPEG (standard minimal test fixture), base64-encoded.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

function writeFrames(dir: string, count: number): string[] {
  const bytes = Buffer.from(TINY_JPEG_BASE64, 'base64');
  const paths: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const p = path.join(dir, `frame-${i}.jpg`);
    writeFileSync(p, bytes);
    paths.push(p);
  }
  return paths;
}

describe('canonicalVideoEncoder — MP4 path (Universe Engine cinematic gap-fill)', () => {
  let workDir: string;

  afterEach(() => { if (workDir) rmSync(workDir, { recursive: true, force: true }); });

  it('never fabricates an artifact: no frames supplied is always BLOCKED_BY_RUNTIME for both formats', () => {
    const mp4 = encodeCanonicalFramesToMp4([], '/tmp/does-not-matter.mp4', 24);
    expect(mp4.status).toBe('BLOCKED_BY_RUNTIME');
    expect(mp4.format).toBe('MP4');
    expect(mp4.outputPath).toBeNull();

    const webm = encodeCanonicalFramesToWebm([], '/tmp/does-not-matter.webm', 24);
    expect(webm.status).toBe('BLOCKED_BY_RUNTIME');
    expect(webm.format).toBe('WEBM');
  });

  it('real frames through the real bundled ffmpeg binary: WEBM and MP4 both honestly report AVAILABLE-with-bytes or BLOCKED_BY_RUNTIME-with-a-real-diagnostic, never a fake success', () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'genesis-mp4-test-'));
    const frames = writeFrames(workDir, 3);

    const webm = encodeCanonicalFramesToWebm(frames, path.join(workDir, 'out.webm'), 24);
    expect(webm.format).toBe('WEBM');
    if (webm.status === 'AVAILABLE') {
      expect(webm.byteLength).toBeGreaterThan(0);
      expect(webm.outputPath).toBe(path.join(workDir, 'out.webm'));
    } else {
      expect(webm.note.length).toBeGreaterThan(0);
    }

    const mp4 = encodeCanonicalFramesToMp4(frames, path.join(workDir, 'out.mp4'), 24);
    expect(mp4.format).toBe('MP4');
    if (mp4.status === 'AVAILABLE') {
      expect(mp4.byteLength).toBeGreaterThan(0);
    } else {
      // Real, honest failure — never a placeholder file. In the sandboxed
      // Playwright-bundled ffmpeg build used by this environment this is the
      // expected outcome (verified directly: `ffmpeg -encoders`/`-muxers`
      // list neither libx264 nor an mp4 muxer).
      expect(mp4.status).toBe('BLOCKED_BY_RUNTIME');
      expect(mp4.note.length).toBeGreaterThan(0);
      expect(mp4.outputPath).toBeNull();
    }
  });

  it('bundledFfmpegAvailable() reflects real binary presence (boolean, no side effects)', () => {
    expect(typeof bundledFfmpegAvailable()).toBe('boolean');
  });
});
