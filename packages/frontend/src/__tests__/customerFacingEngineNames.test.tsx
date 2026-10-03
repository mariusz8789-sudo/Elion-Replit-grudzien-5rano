import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../labs/index';
import { ENGINE_NAME_PATTERN, TECHNICAL_DETAILS_ATTR } from '../core/capabilityNames';
import { ASK_ITEM, MORE_OVERVIEW_ITEM, MORE_SECTIONS, NAV_ITEMS, NAV_SECTIONS } from '../core/navigation';
import { navDescription, navGroupLabel, navLabel, navShortLabel, shellText } from '../core/navigationText';
import { buildCapabilityIndex, buildDestinationIndex, buildGoalIndex, buildSearchIndex } from '../core/search';
import { LABEL_MEANING, SCIENTIFIC_OS, SHOWCASE } from '../core/scientificOs/catalogue';
import { CHAT_ENGINES, chatEngineLine } from '../core/scienceChat/engines';
import type { Locale } from '../core/i18n';

/**
 * CUSTOMER TEXT NAMES CAPABILITIES, NEVER ENGINES (owner brief, 3 Oct 2026).
 *
 * Navigation, Search, Start, the More catalogue and the Ask chips say what
 * Genesis does ("Molecular Dynamics"), not which engine does it (OpenMM). The
 * exact engine identity belongs to Evidence, provenance, Replay, the Reviewer
 * Room and sections marked `data-technical-details`; this sweep removes those
 * sections and fails on any engine name left in what a customer reads —
 * visible text, tooltips, accessible names and placeholders.
 */

const LOCALES: readonly Locale[] = ['pl', 'en', 'ar'];

function offenders(texts: readonly (string | undefined)[]): string[] {
  return texts.filter((t): t is string => typeof t === 'string' && ENGINE_NAME_PATTERN.test(t));
}

/** Drop every `data-technical-details` section, then keep what a person can read or hear. */
function customerText(html: string): string {
  const open = new RegExp(`<(details|section|div)\\b[^>]*\\b${TECHNICAL_DETAILS_ATTR}\\b[^>]*>`, 'g');
  let out = html;
  for (let match = open.exec(out); match !== null; match = open.exec(out)) {
    const tag = match[1]!;
    const end = out.indexOf(`</${tag}>`, match.index);
    out = out.slice(0, match.index) + out.slice(end + tag.length + 3);
    open.lastIndex = match.index;
  }
  const attributes = [...out.matchAll(/\b(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]);
  return `${out.replace(/<[^>]*>/g, ' ')} ${attributes.join(' ')}`;
}

function stubWindow(): void {
  vi.stubGlobal('window', {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 },
    location: { hash: '' },
    addEventListener: () => {}, removeEventListener: () => {},
  });
}

describe('the guard itself', () => {
  it('catches engine names and leaves capability words alone', () => {
    for (const s of ['RDKit 3D', 'AutoDock Vina', 'GNINA rescoring', 'run PySCF', 'OpenMM', 'ADMET-AI', 'Meeko prep']) expect(ENGINE_NAME_PATTERN.test(s), s).toBe(true);
    for (const s of ['Molecular Dynamics', 'Quantum Chemistry', 'Property & Safety Analysis (ADMET)', 'Wina', 'Interaction Modeling']) expect(ENGINE_NAME_PATTERN.test(s), s).toBe(false);
    const html = `<p>Docking baseline</p><details ${TECHNICAL_DETAILS_ATTR}><summary>Technical details</summary><li>AutoDock Vina</li></details><span title="Molecular Analysis">x</span>`;
    expect(customerText(html)).not.toMatch(ENGINE_NAME_PATTERN);
    expect(customerText(html.replace(TECHNICAL_DETAILS_ATTR, 'data-other'))).toMatch(ENGINE_NAME_PATTERN);
  });
});

