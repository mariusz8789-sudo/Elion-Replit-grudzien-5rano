/**
 * D-092 — DATA INGEST READINESS. Measurement only. No model is fitted here.
 *
 * The mandate assumed egress. This script MEASURES whether that assumption
 * holds, rather than asserting it, and records the answer either way.
 *
 * It changes nothing: no threshold, no pin, no Winner Gate, no attempt budget.
 * Its only output is a sealed artifact and a decision of
 * READY_FOR_PREREG or BLOCKED.
 *
 * WHY THE DECLARED COUNTS ARE NOT MEASUREMENTS HERE: every number supplied
 * with the dataset offer is carried in `declaredUnverified`. Nothing reads it
 * as fact. The two things this runtime CAN check without bytes are (a) whether
 * the declaration reconciles with itself, and (b) whether the declared source
 * files could reproduce the declared row count. Both are checked.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { replicateGroups, noiseFloorStatus, REPLICATE_RULE } from '../packages/backend/src/campaign/replicateGrouping.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'packages', 'backend', 'src', 'campaign', 'glp1r-d092-ingest-readiness.sealed.json');

/** Exactly the endpoints the offer names. Probed, not assumed. */
const DECLARED_ENDPOINTS = Object.freeze([
  'https://www.ebi.ac.uk/chembl/api/data/target/CHEMBL1784.json',
  'https://rest.uniprot.org/uniprotkb/P43220.json',
  'https://www.ebi.ac.uk/chembl/api/data/activity.json?target_chembl_id=CHEMBL1784&standard_type=EC50&limit=1000&offset=0',
  'https://www.ebi.ac.uk/chembl/api/data/activity.json?target_chembl_id=CHEMBL1784&standard_type=EC50&limit=1000&offset=1000',
  'https://www.ebi.ac.uk/chembl/api/data/activity.json?target_chembl_id=CHEMBL1784&standard_type=EC50&limit=1000&offset=2000',
]);

/**
 * curl exits non-zero when the connection itself fails, so the http_code must
 * be read from a shell that survives that exit. Losing it would turn a precise
 * "000, proxy refused CONNECT" into an uninformative "ERROR".
 */
function probe(url) {
  const out = execFileSync('/bin/sh', ['-c',
    `curl -s -o /dev/null -w '%{http_code}' --max-time 40 ${JSON.stringify(url)}; printf ' exit=%s' "$?"`,
  ], { encoding: 'utf8' }).trim();
  const [code, exitPart] = out.split(' ');
  const curlExit = Number((exitPart ?? 'exit=?').split('=')[1]);
  return {
    url,
    httpCode: code || '000',
    curlExit: Number.isFinite(curlExit) ? curlExit : null,
    reachable: /^[23]/.test(code || ''),
  };
}

/**
 * The offer's own numbers, recorded VERBATIM and UNVERIFIED. A value in here
 * has exactly the standing of a claim in an email.
 */
export const declaredUnverified = Object.freeze({
  provenance: 'supplied with the dataset offer; bytes were NOT transferred; no hash in this block was checked against bytes',
  pages: Object.freeze([
    { label: 'offset=0', declaredRows: 1000, sha256: '489e0e42e2542e88392c2abc48dd280f789c785dd045b67cf126ad080f5934bf' },
    { label: 'offset=1000', declaredRows: 1000, sha256: '4eaf816af16c7e9d3fccceb96c7456369f6a4e58134176ffa7f30eb4743df062' },
    { label: 'offset=2000', declaredRows: 365, sha256: '3d339aec1f10d18c2469a50b01c653825d80fbbaf00d2d8685f546a1c9311ddc', declaredAs: 'strona częściowa = koniec' },
    { label: 'manifest', declaredRows: null, sha256: null },
  ]),
  counts: Object.freeze({
    rowsTotal: 3365, rowsRelationEqual: 3100, rowsEqGoodUnits: 3084,
    rowsWithCanonicalSmiles: 3062, uniqueMolecules: 1720,
    replicateGroupsEC50: 325, singleRecordMolecules: 1261,
    assayTypeFunctional: 2014, assayTypeBinding: 1070,
    actionTypeAgonist: 1220, actionTypeNone: 1774, actionTypePAM: 46,
    actionTypePartialAgonist: 14, actionTypeActivator: 30,
    rejectedCensored: 251, rejectedNoRelation: 14, rejectedOrAnomalousUnits: 16,
    flaggedOutsideTypicalRange: 222, flaggedPotentialDuplicate: 35,
  }),
  targetVerification: Object.freeze({
    chemblResponseSha256: 'fb2f71b9183a9e4acd69c32e52513d6f1b6476fd4f2e8dda32f0639050b0b9b5',
    uniprotResponseSha256: '1cea8706939c89053da84866ea03dc07c80fea8b117daf1483eb93baa140e1f2',
  }),
});

