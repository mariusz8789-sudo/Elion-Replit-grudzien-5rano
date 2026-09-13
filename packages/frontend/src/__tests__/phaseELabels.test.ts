import { describe, expect, it } from 'vitest';
import { runAutonomousOrchestrator } from '../core/agent/campaignOrchestrator';
import { makeKeplerDomainAdapter } from '../core/biotechData/domainAdapterRegistry';
import { KEPLER_MARS_ANCHOR_ID } from '../core/biotechData/externalAnchor';
import {
  allCanonicalKeys,
  checkCompleteness,
  isRtl,
  lookupTranslation,
  renderLabel,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '../core/agent/phaseELabels';

/**
 * TE7 — MULTILINGUAL ACCEPTANCE.
 * TE7.1: same run in all 3 locales -> identical fingerprint+verdict.
 * TE7.4: missing translation -> explicit fallback+flag, not silent.
 * TE7.5: every verdict/label has a canonical key + 3 translations.
 */

describe('TE7.5 — completeness: every canonical key has all 3 locales, none empty', () => {
  it('checkCompleteness reports fully complete, with no missing entries', () => {
    const result = checkCompleteness();
    expect(result.missing).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it('every canonical key renders non-empty text in every supported locale', () => {
    for (const key of allCanonicalKeys()) {
      for (const locale of SUPPORTED_LOCALES) {
        const rendered = renderLabel(key, locale);
        expect(rendered.text.length).toBeGreaterThan(0);
        expect(rendered.fallback).toBe(false);
      }
    }
  });

  it('exactly 19 canonical keys are covered (ResultLabel 4 + NoveltyLevel 4 + OrchestratorStopReason 7 + DirectionGenerationMethod 4)', () => {
    expect(allCanonicalKeys().length).toBe(19);
  });
});

describe('TE7.4 — a missing translation produces an explicit, flagged fallback, never silent', () => {
  it('lookupTranslation falls back to English and sets fallback=true when a locale entry is absent', () => {
    const incomplete = { en: 'Test label' }; // pl/ar deliberately absent
    const pl = lookupTranslation(incomplete, 'TEST_KEY', 'pl');
    expect(pl.fallback).toBe(true);
    expect(pl.text).toBe('Test label');

    const en = lookupTranslation(incomplete, 'TEST_KEY', 'en');
    expect(en.fallback).toBe(false);
  });

  it('a translation missing even in English produces a visibly-flagged placeholder, never an empty string', () => {
    const empty = {};
    const rendered = lookupTranslation(empty, 'NEVER_TRANSLATED', 'ar');
    expect(rendered.fallback).toBe(true);
    expect(rendered.text).toContain('NEVER_TRANSLATED');
    expect(rendered.text.length).toBeGreaterThan(0);
  });
});

describe('Rule 6 — Arabic translations are explicitly marked UNVERIFIED, never presented with false confidence', () => {
  it('every AR render carries arabicVerificationStatus=UNVERIFIED; EN/PL carry N/A', () => {
    const ar = renderLabel('DISCOVERY', 'ar');
    expect(ar.arabicVerificationStatus).toBe('UNVERIFIED');
    const en = renderLabel('DISCOVERY', 'en');
    expect(en.arabicVerificationStatus).toBe('N/A');
    const pl = renderLabel('DISCOVERY', 'pl');
    expect(pl.arabicVerificationStatus).toBe('N/A');
  });
});

describe('RTL', () => {
  it('isRtl identifies Arabic as RTL and English/Polish as not', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('pl')).toBe(false);
  });
});

describe('TE7.1 — same run, all 3 locales -> identical fingerprint + verdict (language never touches computation)', () => {
  it('one real orchestrator run rendered in EN/PL/AR keeps the exact same campaignFingerprint and resultLabel key', () => {
    const trace = runAutonomousOrchestrator({
      seedAdapter: makeKeplerDomainAdapter(),
      options: { maxRounds: 7, maxTerms: 2 },
      maxCampaigns: 1,
      declaredPublicAnchorResolver: () => ({
        anchorId: KEPLER_MARS_ANCHOR_ID,
        summary: "Kepler's third law — established public knowledge.",
      }),
    });
    const campaign = trace.campaigns[0]!;
    const fingerprint = campaign.result.campaignFingerprint;
    const canonicalLabel = campaign.resultLabel;
    const canonicalStopReason = trace.stopReason;

    const renders: Record<SupportedLocale, { readonly label: string; readonly stop: string }> = {} as never;
    for (const locale of SUPPORTED_LOCALES) {
      renders[locale] = {
        label: renderLabel(canonicalLabel, locale).text,
        stop: renderLabel(canonicalStopReason, locale).text,
      };
      // Rendering in a locale must not have mutated anything upstream.
      expect(campaign.result.campaignFingerprint).toBe(fingerprint);
      expect(campaign.resultLabel).toBe(canonicalLabel);
      expect(trace.stopReason).toBe(canonicalStopReason);
    }

    // The three locales must actually differ in TEXT (it's a real translation)...
    expect(renders.en.label).not.toBe(renders.pl.label);
    expect(renders.en.label).not.toBe(renders.ar.label);
    // ...while the canonical machine verdict driving all three is the SAME single value.
    expect(canonicalLabel).toBe('REPRODUCTION');
    expect(fingerprint.length).toBeGreaterThan(0);
  });
});
