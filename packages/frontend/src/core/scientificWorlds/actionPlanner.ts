import { fnv1a } from '../events/hash';
import type { CommandCatalog, WorldCommand } from './worldCommand';
import { validateWorldCommand } from './worldCommand';

/**
 * SCIENTIFIC WORLDS — FROM COMMANDS TO AN ACTION PLAN.
 *
 * A validated command becomes a list of concrete steps the character
 * controller executes in order. "Run the NaCl trial at the synthesizer"
 * expands to walk → align → reach → interact → execute → observe → report,
 * so the user sees the body do the work, and the experiment is executed
 * exactly once, by the EXECUTE step, inside an ExperimentSession. ASK and
 * SCENARIO are not the agent's job: they are deferred to the knowledge and
 * scenario subsystems and reported as such.
 */

export type ActionStep =
  | { readonly kind: 'NAVIGATE'; readonly stationId: string }
  | { readonly kind: 'ALIGN'; readonly stationId: string }
  | { readonly kind: 'REACH'; readonly stationId: string }
  | { readonly kind: 'INTERACT'; readonly stationId: string; readonly parameters?: Readonly<Record<string, string | number | boolean>> }
  | { readonly kind: 'EXECUTE'; readonly stationId: string; readonly experimentId: string; readonly inputs: Readonly<Record<string, string | number | boolean>> }
  | { readonly kind: 'OBSERVE'; readonly stationId: string }
  | { readonly kind: 'REPORT'; readonly includeProvenance: boolean; readonly includeResult: boolean }
  | { readonly kind: 'DEFER'; readonly intent: 'ASK' | 'SCENARIO'; readonly text: string; readonly parameters: Readonly<Record<string, string | number | boolean>> };

export interface ActionPlan {
  readonly planId: string;
  readonly worldId: string;
  readonly commandIds: readonly string[];
  readonly steps: readonly ActionStep[];
  readonly rejected: readonly { readonly commandId: string; readonly reason: string }[];
}

export function planActions(commands: readonly WorldCommand[], catalog: CommandCatalog, currentStationId: string | null): ActionPlan {
  const steps: ActionStep[] = [];
  const rejected: { commandId: string; reason: string }[] = [];
  const accepted: string[] = [];
  let at = currentStationId;
  for (const command of commands) {
    const v = validateWorldCommand(command, catalog);
    if (!v.ok) { rejected.push({ commandId: command.commandId, reason: v.reason }); continue; }
    accepted.push(command.commandId);
    const station = command.targetEntityId ? catalog.stations.find((s) => s.id === command.targetEntityId) ?? null : null;
    switch (command.intent) {
      case 'NAVIGATE':
        if (station && at !== station.id) { steps.push({ kind: 'NAVIGATE', stationId: station.id }); at = station.id; }
        break;
      case 'INTERACT':
        if (!station) break;
        if (at !== station.id) { steps.push({ kind: 'NAVIGATE', stationId: station.id }); at = station.id; }
        steps.push({ kind: 'ALIGN', stationId: station.id }, { kind: 'REACH', stationId: station.id }, { kind: 'INTERACT', stationId: station.id, ...(command.parameters ? { parameters: command.parameters } : {}) });
        break;
      case 'RUN_EXPERIMENT': {
        if (!station) break;
        // Biomedical Intervention Bay integration: an explicit `parameters.experimentId` selects
        // among a multi-experiment station's own `experimentIds`; every other, single-experiment
        // station falls back to its own default, byte-identical to before this case existed.
        const requestedExperimentId = typeof command.parameters?.experimentId === 'string'
          ? command.parameters.experimentId
          : station.experimentId;
        if (!requestedExperimentId) break;
        if (station.experimentIds && !station.experimentIds.includes(requestedExperimentId)) break;
        if (at !== station.id) { steps.push({ kind: 'NAVIGATE', stationId: station.id }); at = station.id; }
        steps.push(
          { kind: 'ALIGN', stationId: station.id },
          { kind: 'REACH', stationId: station.id },
          { kind: 'INTERACT', stationId: station.id },
          { kind: 'EXECUTE', stationId: station.id, experimentId: requestedExperimentId, inputs: command.parameters ?? {} },
          { kind: 'OBSERVE', stationId: station.id },
        );
        break;
      }
      case 'INSPECT':
        steps.push({ kind: 'REPORT', includeProvenance: command.parameters?.provenance === true, includeResult: command.parameters?.result !== false });
        break;
      case 'ASK':
      case 'SCENARIO':
        steps.push({ kind: 'DEFER', intent: command.intent, text: command.text, parameters: command.parameters ?? {} });
        break;
    }
  }
  // An executed experiment is always reported, even if the user did not ask for the report explicitly.
  if (steps.some((s) => s.kind === 'EXECUTE') && !steps.some((s) => s.kind === 'REPORT')) steps.push({ kind: 'REPORT', includeProvenance: true, includeResult: true });
  const planId = `plan-${fnv1a(`${catalog.worldId}|${accepted.join(',')}|${steps.map((s) => s.kind).join('>')}`)}`;
  return { planId, worldId: catalog.worldId, commandIds: accepted, steps, rejected };
}