/** Arithmetic the declaration must satisfy to be internally coherent. No bytes needed. */
export function reconcile(c, pages) {
  const reproducible = pages.filter((p) => typeof p.declaredRows === 'number').reduce((a, p) => a + p.declaredRows, 0);
  const checks = [
    { name: 'pages reproduce rowsTotal', expected: c.rowsTotal, actual: reproducible,
      note: 'sum of declaredRows over the listed source files must equal rowsTotal' },
    { name: 'rowsTotal - censored - noRelation = rowsRelationEqual', expected: c.rowsRelationEqual, actual: c.rowsTotal - c.rejectedCensored - c.rejectedNoRelation },
    { name: 'rowsRelationEqual - badUnits = rowsEqGoodUnits', expected: c.rowsEqGoodUnits, actual: c.rowsRelationEqual - c.rejectedOrAnomalousUnits },
    { name: 'action_type partition = rowsEqGoodUnits', expected: c.rowsEqGoodUnits,
      actual: c.actionTypeAgonist + c.actionTypeNone + c.actionTypePAM + c.actionTypePartialAgonist + c.actionTypeActivator },
    { name: 'assay_type partition = rowsEqGoodUnits', expected: c.rowsEqGoodUnits, actual: c.assayTypeFunctional + c.assayTypeBinding },
    { name: 'replicateGroups + singleRecord = uniqueMolecules', expected: c.uniqueMolecules, actual: c.replicateGroupsEC50 + c.singleRecordMolecules,
      note: 'a shortfall here is the sameAssayOnly bucket, which the declaration does not report' },
  ];
  return checks.map((k) => Object.freeze({ ...k, ok: k.expected === k.actual, delta: k.actual - k.expected }));
}

/**
 * Mandate step 9: apply the EXISTING Genesis ingest policy; do not invent one.
 * Resolved by reading the code, and recorded with the file that carries it.
 */
