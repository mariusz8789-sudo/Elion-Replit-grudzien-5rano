import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeHttpSourceConnector } from '../core/discovery/sources/httpSourceConnector.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import {
  ingestCsvDataset,
  validateAgainstRecomputation,
  type DatasetIngestionResult,
  type DatasetSpec,
} from '../core/discovery/sources/datasetEvidenceIngestion';
import { registerAcquiredEvidence, summariseAcquiredRegistration } from '../core/discovery/sources/acquiredEvidenceRegistry';
import {
  summariseAccess,
  type RetrievalOutcome,
  type SourceDescriptor,
} from '../core/discovery/sources/scientificSourceAccess';

/**
 * PHASE 2 — AUTONOMOUS SCIENTIFIC SOURCE ACQUISITION, REAL EXECUTION.
 *
 * Genesis attempts real network retrieval against real scientific sources.
 * Nothing here is mocked: every status code and every byte is what the network
 * actually returned in this runtime. Sources that are blocked are recorded as
 * blocked, with their real transport error, and the run continues.
 */
const RUN_TIMEOUT_MS = 900_000;

/**
 * The dataset Genesis goes and gets. Delaney's aqueous-solubility set is a
 * real, published, widely used benchmark that carries BOTH a measured value
 * and a model prediction per compound — which is precisely why it is a good
 * test of whether the pipeline keeps those apart.
 */
const DELANEY: SourceDescriptor = {
  sourceId: 'delaney-esol',
  kind: 'PUBLIC_DATASET',
  url: 'https://raw.githubusercontent.com/deepchem/deepchem/master/datasets/delaney-processed.csv',
  citation: 'Delaney JS. "ESOL: estimating aqueous solubility directly from molecular structure." J Chem Inf Comput Sci. 2004;44(3):1000-1005. Distributed with DeepChem.',
  accessTerms: 'Public repository content, retrieved anonymously over HTTPS. No credential sent, no access control encountered.',
  requiresCredential: false,
};

