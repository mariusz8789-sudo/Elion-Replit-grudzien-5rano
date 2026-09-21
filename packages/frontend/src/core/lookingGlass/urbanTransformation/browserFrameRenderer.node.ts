import { existsSync, statSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import type { HistoricalWorldState } from './contracts.ts';
import { TEMPORAL_CAPTURE_CANVAS_TEST_ID, TEMPORAL_CAPTURE_FRAME_HEIGHT, TEMPORAL_CAPTURE_FRAME_WIDTH, type TemporalCaptureResponse } from './browserCaptureContract.ts';

/** This environment's pre-installed Chromium build has a revision mismatch against the exact
 * `playwright` npm package version pinned here (confirmed: default `chromium.launch()` fails with
 * "Executable doesn't exist" for the headless-shell revision it expects) — falling back to this
 * explicit path (a real, working `chrome` binary symlink) is this environment's own documented fix,
 * tried only after the standard launch fails so a normal environment is unaffected. */
const FALLBACK_CHROMIUM_EXECUTABLE = '/opt/pw-browsers/chromium';

/**
 * BROWSER FRAME RENDERER — the real Node-side capture adapter. Launches a real
 * headless Chromium, navigates to the REAL, already-running Genesis frontend
 * (`#/temporal-cinematic`), and drives `window.__GENESIS_TEMPORAL_CAPTURE__`
 * (installed by `TemporalCinematicStudio.tsx`, which renders the EXISTING
 * `temporalCinematicSceneMount.ts` scene — not a second renderer) to render
 * one real frame per call, then screenshots the real canvas to a real JPEG on
 * disk (see `captureFrame` below for why JPEG, not PNG). Node-only (imports
 * `playwright`, `node:fs`) — the `.node.ts` suffix matches
 * `ffmpegVideoEncoder.node.ts`'s existing convention, so the Vite frontend
 * bundle never reaches this file.
 *
 * Every failure mode is a distinct, named reason — never silently reported as
 * a captured frame.
 */
export type BrowserFrameFailureReason =
  | 'BROWSER_UNAVAILABLE'
  | 'CANVAS_UNAVAILABLE'
  | 'TEMPORAL_CAPTURE_HOOK_UNAVAILABLE'
  | 'FRAME_CAPTURE_FAILED';

export interface BrowserFrameSuccess {
  readonly ok: true;
  readonly byteLength: number;
  readonly path: string;
}
export interface BrowserFrameFailure {
  readonly ok: false;
  readonly reason: BrowserFrameFailureReason;
  readonly detail: string;
}
export type BrowserFrameResult = BrowserFrameSuccess | BrowserFrameFailure;

export class BrowserFrameRenderer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  /** Launches real headless Chromium and navigates to the real, running Genesis route. */
  async launch(routeUrl: string): Promise<{ ok: true } | { ok: false; reason: 'BROWSER_UNAVAILABLE'; detail: string }> {
    try {
      try {
        this.browser = await chromium.launch({ headless: true });
      } catch (firstError) {
        if (!existsSync(FALLBACK_CHROMIUM_EXECUTABLE)) throw firstError;
        this.browser = await chromium.launch({ headless: true, executablePath: FALLBACK_CHROMIUM_EXECUTABLE });
      }
      this.page = await this.browser.newPage({ viewport: { width: TEMPORAL_CAPTURE_FRAME_WIDTH, height: TEMPORAL_CAPTURE_FRAME_HEIGHT } });
      // Skip the real first-run OnboardingOverlay (App.tsx:335 — `if (onboardingOpen) return
      // <OnboardingOverlay .../>` before any route renders) by marking it already-seen via the same
      // localStorage key/shape the app itself writes on a real "Skip"/"Finish" click
      // (core/onboarding.ts's `genesis-os:onboarding/v1` -> `{completed:true}`). This is real product
      // state, set through its own real persistence layer — not a UI bypass hack.
      await this.page.addInitScript(() => {
        window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
      });
      // `networkidle` never fires on this SPA (confirmed: it hung past 3 real minutes with a live,
      // genuinely-rendering page underneath) — `load` is what every other real capture in this
      // pipeline waits on instead.
      await this.page.goto(routeUrl, { waitUntil: 'load', timeout: 30_000 });
      return { ok: true };
    } catch (err) {
      await this.close();
      return { ok: false, reason: 'BROWSER_UNAVAILABLE', detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Renders and captures exactly one real frame for one (state, camera pose) pair. */
  async captureFrame(
    state: HistoricalWorldState,
    cameraPosition: readonly [number, number, number],
    cameraTarget: readonly [number, number, number],
    fov: number,
    timestampSeconds: number,
    outPath: string,
    weather?: string,
  ): Promise<BrowserFrameResult> {
    if (!this.page) return { ok: false, reason: 'BROWSER_UNAVAILABLE', detail: 'launch() was not called, or it failed' };
    const canvas = this.page.locator(`[data-testid="${TEMPORAL_CAPTURE_CANVAS_TEST_ID}"]`);
    try {
      await canvas.waitFor({ state: 'attached', timeout: 10_000 });
    } catch (err) {
      return { ok: false, reason: 'CANVAS_UNAVAILABLE', detail: err instanceof Error ? err.message : String(err) };
    }
    try {
      await this.page.waitForFunction(() => typeof window.__GENESIS_TEMPORAL_CAPTURE__ === 'function', undefined, { timeout: 10_000 });
    } catch (err) {
      return { ok: false, reason: 'TEMPORAL_CAPTURE_HOOK_UNAVAILABLE', detail: err instanceof Error ? err.message : String(err) };
    }
    try {
      const response: TemporalCaptureResponse = await this.page.evaluate(
        ({ state, cameraPosition, cameraTarget, fov, timestampSeconds, weather }) =>
          window.__GENESIS_TEMPORAL_CAPTURE__!({
            temporalState: state,
            camera: { position: cameraPosition, target: cameraTarget, fov },
            timestamp: timestampSeconds,
            weather,
          }),
        { state, cameraPosition, cameraTarget, fov, timestampSeconds, weather },
      );
      if (!response.ok) {
        return { ok: false, reason: 'FRAME_CAPTURE_FAILED', detail: `capture hook reported failure: ${response.reason ?? 'unknown'} — ${response.detail ?? ''}` };
      }
      // JPEG, not PNG: the real, bundled ffmpeg binary this pipeline's video-encode step uses
      // (`bundledFfmpegVideoEncoder.node.ts`) only has an mjpeg decoder built in, confirmed by
      // running it against a real PNG stream (`Unknown decoder 'png'`) — capturing JPEG here is what
      // makes the frames it writes actually decodable by that specific encoder downstream.
      await canvas.screenshot({ path: outPath, type: 'jpeg', quality: 92 });
      const byteLength = statSync(outPath).size;
      if (byteLength === 0) return { ok: false, reason: 'FRAME_CAPTURE_FAILED', detail: 'screenshot produced a zero-byte file' };
      return { ok: true, byteLength, path: outPath };
    } catch (err) {
      return { ok: false, reason: 'FRAME_CAPTURE_FAILED', detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async close(): Promise<void> {
    try { await this.page?.close(); } catch { /* already closed */ }
    try { await this.browser?.close(); } catch { /* already closed */ }
    this.page = null;
    this.browser = null;
  }
}
