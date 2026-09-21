import { describe, expect, it } from 'vitest';
import {
  checkLowerHarmLabelCompleteness,
  allLowerHarmTextsByLocale,
  renderLowerHarmLabel,
  SUPPORTED_LOCALES,
} from '../core/agent/lowerHarmLabels';
import {
  scanAllLocales,
  hasAnyBannedString,
  scanForActiveColliderClaims,
  scanAllLocalesForActiveColliderClaims,
  hasAnyActiveColliderClaim,
} from '../core/agent/bannedStringScanner';

/**
 * Requirement #10 (GENESIS VISUAL COMPLETION): a banned-strings scanner over
 * every new PL/EN/AR text used by the LOWER-HARM and /physics/cms-z screens.
 * Requirement #10 (new, cms-z spec): the scanner must NOT flag "live" /
 * "simulation" when they appear inside an explicit negation such as
 * "NOT A LIVE COLLIDER / NOT A SIMULATION" — only an unnegated claim that
 * Genesis IS an active collider or IS running a simulation is a hit.
 */

describe('lowerHarmLabels — dictionary completeness', () => {
  it('every canonical key has a non-empty string for en/pl/ar', () => {
    const { complete, missing } = checkLowerHarmLabelCompleteness();
    expect(missing).toEqual([]);
    expect(complete).toBe(true);
  });

  it('renderLowerHarmLabel resolves a known key without falling back', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const rendered = renderLowerHarmLabel('CERN_OFFLINE_BANNER', locale);
      expect(rendered.fallback).toBe(false);
      expect(rendered.text.length).toBeGreaterThan(0);
    }
  });
});

describe('lowerHarmLabels — comfort-language banned strings (Rule 2, all 3 locales)', () => {
  it('none of the real LOWER-HARM/CERN dictionary text contains a banned comfort-language string', () => {
    const hits = scanAllLocales(allLowerHarmTextsByLocale());
    expect(hasAnyBannedString(hits)).toBe(false);
  });
});

describe('scanForActiveColliderClaims — negation-aware (does NOT flag an explicit denial)', () => {
  it('EN: "NOT A LIVE COLLIDER / NOT A SIMULATION" produces zero hits', () => {
    const hits = scanForActiveColliderClaims(
      'OFFLINE ANALYSIS OF HISTORICAL OPEN DATA — NOT A LIVE COLLIDER / NOT A SIMULATION',
      'en',
    );
    expect(hits).toEqual([]);
  });

  it('PL: "TO NIE JEST AKTYWNY ZDERZACZ / TO NIE JEST SYMULACJA" produces zero hits', () => {
    const hits = scanForActiveColliderClaims(
      'ANALIZA OFFLINE HISTORYCZNYCH DANYCH OTWARTYCH — TO NIE JEST AKTYWNY ZDERZACZ / TO NIE JEST SYMULACJA',
      'pl',
    );
    expect(hits).toEqual([]);
  });

  it('AR: "ليس مصادمًا مباشرًا وليس محاكاة" (not a live collider, not a simulation) produces zero hits', () => {
    const hits = scanForActiveColliderClaims(
      'تحليل غير متصل لبيانات مفتوحة تاريخية — ليس مصادمًا مباشرًا وليس محاكاة',
      'ar',
    );
    expect(hits).toEqual([]);
  });

  it('the full LOWER-HARM/CERN dictionary (all locales) never claims Genesis is live or simulating', () => {
    const hits = scanAllLocalesForActiveColliderClaims(allLowerHarmTextsByLocale());
    expect(hasAnyActiveColliderClaim(hits)).toBe(false);
  });
});

describe('scanForActiveColliderClaims — still catches a genuine unnegated claim', () => {
  it('EN: "Genesis is now live and simulating real collisions" is caught', () => {
    const hits = scanForActiveColliderClaims('Genesis is now live and simulating real collisions.', 'en');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.matched === 'live')).toBe(true);
    expect(hits.some((h) => h.matched === 'simulating')).toBe(true);
  });

  it('PL: "Genesis jest teraz aktywny zderzacz i prowadzi symulację" is caught', () => {
    const hits = scanForActiveColliderClaims('Genesis jest teraz aktywny zderzacz i prowadzi symulację na żywo.', 'pl');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('AR: an unnegated claim of a live collider is caught', () => {
    const hits = scanForActiveColliderClaims('جينيسيس الآن مصادم نشط ويقوم بمحاكاة حقيقية.', 'ar');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('a negation far outside the search window still lets a later unnegated claim through', () => {
    // "Not" appears, but so far before "live" that the two are unrelated claims.
    const hits = scanForActiveColliderClaims(
      'Not every experiment in this repository is real. Meanwhile, on this specific screen, Genesis is live right now, colliding real beams every second of the day continuously.',
      'en',
    );
    expect(hits.length).toBeGreaterThan(0);
  });
});
