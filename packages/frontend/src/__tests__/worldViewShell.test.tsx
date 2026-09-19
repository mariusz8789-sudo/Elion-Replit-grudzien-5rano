import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldViewShell, EpistemicBadge } from '../components/genesis-ui';
import type { WorldDefinition, WorldObject } from '../components/genesis-ui';
import { explorerEvidenceModeToEpistemicTone, gxStatusToEpistemicTone } from '../components/genesis-ui/epistemicToneAdapter';

/**
 * D-133 SMART UI — `WorldViewShell` static-shape tests, in this repo's own convention
 * (`renderToStaticMarkup` + string assertions, `scientificWorldsScreen.test.tsx`'s own pattern)
 * rather than React Testing Library: Genesis has zero RTL usage anywhere in ~600 existing test
 * files, and the interactive sequence (hover -> click -> popup -> BADAJ -> drawer -> expand ->
 * close) is exactly the kind of real-DOM, real-event behaviour this project already proves in a
 * real browser (Playwright) rather than a simulated jsdom — see
 * `packages/e2e/src/molecule-world.e2e.spec.ts` for that half of the contract. This file proves
 * the parts a static render CAN prove: the shell renders nothing extra by default, a controlled
 * `selectedObject`+`selectedAnchor` produces a popup with the right content, and the epistemic tone
 * adapters never invent a tone.
 */

const WORLD: WorldDefinition = { identity: { id: 'molecular', title: 'Molecule World', domain: 'Molecular World', glyph: '⬡' } };

const HEART: WorldObject = {
  id: 'heart',
  label: 'Serce',
  subtitle: 'Układ krążenia',
  badges: [{ label: 'MODEL', tone: 'model' }],
  actions: [
    { id: '3d', label: '3D', kind: 'inspect' },
    { id: 'research', label: 'BADAJ', kind: 'research' },
  ],
};

describe('WorldViewShell — default WORLD VIEW carries no popup, no drawer (D-133)', () => {
  const html = renderToStaticMarkup(
    <WorldViewShell world={WORLD}>
      <div data-testid="gx-scene">SCENE</div>
    </WorldViewShell>,
  );

  it('renders the scene and the minimal identity strip, and nothing else', () => {
    expect(html).toContain('data-testid="gx-scene"');
    expect(html).toContain('Molecule World');
    expect(html).not.toContain('data-testid="gx-contextual-popup"');
    expect(html).not.toContain('data-testid="gx-research-drawer"');
  });

  it('carries data-world-id and the world (not research) data-state', () => {
    expect(html).toContain('data-world-id="molecular"');
    expect(html).toContain('data-state="world"');
  });
});

describe('WorldViewShell — a controlled selection renders the Contextual Popup, never the drawer alone (D-133)', () => {
  const html = renderToStaticMarkup(
    <WorldViewShell world={WORLD} selectedObject={HEART} selectedAnchor={{ x: 400, y: 300 }}>
      <div data-testid="gx-scene">SCENE</div>
    </WorldViewShell>,
  );

  it('shows the popup with the object label, its badge, and its actions — not the drawer', () => {
    expect(html).toContain('data-testid="gx-contextual-popup"');
    expect(html).toContain('Serce');
    expect(html).toContain('Układ krążenia');
    expect(html).toContain('BADAJ');
    expect(html).not.toContain('data-testid="gx-research-drawer"');
  });

  it('the popup badge carries the epistemic tone as a data attribute, never upgraded', () => {
    expect(html).toContain('data-epistemic="model"');
  });
});

describe('EpistemicBadge — the one badge every world speaks through (D-133)', () => {
  it('never renders a tone class the caller did not pass', () => {
    const html = renderToStaticMarkup(<EpistemicBadge label="MODEL" tone="model" />);
    expect(html).toContain('gx-world-badge--model');
    expect(html).not.toContain('gx-world-badge--real');
  });
});

describe('epistemic tone adapters — the ONE translation point, never a fifth vocabulary (D-133)', () => {
  it('.gx-status tones map onto the shell tone set without inventing a value', () => {
    expect(gxStatusToEpistemicTone('real')).toBe('real');
    expect(gxStatusToEpistemicTone('approximation')).toBe('model');
    expect(gxStatusToEpistemicTone('not-modelled')).toBe('unknown');
    expect(gxStatusToEpistemicTone('blocked')).toBe('blocked');
  });

  it('canonical Human Explorer evidence modes map without ever upgrading toward "real"', () => {
    expect(explorerEvidenceModeToEpistemicTone('REAL_IMAGE')).toBe('real');
    expect(explorerEvidenceModeToEpistemicTone('REAL_DATASET')).toBe('dataset');
    for (const mode of ['RECONSTRUCTED', 'SIMULATED', 'ILLUSTRATIVE'] as const) {
      const tone = explorerEvidenceModeToEpistemicTone(mode);
      expect(tone).not.toBe('real');
      expect(tone).not.toBe('dataset');
    }
  });
});
