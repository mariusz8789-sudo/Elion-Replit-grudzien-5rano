#!/usr/bin/env node
/**
 * D-155 — GLP-1R pathway and expression as EXTERNAL PUBLISHED EVIDENCE.
 *
 * This is not an experiment and produces no Genesis result. It reads the Reactome and Human
 * Protein Atlas records fetched on 2026-10-03, hash-verifies them, and writes down what each
 * source ACTUALLY SAYS, field by field, with the source, the record version and the sha256.
 *
 * The one rule that shapes every line of the output: a SOURCE_FACT is a value copied from a
 * source; an INFERENCE is something Genesis concluded by joining sources, and is labelled as
 * Genesis's reasoning rather than as a published finding; and anything the fetched records do
 * not contain is NOT_IN_FETCHED_SOURCES, never filled in from memory of the literature.
 *
 * Usage: node scripts/glp1r-d155-pathway-expression.mjs [--source-dir <dir>] [--source-ref <ref>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d155-pathway-expression.external-evidence.json');
const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SRC = argOf('--source-dir', path.join(ROOT, 'docs/evidence/source-data/glp1r-2026-10-03'));
const SRC_REF = argOf('--source-ref', null);

const sources = JSON.parse(fs.readFileSync(path.join(SRC, 'SOURCES.json'), 'utf8'));
const declared = new Map((sources.files ?? []).map((f) => [f.path, f]));
const verified = [];
function readVerified(rel) {
  const abs = path.join(SRC, rel);
  const bytes = fs.readFileSync(abs);
  const computed = createHash('sha256').update(bytes).digest('hex');
  const rec = declared.get(rel);
  if (!rec) { console.error(`SOURCE_NOT_IN_MANIFEST: ${rel}`); process.exit(1); }
  if (rec.sha256 !== computed) { console.error(`SOURCE_HASH_MISMATCH: ${rel}`); process.exit(1); }
  verified.push({ path: rel, sourceUrl: rec.sourceUrl, retrievedAt: rec.retrievedAt, sha256: computed });
  return bytes.toString('utf8');
}

/* --------------------------------- Reactome ----------------------------------- */
const reactomeVersion = readVerified('reactome/database-version.txt').trim();
const reactomeRecords = ['R-HSA-381684', 'R-HSA-381706'].map((stId) => {
  const d = JSON.parse(readVerified(`reactome/${stId}.enhanced.json`));
  const names = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.displayName ?? null : x)).filter((x) => typeof x === 'string') : []);
  const refs = Array.isArray(d.literatureReference)
    ? d.literatureReference.filter((x) => x && typeof x === 'object')
      .map((x) => ({ pubMedId: x.pubMedIdentifier ?? null, title: x.title ?? null, journal: x.journal ?? null, year: x.year ?? null }))
    : [];
  return {
    stId: d.stId,
    recordVersion: d.stIdVersion ?? null,
    displayName: d.displayName,
    schemaClass: d.schemaClass,
    species: d.speciesName ?? null,
    releaseDate: d.releaseDate ?? null,
    reviewStatus: d.reviewStatus?.displayName ?? null,
    reviewStatusMeaning: d.reviewStatus?.definition ?? null,
    compartments: names(d.compartment),
    input: names(d.input),
    output: names(d.output),
    catalystActivity: names(d.catalystActivity),
    partOfPathway: names(d.eventOf),
    precedingEvent: names(d.precedingEvent),
    followingEvent: names(d.followingEvent),
    summationVerbatim: Array.isArray(d.summation) && d.summation[0]?.text ? d.summation[0].text : null,
    literatureReferences: refs,
  };
});
const gsReaction = reactomeRecords.find((r) => r.stId === 'R-HSA-381706');
const mentionsCamp = (text) => /cAMP|adenylate cyclase|adenylyl cyclase/i.test(String(text ?? ''));
const campInFetchedReactome = reactomeRecords.some((r) => mentionsCamp(r.summationVerbatim)
  || r.output.some(mentionsCamp) || r.followingEvent.some(mentionsCamp) || r.catalystActivity.some(mentionsCamp));

