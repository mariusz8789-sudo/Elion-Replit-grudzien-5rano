import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MORE_ITEMS, MORE_SECTIONS, NAV_ITEMS, NAV_SECTIONS, activeNavId, navVariants } from '../core/navigation';
import { SCIENTIFIC_OS } from '../core/scientificOs/catalogue';

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
        // A router entry may match exactly or by prefix (`#/timeline?mode=…`); `#/lab/<id>` is the router's lab pattern.
        if (/^#\/lab\/[\w-]+$/.test(hash) && APP.includes('h.match(/^#\\/lab\\/([\\w-]+)/)')) return false;
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
  it('the Reality Navigator (#/reality) is reachable from Worlds, not only from itself and one lab', () => {
    const entry = MORE_ITEMS.find((i) => i.hash === '#/reality');
    expect(entry, 'no menu entry navigates to #/reality').toBeDefined();
    expect(entry!.variantOf).toBe('worlds');
    expect(navVariants('worlds').map((item) => item.id)).toContain(entry!.id);
    expect(activeNavId('#/reality')).toBe(entry!.id);
  });

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

describe('research mode shows one entry per capability; alternative screens fold under it', () => {
  const top = MORE_ITEMS.filter((item) => item.variantOf === undefined);
  const variants = MORE_ITEMS.filter((item) => item.variantOf !== undefined);

  it('every top-level entry sits in exactly one research-mode group, and no variant does', () => {
    const grouped = MORE_SECTIONS.flatMap((section) => section.items.map((item) => item.id));
    expect([...grouped].sort()).toEqual(top.map((item) => item.id).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('every variant folds under an existing top-level capability (no chains, no orphans)', () => {
    for (const variant of variants) {
      const parent = MORE_ITEMS.find((item) => item.id === variant.variantOf);
      expect(parent, `${variant.id} -> ${variant.variantOf}`).toBeDefined();
      expect(parent!.variantOf, `${variant.id} folds under another variant`).toBeUndefined();
      expect(navVariants(parent!.id)).toContain(variant);
    }
  });

  it('the known duplicate families collapse to one visible entry each', () => {
    const family = (id: string) => [id, ...navVariants(id).map((v) => v.id)];
    // IA of 3 Oct 2026: Candidates (#/dossier) and Evidence packs (#/pilot) moved to Deliver,
    // Scientific Memory to Proof; Matrix is a DEMO entry of its own with the HUD folded under the map.
    expect(family('campaign')).toEqual(expect.arrayContaining(['campaign', 'gov-campaign', 'cde', 'precision']));
    expect(family('worlds')).toEqual(expect.arrayContaining(['worlds', 'first-person-lab', 'world-director', 'reality', 'city3d']));
    expect(family('matrix-map')).toEqual(['matrix-map', 'matrix']);
    // CMS Open Data (an offline analysis of one checksummed event file) and the CERN complex (a
    // walk-through world) are two capabilities, not one with a spare view. Only the detector chamber
    // is a view OF the complex, so only it folds.
    expect(family('cern-complex')).toEqual(['cern-complex', 'collider']);
    // 28 since the 3 Oct IA: demos (Mirror, Matrix) are listed openly in DEMO instead of hidden as world views.
    expect(top.length).toBeLessThanOrEqual(28);
  });

  it('chemistry and physics open the one main Laboratory at their station', () => {
    expect(MORE_ITEMS.find((item) => item.id === 'chemistry')?.hash).toBe('#/scientific-worlds?station=st-titration');
    expect(MORE_ITEMS.find((item) => item.id === 'physics')?.hash).toBe('#/scientific-worlds?station=st-window');
    expect(activeNavId('#/scientific-worlds?station=st-titration')).toBe('chemistry');
    expect(activeNavId('#/scientific-worlds')).toBe('scientific-worlds');
  });
});

describe('the main menu is the owner\'s capability IA (3 Oct 2026), two levels at most', () => {
  it('Home, then Research, Explore, Proof, Operations and Deliver, each with its places in order', () => {
    expect(NAV_SECTIONS.map((section) => section.id)).toEqual(['home', 'research', 'explore', 'proof', 'operations', 'deliver']);
    const ids = (id: string) => NAV_SECTIONS.find((s) => s.id === id)!.items.map((item) => item.id);
    expect(ids('home')).toEqual(['home']);
    expect(ids('research')).toEqual(['chat', 'discover', 'inquiry']);
    expect(ids('explore')).toEqual(['science', 'human-biology-lab', 'molecule', 'cms-open-data', 'scientific-worlds']);
    expect(ids('proof')).toEqual(['evidence', 'reviewer', 'memory', 'verify']);
    expect(ids('operations')).toEqual(['flight-control']);
    expect(ids('deliver')).toEqual(['dossier', 'pilot', 'lab-handoff', 'reports']);
  });

  it('no main place is also listed in More, and no main place has folded views (two levels)', () => {
    const main = NAV_SECTIONS.flatMap((section) => section.items);
    const mainHashes = new Set(main.map((item) => item.hash).filter(Boolean));
    expect(MORE_ITEMS.filter((item) => item.hash !== undefined && mainHashes.has(item.hash))).toEqual([]);
    for (const item of main) expect(navVariants(item.id), item.id).toEqual([]);
  });

  it('every main and More place has an English label', async () => {
    const { TRANSLATED_NAV_IDS } = await import('../core/navigationText');
    const missing = NAV_ITEMS.filter((item) => !item.variantOf && item.id !== 'sovereign' && !TRANSLATED_NAV_IDS.includes(item.id)).map((item) => item.id);
    expect(missing).toEqual([]);
  });

  it('demo entries only ever sit in the DEMO group', async () => {
    const { DEMO_SECTION_ID } = await import('../core/navigation');
    for (const section of MORE_SECTIONS) {
      for (const item of section.items) expect(item.demo === true, item.id).toBe(section.id === DEMO_SECTION_ID);
    }
    expect(NAV_SECTIONS.flatMap((s) => s.items).some((item) => item.demo)).toBe(false);
  });
});

describe('Ask Genesis heads Research and the mobile tab bar', () => {
  it('tab bar reads Start, Zapytaj, Przebiegi, Dowody (the shell adds More)', async () => {
    const { ASK_ITEM, PRIMARY_NAV_ITEMS } = await import('../core/navigation');
    expect(PRIMARY_NAV_ITEMS.map((item) => item.shortLabel ?? item.label)).toEqual(['Start', 'Zapytaj', 'Przebiegi', 'Dowody']);
    expect(ASK_ITEM.kind).toBe('chat');
    expect(ASK_ITEM.hash).toBeUndefined();
    expect(NAV_SECTIONS.find((s) => s.id === 'research')!.items[0]).toBe(ASK_ITEM);
  });
});

describe('demo-only capabilities sit with the showcases, not in a product group', () => {
  // The catalogue (core/scientificOs/catalogue.ts) is the audit truth: whatever
  // it files under a "Demo only" subgroup must not be offered in the menu as a
  // product of that sector.
  const demoOnly = new Set(
    SCIENTIFIC_OS.flatMap((group) => group.subgroups ?? [])
      .filter((sub) => sub.label === 'Demo only')
      .flatMap((sub) => sub.ids),
  );
  const sectionOf = (id: string) => MORE_SECTIONS.filter((section) => section.items.some((item) => item.id === id)).map((s) => s.id);

  it('the catalogue still marks Cyber as demo-only (premise)', () => {
    expect(demoOnly.has('cyber')).toBe(true);
  });

  it('every demo-only capability that has a menu entry is in the showcase group only', () => {
    const inMenu = [...demoOnly].filter((id) => sectionOf(id).length > 0);
    expect(inMenu).toContain('cyber');
    for (const id of inMenu) expect(sectionOf(id), id).toEqual(['more-showcase']);
  });

  it('Cyber stays reachable from the menu at its real route', () => {
    const cyber = MORE_SECTIONS.flatMap((s) => s.items).find((item) => item.id === 'cyber');
    expect(cyber?.hash).toBe('#/cyber');
    expect(cyber?.status).not.toBe('planned');
  });
});
