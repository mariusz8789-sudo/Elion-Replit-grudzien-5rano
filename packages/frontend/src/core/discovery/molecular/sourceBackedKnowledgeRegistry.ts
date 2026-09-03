import { canonicalJson, fnv1a } from '../../events/hash';
import type { TargetEvidenceRef } from './targetHypothesis';

export const SOURCE_BACKED_REGISTRY_VERSION = '1.0.0';

export type KnowledgeStatus = 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'UNTESTED' | 'NOT_AVAILABLE' | 'NOT_EXTRACTED' | 'NOT_COMPARABLE' | 'FALSIFIED' | 'BLOCKED';
export type EntityClass = 'EFFECT' | 'TARGET' | 'MECHANISM' | 'COMPOUND' | 'SOURCE' | 'ASSAY' | 'EVIDENCE';
export type CompoundOrigin = 'NATURAL' | 'SYNTHETIC' | 'NATURAL_PARENT' | 'CLASS_COMPARATOR' | 'UNKNOWN';

export interface SourceBackedKnowledgeRecord {
  recordId: string;
  entityClass: EntityClass;
  entityId: string;
  label: string;
  effectId: string;
  targetId: string | null;
  mechanism: string | null;
  compoundId: string | null;
  compoundOrigin: CompoundOrigin | null;
  source: TargetEvidenceRef;
  assay: { name: string; model: string; parameter: string | null; value: string | null; unit: string | null } | null;
  evidenceType: 'PRIMARY_MEASURED' | 'PRIMARY_REPORTED' | 'LITERATURE_SUPPORTED' | 'MODEL_PREDICTION' | 'INFERENCE';
  comparability: 'COMPARABLE' | 'NOT_COMPARABLE' | 'NOT_AVAILABLE';
  status: KnowledgeStatus;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  limitations: readonly string[];
}

const source = (identifier: string, establishes: string): TargetEvidenceRef => ({ source: 'LITERATURE', identifier, establishes });