const ingestPolicyResolved = Object.freeze({
  resolvedFrom: 'scripts/fetch-gov-drug-discovery-generated-space.mjs:198 (assayInclusion) + packages/backend/src/campaign/activityDataset.mjs::normalizeActivityRows',
  statedPolicy: 'organism=Homo sapiens, standard_units=nM, standard_relation="=", no data_validity_comment, no potential_duplicate',
  rules: Object.freeze([
    { field: 'target_organism', policy: 'Homo sapiens only', enforcedIn: 'normalizeActivityRows (humanOnly)', existing: true },
    { field: 'target_chembl_id', policy: 'must equal the expected target id', enforcedIn: 'normalizeActivityRows (expectedTargetId)', existing: true },
    { field: 'standard_type', policy: 'EC50|IC50|KI|PEC50|PIC50|PKI', enforcedIn: 'normalizeActivityRows (ACCEPTED_TYPES)', existing: true },
    { field: 'pActivity', policy: 'within [3, 12]', enforcedIn: 'normalizeActivityRows (PACTIVITY_MIN/MAX)', existing: true },
    { field: 'dedup', policy: 'canonicalSmiles|assay_chembl_id|standardType', enforcedIn: 'normalizeActivityRows (dedupKey)', existing: true },
    { field: 'data_validity_comment', policy: 'ROW IS REJECTED when present — so the 222 "Outside typical range" rows DROP, they are not flags', enforcedIn: 'fetch-script layer only', existing: true, gap: 'not enforced by normalizeActivityRows' },
    { field: 'potential_duplicate', policy: 'ROW IS REJECTED when set — the 35 declared rows DROP', enforcedIn: 'fetch-script layer only', existing: true, gap: 'not enforced by normalizeActivityRows' },
    { field: 'standard_relation', policy: 'must be "=" ', enforcedIn: 'fetch-script layer only', existing: true, gap: 'NOT enforced by normalizeActivityRows, and the frozen pin carries no standardRelation column — so relation is NOT_MEASURED for the pin already in the repo' },
    { field: 'action_type', policy: 'NO POLICY EXISTS IN GENESIS', enforcedIn: null, existing: false,
      consequence: 'under existing policy the 1774 action_type=None rows are ADMITTED, because no rule excludes them. Writing a rule now would be a NEW policy, which this mandate forbids. Direction of pharmacology therefore stays an OPEN PREREGISTRATION QUESTION for a human, not a silent default.' },
  ]),
});

