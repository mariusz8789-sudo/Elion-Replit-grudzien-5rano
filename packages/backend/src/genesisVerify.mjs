/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * GENESIS VERIFY — a customer-submitted ResearchRun record in, one plain-language verdict out.
 *
 * Input is the record a ResearchRun already persists for one executed experiment, in either of its two
 * existing shapes, as bytes or as a parsed object:
 *   - the execution bundle artifact (researchRunArtifacts.mjs, kind 'genesis-research-run-execution-bundle/v1'),
 *     the file a customer receives from GET /research-runs/:id/experiments/:eid/artifact custody;
 *   - the EXPERIMENT_HANDOFF execution record (researchRunExecution.mjs, recordVersion 'research-run-execution@1').
 * Optionally the sha256 the customer was given for the file (the ArtifactRef), and, when the record names a
 * ResearchRun of this project, the hash-chained research state is used as the anchor.
 *
 * Nothing here is a second ledger, a second replay or a new pack format:
 *   hashes      the same canonicalJson + sha256 the execution record was written with
 *   anchor      getResearchRun (the hash-chained research state) + buildExecutionBundle
 *   replay      campaign/verify.mjs replayCapabilityInputs: the same replayer the Scientific Run verifier
 *               runs, pure (no verification row is written for a record that came from outside)
 * It reads only. It signs nothing: the CSRN production key does not exist yet, so every report says UNSIGNED.
 *
 * Verdicts (precedence TAMPERED > BLOCKED > DRIFT > MATCH):
 *   TAMPERED  the bytes or content contradict the record's own fingerprints, the sha256 the customer was given,
 *             or the Genesis ledger copy of the same experiment
 *   BLOCKED   verification could not be completed (unreadable, missing provenance, engine unavailable,
 *             no replay path, not an executed experiment). Neither a pass nor a fail.
 *   DRIFT     the record is self-consistent but the replay gave a different result or a different engine version
 *   MATCH     self-consistent, not contradicted by any anchor, and the replay reproduced the output
 *             within the capability's documented tolerance
 */
import { canonicalJson, sha256Hex } from './determinism.mjs';
import { canonicalHash, maxRelativeDiff } from './provenance.mjs';
import { getResearchRun } from './researchRun.mjs';
import { ARTIFACT_BUNDLE_KIND, buildExecutionBundle } from './researchRunArtifacts.mjs';
import { EXECUTION_RECORD_VERSION } from './researchRunExecution.mjs';
import { RESEARCH_RUN_EXECUTORS } from './researchRunEngines.mjs';
import { replayCapabilityInputs, replayToleranceOf } from './campaign/verify.mjs';

export const GENESIS_VERIFY_REPORT_KIND = 'GENESIS_VERIFY_REPORT';
export const GENESIS_VERIFY_VERSION = '1.0.0';
export const GENESIS_VERIFY_VERDICT = Object.freeze({ MATCH: 'MATCH', DRIFT: 'DRIFT', TAMPERED: 'TAMPERED', BLOCKED: 'BLOCKED' });
export const MAX_VERIFY_INPUT_BYTES = 5 * 1024 * 1024;
export const SIGNATURE_STATUS = 'UNSIGNED';

const SHA256 = /^[a-f0-9]{64}$/;
const PASS = 'PASS';
const FAIL = 'FAIL';
const NOT_RUN = 'NOT_RUN';

/** Provenance a record must carry before anything can be said about it. Paths are into the record. */
const REQUIRED_PROVENANCE = Object.freeze([
  ['researchRunId', 'which ResearchRun produced it'],
  ['experimentId', 'which experiment of that run'],
  ['predictionFingerprint', 'fingerprint of the prediction frozen before the engine ran'],
  ['preregistrationFingerprint', 'fingerprint of the preregistration record'],
  ['engine.engineId', 'which engine ran'],
  ['engine.engineLabel', 'the exact engine version that ran'],
  ['status', 'the engine outcome'],
  ['input', 'the exact engine input'],
  ['inputHash', 'sha256 of the input'],
  ['output', 'the exact engine output'],
  ['outputHash', 'sha256 of the output'],
]);

const MEANING = Object.freeze({
  MATCH: 'We re-ran the same computation from the inputs in your record and got the same result. The record is consistent with its own fingerprints and nothing we hold contradicts it.',
  DRIFT: 'Your record is internally consistent, but re-running the computation here gave a different result or ran on a different engine version. The result, as recorded, is not reproduced here.',
  TAMPERED: 'The content of your record does not match its own fingerprints, the file hash you were given, or the Genesis ledger copy of the same experiment. Something was changed after the result was produced. Do not rely on it.',
  BLOCKED: 'Verification could not be completed, so this is neither a pass nor a fail. The reasons are listed below.',
});