/** Curated from existing verified Genesis packs; no claim of completeness. */
export const SOURCE_BACKED_EFFECT_TARGET_REGISTRY: readonly SourceBackedKnowledgeRecord[] = [
  { recordId: 'effect-nmda-001', entityClass: 'EFFECT', entityId: 'nmda-antagonism', label: 'Reduce NMDAR-mediated excitation', effectId: 'nmda-antagonism', targetId: 'NMDAR', mechanism: 'open-channel antagonism', compoundId: 'ketamine', compoundOrigin: 'SYNTHETIC', source: source('Anis et al. 1983; PMID 6317114', 'Ketamine was characterised as an NMDA receptor antagonist.'), assay: { name: 'neuronal electrophysiology', model: 'central mammalian neurones', parameter: 'functional antagonism', value: null, unit: null }, evidenceType: 'LITERATURE_SUPPORTED', comparability: 'NOT_AVAILABLE', status: 'SUPPORTED', confidence: 'MEDIUM', limitations: ['Reference assay details are preserved in the existing ketamine evidence pack; this registry does not invent a potency value.'] },
  { recordId: 'target-nmda-001', entityClass: 'TARGET', entityId: 'NMDAR', label: 'N-methyl-D-aspartate receptor', effectId: 'nmda-antagonism', targetId: 'NMDAR', mechanism: null, compoundId: null, compoundOrigin: null, source: source('Yang & Reis 1999; PMID 9918557', 'Agmatine selectively blocks NMDA currents in cultured rat hippocampal neurons.'), assay: null, evidenceType: 'PRIMARY_MEASURED', comparability: 'NOT_AVAILABLE', status: 'SUPPORTED', confidence: 'HIGH', limitations: ['Target evidence does not establish equivalence to ketamine.'] },
  { recordId: 'mech-agmatine-001', entityClass: 'MECHANISM', entityId: 'nmdar-open-channel-block', label: 'Voltage- and concentration-dependent open-channel block', effectId: 'nmda-antagonism', targetId: 'NMDAR', mechanism: 'open-channel antagonism', compoundId: 'agmatine', compoundOrigin: 'NATURAL', source: source('PMID 9918557', 'Whole-cell patch clamp reported voltage- and concentration-dependent NMDA-current block; KD 952 µM at 0 mV.'), assay: { name: 'whole-cell patch clamp', model: 'cultured rat hippocampal neurons', parameter: 'dissociation constant', value: '952', unit: 'µM' }, evidenceType: 'PRIMARY_MEASURED', comparability: 'NOT_COMPARABLE', status: 'SUPPORTED', confidence: 'HIGH', limitations: ['Different model and assay endpoint from ketamine comparisons; do not merge into one potency scale.'] },
  { recordId: 'mech-kyna-001', entityClass: 'MECHANISM', entityId: 'nmdar-noncompetitive-inhibition', label: 'Non-competitive inhibition of NMDA-evoked current', effectId: 'nmda-antagonism', targetId: 'NMDAR', mechanism: 'allosteric/non-competitive inhibition', compoundId: 'kynurenic-acid', compoundOrigin: 'NATURAL', source: source('PMID 2471112', 'Kynurenic acid non-competitively inhibited NMDA-evoked currents in rat cortical neurons.'), assay: { name: 'whole-cell/outside-out patch clamp', model: 'primary neonatal rat cortical neurons', parameter: 'ID50', value: '70', unit: 'µM' }, evidenceType: 'PRIMARY_MEASURED', comparability: 'NOT_COMPARABLE', status: 'SUPPORTED', confidence: 'HIGH', limitations: ['Not a matched ketamine assay; functional direction differs mechanistically from channel pore block.'] },
  { recordId: 'target-gaba-a-001', entityClass: 'TARGET', entityId: 'GABA-A', label: 'GABA-A benzodiazepine receptor site', effectId: 'anxiolysis-gaba-a', targetId: 'GABA-A', mechanism: 'benzodiazepine-site agonism', compoundId: 'alprazolam', compoundOrigin: 'SYNTHETIC', source: source('PMID 7550022', 'Alprazolam was studied as a high-affinity benzodiazepine receptor ligand.'), assay: { name: 'PET receptor binding', model: 'human subjects', parameter: 'receptor ligand binding', value: null, unit: null }, evidenceType: 'PRIMARY_REPORTED', comparability: 'NOT_AVAILABLE', status: 'SUPPORTED', confidence: 'MEDIUM', limitations: ['This record does not establish natural occurrence or a natural equivalent.'] },
  { recordId: 'target-cathinone-001', entityClass: 'TARGET', entityId: 'DAT-NET-SERT', label: 'Monoamine transporters', effectId: 'monoamine-transporter-release', targetId: 'DAT/NET/SERT', mechanism: 'transporter-mediated uptake inhibition and release', compoundId: 'cathinone', compoundOrigin: 'NATURAL_PARENT', source: source('Hadlock et al. 2011; DOI 10.1124/jpet.111.184119', 'Mephedrone is a synthetic derivative of naturally occurring cathinone; transporter pharmacology is compound-specific.'), assay: { name: 'transporter uptake/release', model: 'rat synaptosomal/striatal preparations', parameter: null, value: null, unit: null }, evidenceType: 'LITERATURE_SUPPORTED', comparability: 'NOT_COMPARABLE', status: 'PARTIALLY_SUPPORTED', confidence: 'MEDIUM', limitations: ['Cathinone is a parent/class comparator, not 3-MMC or 4-MMC; do not present it as the same compound.'] },
];

export function sourceBackedKnowledgeForEffect(effectId: string): readonly SourceBackedKnowledgeRecord[] {
  return SOURCE_BACKED_EFFECT_TARGET_REGISTRY.filter((record) => record.effectId === effectId);
}

export function sourceBackedRegistryFingerprint(records: readonly SourceBackedKnowledgeRecord[] = SOURCE_BACKED_EFFECT_TARGET_REGISTRY): string {
  return fnv1a(canonicalJson({ v: SOURCE_BACKED_REGISTRY_VERSION, records: records.map((record) => [record.recordId, record.status, record.source.identifier]).sort() }));
}
