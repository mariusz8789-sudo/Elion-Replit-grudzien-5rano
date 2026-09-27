/* Proprietary / All Rights Reserved - Genesis OS */

export type EpistemicData =
  | 'REFERENCE_DATA'
  | 'DERIVED_DATA'
  | 'CALCULATED_DATA'
  | 'PREDICTED_DATA'
  | 'MODEL'
  | 'SIMULATION';

export type VerificationStatus =
  | 'SOURCE_DECLARED_NOT_LIVE_VERIFIED'
  | 'LIVE_VERIFIED'
  | 'UNVERIFIED';

export interface AtomicWeightView {
  readonly kind: 'STANDARD' | 'CONVENTIONAL' | 'MASS_NUMBER' | 'NONE';
  readonly value: number | null;
  readonly lowerBound: number | null;
  readonly upperBound: number | null;
  readonly representativeMassNumber: number | null;
}

export interface PhaseView {
  readonly phase273K: 'solid' | 'liquid' | 'gas' | 'UNKNOWN';
  readonly phase298K: 'solid' | 'liquid' | 'gas' | 'UNKNOWN';
  readonly meltK: number | null;
  readonly boilK: number | null;
  readonly epistemic: EpistemicData;
}

export type StructureKind =
  | 'MOLECULAR_SPECIES'
  | 'IONIC_LATTICE'
  | 'NETWORK_SOLID'
  | 'METALLIC_SOLID'
  | 'POLYMERIC_STRUCTURE';

export type Medium = 'pure' | 'aqueous' | 'solution' | 'gas_mixture';

export interface ChemicalSource {
  readonly name: string;
  readonly url?: string;
  readonly dataset: string;
  readonly license: string;
  readonly attribution: string;
  readonly commercialUse: 'ALLOWED' | 'REQUIRES_REVIEW' | 'NOT_ALLOWED';
  readonly redistribution: string;
}

/**
 * Compatibility-first provenance model.
 * New fields are optional so existing v0.1 chemistry records remain type-safe.
 * The v2/v2.1 adapter fills verificationStatus/sourceVersion/lastChecked explicitly.
 */
export interface ProvenanceMeta {
  readonly source: readonly string[];
  readonly sourceType: EpistemicData;
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly verificationStatus?: VerificationStatus;
  readonly sourceVersion?: string;
  readonly lastChecked?: string | null;
  readonly lastVerified?: string;
  readonly license: string;
  readonly notes: readonly string[];
}

/** Raw/legacy-compatible element record. Normalized views are produced by elementsNormalization.ts. */
export interface ChemicalElement {
  readonly atomicNumber: number;
  readonly symbol: string;
  readonly name: string;
  readonly namePl: string;
  readonly nameEs: string;
  readonly period: number;
  readonly group: number;
  readonly block: 's' | 'p' | 'd' | 'f';
  readonly category: string;
  readonly standardAtomicWeight: number;
  readonly atomicWeightKind?: 'STANDARD' | 'CONVENTIONAL' | 'MASS_NUMBER';
  readonly electronConfiguration: string;
  readonly configPredicted: boolean;
  readonly commonOxidationStates: readonly number[];
  readonly electronegativity: number | null;
  readonly phaseAtSTP: 'solid' | 'liquid' | 'gas';
  readonly cls: 'metal' | 'metalloid' | 'nonmetal';
  readonly provenance: ProvenanceMeta;
}

export interface Isotope {
  readonly element: string;
  readonly massNumber: number;
  readonly metastable?: boolean;
  readonly neutrons: number;
  readonly stable: boolean;
  readonly halfLife: string | null;
  readonly decayModes: readonly string[];
  readonly naturalAbundance: number | null;
  readonly daughter: string | null;
  readonly provenance: ProvenanceMeta;
}

export interface Ion {
  readonly id: string;
  readonly formula: string;
  readonly charge: number;
  readonly kind: 'monatomic' | 'polyatomic';
  readonly name: string;
  readonly namePl: string;
  readonly composition?: Readonly<Record<string, number>>;
  readonly provenance: ProvenanceMeta;
}

export interface Compound {
  readonly id: string;
  readonly formula: string;
  readonly name: string;
  readonly namePl: string;
  readonly category: string;
  readonly composition: Readonly<Record<string, number>>;
  readonly molarMass: number;
  readonly charge: number;
  /** v0.1 compatibility */
  readonly state?: string;
  /** v0.2+ normalized fields */
  readonly phase?: 'solid' | 'liquid' | 'gas';
  readonly medium?: Medium;
  readonly structureKind?: StructureKind;
  readonly aliases: readonly string[];
  readonly smiles?: string | null;
  readonly oxidationStates?: Readonly<Record<string, number>>;
  readonly epistemic: EpistemicData;
  readonly provenance: ProvenanceMeta;
}

export type NormalizedCompound = Omit<Compound, 'phase' | 'medium' | 'structureKind' | 'smiles'> & {
  readonly phase: 'solid' | 'liquid' | 'gas';
  readonly medium: Medium;
  readonly structureKind: StructureKind;
  readonly smiles: string | null;
};

export interface PkaRecord {
  readonly id: string;
  readonly value: number;
  readonly solvent: string;
  readonly temperatureK: number;
  readonly ionicStrength: number | null;
  readonly source: string;
  readonly notes: readonly string[];
}

export interface ReactionParticipant {
  readonly f: string;
  readonly c: number;
  readonly compositionOverride?: Readonly<Record<string, number>>;
  readonly charge?: number;
}

export interface Reaction {
  readonly id: string;
  readonly reactants: readonly ReactionParticipant[];
  readonly products: readonly ReactionParticipant[];
  readonly equation: string;
  readonly reactionType: readonly string[];
  readonly conditions: readonly string[];
  readonly catalysts: readonly string[];
  readonly reversible: boolean;
  readonly contextDependent?: boolean;
  readonly epistemic: EpistemicData;
  readonly provenance: ProvenanceMeta;
}

export type NormalizedReaction = Omit<Reaction, 'contextDependent'> & {
  readonly contextDependent: boolean;
};

export interface BondType {
  readonly id: string;
  readonly name: string;
  readonly mechanism: string;
  readonly strengthKJmol: readonly [number, number];
  readonly lengthPm: readonly [number, number] | null;
  readonly polarity: string;
  readonly geometryNote: string;
}

export interface VseprGeometry {
  readonly id: string;
  readonly domains: number;
  readonly lonePairs: number;
  readonly idealAngles: readonly string[];
  readonly examples: readonly string[];
}

export interface FunctionalGroup {
  readonly id: string;
  readonly name: string;
  readonly structure: string;
  readonly generalFormula: string;
  readonly naming: string;
  readonly reactivity: string;
  readonly examples: readonly string[];
  readonly characteristicReactions: readonly string[];
}

export interface BioMolecule {
  readonly id: string;
  readonly name: string;
  readonly class: string;
  readonly formula?: string;
  readonly composition?: Readonly<Record<string, number>>;
  readonly properties: Readonly<Record<string, string | number>>;
  readonly epistemic: EpistemicData;
  readonly provenance: ProvenanceMeta;
}

export interface GlossaryTerm {
  readonly id: string;
  readonly en: string;
  readonly pl: string;
  readonly es: string;
  readonly symbol?: string;
  readonly definition: string;
  readonly category: string;
  readonly aliases: readonly string[];
  readonly related: readonly string[];
}

export interface ChemistryManifest {
  readonly package: string;
  readonly version: string;
  readonly schemaVersion: string;
  readonly generatedBy: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly sha256: Readonly<Record<string, string>>;
  readonly verificationStatus: VerificationStatus;
}
