import { canonicalJson, fnv1a } from '../events/hash';
import { notAvailable, sourced, type AutomotiveAssessment, type EstimateLineItem } from './types';

/**
 * ONE COHERENT END-TO-END TEST FIXTURE (§17). Every fact below is
 * `TEST_FIXTURE` — a fictional make/model, never a real VIN decode, never a
 * real OEM/aftermarket number, never a real price. It exists to prove the
 * vertical slice (calculation → gap analysis → evidence → RO-Crate →
 * replay) actually runs end to end, not to represent any real vehicle.
 */
export const DEMO_ASSESSMENT_ID = 'assessment_demo_fixture_v1';

function fingerprintRef(label: string): string {
  return fnv1a(canonicalJson({ demo: true, label }));
}

export function buildDemoAutomotiveAssessment(): AutomotiveAssessment {
  const currency = 'EUR';

  const referenceLineItems: EstimateLineItem[] = [
    {
      lineItemId: 'ref-front-bumper', description: 'Front bumper cover — performance package', partId: 'front-bumper-performance',
      quantity: 1, unitPrice: sourced('TEST_FIXTURE', 420), laborHours: sourced('TEST_FIXTURE', 3), laborRate: sourced('TEST_FIXTURE', 60),
      paintMaterials: sourced('TEST_FIXTURE', 90), currency, total: notAvailable(), source: 'TEST_FIXTURE',
    },
    {
      lineItemId: 'ref-headlamp', description: 'Left headlamp assembly', partId: 'headlamp-left',
      quantity: 1, unitPrice: sourced('TEST_FIXTURE', 260), laborHours: sourced('TEST_FIXTURE', 1), laborRate: sourced('TEST_FIXTURE', 60),
      paintMaterials: notAvailable(), currency, total: notAvailable(), source: 'TEST_FIXTURE',
    },
    {
      lineItemId: 'ref-grille', description: 'Front grille', partId: 'grille',
      quantity: 1, unitPrice: sourced('TEST_FIXTURE', 140), laborHours: sourced('TEST_FIXTURE', 0.5), laborRate: sourced('TEST_FIXTURE', 60),
      paintMaterials: notAvailable(), currency, total: notAvailable(), source: 'TEST_FIXTURE',
    },
    {
      // Hidden-damage candidate: not yet priced, deliberately left NOT_AVAILABLE so the
      // uncosted-finding gap and the REQUIRES_INSPECTION overall path both have real coverage.
      lineItemId: 'ref-radar-bracket', description: 'Radar sensor bracket (requires inspection)', partId: 'radar-bracket',
      quantity: 1, unitPrice: notAvailable(), laborHours: notAvailable(), laborRate: notAvailable(),
      paintMaterials: notAvailable(), currency, total: notAvailable(), source: 'NOT_AVAILABLE',
    },
  ];

  const insurerLineItems: EstimateLineItem[] = [
    {
      lineItemId: 'ins-front-bumper', description: 'Front bumper cover — standard', partId: 'front-bumper-standard',
      quantity: 1, unitPrice: sourced('TEST_FIXTURE', 300), laborHours: sourced('TEST_FIXTURE', 2), laborRate: sourced('TEST_FIXTURE', 55),
      paintMaterials: sourced('TEST_FIXTURE', 90), currency, total: notAvailable(), source: 'TEST_FIXTURE',
      equipmentDependency: { equipmentKey: 'performance-package', expectedPresence: 'ABSENT' },
    },
    {
      lineItemId: 'ins-headlamp', description: 'Left headlamp assembly', partId: 'headlamp-left',
      quantity: 1, unitPrice: sourced('TEST_FIXTURE', 260), laborHours: sourced('TEST_FIXTURE', 1), laborRate: sourced('TEST_FIXTURE', 60),
      paintMaterials: notAvailable(), currency, total: notAvailable(), source: 'TEST_FIXTURE',
    },
    // Grille and the radar bracket are absent from the insurer estimate on purpose —
    // grille -> MISSING_ITEM/POTENTIAL_OMISSION; radar bracket -> uncosted-finding gap.
  ];

  return {
    contractVersion: '1.0.0',
    assessmentId: DEMO_ASSESSMENT_ID,
    vehicle: {
      vinStatus: 'CONFIGURATION_NOT_AVAILABLE',
      make: sourced('TEST_FIXTURE', 'Fixture Motors'),
      model: sourced('TEST_FIXTURE', 'Model X Coupe'),
      modelYear: sourced('TEST_FIXTURE', 2022),
    },
    configuration: {
      trim: sourced('TEST_FIXTURE', 'Performance'),
      equipment: { 'performance-package': sourced('TEST_FIXTURE', 'PRESENT') },
    },
    photos: [
      { photoId: 'photo-1', reference: 'demo/front-bumper.jpg', fingerprint: fingerprintRef('front-bumper'), assessmentId: DEMO_ASSESSMENT_ID },
      { photoId: 'photo-2', reference: 'demo/headlamp.jpg', fingerprint: fingerprintRef('headlamp'), assessmentId: DEMO_ASSESSMENT_ID },
      { photoId: 'photo-3', reference: 'demo/grille-wide.jpg', fingerprint: fingerprintRef('grille-wide'), assessmentId: DEMO_ASSESSMENT_ID },
    ],
    findings: [
      { findingId: 'finding-bumper', partId: 'front-bumper-performance', photoIds: ['photo-1'], status: 'CONFIRMED', severity: 'MODERATE', source: 'TEST_FIXTURE', note: 'Visible crease and cracked mounting tab.' },
      { findingId: 'finding-headlamp', partId: 'headlamp-left', photoIds: ['photo-2'], status: 'POSSIBLE', severity: 'MINOR', source: 'TEST_FIXTURE', note: 'Lens edge chip, unclear if it penetrates the housing.' },
      { findingId: 'finding-radar', partId: 'radar-bracket', photoIds: ['photo-3'], status: 'REQUIRES_INSPECTION', severity: 'NOT_AVAILABLE', source: 'TEST_FIXTURE', note: 'Bracket not visible in supplied photos; bumper removal needed to confirm.' },
    ],
    parts: [
      { partId: 'front-bumper-performance', label: 'Front bumper cover (performance)', oemNumber: notAvailable(), aftermarketNumber: notAvailable(), fitmentStatus: 'CONFIRMED' },
      { partId: 'headlamp-left', label: 'Left headlamp assembly', oemNumber: notAvailable(), aftermarketNumber: notAvailable(), fitmentStatus: 'CONFIRMED' },
      { partId: 'grille', label: 'Front grille', oemNumber: notAvailable(), aftermarketNumber: notAvailable(), fitmentStatus: 'POSSIBLE' },
      { partId: 'radar-bracket', label: 'Radar sensor bracket', oemNumber: notAvailable(), aftermarketNumber: notAvailable(), fitmentStatus: 'REQUIRES_INSPECTION' },
    ],
    operations: [
      { operationId: 'op-bumper', partId: 'front-bumper-performance', action: 'REPLACE', laborHours: sourced('TEST_FIXTURE', 3) },
      { operationId: 'op-headlamp', partId: 'headlamp-left', action: 'REPLACE', laborHours: sourced('TEST_FIXTURE', 1) },
      { operationId: 'op-grille', partId: 'grille', action: 'REPLACE', laborHours: sourced('TEST_FIXTURE', 0.5) },
      { operationId: 'op-radar', partId: 'radar-bracket', action: 'REQUIRES_INSPECTION', laborHours: notAvailable() },
    ],
    labor: [
      { operationId: 'op-bumper', hourlyRate: sourced('TEST_FIXTURE', 60), currency, rateSource: 'TEST_FIXTURE' },
      { operationId: 'op-headlamp', hourlyRate: sourced('TEST_FIXTURE', 60), currency, rateSource: 'TEST_FIXTURE' },
      { operationId: 'op-grille', hourlyRate: sourced('TEST_FIXTURE', 60), currency, rateSource: 'TEST_FIXTURE' },
    ],
    prices: [
      { partId: 'front-bumper-performance', unitPrice: sourced('TEST_FIXTURE', 420), currency, priceKind: 'OEM' },
      { partId: 'headlamp-left', unitPrice: sourced('TEST_FIXTURE', 260), currency, priceKind: 'OEM' },
      { partId: 'grille', unitPrice: sourced('TEST_FIXTURE', 140), currency, priceKind: 'AFTERMARKET' },
    ],
    referenceLineItems,
    taxRate: sourced('TEST_FIXTURE', 0.21),
    insurerEstimate: {
      estimateId: 'insurer_demo_fixture_v1',
      source: 'TEST_FIXTURE',
      currency,
      lineItems: insurerLineItems,
      total: sourced('TEST_FIXTURE', 617.35),
      sourceHash: fingerprintRef('insurer-estimate'),
    },
  };
}