const at = (obj, dotted) => dotted.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), obj);
const present = (v) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
const short = (h) => (typeof h === 'string' ? h : null);

function parseSubmission(submission) {
  if (submission && typeof submission === 'object' && !Buffer.isBuffer(submission) && !(submission instanceof Uint8Array)) {
    const text = canonicalJson(submission);
    return { ok: true, record: submission, bytes: Buffer.from(text, 'utf8'), fromBytes: false };
  }
  if (typeof submission !== 'string' && !Buffer.isBuffer(submission) && !(submission instanceof Uint8Array)) return { ok: false, reason: 'NO_INPUT' };
  const bytes = typeof submission === 'string' ? Buffer.from(submission, 'utf8') : Buffer.from(submission);
  if (bytes.byteLength === 0) return { ok: false, reason: 'EMPTY_INPUT', bytes };
  if (bytes.byteLength > MAX_VERIFY_INPUT_BYTES) return { ok: false, reason: 'INPUT_TOO_LARGE', bytes };
  try {
    const record = JSON.parse(bytes.toString('utf8'));
    if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'NOT_A_RECORD', bytes };
    return { ok: true, record, bytes, fromBytes: true };
  } catch {
    return { ok: false, reason: 'NOT_JSON', bytes };
  }
}

function recordShapeOf(record) {
  if (record.kind === ARTIFACT_BUNDLE_KIND) return 'EXECUTION_BUNDLE';
  if (record.recordVersion === EXECUTION_RECORD_VERSION) return 'EXECUTION_RECORD';
  return 'UNKNOWN';
}

/** The record normalised to the exact bundle bytes researchRunArtifacts would write for it. */
const normalisedBundle = (record) => buildExecutionBundle(record.researchRunId, { experimentId: record.experimentId, execution: record });

function anchorAgainstLedger(db, projectId, record) {
  if (!db || !projectId) return { status: NOT_RUN, anchored: false, detail: 'No Genesis ledger was consulted for this check.' };
  const view = getResearchRun(db, projectId, record.researchRunId);
  if (!view) return { status: NOT_RUN, anchored: false, detail: `ResearchRun ${record.researchRunId} is not in this Genesis project, so there is no ledger copy to compare with.` };
  if (!view.researchState.chain.ok) return { status: FAIL, anchored: true, blocked: true, detail: 'The Genesis ledger copy of this run failed its own hash-chain check, so it cannot serve as an anchor.' };
  const experiment = view.experiments.find((e) => e.experimentId === record.experimentId);
  if (!experiment?.execution) return { status: FAIL, anchored: true, tampered: true, detail: `The Genesis ledger has run ${record.researchRunId} but no executed experiment ${record.experimentId}.` };
  const expected = JSON.parse(buildExecutionBundle(view.researchRunId ?? record.researchRunId, experiment).toString('utf8'));
  const submitted = JSON.parse(normalisedBundle(record).toString('utf8'));
  const differing = Object.keys(expected).filter((k) => canonicalJson(expected[k]) !== canonicalJson(submitted[k]));
  if (differing.length > 0) {
    return { status: FAIL, anchored: true, tampered: true, differing, ledgerHeadChainHash: view.researchState.chain.head ?? null, detail: `Differs from the Genesis ledger copy in: ${differing.join(', ')}.` };
  }
  return { status: PASS, anchored: true, ledgerHeadChainHash: view.researchState.chain.head ?? null, detail: `Identical to the experiment recorded in the hash-chained research state (chain length ${view.researchState.chain.length}).` };
}

