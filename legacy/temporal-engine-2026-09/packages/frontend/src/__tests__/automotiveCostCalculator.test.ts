import { describe, expect, it } from 'vitest';
import { computeEstimateTotals, computeLineItemTotal, lineItemFingerprint } from '../core/automotive/costCalculator';
import { notAvailable, sourced, type EstimateLineItem } from '../core/automotive/types';

/**
 * COST CALCULATION — real arithmetic, fail-closed on missing prices/rates.
 * Test matrix items A (domain validation via types), C (cost calculation),
 * D (missing price -> NOT_AVAILABLE), E (missing labor rate -> NOT_AVAILABLE),
 * N/A determinism (fingerprint).
 */

function baseItem(overrides: Partial<Pick<EstimateLineItem, 'quantity' | 'unitPrice' | 'laborHours' | 'laborRate' | 'paintMaterials'>> = {}) {
  return {
    quantity: 1,
    unitPrice: sourced('TEST_FIXTURE' as const, 100),
    laborHours: notAvailable<number>(),
    laborRate: notAvailable<number>(),
    paintMaterials: notAvailable<number>(),
    ...overrides,
  };
}

describe('C — obliczenia kosztowe', () => {
  it('liczy quantity x unitPrice, gdy nie ma pracy ani materiałów', () => {
    const total = computeLineItemTotal(baseItem({ quantity: 3, unitPrice: sourced('TEST_FIXTURE', 50) }));
    expect(total).toEqual({ status: 'TEST_FIXTURE', value: 150 });
  });

  it('dodaje pracę i materiały, gdy są dostępne', () => {
    const total = computeLineItemTotal(baseItem({
      unitPrice: sourced('USER_SUPPLIED', 400), laborHours: sourced('USER_SUPPLIED', 2), laborRate: sourced('USER_SUPPLIED', 60), paintMaterials: sourced('USER_SUPPLIED', 80),
    }));
    expect(total).toEqual({ status: 'USER_SUPPLIED', value: 400 + 120 + 80 });
  });

  it('status wyniku to NAJSŁABSZY status spośród składników, które faktycznie weszły do sumy', () => {
    const total = computeLineItemTotal(baseItem({
      unitPrice: sourced('ACTUAL_SOURCE', 100), laborHours: sourced('ACTUAL_SOURCE', 1), laborRate: sourced('TEST_FIXTURE', 60),
    }));
    expect(total.status).toBe('TEST_FIXTURE');
  });
});

describe('D — brakująca cena daje NOT_AVAILABLE, nigdy 0', () => {
  it('brak ceny jednostkowej blokuje całą linię', () => {
    const total = computeLineItemTotal(baseItem({ unitPrice: notAvailable() }));
    expect(total).toEqual({ status: 'NOT_AVAILABLE', value: null });
  });

  it('€1200 USER_SUPPLIED i NOT_AVAILABLE nie są ze sobą mylone', () => {
    const priced = computeLineItemTotal(baseItem({ unitPrice: sourced('USER_SUPPLIED', 1200) }));
    const unpriced = computeLineItemTotal(baseItem({ unitPrice: notAvailable() }));
    expect(priced.value).toBe(1200);
    expect(unpriced.value).toBeNull();
    expect(priced.status).not.toBe(unpriced.status);
  });
});

describe('E — brak stawki roboczej daje NOT_AVAILABLE', () => {
  it('zadeklarowane godziny pracy bez stawki blokują linię', () => {
    const total = computeLineItemTotal(baseItem({ laborHours: sourced('TEST_FIXTURE', 2), laborRate: notAvailable() }));
    expect(total).toEqual({ status: 'NOT_AVAILABLE', value: null });
  });

  it('stawka bez godzin też blokuje linię (niespójne dane wejściowe)', () => {
    const total = computeLineItemTotal(baseItem({ laborHours: notAvailable(), laborRate: sourced('TEST_FIXTURE', 60) }));
    expect(total).toEqual({ status: 'NOT_AVAILABLE', value: null });
  });

  it('zerowe godziny pracy nie wymagają stawki', () => {
    const total = computeLineItemTotal(baseItem({ laborHours: sourced('TEST_FIXTURE', 0), laborRate: notAvailable() }));
    expect(total.status).not.toBe('NOT_AVAILABLE');
  });
});

describe('Sumy całego kosztorysu — fail-closed na poziomie estymatu', () => {
  const priced = (id: string, price: number): EstimateLineItem => ({
    lineItemId: id, description: id, quantity: 1, unitPrice: sourced('TEST_FIXTURE', price),
    laborHours: notAvailable(), laborRate: notAvailable(), paintMaterials: notAvailable(),
    currency: 'EUR', total: computeLineItemTotal(baseItem({ unitPrice: sourced('TEST_FIXTURE', price) })), source: 'TEST_FIXTURE',
  });

  it('sumuje podatek na w pełni wycenionym kosztorysie', () => {
    const items = [priced('a', 100), priced('b', 200)];
    const totals = computeEstimateTotals(items, sourced('TEST_FIXTURE', 0.2));
    expect(totals.subtotal.value).toBe(300);
    expect(totals.tax.value).toBe(60);
    expect(totals.total.value).toBe(360);
    expect(totals.uncostedLineItemIds).toEqual([]);
  });

  it('jedna niewyceniona linia blokuje CAŁY subtotal i total, nie tylko tę linię', () => {
    const items = [priced('a', 100), { ...priced('b', 0), unitPrice: notAvailable<number>(), total: notAvailable<number>() }];
    const totals = computeEstimateTotals(items, sourced('TEST_FIXTURE', 0.2));
    expect(totals.subtotal.status).toBe('NOT_AVAILABLE');
    expect(totals.total.status).toBe('NOT_AVAILABLE');
    expect(totals.uncostedLineItemIds).toEqual(['b']);
  });

  it('brak stawki VAT blokuje total, ale nie subtotal', () => {
    const items = [priced('a', 100)];
    const totals = computeEstimateTotals(items, notAvailable());
    expect(totals.subtotal.value).toBe(100);
    expect(totals.total.status).toBe('NOT_AVAILABLE');
  });
});

describe('Determinizm', () => {
  it('ten sam wejściowy line item daje identyczny fingerprint', () => {
    const item: EstimateLineItem = {
      lineItemId: 'x', description: 'Test', quantity: 1, unitPrice: sourced('TEST_FIXTURE', 100),
      laborHours: notAvailable(), laborRate: notAvailable(), paintMaterials: notAvailable(),
      currency: 'EUR', total: computeLineItemTotal(baseItem()), source: 'TEST_FIXTURE',
    };
    expect(lineItemFingerprint(item)).toBe(lineItemFingerprint({ ...item }));
  });
});
