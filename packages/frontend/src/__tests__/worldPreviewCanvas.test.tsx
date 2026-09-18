import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldPreviewCanvas } from '../components/holo/WorldPreviewCanvas';
import { DEFAULT_PALETTE, PREVIEW_KINDS, drawPreview, hash01, type PreviewContext } from '../components/holo/worldPreviews';
import { WORLDS, WorldsHubScreen } from '../components/WorldsHubScreen';

/**
 * WORLD PREVIEWS — procedural card visualisations. They must draw every kind
 * without touching the DOM (a recording context stands in for canvas 2D),
 * be deterministic, and stay clearly decorative on the hub (aria-hidden,
 * the REAL / WIZUALIZACJA badges untouched).
 */

/** A 2D-context stand-in that records calls and validates the gradient API the previews rely on. */
function recordingContext(): { ctx: PreviewContext; calls: Map<string, number> } {
  const calls = new Map<string, number>();
  const bump = (k: string): void => { calls.set(k, (calls.get(k) ?? 0) + 1); };
  const gradient = () => ({ addColorStop: (offset: number, color: string) => { if (!(offset >= 0 && offset <= 1) || typeof color !== 'string') throw new Error(`bad stop ${offset} ${color}`); } });
  const target: Record<string, unknown> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: '', lineCap: 'butt',
    createLinearGradient: () => { bump('createLinearGradient'); return gradient(); },
    createRadialGradient: () => { bump('createRadialGradient'); return gradient(); },
  };
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      return (...args: unknown[]) => { for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${key} got ${a}`); bump(key); };
    },
    set(t, key: string, value) { t[key] = value; return true; },
  }) as unknown as PreviewContext;
  return { ctx, calls };
}

describe('worldPreviews', () => {
  it('draws every kind at several times without throwing, with finite coordinates only', () => {
    for (const kind of PREVIEW_KINDS) {
      for (const t of [0, 0.5, 3.7, 61.2, 1e4]) {
        const { ctx, calls } = recordingContext();
        expect(() => drawPreview(kind, ctx, 320, 168, t)).not.toThrow();
        expect(calls.get('clearRect')).toBe(1);
        expect((calls.get('fill') ?? 0) + (calls.get('stroke') ?? 0)).toBeGreaterThan(3);
        expect(calls.get('save')).toBe(calls.get('restore'));
      }
    }
  });

  it('has a palette for every kind and a deterministic hash in [0, 1)', () => {
    for (const kind of PREVIEW_KINDS) expect(DEFAULT_PALETTE[kind].accent).toMatch(/^#[0-9a-f]{6}$/i);
    for (let i = 0; i < 200; i++) {
      const v = hash01(i, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash01(i, 3)).toBe(v);
    }
  });

  it('copes with a degenerate 1×1 surface', () => {
    for (const kind of PREVIEW_KINDS) {
      const { ctx } = recordingContext();
      expect(() => drawPreview(kind, ctx, 1, 1, 2)).not.toThrow();
    }
  });
});

describe('WorldPreviewCanvas', () => {
  it('renders an aria-hidden canvas tagged with its kind; effects never run statically', () => {
    const html = renderToStaticMarkup(<WorldPreviewCanvas kind="city" />);
    expect(html).toContain('<canvas');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-preview="city"');
  });

  it('every world card on the hub carries exactly one preview of its declared kind, and the badges stay untouched', () => {
    const html = renderToStaticMarkup(<WorldsHubScreen />);
    for (const w of WORLDS) {
      expect(PREVIEW_KINDS).toContain(w.preview);
      const card = html.slice(html.indexOf(`data-testid="world-${w.id}"`));
      expect(card.indexOf(`data-preview="${w.preview}"`)).toBeGreaterThan(-1);
    }
    expect((html.match(/data-preview="/g) ?? []).length).toBe(WORLDS.length);
    expect((html.match(/>WIZUALIZACJA</g) ?? []).length).toBe(WORLDS.length); // the honest badge, not the preview caption
    expect((html.match(/>REAL</g) ?? []).length).toBe(WORLDS.length);
  });
});
