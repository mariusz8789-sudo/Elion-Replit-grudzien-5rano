import { canonicalJson, fnv1a } from '../events/hash';
import type { DamageFinding, EstimateLineItem, GapFinding, InsurerEstimate, VehicleConfiguration } from './types';

/**
 * GAP ANALYSIS — THE KEY PRODUCT FEATURE.
 *
 * A deterministic comparator between an insurer's estimate and Genesis's own
 * reference line items. It never labels anything "fraud" or "incorrect" —
 * only evidence-scoped labels (`POTENTIAL_UNDERESTIMATION`,
 * `POTENTIAL_OMISSION`, `CONFIGURATION_MISMATCH`, `REQUIRES_INSPECTION`,
 * `NOT_COMPARABLE`). It fails closed: wherever either side is
 * `NOT_AVAILABLE`, the finding is `NOT_COMPARABLE`/`REQUIRES_INSPECTION`,
 * never a guessed direction.
 */
export const GAP_ANALYSIS_VERSION = '1.0.0';

/** Materially different: relative gap exceeds 1% of the reference value. Small rounding noise is not a gap. */
function materiallyLower(insurer: number, reference: number): boolean {
  if (reference === 0) return insurer < 0;
  return (reference - insurer) / Math.abs(reference) > 0.01;
}
function materiallyDifferent(a: number, b: number): boolean {
  const base = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / base > 0.01;
}

function gapId(kind: string, ...parts: readonly string[]): string {
  return `gap_${fnv1a(canonicalJson({ kind, parts }))}`;
}

function findMatch(referenceItem: EstimateLineItem, insurerItems: readonly EstimateLineItem[]): EstimateLineItem | undefined {
  if (referenceItem.partId !== undefined) {
    const byPart = insurerItems.find((entry) => entry.partId === referenceItem.partId);
    if (byPart !== undefined) return byPart;
  }
  return insurerItems.find((entry) => entry.description.trim().toLocaleLowerCase('en-US') === referenceItem.description.trim().toLocaleLowerCase('en-US'));
}

function compareNumericField(
  reference: EstimateLineItem, insurer: EstimateLineItem,
  field: 'quantity' | 'unitPrice' | 'laborHours' | 'laborRate' | 'paintMaterials',
  category: GapFinding['category'],
): GapFinding | null {
  const refField = field === 'quantity' ? { status: 'ACTUAL_SOURCE' as const, value: reference.quantity } : reference[field];
  const insField = field === 'quantity' ? { status: 'ACTUAL_SOURCE' as const, value: insurer.quantity } : insurer[field];

  if (refField.value === null || insField.value === null) {
    // A missing value on either side blocks a directional claim — the whole
    // point of NOT_AVAILABLE is that it must never be read as "0" here.
    if (refField.value === null && insField.value === null) return null;
    return {
      gapId: gapId(category, reference.lineItemId), category, label: 'REQUIRES_INSPECTION',
      detail: `Nie da się porównać pola „${field}” dla „${reference.description}" — jedna strona ma NOT_AVAILABLE.`,
      evidenceStatus: 'REQUIRES_INSPECTION', relatedLineItemId: reference.lineItemId, relatedPartId: reference.partId,
    };
  }
  if (!materiallyDifferent(refField.value, insField.value)) return null;
  const label = insField.value < refField.value ? 'POTENTIAL_UNDERESTIMATION' : 'NOT_COMPARABLE';
  if (label === 'NOT_COMPARABLE' && field !== 'quantity') return null; // insurer value higher than reference is not an audit concern for price/labor/materials
  return {
    gapId: gapId(category, reference.lineItemId), category, label,
    detail: `„${field}" dla „${reference.description}": ubezpieczyciel=${insField.value}, Genesis=${refField.value}.`,
    evidenceStatus: 'CONFIRMED', relatedLineItemId: reference.lineItemId, relatedPartId: reference.partId,
  };
}

/**
 * Checks the INSURER's chosen line items against the vehicle's actual
 * configuration — a line that assumes the wrong equipment state (e.g. a
 * "standard bumper" priced against a vehicle whose performance package is
 * PRESENT) is the audit signal, not whether Genesis's own reference matches.
 */
function configurationMismatchGaps(configuration: VehicleConfiguration, lineItems: readonly EstimateLineItem[]): GapFinding[] {
  const gaps: GapFinding[] = [];
  for (const item of lineItems) {
    const dependency = item.equipmentDependency;
    if (dependency === undefined) continue;
    const flag = configuration.equipment[dependency.equipmentKey];
    if (flag === undefined || flag.status === 'NOT_AVAILABLE' || flag.value === null) {
      gaps.push({
        gapId: gapId('CONFIG_UNKNOWN', item.lineItemId, dependency.equipmentKey), category: 'VEHICLE_CONFIGURATION_MISMATCH', label: 'REQUIRES_INSPECTION',
        detail: `Linia „${item.description}" zakłada „${dependency.equipmentKey}" = ${dependency.expectedPresence}, ale konfiguracja pojazdu jest NOT_AVAILABLE.`,
        evidenceStatus: 'REQUIRES_INSPECTION', relatedLineItemId: item.lineItemId, relatedPartId: item.partId,
      });
      continue;
    }
    if (flag.value !== dependency.expectedPresence) {
      gaps.push({
        gapId: gapId('CONFIG_MISMATCH', item.lineItemId, dependency.equipmentKey), category: 'VEHICLE_CONFIGURATION_MISMATCH', label: 'CONFIGURATION_MISMATCH',
        detail: `Linia „${item.description}" zakłada „${dependency.equipmentKey}" = ${dependency.expectedPresence}, a konfiguracja pojazdu (${flag.status}) to ${flag.value}.`,
        evidenceStatus: 'CONFIRMED', relatedLineItemId: item.lineItemId, relatedPartId: item.partId,
      });
    }
  }
  return gaps;
}

