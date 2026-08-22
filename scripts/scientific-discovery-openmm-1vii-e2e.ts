/**
 * GENESIS OPENMM 1VII DISCOVERY CASE — RESOURCE-BOUNDED REAL BACKEND E2E
 *
 * Executes exactly two independent, real OpenMM CPU runs of the existing
 * checksum-verified 1VII benchmark: baseline and identical replication. This
 * is intentionally not a four-run backend replay receipt, because each CPU run
 * takes about 88 seconds and the broader replay protocol exceeds the sandbox
 * budget. The two arms nevertheless preserve independent backend provenance
 * and test a preregistered equality criterion directly.
 *
 * Scope: AMBER14 + implicit OBC2 minimization and 100 LangevinMiddle steps for
 * PDB 1VII only. This is not equilibrium MD, binding/free-energy calculation,
 * docking, HIV/10E8/nanodisc simulation, or vaccine prediction.
 */
import {
  analyseExperimentSeries,
  concludeScientificDiscovery,
  createDiscoveryCaseRecord,
  createGenesisResearchPacket,
  createScientificEvidencePack,
  designScientificExperiment,
  executeScientificExperimentOnBackend,
  formulateScientificHypothesisCandidate,
  replayDiscoveryCaseRecord,
  selectNextScientificExperiment,
} from '../packages/frontend/src/core/experimentFabric/index';

const backendBaseUrl = (process.env.GENESIS_E2E_BACKEND_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const nativeFetch = globalThis.fetch;
if (typeof nativeFetch !== 'function') throw new Error('A standards-compatible fetch implementation is required for backend E2E.');
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return nativeFetch(rawUrl.startsWith('/api/') ? `${backendBaseUrl}${rawUrl}` : rawUrl, init);
}) as typeof globalThis.fetch;

const MODEL_ID = 'biology-openmm-md-1vii-reference';
const DOMAIN_ID = 'biology-vaccine-discovery';
const PDB_1VII_SHA256 = 'ebecd3d6c0dd9c8b34bcbea9b57c73e4f73986cc674150f0aaa0687db66e77ef';
const baselineRequest = {
  contractVersion: '1.0.0' as const,
  sourceText: 'Prerejestrowany, resource-bounded OpenMM 1VII CPU replication protocol: AMBER14 implicit OBC2, minimizacja i 100 kroków LangevinMiddle.',
  domainId: DOMAIN_ID,
  operation: 'compute' as const,
  modelId: MODEL_ID,
  parameters: { steps: 100 },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'Dwa niezależne runy ograniczonego benchmarku OpenMM CPU PDB 1VII z identycznymi parametrami zwracają zgodną końcową energię potencjalną po MD.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Źródłowy artefakt PDB 1VII musi mieć prerejestrowany SHA-256 ebecd3d6c0dd9c8b34bcbea9b57c73e4f73986cc674150f0aaa0687db66e77ef.',
      'Model używa AMBER14-all.xml i implicit/obc2.xml, jednego wątku CPU, constraints=HBonds oraz LangevinMiddle 300 K, γ=1/ps, dt=0.002 ps i seed 20260821.',
      'Protokół obejmuje minimizację i dokładnie 100 kroków MD (0.2 ps) tylko dla publicznego PDB 1VII.',
      'Wynik kontroluje runtime i odtwarzalność krótkiego benchmarku; nie jest samplingiem konformacyjnym, MD równowagowym, dockingiem, energią swobodną, powinowactwem, neutralizacją, immunogennością ani predykcją szczepionki.',
      'Pełny backendowy replay receipt wymagałby co najmniej kolejnych dwóch runów CPU i przekracza bieżący budżet sandboxa; ten protokół nie udaje jego wykonania.',
    ],
    falsification: {
      metric: 'potentialEnergyAfterKjPerMol',
      relation: 'equal-to-baseline-within-tolerance',
      tolerance: 1e-6,
      rationale: 'Identyczny deterministyczny benchmark OpenMM 1VII musi zwrócić końcową energię potencjalną zgodną z niezależnym baseline w prerejestrowanej tolerancji.',
    },
  },
  baselineRequest,
  replication: {
    label: 'Niezależna replikacja OpenMM 1VII',
    rationale: 'Drugi realny backendowy run powtarza bez zmian PDB checksum, force field, integrator, seed i 100 kroków MD.',
  },
  repetitionsPerArm: 1,
});

