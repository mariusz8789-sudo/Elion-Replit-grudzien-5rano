import { ResearchStateLog } from './researchState';
import { MindFailClosedError, runMindDiscovery, type MindDiscoveryResult, type RunMindDiscoveryOptions } from './mindDiscovery';
import type { ProblemRecord } from '../orchestrator/contracts';
import type { MindTerminal } from './contracts';

/**
 * THE OUTER RESEARCH LOOP (docs/DECISIONS.md D-060).
 *
 * THIS IS NOT A SECOND ORCHESTRATOR. It does not re-implement a single one of
 * `runScientificDiscovery`'s 20 stages. It sequences ROUNDS: each round calls
 * the existing pipeline exactly once and records the transition; the loop only
 * decides whether another round is scientifically justified.
 *
 * TERMINAL STATES: `WINNER` | `NO_WINNER` | `SCIENTIFIC_STOP` | `EXECUTION_BLOCKED`.
 * A WINNER is never forced — it is reported only when the existing D-057
 * Winner Promotion Gate inside the orchestrator produced one. Running out of
 * rounds is `SCIENTIFIC_STOP`, not a verdict about the science.
 */

export interface RunResearchOptions {
  readonly problem: ProblemRecord;
  readonly maxRounds: number;
  /** Provenance only (D-040 clock rule). */
  readonly now: () => string;
  readonly makeRoundOptions: (round: number, log: ResearchStateLog) => RunMindDiscoveryOptions;
  /** The caller's own next-experiment decision, normally delegating to `agent/nextAction.ts`. */
  readonly shouldContinue: (result: MindDiscoveryResult, round: number) => { readonly continue: boolean; readonly reason: string };
}

export interface RunResearchResult {
  readonly rounds: readonly MindDiscoveryResult[];
  readonly terminal: MindTerminal;
  readonly stopReason: string;
  readonly stateHead: string;
  readonly chainVerified: boolean;
}

export async function runResearch(options: RunResearchOptions): Promise<RunResearchResult> {
  const log = new ResearchStateLog();
  await log.append('PROBLEM_FORMALIZED', options.now(), { problemId: options.problem.problemId, problemFingerprint: options.problem.fingerprint });

  const rounds: MindDiscoveryResult[] = [];
  let terminal: MindTerminal = 'SCIENTIFIC_STOP';
  let stopReason = `round budget of ${options.maxRounds} exhausted without a terminal verdict`;

  for (let round = 0; round < options.maxRounds; round += 1) {
    const result = await runMindDiscovery(options.makeRoundOptions(round, log));
    rounds.push(result);
    await log.append('EXPERIMENT_HANDOFF', options.now(), {
      round,
      kind: result.kind,
      verdict: result.kind === 'RUN' ? result.verdict : `BLOCKED:${result.code}`,
    });

    if (result.kind === 'EXECUTION_BLOCKED') {
      terminal = 'EXECUTION_BLOCKED';
      stopReason = result.code;
      break;
    }
    if (result.verdict === 'WINNER') {
      terminal = 'WINNER';
      stopReason = 'a WINNER was promoted by the existing D-057 Winner Promotion Gate — never forced by this loop';
      break;
    }

    const decision = options.shouldContinue(result, round);
    await log.append('NEXT_EXPERIMENT', options.now(), { round, continue: decision.continue, reason: decision.reason });
    if (!decision.continue) {
      terminal = 'NO_WINNER';
      stopReason = decision.reason;
      break;
    }
  }

  await log.append('TERMINAL', options.now(), { terminal, stopReason });
  const chainVerified = await log.verifyChain();
  if (!chainVerified) {
    throw new MindFailClosedError('research state hash-chain failed verification — the transition log was altered', 'CORRUPTED_RESEARCH_STATE');
  }

  return Object.freeze({ rounds, terminal, stopReason, stateHead: log.headFingerprint(), chainVerified });
}
