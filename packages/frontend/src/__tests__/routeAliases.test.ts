import { afterEach, describe, expect, it } from 'vitest';
import { parseHash } from '../App';

/**
 * Inventory point 3 — one place per capability. Former separate screens are now views of one route;
 * their old hashes stay as aliases so saved links and the capture scripts keep working.
 */
const realWindow = (globalThis as { window?: unknown }).window;
function at(hash: string) {
  (globalThis as { window?: unknown }).window = { location: { hash } };
  return parseHash();
}
afterEach(() => { (globalThis as { window?: unknown }).window = realWindow; });

describe('route aliases after the consolidation', () => {
  it('the detector chamber is a room of the CERN complex; #/collider is its alias', () => {
    expect(at('#/cern-complex?room=detector')).toEqual({ kind: 'collider' });
    expect(at('#/collider')).toEqual({ kind: 'collider' });
    expect(at('#/cern-complex')).toEqual({ kind: 'cern-complex' });
    expect(at('#/cern-complex?action=collision')).toEqual({ kind: 'cern-complex' });
  });

  it('the 2D city is a view of #/city3d; #/city is its alias', () => {
    expect(at('#/city3d?view=2d')).toEqual({ kind: 'city' });
    expect(at('#/city')).toEqual({ kind: 'city' });
    expect(at('#/city3d')).toEqual({ kind: 'city3d' });
  });

  it('temporal cinematic is a World Director mode; #/temporal-cinematic stays for the capture scripts', () => {
    expect(at('#/world-director?mode=temporal&place=Warsaw&year=1900')).toEqual({ kind: 'temporal-cinematic' });
    expect(at('#/temporal-cinematic?place=Warsaw&year=1900')).toEqual({ kind: 'temporal-cinematic' });
    expect(at('#/world-director?prompt=mars')).toEqual({ kind: 'world-director' });
  });

  it('Looking Glass accepts the question the chat hands it', () => {
    expect(at('#/looking-glass?q=epidemia')).toEqual({ kind: 'looking-glass' });
  });
});
