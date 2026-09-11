import type { SavedExperiment } from '../scienceMemory';

/**
 * EVIDENCE IMPACT SCORING — "how many other experiments/campaigns depend on
 * this evidence" (an EvidencePack, or a whole `SavedExperiment`), answered
 * purely from reference fields Science Memory records ALREADY carry:
 *
 *   - `evidencePackId` / `evidenceChainId` (top-level on every
 *     `SavedExperiment`, and per-hypothesis inside `hypothesisLoop.outcomes`
 *     / `discoveryLoop.evidenceChain` — the same identity `matrixRelations.ts`
 *     already groups by as `SHARED_EVIDENCE_PACK`/`SHARED_EVIDENCE_CHAIN`).
 *   - `discoveryLoop.campaignProvenance.previousCycleId` — a Research
 *     Campaign cycle (`researchCampaign.ts`) pointing at the REAL previous
 *     cycle's own `SavedExperiment.id` it started from.
 *   - `researchChain.steps[].savedExperimentIds` — a banked research chain
 *     (`core/agent/researchChain.ts`) pointing at every step's own saved
 *     record.
 *   - `biotech.evidenceIds` — a biotech discovery record's declared
 *     evidence references.
 *
 * This is NOT a second Memory, a second Evidence store, or a second graph
 * engine — it is a stateless projection over `SavedExperiment[]` the caller
 * already has (same shape as `matrixRelations.ts`), transitively closed:
 * a record that depends on a record that depends on the target still
 * counts, because "how much would break if this evidence turned out to be
 * wrong" is a transitive question — a 3-cycle Research Campaign chained
 * 1→2→3 means Cycle 3 depends on Cycle 1's evidence every bit as much as
 * Cycle 2 does, even though Cycle 3 only points directly at Cycle 2.
 *
 * No re-execution, no replay, no re-derivation of a "would this still hold"
 * verdict: `downstreamFalsifiedOrInconclusive` reports ONLY the epistemic
 * status a dependent record ALREADY carries from its own real execution
 * (`hypothesisLoop.outcomes[].status`, `discoveryLoop.evidenceChain[].status`,
 * `researchChain.terminalStatus`) — never a fabricated "what if" answer.
 */
export const EVIDENCE_IMPACT_CONTRACT_VERSION = '1.0.0';

/** One record found to depend — directly or transitively — on the target. */
export interface EvidenceImpactDependent {
  readonly id: string;
  readonly experimentName: string;
  /** The exact field(s) that proved this dependency — never a heuristic. See file header. */
  readonly via: readonly string[];
  /** True when this dependent is itself reached only through another dependent, not directly from the target. */
  readonly transitive: boolean;
}

export interface EvidenceImpactReport {
  readonly contractVersion: string;
  readonly targetId: string;
  /** Every OTHER record (direct or transitive) that depends on `targetId`. */
  readonly dependentExperiments: readonly EvidenceImpactDependent[];
  /** The subset of `dependentExperiments` that are themselves a banked `SavedResearchChainManifest`. */
  readonly dependentCampaigns: readonly EvidenceImpactDependent[];
  /** The subset of `dependentExperiments` whose OWN already-recorded status is FALSIFIED/INCONCLUSIVE/BLOCKED. */
  readonly downstreamFalsifiedOrInconclusive: readonly (EvidenceImpactDependent & { readonly statuses: readonly string[] })[];
  /** `dependentExperiments.length` — how many OTHER experiments/campaigns depend on this evidence, direct or transitive. */
  readonly impactScore: number;
}

interface DirectReference {
  readonly targetId: string;
  readonly via: string;
}

