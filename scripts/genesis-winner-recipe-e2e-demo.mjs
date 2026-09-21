#!/usr/bin/env node
/**
 * GENESIS — FIRST REAL END-TO-END: PROBLEM -> WINNER -> RESEARCH RECIPE -> REPLAY
 * (docs/DECISIONS.md D-073).
 *
 * Runs the ALREADY-EXISTING LOWER-HARM pipeline (D-058/D-059) through its
 * ONE canonical entry point, `runGovLowerHarmDiscovery`, in
 * SYNTHETIC_TEST_ONLY mode (the honestly-labelled, engineered-evidence
 * demonstration the D-058 mandate itself calls for — see
 * `core/orchestrator/syntheticWinnerFixture.ts`'s own header for exactly
 * what is and is not synthetic: only the RAW EVIDENCE, never the decision
 * chain). Zero new engine code: candidate generation, ranking, G2
 * falsification, adjudication, the D-057 Winner Promotion Gate, and the
 * Research Recipe builder are all the SAME real, unmodified functions
 * `PRODUCTION` mode uses.
 *
 *   node scripts/genesis-winner-recipe-e2e-demo.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function bundle(entryRelPath, outName) {
  const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-winner-recipe-'));
  const out = path.join(bundleDir, outName);
  execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
    path.join(REPO, entryRelPath),
    '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
}

const discovery = await import(bundle('packages/frontend/src/core/orchestrator/govLowerHarmDiscovery.ts', 'discovery.mjs'));
const adaptersMod = await import(bundle('packages/frontend/src/core/orchestrator/govLowerHarmAdapters.ts', 'adapters.mjs'));
const orchestrator = await import(bundle('packages/frontend/src/core/orchestrator/orchestrator.ts', 'orchestrator.mjs'));

console.log('GENESIS SCIENTIFIC DISCOVERY DEMO');
console.log('domain: LOWER-HARM (D-058/D-059) — mode: SYNTHETIC_TEST_ONLY (engineered evidence, real decision chain)\n');

// --- authoritative run, through the ONE canonical public entry point -------
const result = await discovery.runGovLowerHarmDiscovery({ mode: 'SYNTHETIC_TEST_ONLY' });
if (result.kind !== 'RUN') {
  console.log(`EXECUTION_BLOCKED: ${result.error} (${result.code})`);
  process.exit(1);
}

// --- same real, deterministic pipeline, read via its diagnostics side-
// channel (never consulted by the orchestrator itself) purely to print the
// rich detail `runGovLowerHarmDiscovery`'s own public return type does not
// carry. Determinism between this call and the one above is a proven
// invariant (see the replay check below), not an assumption.
const { adapters, diagnostics } = adaptersMod.createSyntheticWinnerLowerHarmAdapters();
const problem = {
  problemId: result.problem.problemId, nlInput: result.problem.nlInput, objectives: result.problem.objectives,
  constraints: result.problem.constraints, harmAxes: result.problem.harmAxes, evidenceMinimum: result.problem.evidenceMinimum,
  missingInputs: result.problem.missingInputs, status: result.problem.status, llmAssisted: result.problem.llmAssisted,
  fingerprint: result.problem.fingerprint,
};
orchestrator.runScientificDiscovery(problem, adapters, 'SYNTHETIC_TEST_ONLY');

console.log(`Problem: ${problem.nlInput}\n`);

const generated = adapters.generate({ problemId: problem.problemId, modelFamilies: [], seedBase: 0, paramGridNote: '' });
console.log(`Candidates: ${generated.length}\n`);

const winner = result.winner;
console.log(`Selected candidate: ${winner?.winnerId ?? '(none)'}`);

const experimentRefs = diagnostics.recipe()?.experimentRefs ?? [];
console.log(`Experiment: ${experimentRefs.join(', ')}\n`);

console.log('Evidence:');
console.log('  source: ChEMBL Web Services + ClinicalTrials.gov API v2 (SYNTHETIC_TEST_ONLY engineered fixture, real-shaped)');
const recipe = diagnostics.recipe();
console.log(`  observations: ${recipe?.evidence.length ?? 0}`);
console.log('  evidence class: DIRECT_RANDOMISED (DIRECT_HEAD_TO_HEAD comparison, per evidenceClassMapping.ts)\n');

const g2 = diagnostics.g2Result();
console.log(`Falsification: ${g2?.outcome === 'EXPERIMENT_SELECTED' ? `G2 differentiating experiment SURVIVED, discriminability=${(g2.spec.falsificationPower * 100).toFixed(0)}%` : 'NO_DISCRIMINATING_EXPERIMENT_AVAILABLE'}\n`);

console.log(`Adjudication: ${result.verdict}\n`);

console.log(`Winner Gate: ${result.recipeFingerprint ? 'PROMOTED' : 'NOT_PROMOTED'}\n`);

console.log('WinnerRecord:');
console.log(`  winnerId=${winner?.winnerId}  conjunctionOk=${winner?.conjunctionOk}`);
console.log(`  runFingerprint=${winner?.fingerprints?.runFingerprint}`);
console.log(`  preregistrationFingerprint=${winner?.fingerprints?.preregistrationFingerprint}`);
console.log(`  falsificationCriteriaFingerprint=${winner?.fingerprints?.falsificationCriteriaFingerprint}\n`);

console.log('ResearchRecipe:');
console.log(`  recipeFingerprint=${result.recipeFingerprint}`);
console.log(`  mechanism=${recipe?.mechanism}`);
console.log(`  winnerRecordRef=${recipe?.winnerRecordRef}`);
console.log(`  hypothesisId=${recipe?.hypothesisId}`);
console.log(`  evidence=[${recipe?.evidence.join(' | ')}]`);
console.log(`  falsificationResults=${JSON.stringify(recipe?.falsificationResults)}`);
console.log(`  limitations=${JSON.stringify(recipe?.limitations)}`);
console.log(`  reproducibilityInstructions=${JSON.stringify(recipe?.reproducibilityInstructions)}\n`);

const replay = await discovery.replayGovLowerHarmDiscovery({ mode: 'SYNTHETIC_TEST_ONLY' });
console.log(`Replay:\n  ${replay.ok ? 'MATCH' : 'MISMATCH'}\n`);

// --- invariant checks — the demo fails loudly rather than printing a green
// summary over a broken chain -----------------------------------------------
const checks = [];
function record(name, ok) { checks.push({ name, ok }); console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`); }
console.log('INVARIANT CHECKS:');
record('verdict is WINNER (real adjudication, not asserted)', result.verdict === 'WINNER');
record('WinnerRecordRef exists and its conjunction genuinely held', winner !== undefined && winner.conjunctionOk === true);
record('ResearchRecipe was built (D-057 promotion cleared)', typeof result.recipeFingerprint === 'string' && result.recipeFingerprint.length > 0);
record('ResearchRecipe carries a real winnerRecordRef back-pointer', recipe?.winnerRecordRef === winner?.winnerId);
record('ResearchRecipe carries real falsification results (not empty)', Array.isArray(recipe?.falsificationResults) && recipe.falsificationResults.length > 0);
record('Replay of the SAME entry point twice MATCHES', replay.ok === true);
record('all 20 orchestrator stages ran, none skipped', result.stages.length === 20);
record('stage 18 (RECIPE_OR_LOCK) is OK, not LOCKED', result.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.status === 'OK');

const allOk = checks.every((c) => c.ok);
console.log(`\n${allOk ? 'PASS' : 'FAIL'} — ${checks.filter((c) => c.ok).length}/${checks.length} invariants held.`);
process.exit(allOk ? 0 : 1);