/** Sources Genesis also attempts. Their real reachability is the finding. */
const ALSO_ATTEMPTED: SourceDescriptor[] = [
  { sourceId: 'pubchem-pug', kind: 'STRUCTURED_DATABASE_API', url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/agmatine/property/MolecularFormula,InChIKey/JSON', citation: 'PubChem PUG REST', accessTerms: 'Public API', requiresCredential: false },
  { sourceId: 'chembl-api', kind: 'STRUCTURED_DATABASE_API', url: 'https://www.ebi.ac.uk/chembl/api/data/molecule.json?pref_name__iexact=AGMATINE', citation: 'ChEMBL REST API', accessTerms: 'Public API', requiresCredential: false },
  { sourceId: 'crossref', kind: 'LITERATURE_API', url: 'https://api.crossref.org/works/10.1371/journal.pone.0217371', citation: 'Crossref REST API', accessTerms: 'Public API', requiresCredential: false },
];

const SPEC: DatasetSpec = {
  datasetId: 'delaney-esol-v1',
  subjectColumn: 'Compound ID',
  structureColumn: 'smiles',
  columns: [
    { header: 'measured log solubility in mols per litre', kind: 'MEASURED', unit: 'log mol/L', meaning: 'Experimentally measured aqueous solubility.' },
    { header: 'ESOL predicted log solubility in mols per litre', kind: 'PREDICTED', unit: 'log mol/L', meaning: 'ESOL model estimate for the same compound.' },
    { header: 'Molecular Weight', kind: 'COMPUTED_DESCRIPTOR', unit: 'g/mol', meaning: 'Molecular weight as distributed with the dataset.' },
  ],
};

let delaneyOutcome: RetrievalOutcome;
let otherOutcomes: RetrievalOutcome[] = [];
let ingestion: DatasetIngestionResult;
let validation: ReturnType<typeof validateAgainstRecomputation>;
let rdkitAvailable = false;

beforeAll(async () => {
  const connector = createNodeHttpSourceConnector({ timeoutSeconds: 60 });
  const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
  rdkitAvailable = rdkit.detect().available;

  delaneyOutcome = connector.retrieve(DELANEY);
  otherOutcomes = ALSO_ATTEMPTED.map((s) => connector.retrieve(s));

  ingestion = ingestCsvDataset(delaneyOutcome, DELANEY, SPEC);

  // Independent check: recompute molecular weight with real RDKit and compare
  // against the value the dataset ships.
  validation = validateAgainstRecomputation(
    ingestion.records,
    'Molecular Weight',
    (smiles) => {
      const described = rdkit.describe(smiles);
      return described.ok && typeof described.data.values.molWt === 'number' ? described.data.values.molWt : null;
    },
    0.5,
    25,
  );

  printReport();
}, RUN_TIMEOUT_MS);

function printReport(): void {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const access = summariseAccess([delaneyOutcome, ...otherOutcomes]);

  push('');
  push('===== GENESIS: AUTONOMOUS SCIENTIFIC SOURCE ACQUISITION =====');
  push('');
  push('QUESTION: Genesis needs real MEASURED physicochemical data it did not receive in a Knowledge Pack.');
  push('');
  push('SOURCE DISCOVERY / ACCESS DECISION:');
  for (const o of [delaneyOutcome, ...otherOutcomes]) {
    push(`  ${o.sourceId.padEnd(14)} ${o.state.padEnd(12)} HTTP ${String(o.httpStatus ?? '-').padEnd(4)} ${o.reason.slice(0, 110)}`);
  }
  push('');
  push(`ACCESS SUMMARY: ${access.summary}`);
  push('');
  push('REAL RETRIEVAL (the source that answered):');
  push(`  url            ${delaneyOutcome.url}`);
  push(`  state          ${delaneyOutcome.state}`);
  push(`  http           ${delaneyOutcome.httpStatus}`);
  push(`  bytes          ${delaneyOutcome.contentBytes}`);
  push(`  sha256         ${delaneyOutcome.contentSha256}`);
  push(`  retrievedAt    ${delaneyOutcome.retrievedAt}`);
  push(`  citation       ${DELANEY.citation}`);
  push(`  access terms   ${DELANEY.accessTerms}`);
  push('');
  push('EXTRACTION:');
  push(`  state              ${ingestion.state}`);
  push(`  rows parsed        ${ingestion.rowsParsed}`);
  push(`  evidence records   ${ingestion.records.length}`);
  push(`  MEASURED values    ${ingestion.measuredCount}`);
  push(`  PREDICTED values   ${ingestion.predictedCount}`);
  push(`  unparseable cells  ${ingestion.unparseableCells}`);
  push(`  schema fingerprint ${ingestion.schemaFingerprint}`);
  push('');
  push('SAMPLE EVIDENCE RECORDS (with row-level provenance):');
  for (const r of ingestion.records.filter((x) => x.kind === 'MEASURED' && x.value !== null).slice(0, 3)) {
    push(`  ${r.subject} — ${r.column} = ${r.value} ${r.unit} [${r.kind}]`);
    push(`     structure ${r.structure}`);
    push(`     row ${r.provenance.rowIndex} of ${r.provenance.url}`);
    push(`     sha256 ${r.provenance.contentSha256.slice(0, 32)}... retrieved ${r.provenance.retrievedAt}`);
  }
  push('');
  push('INDEPENDENT VALIDATION (real RDKit recomputes a shipped descriptor):');
  push(`  state    ${validation.state}`);
  push(`  checked  ${validation.checked}`);
  push(`  agreed   ${validation.agreed}`);
  push(`  reason   ${validation.reason}`);
  for (const d of validation.disagreed.slice(0, 3)) {
    push(`    DISAGREEMENT ${d.subject}: dataset ${d.datasetValue} vs RDKit ${d.recomputed}`);
  }
  push('');
  push('MEASURED vs PREDICTED SEPARATION:');
  const firstSubject = ingestion.records.find((r) => r.kind === 'MEASURED' && r.value !== null)?.subject;
  if (firstSubject !== undefined) {
    for (const r of ingestion.records.filter((x) => x.subject === firstSubject)) {
      push(`  ${r.subject}: ${r.column} = ${r.value} [${r.kind}]`);
    }
    push('  The two solubility values above are different KINDS of fact and are never merged.');
  }
  push('');
  push('BLOCKED SOURCES (real transport evidence, not assumed):');
  for (const o of otherOutcomes) {
    push(`  ${o.sourceId}: ${o.state} — ${o.reason.slice(0, 150)}`);
  }
  push('');
  push('=============================================================');

  const text = lines.join('\n');
  // eslint-disable-next-line no-console
  console.log(text);
  const target = process.env.GENESIS_SOURCE_OUT;
  if (target !== undefined && target.length > 0) writeFileSync(target, text, 'utf8');
}

describe('Phase 2: autonomous scientific source acquisition — real network', () => {
  it('retrieves a real public scientific dataset over the network', () => {
    expect(delaneyOutcome.state).toBe('RETRIEVED');
    expect(delaneyOutcome.httpStatus).toBe(200);
    expect(delaneyOutcome.contentBytes).toBeGreaterThan(10_000);
    expect(delaneyOutcome.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('extracts evidence records with row-level provenance', () => {
    expect(ingestion.state).toBe('EXTRACTED');
    expect(ingestion.rowsParsed).toBeGreaterThan(1000);
    expect(ingestion.records.length).toBeGreaterThan(1000);
    for (const record of ingestion.records.slice(0, 50)) {
      expect(record.provenance.url).toBe(DELANEY.url);
      expect(record.provenance.contentSha256).toBe(delaneyOutcome.contentSha256);
      expect(record.provenance.rowIndex).toBeGreaterThan(0);
      expect(record.provenance.citation.length).toBeGreaterThan(0);
    }
  });

  it('keeps MEASURED and PREDICTED values of the same quantity apart', () => {
    const measured = ingestion.records.filter((r) => r.kind === 'MEASURED');
    const predicted = ingestion.records.filter((r) => r.kind === 'PREDICTED');
    expect(measured.length).toBeGreaterThan(0);
    expect(predicted.length).toBeGreaterThan(0);
    // Same compound, same quantity, two different epistemic kinds.
    const subject = measured[0]!.subject;
    const pair = ingestion.records.filter((r) => r.subject === subject);
    expect(new Set(pair.map((r) => r.kind)).size).toBeGreaterThan(1);
    for (const record of measured) expect(record.kind).not.toBe('PREDICTED');
  });

  it('independently validates the dataset against real RDKit recomputation', () => {
    if (!rdkitAvailable) return;
    expect(validation.checked).toBeGreaterThan(0);
    expect(validation.agreed).toBeGreaterThan(0);
    expect(validation.state).toBe('VERIFIED');
  });

  it('records blocked sources with their real transport evidence and continues', () => {
    expect(otherOutcomes.length).toBe(ALSO_ATTEMPTED.length);
    for (const outcome of otherOutcomes) {
      // Whatever the network did, it must be recorded honestly with a reason.
      expect(outcome.reason.length).toBeGreaterThan(0);
      expect(['RETRIEVED', 'BLOCKED', 'UNAVAILABLE', 'REQUIRES_AUTH', 'PAYWALLED']).toContain(outcome.state);
      if (outcome.state !== 'RETRIEVED') {
        expect(outcome.content).toBeNull();
        expect(outcome.contentSha256).toBeNull();
      }
    }
    // One blocked source must not stop the run: the dataset still came through.
    expect(delaneyOutcome.state).toBe('RETRIEVED');
  });

  it('never fabricates content for a source it could not reach', () => {
    for (const outcome of [delaneyOutcome, ...otherOutcomes]) {
      if (outcome.state === 'RETRIEVED') {
        expect(outcome.content).not.toBeNull();
      } else {
        expect(outcome.content).toBeNull();
      }
    }
  });

  it('refuses to retrieve a source declared as needing a credential', () => {
    const connector = createNodeHttpSourceConnector();
    const gated = connector.retrieve({ ...DELANEY, sourceId: 'gated', requiresCredential: true });
    expect(gated.state).toBe('REQUIRES_AUTH');
    expect(gated.content).toBeNull();
    expect(gated.reason).toContain('does not hold, send or acquire credentials');
  });

  it('reports schema drift as NOT_EXTRACTED rather than silently returning nothing', () => {
    const wrong = ingestCsvDataset(delaneyOutcome, DELANEY, {
      ...SPEC,
      columns: [{ header: 'a column that does not exist', kind: 'MEASURED', unit: null, meaning: 'n/a' }],
    });
    expect(wrong.state).toBe('NOT_EXTRACTED');
    expect(wrong.missingColumns).toContain('a column that does not exist');
    expect(wrong.records).toEqual([]);
  });
  it('registers acquired evidence into the source-backed registry with kinds intact', () => {
    const registered = registerAcquiredEvidence(ingestion.records, {
      effectId: 'aqueous-solubility',
      targetId: null,
      assayName: 'aqueous solubility (log mol/L)',
      assayModel: 'as distributed in the Delaney/ESOL dataset',
    });
    const summary = summariseAcquiredRegistration(registered);

    expect(summary.registered).toBeGreaterThan(1000);
    expect(summary.primaryMeasured).toBeGreaterThan(0);
    expect(summary.modelPrediction).toBeGreaterThan(0);
    expect(summary.distinctCompounds).toBeGreaterThan(500);

    // A prediction can never be promoted to a measurement.
    for (const record of registered) {
      if (record.assay!.parameter!.startsWith('ESOL predicted')) {
        expect(record.evidenceType).toBe('MODEL_PREDICTION');
      }
      if (record.assay!.parameter === 'measured log solubility in mols per litre') {
        expect(record.evidenceType).toBe('PRIMARY_MEASURED');
      }
      // Nothing arrives comparable; comparability must be earned.
      expect(record.comparability).toBe('NOT_AVAILABLE');
      expect(record.limitations.join(' ')).toContain('Autonomously retrieved');
    }

    // eslint-disable-next-line no-console
    console.log(`REGISTRY: ${summary.summary}`);
  });
});
