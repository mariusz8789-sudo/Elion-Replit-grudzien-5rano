import type { CommandParameterValue, CommandResolver, CommandResolverContext, ResolvedWorldCommand, WorldCommandIntent } from './worldCommand';
import { normalizeText } from './worldCommand';
import { parseBiologyLabCommand } from './humanLab/commandRouter';
import type { BiologyLabCommand } from './humanLab/types';
import { explorerCommands, parseExplorerZoom } from './humanExplorer';

/**
 * D-136 — CANONICAL BIOLOGY COMMAND RESOLVER.
 *
 * The single resolver `BIOLOGY_CATALOG.resolvers` registers with the canonical `parseWorldCommands`
 * (see `worldCommand.ts`'s `CommandResolver` hook). This is the WHOLE of what used to live directly
 * in `biologyCommands.ts` as a second, standalone classification pass (the V3 pack's own
 * `parseBiologyLabCommand` mapped through `mapKind`, plus the Human Explorer zoom check) — moved
 * behind the canonical resolver boundary VERBATIM, not rewritten, so every phrase the pack already
 * understood keeps resolving exactly as it did before. `humanLab/commandRouter.ts` itself is
 * untouched and still does the actual classification; this only maps its result onto canonical
 * intents, exactly like `mapKind` always did.
 *
 * Layered on top, tried only once the legacy router finds nothing: the organs (heart, liver, kidney,
 * stomach, pancreas, small intestine, lung) and display modes (vascular/nervous/organs/tissue/
 * cellular) the legacy router never reached by free text at all — real, additive coverage, never a
 * narrower reimplementation of what already worked.
 */

const HUMAN_STUDY = 'station:human-study';
const MICROSCOPY = 'station:microscopy';
const HISTOLOGY = 'station:histology';
const IMAGING = 'station:imaging';
const ORPHEUS = 'station:orpheus';

type Mapped = { readonly intent: WorldCommandIntent; readonly stationId?: string; readonly parameters?: Readonly<Record<string, CommandParameterValue>> };

/** Verbatim port of `biologyCommands.ts`'s own `mapKind` — the legacy V3 command kind -> canonical
 * WorldCommand intent/station/parameters mapping. Not duplicated logic: this IS that logic, just
 * reached through the resolver hook instead of a bespoke pre-pass. */
function mapKind(c: BiologyLabCommand): readonly Mapped[] {
  switch (c.kind) {
    case 'OPEN_TWIN': return [{ intent: 'NAVIGATE', stationId: HUMAN_STUDY }, { intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action: 'OPEN_TWIN', mode: 'NORMAL' } }];
    case 'FOCUS_ANATOMY': { const focus = c.targetId ?? 'brain'; return [{ intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action: 'FOCUS_ANATOMY', focus, mode: focus === 'brain' || focus.startsWith('hippocampus') ? 'BRAIN' : 'ORGANS' } }]; }
    case 'SET_ANATOMY_MODE': return [{ intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action: 'SET_ANATOMY_MODE', mode: String(c.parameters.mode ?? 'NORMAL') } }];
    case 'OPEN_HYPERSCOPE': return [{ intent: 'NAVIGATE', stationId: MICROSCOPY }];
    case 'CAPTURE_HYPERSCOPE': return [{ intent: 'RUN_EXPERIMENT', stationId: MICROSCOPY, parameters: { magnification: Number(c.parameters.magnification ?? 5) } }];
    case 'OPEN_IMAGING': return [{ intent: 'RUN_EXPERIMENT', stationId: IMAGING, parameters: {} }];
    case 'CREATE_SLIDE': return [{ intent: 'RUN_EXPERIMENT', stationId: HISTOLOGY, parameters: { stage: 'slide' } }];
    case 'INSPECT_CELL': return [{ intent: 'RUN_EXPERIMENT', stationId: HISTOLOGY, parameters: { stage: 'cell' } }];
    case 'RUN_ORPHEUS': return [{ intent: 'RUN_EXPERIMENT', stationId: ORPHEUS, parameters: {} }];
    case 'SHOW_EVIDENCE': return [{ intent: 'INSPECT', parameters: { provenance: true, result: true } }];
    case 'MOVE_TO_STATION': return c.targetId ? [{ intent: 'NAVIGATE', stationId: c.targetId }] : [];
    case 'SELECT_SPECIMEN': return [{ intent: 'INTERACT', stationId: ORPHEUS, parameters: { action: 'SELECT_SPECIMEN' } }];
    default: return [];
  }
}

/** The pack's router reads "5x"; users type "5×" — normalised here, the router is not touched. */
function routerText(clause: string): string { return clause.replace(/(\d+)\s*[×x]/gi, '$1x'); }

function toResolved(clauseText: string, mapped: readonly Mapped[]): readonly ResolvedWorldCommand[] {
  return mapped.map((m) => ({
    text: clauseText,
    intent: m.intent,
    ...(m.stationId ? { targetEntityId: m.stationId } : {}),
    ...(m.parameters && Object.keys(m.parameters).length ? { parameters: m.parameters } : {}),
  }));
}

