import { Observation, DecisionRecord, Hypothesis, Plan } from './types.js';

export interface MemoryEntry {
  id: string;
  topic: string;
  text: string;
  weight: number;
  timestamp: number;
  tags: string[];
}

export class WorkingMemory {
  private readonly observations: Observation[] = [];
  private readonly hypotheses: Hypothesis[] = [];
  private readonly plans: Plan[] = [];
  private readonly decisions: DecisionRecord[] = [];

  constructor(private readonly maxItems = 64) {}

  addObservation(observation: Observation): void {
    this.observations.push(observation);
    while (this.observations.length > this.maxItems) this.observations.shift();
  }

  addHypothesis(hypothesis: Hypothesis): void {
    this.hypotheses.push(hypothesis);
    while (this.hypotheses.length > this.maxItems) this.hypotheses.shift();
  }

  addPlan(plan: Plan): void {
    this.plans.push(plan);
    while (this.plans.length > this.maxItems) this.plans.shift();
  }

  addDecision(decision: DecisionRecord): void {
    this.decisions.push(decision);
    while (this.decisions.length > this.maxItems) this.decisions.shift();
  }

  recentObservations(limit = 12): Observation[] { return this.observations.slice(-limit); }
  activeHypotheses(): Hypothesis[] { return this.hypotheses.filter((h) => h.priorConfidence > 0); }
  pendingPlans(): Plan[] { return this.plans.filter((p) => !["COMPLETED", "FAILED"].includes(p.status)); }
  decisionHistory(limit = 16): DecisionRecord[] { return this.decisions.slice(-limit); }
}

export class InMemoryLongTermMemory {
  private readonly entries: MemoryEntry[] = [];

  write(entry: MemoryEntry): void {
    this.entries.push(entry);
  }

  search(topic: string, limit = 8): MemoryEntry[] {
    const needle = topic.toLowerCase();
    return [...this.entries]
      .filter((entry) => `${entry.topic} ${entry.text} ${entry.tags.join(" ")}`.toLowerCase().includes(needle))
      .sort((a, b) => b.weight - a.weight || b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}
