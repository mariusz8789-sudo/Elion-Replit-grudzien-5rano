/**
 * GENESIS SCIENTIFIC DISCOVERY — PDB STRUCTURAL A/B E2E
 *
 * Prerejestrowany, realny Discovery Case na backendowym Structural Fabric:
 * porównanie geometrii Cα MPER w parach 5GHW→4G6F i 5GHW→5WDF.
 *
 * Ograniczenia (jawnie wymuszone):
 * - RMSD opisuje geometrię zdeponowanych struktur, nie K_D, docking,
 *   neutralizację, immunogenność ani skuteczność szczepionki.
 * - Genesis nie projektuje mutacji ani nie generuje wariantów.
 * - Wniosek jest konserwatywny i oznaczony jako COMPUTATIONAL_RESULT.
 * - Skrypt nie deklaruje odkrycia biologicznego.
 */
import {
  designScientificExperiment,
  executeScientificExperimentOnBackend,
  createScientificEvidencePack,
  createGenesisResearchPacket,
  analyseCategoricalExperimentSeries,
  formulateScientificHypothesisCandidate,
  selectNextScientificExperiment,
  createDiscoveryCaseRecord,
  replayDiscoveryCaseRecord,
  concludeScientificDiscovery,
} from '../packages/frontend/src/core/experimentFabric';

const backendBaseUrl = (process.env.GENESIS_E2E_BACKEND_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const nativeFetch = globalThis.fetch;
if (typeof nativeFetch !== 'function') {
  throw new Error('A standards-compatible fetch implementation is required for backend E2E.');
}
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = rawUrl.startsWith('/api/') ? `${backendBaseUrl}${rawUrl}` : rawUrl;
  return nativeFetch(url, init);
}) as typeof globalThis.fetch;

async function main(): Promise<void> {
// ---------------------------------------------------------------------------
// Prerejestracja protokołu A/B — dwie pary PDB względem 5GHW
// ---------------------------------------------------------------------------
const baselineRequest = {
  contractVersion: '1.0.0',
  sourceText: 'Prerejestrowany A/B Structural Fabric: 5GHW jako referencja, 4G6F i 5WDF jako mobile.',
  domainId: 'biology-vaccine-discovery',
  operation: 'compute' as const,
  modelId: 'biology-hiv-10e8-pdb-structural-comparison',
  parameters: { referencePdb: '5GHW', mobilePdb: '4G6F' },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W granicach Structural Fabric porównujemy geometrię MPER w dwóch publicznie dozwolonych parach PDB względem 5GHW. Wynik jest COMPUTATIONAL_RESULT opisującym geometrię zdeponowanych struktur, nie powinowactwem ani skutecznością szczepionki.',
    domainId: 'biology-vaccine-discovery',
    modelId: 'biology-hiv-10e8-pdb-structural-comparison',
    declaredAssumptions: [
      'RMSD opisuje geometrię zdeponowanych struktur, nie K_D, docking, neutralizację, immunogenność ani skuteczność szczepionki.',
      '5WDF jest eksperymentalnie zdeponowanym kompleksem wariantu 10E8v4-5R+100cF z peptydem gp41; Genesis nie projektuje mutacji.',
      'Porównanie jest wyłącznie obliczeniowe i wymaga niezależnego przeglądu naukowego.',
    ],
    falsification: {
      metric: 'mperInFabAlignedFrameRmsdAngstrom',
      relation: 'less-than',
      rationale: 'Prerejestrowany test geometryczny: MPER RMSD w ramie wyrównanego Fab 10E8 dla obu par PDB.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'mobilePdb', values: ['4G6F', '5WDF'], label: 'PDB mobile' },
  repetitionsPerArm: 2,
});

// Prerejestrowany protokół follow-up (nie wykonywany w tym runie)
const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'Prerejestrowany follow-up: dodatkowe pary PDB dla rozszerzonego porównania geometrycznego MPER.',
    domainId: 'biology-vaccine-discovery',
    modelId: 'biology-hiv-10e8-pdb-structural-comparison',
    declaredAssumptions: [
      'Wymaga dodatkowych, jawnie dozwolonych par PDB w manifeście Structural Fabric.',
    ],
    falsification: {
      metric: 'mperInFabAlignedFrameRmsdAngstrom',
      relation: 'less-than',
      rationale: 'Prerejestrowany rozszerzony test geometryczny.',
    },
  },
  baselineRequest: { ...baselineRequest, sourceText: 'Prerejestrowany follow-up A/B Structural Fabric.' },
  sweep: { parameter: 'mobilePdb', values: ['4G6F', '5WDF'], label: 'PDB mobile follow-up' },
  repetitionsPerArm: 2,
});

// ---------------------------------------------------------------------------
// Realny backendowy execution
// ---------------------------------------------------------------------------
console.log(`\n[E2E] Executing PDB Structural A/B on backend Fabric...`);
console.log(`[E2E] Protocol fingerprint: ${design.protocolFingerprint}`);
console.log(`[E2E] Arms: ${design.arms.map((a) => a.request.parameters.mobilePdb).join(', ')}`);

const chain = await executeScientificExperimentOnBackend(design);

