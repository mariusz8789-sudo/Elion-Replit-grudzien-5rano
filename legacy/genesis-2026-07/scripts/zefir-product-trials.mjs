/**
 * ZEFIR product trials A–I (Commercial Hardening — Phase 6).
 *
 * Runs deterministic end-to-end trials through the SAME product path the UI uses:
 * the real HTTP router `handleApi` → real Truth Engine → real Constraint Registry →
 * tenant Necropolis. No trial bypasses the API by calling an internal function directly.
 *
 * Honest by construction: it asserts the decision each trial MUST produce and prints the
 * real certificate hash. Where a domain is unencoded (water science), it shows the honest
 * capability gap rather than fabricating expertise.
 */
import { openDatabase } from '../packages/backend/src/store.mjs';
import { handleApi } from '../packages/backend/src/api.mjs';
import * as fk from '../packages/backend/src/cognitive/formalKernel.mjs';

const db = openDatabase(':memory:');
const call = (method, pathname, opts = {}) => handleApi(db, { method, pathname, ...opts });
let pass = 0; let fail = 0;
const log = (...a) => console.log(...a);
function check(name, cond, detail = '') {
  if (cond) { pass++; log(`  ✔ ${name}`); }
  else { fail++; log(`  ✘ ${name} ${detail}`); }
}

function user(email) {
  const r = call('POST', '/api/auth/register', { body: { email, password: 'password123' } });
  return r.body.token;
}
function project(token, name) {
  const r = call('POST', '/api/projects', { token, body: { name } });
  return r.body.project.id;
}
function analyze(token, pid, proposal) {
  const r = call('POST', `/api/projects/${pid}/truth-analyses`, { token, body: proposal });
  return r;
}
const FMA = { symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] };
const EeqF = { symbol: 'E=F', terms: [{ symbol: 'E', dimension: fk.DIM.ENERGY }, { symbol: 'F', dimension: fk.DIM.FORCE }] };

const token = user('trials@zefir.io');
const pid = project(token, 'Trials');

log('\n=== ZEFIR PRODUCT TRIALS A–I (real API path) ===\n');

// TRIAL A — VALID ENGINEERING → GO (or honestly-qualified WARN)
log('TRIAL A — valid classical engineering');
{
  const r = analyze(token, pid, { claimedResult: 'period ~ sqrt(l/g)', equations: [FMA], assumptions: ['small angle', 'rigid rod', 'no air resistance'] });
  const d = r.body.analysis.decision.decision;
  check('decision is GO or WARN', d === 'GO' || d === 'WARN', `(got ${d})`);
  log(`    → ${d}  hash ${r.body.analysis.certificate.decisionHash.slice(0, 16)}…`);
}

// TRIAL B — HYPE HIDING DIMENSIONAL FAILURE → BLOCK
log('TRIAL B — revolutionary marketing hides a dimensional error');
{
  const plain = analyze(token, pid, { claimedResult: 'E=F', equations: [EeqF], assumptions: ['a'] });
  const hyped = analyze(token, pid, { problemStatement: 'REVOLUTIONARY NOBEL-WORTHY BREAKTHROUGH!!!', claimedResult: 'E=F', equations: [EeqF], assumptions: ['a'] });
  check('hyped proposal is BLOCK', hyped.body.analysis.decision.decision === 'BLOCK');
  check('marketing did NOT change the decision', plain.body.analysis.decision.decision === hyped.body.analysis.decision.decision);
  log(`    → plain ${plain.body.analysis.decision.decision}, hyped ${hyped.body.analysis.decision.decision}`);
}

// TRIAL C — EXPENSIVE WEAK ASSUMPTION → WARN/BLOCK + cheapest-falsification targeting it
log('TRIAL C — one expensive weak assumption');
{
  const r = analyze(token, pid, { claimedResult: 'device hits target X', equations: [FMA], requiredCapabilities: ['cryo-em-refinement'], estimatedCost: '2,000,000 EUR' });
  const d = r.body.analysis.decision;
  check('decision is WARN or BLOCK', d.decision === 'WARN' || d.decision === 'BLOCK', `(got ${d.decision})`);
  check('a cheapest-falsification test is recommended', !!d.cheapestFalsificationTest);
  log(`    → ${d.decision}, cheapest test: ${d.cheapestFalsificationTest?.recommendedTestType}`);
}

// TRIAL D — INSUFFICIENT CONTENT → INSUFFICIENT_DATA
log('TRIAL D — hype with no substance');
{
  const r = analyze(token, pid, { problemStatement: 'World-changing paradigm shift', claimedResult: 'It will change everything' });
  check('decision is INSUFFICIENT_DATA', r.body.analysis.decision.decision === 'INSUFFICIENT_DATA', `(got ${r.body.analysis.decision.decision})`);
  log(`    → ${r.body.analysis.decision.decision}`);
}

// TRIAL E — NECROPOLIS MEMORY → accumulated failure materially changes the decision
log('TRIAL E — tenant failure memory changes a later decision');
{
  const before = analyze(token, pid, { claimedResult: 'run at T=905', equations: [FMA], assumptions: ['a'], context: 'reactorE', parameterVector: { T: 905 }, scales: { T: 900 } });
  call('POST', `/api/projects/${pid}/necropolis/failures`, { token, body: { failureClass: 'FAILED_PARAMETER_REGION', context: 'reactorE', domain: 'thermal', parameterVector: { T: 900 }, scales: { T: 900 } } });
  const after = analyze(token, pid, { claimedResult: 'run at T=905', equations: [FMA], assumptions: ['a'], context: 'reactorE', parameterVector: { T: 905 }, scales: { T: 900 } });
  check('before recording: not BLOCK', before.body.analysis.decision.decision !== 'BLOCK', `(got ${before.body.analysis.decision.decision})`);
  check('after recording: BLOCK (memory changed the decision)', after.body.analysis.decision.decision === 'BLOCK');
  log(`    → before ${before.body.analysis.decision.decision}, after ${after.body.analysis.decision.decision}`);
}