/* ------------------------------ Human Protein Atlas ---------------------------- */
const hpa = JSON.parse(readVerified('hpa/ENSG00000112164.json'));
const pick = (k) => (hpa[k] === undefined ? null : hpa[k]);
const hpaRecord = {
  gene: pick('Gene'),
  ensemblId: pick('Ensembl'),
  uniprot: pick('Uniprot'),
  geneDescription: pick('Gene description'),
  overallEvidenceLevel: pick('Evidence'),
  hpaOwnEvidenceLevel: pick('HPA evidence'),
  uniprotEvidenceLevel: pick('UniProt evidence'),
  rna: {
    tissueSpecificity: pick('RNA tissue specificity'),
    tissueDistribution: pick('RNA tissue distribution'),
    tissueSpecificNtpm: pick('RNA tissue specific nTPM'),
    singleCellTypeSpecificity: pick('RNA single cell type specificity'),
    singleCellTypeSpecificNcpm: pick('RNA single cell type specific nCPM'),
    tissueCellTypeEnrichment: pick('RNA tissue cell type enrichment'),
    unit: 'nTPM for tissues, nCPM for single-cell types, as HPA reports them',
  },
  proteinByAntibodyStaining: {
    tissueSpecificity: pick('Protein tissue specificity'),
    tissueDistribution: pick('Protein tissue distribution'),
    tissueSpecificIntensity: pick('Protein tissue specific Intensity'),
    cellTypeSpecificity: pick('Protein cell type specificity'),
    reliabilityIH: pick('Reliability (IH)'),
    antibodies: pick('Antibody'),
  },
  subcellularMainLocation: pick('Subcellular main location'),
};

