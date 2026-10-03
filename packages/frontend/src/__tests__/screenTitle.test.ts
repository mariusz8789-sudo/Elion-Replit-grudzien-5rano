import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '../core/navigation';
import { navLabel, screenTitle } from '../core/navigationText';

/**
 * TOP-BAR TITLES FOLLOW THE MENU. A screen's title bar shows the navigation
 * name of its place in the chosen language, so the title, the sidebar and the
 * tab bar never disagree ("Candidate Dossier" under a menu that says
 * "Kandydaci"). Arabic shows English where no Arabic exists yet.
 */
describe('screenTitle', () => {
  it('every menu place titles its screen with its navigation label, in PL, EN and AR', () => {
    for (const item of NAV_ITEMS) {
      if (!item.hash) continue;
      for (const locale of ['pl', 'en', 'ar'] as const) {
        expect(screenTitle(item.hash, 'fallback', locale), `${item.id} ${locale}`).toBe(navLabel(item, locale));
      }
    }
  });

  it('the reported screens: Candidates and Research runs, not their old hardcoded titles', () => {
    expect(screenTitle('#/dossier', 'Candidate Dossier', 'pl')).toBe('Kandydaci');
    expect(screenTitle('#/dossier?candidate=pubchem%3A2519', 'Candidate Dossier', 'en')).toBe('Candidates');
    expect(screenTitle('#/research-console', 'Odkrycia — Genesis Research Console', 'pl')).toBe('Przebiegi badań');
    expect(screenTitle('#/research-console', 'Odkrycia — Genesis Research Console', 'en')).toBe('Research runs');
    expect(screenTitle('#/research-console', 'x', 'ar')).toBe('عمليات البحث');
  });

  it('Arabic falls back to English where the menu has no Arabic label', () => {
    expect(screenTitle('#/flight-control', 'x', 'ar')).toBe('Science Flight Control');
  });

  it('a deep link with no menu entry keeps the title its screen passed', () => {
    expect(screenTitle('#/discovery-hall', 'Discovery Hall', 'en')).toBe('Discovery Hall');
  });

  it('the top bar renders the derived title', () => {
    const app = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
    expect(app).toMatch(/screenTitle\(hash, cleanRouteTitle\(title\), locale\)/);
    expect(app).toMatch(/<h1 data-testid="topbar-title">\{shown\}<\/h1>/);
  });
});
