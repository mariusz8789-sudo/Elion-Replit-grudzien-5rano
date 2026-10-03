import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { MORE_SECTIONS, NAV_SECTIONS, NAV_ITEMS, navVariants } from '../core/navigation';
import { ITEM_CAPABILITY, PROFILE_MENU_TABLE, menuForProfile, visibleMenuIds } from '../core/profileNavigation';
import { canUseCapability, type AccountProfile } from '../core/accountProfiles';
import { FULL_DASHBOARD_HASH, PROFILE_DASHBOARDS, ProfileDashboard } from '../components/ProfileDashboard';
import { AppShell } from '../components/AppShell';
import { clearSession, setSession } from '../core/backend/session';
import { parseHash } from '../App';

const ids = (sections: readonly { items: readonly { id: string }[] }[]): string[] => sections.flatMap((s) => s.items.map((i) => i.id));

function signIn(accountProfile: AccountProfile): void {
  setSession({ token: 't', user: { id: 'u', email: 'ola@szkola.pl', displayName: 'Ola Nowak', createdAt: 1, accountProfile }, expiresInMs: 1 });
}

afterEach(() => { clearSession(); });

describe('menu per account profile', () => {
  it('guests, BADACZ and INSTYTUCJA get the full, unchanged menu', () => {
    for (const profile of [null, 'BADACZ', 'INSTYTUCJA'] as const) {
      const menu = menuForProfile(profile);
      expect(menu.simplified).toBe(false);
      expect(menu.main).toBe(NAV_SECTIONS);
      expect(menu.more).toBe(MORE_SECTIONS);
      expect(menu.showOverview).toBe(true);
      expect(menu.variants('campaign')).toEqual(navVariants('campaign'));
    }
  });

  it('UCZEN: Start, Człowiek, Laboratorium and only education-friendly More entries', () => {
    const v = visibleMenuIds('UCZEN');
    expect(v.main).toEqual(['home', 'human-biology-lab', 'scientific-worlds']);
    expect([...v.more].sort()).toEqual(
      ['glossary', 'dome-world', 'black-hole', 'universe', 'investor-demo', 'chemistry', 'virtual-bio', 'account', 'settings'].sort(),
    );
    expect(menuForProfile('UCZEN').showOverview).toBe(false);
  });

  it('STUDENT: pupil set plus evidence, CERN data, reviewer room, physics group and memory', () => {
    const v = visibleMenuIds('STUDENT');
    expect(v.main).toEqual(['home', 'human-biology-lab', 'reviewer', 'evidence', 'scientific-worlds', 'cms-open-data']);
    const physics = MORE_SECTIONS.find((s) => s.id === 'more-physics')!.items.map((i) => i.id);
    for (const id of [...visibleMenuIds('UCZEN').more, ...physics, 'memory']) expect(v.more).toContain(id);
  });

  it('NAUCZYCIEL: at least the student set, account always there', () => {
    const v = visibleMenuIds('NAUCZYCIEL');
    const s = visibleMenuIds('STUDENT');
    for (const id of s.main) expect(v.main).toContain(id);
    for (const id of s.more) expect(v.more).toContain(id);
    expect(v.more).toContain('account');
    expect(v.more).toContain('settings');
  });

  it('simplified profiles never see drug discovery, campaigns or compute in the menu, not even as variants', () => {
    for (const profile of ['UCZEN', 'STUDENT', 'NAUCZYCIEL'] as const) {
      const menu = menuForProfile(profile);
      const shown = [...ids(menu.main), ...ids(menu.more), ...ids(menu.more).flatMap((id) => menu.variants(id).map((x) => x.id))];
      for (const [id, capability] of Object.entries(ITEM_CAPABILITY)) {
        if (!canUseCapability(profile, capability)) expect(shown, `${profile} ${id}`).not.toContain(id);
      }
      expect(shown).not.toContain('science');
      expect(shown).not.toContain('campaign');
      expect(shown).not.toContain('discover');
    }
  });

  it('every id in the table is a real menu entry (no typos)', () => {
    const known = new Set(NAV_ITEMS.map((i) => i.id));
    for (const rule of Object.values(PROFILE_MENU_TABLE)) {
      for (const id of [...rule.main, ...rule.more]) expect(known.has(id), id).toBe(true);
    }
  });

  it('the shell renders the short menu for a pupil and the full one for a guest', () => {
    const guest = renderToStaticMarkup(<AppShell><div /></AppShell>);
    expect(guest).toContain('Odkrywanie leków');
    expect(guest).toContain('Konsola badań');
    signIn('UCZEN');
    const pupil = renderToStaticMarkup(<AppShell><div /></AppShell>);
    expect(pupil).not.toContain('Odkrywanie leków');
    expect(pupil).not.toContain('Konsola badań');
    expect(pupil).toContain('Człowiek · Human Explorer');
    expect(pupil).toContain('Laboratorium');
    // Bottom bar unchanged: Start · Zapytaj · Człowiek + Konto + Więcej.
    expect(pupil).toContain('data-testid="mobile-navigation"');
    expect(pupil).toContain('Zapytaj');
  });
});

