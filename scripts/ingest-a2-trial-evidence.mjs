#!/usr/bin/env node
/**
 * D-110 — ingest ONE externally-sourced ClinicalTrials.gov trial record as
 * SUPPLEMENTAL evidence for an already-pinned A2/LOWER_HARM candidate.
 *
 * THIS SCRIPT NEVER FETCHES (same discipline as `ingest-gipr-activity.mjs`
 * and `fetch-a2-ozempic-substitute-fixture.mjs`'s own header): ChEMBL and
 * ClinicalTrials.gov are unreachable from this sandbox (HTTP 403 CONNECT at
 * the agent proxy, re-verified live — see docs/DECISIONS.md D-109/D-110).
 * The download is a human or external-search step performed elsewhere; this
 * script's job begins with a MANIFEST already on disk.
 *
 * Usage:
 *   node scripts/ingest-a2-trial-evidence.mjs --manifest <path.json> [--dry-run]
 *
 * MANIFEST SCHEMA — see "EXTERNAL DATA HANDOFF CONTRACT" in
 * docs/DECISIONS.md D-110 for the authoritative field-by-field spec:
 *   {
 *     "candidateChemblId": "CHEMBLxxxxxxx",
 *     "nctId": "NCTxxxxxxxx",
 *     "sourceUrl": "https://clinicaltrials.gov/api/v2/studies/NCTxxxxxxxx",
 *     "declaredSha256": "<64-hex sha256 of rawStudyJsonText, computed BEFORE handoff>",
 *     "retrievedAt": "<ISO 8601 timestamp>",
 *     "publicationDoi": "<DOI string, or null>",
 *     "rawStudyJsonText": "<the exact raw ClinicalTrials.gov API v2 study JSON, as a STRING>"
 *   }
 *
 * WHAT THIS SCRIPT NEVER TOUCHES: any base pin file under
 * `packages/frontend/src/core/biotechData/a2-ozempic-substitute/*.json`
 * (excluding `external-supplement/`), `a2OzempicSubstitutePreregistration.ts`,
 * `winnerGate.ts`, `practicalCandidateGate.ts`, or anything under
 * `a1-glp1/`. It self-verifies this on every run (see `assertBaseUnchanged`
 * below) and aborts if it ever detects otherwise.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIncomingTrialPackage } from '../packages/backend/src/campaign/a2TrialEvidenceGate.mjs';
import { narrowTrialDetail } from './lib/a2TrialNarrowing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Overridable ONLY for tests (`a2TrialIngestionCli.test.mjs`), so a test run never touches the real repo pins. Production/CLI use always resolves the real paths below. */
const A2_DIR = process.env.GENESIS_A2_DIR ?? path.join(HERE, '..', 'packages/frontend/src/core/biotechData/a2-ozempic-substitute');
const A1_META_PATH = process.env.GENESIS_A1_META_PATH ?? path.join(HERE, '..', 'packages/frontend/src/core/biotechData/a1-glp1/meta.json');
const SUPPLEMENT_TRIALS_PATH = path.join(A2_DIR, 'external-supplement/trials.supplement.json');
const SUPPLEMENT_META_PATH = path.join(A2_DIR, 'external-supplement/meta.supplement.json');

function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/** Every base pin file this script must NEVER write to — hashed before and after, asserted equal. */
function baseFileList() {
  return readdirSync(A2_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.join(A2_DIR, e.name));
}

