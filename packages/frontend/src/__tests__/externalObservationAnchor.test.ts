import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_ANCHORS,
  anchorPayloadDigest,
  resolveExternalAnchor,
  buildAnchoredReferenceRun,
  runExternalAnchor,
  MOLECULAR_WEIGHT_ANCHOR_ID,
  KEPLER_VENUS_ANCHOR_ID,
} from '../core/biotechData/externalAnchor';
import { verifyPredictionAgainstRealExperiment } from '../core/agent/predictionVerification';
import { molecularWeight, parseFormula } from '../core/compute/cheminformatics';

/**
 * P2.3 — KOTWICA ZEWNĘTRZNA.
 *
 * Do tej pory „obserwacja zewnętrzna" wchodziła do Genesis jako LICZBA WPISANA
 * W POLE TEKSTOWE plus CYTAT WPISANY RĘCZNIE (`DrugDiscoveryScreen.tsx:141-150`:
 * `realEvidenceObserved`, `realEvidenceCitation`). To jest uczciwie oznaczone
 * jako REFERENCE i `predictionVerification` słusznie odmawia porównania z runem
 * SIMULATED — ale recenzent NIE MOŻE tego odtworzyć. Wpisany cytat jest
 * asercją, nie prowieniencją: nic nie jest sumowane, nic nie da się ponownie
 * pobrać, i nie ma sposobu stwierdzić, czy ta liczba pochodzi skądkolwiek.
 *
 * Te testy pilnują kotwicy, w której obserwacja pochodzi z PRZYPIĘTEGO,
 * SUMOWANEGO, CYTOWANEGO zbioru w repo — i która ODMAWIA działania, gdy
 * payload się zmienił.
 */

