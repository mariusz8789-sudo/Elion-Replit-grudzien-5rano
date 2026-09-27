/** Real backend RDKit descriptor Discovery Case; categorical, computational-only. */
import {
  analyseCategoricalExperimentSeries,
  concludeScientificDiscovery,
  createBackendReplayReceipt,
  createDiscoveryCaseRecord,
  createGenesisResearchPacket,
  createScientificEvidencePack,
  designScientificExperiment,
  executeScientificExperimentOnBackend,
  formulateScientificHypothesisCandidate,
  replayDiscoveryCaseRecord,
  selectNextScientificExperiment,
} from '../packages/frontend/src/core/experimentFabric';

const backendBaseUrl = (process.env.GENESIS_E2E_BACKEND_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const nativeFetch = globalThis.fetch;
if (!nativeFetch) throw new Error('fetch is required for backend E2E.');
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return nativeFetch(raw.startsWith('/api/') ? `${backendBaseUrl}${raw}` : raw, init);
}) as typeof globalThis.fetch;

const MODEL_ID = 'chem-rdkit-descriptors';
const DOMAIN_ID = 'chemistry';
const arms = {
  ethanol: 'CCO',
  aspirin: 'CC(=O)Oc1ccccc1C(=O)O',
  caffeine: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C',
} as const;

const baselineRequest = {
  contractVersion: '1.0.0' as const,
  sourceText: 'Prerejestrowany, ograniczony RDKit descriptor comparison dla trzech jawnych SMILES.',
  domainId: DOMAIN_ID,
  operation: 'compute' as const,
  modelId: MODEL_ID,
  parameters: { smiles: arms.ethanol },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W ograniczonym, prerejestrowanym zbiorze trzech jawnych SMILES RDKit zwróci deterministyczne deskryptory 2D, w tym dodatnią masę cząsteczkową oraz kanoniczny SMILES dla każdego poprawnego wejścia.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'RDKit liczy deskryptory topologiczne 2D dla wejściowego SMILES; nie wykonuje dockingu, konformacji 3D, QSAR, predykcji ADMET ani oceny klinicznej.',
      'Porównywane są wyłącznie trzy prerejestrowane cząsteczki referencyjne: etanol, aspiryna i kofeina.',
      'Wynik jest COMPUTATIONAL_RESULT dla tego runtime’u RDKit i nie stanowi oceny bezpieczeństwa, skuteczności, celu terapeutycznego ani rankingu leku.',
    ],
    falsification: {
      metric: 'molWt', relation: 'greater-than',
      rationale: 'Każdy prawidłowo sparsowany, prerejestrowany SMILES musi dać dodatnią masę molową RDKit; nie jest to test bioaktywności.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'smiles', values: [arms.ethanol, arms.aspirin, arms.caffeine], label: 'prerejestrowany SMILES' },
  repetitionsPerArm: 2,
});

async function main(): Promise<void> {
  const chain = await executeScientificExperimentOnBackend(design, backendBaseUrl);
  const replayChain = await executeScientificExperimentOnBackend(design, backendBaseUrl);
  const replayReceipt = createBackendReplayReceipt(chain, replayChain);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('RDKit SMILES molecular descriptors Lipinski Crippen chemistry');
  const analysis = analyseCategoricalExperimentSeries(chain.allRuns, 'smiles', 'molWt');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const conclusion = concludeScientificDiscovery(discoveryCase);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const rows = chain.allRuns.map((run) => ({
    smiles: String(run.request.parameters.smiles), molWt: Number(run.result.outputs.molWt),
    canonicalSmiles: String(run.result.outputs.canonicalSmiles), origin: run.provenance.resultOrigin,
  }));
  const assertions = {
    sixBackendRunsCompleted: chain.allRuns.length === 6 && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsAreReal: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine' && Boolean(run.provenance.backendExecution?.backendRunId)),
    armsAreReproducible: chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    evidencePackMatches: evidencePack.runCount === chain.allRuns.length && evidencePack.reproducibility.allArmsMatched,
    replayReceiptMatches: replayReceipt.status === 'MATCH' && replayReceipt.armReceipts.every((arm) => arm.status === 'MATCH'),
    categoricalAnalysisIsNonOrdinal: analysis.diagnostics.status === 'AVAILABLE' && analysis.diagnostics.monotonicTrend === 'NOT_ASSESSABLE',
    allDescriptorValuesAreRealAndFinite: rows.every((row) => Number.isFinite(row.molWt) && row.molWt > 0 && row.canonicalSmiles.length > 0),
    sourceBoundResearch: research.status === 'RETRIEVED' && research.corpusSources.some((source) => source.domainId === DOMAIN_ID),
    conservativeConclusion: conclusion.status === 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL' && conclusion.reviewStatus === 'NOT_REVIEWED',
    caseReplayMatches: replayedCase.caseId === discoveryCase.caseId,
  };
  if (Object.values(assertions).some((value) => !value)) throw new Error(JSON.stringify({ assertions, rows, assessment: chain.assessment, candidate, conclusion, replayReceipt }, null, 2));
  process.stdout.write(`${JSON.stringify({ status: 'PASS', model: MODEL_ID, designId: design.designId, assessment: chain.assessment.assessment, replayReceipt: replayReceipt.status, analysisStatus: analysis.diagnostics.status, conclusion: conclusion.status, rows, assertions, disclaimer: 'COMPUTATIONAL_RESULT: RDKit 2D descriptors for three preregistered SMILES only; no docking, QSAR, ADMET, efficacy, safety or drug-discovery claim.' }, null, 2)}\n`);
}
main().catch((error: unknown) => { console.error('[E2E] FAIL — RDKit descriptor Discovery Case:', error); process.exit(1); });
