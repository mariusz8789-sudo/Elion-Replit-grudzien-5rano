import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_ANCHORS,
  KEPLER_MARS_ANCHOR_ID,
  anchorPayloadDigest,
  resolveExternalAnchor,
  buildAnchoredReferenceRun,
  runExternalAnchor,
} from '../core/biotechData/externalAnchor';
import { verifyPredictionAgainstRealExperiment } from '../core/agent/predictionVerification';
import { parseNssdcPlanetaryFactSheet } from '../core/biotechData/nssdcPlanetaryFactSheet';
import nssdcHtml from '../core/biotechData/nssdc-planetary-factsheet.html?raw';
import { getRouterModel } from '../core/experimentFabric/router';
import { buildStructuredRequestFromModel } from '../core/experimentFabric/structuredRequestBuilder';
import { runExperiment } from '../core/experimentFabric/executor';

/**
 * P2.3 — DRUGA kotwica zewnętrzna, niezależna od pierwszej (PubChem).
 *
 * Predykcja: III prawo Keplera z ISTNIEJĄCEGO `universe-kepler` (semi-major
 * axis Marsa z NASA -> orbitalPeriodYears). Obserwacja: opublikowany okres
 * orbitalny Marsa z tej samej strony NASA, odczytany niezależnie od strony
 * odległości. Payload jest surową stroną HTML NASA NSSDCA, przypiętą przez
 * odtworzenie z realnego loga CI (dowód SHA-256 w `nssdcPlanetaryFactSheet.ts`).
 */

describe('kotwica Kepler/Mars: prowieniencja i integralność payloadu', () => {
  const anchor = EXTERNAL_ANCHORS.find((a) => a.id === KEPLER_MARS_ANCHOR_ID)!;

  it('kotwica istnieje i jest zarejestrowana w rejestrze', () => {
    expect(anchor).toBeDefined();
  });

  it('odcisk przypiętego payloadu (surowej strony HTML) zgadza się z zadeklarowanym', () => {
    expect(anchorPayloadDigest(anchor.payload)).toBe(anchor.payloadDigest);
  });

  it('zadeklarowany odcisk jest LITERAŁEM w źródle, a nie wyliczeniem z payloadu', () => {
    expect(anchor.payloadDigest).toBe('2296fa16');
  });

  it('ODMAWIA, gdy przypięty payload (HTML) został zmieniony', () => {
    const tampered = { ...anchor, payload: (anchor.payload as string).replace('687.0', '999.9') };
    const resolved = resolveExternalAnchor(tampered);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) throw new Error('unreachable');
    expect(resolved.reason).toMatch(/odcisk|digest/i);
    expect(() => buildAnchoredReferenceRun(tampered)).toThrow(/odcisk|digest/i);
  });
});

describe('kotwica Kepler/Mars: predykcja niezależna od obserwacji', () => {
  const anchor = EXTERNAL_ANCHORS.find((a) => a.id === KEPLER_MARS_ANCHOR_ID)!;

  it('obserwowany okres orbitalny jest CZYTANY z payloadu NASA, nie policzony przez Genesis', () => {
    const resolved = resolveExternalAnchor(anchor);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error('unreachable');
    // 687.0 dni to opublikowana wartość NASA dla Marsa, nie wynik universe-kepler.
    expect(resolved.observedValue).toBe(687.0);
    expect(resolved.unit).toBe('days');
  });

  it('predykcja powstaje z III prawa Keplera przez REALNY universe-kepler, z odległości Marsa (nie z okresu)', () => {
    const parsed = parseNssdcPlanetaryFactSheet(nssdcHtml);
    const distanceMillionKm = parsed.mars!.distanceFromSunMillionKm;
    const AU_KM = 149597870.7;
    const orbitalRadiusAu = (distanceMillionKm * 1e6) / AU_KM;
    const model = getRouterModel('universe-kepler')!;
    const request = buildStructuredRequestFromModel(model, { centralMassSolar: 1, orbitalRadiusAu }, { sourceText: 'test' });
    const run = runExperiment(request);
    const periodYears = run.result.outputs.orbitalPeriodYears as number;
    expect(periodYears * 365.25).toBeCloseTo(687.234, 2);
  });

  it('run kotwiczący jest oznaczony REFERENCE, cytat pochodzi ze zbioru, nie od użytkownika', () => {
    const run = buildAnchoredReferenceRun(anchor);
    expect(run.provenance.dataProvenance).toBe('REFERENCE');
    const citation = run.request.sourceText;
    expect(citation).toContain(anchor.sourceUrl);
    expect(citation).toContain(anchor.retrievedAt);
    expect(citation).toContain(anchor.payloadDigest);
  });
});