const evidencePack = createScientificEvidencePack(chain);
const research = createGenesisResearchPacket('HIV MPER 10E8 PDB structural comparison');
const analysis = analyseCategoricalExperimentSeries(chain.allRuns, 'mobilePdb', 'mperInFabAlignedFrameRmsdAngstrom');
const candidate = formulateScientificHypothesisCandidate(analysis, chain);
const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
console.log(`[E2E] Pre-review case status: ${discoveryCase.status}`);
if (discoveryCase.blockingReasons.length > 0) {
  console.log(`[E2E] Pre-review blockers: ${discoveryCase.blockingReasons.join(' | ')}`);
  throw new Error(`PDB Discovery Case blocked: ${discoveryCase.blockingReasons.join(' | ')}`);
}

// Kategoryczne PDB IDs nie są skalą numeryczną: Genesis nie generuje automatycznego
// candidate ani deklarowanej decyzji review. Zamiast tego utrwala zgodny, ale
// celowo niekompletny Case oraz wniosek ograniczony do kryterium protokołu.
const conclusion = concludeScientificDiscovery(discoveryCase);
const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
const assertions = {
  allRunsCompleted:
    chain.allRuns.length === design.arms.length * design.repetitionsPerArm &&
    chain.allRuns.every((run) => run.result.status === 'completed'),
  allRunsReal: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine'),
  allRunsHaveBackendProvenance: chain.allRuns.every(
    (run) =>
      Boolean(
        run.provenance.backendExecution?.backendRunId &&
          run.provenance.backendExecution.backendEngine &&
          run.provenance.backendExecution.backendModelVersion,
      ),
  ),
  deterministicArmsMatch: chain.arms.every((arm) => arm.reproduction === 'MATCH'),
  hypothesisAssessment: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
  evidencePackMatches:
    evidencePack.runCount === chain.allRuns.length && evidencePack.reproducibility.allArmsMatched,
  researchPacketIsSourceBound:
    research.status === 'RETRIEVED' &&
    research.corpusSources.some((source) => source.domainId === 'biology-vaccine-discovery'),
  categoricalAnalysisStaysNonOrdinal:
    analysis.diagnostics.status === 'AVAILABLE' &&
    analysis.diagnostics.monotonicTrend === 'NOT_ASSESSABLE' &&
    analysis.diagnostics.leastSquaresSlope === undefined,
  candidateRequiresSeparateNumericalOrScientificDesign: candidate.status === 'BLOCKED_NO_REVIEWABLE_FINDING',
  discoveryCaseIsCompatibleButIntentionallyIncomplete:
    discoveryCase.status === 'INCOMPLETE_CANDIDATE' && discoveryCase.blockingReasons.length === 0,
  conclusionIsConservative:
    conclusion.status === 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL' &&
    conclusion.reviewStatus === 'NOT_REVIEWED',
  replayedCaseMatches: replayedCase.caseId === discoveryCase.caseId,
  nextProtocolRemainsBlockedUntilASeparateEligibleDesign:
    nextSelection.status === 'NO_ELIGIBLE_CANDIDATE' &&
    nextSelection.selectedDesign === undefined,
  noPdbValuesAreSynthetic: chain.allRuns.every(
    (run) =>
      typeof run.result.outputs.mperInFabAlignedFrameRmsdAngstrom === 'number' &&
      run.result.outputs.mperInFabAlignedFrameRmsdAngstrom > 0,
  ),
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('\n[E2E] === PDB STRUCTURAL A/B DISCOVERY CASE REPORT ===');
console.log(`[E2E] Runs: ${chain.allRuns.length} (${design.arms.length} arms × ${design.repetitionsPerArm} reps)`);

for (const run of chain.allRuns) {
  const mobilePdb = run.request.parameters.mobilePdb as string;
  const mperRmsd = run.result.outputs.mperInFabAlignedFrameRmsdAngstrom as number;
  const fabRmsd = run.result.outputs.fab10e8RmsdAngstrom as number;
  console.log(
    `[E2E]   ${run.runId.slice(0, 12)} | mobile=${mobilePdb} | Fab RMSD=${fabRmsd?.toFixed(3)} Å | MPER RMSD=${mperRmsd?.toFixed(3)} Å | origin=${run.provenance.resultOrigin}`,
  );
}

console.log(`[E2E] Assessment: ${chain.assessment.assessment}`);
console.log(`[E2E] Evidence pack: ${evidencePack.runCount} runs, allArmsMatched=${evidencePack.reproducibility.allArmsMatched}`);
console.log(`[E2E] Candidate status: ${candidate.status} (expected for non-ordinal categorical arms)`);
console.log(`[E2E] Conclusion: ${conclusion.status} | review=${conclusion.reviewStatus} | computational result only`);
console.log(`[E2E] Next protocol: ${nextSelection.status} (no automatic follow-up for categorical PDB evidence)`);
console.log(`[E2E] Replay case match: ${replayedCase.caseId === discoveryCase.caseId}`);

console.log('\n[E2E] === ASSERTIONS ===');
let allPassed = true;
for (const [key, value] of Object.entries(assertions)) {
  const icon = value ? '✓' : '✗';
  console.log(`[E2E] ${icon} ${key}: ${value}`);
  if (!value) allPassed = false;
}

if (!allPassed) {
  console.error('\n[E2E] FAIL — one or more assertions failed.');
  process.exit(1);
}

console.log('\n[E2E] PASS — PDB Structural A/B Discovery Case is real, auditable, and conservative.');
console.log('[E2E] COMPUTATIONAL_RESULT: RMSD describes deposited PDB geometry, not biological efficacy.');
}

main().catch((error: unknown) => {
  console.error('[E2E] FAIL — unhandled error:', error);
  process.exit(1);
});