describe('navigation never names an engine', () => {
  it('labels, short labels, descriptions, group names and shell words in PL, EN and AR', () => {
    const items = [...NAV_ITEMS, ASK_ITEM, MORE_OVERVIEW_ITEM];
    const texts = LOCALES.flatMap((locale) => [
      ...items.flatMap((item) => [navLabel(item, locale), navShortLabel(item, locale), navDescription(item, locale), item.plannedNote]),
      ...[...NAV_SECTIONS, ...MORE_SECTIONS].map((section) => navGroupLabel(section, locale)),
    ]);
    const shellKeys = ['more', 'moreAll', 'allAreas', 'search', 'searchHint', 'explorer', 'moreModules', 'demoNote', 'serverStatus'] as const;
    for (const locale of LOCALES) for (const key of shellKeys) texts.push(shellText(key, locale));
    expect(offenders(texts)).toEqual([]);
  });

  it('the rendered shell (sidebar and tab bar) in Polish and English', async () => {
    const { setLocale } = await import('../core/i18n');
    const { AppShell } = await import('../components/AppShell');
    try {
      for (const locale of ['pl', 'en'] as const) {
        setLocale(locale);
        const text = customerText(renderToStaticMarkup(<AppShell>x</AppShell>));
        expect(text.match(ENGINE_NAME_PATTERN), locale).toBeNull();
      }
    } finally {
      setLocale('pl');
    }
  });
});

describe('Search shows capabilities; engine names only match, never show', () => {
  it('goals, destinations, capabilities and labs', () => {
    const shown = [...buildGoalIndex(), ...buildDestinationIndex('pl'), ...buildDestinationIndex('en'), ...buildCapabilityIndex(), ...buildSearchIndex()]
      .flatMap((e) => [e.labName, e.expName, e.tagline, e.ask]);
    expect(offenders(shown)).toEqual([]);
    // Typing an engine still finds its capability.
    expect(buildCapabilityIndex().some((e) => e.keywords.includes('openmm'))).toBe(true);
  });
});

describe('the More catalogue and the Ask chips', () => {
  it('catalogue names, lines, notes, Ask commands and legends', () => {
    const rows = [...SCIENTIFIC_OS.flatMap((g) => g.items), ...SHOWCASE];
    const texts = [
      ...SCIENTIFIC_OS.flatMap((g) => [g.name, g.line, ...(g.subgroups ?? []).map((s) => s.label)]),
      ...rows.flatMap((c) => [c.name, c.what, c.note, c.ask]),
      ...Object.values(LABEL_MEANING),
    ];
    expect(offenders(texts)).toEqual([]);
    // The engine identity is kept, in the technical field.
    expect(rows.find((c) => c.id === 'openmm')?.engine).toBe('OpenMM');
  });

  it('the rendered catalogue screen shows engines only under Technical details', async () => {
    stubWindow();
    try {
      const { ScientificOsScreen } = await import('../components/ScientificOsScreen');
      const html = renderToStaticMarkup(<ScientificOsScreen />);
      expect(customerText(html).match(ENGINE_NAME_PATTERN)).toBeNull();
      expect(html).toContain('<span>Engine</span>OpenMM');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Ask chips name the task and capability, and fill a command without an engine name', () => {
    expect(offenders(CHAT_ENGINES.flatMap((e) => [e.task, chatEngineLine(e), e.prompt]))).toEqual([]);
  });
});

describe('Start (the dashboard)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  for (const locale of ['pl', 'en'] as const) {
    it(`shows capabilities in ${locale.toUpperCase()}; engines only under Technical details`, async () => {
      stubWindow();
      const { setLocale } = await import('../core/i18n');
      setLocale(locale);
      const { StartHero } = await import('../components/StartHero');
      const html = renderToStaticMarkup(<StartHero />);
      expect(customerText(html).match(ENGINE_NAME_PATTERN)).toBeNull();
      // Not deleted: the engines and the owner's Astex wording are one click away.
      expect(html).toMatch(/data-technical-details[\s\S]*AutoDock Vina/);
      expect(html).toMatch(/data-technical-details[\s\S]*GNINA/);
      setLocale('pl');
    });
  }
});
