import { canonicalJson } from '../events/hash';
import type { ScientificEvidencePack } from './evidencePack';

export const RO_CRATE_EVIDENCE_PACK_VERSION = '0.1.0';

export interface RoCrateGraphNode {
  '@id': string;
  '@type': string | readonly string[];
  [key: string]: unknown;
}

/**
 * A minimal, deterministic JSON-LD RO-Crate projection of an existing Evidence Pack.
 * It does not execute a model, fetch data, create outputs or maintain a second provenance store.
 */
export interface GenesisRoCrate {
  '@context': readonly (string | Readonly<Record<string, string>>)[];
  '@graph': readonly RoCrateGraphNode[];
}

const RO_CRATE_CONTEXT = 'https://w3id.org/ro/crate/1.1/context';
const PROV_CONTEXT = 'http://www.w3.org/ns/prov#';
const GENESIS_CONTEXT = 'https://genesis.local/ns/evidence-pack#';

function stableId(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_');
}

function entityRef(id: string): { '@id': string } {
  return { '@id': id };
}

function softwareAgentId(modelId: string | undefined, modelVersion: string | undefined, engine: string | null): string | undefined {
  const identity = [modelId ?? '', modelVersion ?? '', engine ?? ''].join('|');
  return identity === '||' ? undefined : `#software/${stableId(identity)}`;
}

function outputEntityId(runId: string): string {
  return `#result/${stableId(runId)}`;
}

function inputEntityId(runId: string): string {
  return `#input/${stableId(runId)}`;
}

function activityId(runId: string): string {
  return `#run/${stableId(runId)}`;
}

/**
 * Projects a completed ScientificEvidencePack into a small RO-Crate-compatible JSON-LD document.
 * The generated graph preserves existing identifiers, provenance fingerprints, result origin and disclaimer.
 */
export function exportEvidencePackRoCrate(pack: ScientificEvidencePack): GenesisRoCrate {
  const protocolId = `#protocol/${stableId(pack.protocol.designId)}`;
  const packId = `#evidence-pack/${stableId(pack.evidencePackId)}`;
  const graph: RoCrateGraphNode[] = [];
  const softwareAgents = new Map<string, RoCrateGraphNode>();
  const activityNodes: RoCrateGraphNode[] = [];
  const inputNodes: RoCrateGraphNode[] = [];
  const resultNodes: RoCrateGraphNode[] = [];

  for (const run of pack.runs) {
    const runActivityId = activityId(run.runId);
    const runInputId = inputEntityId(run.runId);
    const runResultId = outputEntityId(run.runId);
    const agentId = softwareAgentId(run.modelId, run.modelVersion, run.engine);

    if (agentId !== undefined && !softwareAgents.has(agentId)) {
      softwareAgents.set(agentId, {
        '@id': agentId,
        '@type': ['prov:SoftwareAgent', 'SoftwareApplication'],
        name: run.engine ?? run.modelId ?? 'Genesis experiment engine',
        'genesis:modelId': run.modelId,
        'genesis:modelVersion': run.modelVersion,
        'genesis:engine': run.engine,
      });
    }

    inputNodes.push({
      '@id': runInputId,
      '@type': ['prov:Entity', 'Dataset'],
      name: `Parameters for run ${run.runId}`,
      'genesis:parameters': run.parameters,
      'genesis:seed': run.seed,
      'genesis:requestFingerprint': run.provenance.requestFingerprint,
      'genesis:knowledgeSources': run.provenance.knowledgeSources,
      'genesis:supplementalKnowledgeIds': run.provenance.supplementalKnowledgeIds,
    });

    activityNodes.push({
      '@id': runActivityId,
      '@type': 'prov:Activity',
      name: `Genesis ExperimentRun ${run.runId}`,
      'prov:used': [entityRef(protocolId), entityRef(runInputId)],
      ...(agentId === undefined ? {} : { 'prov:wasAssociatedWith': entityRef(agentId) }),
      'genesis:runId': run.runId,
      'genesis:runFingerprint': run.provenance.runFingerprint,
      'genesis:contractVersion': run.provenance.contractVersion,
      'genesis:deterministic': run.provenance.deterministic,
      'genesis:resultOrigin': run.provenance.resultOrigin,
      'genesis:status': run.status,
    });

    resultNodes.push({
      '@id': runResultId,
      '@type': ['prov:Entity', 'Dataset'],
      name: `Result for run ${run.runId}`,
      'prov:wasGeneratedBy': entityRef(runActivityId),
      'genesis:status': run.status,
      'genesis:summary': run.result.summary,
      'genesis:outputs': run.result.outputs,
      'genesis:units': run.result.units,
      'genesis:warnings': run.result.warnings,
      'genesis:validity': run.result.validity,
      'genesis:assumptions': run.result.assumptions,
      'genesis:eventSummary': run.result.eventSummary,
    });
  }

  graph.push({
    '@id': './',
    '@type': 'Dataset',
    name: `Genesis RO-Crate: ${pack.evidencePackId}`,
    hasPart: [entityRef(packId), entityRef(protocolId), ...inputNodes.map((node) => entityRef(node['@id'])), ...activityNodes.map((node) => entityRef(node['@id'])), ...resultNodes.map((node) => entityRef(node['@id']))],
    'genesis:roCrateProfileVersion': RO_CRATE_EVIDENCE_PACK_VERSION,
  });

  graph.push({
    '@id': packId,
    '@type': ['CreativeWork', 'prov:Entity'],
    name: `Genesis Scientific Evidence Pack ${pack.evidencePackId}`,
    identifier: pack.evidencePackId,
    'prov:wasDerivedFrom': entityRef(protocolId),
    'genesis:contractVersion': pack.contractVersion,
    'genesis:evidenceChainId': pack.evidenceChainId,
    'genesis:runCount': pack.runCount,
    'genesis:reproducibility': pack.reproducibility,
    'genesis:eventSummaries': pack.eventSummaries,
    'genesis:hypothesisAssessment': pack.hypothesisAssessment,
    'genesis:disclaimer': pack.disclaimer,
  });

  graph.push({
    '@id': protocolId,
    '@type': ['prov:Entity', 'CreativeWork'],
    name: `Genesis preregistered protocol ${pack.protocol.designId}`,
    identifier: pack.protocol.designId,
    'genesis:protocolFingerprint': pack.protocol.protocolFingerprint,
    'genesis:primaryMetric': pack.protocol.primaryMetric,
    'genesis:protocolAssumptions': pack.protocol.protocolAssumptions,
    'genesis:hypothesis': pack.protocol.hypothesis,
    'genesis:arms': pack.protocol.arms,
    'genesis:repetitionsPerArm': pack.protocol.repetitionsPerArm,
  });

  graph.push(...Array.from(softwareAgents.values()), ...inputNodes, ...activityNodes, ...resultNodes);

  return {
    '@context': [
      RO_CRATE_CONTEXT,
      {
        prov: PROV_CONTEXT,
        genesis: GENESIS_CONTEXT,
      },
    ],
    '@graph': graph,
  };
}

export function serializeEvidencePackRoCrate(pack: ScientificEvidencePack): string {
  return canonicalJson(exportEvidencePackRoCrate(pack));
}
