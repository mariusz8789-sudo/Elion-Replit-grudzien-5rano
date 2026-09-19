import { fnv1a } from '../events/hash';

/**
 * SCIENTIFIC WORLDS — THE TYPED COMMAND (chat → world).
 *
 * The one boundary between free text and the world. A sentence the user
 * types becomes zero or more `WorldCommand`s through a DETERMINISTIC
 * rule-based classifier (no network, no randomness); an LLM may later
 * propose the same shape, but nothing reaches the world without passing
 * `validateWorldCommand` against the world's own catalog of stations and
 * allowed intents. Free text never mutates the world: only a validated
 * command does, and only through the action planner.
 *
 * Polish and English verbs are recognised. Matching is accent-insensitive
 * so "idz" and "idź" are the same word.
 */

export type WorldCommandIntent = 'NAVIGATE' | 'INTERACT' | 'RUN_EXPERIMENT' | 'ASK' | 'SCENARIO' | 'INSPECT';

export type CommandParameterValue = string | number | boolean;

export interface WorldCommand {
  readonly commandId: string;
  readonly text: string;
  readonly intent: WorldCommandIntent;
  readonly targetEntityId?: string;
  readonly parameters?: Readonly<Record<string, CommandParameterValue>>;
  readonly requestedAtLogicalTime: number;
}

/** A station the world exposes to commands: what the user may call it, and what it runs. */
export interface StationDescriptor {
  readonly id: string;
  readonly label: string;
  readonly keywords: readonly string[];
  readonly experimentId?: string;
}

export interface CommandCatalog {
  readonly worldId: string;
  readonly stations: readonly StationDescriptor[];
  readonly allowedIntents: readonly WorldCommandIntent[];
}

export interface ParsedCommands {
  readonly commands: readonly WorldCommand[];
  /** Clauses that produced no command, kept so the UI can say what was not understood. */
  readonly unresolved: readonly string[];
}

export type CommandValidation = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const INTENTS: readonly WorldCommandIntent[] = ['NAVIGATE', 'INTERACT', 'RUN_EXPERIMENT', 'ASK', 'SCENARIO', 'INSPECT'];

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim();
}

const VERBS: Readonly<Record<Exclude<WorldCommandIntent, 'ASK'>, readonly string[]>> = {
  NAVIGATE: ['idz do', 'idz na', 'podejdz', 'przejdz', 'udaj sie', 'go to', 'walk to', 'move to', 'head to', 'wroc do', 'return to'],
  RUN_EXPERIMENT: ['uruchom', 'odpal', 'wykonaj', 'przeprowadz', 'zasymuluj', 'symuluj', 'zsyntetyzuj', 'syntetyzuj', 'zderz', 'run ', 'start ', 'execute', 'simulate', 'synthesize', 'collide', 'zmieszaj', 'mix '],
  INTERACT: ['nacisnij', 'uzyj', 'wlacz', 'otworz', 'dotknij', 'interact', 'press', 'use the', 'switch on', 'open'],
  INSPECT: ['pokaz', 'zobacz', 'sprawdz', 'co otrzymal', 'skad to', 'skad pochodzi', 'inspect', 'show me', 'show ', 'what did you get', 'where does it come', 'wyjasnij', 'explain'],
  SCENARIO: ['co jesli', 'co sie stanie', 'co by bylo', 'gdyby', 'what if', 'what happens if', 'scenariusz', 'scenario', 'kontrfakt', 'counterfactual'],
};

const CLAUSE_SPLIT = /(?:[.;!?]\s*|\s+(?:potem|nastepnie|a nastepnie|a potem|then|and then|oraz potem)\s+)/;

const COMPOSITIONS: readonly string[] = ['NaCl', 'SrTiO3', 'MgO', 'Cu', 'Fe'];

/**
 * Every intent a clause carries, in execution order: "idź do X i uruchom Y"
 * is a walk AND a run; "uruchom i pokaż wynik" is a run AND a report. A
 * scenario clause is only a scenario. A bare question is an ASK.
 */
function findIntents(clause: string): readonly WorldCommandIntent[] {
  const has = (intent: Exclude<WorldCommandIntent, 'ASK'>): boolean => VERBS[intent].some((v) => clause.includes(v));
  if (has('SCENARIO')) return ['SCENARIO'];
  const out: WorldCommandIntent[] = [];
  if (has('NAVIGATE')) out.push('NAVIGATE');
  if (has('RUN_EXPERIMENT')) out.push('RUN_EXPERIMENT');
  else if (has('INTERACT')) out.push('INTERACT');
  if (has('INSPECT')) out.push('INSPECT');
  if (out.length) return out;
  if (/\?$/.test(clause) || /^(dlaczego|jak|ile|czy|kiedy|gdzie|why|how|is |are |what|when|where)/.test(clause)) return ['ASK'];
  return [];
}

function findStation(clause: string, catalog: CommandCatalog): StationDescriptor | null {
  let best: StationDescriptor | null = null;
  let bestLen = 0;
  for (const station of catalog.stations) {
    for (const keyword of station.keywords) {
      const k = normalizeText(keyword);
      if (k.length > bestLen && clause.includes(k)) { best = station; bestLen = k.length; }
    }
  }
  return best;
}