/** Every id ONE record directly references out, each tagged with the exact field that proved it. */
function directReferences(record: SavedExperiment): readonly DirectReference[] {
  const refs: DirectReference[] = [];
  const add = (targetId: string | null | undefined, via: string): void => {
    if (targetId) refs.push({ targetId, via });
  };

  add(record.evidencePackId, 'evidencePackId');
  add(record.evidenceChainId, 'evidenceChainId');
  add(record.discoveryLoop?.campaignProvenance?.previousCycleId, 'discoveryLoop.campaignProvenance.previousCycleId');

  for (const outcome of record.hypothesisLoop?.outcomes ?? []) {
    add(outcome.evidencePackId, 'hypothesisLoop.outcomes[].evidencePackId');
    add(outcome.evidenceChainId, 'hypothesisLoop.outcomes[].evidenceChainId');
  }
  for (const link of record.discoveryLoop?.evidenceChain ?? []) {
    add(link.evidencePackId, 'discoveryLoop.evidenceChain[].evidencePackId');
    add(link.evidenceChainId, 'discoveryLoop.evidenceChain[].evidenceChainId');
  }
  for (const evidenceId of record.biotech?.evidenceIds ?? []) {
    add(evidenceId, 'biotech.evidenceIds');
  }
  for (const step of record.researchChain?.steps ?? []) {
    for (const savedId of step.savedExperimentIds) {
      add(savedId, `researchChain.steps[${step.step}].savedExperimentIds`);
    }
  }

  return refs;
}

/** Every already-recorded epistemic status ONE record carries — never re-derived, never re-executed. */
function recordedStatuses(record: SavedExperiment): readonly string[] {
  const statuses: string[] = [];
  for (const outcome of record.hypothesisLoop?.outcomes ?? []) statuses.push(outcome.status);
  for (const link of record.discoveryLoop?.evidenceChain ?? []) statuses.push(link.status);
  if (record.researchChain !== undefined) statuses.push(record.researchChain.terminalStatus);
  return statuses;
}

const CONCERNING_STATUSES: ReadonlySet<string> = new Set(['FALSIFIED', 'INCONCLUSIVE', 'BLOCKED']);

/**
 * Counts how many OTHER Science Memory records depend — directly or
 * transitively — on `targetId` (an `EvidencePack`/`evidenceChainId`, or a
 * `SavedExperiment.id`), purely from reference fields already saved. See
 * file header for the exact fields read and why transitivity matters.
 */
export function computeEvidenceImpact(targetId: string, records: readonly SavedExperiment[]): EvidenceImpactReport {
  const byId = new Map(records.map((record) => [record.id, record]));
  const directRefsById = new Map(records.map((record) => [record.id, directReferences(record)]));

  const found = new Map<string, { via: Set<string>; transitive: boolean }>();
  const frontier: string[] = [targetId];
  const reachedIds = new Set<string>([targetId]);

  while (frontier.length > 0) {
    const current = frontier.shift()!;
    for (const record of records) {
      if (record.id === targetId || reachedIds.has(record.id)) continue;
      const matches = (directRefsById.get(record.id) ?? []).filter((ref) => ref.targetId === current);
      if (matches.length === 0) continue;
      reachedIds.add(record.id);
      found.set(record.id, { via: new Set(matches.map((m) => m.via)), transitive: current !== targetId });
      frontier.push(record.id);
    }
  }

  const dependentExperiments: EvidenceImpactDependent[] = [...found.entries()]
    .map(([id, entry]) => ({
      id,
      experimentName: byId.get(id)?.experimentName ?? id,
      via: [...entry.via].sort(),
      transitive: entry.transitive,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const dependentCampaigns = dependentExperiments.filter((dependent) => byId.get(dependent.id)?.researchChain !== undefined);

  const downstreamFalsifiedOrInconclusive: (EvidenceImpactDependent & { readonly statuses: readonly string[] })[] = [];
  for (const dependent of dependentExperiments) {
    const record = byId.get(dependent.id);
    const statuses: readonly string[] = record === undefined ? [] : recordedStatuses(record).filter((status) => CONCERNING_STATUSES.has(status));
    if (statuses.length > 0) downstreamFalsifiedOrInconclusive.push({ ...dependent, statuses });
  }

  return {
    contractVersion: EVIDENCE_IMPACT_CONTRACT_VERSION,
    targetId,
    dependentExperiments,
    dependentCampaigns,
    downstreamFalsifiedOrInconclusive,
    impactScore: dependentExperiments.length,
  };
}
