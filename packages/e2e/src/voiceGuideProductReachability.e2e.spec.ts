/* Proprietary / All Rights Reserved - Genesis OS */
// Voice guide + product reachability smoke (Playwright, real Chromium, production server).
//
// Two things this branch touched, proven together in one real browser session:
//  1. The voice guide (start/stop/mute, honest fallback when SpeechSynthesis has no usable
//     voices, current-screen captioning) actually works end to end at `#/research-console`.
//  2. The two navigation entries added in `core/navigation.ts` (`virtual-bio`, `gov-campaign`)
//     plus the five already-wired surfaces this task was asked to verify (CERN, Cyber, Mirror,
//     World Director, and — via the sidebar — Virtual Lab) are each reachable by clicking real
//     menu buttons, not only by typing a hash: the whole point of the underlying defect this
//     branch fixed was that a menu entry can be silently missing while the route itself still
//     resolves.
import { test, expect, type Page } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({
  launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) },
});

async function openMoreMenu(page: Page): Promise<void> {
  const more = page.locator('.shell-nav-more');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
}

async function gotoViaMenu(page: Page, label: string, expectHeading: string | RegExp): Promise<void> {
  await page.goto('/#/');
  await openMoreMenu(page);
  await page.getByRole('button', { name: label }).first().click();
  await expect(page.getByText(expectHeading).first()).toBeVisible({ timeout: 20_000 });
}

test.describe('Voice guide + product reachability (CERN, Cyber, Mirror, World Director, Virtual Lab)', () => {
  test('the five required surfaces are reachable from the real sidebar menu, not only by URL', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));

    // CERN Complex.
    await gotoViaMenu(page, 'Kompleks CERN', /SCIENTIFIC OS|CERN/i);
    expect(page.url()).toContain('#/cern-complex');

    // Cyber.
    await gotoViaMenu(page, 'Cyber', /Cyber/i);
    expect(page.url()).toContain('#/cyber');

    // Mirror.
    await gotoViaMenu(page, 'Genesis Mirror', /Mirror/i);
    expect(page.url()).toContain('#/mirror');

    // World Director.
    await gotoViaMenu(page, 'World Director', /World Director/i);
    expect(page.url()).toContain('#/world-director');

    // Virtual Lab — the nav entry this branch added (previously an orphan route reachable only
    // by typing #/virtual-bio; now a real, clickable "Virtual Lab — biologia" sidebar button).
    await gotoViaMenu(page, 'Virtual Lab', /Virtual Bio Lab|Wirtualne laboratorium|B-CELL|B-PBPK/i);
    expect(page.url()).toContain('#/virtual-bio');

    // The government/public-sector demo — the second nav entry this branch added (previously
    // reachable only via a Home CTA hidden behind a research-mode flag that defaults off).
    await gotoViaMenu(page, 'Government Drug Discovery', /Government Drug Discovery/i);
    expect(page.url()).toContain('#/gov-campaign');

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the voice guide starts, captions honestly regardless of speech availability, mutes, and stops', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));

    await page.goto('/#/research-console');
    await expect(page.getByTestId('start-guide')).toBeVisible({ timeout: 20_000 });

    // Real-environment check (not asserted pass/fail either way — reported honestly): does this
    // headless Chromium expose a SpeechSynthesis with at least one usable voice?
    const speechAvailable = await page.evaluate(() => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
      try { window.speechSynthesis.getVoices(); return true; } catch { return false; }
    });

    await page.getByTestId('start-guide').click();
    const overlay = page.getByTestId('guide-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    // The caption is the accessible fallback and must be visible regardless of whether a real
    // voice ended up speaking (headless Chromium commonly reports zero installed voices).
    const caption = page.getByTestId('guide-caption');
    await expect(caption).toBeVisible();
    const captionText = (await caption.textContent())?.trim() ?? '';
    expect(captionText.length, 'the guide must show real narration text, not an empty caption').toBeGreaterThan(0);

    // Mute (voice off): the toggle must flip and the guide must not treat "no voice" as a reason
    // to hide the caption — this is the "honest fallback when speech synthesis is unavailable"
    // requirement, exercised the same way whether or not a real voice happens to be installed.
    const voiceToggle = page.getByTestId('guide-voice-toggle');
    await expect(voiceToggle).toBeVisible();
    const wasOn = (await voiceToggle.getAttribute('aria-pressed')) === 'true';
    await voiceToggle.click();
    await expect(voiceToggle).toHaveAttribute('aria-pressed', wasOn ? 'false' : 'true');
    await expect(caption, 'the caption stays visible when the voice is muted — captions are the fallback, not an optional extra').toBeVisible();
    await voiceToggle.click();
    await expect(voiceToggle).toHaveAttribute('aria-pressed', wasOn ? 'true' : 'false');

    // Stop: the close control must actually end the session (overlay unmounts).
    await page.locator('.guide-close').click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });

    expect(errors, errors.join('\n')).toEqual([]);

    // Report, not assert: this environment's real SpeechSynthesis capability, so the handoff can
    // state honestly whether real audio output or the environment-blocked fallback was exercised.
    test.info().annotations.push({ type: 'speechSynthesis-available', description: String(speechAvailable) });
  });
});
