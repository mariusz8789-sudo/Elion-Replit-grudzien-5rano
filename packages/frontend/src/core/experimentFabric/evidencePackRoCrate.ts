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

/**
 * MULTI-DOMAIN INVESTIGATION EXPORT — the smallest possible extension of
 * this existing exporter to cover a real investigation spanning several
 * domains (epidemiology, particle physics, molecular chemistry, ...).
 *
 * This is NOT a second export architecture. It calls the UNCHANGED
 * `exportEvidencePackRoCrate` once per domain and merges the results: each
 * per-domain sub-crate's own root Dataset node (normally `'@id': './'`)
 * is renamed to a domain-qualified id (`#domain/<domainId>`) so multiple
 * domains can coexist in one JSON-LD graph without an `@id` collision,
 * and one overall `'./'` root node is added that lists every domain root
 * as a part. Every other node keeps the id `exportEvidencePackRoCrate`
 * already gave it (protocol/run/result ids are content-hash-derived and
 * therefore already collision-safe across independently executed real
 * runs from unrelated models).
 *
 * `worldStateFingerprints` / `replayStatus` / `notModeled` / `question` are
 * OPTIONAL, CALLER-SUPPLIED cross-references to real values the caller's
 * own domain adapter (e.g. `world/epidemiologyWorldAdapter.ts`) already
 * computed — this function never derives or recomputes them itself, and
 * never invents a value the caller did not supply.
 */
export interface DomainEvidenceEntry {
  domainId: string;
  /** The real, already-answered investigation question for this domain (e.g. the HypothesisProblem's own statement). */
  question?: string;
  pack: ScientificEvidencePack;
  /** Real WorldState fingerprint(s) this domain's own adapter already produced — informational cross-reference only. */
  worldStateFingerprints?: readonly string[];
  /** Real replay status this domain's own investigation already computed (e.g. 'MATCH' | 'DRIFT' | 'BLOCKED'). */
  replayStatus?: string;
  /** Real NOT_MODELED / UNKNOWN declarations this domain's own adapter already made — passed through verbatim, never re-derived. */
  notModeled?: readonly string[];
}

function domainRootId(domainId: string): string {
  return `#domain/${stableId(domainId)}`;
}

/**
 * Merges one `GenesisRoCrate` per domain entry into a single deterministic
 * multi-domain bundle. Domain order in `entries` is preserved exactly —
 * this function does not sort or deduplicate domains, so a caller supplying
 * the same domain list in the same order always gets the same bundle.
 */
export function combineEvidencePackRoCrates(entries: readonly DomainEvidenceEntry[]): GenesisRoCrate {
  const contextKeys = new Map<string, string | Readonly<Record<string, string>>>();
  const graph: RoCrateGraphNode[] = [];
  const overallRootParts: { '@id': string }[] = [];

  for (const entry of entries) {
    const sub = exportEvidencePackRoCrate(entry.pack);
    for (const ctx of sub['@context']) {
      const key = typeof ctx === 'string' ? ctx : canonicalJson(ctx);
      if (!contextKeys.has(key)) contextKeys.set(key, ctx);
    }

    const thisDomainRootId = domainRootId(entry.domainId);
    overallRootParts.push(entityRef(thisDomainRootId));

    for (const node of sub['@graph']) {
      if (node['@id'] !== './') {
        graph.push(node);
        continue;
      }
      graph.push({
        ...node,
        '@id': thisDomainRootId,
        'genesis:domainId': entry.domainId,
        ...(entry.question === undefined ? {} : { 'genesis:investigationQuestion': entry.question }),
        ...(entry.worldStateFingerprints === undefined ? {} : { 'genesis:worldStateFingerprints': entry.worldStateFingerprints }),
        ...(entry.replayStatus === undefined ? {} : { 'genesis:replayStatus': entry.replayStatus }),
        ...(entry.notModeled === undefined ? {} : { 'genesis:notModeled': entry.notModeled }),
      });
    }
  }

  const overallRoot: RoCrateGraphNode = {
    '@id': './',
    '@type': 'Dataset',
    name: `Genesis multi-domain scientific investigation (${entries.map((e) => e.domainId).join(', ')})`,
    hasPart: overallRootParts,
    'genesis:roCrateProfileVersion': RO_CRATE_EVIDENCE_PACK_VERSION,
    'genesis:domainCount': entries.length,
  };

  return {
    '@context': [...contextKeys.values()],
    '@graph': [overallRoot, ...graph],
  };
}

export function serializeCombinedEvidencePackRoCrate(entries: readonly DomainEvidenceEntry[]): string {
  return canonicalJson(combineEvidencePackRoCrates(entries));
}
