import { detectContradictions } from './contradictions.js';
import { fingerprint } from './hash.js';
import { rankExperiments } from './informationGain.js';
import { AppendOnlyMetaMemory } from './memory.js';
import { assertClaim, screenFreeText } from './policy.js';
import { evaluateSurprise } from './surprise.js';
import type { CanonicalCapabilityPort, CanonicalGoalPort, EvidencePort } from './ports.js';
import type { HashPort } from '../hashReplay/hashPort.js';
import type {
  CapabilityRecord,
  ContradictionRecord,
  CounterfactualRecord,
  DecisionTrace,
  EffectiveClaim,
  ExperimentCandidate,
  GoalRecord,
  KnowledgeClaim,
  KnowledgeGap,
  MetaAuditResult,
  MetaLearningRecord,
  ObservationRecord,
  PredictionRecord,
  RankedExperiment,
  SelfModelSnapshot,
  SelfRepairProposal,
  SurpriseRecord,
  TemporalSelfState,
} from './types.js';

export interface GenesisMetaCognitionDeps {
  readonly evidence: EvidencePort;
  readonly capabilityPort?: CanonicalCapabilityPort;
  readonly goalPort?: CanonicalGoalPort;
  /** OPTIONAL secondary, chain-verifiable local echo of what was sent to `evidence` —
   * never a substitute for it. See memory.ts's file header (fix area 3). */
  readonly memory?: AppendOnlyMetaMemory;
  /** PRODUCTION CONTRACT (fix area 4): bind the real repo's `core/events/hash.ts`
   * HashPort here. Defaults to a TEST-ONLY reference implementation when omitted. */
  readonly hash?: HashPort;
}

export class GenesisMetaCognitionEngine {
  private readonly claims = new Map<string, KnowledgeClaim>();
  private readonly gaps = new Map<string, KnowledgeGap>();
  private contradictions: ContradictionRecord[] = [];
  private readonly capabilities = new Map<string, CapabilityRecord>();
  private readonly goals = new Map<string, GoalRecord>();
  private readonly predictions = new Map<string, PredictionRecord>();
  private readonly observations = new Map<string, ObservationRecord>();
  private readonly surprises = new Map<string, SurpriseRecord>();
  private readonly decisionTraces = new Map<string, DecisionTrace>();
  private readonly counterfactuals = new Map<string, CounterfactualRecord>();
  private readonly metaLearning = new Map<string, MetaLearningRecord>();
  private readonly selfRepairProposals = new Map<string, SelfRepairProposal>();
  private temporalState: TemporalSelfState | undefined;

  public constructor(private readonly deps: GenesisMetaCognitionDeps) {}

  private fp(value: unknown): string {
    return fingerprint(value, this.deps.hash);
  }

  /** Fix area 3: derives 'CONTRADICTED' at read time without ever mutating the
   * originally-asserted `state` on the stored claim. */
  private toEffective(claim: KnowledgeClaim): EffectiveClaim {
    const contradicted = this.contradictions.some((c) => c.claimIds.includes(claim.claimId));
    return { ...claim, derivedState: contradicted ? 'CONTRADICTED' : claim.state };
  }

  public async recordClaim(claim: KnowledgeClaim): Promise<void> {
    assertClaim(claim);
    screenFreeText([typeof claim.value === 'string' ? claim.value : undefined, ...(claim.assumptions ?? [])]);
    this.claims.set(claim.claimId, claim);
    await this.recomputeContradictions();
    await this.emit('META_CLAIM_RECORDED', claim.claimId, claim);
  }

  public async recordGap(gap: KnowledgeGap): Promise<void> {
    screenFreeText([gap.question, gap.reason]);
    this.gaps.set(gap.gapId, gap);
    await this.emit('META_GAP_RECORDED', gap.gapId, gap);
  }

  public async syncCapabilities(): Promise<void> {
    if (!this.deps.capabilityPort) return;
    const rows = await this.deps.capabilityPort.listCapabilities();
    for (const row of rows) this.capabilities.set(row.capabilityId, { ...row });
  }

  public async syncGoals(): Promise<void> {
    if (!this.deps.goalPort) return;
    const rows = await this.deps.goalPort.listGoals();
    for (const row of rows) this.goals.set(row.goalId, { ...row });
  }

  public async recordPrediction(prediction: PredictionRecord): Promise<void> {
    this.predictions.set(prediction.predictionId, prediction);
    await this.emit('META_PREDICTION_RECORDED', prediction.predictionId, prediction);
  }

