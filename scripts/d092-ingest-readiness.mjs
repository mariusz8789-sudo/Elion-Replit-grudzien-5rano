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

/**
 * MANIFEST v2 — the resupplied declaration. Still a declaration: no byte of it
 * reached this container either. What changed is that it is now SELF-CONSISTENT,
 * which v1 was not.
 */
export const declaredV2Unverified = Object.freeze({
  provenance: 'resupplied after the D-092 audit; bytes still NOT transferred; no hash here was checked against bytes',
  supersedes: 'declaredUnverified (v1) — v1 is retained, not deleted, so the correction stays auditable',
  pages: Object.freeze([
    { label: 'offset=0', declaredRows: 1000, sha256: '489e0e42e2542e88392c2abc48dd280f789c785dd045b67cf126ad080f5934bf' },
    { label: 'offset=1000', declaredRows: 1000, sha256: '4eaf816af16c7e9d3fccceb96c7456369f6a4e58134176ffa7f30eb4743df062' },
    { label: 'offset=2000', declaredRows: 365, sha256: '3d339aec1f10d18c2469a50b01c653825d80fbbaf00d2d8685f546a1c9311ddc', declaredAs: 'partial final page' },
    { label: 'manifest', declaredRows: null, sha256: '698d556f3b8049388e4b8585cb94a1ef08bf19551ccb2ae6feb08c17240d8c94' },
  ]),
  dedupedBytesSha256: '8dec7f27c50fd88120f472d3bb09f503a7026ec33ae661c99b08268dfd338dda',
  dedupedBytesLength: 6283424,
  dedupKey: 'activity_id',
  counts: Object.freeze({
    rowsTotal: 2365, rowsRelationEqual: 2181, rowsEqGoodUnits: 2173,
    uniqueMolecules: 1586, replicateGroupsEC50: 325,
    singleRowMolecules: 1222, sameAssayOnlyMultiRow: 39,
    rejectedCensored: 174, rejectedNoRelation: 10, rejectedOrAnomalousUnits: 8,
    flaggedOutsideTypicalRange: 201, flaggedPotentialDuplicate: 20,
    assayTypeFunctional: 1549, assayTypeBinding: 624,
    actionTypeNone: 1339, actionTypeAgonistFamily: 834,
  }),
});

/** The v2 partition is three buckets, matching replicateGrouping.mjs, not two. */
export function reconcileV2(c, pages) {
  const reproducible = pages.filter((p) => typeof p.declaredRows === 'number').reduce((a, p) => a + p.declaredRows, 0);
  const checks = [
    { name: 'pages reproduce rowsTotal', expected: c.rowsTotal, actual: reproducible },
    { name: 'rowsTotal - censored - noRelation = rowsRelationEqual', expected: c.rowsRelationEqual, actual: c.rowsTotal - c.rejectedCensored - c.rejectedNoRelation },
    { name: 'rowsRelationEqual - badUnits = rowsEqGoodUnits', expected: c.rowsEqGoodUnits, actual: c.rowsRelationEqual - c.rejectedOrAnomalousUnits },
    { name: 'groups + singleRow + sameAssayMulti = uniqueMolecules', expected: c.uniqueMolecules, actual: c.replicateGroupsEC50 + c.singleRowMolecules + c.sameAssayOnlyMultiRow,
      note: 'the three-bucket partition replicateGrouping.mjs actually produces' },
    { name: 'assay_type partition = rowsEqGoodUnits', expected: c.rowsEqGoodUnits, actual: c.assayTypeFunctional + c.assayTypeBinding },
    { name: 'action_type partition = rowsEqGoodUnits', expected: c.rowsEqGoodUnits, actual: c.actionTypeNone + c.actionTypeAgonistFamily },
  ];
  return checks.map((k) => Object.freeze({ ...k, ok: k.expected === k.actual, delta: k.actual - k.expected }));
}

