import { evaluateDecision, type DecisionEvaluationInput, type DecisionReport } from '../worldModel/decision/decisionSupport';
import {
  assessWorldCounterfactual,
  diffWorldBranches,
  type WorldCounterfactualAssessment,
  type WorldCounterfactualAssessmentInput,
  type WorldCounterfactualDiff,
} from '../worldModel/discovery/worldCounterfactual';
import { solverCapabilityFor } from '../worldModel/capability/solverCapability';
import type { BranchComparison } from '../worldModel/bridge/worldFrameState';
import {
  buildWorldEvidenceBundle,
  type WorldEvidenceBundle,
  type WorldEvidenceBundleInput,
} from '../worldModel/evidence/worldEvidenceBundle';
import { AgentToolRegistry, declareTool, type AgentTool, type ErasedAgentTool } from './agentTool';

/**
 * THE TOOLS GENESIS ACTUALLY HAS, DECLARED.
 *
 * Every entry wraps a function that already exists and is already tested. The
 * value added here is not capability — it is that a dispatcher can now see
 * what exists, what each thing needs, and how well each one is modelled,
 * without importing five subsystems and knowing their internals.
 *
 * Capabilities are READ from `solverCapabilityFor`, never written here. When
 * a scenario's capability changes in the registry, these tools change with it,
 * because a second hand-maintained copy of the same judgement would drift and
 * the drift would always favour overclaiming.
 *
 * The flood tools are declared against FLOOD deliberately: it is the scenario
 * with every organ already present (a real solver, a real cascade, a real
 * counterfactual, a real evidence path), which is why it is the first vertical
 * slice's substrate.
 */

export const WORLD_COUNTERFACTUAL_TOOL = 'world.counterfactual.assess';
export const WORLD_DIFF_TOOL = 'world.counterfactual.diff';
export const WORLD_DECISION_TOOL = 'world.decision.evaluate';
export const WORLD_EVIDENCE_TOOL = 'world.evidence.bundle';

/**
 * Diffing two branches carries the capability of the science that produced
 * them: a diff of an approximated world is an approximated diff, and saying
 * otherwise would launder the caveat away at the tool boundary.
 */
const diffTool: AgentTool<BranchComparison, WorldCounterfactualDiff> = declareTool({
  name: WORLD_DIFF_TOOL,
  domain: 'flood-hydrology',
  description: 'Turns a real branch comparison into per-scalar magnitudes across every changed entity.',
  capabilityTags: ['compare'],
  capability: solverCapabilityFor('FLOOD'),
  inputSchema: [
    { name: 'comparison', type: 'object', required: true, description: 'A real compareBranches result for the two arms.' },
  ],
  invoke: (comparison) => diffWorldBranches(comparison),
});

const assessTool: AgentTool<WorldCounterfactualAssessmentInput, WorldCounterfactualAssessment> = declareTool({
  name: WORLD_COUNTERFACTUAL_TOOL,
  domain: 'flood-hydrology',
  description: 'Judges a branch diff against a criterion declared before the run; refuses rather than guessing.',
  capabilityTags: ['compare', 'explain'],
  capability: solverCapabilityFor('FLOOD'),
  inputSchema: [
    { name: 'preregistration', type: 'object', required: true, description: 'The criterion, fingerprinted before the run.' },
    { name: 'diff', type: 'object', required: true, description: 'The branch diff to judge.' },
    { name: 'controlledDifference', type: 'object', required: true, description: 'Evidence the arms started identical.' },
    { name: 'replayVerdict', type: 'string', required: false, description: 'MATCH is required before any verdict is issued.' },
    { name: 'objectiveOverride', type: 'object', required: false, description: 'Two already-reduced arm values, when the criterion declares a reducer other than AT_HORIZON.' },
  ],
  invoke: (input) => assessWorldCounterfactual(input),
});

const decisionTool: AgentTool<DecisionEvaluationInput, DecisionReport> = declareTool({
  name: WORLD_DECISION_TOOL,
  domain: 'flood-hydrology',
  description: 'Runs one forked arm per declared option and ranks the modelled outcomes. Not a recommendation.',
  capabilityTags: ['simulate', 'decide'],
  capability: solverCapabilityFor('FLOOD'),
  inputSchema: [
    { name: 'question', type: 'object', required: true, description: 'Objective, options, decision tick, horizon, and what is not modelled.' },
    { name: 'baseline', type: 'object', required: true, description: 'The do-nothing arm, already advanced to the horizon.' },
    { name: 'registry', type: 'object', required: true, description: 'The branch registry the arms are registered in.' },
    { name: 'updater', type: 'object', required: true, description: 'The same updater the baseline ran, so arms share physics.' },
    { name: 'dt', type: 'number', required: false, description: 'Tick length, matching the baseline.' },
  ],
  invoke: (input) => evaluateDecision(input),
});

const evidenceTool: AgentTool<WorldEvidenceBundleInput, WorldEvidenceBundle> = declareTool({
  name: WORLD_EVIDENCE_TOOL,
  domain: 'flood-hydrology',
  description: 'Assembles the provenance record for a scenario. Runs nothing; every value is passed through.',
  capabilityTags: ['evidence'],
  capability: solverCapabilityFor('FLOOD'),
  inputSchema: [
    { name: 'bundleId', type: 'string', required: true, description: 'Identity of the bundle.' },
    { name: 'question', type: 'string', required: true, description: "The user's own question, verbatim." },
    { name: 'baseline', type: 'object', required: true, description: 'The baseline arm and its world state.' },
    { name: 'intervention', type: 'object', required: false, description: 'The intervention arm, when there is one.' },
    { name: 'assessment', type: 'object', required: false, description: 'A preregistered criterion verdict, when one exists.' },
    { name: 'decision', type: 'object', required: false, description: 'A decision report, when options were ranked.' },
  ],
  invoke: (input) => buildWorldEvidenceBundle(input),
});

/**
 * The declared tool set. Fixed at module load: an agent can see exactly what
 * it may invoke, and nothing can appear at runtime that no test covers.
 */
export const GENESIS_AGENT_TOOLS = new AgentToolRegistry(
  // Erased for the registry's listing role only. Invocation goes through the
  // concrete tools exported below, where the compiler still checks the input.
  [diffTool, assessTool, decisionTool, evidenceTool] as readonly unknown[] as readonly ErasedAgentTool[],
);

/** The concrete, type-safe handles. Invoke through these, discover through the registry. */
export const GENESIS_TOOLS = { diffTool, assessTool, decisionTool, evidenceTool } as const;
