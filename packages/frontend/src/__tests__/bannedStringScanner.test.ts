import { describe, expect, it } from 'vitest';
import { scanForBannedStrings, scanAllLocales, hasAnyBannedString, BANNED_STRINGS } from '../core/agent/bannedStringScanner';

/**
 * TE7.2 — a banned comfort-string, injected in each of the 3 languages,
 * is caught (per-language negative test — a hole in ANY one language is a
 * hole in the whole truth guarantee, per Rule 2).
 */

describe('TE7.2 — banned-string detection per language (negative tests)', () => {
  it('EN: "This treatment is completely safe" is caught', () => {
    const hits = scanForBannedStrings('This treatment is completely safe for all patients.', 'en');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.matched).toBe('safe');
  });

  it('EN: "no side effects" and "miracle cure" and "approved replacement" are each caught', () => {
    expect(scanForBannedStrings('Reports no side effects in this cohort.', 'en').length).toBeGreaterThan(0);
    expect(scanForBannedStrings('Marketed as a miracle cure.', 'en').length).toBeGreaterThan(0);
    expect(scanForBannedStrings('This is the approved replacement.', 'en').length).toBeGreaterThan(0);
  });

  it('PL: "lek jest bezpieczny" is caught', () => {
    const hits = scanForBannedStrings('Ten lek jest bezpieczny dla wszystkich pacjentów.', 'pl');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.matched).toBe('bezpieczny');
  });

  it('PL: "bez skutków ubocznych" and "cudowny lek" are each caught', () => {
    expect(scanForBannedStrings('Lek bez skutków ubocznych.', 'pl').length).toBeGreaterThan(0);
    expect(scanForBannedStrings('To jest cudowny lek.', 'pl').length).toBeGreaterThan(0);
  });

  it('AR: "آمن" (safe) is caught', () => {
    const hits = scanForBannedStrings('هذا العلاج آمن تمامًا لجميع المرضى.', 'ar');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.matched).toBe('آمن');
  });

  it('AR: "بدون آثار جانبية" and "دواء معجزة" and "بديل معتمد" are each caught', () => {
    expect(scanForBannedStrings('بدون آثار جانبية على الإطلاق.', 'ar').length).toBeGreaterThan(0);
    expect(scanForBannedStrings('يُسوَّق باعتباره دواء معجزة.', 'ar').length).toBeGreaterThan(0);
    expect(scanForBannedStrings('هذا هو البديل معتمد.', 'ar').length).toBeGreaterThan(0);
  });

  it('clean text in each language produces zero hits — the scanner is not over-eager', () => {
    expect(scanForBannedStrings('The observed efficacy delta was 2.1 percentage points, uncertainty wide.', 'en')).toEqual([]);
    expect(scanForBannedStrings('Zaobserwowana różnica skuteczności wyniosła 2,1 punktu procentowego.', 'pl')).toEqual([]);
    expect(scanForBannedStrings('كان الفرق الملحوظ في الفعالية 2.1 نقطة مئوية.', 'ar')).toEqual([]);
  });
});

describe('scanAllLocales / hasAnyBannedString — the real Rule 2 guarantee: a hole in ANY one language is caught', () => {
  it('a banned string present ONLY in the Arabic rendering is still caught, even when EN/PL are clean', () => {
    const hits = scanAllLocales({
      en: 'The observed efficacy delta was small.',
      pl: 'Zaobserwowana różnica skuteczności była mała.',
      ar: 'هذا الدواء آمن تمامًا.', // banned string slipped in only here
    });
    expect(hits.en).toEqual([]);
    expect(hits.pl).toEqual([]);
    expect(hits.ar.length).toBeGreaterThan(0);
    expect(hasAnyBannedString(hits)).toBe(true);
  });

  it('all three languages clean -> hasAnyBannedString is false', () => {
    const hits = scanAllLocales({
      en: 'The observed efficacy delta was small.',
      pl: 'Zaobserwowana różnica skuteczności była mała.',
      ar: 'كان الفرق الملحوظ في الفعالية صغيرًا.',
    });
    expect(hasAnyBannedString(hits)).toBe(false);
  });

  it('every declared banned string list is non-empty for all 3 locales', () => {
    expect(BANNED_STRINGS.en.length).toBeGreaterThan(0);
    expect(BANNED_STRINGS.pl.length).toBeGreaterThan(0);
    expect(BANNED_STRINGS.ar.length).toBeGreaterThan(0);
  });
});