/**
 * Checks the v1 -> v2 TRANSITION, not either declaration alone. A correction
 * has to be a possible correction: the stated operation must be able to produce
 * the stated change.
 */
export function transitionChecks(v1, v2) {
  return [
    {
      name: 'dedup on activity_id cannot reduce the distinct-molecule count',
      // Rows sharing an activity_id ARE the same record, so every molecule on a
      // removed row is still carried by the row that was kept. The molecule set
      // is invariant under this operation.
      holds: v2.uniqueMolecules === v1.uniqueMolecules,
      v1: v1.uniqueMolecules,
      v2: v2.uniqueMolecules,
      verdict: v2.uniqueMolecules === v1.uniqueMolecules
        ? 'consistent'
        : 'IMPOSSIBLE_UNDER_STATED_OPERATION — one of the two molecule counts was not computed the way it is described',
    },
    {
      name: "v1's singleRecord bucket was the union of v2's singleRow and sameAssayMulti",
      holds: v1.singleRecordMolecules === v2.singleRowMolecules + v2.sameAssayOnlyMultiRow,
      v1: v1.singleRecordMolecules,
      v2: v2.singleRowMolecules + v2.sameAssayOnlyMultiRow,
      verdict: 'explains why v1 under-partitioned; corroborates 1586 from BOTH declarations independently',
    },
    {
      name: 'row drop equals exactly one page',
      holds: v1.rowsTotal - v2.rowsTotal === 1000,
      v1: v1.rowsTotal, v2: v2.rowsTotal,
      verdict: 'consistent with one page having been counted twice',
    },
  ].map((c) => Object.freeze(c));
}

/**
 * Projects the EXISTING Genesis ingest policy onto the v2 counts. Not a new
 * policy and not a filter run: an arithmetic consequence of the policy already
 * in the repository, stated so the human sealing the preregistration can see
 * what each branch costs BEFORE any model is fitted.
 */
export function policyProjection(c) {
  const rejectUnion = { min: Math.max(c.flaggedOutsideTypicalRange, c.flaggedPotentialDuplicate), max: c.flaggedOutsideTypicalRange + c.flaggedPotentialDuplicate };
  const survivingMin = c.rowsEqGoodUnits - rejectUnion.max;
  const survivingMax = c.rowsEqGoodUnits - rejectUnion.min;
  return Object.freeze({
    startFrom: c.rowsEqGoodUnits,
    rejectedByExistingPolicy: Object.freeze({
      data_validity_comment: c.flaggedOutsideTypicalRange,
      potential_duplicate: c.flaggedPotentialDuplicate,
      note: 'overlap between the two sets is unknown from the declaration, so the survivor count is an interval, not a point',
    }),
    survivingRowsBeforeCanonicalisation: Object.freeze({ min: survivingMin, max: survivingMax }),
    stillToApply: Object.freeze([
      'RDKit canonicalisation (unparseable SMILES drop)',
      'pActivity within [3, 12]',
      'dedup on canonicalSmiles|assayId|standardType',
      'overlap with the 194 EC50 rows already in the frozen pin',
    ]),
    branches: Object.freeze({
      AGONIST_FAMILY_ONLY: Object.freeze({
        rows: c.actionTypeAgonistFamily,
        shareOfEqGood: Number((c.actionTypeAgonistFamily / c.rowsEqGoodUnits).toFixed(4)),
        replicateGroups: 'NOT_MEASURED — the group count for this subset was never computed',
        sizeFloorLikelySurvives: c.actionTypeAgonistFamily > 400,
      }),
      RETAIN_NONE_WITH_FLAG: Object.freeze({
        rows: c.rowsEqGoodUnits,
        shareOfEqGood: 1,
        replicateGroups: c.replicateGroupsEC50,
        caveat: `pharmacological direction unconfirmed for ${c.actionTypeNone} of ${c.rowsEqGoodUnits} rows`,
      }),
    }),
    theTrapToAvoid:
      'the two branches must NOT be compared on how many replicate groups each yields. Choosing the branch that makes the noise floor measurable would be selecting the analysis to obtain the result. The branch is sealed on pharmacological grounds BEFORE its group count is measured.',
  });
}

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