/* ----------------------------------- output ------------------------------------ */
const out = {
  decisionId: 'D-155',
  kind: 'EXTERNAL_PUBLISHED_EVIDENCE',
  epistemicStatus: 'EXTERNAL_PUBLISHED',
  isGenesisResult: false,
  statement: 'Everything below was published by Reactome or the Human Protein Atlas. Genesis did not measure, model or compute any of it, and nothing here may be presented as a Genesis experimental result.',
  computedAt: new Date().toISOString(),
  sourceData: { dir: path.relative(ROOT, SRC) || SRC, gitRef: SRC_REF, filesVerified: verified.length, allHashesMatched: true, files: verified },

  pathway: {
    question: 'GLP-1R -> Gs -> cAMP',
    reactomeDatabaseVersion: reactomeVersion,
    records: reactomeRecords,
    sourceFacts: [
      {
        label: 'SOURCE_FACT',
        claim: 'In human, GLP-1R with GLP-1 bound activates the alpha subunit of the heterotrimeric G protein G(s), causing GDP/GTP exchange.',
        source: `Reactome ${gsReaction?.stId} (${gsReaction?.recordVersion}), "${gsReaction?.displayName}", ${gsReaction?.species}, review status "${gsReaction?.reviewStatus}" (${gsReaction?.reviewStatusMeaning})`,
        verbatim: gsReaction?.summationVerbatim ?? null,
        citations: gsReaction?.literatureReferences ?? [],
        partOfPathway: gsReaction?.partOfPathway ?? [],
      },
    ],
    notInFetchedSources: campInFetchedReactome ? [] : [
      {
        label: 'NOT_IN_FETCHED_SOURCES',
        missingStep: 'Gs -> adenylate cyclase -> cAMP',
        whatThisMeans: 'The two Reactome records fetched cover GLP-1R binding GLP-1 and the activation of G(s). Neither of them states the cAMP step. So the "-> cAMP" half of the requested chain is NOT source-backed by what this repository holds, and it is not written down here as if it were. Closing it needs the downstream Reactome reaction fetched and hash-recorded like these two.',
        doNotInfer: 'That G(s) canonically raises cAMP is textbook knowledge. Textbook knowledge recalled by a model is not a source, and this file does not carry it as one.',
      },
    ],
    inferences: [
      {
        label: 'INFERENCE_BY_GENESIS',
        statement: 'A functional cAMP-arm agonism assay is a reasonable readout for GLP-1R activation, which is the endpoint role D-151/D-152 already classify on.',
        restsOn: ['the SOURCE_FACT above, for the receptor-to-G(s) step'],
        doesNotRestOn: ['any fetched source for the G(s)-to-cAMP step, which is missing'],
        isNotEvidence: 'This is Genesis joining records. It is reasoning, not a published finding, and it is not evidence that any molecule activates anything.',
      },
    ],
  },

  expression: {
    question: 'Where is GLP1R expressed?',
    source: 'Human Protein Atlas, gene ENSG00000112164',
    record: hpaRecord,
    sourceFacts: [
      {
        label: 'SOURCE_FACT',
        claim: `HPA reports GLP1R RNA as "${hpaRecord.rna.tissueSpecificity}" and "${hpaRecord.rna.tissueDistribution}", with tissue-specific values ${JSON.stringify(hpaRecord.rna.tissueSpecificNtpm)} nTPM.`,
        level: 'RNA (transcript), not protein',
      },
      {
        label: 'SOURCE_FACT',
        claim: `At single-cell level HPA reports "${hpaRecord.rna.singleCellTypeSpecificity}", highest in ${Object.entries(hpaRecord.rna.singleCellTypeSpecificNcpm ?? {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ')} nCPM.`,
        level: 'RNA (transcript), not protein',
      },
      {
        label: 'SOURCE_FACT_THAT_CUTS_THE_OTHER_WAY',
        claim: `HPA's OWN antibody staining does not support tissue expression: protein tissue specificity "${hpaRecord.proteinByAntibodyStaining.tissueSpecificity}", distribution "${hpaRecord.proteinByAntibodyStaining.tissueDistribution}", immunohistochemistry reliability ${JSON.stringify(hpaRecord.proteinByAntibodyStaining.reliabilityIH)}, antibody ${JSON.stringify(hpaRecord.proteinByAntibodyStaining.antibodies)}.`,
        whyItIsHere: `HPA's headline "${hpaRecord.overallEvidenceLevel}" comes from UniProt and neXtProt ("${hpaRecord.uniprotEvidenceLevel}"); HPA's own evidence level for this gene is "${hpaRecord.hpaOwnEvidenceLevel}". Quoting the RNA numbers without this line would overstate what HPA actually shows.`,
      },
    ],
    inferences: [
      {
        label: 'INFERENCE_BY_GENESIS',
        statement: 'Pancreas is the tissue with the highest reported GLP1R transcript level among those HPA calls specific, and pancreatic islet cells the highest among pancreatic cell types.',
        restsOn: ['the two RNA SOURCE_FACTs above, read as reported'],
        isNotEvidence: 'A transcript level is not a protein level, a protein level is not a functional receptor, and none of this is a measurement Genesis made.',
      },
    ],
    notInFetchedSources: [
      { label: 'NOT_IN_FETCHED_SOURCES', missing: 'GTEx tissue-level expression', whatThisMeans: 'Not fetched, so not reported. The HPA record is the only expression source this repository holds.' },
    ],
  },

  whatThisDoesNotLicense: [
    'A pathway record is not evidence that any molecule activates the receptor.',
    'An expression record is not evidence that a molecule reaches that tissue or does anything there.',
    'Binding is not functional agonism; docking is not agonism; a heterologous-system response is not a native-tissue response.',
    'None of this changes any frozen gate, any sealed artefact, or D-144, D-151, D-152, D-153 or D-154.',
  ],
};
out.artifactHash = canonicalHash(out).slice(0, 16);
fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);

console.log(`Reactome ${reactomeVersion}: ${reactomeRecords.map((r) => `${r.stId} ${r.displayName}`).join(' | ')}`);
console.log(`cAMP step present in fetched Reactome records: ${campInFetchedReactome}`);
console.log(`HPA RNA: ${JSON.stringify(hpaRecord.rna.tissueSpecificNtpm)}; HPA antibody protein detection: ${hpaRecord.proteinByAntibodyStaining.tissueSpecificity}`);
console.log(`\nexternal evidence -> ${path.relative(ROOT, OUT_PATH)} (${out.artifactHash}), ${verified.length} files hash-verified`);