/** D-136 extension: organs the legacy V3 router never covered by free text (only brain/hippocampus
 * were reachable before this). */
const EXTRA_ORGAN_KEYWORDS: readonly [string, string][] = [
  ['serc', 'heart'], ['watrob', 'liver'], ['nerk', 'left-kidney'],
  ['zolad', 'stomach'], ['trzust', 'pancreas'], ['jelit', 'small-intestine'], ['pluc', 'left-lung'],
];

/** D-136 extension: display modes beyond XRAY (the only one the legacy router reached by text).
 * Matched as normalized substrings (like `EXTRA_ORGAN_KEYWORDS`) rather than `\b...\b` regexes,
 * since Polish inflected endings (e.g. "naczyni**a**") sit right where the trailing `\b` would be,
 * and the raw clause text still carries diacritics that these ASCII patterns would never match. */
const EXTRA_DISPLAY_MODES: readonly [string, string][] = [
  ['naczyni', 'VASCULAR'], ['vascular', 'VASCULAR'], ['vessels', 'VASCULAR'],
  ['nerwow', 'NERVOUS'], ['nervous', 'NERVOUS'], ['nerwy', 'NERVOUS'], ['nerves', 'NERVOUS'],
  ['chlonn', 'LYMPHATIC'], ['limfatyczn', 'LYMPHATIC'], ['lymphatic', 'LYMPHATIC'], ['lymph', 'LYMPHATIC'],
  ['narzadow', 'ORGANS'], ['organs', 'ORGANS'],
  ['tkank', 'TISSUE'], ['tissue', 'TISSUE'],
  ['komork', 'CELLULAR'], ['cellular', 'CELLULAR'],
];

function hasAny(s: string, patterns: readonly RegExp[]): boolean { return patterns.some((p) => p.test(s)); }

export const BIOLOGY_COMMAND_RESOLVER: CommandResolver = {
  id: 'GENESIS_BIOLOGY_CANONICAL_V1',
  resolve(ctx: CommandResolverContext): readonly ResolvedWorldCommand[] | null {
    // Human Explorer: "przybliż do komórki serca" walks the macro -> micro ladder through the
    // canonical experiments — the SAME precedence `biologyCommands.ts` always gave it (checked first).
    const zoom = parseExplorerZoom(ctx.clauseText);
    if (zoom) {
      const commands = explorerCommands(zoom.organ, zoom.level, ctx.clauseText, ctx.logicalTime);
      return commands.map(({ commandId: _commandId, requestedAtLogicalTime: _t, ...rest }) => rest);
    }

    // The V3 pack's own router, unmodified, mapped onto canonical intents — exactly what
    // `biologyCommands.ts` always did before falling back to the generic parser.
    const routed = parseBiologyLabCommand(routerText(ctx.clauseText), ctx.logicalTime);
    if (routed) {
      const mapped = mapKind(routed);
      if (mapped.length) return toResolved(ctx.clauseText, mapped);
    }

    // D-136: real, additive coverage the legacy router never reached by free text.
    const n = normalizeText(ctx.clauseText);
    const organ = EXTRA_ORGAN_KEYWORDS.find(([keyword]) => n.includes(keyword));
    if (organ && hasAny(n, [/pokaz/, /show/, /select/, /wybierz/, /focus/, /skup/, /izoluj/, /isolate/])) {
      const [, nodeId] = organ;
      const action = /izoluj|isolate/.test(n) ? 'ISOLATE_NODE' : 'FOCUS_ANATOMY';
      return toResolved(ctx.clauseText, [{ intent: 'NAVIGATE', stationId: HUMAN_STUDY }, { intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action, focus: nodeId, mode: 'ORGANS' } }]);
    }
    // Requires the same "show/switch to" verb guard as the organ keywords above: a bare keyword match
    // (e.g. "nerwow" inside "symulacja sygnalow nerwowych", a RUN_EXPERIMENT request, not a display-mode
    // request) must never hijack an unrelated clause just because the anatomical word root appears in it.
    if (hasAny(n, [/pokaz/, /show/, /tryb/, /widok/, /switch/, /wlacz/, /view/])) {
      for (const [keyword, mode] of EXTRA_DISPLAY_MODES) {
        if (n.includes(keyword)) return toResolved(ctx.clauseText, [{ intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action: 'SET_ANATOMY_MODE', mode } }]);
      }
    }
    if (hasAny(n, [/przekroj/, /cutaway/, /sekcj/, /dissect/])) return toResolved(ctx.clauseText, [{ intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action: 'SET_CUTAWAY', enabled: true } }]);
    if (hasAny(n, [/poka.*wszystko/, /clear isolation/, /odizoluj/, /przywroc.*widok/])) return toResolved(ctx.clauseText, [{ intent: 'INTERACT', stationId: HUMAN_STUDY, parameters: { action: 'CLEAR_ISOLATION' } }]);

    return null;
  },
};