describe('kotwica Kepler/Mars: pełny cykl — predykcja -> obserwacja -> Tautology Gate -> werdykt -> replay', () => {
  it('kotwica przechodzi w zadeklarowanym paśmie i raportuje SUPPORTED', () => {
    const result = runExternalAnchor(KEPLER_MARS_ANCHOR_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.verification.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(result.verification.observedValue).toBe(687.0);
    expect(result.verification.predictedValue).toBeCloseTo(687.234, 2);
    expect(result.criterion.tolerance).toBeGreaterThan(0);
    expect(result.observationOrigin).toBe('REFERENCE');
  });

  it('EMPIRICAL_TEST — Tautology Gate klasyfikuje obserwację niezależną, nigdy CONSISTENCY_CHECK', () => {
    const result = runExternalAnchor(KEPLER_MARS_ANCHOR_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.tautologyAssessment.classification).toBe('EMPIRICAL_TEST');
  });

  it('FALSYFIKACJA JEST REALNA — zła predykcja zostaje odrzucona przez to samo kryterium', () => {
    const anchor = EXTERNAL_ANCHORS.find((a) => a.id === KEPLER_MARS_ANCHOR_ID)!;
    const run = buildAnchoredReferenceRun(anchor);
    const falsified = verifyPredictionAgainstRealExperiment({
      predictedValue: 700.0,
      criterion: { metric: anchor.metric, relation: 'equal-within-tolerance', tolerance: anchor.tolerance, rationale: 'test' },
      realRun: run,
    });
    expect(falsified.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('REPLAY MATCH — odcisk werdyktu jest stabilny; zmiana predykcji go zmienia', () => {
    const first = runExternalAnchor(KEPLER_MARS_ANCHOR_ID);
    const second = runExternalAnchor(KEPLER_MARS_ANCHOR_ID);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('unreachable');
    expect(second.verificationFingerprint).toBe(first.verificationFingerprint);
    expect(second.replay).toBe('MATCH');

    const drifted = runExternalAnchor(KEPLER_MARS_ANCHOR_ID, { predictedValueOverride: 690.0 });
    expect(drifted.ok).toBe(true);
    if (!drifted.ok) throw new Error('unreachable');
    expect(drifted.verificationFingerprint).not.toBe(first.verificationFingerprint);
  });

  it('ta sama liczba podana jako run SIMULATED zostaje ODRZUCONA', () => {
    const anchor = EXTERNAL_ANCHORS.find((a) => a.id === KEPLER_MARS_ANCHOR_ID)!;
    const run = buildAnchoredReferenceRun(anchor);
    const simulatedTwin = { ...run, provenance: { ...run.provenance, dataProvenance: 'SIMULATED' as const } };
    const refused = verifyPredictionAgainstRealExperiment({
      predictedValue: 687.234,
      criterion: { metric: anchor.metric, relation: 'equal-within-tolerance', tolerance: anchor.tolerance, rationale: 'test' },
      realRun: simulatedTwin,
    });
    expect(refused.assessment).toBe('INCONCLUSIVE');
    expect(refused.message).toMatch(/REAL_EXPERIMENTAL|REFERENCE/);
  });
});

describe('Tautology Gate wpięta w OBIE kotwice (nie tylko Kepler)', () => {
  it('kotwica PubChem też klasyfikuje się jako EMPIRICAL_TEST, nigdy CONSISTENCY_CHECK', () => {
    const result = runExternalAnchor('pubchem-cid-2519-molecular-weight');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.tautologyAssessment.classification).toBe('EMPIRICAL_TEST');
  });

  it('każda zadeklarowana kotwica ma jawną derywację Tautology Gate (predykcja i obserwacja)', () => {
    for (const anchor of EXTERNAL_ANCHORS) {
      expect(anchor.tautologyDerivation.prediction.source).toBeDefined();
      expect(anchor.tautologyDerivation.observation.source).toBe('independent-measurement');
    }
  });
});