/**
 * Round-by-round record of the acquisition itself. Kept because the blocker
 * turned out to be structural rather than a one-off failure, and a structural
 * blocker is only visible across rounds.
 */
export const ACQUISITION_ROUNDS = Object.freeze([
  Object.freeze({ round: 1, outcome: 'EGRESS_BLOCKED_HERE', detail: 'this container: 403 CONNECT to every scientific host; supplier reported a successful fetch in its own sandbox' }),
  Object.freeze({ round: 2, outcome: 'DECLARATION_ONLY', detail: 'manifest v2 supplied and self-consistent; still no bytes in this container' }),
  Object.freeze({ round: 3, outcome: 'NOT_RETRIEVED', detail: 'supplier reported 4 fetch attempts, all read-timeout on www.ebi.ac.uk; no bytes produced in that round either' }),
]);

/**
 * THE BLOCKER IS A CHANNEL SHAPE, NOT A FAILED STEP.
 *
 * Two capabilities are needed at once and no party in this loop has both:
 *   - reach EBI/UniProt  -> this container cannot (network policy, 403 CONNECT)
 *   - push to the branch -> the supplier cannot (no credentials, no repo path)
 *
 * So no number of retries by either party can close it. It closes when ONE
 * machine holds both, or when a human carries the bytes across.
 */
export const CHANNEL_CONSTRAINT = Object.freeze({
  requiredTogether: Object.freeze(['egress to www.ebi.ac.uk / rest.uniprot.org', 'git push to the working branch']),
  thisContainer: Object.freeze({ egress: false, gitPush: true }),
  supplier: Object.freeze({ egress: 'intermittent — succeeded in earlier rounds, read-timeout in round 3', gitPush: false }),
  consequence: 'retrying on either side alone cannot resolve it; the two capabilities must meet on one machine, or a human moves the bytes',
});

