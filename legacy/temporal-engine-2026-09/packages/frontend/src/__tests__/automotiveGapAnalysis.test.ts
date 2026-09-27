import { describe, expect, it } from 'vitest';
import { computeLineItemTotal } from '../core/automotive/costCalculator';
import { analyzeGaps } from '../core/automotive/gapAnalysis';
import { notAvailable, sourced, type EstimateLineItem, type InsurerEstimate, type VehicleConfiguration } from '../core/automotive/types';

/**
 * GAP ANALYSIS — test matrix items F (insurer line-item model), G (line-item
 * comparison), H (configuration mismatch), I (REQUIRES_INSPECTION).
 */

function line(overrides: Partial<EstimateLineItem> & Pick<EstimateLineItem, 'lineItemId' | 'description'>): EstimateLineItem {
  const base: EstimateLineItem = {
    quantity: 1, unitPrice: sourced('TEST_FIXTURE', 100), laborHours: notAvailable(), laborRate: notAvailable(),
    paintMaterials: notAvailable(), currency: 'EUR', total: notAvailable(), source: 'TEST_FIXTURE', ...overrides,
  };
  return { ...base, total: computeLineItemTotal(base) };
}

const NO_CONFIG: VehicleConfiguration = { trim: notAvailable(), equipment: {} };

function insurerWith(lineItems: readonly EstimateLineItem[]): InsurerEstimate {
  return { estimateId: 'ins', source: 'TEST_FIXTURE', currency: 'EUR', lineItems, total: notAvailable(), sourceHash: 'fp' };
}

describe('G — porównanie linii: cena, ilość, praca, materiały', () => {
  it('materialnie niższa cena ubezpieczyciela daje POTENTIAL_UNDERESTIMATION', () => {
    const reference = [line({ lineItemId: 'a', description: 'Part A', partId: 'part-a', unitPrice: sourced('TEST_FIXTURE', 200) })];
    const insurer = insurerWith([line({ lineItemId: 'a-ins', description: 'Part A', partId: 'part-a', unitPrice: sourced('TEST_FIXTURE', 150) })]);
    const gaps = analyzeGaps(reference, insurer, NO_CONFIG, []);

    expect(gaps.some((g) => g.category === 'PRICE_DIFFERENCE' && g.label === 'POTENTIAL_UNDERESTIMATION')).toBe(true);
  });

  it('cena w granicach 1% nie generuje gapu (szum zaokrągleń)', () => {
    const reference = [line({ lineItemId: 'a', description: 'Part A', partId: 'part-a', unitPrice: sourced('TEST_FIXTURE', 200) })];
    const insurer = insurerWith([line({ lineItemId: 'a-ins', description: 'Part A', partId: 'part-a', unitPrice: sourced('TEST_FIXTURE', 199.5) })]);
    expect(analyzeGaps(reference, insurer, NO_CONFIG, [])).toEqual([]);
  });

  it('różnica ilości jest wykrywana niezależnie od kierunku', () => {
    const reference = [line({ lineItemId: 'a', description: 'Part A', partId: 'part-a', quantity: 2 })];
    const insurer = insurerWith([line({ lineItemId: 'a-ins', description: 'Part A', partId: 'part-a', quantity: 1 })]);
    expect(analyzeGaps(reference, insurer, NO_CONFIG, []).some((g) => g.category === 'QUANTITY_DIFFERENCE')).toBe(true);
  });

  it('mniejsza liczba godzin pracy u ubezpieczyciela daje LABOR_HOURS_DIFFERENCE', () => {
    const reference = [line({ lineItemId: 'a', description: 'Part A', partId: 'part-a', laborHours: sourced('TEST_FIXTURE', 3), laborRate: sourced('TEST_FIXTURE', 60) })];
    const insurer = insurerWith([line({ lineItemId: 'a-ins', description: 'Part A', partId: 'part-a', laborHours: sourced('TEST_FIXTURE', 1), laborRate: sourced('TEST_FIXTURE', 60) })]);
    expect(analyzeGaps(reference, insurer, NO_CONFIG, []).some((g) => g.category === 'LABOR_HOURS_DIFFERENCE' && g.label === 'POTENTIAL_UNDERESTIMATION')).toBe(true);
  });
});