describe('kotwica jest zadeklarowana z pełną prowieniencją, nie z pola tekstowego', () => {
  it('każda kotwica nazywa źródło, wersję, datę pobrania, licencję i odcisk payloadu', () => {
    expect(EXTERNAL_ANCHORS.length).toBeGreaterThan(0);
    for (const anchor of EXTERNAL_ANCHORS) {
      expect(anchor.sourceUrl).toMatch(/^https:\/\//);
      expect(anchor.sourceVersion.length).toBeGreaterThan(0);
      expect(anchor.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(anchor.license.length).toBeGreaterThan(0);
      expect(anchor.payloadDigest.length).toBeGreaterThan(0);
      // Punkt obowiązkowy: co ta kotwica NAPRAWDĘ testuje, a co zostaje tautologią.
      expect(anchor.whatThisTests.length).toBeGreaterThan(80);
      expect(anchor.whatRemainsUntested.length).toBeGreaterThan(80);
    }
  });

  it('odcisk przypiętego payloadu zgadza się z zadeklarowanym', () => {
    for (const anchor of EXTERNAL_ANCHORS) {
      expect(anchorPayloadDigest(anchor.payload)).toBe(anchor.payloadDigest);
    }
  });

  /**
   * REGRESJA. Pierwsza wersja modułu liczyła `payloadDigest` z payloadu przy
   * ładowaniu (`{ ...anchor, payloadDigest: anchorPayloadDigest(anchor.payload) }`),
   * więc suma kontrolna ZAWSZE się zgadzała i nie mogła wykryć niczego. Test
   * powyżej tego nie łapał, bo porównywał wyliczenie z wyliczeniem. Łapie to
   * dopiero asercja na LITERAŁ: gdy ktoś edytuje przypięty JSON, ten test
   * czerwienieje i zmusza do świadomej aktualizacji, zamiast cicho przyjąć nową
   * wartość jako „zewnętrzną obserwację".
   */
  it('zadeklarowany odcisk jest LITERAŁEM w źródle, a nie wyliczeniem z payloadu', () => {
    const anchor = EXTERNAL_ANCHORS.find((a) => a.id === MOLECULAR_WEIGHT_ANCHOR_ID)!;
    expect(anchor.payloadDigest).toBe('470de276');
  });

  it('ODMAWIA, gdy przypięty payload został zmieniony — to jest cała wartość sumy kontrolnej', () => {
    const anchor = EXTERNAL_ANCHORS.find((a) => a.id === MOLECULAR_WEIGHT_ANCHOR_ID)!;
    type Tamperable = { PropertyTable: { Properties: Array<{ MolecularWeight: string }> } };
    const clone = JSON.parse(JSON.stringify(anchor.payload)) as Tamperable;
    // Podmiana opublikowanej wartości — dokładnie ten atak, przed którym suma chroni.
    clone.PropertyTable.Properties[0]!.MolecularWeight = '999.99';
    const tampered = { ...anchor, payload: clone };
    const resolved = resolveExternalAnchor(tampered);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) throw new Error('unreachable');
    expect(resolved.reason).toMatch(/odcisk|digest/i);
    // I nie wolno przy tym wyprodukować runu.
    expect(() => buildAnchoredReferenceRun(tampered)).toThrow(/odcisk|digest/i);
  });
});

describe('obserwacja pochodzi z zewnątrz, a Genesis liczy predykcję niezależnie', () => {
  const anchor = EXTERNAL_ANCHORS.find((a) => a.id === MOLECULAR_WEIGHT_ANCHOR_ID)!;

  it('obserwowana wartość jest CZYTANA z payloadu, a nie policzona przez Genesis', () => {
    const resolved = resolveExternalAnchor(anchor);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error('unreachable');
    // 194.19 to opublikowana liczba PubChem dla CID 2519, nie wynik naszego solvera.
    expect(resolved.observedValue).toBe(194.19);
    expect(resolved.unit).toBe('g/mol');
  });

  it('run kotwiczący jest oznaczony REFERENCE, a jego cytat pochodzi ze zbioru, nie od użytkownika', () => {
    const run = buildAnchoredReferenceRun(anchor);
    expect(run.provenance.dataProvenance).toBe('REFERENCE');
    const citation = run.request.sourceText;
    expect(citation).toContain(anchor.sourceUrl);
    expect(citation).toContain(anchor.retrievedAt);
    expect(citation).toContain(anchor.payloadDigest);
  });

  it('predykcja Genesis powstaje z FORMUŁY, niezależnie od obserwowanej masy', () => {
    const parsed = parseFormula('C8H10N4O2');
    expect(parsed.ok).toBe(true);
    const predicted = molecularWeight(parsed.counts);
    // Policzone z tablicy IUPAC 2021 w repo, nie odczytane z payloadu PubChem.
    expect(predicted).toBeCloseTo(194.194, 3);
  });
});

describe('pełny cykl kotwicy: predykcja → obserwacja zewnętrzna → werdykt → odcisk', () => {
  it('kotwica przechodzi w zadeklarowanym paśmie i raportuje to jako SUPPORTED', () => {
    const result = runExternalAnchor(MOLECULAR_WEIGHT_ANCHOR_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.verification.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(result.verification.observedValue).toBe(194.19);
    expect(result.verification.predictedValue).toBeCloseTo(194.194, 3);
    // Pasmo jest PREREJESTROWANE w deklaracji kotwicy, nie dobrane po wyniku.
    expect(result.criterion.tolerance).toBeGreaterThan(0);
    expect(result.observationOrigin).toBe('REFERENCE');
  });

  it('FALSYFIKACJA JEST REALNA — zła predykcja zostaje odrzucona przez to samo kryterium', () => {
    // Bez tego testu „SUPPORTED" nic nie znaczy: trzeba pokazać, że kryterium
    // POTRAFI zawieść. Predykcja celowo błędna o ~3%.
    const anchor = EXTERNAL_ANCHORS.find((a) => a.id === MOLECULAR_WEIGHT_ANCHOR_ID)!;
    const run = buildAnchoredReferenceRun(anchor);
    const falsified = verifyPredictionAgainstRealExperiment({
      predictedValue: 200.0,
      criterion: { metric: anchor.metric, relation: 'equal-within-tolerance', tolerance: anchor.tolerance, rationale: 'test' },
      realRun: run,
    });
    expect(falsified.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('REPLAY MATCH — odcisk werdyktu jest stabilny, a zmiana obserwacji go zmienia', () => {
    const first = runExternalAnchor(MOLECULAR_WEIGHT_ANCHOR_ID);
    const second = runExternalAnchor(MOLECULAR_WEIGHT_ANCHOR_ID);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('unreachable');
    expect(second.verificationFingerprint).toBe(first.verificationFingerprint);
    expect(second.replay).toBe('MATCH');

    // Dryf musi być wykrywalny, inaczej MATCH nic nie dowodzi.
    const drifted = runExternalAnchor(MOLECULAR_WEIGHT_ANCHOR_ID, { predictedValueOverride: 195.5 });
    expect(drifted.ok).toBe(true);
    if (!drifted.ok) throw new Error('unreachable');
    expect(drifted.verificationFingerprint).not.toBe(first.verificationFingerprint);
  });

  it('ta sama liczba podana jako run SIMULATED zostaje ODRZUCONA — kotwica nie może być własną symulacją', () => {
    const anchor = EXTERNAL_ANCHORS.find((a) => a.id === MOLECULAR_WEIGHT_ANCHOR_ID)!;
    const run = buildAnchoredReferenceRun(anchor);
    const simulatedTwin = { ...run, provenance: { ...run.provenance, dataProvenance: 'SIMULATED' as const } };
    const refused = verifyPredictionAgainstRealExperiment({
      predictedValue: 194.194,
      criterion: { metric: anchor.metric, relation: 'equal-within-tolerance', tolerance: anchor.tolerance, rationale: 'test' },
      realRun: simulatedTwin,
    });
    expect(refused.assessment).toBe('INCONCLUSIVE');
    expect(refused.message).toMatch(/REAL_EXPERIMENTAL|REFERENCE/);
  });
});

/**
 * SECOND ANCHOR (C1, P2.3 follow-up) — Kepler's third law vs. Venus's real,
 * independently measured orbital period, from the pinned NASA NSSDCA
 * Planetary Fact Sheet (`packages/frontend/src/core/biotechData/
 * nssdc-planetary-factsheet.html`, byte-verified against the real CI fetch —
 * see `docs/DECISIONS.md`). Reuses the SAME anchor contract as the molecular
 * weight anchor above; these tests exercise what that anchor's generic tests
 * cannot: the Tautology Gate wiring, belief revision, and the specific
 * prediction/observation independence a two-metric HTML table introduces.
 */
describe('druga kotwica: Kepler + Wenus — niezależność ekstrakcji predykcji od obserwacji', () => {
  const anchor = EXTERNAL_ANCHORS.find((a) => a.id === KEPLER_VENUS_ANCHOR_ID)!;

  it('kotwica jest zadeklarowana', () => {
    expect(anchor).toBeDefined();
  });

  it('zadeklarowany odcisk jest LITERAŁEM w źródle, a nie wyliczeniem z payloadu', () => {
    expect(anchor.payloadDigest).toBe('2296fa16');
  });

  it('predykcja czyta WYŁĄCZNIE wiersz semi-major axis ("Distance from Sun"), nigdy wiersz okresu', () => {
    // Podmieniamy TYLKO wiersz "Orbital Period" (obserwację) na inną wartość,
    // zostawiając wiersz "Distance from Sun" bez zmian — jeśli predykcja
    // czytałaby okres, ta podmiana by ją zmieniła. Nie zmienia.
    const html = anchor.payload as string;
    const tamperedObservationOnly = html.replace('>224.7<', '>999.9<');
    expect(tamperedObservationOnly).not.toBe(html);
    const predictedBefore = anchor.computePrediction(html);
    const predictedAfter = anchor.computePrediction(tamperedObservationOnly);
    expect(predictedAfter).toBe(predictedBefore);
  });

  it('obserwacja czyta WYŁĄCZNIE wiersz Orbital Period, nigdy wiersz semi-major axis', () => {
    const html = anchor.payload as string;
    const tamperedPredictionInputOnly = html.replace('>108.2<', '>999.9<');
    expect(tamperedPredictionInputOnly).not.toBe(html);
    const observedBefore = anchor.readObservation(html);
    const observedAfter = anchor.readObservation(tamperedPredictionInputOnly);
    expect(observedAfter).toBe(observedBefore);
  });

  it('ODMAWIA, gdy przypięty payload (surowy HTML) został zmieniony', () => {
    const html = anchor.payload as string;
    const tampered = { ...anchor, payload: html.replace('>224.7<', '>300.0<') };
    const resolved = resolveExternalAnchor(tampered);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) throw new Error('unreachable');
    expect(resolved.reason).toMatch(/odcisk|digest/i);
    expect(() => buildAnchoredReferenceRun(tampered)).toThrow(/odcisk|digest/i);
  });

  it('pełny cykl: realna predykcja Keplera zgadza się z realnym, niezależnie zmierzonym okresem Wenus (SUPPORTED)', () => {
    const result = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.verification.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    // 224.7 dni / 365.25 dnia — obserwacja jest CZYTANA, nie liczona.
    expect(result.verification.observedValue).toBeCloseTo(224.7 / 365.25, 9);
    // Kepler III z a=108.2e6 km / AU i M=1 M☉ — realna wartość, nie zaokrąglona ręcznie.
    expect(result.verification.predictedValue).toBeCloseTo(0.615109979562335, 9);
    expect(result.criterion.tolerance).toBeGreaterThan(0);
    expect(result.observationOrigin).toBe('REFERENCE');
  });

  it('FALSYFIKACJA JEST REALNA dla drugiej kotwicy też — zła predykcja zostaje odrzucona', () => {
    const falsified = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID, { predictedValueOverride: 5.0 });
    expect(falsified.ok).toBe(true);
    if (!falsified.ok) throw new Error('unreachable');
    expect(falsified.verification.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('REPLAY MATCH — ten sam payload i ta sama predykcja dają ten sam odcisk', () => {
    const first = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID);
    const second = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('unreachable');
    expect(second.verificationFingerprint).toBe(first.verificationFingerprint);
    expect(second.replay).toBe('MATCH');
    const drifted = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID, { predictedValueOverride: 0.7 });
    expect(drifted.ok).toBe(true);
    if (!drifted.ok) throw new Error('unreachable');
    expect(drifted.verificationFingerprint).not.toBe(first.verificationFingerprint);
  });

  it('Tautology Gate klasyfikuje tę kotwicę jako EMPIRICAL_TEST — predykcja i obserwacja to różne kanały', () => {
    const result = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.tautologyAssessment).not.toBeNull();
    expect(result.tautologyAssessment!.classification).toBe('EMPIRICAL_TEST');
  });

  it('pierwsza (chemiczna) kotwica NADAL zwraca tautologyAssessment: null — pole jest addytywne, nie zmienia starego zachowania', () => {
    const result = runExternalAnchor(MOLECULAR_WEIGHT_ANCHOR_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.tautologyAssessment).toBeNull();
  });

  it('rewizja przekonania: SUPPORTED podnosi pewność z neutralnego priora; FALSIFIED ją obniża', () => {
    const supported = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID);
    expect(supported.ok).toBe(true);
    if (!supported.ok) throw new Error('unreachable');
    expect(supported.belief.before).toBe(0.5);
    expect(supported.belief.after).toBeGreaterThan(supported.belief.before);
    expect(supported.belief.status).toBe('SUPPORTED_WITHIN_PROTOCOL');

    const falsified = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID, { predictedValueOverride: 5.0 });
    expect(falsified.ok).toBe(true);
    if (!falsified.ok) throw new Error('unreachable');
    expect(falsified.belief.before).toBe(0.5);
    expect(falsified.belief.after).toBeLessThan(falsified.belief.before);
    expect(falsified.belief.status).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('proponuje realne, konkretne następne pytanie — inne dla SUPPORTED niż dla FALSIFIED', () => {
    const supported = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID);
    const falsified = runExternalAnchor(KEPLER_VENUS_ANCHOR_ID, { predictedValueOverride: 5.0 });
    expect(supported.ok && falsified.ok).toBe(true);
    if (!supported.ok || !falsified.ok) throw new Error('unreachable');
    expect(supported.nextQuestion.length).toBeGreaterThan(20);
    expect(falsified.nextQuestion.length).toBeGreaterThan(20);
    expect(supported.nextQuestion).not.toBe(falsified.nextQuestion);
  });
});
