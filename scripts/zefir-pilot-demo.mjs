/**
 * ZEFIR pilot demonstration dataset (Verification Mandate Mission 5).
 *
 * A small, deterministic demonstration — NOT scientific validation. Eight cases run
 * through the SAME real API product path the UI uses (`handleApi`). For each case it prints
 * the structured proposal, the expected safe behavior, the ACTUAL API decision, the
 * certificate hash, and why the result occurred. Exits non-zero if any case deviates.
 */
import { openDatabase } from '../packages/backend/src/store.mjs';
import { handleApi } from '../packages/backend/src/api.mjs';
import * as fk from '../packages/backend/src/cognitive/formalKernel.mjs';

const db = openDatabase(':memory:');
const call = (method, pathname, opts = {}) => handleApi(db, { method, pathname, ...opts });
const user = (email) => call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body.token;
const project = (token, name) => call('POST', '/api/projects', { token, body: { name } }).body.project.id;
const analyze = (token, pid, body) => call('POST', `/api/projects/${pid}/truth-analyses`, { token, body });

const FMA = { symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] };
let pass = 0; let fail = 0;
const log = (...a) => console.log(...a);

function present(n, title, proposal, expected, res, why) {
  const a = res.body?.analysis;
  const dec = a?.decision?.decision ?? `HTTP ${res.status} ${res.body?.error ?? ''}`;
  const ok = typeof expected === 'function' ? expected(res) : dec === expected;
  if (ok) pass++; else fail++;
  log(`\nCASE ${n} — ${title}`);
  log(`  proposal:  ${JSON.stringify(proposal)}`);
  log(`  expected:  ${typeof expected === 'function' ? '(predicate)' : expected}`);
  log(`  actual:    ${dec}   ${ok ? '✔' : '✘'}`);
  if (a?.certificate) log(`  cert hash: ${a.certificate.decisionHash.slice(0, 24)}…`);
  log(`  why:       ${why}`);
}

const token = user('pilot@zefir.io');
const pid = project(token, 'Pilot Demo');

log('=== ZEFIR PILOT DEMONSTRATION DATASET (real API path) ===');
log('NOTE: a demonstration, not scientific validation.');

// CASE 1 — consistent classical engineering → GO or justified WARN
{
  const p = { claimedResult: 'period ~ sqrt(l/g)', equations: [FMA], assumptions: ['small angle', 'rigid rod', 'no air resistance'], efficiency: 0.8, energy: { input: 100, output: 70 } };
  present(1, 'consistent classical engineering', p, (r) => ['GO', 'WARN'].includes(r.body.analysis.decision.decision), analyze(token, pid, p),
    'no encoded contradiction under supplied inputs; assumptions stated; energy/efficiency within bounds.');
}
// CASE 2 — energy-accounting contradiction → BLOCK
{
  const p = { claimedResult: 'net generator', assumptions: ['a'], energy: { input: 100, output: 180 } };
  present(2, 'energy-accounting contradiction', p, 'BLOCK', analyze(token, pid, p),
    'output 180 exceeds available energy 100 (First Law) — deterministic over-unity violation.');
}
// CASE 3 — flow/volume/time contradiction → BLOCK
{
  const p = { claimedResult: 'pump throughput', assumptions: ['a'], flow: { volumetricFlow: 9, volume: 20, time: 10 } };
  present(3, 'flow/volume/time contradiction', p, 'BLOCK', analyze(token, pid, p),
    'Q=9 contradicts V/t=2 — definitional identity Q=V/t violated with exact numbers.');
}
// CASE 4 — explicit material operating-limit violation → BLOCK
{
  const p = { claimedResult: 'run hot', assumptions: ['a'], materials: [{ name: 'PVC', maxTemp: 60 }], operating: { temperature: { value: 120 } } };
  present(4, 'material operating-limit violation', p, 'BLOCK', analyze(token, pid, p),
    'operating 120°C exceeds the supplied PVC limit 60°C — provable spec violation.');
}
// CASE 5 — insufficient technical content → INSUFFICIENT_DATA
{
  const p = { problemStatement: 'the future of everything', claimedResult: 'it will work' };
  present(5, 'insufficient technical content', p, 'INSUFFICIENT_DATA', analyze(token, pid, p),
    'no checkable structured content — the engine refuses to manufacture a verdict.');
}
// CASE 6 — unsupported specialist science → NOT GO + explicit capability gap
{
  const p = { claimedResult: 'aeration system', assumptions: ['a'], flow: { volumetricFlow: 2, volume: 20, time: 10 }, requestedDomains: ['oxygen-transfer-efficiency'] };
  present(6, 'unsupported specialist science', p, (r) => r.body.analysis.decision.decision !== 'GO' && r.body.analysis.decision.capabilityGaps.includes('oxygen-transfer-efficiency'), analyze(token, pid, p),
    'oxygen-transfer science is not encoded → honest capability gap, no fabricated certainty.');
}
// CASE 7 — same-tenant proposal influenced by Necropolis → GO then BLOCK
{
  const base = { claimedResult: 'run at T=905', equations: [FMA], assumptions: ['a'], context: 'reactor7', parameterVector: { T: 905 }, scales: { T: 900 } };
  const before = analyze(token, pid, base);
  call('POST', `/api/projects/${pid}/necropolis/failures`, { token, body: { failureClass: 'FAILED_PARAMETER_REGION', context: 'reactor7', domain: 'thermal', parameterVector: { T: 900 }, scales: { T: 900 } } });
  const after = analyze(token, pid, base);
  const ok = before.body.analysis.decision.decision !== 'BLOCK' && after.body.analysis.decision.decision === 'BLOCK';
  if (ok) pass++; else fail++;
  log(`\nCASE 7 — same-tenant Necropolis influence`);
  log(`  before recording failure: ${before.body.analysis.decision.decision}`);
  log(`  after recording failure:  ${after.body.analysis.decision.decision}   ${ok ? '✔' : '✘'}`);
  log(`  why:       accumulated tenant failure memory materially changed the decision (GO→BLOCK).`);
}
// CASE 8 — cross-tenant isolation attempt → victim NOT influenced, cross-read 404
{
  const tokV = user('victim8@zefir.io'); const pidV = project(tokV, 'Victim');
  const base = { claimedResult: 'run at T=905', equations: [FMA], assumptions: ['a'], context: 'reactor7', parameterVector: { T: 905 }, scales: { T: 900 } };
  const victim = analyze(tokV, pidV, base); // attacker (pid) has the dead end recorded in CASE 7
  const crossRead = call('GET', `/api/projects/${pid}/truth-analyses`, { token: tokV });
  const ok = victim.body.analysis.decision.decision !== 'BLOCK' && crossRead.status === 404;
  if (ok) pass++; else fail++;
  log(`\nCASE 8 — cross-tenant isolation attempt`);
  log(`  victim decision (must NOT be BLOCK): ${victim.body.analysis.decision.decision}`);
  log(`  victim reads attacker history:       HTTP ${crossRead.status} (must be 404)   ${ok ? '✔' : '✘'}`);
  log(`  why:       tenant memory is strictly project-scoped; no cross-tenant read or influence.`);
}

log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
db.close();
process.exit(fail === 0 ? 0 : 1);