  /** Fix area 3: every observation now always gets a durable META_OBSERVATION_RECORDED
   * event, not only ones that happen to match an existing prediction. */
  public async recordObservation(observation: ObservationRecord): Promise<readonly SurpriseRecord[]> {
    this.observations.set(observation.observationId, observation);
    await this.emit('META_OBSERVATION_RECORDED', observation.observationId, observation);
    const related = [...this.predictions.values()].filter((prediction) => prediction.target === observation.target);
    const produced: SurpriseRecord[] = [];
    for (const prediction of related) {
      const surprise = evaluateSurprise(prediction, observation, this.deps.hash);
      this.surprises.set(surprise.surpriseId, surprise);
      await this.emit('META_SURPRISE_RECORDED', surprise.surpriseId, surprise);
      produced.push(surprise);
    }
    return produced;
  }

  public rankNextExperiments(candidates: readonly ExperimentCandidate[]): RankedExperiment[] {
    return rankExperiments(candidates, [...this.capabilities.values()]);
  }

  public async recordCounterfactual(record: CounterfactualRecord): Promise<void> {
    if (record.kind !== 'COUNTERFACTUAL' || record.state !== 'SIMULATED') {
      throw new Error('Counterfactual records must remain explicitly COUNTERFACTUAL + SIMULATED');
    }
    screenFreeText(record.predictedConsequences);
    this.counterfactuals.set(record.counterfactualId, record);
    await this.emit('META_COUNTERFACTUAL', record.counterfactualId, record);
  }

  public async recordMetaLearning(record: MetaLearningRecord): Promise<void> {
    screenFreeText([record.lesson, record.proposedPolicyChange]);
    this.metaLearning.set(record.lessonId, record);
    await this.emit('META_LEARNING_RECORDED', record.lessonId, record);
  }

  public async proposeSelfRepair(input: Omit<SelfRepairProposal, 'requiresHumanApproval' | 'status'>): Promise<SelfRepairProposal> {
    screenFreeText([input.issue, input.proposedChange]);
    const proposal: SelfRepairProposal = { ...input, requiresHumanApproval: true, status: 'PROPOSED' };
    this.selfRepairProposals.set(proposal.proposalId, proposal);
    await this.emit('META_SELF_REPAIR_PROPOSED', proposal.proposalId, proposal);
    return proposal;
  }

  public async recordTemporalState(state: TemporalSelfState): Promise<void> {
    if (this.temporalState && state.sequence <= this.temporalState.sequence) {
      throw new Error('Temporal self-state sequence must increase monotonically');
    }
    this.temporalState = { ...state };
    await this.emit('META_TEMPORAL_STATE', String(state.sequence), state);
  }

  public getClaim(claimId: string): EffectiveClaim | undefined {
    const claim = this.claims.get(claimId);
    return claim ? this.toEffective(claim) : undefined;
  }
  public getGap(gapId: string): KnowledgeGap | undefined { return this.gaps.get(gapId); }
  public listOpenGaps(): readonly KnowledgeGap[] { return [...this.gaps.values()].filter((gap) => gap.status === 'OPEN'); }
  public listContradictions(): readonly ContradictionRecord[] { return [...this.contradictions]; }
  public getTemporalState(): TemporalSelfState | undefined { return this.temporalState ? { ...this.temporalState } : undefined; }

  public async recordDecision(input: Omit<DecisionTrace, 'fingerprint'>): Promise<DecisionTrace> {
    screenFreeText([input.decision, ...input.inputs, ...input.assumptions, ...input.rejectedAlternatives, ...input.uncertaintyNotes]);
    const fingerprintValue = this.fp(input);
    const trace: DecisionTrace = { ...input, fingerprint: fingerprintValue };
    this.decisionTraces.set(trace.traceId, trace);
    await this.emit('META_DECISION_TRACE', trace.traceId, trace);
    return trace;
  }

