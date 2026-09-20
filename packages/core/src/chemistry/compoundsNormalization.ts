/* Proprietary / All Rights Reserved - Genesis OS */
import type { Compound, Medium, NormalizedCompound, StructureKind } from './genesisChemistryTypes.js';

const METALS = new Set([
  'Na', 'K', 'Li', 'Ca', 'Mg', 'Ba', 'Sr', 'Fe', 'Cu', 'Zn', 'Ag', 'Pb', 'Al', 'Ni', 'Co', 'Mn', 'Cr', 'Cd', 'Hg', 'Sn',
]);

export function inferStructureKind(c: Pick<Compound, 'composition' | 'category' | 'formula'>): StructureKind {
  const symbols = Object.keys(c.composition);
  const metals = symbols.filter((s) => METALS.has(s));
  if (['Si'].some((s) => c.composition[s]) && c.composition.O && symbols.length === 2) return 'NETWORK_SOLID';
  if (c.formula === 'Al2O3') return 'IONIC_LATTICE';
  if (c.category === 'salt') return 'IONIC_LATTICE';
  if (c.category === 'oxide' && metals.length > 0) return 'IONIC_LATTICE';
  if (c.category === 'metal' || c.category === 'elemental_metal') return 'METALLIC_SOLID';
  return 'MOLECULAR_SPECIES';
}

export const COMPOUND_OVERRIDES: Readonly<Record<string, Partial<NormalizedCompound>>> = {
  'w-so3': { phase: 'liquid', medium: 'pure', structureKind: 'MOLECULAR_SPECIES' },
  'w-h2so4': { phase: 'liquid', medium: 'pure' },
  'w-hno3': { phase: 'liquid', medium: 'pure' },
  'w-h3po4': { phase: 'solid', medium: 'pure' },
  'w-fe2o3': { aliases: ['hematite', 'ferric oxide'], structureKind: 'IONIC_LATTICE', smiles: null },
  'w-sio2': { structureKind: 'NETWORK_SOLID', smiles: null },
  'w-al2o3': { structureKind: 'IONIC_LATTICE', smiles: null },
  'w-nacl': { structureKind: 'IONIC_LATTICE', smiles: null },
  'w-caco3': { structureKind: 'IONIC_LATTICE', smiles: null },
};

function phaseFromLegacyState(state: string | undefined): 'solid' | 'liquid' | 'gas' {
  if (state === 'solid' || state === 'liquid' || state === 'gas') return state;
  if (state === 'aqueous') return 'liquid';
  return 'solid';
}

export function normalizeCompound(c: Compound): NormalizedCompound {
  const override = COMPOUND_OVERRIDES[c.id] ?? {};
  const inferredStructure = inferStructureKind(c);
  const structureKind = override.structureKind ?? c.structureKind ?? inferredStructure;
  const phase = override.phase ?? c.phase ?? phaseFromLegacyState(c.state);
  const medium: Medium = override.medium ?? c.medium ?? (c.state === 'aqueous' ? 'aqueous' : 'pure');
  const smiles = structureKind === 'MOLECULAR_SPECIES'
    ? (override.smiles !== undefined ? override.smiles : c.smiles ?? null)
    : null;
  return {
    ...c,
    ...override,
    phase,
    medium,
    structureKind,
    smiles,
    aliases: override.aliases ?? c.aliases,
  };
}

export const RUST_GLOSS_NOTE = 'Rust is a corrosion product mixture, not a pure synonym for Fe2O3.';
