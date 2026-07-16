/**
 * provenance (Stage 5) — Provenance Engine for the Scientific Decision Report.
 *
 * Every displayed value exposes HOW it was produced: source, engine, algorithm,
 * engine version, timestamp, confidence, reproducibility. This is NOT new
 * computation — it is honest metadata about the RDKit descriptors Genesis already
 * computes. Static algorithm/confidence facts + injected version/timestamp, plus a
 * reproducible SHA-256 analysis hash so another scientist can reproduce the run.
 */
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

/** Static, honest algorithm facts per RDKit descriptor. */
const ALGO: Record<string, { label: string; algorithm: string; confidence: Confidence; confidenceNote: string }> = {
  molWt: { label: 'Masa molowa (MW)', algorithm: 'RDKit Descriptors.MolWt (średnie masy atomowe)', confidence: 'HIGH', confidenceNote: 'wartość dokładna wyliczona ze wzoru' },
  exactMolWt: { label: 'Masa monoizotopowa', algorithm: 'RDKit Descriptors.ExactMolWt', confidence: 'HIGH', confidenceNote: 'wartość dokładna' },
  logP: { label: 'LogP', algorithm: 'RDKit Crippen.MolLogP (Wildman–Crippen 1999, wkłady atomowe)', confidence: 'MEDIUM', confidenceNote: 'model empiryczny; typowy błąd ~±0.5 jednostki logP' },
  tpsa: { label: 'TPSA', algorithm: 'RDKit Descriptors.TPSA (Ertl 2000, topologiczne PSA)', confidence: 'HIGH', confidenceNote: 'deterministyczny deskryptor topologiczny' },
  hbd: { label: 'Donory wiązań H (HBD)', algorithm: 'RDKit Lipinski.NumHDonors', confidence: 'HIGH', confidenceNote: 'zliczenie grafowe' },
  hba: { label: 'Akceptory wiązań H (HBA)', algorithm: 'RDKit Lipinski.NumHAcceptors', confidence: 'HIGH', confidenceNote: 'zliczenie grafowe' },
  rotatableBonds: { label: 'Wiązania rotacyjne', algorithm: 'RDKit Descriptors.NumRotatableBonds', confidence: 'HIGH', confidenceNote: 'zliczenie grafowe' },
  aromaticRings: { label: 'Pierścienie aromatyczne', algorithm: 'RDKit rdMolDescriptors.CalcNumAromaticRings', confidence: 'HIGH', confidenceNote: 'zliczenie grafowe' },
  lipinskiViolations: { label: 'Reguła Lipinskiego (Ro5)', algorithm: 'Reguła 5 Lipinskiego (MW≤500, LogP≤5, HBD≤5, HBA≤10)', confidence: 'HIGH', confidenceNote: 'reguła nad dokładnymi deskryptorami; LogP dziedziczy niepewność modelu' },
  inchiKey: { label: 'InChIKey', algorithm: 'RDKit MolToInchi → InchiToInchiKey (IUPAC InChI 1.x)', confidence: 'HIGH', confidenceNote: 'identyfikator dokładny, kanoniczny' },
  molecularFormula: { label: 'Wzór sumaryczny', algorithm: 'RDKit rdMolDescriptors.CalcMolFormula', confidence: 'HIGH', confidenceNote: 'wartość dokładna' },
};

/** Build the provenance record for one descriptor. */
export function descriptorProvenance(key: string, ctx: { engineVersion: string; timestamp: number }): Provenance | null {
  const a = ALGO[key];
  if (!a) return null;
  return {
    descriptor: a.label,
    source: 'RDKit (obliczenie lokalne)',
    engine: 'RDKit',
    algorithm: a.algorithm,
    engineVersion: ctx.engineVersion,
    timestamp: ctx.timestamp,
    confidence: a.confidence,
    confidenceNote: a.confidenceNote,
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