function extractParameters(original: string, clause: string, intent: WorldCommandIntent): Record<string, CommandParameterValue> {
  const p: Record<string, CommandParameterValue> = {};
  for (const c of COMPOSITIONS) { if (new RegExp(`\\b${c}\\b`, 'i').test(original)) { p.composition = c; break; } }
  const tev = clause.match(/(\d+(?:[.,]\d+)?)\s*tev/);
  if (tev) p.sqrtSGeV = Math.round(Number(tev[1].replace(',', '.')) * 1000);
  const add = clause.match(/(?:prog\w*|threshold)\s*(?:add)?\s*(\d+(?:[.,]\d+)?)/);
  if (add) p.addThresholdTeV = Number(add[1].replace(',', '.'));
  const seed = clause.match(/(?:seed|ziarno)\s*(\d+)/);
  if (seed) p.seed = Number(seed[1]);
  const dna = original.match(/\b([ACGT]{9,})\b/);
  if (dna) p.dna = dna[1];
  if (intent === 'SCENARIO') {
    if (/dwukrotnie|podwojn|twice|double|2x|x2/.test(clause)) p.transmissionMultiplier = 2;
    else if (/trzykrotnie|triple|3x/.test(clause)) p.transmissionMultiplier = 3;
    else if (/o polowe mniejsz|halve|half/.test(clause)) p.transmissionMultiplier = 0.5;
    const pct = clause.match(/(\d+)\s*%/);
    if (pct && /szpital|hospital|przepustow|capacity|lozek|beds/.test(clause)) {
      const frac = Number(pct[1]) / 100;
      p.hospitalCapacityMultiplier = /trac|los|spad|reduc|less|mniej/.test(clause) ? +(1 - frac).toFixed(4) : +(1 + frac).toFixed(4);
    }
  }
  if (intent === 'INSPECT') {
    if (/skad|pochodz|zrodl|source|where does|provenance|dowod|evidence/.test(clause)) p.provenance = true;
    if (/wynik|otrzymal|result|what did/.test(clause)) p.result = true;
  }
  return p;
}

/**
 * Deterministic parse: same text and logical time give the same commands
 * (ids included). Clauses are split on sentence ends and sequencing words
 * ("potem", "then"); each clause yields at most one command.
 */
export function parseWorldCommands(text: string, catalog: CommandCatalog, logicalTime: number): ParsedCommands {
  const raw = text.trim();
  if (!raw) return { commands: [], unresolved: [] };
  const originalClauses = raw.split(CLAUSE_SPLIT).map((c) => c.trim()).filter((c) => c.length > 0);
  const commands: WorldCommand[] = [];
  const unresolved: string[] = [];
  let lastStation: StationDescriptor | null = null;
  originalClauses.forEach((original, index) => {
    const clause = normalizeText(original);
    const intents = findIntents(clause);
    if (intents.length === 0) { unresolved.push(original); return; }
    const station = findStation(clause, catalog);
    if (station) lastStation = station;
    intents.forEach((intent, sub) => {
      // A run or interaction without its own station name applies to the station named just before ("idź do X i uruchom").
      const target = station ?? ((intent === 'RUN_EXPERIMENT' || intent === 'INTERACT') ? lastStation : null);
      const parameters = extractParameters(original, clause, intent);
      const command: WorldCommand = {
        commandId: `cmd-${fnv1a(`${raw}|${logicalTime}|${index}|${sub}`)}`,
        text: original,
        intent,
        ...(target ? { targetEntityId: target.id } : {}),
        ...(Object.keys(parameters).length ? { parameters } : {}),
        requestedAtLogicalTime: logicalTime,
      };
      commands.push(command);
    });
  });
  return { commands, unresolved };
}

const PRIMITIVE = (v: unknown): v is CommandParameterValue => typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

/** Schema + permission validation. Nothing executes without `ok: true`. */
export function validateWorldCommand(command: WorldCommand, catalog: CommandCatalog): CommandValidation {
  if (typeof command.commandId !== 'string' || !/^cmd-[0-9a-f]{8}$/.test(command.commandId)) return { ok: false, reason: 'commandId must be cmd-<fnv1a>' };
  if (typeof command.text !== 'string' || command.text.trim().length === 0) return { ok: false, reason: 'text is required' };
  if (!INTENTS.includes(command.intent)) return { ok: false, reason: `unknown intent ${String(command.intent)}` };
  if (!catalog.allowedIntents.includes(command.intent)) return { ok: false, reason: `intent ${command.intent} is not allowed in world ${catalog.worldId}` };
  if (!Number.isFinite(command.requestedAtLogicalTime) || command.requestedAtLogicalTime < 0) return { ok: false, reason: 'requestedAtLogicalTime must be a non-negative number' };
  const needsTarget = command.intent === 'NAVIGATE' || command.intent === 'INTERACT' || command.intent === 'RUN_EXPERIMENT';
  if (needsTarget) {
    if (!command.targetEntityId) return { ok: false, reason: `${command.intent} needs a station; none of [${catalog.stations.map((s) => s.label).join(', ')}] was named` };
    const station = catalog.stations.find((s) => s.id === command.targetEntityId);
    if (!station) return { ok: false, reason: `unknown station ${command.targetEntityId}` };
    if (command.intent === 'RUN_EXPERIMENT' && !station.experimentId) return { ok: false, reason: `station ${station.label} runs no experiment` };
  }
  if (command.parameters) {
    for (const [k, v] of Object.entries(command.parameters)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)) return { ok: false, reason: `parameter name ${k} is not an identifier` };
      if (!PRIMITIVE(v)) return { ok: false, reason: `parameter ${k} must be a finite number, string or boolean` };
    }
  }
  return { ok: true };
}

/** Runtime guard for commands that arrive from outside (an LLM tool call, a URL, a saved plan). */
export function isWorldCommandShape(value: unknown): value is WorldCommand {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.commandId === 'string' && typeof v.text === 'string' && INTENTS.includes(v.intent as WorldCommandIntent)
    && typeof v.requestedAtLogicalTime === 'number'
    && (v.targetEntityId === undefined || typeof v.targetEntityId === 'string')
    && (v.parameters === undefined || (typeof v.parameters === 'object' && v.parameters !== null && Object.values(v.parameters as Record<string, unknown>).every(PRIMITIVE)));
}
