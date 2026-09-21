import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_ANCHORS,
  anchorPayloadDigest,
  resolveExternalAnchor,
  buildAnchoredReferenceRun,
  runExternalAnchor,
  MOLECULAR_WEIGHT_ANCHOR_ID,
  KEPLER_MARS_ANCHOR_ID,
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
 * BELIEF REVISION + NEXT QUESTION (C1, P2.3 follow-up) — the two pieces of the
 * PROBLEM -> ... -> NEXT QUESTION loop that were still missing after the
 * Kepler/Mars anchor (`keplerExternalAnchor.test.ts`, built concurrently by
 * another session) closed the "second external anchor" gap. Added here,
 * generically, for EVERY declared anchor rather than a competing third
 * anchor — the DoD asks for a belief that actually moves and a next question
 * that is actually proposed, not for a duplicate Kepler observation.
 */
describe('rewizja przekonania i next question — dla każdej zadeklarowanej kotwicy', () => {
  it('SUPPORTED podnosi pewność z neutralnego priora 0.5; FALSIFIED ją obniża', () => {
    for (const anchor of EXTERNAL_ANCHORS) {
      const supported = runExternalAnchor(anchor.id);
      expect(supported.ok).toBe(true);
      if (!supported.ok) throw new Error('unreachable');
      expect(supported.belief.before).toBe(0.5);
      if (supported.verification.assessment === 'SUPPORTED_WITHIN_PROTOCOL') {
        expect(supported.belief.after).toBeGreaterThan(supported.belief.before);
      }

      const falsified = runExternalAnchor(anchor.id, { predictedValueOverride: -1e9 });
      expect(falsified.ok).toBe(true);
      if (!falsified.ok) throw new Error('unreachable');
      expect(falsified.verification.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
      expect(falsified.belief.after).toBeLessThan(falsified.belief.before);
      expect(falsified.belief.status).toBe('FALSIFIED_WITHIN_PROTOCOL');
    }
  });

  it('proponuje realne, konkretne następne pytanie — inne dla SUPPORTED niż dla FALSIFIED', () => {
    for (const anchor of EXTERNAL_ANCHORS) {
      const supported = runExternalAnchor(anchor.id);
      const falsified = runExternalAnchor(anchor.id, { predictedValueOverride: -1e9 });
      expect(supported.ok && falsified.ok).toBe(true);
      if (!supported.ok || !falsified.ok) throw new Error('unreachable');
      expect(supported.nextQuestion.length).toBeGreaterThan(20);
      expect(falsified.nextQuestion.length).toBeGreaterThan(20);
      expect(supported.nextQuestion).not.toBe(falsified.nextQuestion);
    }
  });

  it('ruch przekonania jest ograniczony sufitem Tautology Gate (evidenceCeiling)', () => {
    // Obie zadeklarowane kotwice mają EMPIRICAL_TEST (sufit null = brak ograniczenia),
    // więc to jest test na to, że sufit jest w ogóle STOSOWANY, nie martwym polem.
    const marsResult = runExternalAnchor(KEPLER_MARS_ANCHOR_ID);
    expect(marsResult.ok).toBe(true);
    if (!marsResult.ok) throw new Error('unreachable');
    expect(marsResult.tautologyAssessment.classification).toBe('EMPIRICAL_TEST');
    expect(marsResult.belief.after).not.toBe(marsResult.belief.before);
  });
});
