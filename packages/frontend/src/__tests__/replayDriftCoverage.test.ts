import { describe, expect, it } from 'vitest';
import { runDiscoveryCase } from '../core/discovery/discoveryEngine';
import { replayDiscoveryCase } from '../core/discovery/discoveryReplay';
import type { DiscoveryCase, DiscoveryCaseSpec } from '../core/discovery/discoveryCase';

/**
 * REGRESJA — replay musi porównywać dokładnie to, do czego zobowiązuje się
 * `resultFingerprint` przebiegu, i musi pokazywać, CO się rozjechało.
 *
 * Dwa realne defekty, które cały zestaw testów przepuszczał na zielono:
 *
 *  1. Porównanie dnia obejmowało wyłącznie S/E/I/R/D, mimo że odcisk obejmuje
 *     także warstwę szpitalną. Rozjazd wyłącznie szpitalny nie produkował
 *     żadnej „substantive" różnicy, a różnica odcisku jest z werdyktu
 *     wyłączona — więc replay ogłaszał WITHIN_TOLERANCE i komunikat „każda
 *     metryka mieści się w tolerancji 0" dla przebiegu, który realnie się
 *     różnił. To fałszywa zieloność, nie kosmetyka.
 *
 *  2. Różnica `firstDifferingDay` miała `expected === actual`, więc komunikat
 *     DRIFT brzmiał „firstDifferingDay (11 → 11)". Moduł deklaruje w swojej
 *     własnej dokumentacji, że „rozjazd musi pokazać, CO się różni — inaczej
 *     DRIFT byłby tylko etykietą". Był tylko etykietą.
 */

const conditions = { nAgents: 160, initialInfected: 5, seed: 777, days: 40, stepsPerDay: 4 };

const spec = (over: Partial<DiscoveryCaseSpec> = {}): DiscoveryCaseSpec => ({
  question: 'Czy izolacja objawowych obniża szczyt zakażeń?',
  hypothesis: {
    statement: 'Izolacja objawowych obniża szczytową liczbę zakaźnych.',
    falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: 'Izolacja usuwa zakaźnych z obiegu kontaktów.' },
    assumptions: ['Wykrywalność objawowych jest natychmiastowa.'],
  },
  baselineScenario: 'BASELINE',
  variantScenario: 'ISOLATION',
  initialConditions: conditions,
  ...over,
});

/** Podmienia jeden dzień w zapisanym przebiegu pierwszego ramienia. */
function tamperDay(record: DiscoveryCase, index: number, patch: (day: DiscoveryCase['arms'][number]['run']['series'][number]) => DiscoveryCase['arms'][number]['run']['series'][number]): DiscoveryCase {
  const series = [...record.arms[0].run.series];
  series[index] = patch(series[index]);
  return { ...record, arms: [{ ...record.arms[0], run: { ...record.arms[0].run, series, resultFingerprint: 'tampered' } }, record.arms[1]] };
}

describe('Discovery replay — pokrycie rozjazdu', () => {
  it('rozjazd wyłącznie w warstwie szpitalnej to DRIFT, nie WITHIN_TOLERANCE', () => {
    const record = runDiscoveryCase(spec());
    const day = record.arms[0].run.series[10].day;
    const tampered = tamperDay(record, 10, (sample) => ({
      ...sample,
      hospital: { ...sample.hospital, occupiedBeds: sample.hospital.occupiedBeds + 3 },
    }));

    const replay = replayDiscoveryCase(tampered);

    expect(replay.status).toBe('DRIFT');
    expect(replay.message).not.toContain('mieści się w tolerancji');
    const fields = replay.arms[0].differences.map((d) => d.field);
    expect(fields).toContain(`series.day${day}.hospital.occupiedBeds`);
  });

  it('rozjazd w obłożeniu względnym też jest widoczny — odcisk go obejmuje', () => {
    const record = runDiscoveryCase(spec());
    const tampered = tamperDay(record, 12, (sample) => ({
      ...sample,
      hospital: { ...sample.hospital, bedOccupancy: sample.hospital.bedOccupancy + 0.25 },
    }));

    expect(replayDiscoveryCase(tampered).status).toBe('DRIFT');
  });

  it('różnica dnia niesie nazwę pola i OBIE wartości, a nie ten sam dzień dwa razy', () => {
    const record = runDiscoveryCase(spec());
    const before = record.arms[0].run.series[10].infectious;
    const day = record.arms[0].run.series[10].day;
    const tampered = tamperDay(record, 10, (sample) => ({ ...sample, infectious: sample.infectious + 7 }));

    const replay = replayDiscoveryCase(tampered);
    const valued = replay.arms[0].differences.find((d) => d.field === `series.day${day}.infectious`);

    expect(valued).toBeDefined();
    expect(valued!.expected).toBe(before + 7);
    expect(valued!.actual).toBe(before);
    expect(valued!.expected).not.toBe(valued!.actual);
    expect(replay.message).toContain(`${before + 7} → ${before}`);
  });

  it('nietknięta sprawa dalej odtwarza się jako MATCH — szersze porównanie nie produkuje fałszywego DRIFT', () => {
    const record = runDiscoveryCase(spec());
    expect(replayDiscoveryCase(record).status).toBe('MATCH');
  });
});