function assertBaseUnchanged(beforeHashes) {
  const after = Object.fromEntries(baseFileList().map((p) => [p, sha256File(p)]));
  for (const [p, hash] of Object.entries(beforeHashes)) {
    if (after[p] !== hash) {
      throw new Error(`INTEGRITY VIOLATION: base pin file changed during ingestion: ${p}. Aborting — this must never happen and indicates a bug in this script, not in the data.`);
    }
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? next : true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.manifest || args.manifest === true) {
  console.error('usage: node scripts/ingest-a2-trial-evidence.mjs --manifest <path-to-manifest.json> [--dry-run]');
  console.error('this script does NOT fetch — supply a manifest per the EXTERNAL DATA HANDOFF CONTRACT (docs/DECISIONS.md D-110).');
  process.exit(64);
}

const beforeHashes = Object.fromEntries(baseFileList().map((p) => [p, sha256File(p)]));

let manifest;
try {
  manifest = JSON.parse(readFileSync(path.resolve(String(args.manifest)), 'utf8'));
} catch (err) {
  console.error(`FAILED to read/parse manifest: ${String(err?.message ?? err)}`);
  process.exit(65);
}

const candidatesRaw = JSON.parse(readFileSync(path.join(A2_DIR, 'candidates.json'), 'utf8'));
const knownCandidateIds = new Set(candidatesRaw.map((c) => c.moleculeChemblId));

const a1Meta = JSON.parse(readFileSync(A1_META_PATH, 'utf8'));
const a1RejectedNctIds = new Set(
  Object.keys(a1Meta.files ?? {})
    .map((k) => k.match(/^trial-(NCT\d+)\.json$/))
    .filter((m) => m !== null)
    .map((m) => m[1]),
);

const baseTrialsPath = path.join(A2_DIR, `trials-${manifest.candidateChemblId}.json`);
let existingBaseTrials;
try {
  existingBaseTrials = JSON.parse(readFileSync(baseTrialsPath, 'utf8'));
} catch {
  existingBaseTrials = []; // candidate may legitimately have no base trials file yet — not an error at this stage.
}

let supplementTrials;
try {
  supplementTrials = JSON.parse(readFileSync(SUPPLEMENT_TRIALS_PATH, 'utf8'));
} catch (err) {
  console.error(`FAILED to read supplement store at ${SUPPLEMENT_TRIALS_PATH}: ${String(err?.message ?? err)}`);
  process.exit(66);
}
let supplementMeta;
try {
  supplementMeta = JSON.parse(readFileSync(SUPPLEMENT_META_PATH, 'utf8'));
} catch (err) {
  console.error(`FAILED to read supplement meta at ${SUPPLEMENT_META_PATH}: ${String(err?.message ?? err)}`);
  process.exit(66);
}

const existingNctIdsForCandidate = new Set([
  ...existingBaseTrials.map((t) => t.nctId),
  ...((supplementTrials[manifest.candidateChemblId] ?? []).map((t) => t.nctId)),
]);

console.log('=== A2 EXTERNAL TRIAL EVIDENCE INGESTION (D-110) ===');
console.log(`manifest candidate : ${manifest.candidateChemblId ?? '(missing)'}`);
console.log(`manifest nctId     : ${manifest.nctId ?? '(missing)'}`);

const result = validateIncomingTrialPackage(manifest, { knownCandidateIds, a1RejectedNctIds, existingNctIdsForCandidate });

if (!result.ok) {
  console.log('');
  console.log(`OUTCOME: REJECTED — code=${result.code}`);
  console.log(`reason: ${result.reason}`);
  process.exit(2);
}

const narrowed = narrowTrialDetail(result.rawStudyJson);
console.log('');
console.log('OUTCOME: ACCEPTED');
console.log(`sha256             : ${result.sha256}`);
console.log(`narrowed hba1cOutcomes: ${narrowed.hba1cOutcomes.length}, weightOutcomes: ${narrowed.weightOutcomes.length}, adverseEvents: ${narrowed.adverseEvents === null ? 'none' : 'present'}`);

if (args['dry-run']) {
  console.log('');
  console.log('DRY RUN — nothing written. Re-run without --dry-run to ingest.');
  assertBaseUnchanged(beforeHashes);
  process.exit(0);
}

const newSupplementTrials = { ...supplementTrials, [manifest.candidateChemblId]: [...(supplementTrials[manifest.candidateChemblId] ?? []), narrowed] };
const newSupplementMeta = {
  ...supplementMeta,
  [`${manifest.candidateChemblId}/${result.nctId}`]: {
    sourceUrl: result.sourceUrl,
    sha256: result.sha256,
    retrievedAt: result.retrievedAt,
    publicationDoi: result.publicationDoi,
    ingestedAt: new Date().toISOString(),
    ingestionScript: 'scripts/ingest-a2-trial-evidence.mjs',
  },
};

writeFileSync(SUPPLEMENT_TRIALS_PATH, JSON.stringify(newSupplementTrials, null, 2) + '\n', 'utf8');
writeFileSync(SUPPLEMENT_META_PATH, JSON.stringify(newSupplementMeta, null, 2) + '\n', 'utf8');

assertBaseUnchanged(beforeHashes);

console.log('');
console.log(`pinned supplement  : ${SUPPLEMENT_TRIALS_PATH}`);
console.log(`pinned meta        : ${SUPPLEMENT_META_PATH}`);
console.log('base pin integrity : VERIFIED UNCHANGED');
console.log('');
console.log('Next: re-run the real analysis (e.g. `node -e "console.log(require(...))"` via a script, or `npm run e2e:gov-drug`-style E2E for LOWER_HARM) to see whether the new observation count changes the funnel verdict. Nothing here decided that — the real, unmodified funnel does.');