const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W tym samym ograniczonym benchmarku OpenMM 1VII dwa runy 200 kroków zwracają zgodną końcową energię potencjalną po MD.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Follow-up zachowuje PDB 1VII, checksumę artefaktu, AMBER14, implicit OBC2 i deterministyczne ustawienia CPU.',
      'To osobno prerejestrowany protokół; nie jest wykonywany przez ten E2E.',
    ],
    falsification: {
      metric: 'potentialEnergyAfterKjPerMol',
      relation: 'equal-to-baseline-within-tolerance',
      tolerance: 1e-6,
      rationale: 'Identyczny deterministyczny benchmark 200 kroków musi być zgodny wobec własnego baseline.',
    },
  },
  baselineRequest: { ...baselineRequest, parameters: { steps: 200 } },
  replication: {
    label: 'Replikacja OpenMM 1VII 200 kroków',
    rationale: 'Niezależnie prerejestrowana kontrola odtwarzalności dłuższego, lecz nadal bounded benchmarku.',
  },
  repetitionsPerArm: 1,
});

function finiteEnergy(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function main(): Promise<void> {
  const chain = await executeScientificExperimentOnBackend(design);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('Vaccine Discovery PDB protein 1VII OpenMM molecular dynamics benchmark AMBER');
  const analysis = analyseExperimentSeries(chain.allRuns, 'steps', 'potentialEnergyAfterKjPerMol');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const conclusion = concludeScientificDiscovery(discoveryCase);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const baselineValue = chain.arms.find((arm) => arm.kind === 'baseline')?.outputValues[0];
  const replicationValue = chain.arms.find((arm) => arm.kind === 'replication')?.outputValues[0];
  const allBackendProvenance = chain.allRuns.map((run) => run.provenance.backendExecution?.backendProvenance);
  const assertions = {
    exactlyTwoResourceBoundedBackendRunsCompleted: chain.allRuns.length === 2 && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsUseRealOpenmmBackendProvenance: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine'
      && run.provenance.backendExecution?.backendEngine === 'genesis-compute@1.0.0'
      && run.provenance.backendExecution?.backendProvenance.engine === 'OpenMM 8.6 CPU'),
    sourceArtifactChecksumIsPreserved: allBackendProvenance.every((provenance) => provenance?.pdbId === '1VII' && provenance.pdbSha256 === PDB_1VII_SHA256),
    deterministicArmsComplete: chain.arms.length === 2 && chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    preregisteredReplicationCriterionSupported: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    finalEnergiesAreFinite: finiteEnergy(baselineValue) && finiteEnergy(replicationValue),
    independentRunsMatchWithinTolerance: typeof baselineValue === 'number' && typeof replicationValue === 'number'
      && Math.abs(baselineValue - replicationValue) <= 1e-6,
    evidencePackIsComplete: evidencePack.runCount === 2 && evidencePack.reproducibility.allArmsMatched,
    sourceBoundResearch: research.status === 'RETRIEVED' && research.corpusSources.some((source) => source.domainId === DOMAIN_ID),
    replicationIsNotMisrepresentedAsCorrelationDiscovery: candidate.status === 'BLOCKED_NO_REVIEWABLE_FINDING' && discoveryCase.status === 'INCOMPLETE_CANDIDATE',
    conservativeConclusion: conclusion.status === 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL' && conclusion.reviewStatus === 'NOT_REVIEWED',
    discoveryCaseReplayMatches: replayedCase.caseFingerprint === discoveryCase.caseFingerprint,
    resourceBoundedProtocolDoesNotClaimFullBackendReplayReceipt: chain.allRuns.length === 2 && !Object.prototype.hasOwnProperty.call(chain, 'backendReplayReceipt'),
    followUpIsPreRegistered: nextSelection.status === 'SELECTED' && nextSelection.selectedDesign?.designId === followUpDesign.designId,
  };
  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`OpenMM 1VII Discovery E2E assertions failed:\n${JSON.stringify({ assertions, assessment: chain.assessment, analysis, candidate, nextSelection, discoveryCase, conclusion, backendProvenance: allBackendProvenance }, null, 2)}`);
  }
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    backendBaseUrl,
    model: MODEL_ID,
    designId: design.designId,
    evidenceId: chain.evidenceId,
    assessment: chain.assessment.assessment,
    conclusion: conclusion.status,
    potentialEnergyAfterKjPerMol: baselineValue,
    pdbId: allBackendProvenance[0]?.pdbId,
    pdbSha256: allBackendProvenance[0]?.pdbSha256,
    runIds: chain.allRuns.map((run) => run.runId),
    nextProtocolId: nextSelection.selectedDesign?.designId,
    assertions,
    disclaimer: 'COMPUTATIONAL_RESULT: two independent, checksum-verified OpenMM CPU runs for the bounded PDB 1VII benchmark only. This is not a full backend replay receipt, equilibrium MD, docking, free-energy calculation, HIV/10E8/nanodisc simulation, affinity result or vaccine prediction.',
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error('[E2E] FAIL — OpenMM 1VII Discovery Case:', error);
  process.exit(1);
});
