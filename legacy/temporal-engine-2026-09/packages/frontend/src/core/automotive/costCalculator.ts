import { canonicalJson, fnv1a } from '../events/hash';
import { notAvailable, sourced, type EstimateLineItem, type SourcedValue, type SourceStatus } from './types';

/**
 * AUTOMOTIVE COST CALCULATION — THE ONE PART OF THIS SPIKE THAT IS REAL
 * ARITHMETIC, not a placeholder.
 *
 * `quantity × unit price + labor hours × labor rate + paint/materials`,
 * then `subtotal × (1 + tax rate)`. Every input is a `SourcedValue`, and the
 * calculator refuses to fabricate a total from a missing price: if any
 * component a line actually declares (non-zero labor, a paint/materials
 * figure) is `NOT_AVAILABLE`, the line's `total` is `NOT_AVAILABLE` too —
 * never silently substituted with 0. A `€1200 USER_SUPPLIED` total and a
 * `NOT_AVAILABLE` total are never conflated.
 */
export const COST_CALCULATOR_VERSION = '1.0.0';

const SOURCE_WEAKNESS: Record<Exclude<SourceStatus, 'NOT_AVAILABLE'>, number> = {
  ACTUAL_SOURCE: 0,
  USER_SUPPLIED: 1,
  TEST_FIXTURE: 2,
};

/** The weakest (least authoritative) status among the components that actually contributed to a computed value. */
function weakestStatus(statuses: readonly Exclude<SourceStatus, 'NOT_AVAILABLE'>[]): Exclude<SourceStatus, 'NOT_AVAILABLE'> {
  return statuses.reduce((worst, status) => (SOURCE_WEAKNESS[status] > SOURCE_WEAKNESS[worst] ? status : worst), 'ACTUAL_SOURCE' as const);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes one line's total. Fails closed: any declared-but-unpriced
 * component makes the whole line `NOT_AVAILABLE`, never a partial guess.
 */
export function computeLineItemTotal(item: Pick<EstimateLineItem, 'quantity' | 'unitPrice' | 'laborHours' | 'laborRate' | 'paintMaterials'>): SourcedValue<number> {
  if (item.unitPrice.status === 'NOT_AVAILABLE') return notAvailable();
  const contributingStatuses: Exclude<SourceStatus, 'NOT_AVAILABLE'>[] = [item.unitPrice.status];
  let sum = item.quantity * item.unitPrice.value!;

  const hasLabor = item.laborHours.status !== 'NOT_AVAILABLE' && (item.laborHours.value ?? 0) > 0;
  const laborDeclaredButUnpriced = item.laborHours.status !== 'NOT_AVAILABLE' && (item.laborHours.value ?? 0) > 0 && item.laborRate.status === 'NOT_AVAILABLE';
  const laborHoursMissingButRateGiven = item.laborHours.status === 'NOT_AVAILABLE' && item.laborRate.status !== 'NOT_AVAILABLE';
  if (laborDeclaredButUnpriced || laborHoursMissingButRateGiven) return notAvailable();
  if (hasLabor) {
    sum += item.laborHours.value! * item.laborRate.value!;
    contributingStatuses.push(item.laborHours.status as Exclude<SourceStatus, 'NOT_AVAILABLE'>, item.laborRate.status as Exclude<SourceStatus, 'NOT_AVAILABLE'>);
  }

  if (item.paintMaterials.status === 'NOT_AVAILABLE') {
    // Materials genuinely absent from this line (not "unpriced") — nothing to add, nothing to block on.
  } else {
    sum += item.paintMaterials.value!;
    contributingStatuses.push(item.paintMaterials.status);
  }

  return sourced(weakestStatus(contributingStatuses), round2(sum));
}

export interface EstimateTotals {
  subtotal: SourcedValue<number>;
  tax: SourcedValue<number>;
  total: SourcedValue<number>;
  /** Line items whose total could not be computed — surfaced, never hidden inside a partial subtotal. */
  uncostedLineItemIds: readonly string[];
}

/**
 * Sums line totals into a subtotal, then applies tax. `subtotal` (and
 * therefore `total`) is `NOT_AVAILABLE` the moment ANY line total is
 * `NOT_AVAILABLE` — a subtotal that silently dropped an unpriced line would
 * misrepresent a partial number as a complete one.
 */
export function computeEstimateTotals(lineItems: readonly EstimateLineItem[], taxRate: SourcedValue<number>): EstimateTotals {
  const uncostedLineItemIds = lineItems.filter((item) => item.total.status === 'NOT_AVAILABLE').map((item) => item.lineItemId);
  if (uncostedLineItemIds.length > 0 || lineItems.length === 0) {
    return { subtotal: notAvailable(), tax: notAvailable(), total: notAvailable(), uncostedLineItemIds };
  }
  const statuses = lineItems.map((item) => item.total.status as Exclude<SourceStatus, 'NOT_AVAILABLE'>);
  const subtotalValue = round2(lineItems.reduce((sum, item) => sum + item.total.value!, 0));
  const subtotal = sourced(weakestStatus(statuses), subtotalValue);

  if (taxRate.status === 'NOT_AVAILABLE') {
    return { subtotal, tax: notAvailable(), total: notAvailable(), uncostedLineItemIds: [] };
  }
  const taxRateStatus = taxRate.status;
  const taxAmount = round2(subtotalValue * taxRate.value!);
  const tax = sourced(taxRateStatus, taxAmount);
  const total = sourced(weakestStatus([subtotal.status as Exclude<SourceStatus, 'NOT_AVAILABLE'>, taxRateStatus]), round2(subtotalValue + taxAmount));
  return { subtotal, tax, total, uncostedLineItemIds: [] };
}

/** Deterministic fingerprint of a computed line item — same inputs always produce the same identity. */
export function lineItemFingerprint(item: EstimateLineItem): string {
  return fnv1a(canonicalJson({
    v: COST_CALCULATOR_VERSION, lineItemId: item.lineItemId, description: item.description, partId: item.partId ?? null,
    quantity: item.quantity, unitPrice: item.unitPrice, laborHours: item.laborHours, laborRate: item.laborRate,
    paintMaterials: item.paintMaterials, currency: item.currency, total: item.total, source: item.source,
  }));
}
