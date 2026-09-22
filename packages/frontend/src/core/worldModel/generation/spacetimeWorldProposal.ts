import type { EpistemicLabel } from '../../scientificWorlds/humanLab/epistemic';
import type { EvidenceRef, EvidenceSink } from '../../scientificWorlds/humanLab/contracts';
import { compileSpecification, type CompiledSpecification } from '../specification/compiler';
import { SPACETIME_TEMPLATE_IDS, type WorldSpecification, type WorldTemplateId } from '../specification/worldSpecification';
import {
  WORLD_MODEL_PROPOSAL_SCHEMA_VERSION,
  validateProposal,
  type ProposalValidationResult,
  type WorldModelProposal,
} from './worldModelProposal';

/**
 * PROMPT -> CANONICAL SPACETIME WorldSpecification (Genesis Spacetime product-binding
 * integration, Claude's non-render/non-film scope).
 *
 * `proposeWorldDeterministically` (worldModelProposal.ts) is DELIBERATELY not natural-language
 * understanding — its own doc explains why the wrapper "cannot honestly turn free text into
 * deterministic request flags." This module respects that boundary: `inferSpacetimeWorldTemplate`
 * is a SEPARATE, explicitly-labeled keyword heuristic (the same kind of classifier the reference
 * transfer package's `promptToWorld.ts` used), never claimed as full NLU, and it feeds a REAL
 * `WorldSpecification` through the exact same `validateProposal`/`compileSpecification` gate any
 * hand-authored one goes through — no bypass, no second pipeline.
 */
export const SPACETIME_WORLD_PROPOSAL_VERSION = '1.0.0';

function has(s: string, parts: readonly string[]): boolean {
  return parts.some((p) => s.includes(p));
}

/** Heuristic keyword classifier — one of the eight spacetime templates, or null when nothing matches. Never claimed as natural-language understanding. */
export function inferSpacetimeWorldTemplate(prompt: string): WorldTemplateId | null {
  const s = prompt.toLowerCase();
  if (has(s, ['einstein-rosen', 'einstein rosen', 'wormhole', 'most einsteina'])) return 'EINSTEIN_ROSEN_BRIDGE';
  if (has(s, ['multiverse', 'alternative timeline', 'alternate timeline', 'parallel world', 'timeline branch', 'równoległ'])) return 'MULTIVERSE_BRANCH';
  if (has(s, ['time dilation', 'relativity lab', 'relativistic', 'dylatac'])) return 'TIME_DILATION_LAB';
  if (has(s, ['quantum', 'tunneling', 'tunnelling', 'superposition', 'kwant'])) return 'QUANTUM';
  if (has(s, ['cosmology', 'gravity well', 'dark matter', 'spacetime', 'czasoprzestrz'])) return 'COSMOLOGY_SPACETIME';
  if (has(s, ['historical', 'history', 'battle', 'reconstruction', 'medieval'])) return 'HISTORICAL_RECONSTRUCTION';
  if (has(s, ['desert alien', 'alien world', 'two suns', 'desert planet', 'pustynn'])) return 'DESERT_ALIEN';
  if (s.includes('mars')) return 'MARS_RESEARCH';
  return null;
}

/**
 * The ONE canonical epistemic taxonomy (`scientificWorlds/humanLab/epistemic.ts`), reused —
 * not a new one. Historical reconstruction defaults to `RECONSTRUCTION`, upgrading to
 * `VERIFIED_SOURCE` only when the specification carries a real `provenanceNote` — the
 * "EVIDENCE_BACKED only when provenance exists" requirement, expressed in the repo's own
 * vocabulary rather than the reference package's separate, non-canonical one.
 */
export function spacetimeEpistemicLabel(templateId: WorldTemplateId, spec: WorldSpecification): EpistemicLabel {
  switch (templateId) {
    case 'EINSTEIN_ROSEN_BRIDGE': return 'HYPOTHESIS';
    case 'MULTIVERSE_BRANCH': return 'SIMULATION';
    case 'TIME_DILATION_LAB': return 'MODEL';
    case 'QUANTUM': return 'MODEL';
    case 'COSMOLOGY_SPACETIME': return 'MODEL';
    case 'HISTORICAL_RECONSTRUCTION': return spec.provenanceNote ? 'VERIFIED_SOURCE' : 'RECONSTRUCTION';
    case 'DESERT_ALIEN': return 'FICTION_INSPIRED';
    case 'MARS_RESEARCH': return 'NOT_MODELED';
    default: return 'MODEL';
  }
}

export interface SpacetimePromptRequest {
  requestId: string;
  prompt: string;
  seed: number;
  /** Only consumed by MULTIVERSE_BRANCH (branch count); ignored otherwise. */
  populationCount?: number;
  provenanceNote?: string;
}

/**
 * Builds a real `WorldModelProposal` from a prompt — throws when no spacetime template matches
 * rather than silently defaulting to an unrelated world, since this resolver exists specifically
 * for the eight spacetime templates.
 */
