/* Proprietary / All Rights Reserved - Genesis OS */
import type { EpistemicData, ProvenanceMeta } from './genesisChemistryTypes.js';

/**
 * GENESIS CHEMISTRY — RECEPTOR SITE DESCRIPTORS (D-137).
 *
 * Three illustrative, hand-authored reference binding-pocket archetypes
 * (kinase ATP pocket, GPCR orthosteric pocket, nuclear-hormone-receptor
 * ligand-binding pocket) used as the receptor side of `moleculeDockingEngine.ts`'s
 * deterministic docking heuristic. These are NOT extracted from a live PDB
 * fetch or any external database — no runtime network call is made anywhere
 * in this module — and they do not claim to be any specific, named protein
 * structure. `epistemic: 'MODEL'` on every record, matching the same honesty
 * discipline `data/*.ts` already uses (SOURCE_DECLARED_NOT_LIVE_VERIFIED).
 *
 * This module is data only: no rendering, no Three.js, no second renderer.
 */

export interface ReceptorChargeProfile {
  readonly netCharge: number;
  /** 0..1 — how strongly a positively charged patch (e.g. a catalytic lysine/arginine cluster) is present in the pocket. */
  readonly positivePatchStrength: number;
  /** 0..1 — how strongly a negatively charged patch (e.g. acidic residues, backbone carbonyls) is present in the pocket. */
  readonly negativePatchStrength: number;
}

export interface BindingSiteGeometry {
  readonly pocketVolumeA3: number;
  readonly pocketDepthA: number;
  readonly pocketWidthA: number;
  /** 0 (fully hydrophobic lining) .. 1 (fully polar lining). */
  readonly polarity: number;
}

export interface ReceptorSite {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly chargeProfile: ReceptorChargeProfile;
  /** 0 (polar pocket) .. 1 (hydrophobic pocket). */
  readonly hydrophobicity: number;
  readonly bindingSiteGeometry: BindingSiteGeometry;
  readonly epistemic: EpistemicData;
  readonly provenance: ProvenanceMeta;
}

const P: ProvenanceMeta = {
  source: ['Illustrative reference pocket archetype — general medicinal-chemistry textbook characterization, not a specific PDB entry'],
  sourceType: 'MODEL',
  confidence: 'LOW',
  verificationStatus: 'SOURCE_DECLARED_NOT_LIVE_VERIFIED',
  sourceVersion: 'D-137',
  lastChecked: null,
  license: 'facts',
  notes: ['Hand-authored illustrative geometry; not fetched from a live structural database.'],
};

export const RECEPTORS: readonly ReceptorSite[] = [
  {
    id: 'receptor:kinase-atp-pocket-illustrative',
    label: 'Kinase ATP-competitive pocket (illustrative)',
    description: 'Archetypal ATP-competitive kinase hinge pocket: moderate size, mixed polarity from hinge backbone carbonyls/amides, a catalytic-lysine-style positive patch.',
    chargeProfile: { netCharge: -1, positivePatchStrength: 0.55, negativePatchStrength: 0.4 },
    hydrophobicity: 0.45,
    bindingSiteGeometry: { pocketVolumeA3: 340, pocketDepthA: 9, pocketWidthA: 6, polarity: 0.55 },
    epistemic: 'MODEL',
    provenance: P,
  },
  {
    id: 'receptor:gpcr-orthosteric-illustrative',
    label: 'GPCR orthosteric pocket (illustrative)',
    description: 'Archetypal class-A GPCR orthosteric pocket: deep and narrow, lined mostly by transmembrane-helix hydrophobic residues with a polar anchor near the extracellular vestibule.',
    chargeProfile: { netCharge: 0, positivePatchStrength: 0.2, negativePatchStrength: 0.3 },
    hydrophobicity: 0.7,
    bindingSiteGeometry: { pocketVolumeA3: 260, pocketDepthA: 14, pocketWidthA: 4.5, polarity: 0.3 },
    epistemic: 'MODEL',
    provenance: P,
  },
  {
    id: 'receptor:nuclear-hormone-illustrative',
    label: 'Nuclear hormone receptor ligand-binding pocket (illustrative)',
    description: 'Archetypal nuclear-hormone-receptor ligand-binding domain pocket: large, predominantly hydrophobic, low net charge — sized for a lipophilic hormone-like ligand.',
    chargeProfile: { netCharge: 0, positivePatchStrength: 0.15, negativePatchStrength: 0.15 },
    hydrophobicity: 0.85,
    bindingSiteGeometry: { pocketVolumeA3: 520, pocketDepthA: 11, pocketWidthA: 8, polarity: 0.2 },
    epistemic: 'MODEL',
    provenance: P,
  },
];

const RECEPTOR_BY_ID = new Map(RECEPTORS.map((r) => [r.id, r]));

export function getReceptor(id: string): ReceptorSite | undefined {
  return RECEPTOR_BY_ID.get(id);
}

export const DEFAULT_RECEPTOR_ID: string = RECEPTORS[0].id;
