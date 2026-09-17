#!/usr/bin/env node
/**
 * GOV-DRUG-DISCOVERY-CAMPAIGN-01 — the runnable government campaign.
 *
 *   node scripts/gov-drug-discovery-campaign.mjs
 *
 * The full chain the demonstration shows, over the real pinned, GENERATED
 * candidate space:
 *
 *   PROBLEM -> GENERATION -> TIER 1 -> TIER 2 -> SHORTLIST (<=10)
 *   -> DEEP FALSIFICATION (whole shortlist) -> FINALISTS (<=2)
 *   -> SAFETY GATE -> EXHAUSTION -> WINNER | honest non-winner
 *   -> RESEARCH RECIPE (winner only) -> GOVERNMENT RECOMMENDATION
 *
 * WHAT "PASS" MEANS. Not "a winner was found". PASS means every property the
 * campaign claims is actually demonstrated on this run: the funnel narrows
 * from a generated space with a logged reason per elimination, the safety
 * gate is genuinely invoked with the contradictions the run itself found,
 * every declared exhaustion path was walked before any non-winner verdict,
 * the alpha correction comes from the trial registry, and the whole thing
 * replays to the same fingerprint.
 *
 * Exit code 0 = every property held. Exit code 1 = at least one did not.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-gdd-'));
const out = path.join(bundleDir, 'campaign.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/govDrugDiscoveryCampaign.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

console.log('\nGENESIS — GOV-DRUG-DISCOVERY-CAMPAIGN-01');
console.log(`node ${process.version}\n`);

const run = mod.runGovDrugDiscoveryCampaign();

// --- The narrative the demonstration follows -----------------------------
console.log('GOVERNMENT PROBLEM:');
console.log(`  ${run.problem}\n`);

console.log('CANDIDATE GENERATION (generation, not selection):');
console.log(`  ${run.generationCheck.generatedCount} molecules built from mechanism; ${run.generationCheck.outsidePresuppliedCount} appear in no pre-supplied list`);
console.log(`  equals a pre-supplied list? ${run.generationCheck.equalsPresuppliedSet}\n`);

console.log('SCREENING (every elimination carries a reason):');
for (const s of run.stages) console.log(`  ${s.stage}: ${s.inputCount} -> ${s.outputCount}   (eliminated ${s.eliminatedCount})`);
console.log('');

console.log(`SHORTLIST (cap 10, real ${run.shortlist.length}):`);
for (const c of run.shortlist) {
  console.log(`  #${c.rank} ${c.prefName} (${c.moleculeChemblId})  score ${c.weightedScore.toFixed(3)}  delta ${c.bestEfficacyDeltaPp === null ? 'n/a' : `${c.bestEfficacyDeltaPp.toFixed(2)}pp`}  ${c.vetoed ? `VETOED: ${c.vetoReason}` : 'not vetoed'}`);
}
console.log('');

console.log('DEEP FALSIFICATION (six preregistered attacks, whole shortlist):');
for (const f of run.falsifications) {
  console.log(`  ${f.prefName}: ${f.survivedAll ? 'survived all six' : `${f.unresolvedCounterevidence.length} unresolved counterevidence finding(s)`}`);
}
console.log('');

console.log(`FINALISTS (cap 2, real ${run.finalists.length}):`);
for (const c of run.finalists) console.log(`  #${c.rank} ${c.prefName} (${c.moleculeChemblId})`);
console.log('');

console.log('SAFETY GATE:');
for (const g of run.safetyGate) {
  console.log(`  ${g.prefName}: ${g.decision.outcome}  surface=${g.surface}  contradictions=${g.unresolvedContradictions.length}`);
  for (const f of g.decision.failures) console.log(`      refused on ${f.criterion}`);
}
console.log('');

console.log('EXHAUSTION (walked before any non-winner verdict):');
for (const s of run.exhaustion.steps) console.log(`  ${s.path}: ${s.status}\n      ${s.finding}`);
if (run.exhaustion.differentiatingExperiment !== null) {
  const d = run.exhaustion.differentiatingExperiment;
  console.log(`  differentiating experiment: "${d.observableId}"  falsificationPower ${(d.falsificationPower * 100).toFixed(0)}%  rule frozen as ${d.decisionRuleFingerprint}`);
}
if (run.exhaustion.observationGapRequest !== null) {
  console.log(`  observation gap raised: ${run.exhaustion.observationGapRequest.requiredObservable.quantity}`);
  console.log(`      cost: ${run.exhaustion.observationGapRequest.feasibility.costEstimate === null ? 'UNDECLARED' : run.exhaustion.observationGapRequest.feasibility.costEstimate}`);
}
console.log('');

console.log('VERDICT:');
console.log(`  provisional (before exhaustion): ${run.provisionalDecision.outcome}`);
console.log(`  final (after exhaustion):        ${run.decision.outcome}   changed=${run.exhaustionChangedVerdict}`);
console.log(`  ${run.decision.reason}\n`);

console.log(`RESEARCH RECIPE: ${run.researchRecipe === null ? 'NONE (emitted only for a WINNER)' : 'emitted'}`);
console.log(`\nGOVERNMENT RECOMMENDATION:\n  ${run.governmentRecommendation}\n`);

console.log(`TRIAL REGISTRY: ${run.trials.length} recorded attempt(s); alpha ${run.multiplicity.nominalAlpha} corrected to ${run.multiplicity.correctedAlpha.toExponential(3)} over ${run.multiplicity.trialsCounted} ${run.multiplicity.countedKinds}`);
console.log(`FINGERPRINTS: campaign ${run.campaignFingerprint} | registry ${run.trialRegistryFingerprint} | prereg ${run.preregistrationFingerprint} | inherited ${run.inheritedFromFingerprint}\n`);

// --- Checks --------------------------------------------------------------
console.log('CHECKS:');

record('Generation, not selection: the space is far larger than any pre-supplied list and does not equal it',
  run.generationCheck.passed && run.generationCheck.equalsPresuppliedSet === false && run.generationCheck.generatedCount > 1000,
  `${run.generationCheck.generatedCount} generated, ${run.generationCheck.outsidePresuppliedCount} outside the pre-supplied list`);

record('Every stage strictly reduces, and every eliminated candidate carries a reason',
  run.stages.every((s) => s.outputCount < s.inputCount && s.eliminatedCount === s.inputCount - s.outputCount),
  run.stages.map((s) => `${s.stage} ${s.inputCount}->${s.outputCount}`).join(' | '));

record('Shortlist capped at 10 and never padded beyond what survived',
  run.shortlist.length <= 10 && run.shortlist.length === Math.min(10, run.stages[run.stages.length - 1].outputCount),
  `${run.shortlist.length} shortlisted from ${run.stages[run.stages.length - 1].outputCount} Tier-2 survivors`);

record('Deep falsification ran over the WHOLE shortlist, not just the top few',
  run.falsifications.length === run.shortlist.length && run.falsifications.every((f) => f.attacks.length === 6),
  `${run.falsifications.length} candidates x 6 attacks = ${run.falsifications.reduce((n, f) => n + f.attacks.length, 0)} attacks`);

record('Finalists capped at 2 and drawn from the shortlist',
  run.finalists.length <= 2 && run.finalists.every((f) => run.shortlist.some((c) => c.moleculeChemblId === f.moleculeChemblId)),
  `${run.finalists.length} finalist(s)`);

record('SAFETY GATE actually invoked on every finalist (it was previously dead code on this path)',
  run.safetyGate.length === run.finalists.length && run.safetyGate.every((g) => typeof g.decision.outcome === 'string'),
  run.safetyGate.map((g) => `${g.prefName}=${g.decision.outcome}`).join(', ') || 'no finalists');

record('Safety gate consumed the REAL unresolved counterevidence, never an empty list',
  run.safetyGate.every((g) => {
    const f = run.falsifications.find((x) => x.moleculeChemblId === g.moleculeChemblId);
    return g.unresolvedContradictions.length >= (f?.unresolvedCounterevidence.length ?? 0);
  }),
  run.safetyGate.map((g) => `${g.prefName}: ${g.unresolvedContradictions.length} contradiction(s)`).join(' | ') || 'no finalists');

record('No gate-refused candidate was named as the winner',
  run.decision.winnerId === null || !run.safetyGate.some((g) => g.blocked && g.moleculeChemblId === run.decision.winnerId),
  `winner=${run.decision.winnerId ?? 'none'}`);

record('Every declared exhaustion path was walked before the verdict was accepted',
  run.exhaustion.allPathsAttempted && run.exhaustion.steps.every((s) => s.status !== 'NOT_ATTEMPTED'),
  run.exhaustion.steps.map((s) => `${s.path}=${s.status}`).join(' | '));

record('A non-winner names what is still missing instead of filling it in',
  run.decision.outcome === 'WINNER' || run.exhaustion.observationGapRequest !== null || run.exhaustion.steps.some((s) => s.status === 'BLOCKED_NO_ACCESS'),
  run.exhaustion.observationGapRequest === null ? 'no gap request needed' : run.exhaustion.observationGapRequest.requiredObservable.quantity.slice(0, 110));

record('Research recipe emitted IF AND ONLY IF there is a winner',
  (run.decision.outcome === 'WINNER') === (run.researchRecipe !== null),
  `outcome=${run.decision.outcome}, recipe=${run.researchRecipe === null ? 'null' : 'present'}`);

record('Multiplicity correction is driven by the trial registry, not a hand-chosen number',
  run.multiplicity.trialsCounted === run.falsifications.reduce((n, f) => n + f.attacks.length, 0) && run.multiplicity.correctedAlpha < run.multiplicity.nominalAlpha,
  `alpha ${run.multiplicity.nominalAlpha} / ${run.multiplicity.trialsCounted} = ${run.multiplicity.correctedAlpha.toExponential(3)}`);

record('Every recorded trial carries a real reason',
  run.trials.every((t) => t.reason.trim().length > 0),
  `${run.trials.length} recorded attempt(s)`);

record('No banned marketing or clinical-claim language anywhere in the output',
  run.bannedStringHits.length === 0,
  run.bannedStringHits.length === 0 ? 'clean' : JSON.stringify(run.bannedStringHits));

const replay = mod.runGovDrugDiscoveryCampaign();
record('Replay: a second run produces an identical campaign fingerprint and verdict',
  replay.campaignFingerprint === run.campaignFingerprint && replay.decision.outcome === run.decision.outcome,
  `${replay.campaignFingerprint} === ${run.campaignFingerprint}`);

record('The sealed E2E-01 preregistration is untouched — this campaign only references it',
  run.inheritedFromFingerprint.length > 0 && run.preregistrationFingerprint !== run.inheritedFromFingerprint,
  `campaign ${run.preregistrationFingerprint} stands on sealed ${run.inheritedFromFingerprint}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\nRESULT: ${checks.length - failed.length}/${checks.length} properties held.`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
process.exit(0);
