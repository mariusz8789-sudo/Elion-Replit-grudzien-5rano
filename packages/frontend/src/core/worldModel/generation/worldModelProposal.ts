import { generateSpecifiedWorld, type SpecifiedWorld } from '../specification/compiler';
import { validateSpecification, type SpecificationValidationResult } from '../specification/validation';
import type { WorldSpecification, WorldTemplateId } from '../specification/worldSpecification';

/**
 * LEARNED / GENERATIVE MODEL INTERFACE — WorldModelProposal 2.0 (Genesis
 * Scientific World Model 3.0, sections 1-2).
 *
 * `WorldModelProposal` is a stable, VERSIONED contract for how ANY proposer
 * — a real LLM (generation/llmWorldProposalAdapter.ts), a deterministic
 * script (`proposeWorldDeterministically` below), a human-authored request,
 * or a future system-generated one — hands Genesis a candidate
 * `WorldSpecification`. The architectural property that matters, regardless
 * of `source`: `validateProposal`/`realizeProposal` are the ONLY way a
 * proposal ever reaches a real graph. An `'LLM'` proposal goes through the
 * EXACT SAME `validateSpecification`/`compileSpecification` gate as a
 * hand-authored one — a proposal can never bypass scientific validation,
 * and an invalid one is REJECTED with clear, machine-readable violations,
 * never silently repaired.
 */
export const WORLD_MODEL_PROPOSAL_SCHEMA_VERSION = '2.0.0';

/** Who produced this proposal — an LLM, a deterministic script, a human request, or another system component. */
export type WorldModelProposalSource = 'LLM' | 'SCRIPT' | 'USER' | 'SYSTEM';

export interface WorldModelProposalProvenance {
  /** ISO 8601 timestamp of when the proposal was produced. */
  createdAt: string;
  /** The exact model id that produced this proposal, when `source === 'LLM'` (e.g. `claude-opus-4-8`). */
  model?: string;
  /** The original natural-language request this proposal was derived from, when one exists. */
  requestText?: string;
  notes?: string;
}

export interface WorldModelProposal {
  schemaVersion: string;
  proposalId: string;
  source: WorldModelProposalSource;
  specification: WorldSpecification;
  /** 0..1 — only meaningful for a probabilistic proposer; the deterministic proposer below always reports 1 (fully confident in its own structural composition, which says nothing about scientific accuracy — that is `validateSpecification`'s job). */
  confidence?: number;
  rationale?: string;
  provenance: WorldModelProposalProvenance;
}

export interface ProposalValidationResult {
  proposal: WorldModelProposal;
  validation: SpecificationValidationResult;
  /** When this validation pass ran — mission's "validation metadata" requirement, kept minimal rather than inventing a larger audit record. */
  validatedAt: string;
}

/**
 * Structural (shape) validation of a proposal BEFORE it is safe to read as
 * a `WorldModelProposal` at all — distinct from `validateProposal`, which
 * validates the SCIENTIFIC content of an already well-shaped proposal's
 * `specification`. This exists because a proposal may originate from an
 * external source (an LLM's JSON, a network payload) that TypeScript's
 * static types cannot protect against at runtime.
 */
export interface ProposalShapeIssue {
  path: string;
  message: string;
}

export function validateProposalShape(value: unknown): { ok: true; proposal: WorldModelProposal } | { ok: false; issues: readonly ProposalShapeIssue[] } {
  const issues: ProposalShapeIssue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message });

  if (!value || typeof value !== 'object') {
    return { ok: false, issues: [{ path: '', message: 'proposal must be an object' }] };
  }
  const p = value as Partial<WorldModelProposal>;

  if (typeof p.schemaVersion !== 'string' || !p.schemaVersion) err('schemaVersion', 'schemaVersion must be a non-empty string');
  if (typeof p.proposalId !== 'string' || !p.proposalId) err('proposalId', 'proposalId must be a non-empty string');
  if (!p.source || !(['LLM', 'SCRIPT', 'USER', 'SYSTEM'] as const).includes(p.source)) {
    err('source', 'source must be one of LLM, SCRIPT, USER, SYSTEM');
  }
  if (!p.specification || typeof p.specification !== 'object') {
    err('specification', 'specification must be an object');
  } else {
    const spec = p.specification;
    if (typeof spec.worldId !== 'string' || !spec.worldId) err('specification.worldId', 'worldId must be a non-empty string');
    if (typeof spec.seed !== 'number' || !Number.isFinite(spec.seed)) err('specification.seed', 'seed must be a finite number');
    if (!Array.isArray(spec.worldType) || spec.worldType.length === 0) err('specification.worldType', 'worldType must be a non-empty array');
  }
  if (!p.provenance || typeof p.provenance !== 'object' || typeof p.provenance.createdAt !== 'string') {
    err('provenance.createdAt', 'provenance.createdAt must be a non-empty ISO timestamp string');
  }
  if (p.confidence !== undefined && (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1)) {
    err('confidence', 'confidence, when present, must be a number in [0,1]');
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, proposal: value as WorldModelProposal };
}

/** Validates a proposal's specification through the SAME gate any hand-authored specification goes through. */
export function validateProposal(proposal: WorldModelProposal): ProposalValidationResult {
  return { proposal, validation: validateSpecification(proposal.specification), validatedAt: new Date().toISOString() };
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
 * TODAY's deterministic proposer (`source: 'SCRIPT'`): turns a small set of
 * explicit request flags into a real `WorldSpecification` composed from
 * existing templates. This is intentionally NOT natural-language
 * understanding — it is the simplest possible real implementation of the
 * `WorldModelProposal` interface, so the pipeline downstream of it
 * (`validateProposal` -> `realizeProposal`) is exercised by something real
 * today, and remains available as a deterministic fallback/test path
 * alongside the real `source: 'LLM'` adapter (generation/
 * llmWorldProposalAdapter.ts) — never a silent substitute for it in
 * production.
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
    schemaVersion: WORLD_MODEL_PROPOSAL_SCHEMA_VERSION,
    proposalId: `proposal:${request.worldId}:${request.seed}`,
    source: 'SCRIPT',
    specification,
    confidence: 1,
    rationale: `Composed templates [${worldType.join(', ')}] from explicit request flags; extremeRainfall=${request.extremeRainfall ?? false} is descriptive only and must be realized by a scenario's own event/cascade rules, not fabricated here.`,
    provenance: { createdAt: new Date().toISOString(), notes: 'Deterministic rules proposer — not natural-language understanding.' },
  };
}
