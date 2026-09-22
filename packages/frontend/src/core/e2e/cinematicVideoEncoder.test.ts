import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface EncoderCapabilityAvailable {
  readonly status: 'AVAILABLE';
  readonly format: 'MP4' | 'WEBM';
  readonly codec: 'H264' | 'VP8';
  readonly binary: string;
  readonly source: 'NPM_FFMPEG_STATIC' | 'SYSTEM_FFMPEG' | 'PLAYWRIGHT_FFMPEG';
}

interface EncoderCapabilityBlocked {
  readonly status: 'BLOCKED_BY_RUNTIME';
  readonly format: null;
  readonly codec: null;
  readonly binary: null;
  readonly source: null;
  readonly reason: string;
}

interface EncodeResult {
  readonly status: 'AVAILABLE' | 'BLOCKED_BY_INPUT' | 'BLOCKED_BY_RUNTIME';
  readonly outputPath: string | null;
  readonly frameCount: number;
  readonly note: string;
}

const ENCODER = [
  path.resolve(process.cwd(), 'scripts/cinematic-video-encoder.mjs'),
  path.resolve(process.cwd(), '../../scripts/cinematic-video-encoder.mjs'),
].find(existsSync) ?? path.resolve(process.cwd(), 'scripts/cinematic-video-encoder.mjs');

function runEncoder<T>(args: readonly string[]): T {
  const result = spawnSync(process.execPath, [ENCODER, ...args], { encoding: 'utf8', windowsHide: true });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as T;
}

describe('cinematic video encoder capability gate', () => {
  it('reports only a real supported encoder or an explicit runtime block', () => {
    const capability = runEncoder<EncoderCapabilityAvailable | EncoderCapabilityBlocked>(['--probe']);
    expect(['AVAILABLE', 'BLOCKED_BY_RUNTIME']).toContain(capability.status);
    if (capability.status === 'AVAILABLE') {
      expect(capability.binary.length).toBeGreaterThan(0);
      expect([['MP4', 'H264'], ['WEBM', 'VP8']]).toContainEqual([capability.format, capability.codec]);
    } else {
      expect(capability.format).toBeNull();
      expect(capability.codec).toBeNull();
      expect(capability.reason.length).toBeGreaterThan(10);
    }
  });

  it('fails closed before invoking an encoder when no frames were supplied', () => {
    const request = JSON.stringify({ framePaths: [], outputBasePath: 'unused-output', fps: 24 });
    const result = runEncoder<EncodeResult>(['--encode-json', request]);
    expect(result).toMatchObject({ status: 'BLOCKED_BY_INPUT', outputPath: null, frameCount: 0 });
    expect(result.note).toContain('No JPEG frames');
  });

  it('fails closed when any requested source frame is missing', () => {
    const request = JSON.stringify({ framePaths: ['definitely-missing-genesis-frame.jpg'], outputBasePath: 'unused-output', fps: 24 });
    const result = runEncoder<EncodeResult>(['--encode-json', request]);
    expect(result).toMatchObject({ status: 'BLOCKED_BY_INPUT', outputPath: null, frameCount: 1 });
    expect(result.note).toContain('Frame is missing');
  });
});
