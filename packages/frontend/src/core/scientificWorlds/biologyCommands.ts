import { fnv1a } from '../events/hash';
import { parseBiologyLabCommand } from './humanLab/commandRouter';
import type { BiologyLabCommand } from './humanLab/types';
import { BIOLOGY_CATALOG } from './biologyLabWorld';
import { parseWorldCommands, type CommandParameterValue, type ParsedCommands, type WorldCommand, type WorldCommandIntent } from './worldCommand';
import { explorerCommands, parseExplorerZoom } from './humanExplorer';

/**
 * SCIENTIFIC WORLDS — BIOLOGY COMMAND BRIDGE.
 *
 * The V3 pack ships its own router (`parseBiologyLabCommand`: one clause →
 * one BiologyLabCommand kind). The canonical bus speaks WorldCommand
 * (intent + station + parameters), which the action planner and the agent
 * already execute. This bridge splits a sentence into clauses, lets the
 * pack's router classify each one, maps the kind onto the canonical
 * intents and the pack's own station ids, and hands anything the router
 * does not know to the generic parser with the biology catalog ("idź do
 * konsoli neuro"). Deterministic: same text + logical time → same ids.
 */

const CLAUSES = /(?:[.;!?,]\s*|\s+(?:a potem|potem|nastepnie|a nastepnie|then|and then)\s+|\s+(?:i|and)\s+(?=(?:pokaz|pokaż|show)))/i;

const LEADING_CONNECTOR = /^(?:a potem|a nastepnie|a następnie|potem|nastepnie|następnie|and then|then|and|i|a)(?:\s+|$)/i;

/** The pack's router reads "5x"; users type "5×" — normalised here, the router is not touched. */
function routerText(clause: string): string { return clause.replace(/(\d+)\s*[×x]/gi, '$1x'); }

const HUMAN_STUDY = 'station:human-study';

type Mapped = { readonly intent: WorldCommandIntent; readonly stationId?: string; readonly parameters?: Readonly<Record<string, CommandParameterValue>> };

function mapKind(c: BiologyLabCommand): readonly Mapped[] {
  switch (c.kind) {
    case 'OPEN_TWIN': return [{ intent: 'NAVIGATE', stationId: HUMAN_STUDY }, { intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action: 'OPEN_TWIN', mode: 'NORMAL' } }];
    case 'FOCUS_ANATOMY': { const focus = c.targetId ?? 'brain'; return [{ intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action: 'FOCUS_ANATOMY', focus, mode: focus === 'brain' || focus.startsWith('hippocampus') ? 'BRAIN' : 'ORGANS' } }]; }
    case 'SET_ANATOMY_MODE': return [{ intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action: 'SET_ANATOMY_MODE', mode: String(c.parameters.mode ?? 'NORMAL') } }];
    case 'OPEN_HYPERSCOPE': return [{ intent: 'NAVIGATE', stationId: 'station:microscopy' }];
    case 'CAPTURE_HYPERSCOPE': return [{ intent: 'RUN_EXPERIMENT', stationId: 'station:microscopy', parameters: { magnification: Number(c.parameters.magnification ?? 5) } }];
    case 'OPEN_IMAGING': return [{ intent: 'RUN_EXPERIMENT', stationId: 'station:imaging', parameters: {} }];
    case 'CREATE_SLIDE': return [{ intent: 'RUN_EXPERIMENT', stationId: 'station:histology', parameters: { stage: 'slide' } }];
    case 'INSPECT_CELL': return [{ intent: 'RUN_EXPERIMENT', stationId: 'station:histology', parameters: { stage: 'cell' } }];
    case 'RUN_ORPHEUS': return [{ intent: 'RUN_EXPERIMENT', stationId: 'station:orpheus', parameters: {} }];
    case 'SHOW_EVIDENCE': return [{ intent: 'INSPECT', parameters: { provenance: true, result: true } }];
    case 'MOVE_TO_STATION': return c.targetId ? [{ intent: 'NAVIGATE', stationId: c.targetId }] : [];
    case 'SELECT_SPECIMEN': return [{ intent: 'INTERACT', stationId: 'station:orpheus', parameters: { action: 'SELECT_SPECIMEN' } }];
    default: return [];
  }
}

export function parseBiologyWorldCommands(text: string, logicalTime: number): ParsedCommands {
  const raw = text.trim();
  if (!raw) return { commands: [], unresolved: [] };
  const clauses = raw.split(CLAUSES).map((c) => c.trim().replace(LEADING_CONNECTOR, '')).filter((c) => c.length > 0);
  const commands: WorldCommand[] = [];
  const unresolved: string[] = [];
  clauses.forEach((clause, index) => {
    // Human Explorer: "przybliż do komórki serca" walks the macro → micro ladder through the canonical experiments.
    const zoom = parseExplorerZoom(clause);
    if (zoom) { commands.push(...explorerCommands(zoom.organ, zoom.level, clause, logicalTime).map((c, sub) => ({ ...c, commandId: `cmd-${fnv1a(`${raw}|${logicalTime}|${index}|${sub}|explorer`)}` }))); return; }
    const routed = parseBiologyLabCommand(routerText(clause), logicalTime);
    const mapped = routed ? mapKind(routed) : [];
    if (mapped.length) {
      mapped.forEach((m, sub) => commands.push({
        commandId: `cmd-${fnv1a(`${raw}|${logicalTime}|${index}|${sub}|bio`)}`,
        text: clause, intent: m.intent,
        ...(m.stationId ? { targetEntityId: m.stationId } : {}),
        ...(m.parameters && Object.keys(m.parameters).length ? { parameters: m.parameters } : {}),
        requestedAtLogicalTime: logicalTime,
      }));
      return;
    }
    // Not a pack command: the generic parser with the biology catalog (navigation, questions, scenarios, inspections).
    const generic = parseWorldCommands(clause, BIOLOGY_CATALOG, logicalTime);
    if (!generic.commands.length) { unresolved.push(clause); return; }
    generic.commands.forEach((g, sub) => commands.push({ ...g, commandId: `cmd-${fnv1a(`${raw}|${logicalTime}|${index}|${sub}|gen`)}` }));
  });
  return { commands, unresolved };
}
