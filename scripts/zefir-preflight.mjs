/**
 * ZEFIR PRE-FLIGHT — commercial minimum product surface (Phase F).
 *
 * The R&D Kill-Switch as a one-command CLI: feed a research proposal (JSON), get an
 * explainable GO / WARN / BLOCK / INSUFFICIENT_DATA decision, the cheapest falsification
 * test to run next, and a hashed, reproducible decision certificate — BEFORE spending
 * money, compute, lab-time, or expert-hours.
 *
 * Usage:
 *   node scripts/zefir-preflight.mjs <proposal.json> [--db path.sqlite] [--json]
 *   node scripts/zefir-preflight.mjs --demo
 *   cat proposal.json | node scripts/zefir-preflight.mjs -
 *
 * This composes ONLY already-verified deterministic engines. It invents no science and
 * makes no correctness claim: a GO is NECESSARY, not sufficient. BLOCK means "under the
 * supplied assumptions/constraints/evidence and encoded checks, continuation is not
 * justified" — never "impossible in all conceivable universes".
 */
import { readFileSync } from 'node:fs';
import { openDatabase } from '../packages/backend/src/store.mjs';
import * as te from '../packages/backend/src/cognitive/truthEngine.mjs';
import * as fk from '../packages/backend/src/cognitive/formalKernel.mjs';

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m' };
const DECISION_COLOR = { GO: C.green, WARN: C.yellow, BLOCK: C.red, INSUFFICIENT_DATA: C.gray };
const DECISION_GLYPH = { GO: '✔ GO', WARN: '▲ WARN', BLOCK: '✖ BLOCK', INSUFFICIENT_DATA: '◌ INSUFFICIENT_DATA' };

/** A self-contained demo proposal that exercises the full pipeline (dimensionally clean, classical). */
function demoProposal() {
  return {
    problemStatement: 'Estimate the small-oscillation period of a rigid pendulum before booking cluster time.',
    claimedResult: 'period scales as sqrt(l/g)',
    equations: [{ symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] }],
    assumptions: ['small angle', 'rigid rod', 'no air resistance'],
    requiredCapabilities: ['molecular-descriptors'],
  };
}

function readProposal(argv) {
  const positional = argv.find((a) => !a.startsWith('--'));
  if (argv.includes('--demo')) return demoProposal();
  if (positional === '-' || (!positional && !argv.includes('--demo'))) {
    const raw = readFileSync(0, 'utf8').trim();
    if (!raw) { console.error('No proposal on stdin. Try: node scripts/zefir-preflight.mjs --demo'); process.exit(2); }
    return JSON.parse(raw);
  }
  return JSON.parse(readFileSync(positional, 'utf8'));
}

function renderHuman(result) {
  const d = result.decision; const col = DECISION_COLOR[d.decision] ?? C.reset;
  const line = '─'.repeat(64);
  const out = [];
  out.push(`${C.bold}${C.cyan}ZEFIR R&D KILL-SWITCH — PRE-FLIGHT DECISION${C.reset}`);
  out.push(C.gray + line + C.reset);
  out.push(`  Decision:        ${col}${C.bold}${DECISION_GLYPH[d.decision]}${C.reset}`);
  out.push(`  Decision strength: ${d.decisionStrength}  ${C.dim}(fraction of applicable checks that actually ran)${C.reset}`);
  out.push(`  Proposal hash:   ${C.dim}${result.proposalHash.slice(0, 16)}…${C.reset}`);
  out.push(`  Decision hash:   ${C.dim}${result.certificate.decisionHash.slice(0, 16)}…${C.reset} ${C.dim}(reproducible)${C.reset}`);
  out.push(C.gray + line + C.reset);

  const stageGlyph = { EXECUTED: `${C.green}ran${C.reset}`, BLOCK: `${C.red}BLOCK${C.reset}`, WARN: `${C.yellow}warn${C.reset}`, SKIPPED: `${C.gray}skip${C.reset}` };
  out.push(`  ${C.bold}Pipeline:${C.reset}`);
  for (const s of result.stages) {
    const tag = stageGlyph[s.status] ?? s.status;
    const why = s.status === 'SKIPPED' && s.missing.length ? `${C.gray} — missing: ${s.missing.join(', ')}${C.reset}` : '';
    out.push(`    ${tag.padEnd(20)} ${s.stage}${why}`);
  }
  out.push(C.gray + line + C.reset);

  if (d.criticalFailures.length) { out.push(`  ${C.red}${C.bold}Reasons to KILL:${C.reset}`); d.criticalFailures.forEach((r) => out.push(`    ${C.red}✖${C.reset} ${r}`)); }
  if (d.dimensionalInconsistencies.length) out.push(`    ${C.red}dimensional inconsistencies:${C.reset} ${d.dimensionalInconsistencies.join(', ')}`);
  if (d.physicalConstraintViolations.length) out.push(`    ${C.red}physical violations:${C.reset} ${d.physicalConstraintViolations.join(', ')}`);
  if (d.missingInformation.length) out.push(`  ${C.yellow}Missing information (first-class):${C.reset} ${d.missingInformation.join(', ')}`);
  if (d.capabilityGaps.length) out.push(`  ${C.yellow}Capability gaps:${C.reset} ${d.capabilityGaps.join(', ')}`);
  if (d.reasonsNotToKill.length) { out.push(`  ${C.green}What held up:${C.reset}`); d.reasonsNotToKill.forEach((r) => out.push(`    ${C.green}✔${C.reset} ${r}`)); }

  const f = d.cheapestFalsificationTest;
  if (f) {
    out.push(C.gray + line + C.reset);
    out.push(`  ${C.bold}${C.cyan}Cheapest next test (highest information / lowest cost):${C.reset}`);
    out.push(`    target:   ${f.targetAssumption}`);
    out.push(`    test:     ${f.recommendedTestType} ${C.dim}(${f.relativeCostClass})${C.reset}`);
    out.push(`    input:    ${f.requiredInput}`);
    out.push(`    ${C.dim}${f.priorityReason}${C.reset}`);
    if (f.expertReviewRequested) out.push(`    ${C.yellow}⇒ requests domain-expert review (design outside encoded capability)${C.reset}`);
  }
  out.push(C.gray + line + C.reset);
  out.push(`  ${C.dim}${d.boundedClaim}${C.reset}`);
  return out.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/zefir-preflight.mjs <proposal.json|-|--demo> [--db path] [--json]');
    process.exit(0);
  }
  let proposal;
  try { proposal = readProposal(argv); }
  catch (e) { console.error(`Could not read proposal: ${e.message}`); process.exit(2); }

  const dbIdx = argv.indexOf('--db');
  const db = dbIdx >= 0 && argv[dbIdx + 1] ? openDatabase(argv[dbIdx + 1]) : null;
  const result = te.analyze(proposal, { db });
  if (db) db.close();

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ proposalHash: result.proposalHash, decision: result.decision, certificate: result.certificate }, null, 2));
  } else {
    console.log(renderHuman(result));
  }
  // Exit code encodes the decision so CI/pipelines can gate on it.
  const code = { GO: 0, WARN: 0, INSUFFICIENT_DATA: 3, BLOCK: 1 }[result.decision.decision] ?? 1;
  process.exit(code);
}

main();