export function proposeSpacetimeWorld(request: SpacetimePromptRequest): WorldModelProposal {
  const templateId = inferSpacetimeWorldTemplate(request.prompt);
  if (!templateId) {
    throw new Error(`proposeSpacetimeWorld: no spacetime world template matched prompt "${request.prompt}" — known templates: ${SPACETIME_TEMPLATE_IDS.join(', ')}`);
  }
  const specification: WorldSpecification = {
    worldId: request.requestId,
    seed: request.seed,
    worldType: [templateId],
    ...(request.populationCount ? { population: { count: request.populationCount } } : {}),
    ...(request.provenanceNote ? { provenanceNote: request.provenanceNote } : {}),
  };
  return {
    schemaVersion: WORLD_MODEL_PROPOSAL_SCHEMA_VERSION,
    proposalId: `proposal:${request.requestId}:${request.seed}`,
    source: 'SCRIPT',
    specification,
    confidence: 1,
    rationale: `Matched spacetime template "${templateId}" from prompt keywords (heuristic classifier, not natural-language understanding).`,
    provenance: { createdAt: new Date().toISOString(), requestText: request.prompt, notes: 'Deterministic spacetime keyword classifier — see inferSpacetimeWorldTemplate.' },
  };
}

export interface SpacetimeWorldResolution {
  readonly contractVersion: string;
  readonly templateId: WorldTemplateId;
  readonly proposal: WorldModelProposal;
  readonly validation: ProposalValidationResult;
  readonly specification: WorldSpecification;
  readonly compiled: CompiledSpecification;
  readonly epistemicLabel: EpistemicLabel;
  readonly evidenceRefs: readonly EvidenceRef[];
}

function toRef(record: { readonly record: { readonly id: string; readonly contentHash: string } }): EvidenceRef {
  return { id: record.record.id, contentHash: record.record.contentHash };
}

/**
 * Full prompt -> canonical WorldSpecification -> compiled WorldBlueprint pipeline, emitting real
 * Evidence at each stage via the SAME canonical ledger seam every other module in this
 * integration lineage uses (`EvidenceSink`, `scientificWorlds/humanLab/contracts.ts`) — never a
 * second evidence store. Throws (via `validateProposal`'s consumer, `compileSpecification`) on an
 * invalid specification, exactly like any other specification; never silently repairs one.
 */
export function resolveSpacetimeWorldProposal(request: SpacetimePromptRequest, evidenceSink: EvidenceSink): SpacetimeWorldResolution {
  const evidenceRefs: EvidenceRef[] = [];
  evidenceRefs.push(toRef(evidenceSink.addRecord({
    sourceUrl: `spacetime-prompt:${request.requestId}`,
    claim: `Prompt accepted for spacetime world resolution: "${request.prompt}"`,
    claimType: 'SPACETIME_PROMPT_ACCEPTED',
    confidence: 1,
    provenance: { requestId: request.requestId, prompt: request.prompt },
  })));

  const templateId = inferSpacetimeWorldTemplate(request.prompt);
  if (!templateId) {
    throw new Error(`resolveSpacetimeWorldProposal: no spacetime world template matched prompt "${request.prompt}" — known templates: ${SPACETIME_TEMPLATE_IDS.join(', ')}`);
  }
  evidenceRefs.push(toRef(evidenceSink.addRecord({
    sourceUrl: `spacetime-prompt:${request.requestId}`,
    claim: `World type selected: ${templateId}`,
    claimType: 'SPACETIME_WORLD_TYPE_SELECTED',
    confidence: 1,
    provenance: { requestId: request.requestId, templateId },
  })));

  const proposal = proposeSpacetimeWorld(request);
  const validation = validateProposal(proposal);
  if (!validation.validation.ok) {
    const summary = validation.validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`resolveSpacetimeWorldProposal: proposal for "${request.prompt}" failed validation: ${summary}`);
  }
  evidenceRefs.push(toRef(evidenceSink.addRecord({
    sourceUrl: `spacetime-prompt:${request.requestId}`,
    claim: `Canonical WorldSpecification created for world "${proposal.specification.worldId}"`,
    claimType: 'SPACETIME_WORLD_SPECIFICATION_CREATED',
    confidence: 1,
    provenance: { requestId: request.requestId, worldId: proposal.specification.worldId, worldType: proposal.specification.worldType },
  })));

  const compiled = compileSpecification(proposal.specification);
  const childCount = compiled.blueprint.root.children?.length ?? 0;
  evidenceRefs.push(toRef(evidenceSink.addRecord({
    sourceUrl: `spacetime-prompt:${request.requestId}`,
    claim: `Compiled WorldBlueprint for world "${proposal.specification.worldId}" (${childCount} root children)`,
    claimType: 'SPACETIME_WORLD_BLUEPRINT_COMPILED',
    confidence: 1,
    provenance: { requestId: request.requestId, worldId: proposal.specification.worldId, childCount },
  })));

  const epistemicLabel = spacetimeEpistemicLabel(templateId, proposal.specification);

  if (templateId === 'MULTIVERSE_BRANCH') {
    const branchIds = compiled.templateIds.MULTIVERSE_BRANCH?.branchIds ?? [];
    evidenceRefs.push(toRef(evidenceSink.addRecord({
      sourceUrl: `spacetime-prompt:${request.requestId}`,
      claim: `Multiverse branch identity: ${Array.isArray(branchIds) ? branchIds.length : 0} timeline branch(es) declared (COUNTERFACTUAL_SIMULATION; real divergence requires comparing two generated worlds via worldCounterfactual.ts)`,
      claimType: 'SPACETIME_MULTIVERSE_BRANCH_IDENTITY',
      confidence: 1,
      provenance: { requestId: request.requestId, branchIds },
    })));
  }

  return { contractVersion: SPACETIME_WORLD_PROPOSAL_VERSION, templateId, proposal, validation, specification: proposal.specification, compiled, epistemicLabel, evidenceRefs };
}