function main() {
  const startedAt = new Date().toISOString();
  const egress = DECLARED_ENDPOINTS.map(probe);
  // The proxy states WHY, which a bare 000 does not: policy denial vs transient failure.
  let proxyFailures;
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
  const reconciliationV2 = reconcileV2(declaredV2Unverified.counts, declaredV2Unverified.pages);
  const transition = transitionChecks(declaredUnverified.counts, declaredV2Unverified.counts);
  const projection = policyProjection(declaredV2Unverified.counts);
  // v1 is superseded; the live declaration is v2, so v2 decides the blocker.
  const failed = reconciliationV2.filter((r) => !r.ok);

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
      detail: 'independent of egress, the live declaration does not reconcile with itself, so even with network access the named files could not reproduce the named counts.',
      evidence: failed.map((f) => `${f.name}: declared ${f.expected}, implied ${f.actual} (delta ${f.delta > 0 ? '+' : ''}${f.delta})`),
    });
  }
  const impossibleTransitions = transition.filter((t) => t.verdict.startsWith('IMPOSSIBLE'));
  if (impossibleTransitions.length > 0) {
    // NOT a blocker: it does not affect v2's internal coherence, and v2's own
    // value is corroborated twice over. Recorded as an open discrepancy so the
    // correction is not laundered into a clean history.
    blockers.push({
      code: 'TRANSITION_DISCREPANCY_RECORDED',
      severity: 'NON_BLOCKING',
      detail: 'the v1 -> v2 correction contains a step the stated operation cannot produce. v2 stays usable; the discrepancy is recorded rather than smoothed over.',
      evidence: impossibleTransitions.map((t) => `${t.name}: v1 ${t.v1} -> v2 ${t.v2} — ${t.verdict}`),
    });
  }

  const hardBlockers = blockers.filter((b) => b.severity !== 'NON_BLOCKING');
  const decision = hardBlockers.length === 0 ? 'READY_FOR_PREREG' : 'BLOCKED';

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
    declaredV2Unverified,
    declarationReconciliationV2: reconciliationV2,
    v1ToV2Transition: transition,
    existingPolicyProjection: projection,
    ingestPolicyResolved,
    // ---- outcome ----
    acquisitionRounds: ACQUISITION_ROUNDS,
    channelConstraint: CHANNEL_CONSTRAINT,
    blockers,
    decision,
    whatWouldUnblock: [
      'THE ONLY REMAINING ITEM: the raw response bytes, committed to this branch. Every arithmetic objection has been answered; nothing further can be established from a declaration.',
      'a human preregistration decision on action_type, sealed on pharmacological grounds BEFORE the replicate-group count of the chosen branch is measured',
    ],
    resolvedSinceV1: [
      'the missing page — v2 states rowsTotal 2365, matching the three files it lists',
      'the null manifest hash — v2 supplies 698d556f…',
      'the unreported bucket — v2 reports sameAssayOnlyMultiRow = 39 and all six identities close',
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
  console.log('\ndeclaration reconciliation (v1, SUPERSEDED):');
  for (const r of reconciliation) console.log(`  ${r.ok ? 'OK      ' : 'MISMATCH'} ${r.name}: declared ${r.expected}, implied ${r.actual}`);
  console.log('\ndeclaration reconciliation (v2, LIVE):');
  for (const r of reconciliationV2) console.log(`  ${r.ok ? 'OK      ' : 'MISMATCH'} ${r.name}: declared ${r.expected}, implied ${r.actual}`);
  console.log('\nv1 -> v2 transition:');
  for (const t of transition) console.log(`  ${t.holds ? 'OK      ' : 'DISCREPANT'} ${t.name}: ${t.v1} -> ${t.v2}`);
  console.log('\nexisting-policy projection on v2:');
  console.log(`  eqGoodUnits ${projection.startFrom} - (validityComment ${projection.rejectedByExistingPolicy.data_validity_comment} + potentialDup ${projection.rejectedByExistingPolicy.potential_duplicate}) -> ${projection.survivingRowsBeforeCanonicalisation.min}..${projection.survivingRowsBeforeCanonicalisation.max} rows before canonicalisation`);
  console.log(`  branch AGONIST_FAMILY_ONLY : ${projection.branches.AGONIST_FAMILY_ONLY.rows} rows, groups ${projection.branches.AGONIST_FAMILY_ONLY.replicateGroups}`);
  console.log(`  branch RETAIN_NONE_WITH_FLAG: ${projection.branches.RETAIN_NONE_WITH_FLAG.rows} rows, groups ${projection.branches.RETAIN_NONE_WITH_FLAG.replicateGroups}`);
  console.log('\nblockers:');
  for (const b of blockers) { console.log(`  [${b.code}] ${b.detail}`); for (const e of b.evidence) console.log(`      - ${e}`); }
  console.log('\nacquisition rounds:');
  for (const r of ACQUISITION_ROUNDS) console.log(`  round ${r.round}: ${r.outcome} — ${r.detail}`);
  console.log(`\nchannel constraint: egress here=${CHANNEL_CONSTRAINT.thisContainer.egress}, gitPush here=${CHANNEL_CONSTRAINT.thisContainer.gitPush}; supplier gitPush=${CHANNEL_CONSTRAINT.supplier.gitPush}`);
  console.log(`  ${CHANNEL_CONSTRAINT.consequence}`);
  console.log(`\nDECISION: ${decision}`);
  console.log(`sealed -> ${path.relative(path.join(HERE, '..'), OUT)}  hash ${sealed.artifactHash.slice(0, 16)}…`);
  return decision === 'READY_FOR_PREREG' ? 0 : 0; // measurement script: a BLOCKED finding is a successful measurement
}

if (process.argv[1] && process.argv[1].endsWith("d092-ingest-readiness.mjs")) process.exit(main());
