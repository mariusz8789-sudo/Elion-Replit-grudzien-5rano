/**
 * Source-specific scientific parsers (Corpus Mandate Phases 7–8). Each parser projects a RAW
 * source payload into a typed normalized entity while PRESERVING the raw payload reference.
 * Normalized entities are projections, never replacements.
 *
 * Bioactivity is NOT flattened to a single "potency": standard_type / standard_relation /
 * standard_value / standard_units / assay identity / target identity / organism are all kept.
 * A Ki is not an IC50; an assay value is not proof of efficacy.
 */
import { ENTITY_TYPE, SOURCE_SERVICE } from './sourcePort.mjs';

const asStr = (x) => (x == null ? null : String(x));
const asNum = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : (x != null && Number.isFinite(Number(x)) ? Number(x) : null));

/** Europe PMC record → ScientificArticle. Never implies reusable full text exists. */
export function parseEuropePmc(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('europepmc: raw payload is not an object');
  return {
    entityType: ENTITY_TYPE.ARTICLE, sourceService: SOURCE_SERVICE.EUROPE_PMC,
    identifiers: { pmid: asStr(raw.pmid ?? raw.id), pmcid: asStr(raw.pmcid), doi: asStr(raw.doi) },
    title: asStr(raw.title), authors: asStr(raw.authorString), journal: asStr(raw.journalTitle),
    publicationDate: asStr(raw.firstPublicationDate ?? raw.pubYear), publicationType: asStr(raw.pubType),
    isOpenAccess: raw.isOpenAccess === 'Y' || raw.isOpenAccess === true,
    hasReusableFullText: raw.isOpenAccess === 'Y' && Boolean(raw.fullTextUrlList), // never assume
    abstract: asStr(raw.abstractText),
  };
}

/** RCSB PDB entry → ProteinStructure. Structure existing ≠ docking-ready. */
export function parseRcsbPdb(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('rcsb: raw payload is not an object');
  const pdbId = asStr(raw.rcsb_id ?? raw.entry?.id ?? raw.pdbId);
  const methods = (raw.exptl ?? []).map((e) => asStr(e.method)).filter(Boolean);
  const res = raw.rcsb_entry_info?.resolution_combined ?? raw.resolution ?? null;
  return {
    entityType: ENTITY_TYPE.STRUCTURE, sourceService: SOURCE_SERVICE.RCSB_PDB,
    identifiers: { pdbId },
    experimentalMethods: methods,
    resolutionAngstrom: Array.isArray(res) ? asNum(res[0]) : asNum(res),
    isExperimental: methods.length > 0,
    polymerEntityCount: asNum(raw.rcsb_entry_info?.polymer_entity_count),
    ligandIds: (raw.nonpolymer_entities ?? raw.ligands ?? []).map((l) => asStr(l.id ?? l)).filter(Boolean),
    // Docking-readiness is a SEPARATE assessment; a bare entry is never marked docking-ready.
    dockingReady: false,
    dockingReadinessNote: 'structure existence is not docking validity — receptor preparation + site definition required',
  };
}

/** PubChem PUG record → ChemicalCompound. Presence in PubChem is not evidence of efficacy. */
export function parsePubchem(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('pubchem: raw payload is not an object');
  const props = raw.PropertyTable?.Properties?.[0] ?? raw;
  return {
    entityType: ENTITY_TYPE.COMPOUND, sourceService: SOURCE_SERVICE.PUBCHEM,
    identifiers: { cid: asStr(props.CID ?? raw.cid), inchiKey: asStr(props.InChIKey ?? raw.inchiKey) },
    canonicalSmiles: asStr(props.CanonicalSMILES ?? props.SMILES ?? raw.canonicalSmiles),
    molecularFormula: asStr(props.MolecularFormula), molecularWeight: asNum(props.MolecularWeight),
    representationNote: 'canonical SMILES is a REPRESENTATION, not the sole identity; CID/InChIKey are the source identity.',
  };
}

/** UniProt record → ProteinRecord. Never merge proteins solely by human-readable name. */
export function parseUniprot(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('uniprot: raw payload is not an object');
  const accession = asStr(raw.primaryAccession ?? raw.accession);
  return {
    entityType: ENTITY_TYPE.PROTEIN, sourceService: SOURCE_SERVICE.UNIPROT,
    identifiers: { accession },
    proteinName: asStr(raw.proteinDescription?.recommendedName?.fullName?.value ?? raw.proteinName),
    organism: asStr(raw.organism?.scientificName ?? raw.organism),
    sequenceLength: asNum(raw.sequence?.length),
    sequenceHashSource: asStr(raw.sequence?.md5 ?? null), // source-provided; identity is the accession
    reviewed: raw.entryType ? /Swiss-Prot|reviewed/i.test(String(raw.entryType)) : null, // UNKNOWN if absent
    functionAnnotations: (raw.comments ?? []).filter((c) => c.commentType === 'FUNCTION').map((c) => asStr(c.texts?.[0]?.value)).filter(Boolean),
    crossReferences: (raw.uniProtKBCrossReferences ?? []).map((x) => ({ db: asStr(x.database), id: asStr(x.id) })).slice(0, 50),
  };
}

/** ChEMBL activity record → BioactivityRecord. PRESERVES every distinguishing field. */
export function parseChembl(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('chembl: raw payload is not an object');
  return {
    entityType: ENTITY_TYPE.BIOACTIVITY, sourceService: SOURCE_SERVICE.CHEMBL,
    identifiers: { activityId: asStr(raw.activity_id), assayChemblId: asStr(raw.assay_chembl_id), moleculeChemblId: asStr(raw.molecule_chembl_id), targetChemblId: asStr(raw.target_chembl_id) },
    standardType: asStr(raw.standard_type),      // e.g. IC50 / Ki / Kd / EC50 — NOT interchangeable
    standardRelation: asStr(raw.standard_relation), // '=', '>', '<' — a censored value is not an equality
    standardValue: asNum(raw.standard_value),
    standardUnits: asStr(raw.standard_units),
    assayDescription: asStr(raw.assay_description), assayType: asStr(raw.assay_type),
    targetOrganism: asStr(raw.target_organism), targetPrefName: asStr(raw.target_pref_name),
    confidenceScore: asNum(raw.confidence_score), // ChEMBL target-assignment confidence, kept as-is
    dataValidityComment: asStr(raw.data_validity_comment),
    interpretationNote: 'an assay activity is NOT proof of therapeutic efficacy; Ki/IC50/Kd/EC50 are distinct measurements.',
  };
}

export const PARSERS = Object.freeze({
  [SOURCE_SERVICE.EUROPE_PMC]: parseEuropePmc,
  [SOURCE_SERVICE.RCSB_PDB]: parseRcsbPdb,
  [SOURCE_SERVICE.PUBCHEM]: parsePubchem,
  [SOURCE_SERVICE.UNIPROT]: parseUniprot,
  [SOURCE_SERVICE.CHEMBL]: parseChembl,
});

export function parseFor(sourceService, raw) {
  const parser = PARSERS[sourceService];
  if (!parser) throw new Error(`no parser for source service ${sourceService}`);
  return parser(raw);
}
