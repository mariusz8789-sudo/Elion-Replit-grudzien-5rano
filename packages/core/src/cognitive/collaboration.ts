import { Hypothesis, Observation } from './types.js';

export interface ResearcherPresence {
  id: string;
  displayName: string;
  role: "RESEARCHER" | "REVIEWER" | "OBSERVER" | "AGENT";
  connectedAt: number;
}

export interface SharedResearchSession {
  id: string;
  title: string;
  participants: ResearcherPresence[];
  observations: Observation[];
  hypotheses: Hypothesis[];
  sharedNotes: string[];
}

export class CollaborationEngine {
  constructor(private readonly session: SharedResearchSession) {}

  join(participant: ResearcherPresence): void {
    if (!this.session.participants.some((item) => item.id === participant.id)) this.session.participants.push(participant);
  }

  publishObservation(observation: Observation): void { this.session.observations.push(observation); }
  publishHypothesis(hypothesis: Hypothesis): void { this.session.hypotheses.push(hypothesis); }
  addNote(note: string): void { if (note.trim()) this.session.sharedNotes.push(note.trim()); }
  snapshot(): SharedResearchSession { return structuredClone(this.session); }
}