  public async audit(): Promise<MetaAuditResult> {
    await this.syncCapabilities();
    await this.syncGoals();
    await this.recomputeContradictions();
    const issues: MetaAuditResult['issues'][number][] = [];

    for (const contradiction of this.contradictions) {
      issues.push({ code: 'CONTRADICTION', severity: contradiction.severity === 'HIGH' ? 'ERROR' : 'WARNING', message: `${contradiction.subject}.${contradiction.predicate} has conflicting supported values.`, refs: [...contradiction.claimIds] });
    }
    for (const gap of this.gaps.values()) {
      if (gap.status === 'OPEN' && (gap.priority === 'HIGH' || gap.priority === 'CRITICAL')) {
        issues.push({ code: 'HIGH_PRIORITY_GAP', severity: gap.priority === 'CRITICAL' ? 'ERROR' : 'WARNING', message: gap.question, refs: [gap.gapId, ...gap.relatedClaimIds] });
      }
    }
    for (const goal of this.goals.values()) {
      if (goal.status !== 'ACTIVE') continue;
      const missing = goal.requiredCapabilities.filter((id) => this.capabilities.get(id)?.availability !== 'AVAILABLE');
      if (missing.length > 0) issues.push({ code: 'GOAL_CAPABILITY_GAP', severity: 'WARNING', message: `Goal ${goal.goalId} lacks capabilities: ${missing.join(', ')}`, refs: [goal.goalId, ...missing] });
    }
    for (const surprise of this.surprises.values()) {
      if (surprise.kind === 'UNEXPECTED') issues.push({ code: 'PREDICTION_ERROR', severity: 'WARNING', message: surprise.explanation, refs: [surprise.predictionId, surprise.observationId] });
    }

    const snapshot = this.snapshot();
    const status = issues.some((issue) => issue.severity === 'ERROR') ? 'FAIL' : issues.some((issue) => issue.severity === 'WARNING') ? 'PASS_WITH_WARNINGS' : 'PASS';
    const result: MetaAuditResult = { status, issues, snapshotFingerprint: snapshot.fingerprint };
    await this.emit('META_AUDIT', snapshot.fingerprint, result);
    return result;
  }

  public snapshot(): SelfModelSnapshot {
    const body = {
      snapshotVersion: 1 as const,
      claims: [...this.claims.values()].map((c) => this.toEffective(c)).sort((a, b) => a.claimId.localeCompare(b.claimId)),
      gaps: [...this.gaps.values()].sort((a, b) => a.gapId.localeCompare(b.gapId)),
      contradictions: [...this.contradictions].sort((a, b) => a.contradictionId.localeCompare(b.contradictionId)),
      capabilities: [...this.capabilities.values()].sort((a, b) => a.capabilityId.localeCompare(b.capabilityId)),
      goals: [...this.goals.values()].sort((a, b) => a.goalId.localeCompare(b.goalId)),
      predictions: [...this.predictions.values()].sort((a, b) => a.predictionId.localeCompare(b.predictionId)),
      observations: [...this.observations.values()].sort((a, b) => a.observationId.localeCompare(b.observationId)),
      surprises: [...this.surprises.values()].sort((a, b) => a.surpriseId.localeCompare(b.surpriseId)),
      decisionTraces: [...this.decisionTraces.values()].sort((a, b) => a.traceId.localeCompare(b.traceId)),
      counterfactuals: [...this.counterfactuals.values()].sort((a, b) => a.counterfactualId.localeCompare(b.counterfactualId)),
      metaLearning: [...this.metaLearning.values()].sort((a, b) => a.lessonId.localeCompare(b.lessonId)),
      selfRepairProposals: [...this.selfRepairProposals.values()].sort((a, b) => a.proposalId.localeCompare(b.proposalId)),
      ...(this.temporalState ? { temporalState: { ...this.temporalState } } : {}),
    };
    return { ...body, fingerprint: this.fp(body) };
  }

  public memorySnapshot() {
    return this.deps.memory?.snapshot();
  }

  /** Fix area 3: now emits a real META_CONTRADICTION_DETECTED event for every NEWLY
   * detected contradiction (diffed against the previous set, so re-adding an already-known
   * contradiction on every claim insertion does not re-emit it). Previously this only
   * recomputed the in-memory `contradictions` array with no emission at all. */
  private async recomputeContradictions(): Promise<void> {
    const next = detectContradictions([...this.claims.values()], this.deps.hash);
    const previousIds = new Set(this.contradictions.map((c) => c.contradictionId));
    this.contradictions = next;
    for (const contradiction of next) {
      if (!previousIds.has(contradiction.contradictionId)) {
        await this.emit('META_CONTRADICTION_DETECTED', contradiction.contradictionId, contradiction);
      }
    }
  }

  private async emit(type: Parameters<EvidencePort['append']>[0]['type'], refId: string, payload: object): Promise<void> {
    const event = { type, refId, fingerprint: this.fp(payload), payload: payload as Readonly<Record<string, unknown>> };
    await this.deps.evidence.append(event);
    this.deps.memory?.append(type, refId, event);
  }
}