/** Hidden-damage findings not yet represented by any priced reference line — surfaced, not silently dropped. */
function uncostedFindingGaps(findings: readonly DamageFinding[], referenceLineItems: readonly EstimateLineItem[]): GapFinding[] {
  // A line item that EXISTS but is itself NOT_AVAILABLE-priced does not count as "priced" —
  // otherwise a hidden-damage flag would look "handled" just because a placeholder line exists.
  const pricedPartIds = new Set(referenceLineItems.filter((item) => item.total.status !== 'NOT_AVAILABLE').map((item) => item.partId).filter((id): id is string => id !== undefined));
  return findings
    .filter((finding) => (finding.status === 'POSSIBLE' || finding.status === 'REQUIRES_INSPECTION') && !pricedPartIds.has(finding.partId))
    .map((finding) => ({
      gapId: gapId('UNCOSTED_FINDING', finding.findingId),
      category: 'REQUIRES_INSPECTION' as const, label: 'REQUIRES_INSPECTION' as const,
      detail: `Znalezisko „${finding.partId}" (${finding.status}) nie ma jeszcze wycenionej linii referencyjnej — wymaga inspekcji przed porównaniem.`,
      evidenceStatus: 'REQUIRES_INSPECTION' as const, relatedPartId: finding.partId,
    }));
}

/**
 * Compares an insurer estimate against Genesis's own reference line items.
 * Caller must have already established `insurerEstimate !== null` — this
 * function only performs the comparison, it does not decide comparability
 * at the whole-assessment level (that's `auditResult.ts`'s job).
 */
export function analyzeGaps(
  referenceLineItems: readonly EstimateLineItem[],
  insurerEstimate: InsurerEstimate,
  configuration: VehicleConfiguration,
  findings: readonly DamageFinding[],
): readonly GapFinding[] {
  const gaps: GapFinding[] = [];

  for (const referenceItem of referenceLineItems) {
    const matched = findMatch(referenceItem, insurerEstimate.lineItems);
    if (matched === undefined) {
      gaps.push({
        gapId: gapId('MISSING_ITEM', referenceItem.lineItemId), category: 'MISSING_ITEM', label: 'POTENTIAL_OMISSION',
        detail: `„${referenceItem.description}" jest w referencji Genesis, ale nie występuje w kosztorysie ubezpieczyciela.`,
        evidenceStatus: referenceItem.source === 'NOT_AVAILABLE' ? 'REQUIRES_INSPECTION' : 'CONFIRMED',
        relatedLineItemId: referenceItem.lineItemId, relatedPartId: referenceItem.partId,
      });
      continue;
    }
    const quantityGap = compareNumericField(referenceItem, matched, 'quantity', 'QUANTITY_DIFFERENCE');
    if (quantityGap) gaps.push(quantityGap);
    const priceGap = compareNumericField(referenceItem, matched, 'unitPrice', 'PRICE_DIFFERENCE');
    if (priceGap) gaps.push(priceGap);
    const laborHoursGap = compareNumericField(referenceItem, matched, 'laborHours', 'LABOR_HOURS_DIFFERENCE');
    if (laborHoursGap) gaps.push(laborHoursGap);
    const laborRateGap = compareNumericField(referenceItem, matched, 'laborRate', 'LABOR_RATE_DIFFERENCE');
    if (laborRateGap) gaps.push(laborRateGap);
    const paintGap = compareNumericField(referenceItem, matched, 'paintMaterials', 'PAINT_MATERIAL_DIFFERENCE');
    if (paintGap) gaps.push(paintGap);

    if (referenceItem.total.value !== null && matched.total.value !== null && materiallyLower(matched.total.value, referenceItem.total.value)
      && !gaps.some((g) => g.relatedLineItemId === referenceItem.lineItemId && g.category === 'PRICE_DIFFERENCE')) {
      gaps.push({
        gapId: gapId('LINE_TOTAL_UNDER', referenceItem.lineItemId), category: 'PRICE_DIFFERENCE', label: 'POTENTIAL_UNDERESTIMATION',
        detail: `Suma linii „${referenceItem.description}": ubezpieczyciel=${matched.total.value}, Genesis=${referenceItem.total.value}.`,
        evidenceStatus: 'CONFIRMED', relatedLineItemId: referenceItem.lineItemId, relatedPartId: referenceItem.partId,
      });
    }
  }

  gaps.push(...configurationMismatchGaps(configuration, insurerEstimate.lineItems));
  gaps.push(...uncostedFindingGaps(findings, referenceLineItems));
  return gaps;
}
