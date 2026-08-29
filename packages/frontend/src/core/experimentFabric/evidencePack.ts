import { canonicalJson, fnv1a } from '../events/hash';
import type { ScientificEvidenceChain } from './scientificDiscovery';
import type { ExperimentRun } from './types';
import { compareAme2020Observations, type Ame2020Comparison } from '../observation/nuclearAme2020';

export const EVIDENCE_PACK_VERSION = '1.0.0';

export interface EvidencePackRun {
  runId: string;
  modelId?: string;
  modelVersion?: string;
  engine: string | null;
  seed?: number;
  parameters: Readonly<Record<string, string | number | boolean>>;
  status: ExperimentRun['result']['status'];
  result: ExperimentRun['result'];
  provenance: ExperimentRun['provenance'];
}

/**
 * Portable evidence record. It is a faithful projection of completed Fabric
 * runs, never a post-hoc simulation, chart, interpretation or new World State.
 */
export interface ScientificEvidencePack {
  contractVersion: string;
  evidencePackId: string;
  evidenceChainId: string;
  protocol: ScientificEvidenceChain['design'];
  hypothesisAssessment: ScientificEvidenceChain['assessment'];
  runCount: number;
  runs: readonly EvidencePackRun[];
  reproducibility: {
    allArmsMatched: boolean;
    armsWithDrift: readonly string[];
    armsNotExecuted: readonly string[];
  };
  eventSummaries: readonly { runId: string; count: number; types: readonly string[] }[];
  /** Optional external-observation projection; absent for protocols without a compatible source. */
  externalObservationComparison?: Ame2020Comparison;
  disclaimer: string;
}

function packRun(run: ExperimentRun): EvidencePackRun {
  return {
    runId: run.runId,
    modelId: run.provenance.modelId,
    modelVersion: run.provenance.modelVersion,
    engine: run.provenance.engine,
    seed: run.provenance.seed,
    parameters: run.provenance.parameterSnapshot,
    status: run.result.status,
    result: run.result,
    provenance: run.provenance,
  };
}

export function createScientificEvidencePack(chain: ScientificEvidenceChain): ScientificEvidencePack {
  if (chain.createdFromRealRunsOnly !== true) throw new Error('Evidence Pack requires an evidence chain created from real runs only.');
  const runs = chain.allRuns.map(packRun);
  const armsWithDrift = chain.arms.filter((arm) => arm.reproduction === 'DRIFT').map((arm) => arm.armId);
  const armsNotExecuted = chain.arms.filter((arm) => arm.reproduction === 'NOT_EXECUTED').map((arm) => arm.armId);
  const eventSummaries = chain.allRuns
    .filter((run) => run.result.eventSummary !== undefined)
    .map((run) => ({ runId: run.runId, count: run.result.eventSummary!.count, types: run.result.eventSummary!.types }));
  const seed = {
    contractVersion: EVIDENCE_PACK_VERSION,
    chain: chain.provenanceFingerprint,
    protocol: chain.design.protocolFingerprint,
    runFingerprints: chain.allRuns.map((run) => run.provenance.runFingerprint),
    assessment: {
      assessment: chain.assessment.assessment,
      message: chain.assessment.message,
      criterion: chain.assessment.criterion,
      referenceRunIds: [],
    },
  };
  const externalObservationComparison = chain.design.hypothesis.modelId === 'nuclear-semf'
    ? compareAme2020Observations()
    : undefined;
  return {
    contractVersion: EVIDENCE_PACK_VERSION,
    evidencePackId: `pack_${fnv1a(canonicalJson(seed))}`,
    evidenceChainId: chain.evidenceId,
    protocol: chain.design,
    hypothesisAssessment: chain.assessment,
    runCount: runs.length,
    runs,
    reproducibility: {
      allArmsMatched: armsWithDrift.length === 0 && armsNotExecuted.length === 0,
      armsWithDrift,
      armsNotExecuted,
    },
    eventSummaries,
    ...(externalObservationComparison === undefined ? {} : { externalObservationComparison }),
    disclaimer: 'Evidence Pack rejestruje faktyczne runy, ich parametry i provenance. Ocena hipotezy jest ograniczona do prerejestrowanego protokołu oraz granic użytego modelu; nie stanowi odkrycia ani potwierdzenia świata rzeczywistego.',
  };
}

export function serializeScientificEvidencePack(pack: ScientificEvidencePack): string {
  return canonicalJson(pack);
}
