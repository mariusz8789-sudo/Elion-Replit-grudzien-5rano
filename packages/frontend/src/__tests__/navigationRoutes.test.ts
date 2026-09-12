import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MORE_ITEMS, NAV_ITEMS, NAV_SECTIONS, activeNavId } from '../core/navigation';

/**
 * NAVIGATION ↔ ROUTER CONSISTENCY.
 *
 * `navigation.ts` is deliberately the ONE navigation truth (desktop sidebar
 * and mobile sheet both render from it) while `App.tsx` owns routing. Two
 * files, one contract — and nothing checked that they agreed.
 *
 * Both halves of the disagreement are real failures with no runtime error to
 * announce them:
 *
 *  - a menu entry whose hash `parseHash` does not recognise navigates the
 *    user to a route that silently falls through to Home;
 *  - a screen wired into `parseHash` but missing from the menu is reachable
 *    only by typing the URL. That is how `#/dome-world` shipped in this
 *    session's own first attempt: route added, screen rendered, tests green,
 *    and not one button anywhere led to it.
 */

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = readFileSync(join(SRC, 'App.tsx'), 'utf8');

/** Every hash literal `parseHash` compares against or prefixes on. */
function routerHashes(): Set<string> {
  const parseHash = APP.slice(APP.indexOf('function parseHash'), APP.indexOf('export default function App'));
  const found = new Set<string>();
  for (const m of parseHash.matchAll(/'(#\/[^']*)'/g)) found.add(m[1]!);
  return found;
}

describe('navigation entries point at routes the router actually has', () => {
  it('every menu hash is a route parseHash recognises', () => {
    const routes = routerHashes();
    const unroutable = NAV_ITEMS
      .filter((item) => item.hash !== undefined && item.hash !== '#/')
      .filter((item) => {
        const hash = item.hash!;
        // A router entry may match exactly or by prefix (`#/timeline?mode=…`).
        return ![...routes].some((r) => r === hash || hash.startsWith(r));
      })
      .map((item) => `${item.id} -> ${item.hash}`);
    expect(unroutable).toEqual([]);
  });

  it('a planned item declares no hash, so it can never navigate anywhere', () => {
    for (const item of NAV_ITEMS) {
      if (item.status === 'planned') expect(item.hash).toBeUndefined();
    }
  });

  it('every menu id is unique — a duplicate would make activeNavId ambiguous', () => {
    const ids = NAV_ITEMS.map((i) => i.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  /**
   * REGRESSION for the specific half-wiring this file was written after: the
   * dome-world falsification had a route and a screen before it had any way
   * in.
   */
  it('the dome-world falsification is reachable from the menu, not only by URL', () => {
    const entry = MORE_ITEMS.find((i) => i.hash === '#/dome-world');
    expect(entry, 'no menu entry navigates to #/dome-world').toBeDefined();
    expect(activeNavId('#/dome-world')).toBe(entry!.id);
  });

  it('activeNavId resolves every menu hash back to its own entry', () => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.hash === undefined || item.hash === '#/') continue;
        expect(activeNavId(item.hash), `${item.id}`).toBe(item.id);
      }
    }
  });
});
