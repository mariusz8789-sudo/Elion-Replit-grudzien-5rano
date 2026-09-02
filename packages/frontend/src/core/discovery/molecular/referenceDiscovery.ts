import { resolveCompound, seedsFromResolution, type CompoundLookupTransport } from './compoundResolver';
import { runDiscoveryCampaign, type CampaignEngines, type CampaignOptions, type DiscoveryRun } from './discoveryCampaign';
import { rdkitSmartsEnumeratorProvider } from './enumeratorProviders';
import type { GenerationRequest } from './generationProvider';
import type { Objective } from './multiObjective';
import type { RdkitTransport } from './rdkitTransport';
import { resolveTargetHypothesis, type TargetResolutionRequest } from './targetResolution';
import {
  affinityIsAboutTarget,
  prioritisationStatement,
  type ReceptorStructure,
  type TargetHypothesis,
} from './targetHypothesis';
import type { DiscoveryQuestion } from './types';

/**
 * ETAP 11 — REFERENCE-COMPOUND ANALOGUE DISCOVERY.
 *
 * A generic pipeline: start from a known compound, resolve what it is thought
 * to act on, enumerate analogues, and prioritise them computationally against
 * that same stated hypothesis.
 *
 * WHAT THIS DOES NOT DO, by construction:
 *
 *  - it does not claim an analogue shares the reference compound's activity.
 *    A mechanism reported for the REFERENCE is evidence about the reference,
 *    not about anything derived from it;
 *  - it does not invent a target when no source resolves one;
 *  - it does not report a docking score as a target affinity unless the target
 *    is resolved AND the docked structure is that target.
 *
 * Nothing here is specific to any compound. Ketamine appears only in a test.
 */
export const REFERENCE_DISCOVERY_VERSION = '1.0.0';

export interface ReferenceCompoundDiscoveryRequest {
  /** Name or SMILES of the starting compound. */
  reference: { kind: 'name' | 'smiles'; value: string };
  /** Target resolution inputs — a declared target must carry a citation. */
  target: TargetResolutionRequest;
  question: DiscoveryQuestion;
  objectives: readonly Objective[];
  transformations: readonly string[];
  candidateBudget: number;
  depth?: number;
  /** Structures to exclude from results (e.g. the reference itself). */
  excludeStructures?: readonly string[];
}

export interface ReferenceDiscoveryResult {
  run: DiscoveryRun;
  referenceResolution: ReturnType<typeof resolveCompound>;
  targetHypothesis: TargetHypothesis;
  /** Whether any docking score in this run describes the hypothesised target. */
  affinityAboutTarget: { meaningful: boolean; reason: string };
  /** The single sanctioned sentence about the lead candidate. */
  prioritisation: string;
  /** Everything this result does NOT establish. */
  limitations: readonly string[];
}

export interface ReferenceDiscoveryEngines extends CampaignEngines {
  rdkit: RdkitTransport;
  /** Bioactivity source for target resolution. */
  bioactivity?: CompoundLookupTransport;
  /** Compound name resolution source. */
  compoundLookup?: CompoundLookupTransport;
  /** Structure actually docked into, with its relevance to the hypothesis. */
  receptorStructure?: ReceptorStructure | null;
}

/**
 * Runs the whole reference-compound pipeline.
 *
 * The order matters: the target is resolved BEFORE candidates exist, so the
 * hypothesis cannot be retrofitted to whatever the enumeration happened to
 * produce.
 */
export function runReferenceCompoundDiscovery(
  request: ReferenceCompoundDiscoveryRequest,
  engines: ReferenceDiscoveryEngines,
  options: CampaignOptions = {},
): ReferenceDiscoveryResult {
  // 1. Target hypothesis FIRST — pre-registered before any candidate exists.
  const targetHypothesis = resolveTargetHypothesis(request.target, engines.bioactivity);

  // 2. Resolve the reference compound to a starting structure.
  const referenceResolution = resolveCompound(
    { kind: request.reference.kind, value: request.reference.value },
    engines.compoundLookup,
  );
  const excluded = new Set(request.excludeStructures ?? []);
  const seeds = seedsFromResolution(referenceResolution).filter((s) => !excluded.has(s));

  const receptorStructure = engines.receptorStructure ?? null;
  const affinityAboutTarget = affinityIsAboutTarget(targetHypothesis, receptorStructure);

  const generationRequest: GenerationRequest = {
    seeds,
    transformations: request.transformations,
    depth: request.depth ?? 1,
    maxCandidates: request.candidateBudget,
    constraints: request.question.constraints,
  };

  // 3. Campaign over the resolved seeds, with docking told what it is docking
  //    into so a score cannot be mislabelled downstream.
  const run = runDiscoveryCampaign(
    request.question,
    rdkitSmartsEnumeratorProvider(engines.rdkit),
    generationRequest,
    request.objectives,
    {
      admet: engines.admet,
      docking: engines.docking,
      receptor: receptorStructure === null ? null : {
        kind: receptorStructure.relevance === 'SMALL_MOLECULE_STANDIN' ? 'SMALL_MOLECULE_STANDIN' : 'REAL_RECEPTOR',
        pdbqt: receptorStructure.pdbqt,
        provenance: receptorStructure.provenance,
        center: receptorStructure.center,
        boxSize: receptorStructure.boxSize,
      },
    },
    { ...options, target: targetHypothesis, receptorStructure },
  );

  const limitations = [
    ...run.limitations,
    `Target status: ${targetHypothesis.status}. ${targetHypothesis.statusReason}`,
    'A mechanism reported for the REFERENCE compound is evidence about the reference. It is not evidence that any analogue generated here shares it.',
    affinityAboutTarget.meaningful
      ? 'Docking scores describe the hypothesised target, but remain predictions from an empirical scoring function, not measured binding.'
      : `No score in this run describes the hypothesised target: ${affinityAboutTarget.reason}`,
    ...(receptorStructure?.proxyCaveat === null || receptorStructure?.proxyCaveat === undefined
      ? []
      : [receptorStructure.proxyCaveat]),
  ];

  return {
    run,
    referenceResolution,
    targetHypothesis,
    affinityAboutTarget,
    prioritisation: prioritisationStatement(targetHypothesis, affinityAboutTarget.meaningful),
    limitations,
  };
}
