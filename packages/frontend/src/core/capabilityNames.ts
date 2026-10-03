import { getLocale, type Locale } from './i18n';

/**
 * CAPABILITIES, NOT ENGINES — the words customer screens use for what Genesis
 * computes. Navigation, Start, the catalogue, Search and the Ask chips name the
 * capability ("Molecular dynamics"); the exact engine (its name, version, worker
 * and adapter) stays in Evidence, provenance, Replay, the Reviewer Room and
 * sections marked as technical details (`data-technical-details`).
 *
 * Polish and English; Arabic shows English until a native speaker checks it.
 */

export type CapabilityKey =
  | 'molecular-analysis'
  | 'structural-analysis'
  | 'interaction-modeling'
  | 'molecular-dynamics'
  | 'quantum-chemistry'
  | 'property-safety'
  | 'retrosynthetic-planning'
  | 'scientific-verification'
  | 'simulation';

const LABELS: Readonly<Record<CapabilityKey, readonly [pl: string, en: string]>> = {
  'molecular-analysis': ['Analiza molekularna', 'Molecular Analysis'],
  'structural-analysis': ['Analiza strukturalna', 'Structural Analysis'],
  'interaction-modeling': ['Modelowanie oddziaływań', 'Interaction Modeling'],
  'molecular-dynamics': ['Dynamika molekularna', 'Molecular Dynamics'],
  'quantum-chemistry': ['Chemia kwantowa', 'Quantum Chemistry'],
  'property-safety': ['Analiza właściwości i bezpieczeństwa', 'Property & Safety Analysis'],
  'retrosynthetic-planning': ['Planowanie retrosyntezy', 'Retrosynthetic Planning'],
  'scientific-verification': ['Weryfikacja naukowa', 'Scientific Verification'],
  simulation: ['Symulacja', 'Simulation'],
};

export function capabilityLabel(key: CapabilityKey, locale: Locale = getLocale()): string {
  return LABELS[key][locale === 'pl' ? 0 : 1];
}

/**
 * Engines that must not appear in customer-facing text outside technical
 * details. A test sweeps navigation, Start, the catalogue, Search and the Ask
 * chips with this pattern.
 */
export const ENGINE_NAME_PATTERN = /\b(?:RDKit|AutoDock|Vina|Meeko|GNINA|PySCF|OpenMM|ADMET-AI|AiZynthFinder|Biopython|PyMeep|Meep)\b/i;

/** Text under `data-technical-details` is where exact engine identity belongs. */
export const TECHNICAL_DETAILS_ATTR = 'data-technical-details';