// TRIAL F — OUTSIDE CAPABILITY → WARN/INSUFFICIENT + capability gap, no fabricated certainty
log('TRIAL F — proposal outside encoded capability');
{
  const r = analyze(token, pid, { claimedResult: 'x', equations: [FMA], assumptions: ['a'], requiredCapabilities: ['exotic-capability-not-installed'] });
  const d = r.body.analysis.decision;
  check('decision is WARN or INSUFFICIENT_DATA (never GO)', d.decision === 'WARN' || d.decision === 'INSUFFICIENT_DATA', `(got ${d.decision})`);
  check('capability gap reported', d.capabilityGaps.includes('exotic-capability-not-installed'));
  log(`    → ${d.decision}, gaps: ${d.capabilityGaps.join(', ')}`);
}

// TRIAL G — REPRODUCIBILITY → same canonical proposal twice = same decision hash
log('TRIAL G — reproducibility');
{
  const body = { claimedResult: 'x', equations: [FMA], assumptions: ['a', 'b'] };
  const a = analyze(token, pid, body); const b = analyze(token, pid, body);
  check('same decision hash', a.body.analysis.certificate.decisionHash === b.body.analysis.certificate.decisionHash);
  check('same decision', a.body.analysis.decision.decision === b.body.analysis.decision.decision);
  log(`    → ${a.body.analysis.certificate.decisionHash.slice(0, 24)}…`);
}

// TRIAL H — TENANT ISOLATION ATTACK → tenant B not influenced by tenant A's Necropolis
log('TRIAL H — hostile tenant-isolation attack');
{
  const tokA = user('attackerA@zefir.io'); const pidA = project(tokA, 'A');
  const tokB = user('victimB@zefir.io'); const pidB = project(tokB, 'B');
  call('POST', `/api/projects/${pidA}/necropolis/failures`, { token: tokA, body: { failureClass: 'F', context: 'reactorH', parameterVector: { T: 900 }, scales: { T: 900 } } });
  const bResult = analyze(tokB, pidB, { claimedResult: 'run at T=905', equations: [FMA], assumptions: ['a'], context: 'reactorH', parameterVector: { T: 905 }, scales: { T: 900 } });
  check('tenant B is NOT blocked by tenant A memory', bResult.body.analysis.decision.decision !== 'BLOCK');
  const cross = call('GET', `/api/projects/${pidA}/truth-analyses`, { token: tokB });
  check('tenant B cannot read tenant A history (404)', cross.status === 404);
  log(`    → B decision ${bResult.body.analysis.decision.decision}, cross-read status ${cross.status}`);
}

// TRIAL I — ZEFIR WATER ARCHITECTURE TRIAL (domain-pack feasibility, honest gaps)
log('TRIAL I — ZEFIR WATER architecture trial (NOT a complete water platform)');
{
  // Consistent design: aeration basin. Q = V/t consistent, P = E/t consistent. But the
  // deep water science (oxygen-transfer efficiency, reaeration) is explicitly UNSUPPORTED.
  const consistent = analyze(token, pid, {
    problemStatement: 'Aeration basin sizing before detailed design',
    claimedResult: 'basin turns over volume at the stated flow',
    assumptions: ['steady state', 'incompressible water', 'well-mixed'],
    flow: { volumetricFlow: 2, volume: 7200, time: 3600 },      // 2 m³/s = 7200 m³ / 3600 s  ✓
    power: { power: 50000, energy: 180000000, time: 3600 },     // 50 kW = 180 MJ / 3600 s     ✓
    operating: { temperature: { value: 15, max: 40 } },
    materials: [{ name: 'HDPE liner', maxTemp: 60 }],
    requestedDomains: ['oxygen-transfer-efficiency', 'reaeration'],
    expectedPerformance: 'SOTR target (claimed, not verified here)',
  });
  const dc = consistent.body.analysis.decision;
  check('consistent hydraulics/power do NOT produce a false BLOCK', dc.decision !== 'BLOCK', `(got ${dc.decision})`);
  check('water deep-science reported as UNSUPPORTED capability gap (no fabricated expertise)', dc.unsupportedDomains.length >= 1 && dc.capabilityGaps.includes('oxygen-transfer-efficiency'));
  log(`    → consistent design: ${dc.decision}; honest gaps: ${dc.unsupportedDomains.map((u) => u.domain).join(', ')}`);

  // Now an INCONSISTENT water proposal: flow trio contradicts itself → provable BLOCK.
  const inconsistent = analyze(token, pid, {
    problemStatement: 'Aeration basin with contradictory hydraulics',
    claimedResult: 'treats the stated volume',
    assumptions: ['steady state'],
    flow: { volumetricFlow: 10, volume: 7200, time: 3600 },     // 10 ≠ 7200/3600 = 2  ✗
  });
  check('contradictory flow (Q≠V/t) is BLOCKed with exact numbers', inconsistent.body.analysis.decision.decision === 'BLOCK');
  const viol = inconsistent.body.analysis.decision.constraintViolations.find((c) => c.id === 'flow-volume-time');
  check('violation names flow-volume-time with numbers', !!viol);
  log(`    → inconsistent design: ${inconsistent.body.analysis.decision.decision} — ${viol?.detail}`);
}

log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
db.close();
process.exit(fail === 0 ? 0 : 1);
