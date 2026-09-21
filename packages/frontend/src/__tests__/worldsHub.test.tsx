import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLDS, WorldsHubScreen } from '../components/WorldsHubScreen';
import { cleanRouteTitle } from '../App';

/**
 * D-118 — the Worlds hub lists only worlds the router really resolves, and
 * every card says what is real and what is a visualisation.
 */
const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = readFileSync(join(SRC, 'App.tsx'), 'utf8');

describe('WorldsHubScreen', () => {
  it('every world hash is a route parseHash recognises', () => {
    const parseHash = APP.slice(APP.indexOf('function parseHash'), APP.indexOf('export default function App'));
    for (const w of WORLDS) expect(parseHash.includes(`'${w.hash}'`), `${w.id} -> ${w.hash}`).toBe(true);
  });

  it('renders one card per world with a REAL and a WIZUALIZACJA line each', () => {
    const html = renderToStaticMarkup(<WorldsHubScreen />);
    for (const w of WORLDS) expect(html).toContain(`data-testid="world-${w.id}"`);
    expect((html.match(/>REAL</g) ?? []).length).toBe(WORLDS.length);
    expect((html.match(/>WIZUALIZACJA</g) ?? []).length).toBe(WORLDS.length);
    expect(new Set(WORLDS.map((w) => w.id)).size).toBe(WORLDS.length);
  });

  it('cleanRouteTitle strips the leading emoji the route titles were written with', () => {
    expect(cleanRouteTitle('🏙 Epidemia w małym mieście — żywa scena WebGL')).toBe('Epidemia w małym mieście — żywa scena WebGL');
    expect(cleanRouteTitle('◈ Genesis Matrix')).toBe('Genesis Matrix');
    expect(cleanRouteTitle('Start')).toBe('Start');
    expect(cleanRouteTitle('🔬 GENESIS — Investor Demo')).toBe('GENESIS — Investor Demo');
  });
});