function replayRecord(record) {
  const engineId = record.engine.engineId;
  const executor = RESEARCH_RUN_EXECUTORS[engineId];
  if (!executor) return { status: NOT_RUN, blocked: true, reason: 'UNKNOWN_ENGINE', detail: `Genesis has no ResearchRun adapter for engine '${engineId}'.` };
  if (!executor.scienceCapability) return { status: NOT_RUN, blocked: true, reason: 'REPLAY_UNSUPPORTED', detail: `Engine '${engineId}' has no bit-reproducible replay path in Genesis.` };
  const parsed = executor.parseInput(record.input);
  if (!parsed.ok || canonicalJson(parsed.input) !== canonicalJson(record.input)) {
    return { status: NOT_RUN, blocked: true, reason: 'INPUT_NOT_ACCEPTED', detail: `The recorded input is not one the ${engineId} adapter accepts as-is (${parsed.ok ? 'shape differs' : parsed.reason}).` };
  }
  const capability = executor.scienceCapability;
  const replay = replayCapabilityInputs(capability, record.input);
  if (!replay.ok) {
    const runtime = replay.error === 'BLOCKED_BY_RUNTIME';
    return { status: NOT_RUN, blocked: true, reason: runtime ? 'ENGINE_UNAVAILABLE' : 'REPLAY_FAILED', capability, detail: runtime ? `The ${engineId} engine is not available in this Genesis runtime right now.` : `Replay did not complete: ${replay.error}.` };
  }
  const replayOutputHash = sha256Hex(canonicalJson(replay.output));
  const versionChanged = replay.engineVersion != null && replay.engineVersion !== record.engine.engineLabel;
  const hashMatch = replayOutputHash === record.outputHash;
  const tolerance = replayToleranceOf(capability);
  const relDiff = hashMatch ? 0 : maxRelativeDiff(record.output, replay.output);
  const withinTolerance = hashMatch || (Number.isFinite(relDiff) && relDiff <= tolerance);
  const base = { capability, replayOutputHash, replayEngineVersion: replay.engineVersion ?? null, hashMatch, maxRelativeDiff: Number.isFinite(relDiff) ? relDiff : null, tolerance };
  if (versionChanged) return { ...base, status: FAIL, drift: true, reason: 'ENGINE_VERSION_CHANGED', detail: `Recorded engine ${record.engine.engineLabel}, this runtime has ${replay.engineVersion}; a difference cannot be attributed to the result alone.` };
  if (!withinTolerance) return { ...base, status: FAIL, drift: true, reason: 'OUTPUT_DIFFERS', detail: `Replay output differs (largest relative difference ${Number.isFinite(relDiff) ? relDiff.toExponential(2) : 'not comparable'}, tolerance ${tolerance}).` };
  return { ...base, status: PASS, detail: hashMatch ? 'Replay output is byte-identical (same sha256).' : `Replay output within the documented tolerance ${tolerance}.` };
}

/**
 * Verifies one submitted record. Pure with respect to the database: reads the research state when
 * { db, projectId } are given, writes nothing. Returns the report object; never throws on bad input.
 */
