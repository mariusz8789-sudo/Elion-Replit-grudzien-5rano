import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MORE_ITEMS, MORE_SECTIONS, NAV_ITEMS, NAV_SECTIONS, RESEARCH_TOPICS, activeNavId, navVariants } from '../core/navigation';
import { resolveLaunch, resolvedResearchTopics } from '../core/researchLauncher';
import { getGenesisCapability } from '../core/capabilities/genesisCapabilityRegistry';
import { buildDestinationIndex, filterSearchIndex } from '../core/search';

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
    expect(family('campaign')).toEqual(expect.arrayContaining(['campaign', 'gov-campaign', 'cde', 'pilot', 'dossier', 'precision']));
    expect(family('memory')).toEqual(expect.arrayContaining(['memory', 'discovery-log']));
    expect(family('worlds')).toEqual(expect.arrayContaining(['worlds', 'matrix', 'matrix-map', 'first-person-lab', 'world-director']));
    // CMS Open Data (an offline analysis of one checksummed event file) and the CERN complex (a
    // walk-through world) are two capabilities, not one with a spare view. Only the detector chamber
    // is a view OF the complex, so only it folds.
    expect(family('cern-complex')).toEqual(['cern-complex', 'collider']);
    expect(top.length).toBeLessThanOrEqual(26);
  });

  it('chemistry and physics open the one main Laboratory at their station', () => {
    expect(MORE_ITEMS.find((item) => item.id === 'chemistry')?.hash).toBe('#/scientific-worlds?station=st-titration');
    expect(MORE_ITEMS.find((item) => item.id === 'physics')?.hash).toBe('#/scientific-worlds?station=st-window');
    expect(activeNavId('#/scientific-worlds?station=st-titration')).toBe('chemistry');
    expect(activeNavId('#/scientific-worlds')).toBe('scientific-worlds');
  });
});

describe('the main menu is the owner\'s list, in his order', () => {
  it('lists the nine destinations first; everything else sits under "Więcej"', () => {
    expect(NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.label))).toEqual([
      'Genesis', 'Zapytaj', 'Drug Discovery', 'Human Explorer', 'Reviewer Room', 'Evidence & Replay',
      'Laboratorium', 'CERN / CMS Open Data', 'Research Console',
    ]);
    const main = new Set(NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.hash)));
    expect(MORE_ITEMS.filter((item) => item.hash !== undefined && main.has(item.hash))).toEqual([]);
  });
});

describe('Research Launcher: five topics, only runnable actions, every one routed', () => {
  const routes = routerHashes();
  const routable = (hash: string): boolean =>
    /^#\/lab\/[\w-]+$/.test(hash) || [...routes].some((r) => r === hash || hash.startsWith(r));

  it('shows the five topics in order, each with at least two runnable actions', () => {
    expect(resolvedResearchTopics().map((t) => t.topic.label)).toEqual(['Drug Discovery', 'Molecules', 'Human Biology', 'CERN', 'Physics']);
    for (const { topic, actions } of resolvedResearchTopics()) {
      expect(actions.length, topic.id).toBeGreaterThanOrEqual(2);
      expect(actions.length, topic.id).toBeLessThanOrEqual(3);
    }
  });

  it('every configured action resolves: a real route, or an existing chat command on a FABRIC/CUSTOM_FLOW capability', () => {
    for (const topic of RESEARCH_TOPICS) {
      for (const action of topic.actions) {
        const resolved = resolveLaunch(action);
        expect(resolved, `${topic.id}: ${action.label}`).not.toBeNull();
        if (resolved!.hash) expect(routable(resolved!.hash), resolved!.hash).toBe(true);
        else expect(resolved!.chatCommand).toBeTruthy();
      }
    }
  });

  it('readiness comes from the registry: a capability that is not AVAILABLE/PARTIAL is never shown', () => {
    expect(getGenesisCapability('virtual-animals')?.readiness).toBe('NOT_IMPLEMENTED');
    expect(resolveLaunch({ label: 'x', target: { kind: 'capability', capabilityId: 'virtual-animals' } })).toBeNull();
    expect(resolveLaunch({ label: 'x', target: { kind: 'capability', capabilityId: 'genesis-9d' } })).toBeNull();
    expect(resolveLaunch({ label: 'x', target: { kind: 'chat', capabilityId: 'cern-cms-open-data', command: 'x' } })).toBeNull();
  });

  it('search lists the same capabilities as the menu and the launcher', () => {
    const index = buildDestinationIndex();
    for (const item of NAV_SECTIONS[0]!.items) if (item.hash && item.hash !== '#/') expect(index.some((e) => e.hash === item.hash), item.id).toBe(true);
    expect(filterSearchIndex(index, 'imatinib').some((e) => e.hash === '#/discovery-track' || e.hash === '#/drug')).toBe(true);
    expect(filterSearchIndex(index, 'kompleks').some((e) => e.hash === '#/cern-complex')).toBe(true);
  });
});
