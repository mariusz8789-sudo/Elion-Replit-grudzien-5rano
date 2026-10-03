import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../components/AppShell';
import { setLocale } from '../core/i18n';

/**
 * ARABIC IS RIGHT-TO-LEFT. With the Arabic locale the shell carries dir="rtl", and the navigation
 * stylesheet uses logical properties only, so the sidebar sits on the right, the main column's margin
 * moves with it and the tab bar reads right to left. Modules without Arabic keep English words.
 */
afterEach(() => { setLocale('pl'); });

describe('the shell follows the language direction', () => {
  it('Arabic: dir="rtl" and lang="ar" on the shell; Polish and English stay left-to-right', () => {
    setLocale('ar');
    const ar = renderToStaticMarkup(<AppShell>x</AppShell>);
    expect(ar).toMatch(/<div class="shell" data-nav="[a-z]+" dir="rtl" lang="ar">/);
    // Arabic where the menu has it, English where it does not yet.
    expect(ar).toContain('الأدلة وإعادة التشغيل');
    expect(ar).toContain('Science Flight Control');
    for (const locale of ['pl', 'en'] as const) {
      setLocale(locale);
      expect(renderToStaticMarkup(<AppShell>x</AppShell>)).toMatch(new RegExp(`<div class="shell" data-nav="[a-z]+" dir="ltr" lang="${locale}">`));
    }
  });

  it('the navigation stylesheet mirrors through logical properties, not left/right', () => {
    const css = readFileSync(fileURLToPath(new URL('../styles-nav.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const physical = css.split('\n').filter((line) => /(?:^|[\s;{])(?:left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/.test(line));
    // Allowed: the reset of older physical margins before the logical one, and the centred active-tab marker.
    const allowed = physical.filter((line) => !/margin-left: 0; margin-right: 0; margin-inline-start/.test(line) && !/left: 50%; transform: translateX\(-50%\)/.test(line));
    expect(allowed).toEqual([]);
    expect(css).toMatch(/\.gn-side \{[^}]*inset-inline-start: 0/);
    expect(css).toMatch(/border-inline-end: 1px solid var\(--gn-line\)/);
    expect(css).toMatch(/\.gn-tabbar \{[^}]*inset-inline: 0/);
    expect(css).toMatch(/\[dir='rtl'\] \.gn-chev:not\(\.is-open\)/);
    expect(css).not.toMatch(/text-align: left/);
  });
});
