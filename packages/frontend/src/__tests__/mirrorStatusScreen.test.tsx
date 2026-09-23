import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MirrorStatusScreen } from '../components/MirrorStatusScreen';

/**
 * Static-markup smoke test (this repo's established pattern for a component
 * test — see labEnvironmentPicker.test.tsx — no jsdom/interactive testing
 * library is configured here). Proves the initial MIRROR_IDLE render is
 * honest: the real EXPERIMENTAL/SYNTHETIC/NOT_CALIBRATED disclosure is
 * present, the canonical state is shown, and no CONNECTED/CALIBRATED claim
 * is ever rendered before any real camera interaction has happened.
 *
 * The real, interactive consent -> camera -> SCANNING -> SYNCING flow (and
 * the camera-track lifecycle discipline) is proven by
 * browserCameraAdapter.test.ts (pure logic, 8 tests) and by the dedicated
 * Playwright E2E scenario (packages/e2e/src/mirror.e2e.spec.ts).
 */
describe('MirrorStatusScreen — initial render is honest', () => {
  it('starts MIRROR_IDLE, discloses EXPERIMENTAL/SYNTHETIC/NOT_CALIBRATED, and never claims a live camera before any interaction', () => {
    const markup = renderToStaticMarkup(<MirrorStatusScreen />);
    expect(markup).toContain('data-state="MIRROR_IDLE"');
    expect(markup).toContain('EXPERIMENTAL / SYNTHETIC / NOT_CALIBRATED');
    expect(markup).toContain('mirror-enter-zone');
    expect(markup).not.toMatch(/>CONNECTED</);
    expect(markup).not.toMatch(/>CALIBRATED</);
    // The camera status field reflects the real adapter's honest pre-request state (SSR: no browser
    // mediaDevices exists, so the adapter itself reports UNAVAILABLE — never a fabricated NOT_CONNECTED string).
    expect(markup).toContain('mirror-camera-status');
    expect(markup).toMatch(/UNAVAILABLE|NOT_REQUESTED/);
  });
});