describe('ProfileDashboard', () => {
  it('pupil: title, what is here, 3–5 tiles on real routes, locked areas, full-dashboard link', () => {
    const html = renderToStaticMarkup(<ProfileDashboard profile="UCZEN" />);
    expect(html).toContain('Twój pulpit — uczeń');
    expect(html).toContain('Uczeń / szkoła');
    expect(html).toContain('Co tu jest');
    expect(html).toContain('href="#/human-biology-lab"');
    expect(html).toContain('href="#/scientific-worlds"');
    expect(html).toContain('href="#/glossary"');
    expect(html).toContain('Zadaj pytanie');
    expect(html).toContain('Twój profil nie obejmuje:');
    expect(html).toContain('Kampanie odkrywania leków');
    expect(html).toContain(`href="${FULL_DASHBOARD_HASH}"`);
    expect(html).toContain('Pokaż pełny pulpit Genesis');
    expect(html).not.toContain('Widoki dla klasy: w przygotowaniu');
  });

  it('student adds evidence, CERN data and the reviewer room', () => {
    const html = renderToStaticMarkup(<ProfileDashboard profile="STUDENT" />);
    expect(html).toContain('Twój pulpit — student');
    for (const hash of ['#/evidence', '#/physics/cms-z', '#/reviewer']) expect(html).toContain(`href="${hash}"`);
  });

  it('teacher gets the honest "class views not built yet" note and no teaching in the locked list', () => {
    const html = renderToStaticMarkup(<ProfileDashboard profile="NAUCZYCIEL" />);
    expect(html).toContain('Twój pulpit — nauczyciel');
    expect(html).toContain('Widoki dla klasy: w przygotowaniu');
    expect(html).not.toMatch(/nie obejmuje:[^<]*Widoki dla klasy i nauczania/);
  });

  it('each dashboard has 3–5 large tiles, all on routes the router knows', () => {
    const realWindow = (globalThis as { window?: unknown }).window;
    const at = (hash: string) => { (globalThis as { window?: unknown }).window = { location: { hash } }; return parseHash(); };
    try {
      for (const dashboard of Object.values(PROFILE_DASHBOARDS)) {
        expect(dashboard.tiles.length).toBeGreaterThanOrEqual(3);
        expect(dashboard.tiles.length).toBeLessThanOrEqual(5);
        for (const tile of [...dashboard.tiles, ...dashboard.shortcuts]) {
          if (tile.hash !== undefined) expect(at(tile.hash).kind, tile.hash).not.toBe('home');
        }
      }
      expect(at(FULL_DASHBOARD_HASH)).toEqual({ kind: 'home', full: true });
    } finally {
      (globalThis as { window?: unknown }).window = realWindow;
    }
  });
});