export function verifySubmittedRecord(submission, { declaredSha256 = null, db = null, projectId = null, now = () => new Date().toISOString() } = {}) {
  const checks = [];
  const reasons = [];
  let tampered = false;
  let blocked = false;
  let drift = false;
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });

  const parsed = parseSubmission(submission);
  const submittedSha256 = parsed.bytes ? sha256Hex(parsed.bytes) : null;
  const record = parsed.ok ? parsed.record : null;

  if (!parsed.ok) {
    blocked = true;
    reasons.push(parsed.reason);
    add('readable', 'The file is a readable Genesis record', FAIL, `Could not read it: ${parsed.reason}.`);
  } else {
    add('readable', 'The file is a readable Genesis record', PASS, `Read as ${recordShapeOf(record) === 'UNKNOWN' ? 'an unrecognised JSON record' : recordShapeOf(record).toLowerCase().replace('_', ' ')}.`);
  }

  // 1. File hash against the one the customer was given.
  if (declaredSha256 != null) {
    const want = String(declaredSha256).trim().toLowerCase();
    if (!SHA256.test(want)) { blocked = true; reasons.push('DECLARED_SHA256_INVALID'); add('file-hash', 'File hash equals the hash you were given', FAIL, 'The hash you supplied is not a sha256 value.'); }
    else if (!parsed.fromBytes) { add('file-hash', 'File hash equals the hash you were given', NOT_RUN, 'A parsed object was submitted, not the original file bytes, so the file hash cannot be compared.'); }
    else if (want !== submittedSha256) { tampered = true; reasons.push('FILE_HASH_MISMATCH'); add('file-hash', 'File hash equals the hash you were given', FAIL, `File sha256 ${submittedSha256} is not the ${want} you were given.`); }
    else add('file-hash', 'File hash equals the hash you were given', PASS, 'Byte-identical to the file Genesis handed over.');
  } else {
    add('file-hash', 'File hash equals the hash you were given', NOT_RUN, 'No file hash was supplied with the submission.');
  }

  // 2. Provenance completeness.
  let missing = [];
  if (record) {
    if (recordShapeOf(record) === 'UNKNOWN') missing.push('kind (not a ResearchRun execution bundle or execution record)');
    missing.push(...REQUIRED_PROVENANCE.filter(([p]) => !present(at(record, p))).map(([p, why]) => `${p} (${why})`));
    if (missing.length) { blocked = true; reasons.push('MISSING_PROVENANCE'); add('provenance', 'Required provenance is present', FAIL, `Missing: ${missing.join('; ')}.`); }
    else add('provenance', 'Required provenance is present', PASS, 'Run, experiment, frozen prediction, preregistration, engine and version, input, output and both hashes are present.');
  }
  const complete = record && missing.length === 0;

  // 3. Self-consistency of the content hashes (the same canonical sha256 the execution record was written with).
  if (complete) {
    const inputOk = sha256Hex(canonicalJson(record.input)) === record.inputHash;
    const outputOk = sha256Hex(canonicalJson(record.output)) === record.outputHash;
    if (!inputOk || !outputOk) {
      tampered = true; reasons.push('CONTENT_HASH_MISMATCH');
      add('content-hash', 'Input and output match their recorded sha256', FAIL, `${[!inputOk && 'input', !outputOk && 'output'].filter(Boolean).join(' and ')} no longer match the sha256 recorded next to them.`);
    } else add('content-hash', 'Input and output match their recorded sha256', PASS, 'Both recomputed hashes equal the recorded ones.');
  } else add('content-hash', 'Input and output match their recorded sha256', NOT_RUN, 'Skipped: the record is incomplete or unreadable.');

  // 4. Anchor in the Genesis ledger (the hash-chained ResearchRun research state), when this project has it.
  let anchor = { status: NOT_RUN, anchored: false, detail: 'Skipped: the record is incomplete or unreadable.' };
  if (complete) {
    anchor = anchorAgainstLedger(db, projectId, record);
    if (anchor.tampered) { tampered = true; reasons.push('LEDGER_MISMATCH'); }
    if (anchor.blocked) { blocked = true; reasons.push('LEDGER_CHAIN_INVALID'); }
  }
  add('ledger-anchor', 'Matches the Genesis ledger copy of this experiment', anchor.status, anchor.detail);

  // 5. Replay, only for a complete, untampered record of an executed experiment.
  let replay = { status: NOT_RUN, detail: 'Skipped: an earlier check already decided the verdict.' };
  if (complete && !tampered && !blocked) {
    if (record.status !== 'EXECUTED') {
      blocked = true; reasons.push('NOT_AN_EXECUTED_EXPERIMENT');
      replay = { status: NOT_RUN, detail: `The engine outcome is ${record.status}; there is no engine output to re-run.` };
    } else {
      replay = replayRecord(record);
      if (replay.blocked) { blocked = true; reasons.push(replay.reason); }
      if (replay.drift) { drift = true; reasons.push(replay.reason); }
    }
  }
  add('replay', 'Re-running the computation gives the same result', replay.status, replay.detail);

  const verdict = tampered ? GENESIS_VERIFY_VERDICT.TAMPERED
    : blocked ? GENESIS_VERIFY_VERDICT.BLOCKED
      : drift ? GENESIS_VERIFY_VERDICT.DRIFT
        : GENESIS_VERIFY_VERDICT.MATCH;

  const notChecked = [
    'Whether the hypothesis, question or conclusion is scientifically right. This checks that one recorded computation is intact and reproducible, nothing more.',
    'Whether the chosen input (molecule, target, parameters) was the right one for your purpose.',
    'Any other experiment, literature source or plan step of the same ResearchRun. Only this one record was checked.',
    'Laboratory, clinical or regulatory validity. No physical measurement is involved.',
    'Whether the engine licence permits your commercial use of the result.',
    `Digital signature: this report is ${SIGNATURE_STATUS}. The Genesis CSRN production signing key has not been generated, so no certificate is signed.`,
  ];
  if (!anchor.anchored) notChecked.push('Comparison with a Genesis ledger copy: none was available. A record rewritten with recomputed hashes before you received it would show up only as DRIFT on replay, not as TAMPERED.');
  if (complete && anchor.status !== PASS) notChecked.push('The preregistered prediction itself: only its fingerprint travels with the record; it was not re-derived from the preregistration.');

  const body = {
    kind: GENESIS_VERIFY_REPORT_KIND,
    version: GENESIS_VERIFY_VERSION,
    verdict,
    meaning: MEANING[verdict],
    reasons: [...new Set(reasons)],
    input: {
      shape: record ? recordShapeOf(record) : null,
      submittedSha256,
      declaredSha256: declaredSha256 ?? null,
      researchRunId: record?.researchRunId ?? null,
      experimentId: record?.experimentId ?? null,
      engine: record?.engine ? { engineId: record.engine.engineId ?? null, engineLabel: record.engine.engineLabel ?? null } : null,
      engineStatus: record?.status ?? null,
    },
    hashes: {
      submittedFileSha256: submittedSha256,
      inputHash: short(record?.inputHash),
      outputHash: short(record?.outputHash),
      predictionFingerprint: short(record?.predictionFingerprint),
      preregistrationFingerprint: short(record?.preregistrationFingerprint),
      replayOutputHash: replay.replayOutputHash ?? null,
      ledgerHeadChainHash: anchor.ledgerHeadChainHash ?? null,
    },
    replay: replay.capability ? {
      capability: replay.capability, replayEngineVersion: replay.replayEngineVersion, hashMatch: replay.hashMatch,
      maxRelativeDiff: replay.maxRelativeDiff, tolerance: replay.tolerance,
    } : null,
    checks,
    notChecked,
    signature: SIGNATURE_STATUS,
    boundary: 'Genesis Verify checks the integrity and reproducibility of one computational record. It is not peer review, not a statement of scientific truth and not a signed certificate.',
  };
  return { ...body, reportFingerprint: canonicalHash(body), generatedAt: now() };
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS_WORD = { PASS: 'Passed', FAIL: 'Failed', NOT_RUN: 'Not run' };
const VERDICT_TONE = { MATCH: '#1f7a3f', DRIFT: '#a15c00', TAMPERED: '#b42318', BLOCKED: '#475467' };

