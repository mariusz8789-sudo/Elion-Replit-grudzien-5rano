import { existsSync, statSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

const FALLBACK_EXECUTABLES = [process.env.GENESIS_CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium'].filter((v): v is string => Boolean(v));
const CANVAS_SELECTOR = 'canvas[data-testid="temporal-cinematic-canvas"]';

export type CanonicalBrowserFrameFailureReason = 'BROWSER_UNAVAILABLE' | 'CANVAS_UNAVAILABLE' | 'CAPTURE_HOOK_UNAVAILABLE' | 'FRAME_CAPTURE_FAILED';
export type CanonicalBrowserFrameResult =
  | { readonly ok: true; readonly path: string; readonly byteLength: number }
  | { readonly ok: false; readonly reason: CanonicalBrowserFrameFailureReason; readonly detail: string };

export class CanonicalBrowserFrameRenderer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async launch(routeUrl: string, viewport = { width: 1280, height: 720 }): Promise<{ ok: true } | { ok: false; reason: 'BROWSER_UNAVAILABLE'; detail: string }> {
    try {
      try { this.browser = await chromium.launch({ headless: true }); }
      catch (firstError) {
        const fallback = FALLBACK_EXECUTABLES.find((p) => existsSync(p));
        if (!fallback) throw firstError;
        this.browser = await chromium.launch({ headless: true, executablePath: fallback, args: ['--no-sandbox'] });
      }
      this.page = await this.browser.newPage({ viewport });
      await this.page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
      await this.page.goto(routeUrl, { waitUntil: 'load', timeout: 30_000 });
      return { ok: true };
    } catch (err) {
      await this.close();
      return { ok: false, reason: 'BROWSER_UNAVAILABLE', detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async captureFrame(seconds: number, outPath: string): Promise<CanonicalBrowserFrameResult> {
    const page = this.page;
    if (!page) return { ok: false, reason: 'BROWSER_UNAVAILABLE', detail: 'launch() has not completed.' };
    const canvas = page.locator(CANVAS_SELECTOR);
    try { await canvas.waitFor({ state: 'visible', timeout: 15_000 }); }
    catch (err) { return { ok: false, reason: 'CANVAS_UNAVAILABLE', detail: err instanceof Error ? err.message : String(err) }; }
    try {
      await page.waitForFunction(() => {
        const hook = window.__GENESIS_TEMPORAL_CAPTURE__;
        return Boolean(hook && hook.ready === true && typeof hook.seekTo === 'function');
      }, undefined, { timeout: 20_000 });
    } catch (err) { return { ok: false, reason: 'CAPTURE_HOOK_UNAVAILABLE', detail: err instanceof Error ? err.message : String(err) }; }
    try {
      await page.evaluate(async (t) => {
        const hook = window.__GENESIS_TEMPORAL_CAPTURE__!;
        if (typeof hook.seekAndWait === 'function') await hook.seekAndWait(t);
        else {
          hook.seekTo(t);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        }
      }, seconds);
      // A software-rendered canvas under continuous weather-particle animation never settles
      // Playwright's element/locator screenshot stability wait; page.screenshot({clip}) does not wait for it.
      const box = await canvas.boundingBox();
      if (!box) return { ok: false, reason: 'CANVAS_UNAVAILABLE', detail: 'canonical canvas has no bounding box' };
      await page.screenshot({ path: outPath, type: 'jpeg', quality: 94, clip: box, timeout: 60_000 });
      const byteLength = statSync(outPath).size;
      if (byteLength <= 0) return { ok: false, reason: 'FRAME_CAPTURE_FAILED', detail: 'Canvas screenshot is empty.' };
      return { ok: true, path: outPath, byteLength };
    } catch (err) { return { ok: false, reason: 'FRAME_CAPTURE_FAILED', detail: err instanceof Error ? err.message : String(err) }; }
  }

  async getPresentationSummary(): Promise<unknown> {
    if (!this.page) return null;
    return this.page.evaluate(() => window.__GENESIS_TEMPORAL_CAPTURE__?.getPresentationSummary?.() ?? null);
  }

  async close(): Promise<void> {
    try { await this.page?.close(); } catch { /* noop */ }
    try { await this.browser?.close(); } catch { /* noop */ }
    this.page = null; this.browser = null;
  }
}
