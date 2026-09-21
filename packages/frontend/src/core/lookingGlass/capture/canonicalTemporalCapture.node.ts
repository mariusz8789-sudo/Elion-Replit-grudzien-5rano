import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CanonicalBrowserFrameRenderer, type CanonicalBrowserFrameResult } from './canonicalBrowserFrameRenderer.node';
import { encodeCanonicalFramesToWebm, type CanonicalVideoArtifact } from './canonicalVideoEncoder.node';

export interface CanonicalTemporalCaptureRequest {
  readonly baseUrl: string;
  readonly place: string;
  readonly year: number;
  readonly durationSeconds: number;
  readonly frameCount: number;
  readonly roadIndex?: number;
  readonly weather?: string;
  readonly view?: 'street' | 'interior';
  readonly generateInteriors?: boolean;
  readonly outputDirectory: string;
  readonly encodeVideo?: boolean;
}

export interface CanonicalTemporalCaptureResult {
  readonly routeUrl: string;
  readonly browserAvailable: boolean;
  readonly frames: readonly CanonicalBrowserFrameResult[];
  readonly capturedPaths: readonly string[];
  readonly presentationSummary: unknown;
  readonly video: CanonicalVideoArtifact | null;
}

export function buildCanonicalTemporalRoute(request: Omit<CanonicalTemporalCaptureRequest, 'outputDirectory' | 'frameCount' | 'encodeVideo'>): string {
  const base = request.baseUrl.replace(/\/$/, '');
  const q = new URLSearchParams({ place: request.place, year: String(request.year), duration: String(request.durationSeconds), road: String(request.roadIndex ?? 1), view: request.view ?? 'street' });
  if (request.weather) q.set('weather', request.weather);
  if (request.generateInteriors || request.view === 'interior') q.set('interiors', '1');
  return `${base}/#/temporal-cinematic?${q.toString()}`;
}

export async function captureCanonicalTemporalSequence(request: CanonicalTemporalCaptureRequest): Promise<CanonicalTemporalCaptureResult> {
  mkdirSync(request.outputDirectory, { recursive: true });
  const routeUrl = buildCanonicalTemporalRoute(request);
  const renderer = new CanonicalBrowserFrameRenderer();
  const launched = await renderer.launch(routeUrl);
  if (!launched.ok) return { routeUrl, browserAvailable: false, frames: [{ ok: false, reason: launched.reason, detail: launched.detail }], capturedPaths: [], presentationSummary: null, video: null };
  const frames: CanonicalBrowserFrameResult[] = [];
  const capturedPaths: string[] = [];
  try {
    const countRaw = Number.isFinite(request.frameCount) ? Math.round(request.frameCount) : 2;
    const durationRaw = Number.isFinite(request.durationSeconds) ? request.durationSeconds : 1;
    const count = Math.max(2, Math.min(7200, countRaw));
    const duration = Math.max(0.05, durationRaw);
    for (let i = 0; i < count; i += 1) {
      const t = (i / (count - 1)) * duration;
      const out = path.join(request.outputDirectory, `frame-${String(i).padStart(4, '0')}.jpg`);
      const result = await renderer.captureFrame(t, out);
      frames.push(result); if (result.ok) capturedPaths.push(result.path);
    }
    const presentationSummary = await renderer.getPresentationSummary();
    const video = request.encodeVideo && capturedPaths.length === count
      ? encodeCanonicalFramesToWebm(capturedPaths, path.join(request.outputDirectory, 'capture.webm'), Math.max(1, count / duration))
      : null;
    return { routeUrl, browserAvailable: true, frames, capturedPaths, presentationSummary, video };
  } finally { await renderer.close(); }
}