function main() {
  const startedAt = new Date().toISOString();
  const egress = DECLARED_ENDPOINTS.map(probe);
  // The proxy states WHY, which a bare 000 does not: policy denial vs transient failure.
  let proxyFailures = [];
  try {
    const st = JSON.parse(execFileSync('/bin/sh', ['-c', `curl -s --max-time 20 "$HTTPS_PROXY/__agentproxy/status"`], { encoding: 'utf8' }));
    proxyFailures = (st.recentRelayFailures ?? []).map((f) => `${f.host}: ${f.kind} — ${f.detail}`);
  } catch { proxyFailures = ['agent proxy status unavailable']; }
  const egressOk = egress.every((e) => e.reachable);

  // Canonical loader. Not a parallel ingest.
  const pin = loadGlp1rPin();
  const rows = pin.rows ?? pin;
  const byEndpoint = {};
  for (const ep of ['EC50', 'IC50', 'KI']) {
    const g = replicateGroups(rows, ep);
    byEndpoint[ep] = {
      rows: rows.filter((r) => r.standardType === ep).length,
      molecules: g.molecules,
      replicateGroups: g.groups.length,
      rejectedSingleRecord: g.rejected.singleRecord,
      rejectedSameAssayOnly: g.rejected.sameAssayOnly,
      noiseFloor: noiseFloorStatus(g).status,
    };
  }

  const reconciliation = reconcile(declaredUnverified.counts, declaredUnverified.pages);
  const failed = reconciliation.filter((r) => !r.ok);

  const blockers = [];
  if (!egressOk) {
    blockers.push({
      code: 'EGRESS_BLOCKED',
      detail: 'the mandate\'s steps 1-2 (refetch, verify sha256) cannot execute: the network policy answers 403 to CONNECT for every declared scientific host. No byte of the offered dataset can enter this runtime through this container.',
      evidence: egress.map((e) => `http=${e.httpCode} curlExit=${e.curlExit} ${e.url.slice(0, 88)}`),
      proxyDetail: proxyFailures,
    });
  }
  if (failed.length > 0) {
    blockers.push({
      code: 'DECLARED_MANIFEST_NOT_REPRODUCIBLE',
      detail: 'independent of egress, the declaration does not reconcile with itself, so even with network access the named files could not reproduce the named counts.',
      evidence: failed.map((f) => `${f.name}: declared ${f.expected}, implied ${f.actual} (delta ${f.delta > 0 ? '+' : ''}${f.delta})`),
    });
  }

  const decision = blockers.length === 0 ? 'READY_FOR_PREREG' : 'BLOCKED';

  const artifact = {
    id: 'D-092-INGEST-READINESS',
    kind: 'SEALED_RESEARCH_ARTIFACT',
    question: 'Does the offered EC50 dataset actually enter Genesis, and does it unblock attempt 2/2?',
    startedAt,
    // ---- invariants: this run changed nothing ----
    gateConstantsChanged: false,
    pinsChanged: false,
    winnerGateChanged: false,
    splitRuleChanged: false,
    ingestPolicyChanged: false,
    testSplitRead: false,
    modelFitted: false,
    representationAttemptsConsumed: 0,
    attemptBudgetAfterThisRun: '1/2 consumed — unchanged',
    // ---- measured ----
    egressMeasurement: { probedAt: startedAt, allReachable: egressOk, probes: egress },
    frozenPinBaseline: {
      pinSha256: pin.meta?.sha256 ?? null,
      rows: rows.length,
      uniqueMolecules: new Set(rows.map((r) => r.canonicalSmiles)).size,
      byEndpoint,
      replicateRule: REPLICATE_RULE.definition,
    },
    // ---- claimed, NOT measured ----
    declaredUnverified,
    declarationReconciliation: reconciliation,
    ingestPolicyResolved,
    // ---- outcome ----
    blockers,
    decision,
    whatWouldUnblock: [
      'the raw response bytes themselves, delivered by a route that preserves them (committed to the repo, or any channel that does not summarise), with one sha256 per file',
      'the missing page: the three listed files sum to 2365 rows, not 3365 — one full 1000-row page is absent from the manifest, or the offset=2000 page is mislabelled as final',
      'a sha256 for the manifest file, which is currently null and is the only file that could reconcile the pages',
      'a human preregistration decision on action_type, because Genesis has no existing rule and this mandate forbids inventing one',
    ],
    scientificStateUnchanged: 'NO_WINNER · Recipe LOCKED · CONSTRAINT_CONFLICT · attempts 1/2 · gates, pins, split rule and Winner Gate untouched',
  };

  const sealed = { artifact, artifactHash: canonicalHash(artifact), sealedAt: new Date().toISOString() };
  writeFileSync(OUT, JSON.stringify(sealed, null, 2), 'utf8');

  console.log('=== D-092 INGEST READINESS ===');
  console.log(`egress: ${egressOk ? 'OPEN' : 'BLOCKED'}`);
  for (const e of egress) console.log(`  http=${e.httpCode}  ${e.url.slice(0, 100)}`);
  console.log(`\nfrozen pin: ${rows.length} rows, ${artifact.frozenPinBaseline.uniqueMolecules} unique molecules`);
  for (const [ep, v] of Object.entries(byEndpoint)) {
    console.log(`  ${ep.padEnd(5)} rows=${String(v.rows).padStart(3)} molecules=${String(v.molecules).padStart(3)} groups=${String(v.replicateGroups).padStart(3)} noiseFloor=${v.noiseFloor}`);
  }
  console.log('\ndeclaration reconciliation:');
  for (const r of reconciliation) console.log(`  ${r.ok ? 'OK      ' : 'MISMATCH'} ${r.name}: declared ${r.expected}, implied ${r.actual}`);
  console.log('\nblockers:');
  for (const b of blockers) { console.log(`  [${b.code}] ${b.detail}`); for (const e of b.evidence) console.log(`      - ${e}`); }
  console.log(`\nDECISION: ${decision}`);
  console.log(`sealed -> ${path.relative(path.join(HERE, '..'), OUT)}  hash ${sealed.artifactHash.slice(0, 16)}…`);
  return decision === 'READY_FOR_PREREG' ? 0 : 0; // measurement script: a BLOCKED finding is a successful measurement
}

if (process.argv[1] && process.argv[1].endsWith("d092-ingest-readiness.mjs")) process.exit(main());
