import { generateSpecifiedWorld, type SpecifiedWorld } from '../specification/compiler';
import { validateSpecification, type SpecificationValidationResult } from '../specification/validation';
import type { WorldSpecification, WorldTemplateId } from '../specification/worldSpecification';

/**
 * LEARNED / GENERATIVE MODEL INTERFACE (Generative Scientific World Model
 * 2.0, section 15).
 *
 * `WorldModelProposal` is the architecture for a FUTURE learned/generative
 * proposer (an LLM, a neural world model, an external service) to hand
 * Genesis a candidate `WorldSpecification` — NOT a trained model, and this
 * file does not build one. `proposeWorldDeterministically` below is
 * TODAY's implementation: a small, honest, deterministic rules function
 * standing in for that future `source`. The architectural property that
 * matters is that `validateProposal`/`realizeProposal` are the ONLY way a
 * proposal ever reaches a real graph, regardless of `source` — a
 * `'neural-world-model'` proposal goes through the EXACT SAME
 * `validateSpecification`/`compileSpecification` gate as a hand-authored
 * one. A proposal can never bypass scientific validation.
 */
export type WorldModelProposalSource = 'deterministic-rules' | 'llm' | 'neural-world-model' | 'external-model';

export interface WorldModelProposal {
  proposalId: string;
  source: WorldModelProposalSource;
  specification: WorldSpecification;
  /** 0..1 — only meaningful for a probabilistic proposer; the deterministic proposer below always reports 1 (fully confident in its own structural composition, which says nothing about scientific accuracy — that is `validateSpecification`'s job). */
  confidence?: number;
  rationale?: string;
}

export interface ProposalValidationResult {
  proposal: WorldModelProposal;
  validation: SpecificationValidationResult;
}

/** Validates a proposal's specification through the SAME gate any hand-authored specification goes through. */
export function validateProposal(proposal: WorldModelProposal): ProposalValidationResult {
  return { proposal, validation: validateSpecification(proposal.specification) };
}

/**
 * Compiles and generates a proposal's specification — throws (via
 * `compileSpecification`) if it fails validation, exactly like any other
 * specification. There is no special bypass path for any `source`.
 */
export function realizeProposal(proposal: WorldModelProposal): SpecifiedWorld {
  return generateSpecifiedWorld(proposal.specification);
}

/**
 * TODAY's deterministic proposer: turns a small set of explicit request
 * flags into a real `WorldSpecification` composed from existing templates.
 * This is intentionally NOT natural-language understanding — it is the
 * simplest possible real implementation of the `WorldModelProposal`
 * interface, so the pipeline downstream of it (`validateProposal` ->
 * `realizeProposal`) is exercised by something real today, ready to be
 * swapped for an actual learned proposer later without changing anything
 * downstream.
 */
export interface DeterministicProposalRequest {
  worldId: string;
  seed: number;
  wantsCity?: boolean;
  wantsLaboratory?: boolean;
  wantsWaterSystem?: boolean;
  wantsEpidemiology?: boolean;
  wantsIndustrialSite?: boolean;
  populationCount?: number;
  /** Descriptive only: a scenario runner may read this to decide whether to schedule a rainfall event; this proposer does not itself simulate or fabricate any hydrological consequence. */
  extremeRainfall?: boolean;
}

export function proposeWorldDeterministically(request: DeterministicProposalRequest): WorldModelProposal {
  const worldType: WorldTemplateId[] = [];
  if (request.wantsCity) worldType.push('CITY');
  if (request.wantsLaboratory) worldType.push('LABORATORY');
  if (request.wantsWaterSystem) worldType.push('WATER_SYSTEM');
  if (request.wantsEpidemiology) worldType.push('EPIDEMIOLOGY');
  if (request.wantsIndustrialSite) worldType.push('INDUSTRIAL_SITE');
  if (worldType.length === 0) worldType.push('CITY');

  const specification: WorldSpecification = {
    worldId: request.worldId,
    seed: request.seed,
    worldType,
    population: request.populationCount ? { count: request.populationCount } : undefined,
    scientificDomains: [
      ...(request.wantsLaboratory || request.wantsIndustrialSite ? [{ domain: 'chemistry' as const, required: false }] : []),
      ...(request.wantsWaterSystem ? [{ domain: 'hydraulics' as const, required: false }] : []),
      ...(request.wantsEpidemiology ? [{ domain: 'epidemiology' as const, required: false }] : []),
    ],
    provenanceNote: `Deterministically proposed from explicit request flags (not natural-language understanding).`,
  };

  return {
    proposalId: `proposal:${request.worldId}:${request.seed}`,
    source: 'deterministic-rules',
    specification,
    confidence: 1,
    rationale: `Composed templates [${worldType.join(', ')}] from explicit request flags; extremeRainfall=${request.extremeRainfall ?? false} is descriptive only and must be realized by a scenario's own event/cascade rules, not fabricated here.`,
  };
}
