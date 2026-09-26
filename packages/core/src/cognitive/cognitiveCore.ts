import {
  CommandBusAdapter,
  CommandEnvelope,
  DecisionRecord,
  EvidenceRef,
  ExperimentFabricAdapter,
  Goal,
  LanguageModelAdapter,
  Observation,
} from './types.js';
import { WorkingMemory, InMemoryLongTermMemory } from './memory.js';
import { WorldModel } from './worldModel.js';
import { GoalManager } from './goals.js';
import { HypothesisEngine } from './hypothesis.js';
import { EvidenceReasoner } from './evidence.js';
import { FalsificationEngine } from './falsification.js';
import { ExperimentPlanner } from './experiment.js';
import { CognitivePlanner } from './planner.js';
import { SelfMonitor } from './selfMonitor.js';
import { ProposalGate } from './proposalGate.js';
import { CommandPolicy } from './commandPolicy.js';
import { NullLanguageModel } from './llm.js';
import { stableHash } from './hash.js';

export interface CognitiveCoreDeps {
  commandBus: CommandBusAdapter;
  experimentFabric: ExperimentFabricAdapter;
  languageModel?: LanguageModelAdapter;
}

export class GenesisCognitiveCore {
  readonly world = new WorldModel();
  readonly memory = new WorkingMemory();
  readonly longTermMemory = new InMemoryLongTermMemory();
  readonly goals = new GoalManager();
  readonly hypotheses = new HypothesisEngine();
  readonly evidenceReasoner = new EvidenceReasoner();
  readonly falsification = new FalsificationEngine();
  readonly experimentPlanner = new ExperimentPlanner();
  readonly planner = new CognitivePlanner();
  readonly monitor = new SelfMonitor();
  readonly proposalGate = new ProposalGate();
  readonly commandPolicy = new CommandPolicy();

  private readonly languageModel: LanguageModelAdapter;

  constructor(private readonly deps: CognitiveCoreDeps) {
    this.languageModel = deps.languageModel ?? new NullLanguageModel();
  }

  async ingestObservation(observation: Observation): Promise<void> {
    this.memory.addObservation(observation);
    this.longTermMemory.write({
      id: observation.id,
      topic: observation.subject,
      text: `${observation.predicate}=${String(observation.value)}`,
      weight: observation.evidenceRefs.length,
      timestamp: observation.timestamp,
      tags: [observation.source, observation.epistemicStatus],
    });
  }

  addGoal(goal: Goal): void { this.goals.add(goal); }

  async cycle(now = Date.now()): Promise<DecisionRecord> {
    this.monitor.nextCycle();
    const activeGoals = this.goals.active(1);
    const goal = activeGoals[0];

    if (!goal) {
      const decision = this.record({
        timestamp: now,
        facts: ["No active goal."],
        constraints: [],
        uncertainty: 1,
        outcome: "DEFERRED",
        reason: "Cognitive core has no active goal.",
      });
      return decision;
    }

    const plan = this.planner.createPlan(goal, this.world, now);
    this.memory.addPlan(plan);

    if (plan.status === "BLOCKED") {
      this.monitor.blocked();
      return this.record({
        timestamp: now,
        goalId: goal.id,
        selectedPlanId: plan.id,
        facts: [plan.rationale],
        constraints: ["TARGET_NOT_IN_WORLD_MODEL"],
        uncertainty: 0.9,
        outcome: "BLOCKED",
        reason: plan.rationale,
      });
    }

    const candidates = await this.languageModel.propose({
      objective: goal.description,
      context: `${this.world.summarize()} | observations=${this.memory.recentObservations().length}`,
      allowedKinds: ["HYPOTHESIS", "PLAN", "QUESTION"],
    });

    for (const candidate of candidates) {
      const hypothesis = this.proposalGate.hypothesis(candidate);
      if (hypothesis) this.memory.addHypothesis(hypothesis);
    }

    return this.record({
      timestamp: now,
      goalId: goal.id,
      selectedPlanId: plan.id,
      facts: [plan.rationale, `World model: ${this.world.summarize()}`],
      constraints: ["EVIDENCE_MUST_BE_TRACEABLE", "MODEL_OUTPUT_IS_NOT_FACT"],
      uncertainty: Math.max(0.25, Math.min(1, 0.55 + this.memory.recentObservations().length * -0.02)),
      outcome: "SELECTED",
      reason: "Plan selected; high-impact execution remains behind policy and approval gates.",
    });
  }

  async proposeExperimentForLatestHypothesis(): Promise<{ accepted: boolean; sessionId?: string; reason?: string }> {
    const hypothesis = this.memory.activeHypotheses().slice(-1)[0];
    if (!hypothesis) return { accepted: false, reason: "No active hypothesis." };
    const proposal = this.experimentPlanner.proposeFor(hypothesis);
    return this.deps.experimentFabric.proposeExperiment(proposal);
  }

  async executeCommand(command: CommandEnvelope): Promise<{ accepted: boolean; reason?: string; result?: unknown }> {
    const policy = this.commandPolicy.evaluate(command);
    if (!policy.allowed) {
      this.monitor.blocked();
      return { accepted: false, reason: policy.reason };
    }
    const commandWithStableId = command.id || `cmd-${stableHash(command)}`;
    return this.deps.commandBus.dispatch({ ...command, id: commandWithStableId });
  }

  assessHypothesis(hypothesisId: string, evidence: EvidenceRef[]): ReturnType<EvidenceReasoner["assess"]> & { falsification: ReturnType<FalsificationEngine["assess"]> } {
    const hypothesis = this.memory.activeHypotheses().find((item) => item.id === hypothesisId);
    if (!hypothesis) throw new Error(`Hypothesis not found: ${hypothesisId}`);
    const assessment = this.evidenceReasoner.assess(hypothesis, this.memory.recentObservations(), evidence);
    const falsification = this.falsification.assess(hypothesis, this.memory.recentObservations());
    return { ...assessment, falsification };
  }

  private record(input: Omit<DecisionRecord, "id">): DecisionRecord {
    const decision = { id: `decision-${stableHash(input)}`, ...input };
    this.memory.addDecision(decision);
    return decision;
  }
}