/** One self-contained, phone-readable HTML page for the customer. No scripts, no external resources. */
export function renderVerifyReportHtml(report) {
  const hashRows = Object.entries(report.hashes).filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd><code>${esc(v)}</code></dd>`).join('');
  const checkRows = report.checks.map((c) => `<li class="c ${esc(c.status)}"><b>${esc(STATUS_WORD[c.status] ?? c.status)}</b> · ${esc(c.label)}<br><span>${esc(c.detail)}</span></li>`).join('');
  const notRows = report.notChecked.map((n) => `<li>${esc(n)}</li>`).join('');
  const tone = VERDICT_TONE[report.verdict] ?? '#475467';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Genesis Verify report</title>
<style>
body{margin:0;background:#fff;color:#101828;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:40rem;margin:0 auto;padding:16px}
h1{font-size:1.1rem;margin:0 0 4px}h2{font-size:1rem;margin:20px 0 6px}
.v{border-left:6px solid ${tone};padding:8px 12px;background:#f9fafb}
.v strong{display:block;font-size:1.6rem;color:${tone};letter-spacing:.02em}
ul{padding-left:18px;margin:0}li{margin:6px 0}.c span{color:#475467;font-size:.92rem}
.FAIL b{color:#b42318}.PASS b{color:#1f7a3f}.NOT_RUN b{color:#475467}
dl{margin:0}dt{font-size:.85rem;color:#475467;margin-top:6px}dd{margin:0}code{font-size:.8rem;word-break:break-all}
footer{margin-top:20px;font-size:.85rem;color:#475467}
</style></head><body><main>
<h1>Genesis Verify report</h1>
<section class="v"><strong>${esc(report.verdict)}</strong>${esc(report.meaning)}</section>
<h2>What was submitted</h2>
<p>ResearchRun <code>${esc(report.input.researchRunId ?? 'unknown')}</code>, experiment <code>${esc(report.input.experimentId ?? 'unknown')}</code>, engine ${esc(report.input.engine?.engineId ?? 'unknown')} ${esc(report.input.engine?.engineLabel ?? '')}.</p>
<h2>What was checked</h2><ul>${checkRows}</ul>
<h2>Hashes</h2><dl>${hashRows}</dl>
<h2>What was NOT checked</h2><ul>${notRows}</ul>
<footer>Signature: ${esc(report.signature)}. ${esc(report.boundary)}<br>Report fingerprint <code>${esc(report.reportFingerprint)}</code> · ${esc(report.generatedAt)}</footer>
</main></body></html>
`;
}