describe('F — brak odpowiadającej linii u ubezpieczyciela', () => {
  it('linia referencyjna bez dopasowania daje MISSING_ITEM/POTENTIAL_OMISSION', () => {
    const reference = [line({ lineItemId: 'a', description: 'Only in reference', partId: 'part-a' })];
    const gaps = analyzeGaps(reference, insurerWith([]), NO_CONFIG, []);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ category: 'MISSING_ITEM', label: 'POTENTIAL_OMISSION' });
  });

  it('linia referencyjna bez źródła (NOT_AVAILABLE) jest REQUIRES_INSPECTION, nie pewnym zarzutem', () => {
    const reference = [line({ lineItemId: 'a', description: 'Unclear', partId: 'part-a', source: 'NOT_AVAILABLE' })];
    const gaps = analyzeGaps(reference, insurerWith([]), NO_CONFIG, []);
    expect(gaps[0]!.evidenceStatus).toBe('REQUIRES_INSPECTION');
  });
});

describe('H — niezgodność konfiguracji (przypadek AMG/pakiet)', () => {
  it('linia ubezpieczyciela zakładająca zły stan wyposażenia daje CONFIGURATION_MISMATCH', () => {
    const configuration: VehicleConfiguration = { trim: notAvailable(), equipment: { 'performance-package': sourced('TEST_FIXTURE', 'PRESENT') } };
    const insurerLine = line({
      lineItemId: 'standard-bumper', description: 'Standard bumper', partId: 'bumper-standard',
      equipmentDependency: { equipmentKey: 'performance-package', expectedPresence: 'ABSENT' },
    });
    const gaps = analyzeGaps([], insurerWith([insurerLine]), configuration, []);

    expect(gaps.some((g) => g.category === 'VEHICLE_CONFIGURATION_MISMATCH' && g.label === 'CONFIGURATION_MISMATCH')).toBe(true);
  });

  it('gdy konfiguracja jest NOT_AVAILABLE, wynik jest REQUIRES_INSPECTION, nie zgadniętym dopasowaniem', () => {
    const insurerLine = line({
      lineItemId: 'standard-bumper', description: 'Standard bumper', partId: 'bumper-standard',
      equipmentDependency: { equipmentKey: 'performance-package', expectedPresence: 'ABSENT' },
    });
    const gaps = analyzeGaps([], insurerWith([insurerLine]), NO_CONFIG, []);
    expect(gaps[0]).toMatchObject({ category: 'VEHICLE_CONFIGURATION_MISMATCH', label: 'REQUIRES_INSPECTION' });
  });

  it('zgodna konfiguracja nie generuje gapu', () => {
    const configuration: VehicleConfiguration = { trim: notAvailable(), equipment: { 'performance-package': sourced('TEST_FIXTURE', 'PRESENT') } };
    const insurerLine = line({
      lineItemId: 'performance-bumper', description: 'Performance bumper', partId: 'bumper-performance',
      equipmentDependency: { equipmentKey: 'performance-package', expectedPresence: 'PRESENT' },
    });
    expect(analyzeGaps([], insurerWith([insurerLine]), configuration, [])).toEqual([]);
  });
});

describe('I — znaleziska wymagające inspekcji, jeszcze nie wycenione', () => {
  it('POSSIBLE/REQUIRES_INSPECTION znalezisko bez wycenionej linii referencyjnej daje gap REQUIRES_INSPECTION', () => {
    const gaps = analyzeGaps([], insurerWith([]), NO_CONFIG, [
      { findingId: 'f1', partId: 'hidden-part', photoIds: [], status: 'REQUIRES_INSPECTION', severity: 'NOT_AVAILABLE', source: 'TEST_FIXTURE' },
    ]);
    expect(gaps.some((g) => g.category === 'REQUIRES_INSPECTION' && g.relatedPartId === 'hidden-part')).toBe(true);
  });

  it('CONFIRMED znalezisko nie wymaga osobnego gapu (nie jest niepewne)', () => {
    const gaps = analyzeGaps([], insurerWith([]), NO_CONFIG, [
      { findingId: 'f1', partId: 'confirmed-part', photoIds: [], status: 'CONFIRMED', severity: 'MINOR', source: 'TEST_FIXTURE' },
    ]);
    expect(gaps).toEqual([]);
  });

  it('znalezisko z już wycenioną linią referencyjną nie generuje uncosted-gap', () => {
    const reference = [line({ lineItemId: 'r1', description: 'Hidden part', partId: 'hidden-part' })];
    const gaps = analyzeGaps(reference, insurerWith([]), NO_CONFIG, [
      { findingId: 'f1', partId: 'hidden-part', photoIds: [], status: 'POSSIBLE', severity: 'MINOR', source: 'TEST_FIXTURE' },
    ]);
    expect(gaps.filter((g) => g.relatedPartId === 'hidden-part' && g.category === 'REQUIRES_INSPECTION')).toEqual([]);
  });
});
