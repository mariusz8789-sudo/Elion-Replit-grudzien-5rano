/**
 * provenance (Stage 5) — Provenance Engine for the Scientific Decision Report.
 *
 * Every displayed value exposes HOW it was produced: source, engine, algorithm,
 * engine version, timestamp, confidence, reproducibility. This is NOT new
 * computation — it is honest metadata about the RDKit descriptors Genesis already
 * computes. Static algorithm/confidence facts + injected version/timestamp, plus a
 * reproducible SHA-256 analysis hash so another scientist can reproduce the run.
 */
import { t } from './i18n';

export type Confidence = 'HIGH' | 'MEDIUM' | 'MODEL_ESTIMATE';
export type Reproducibility = 'DETERMINISTIC' | 'DETERMINISTIC_SEEDED';

export interface Provenance {
  descriptor: string;
  source: string;
  engine: string;
  algorithm: string;
  engineVersion: string;
  timestamp: number;
  confidence: Confidence;
  confidenceNote: string;
  reproducibility: Reproducibility;
}

// Static confidence facts per RDKit descriptor. Human-readable label / algorithm /
// note text lives in the i18n dictionaries (prov.<key>.*), resolved at read time so
// the provenance table follows the active language.
const ALGO: Record<string, { confidence: Confidence }> = {
  molWt: { confidence: 'HIGH' },
  exactMolWt: { confidence: 'HIGH' },
  logP: { confidence: 'MEDIUM' },
  tpsa: { confidence: 'HIGH' },
  hbd: { confidence: 'HIGH' },
  hba: { confidence: 'HIGH' },
  rotatableBonds: { confidence: 'HIGH' },
  aromaticRings: { confidence: 'HIGH' },
  lipinskiViolations: { confidence: 'HIGH' },
  inchiKey: { confidence: 'HIGH' },
  molecularFormula: { confidence: 'HIGH' },
};

/** Build the provenance record for one descriptor (text via the i18n seam). */
export function descriptorProvenance(key: string, ctx: { engineVersion: string; timestamp: number }): Provenance | null {
  const a = ALGO[key];
  if (!a) return null;
  return {
    descriptor: t(`prov.${key}.label`),
    source: t('prov.source'),
    engine: 'RDKit',
    algorithm: t(`prov.${key}.algo`),
    engineVersion: ctx.engineVersion,
    timestamp: ctx.timestamp,
    confidence: a.confidence,
    confidenceNote: t(`prov.${key}.note`),
    reproducibility: 'DETERMINISTIC',
  };
}

export const PROVENANCE_KEYS = Object.keys(ALGO);

/** Deterministic canonical JSON (sorted keys) → stable input for hashing. */
export function canonicalJSON(value: unknown): string {
  const seen = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(seen);
    return Object.keys(v as Record<string, unknown>).sort().reduce((o, k) => { o[k] = seen((v as Record<string, unknown>)[k]); return o; }, {} as Record<string, unknown>);
  };
  return JSON.stringify(seen(value));
}

/**
 * Reproducible SHA-256 hash of the analysis inputs+outputs. Same molecule + same
 * RDKit version → same hash, so a second scientist can confirm reproduction.
 */
export async function analysisHash(input: { canonicalSmiles: string; inchiKey: string | null; properties: Record<string, number | boolean>; rdkitVersion: string }): Promise<string> {
  const data = new TextEncoder().encode(canonicalJSON(input));
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const GROUNDING_VERSION = 'genesis-grounding/1';

export interface ReproMeta {
  reportId: string;
  analysisHash: string;
  genesisVersion: string;
  rdkitVersion: string;
  groundingVersion: string;
  generatedAt: number;
}

export function newReportId(): string {
  const r = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `GEN-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${r.toUpperCase()}`;
}
