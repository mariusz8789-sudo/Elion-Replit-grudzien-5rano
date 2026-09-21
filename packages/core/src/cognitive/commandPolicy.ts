import { CommandEnvelope } from './types.js';

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
}

export class CommandPolicy {
  evaluate(command: CommandEnvelope): PolicyDecision {
    if (command.safetyClass === "IRREVERSIBLE" || command.safetyClass === "BIOLOGICAL") {
      if (!command.requiresApproval) return { allowed: false, reason: "High-impact command requires explicit human approval." };
    }
    if (!command.type.trim()) return { allowed: false, reason: "Command type is required." };
    return { allowed: true, reason: "Command passed cognitive-core policy checks." };
  }
}
