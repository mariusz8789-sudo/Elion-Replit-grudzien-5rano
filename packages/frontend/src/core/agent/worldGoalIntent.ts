import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
  buildGenesisScientificCity3,
} from '../worldModel/domains/genesisScientificCity3';
import type { DiscoveryLoopInput, MechanisticHypothesis } from './discoveryLoop';

/**
 * A GOAL SENTENCE, TURNED INTO A RUNNABLE SEARCH — WITHOUT INVENTING PHYSICS.
 *
 * The discovery loop needed a programmer to hand-write its hypotheses, which
 * meant the one thing Genesis could newly do was unreachable from a sentence.
 * This is that front door, built the same way `discovery/discoveryGoalIntent.ts`
 * builds the chemistry one: deterministic patterns, both languages, and an
 * explicit `unresolved` list rather than a guess.
 *
 * ## The constraint that shapes everything here
 *
 * A hypothesis in this loop is not a claim, it is a claim WITH A MECHANISM —
 * a real mutation applied to a real world graph. No parser can conjure that
 * from prose. So a sentence never creates a mechanism: it SELECTS from levers
 * the world genuinely has, declared in a catalogue alongside the world itself.
 * A goal naming something the world does not model resolves to nothing and is
 * reported as unresolved, which is the honest answer and also the useful one —
 * it names the missing lever instead of quietly searching a smaller space.
 *
 * ## No language model
 *
 * Same discipline as the chemistry parser: regexes over a declared vocabulary,
 * deterministic and inspectable. A sentence it cannot read is reported as
 * unread, never approximated.
 */

export const WORLD_GOAL_INTENT_CONTRACT_VERSION = '1.0.0';

/** What a goal sentence can fail to supply. Named, so the caller knows what to ask for. */
export type WorldGoalUnresolved = 'OBJECTIVE_METRIC' | 'DIRECTION' | 'NAMED_LEVER_NOT_IN_WORLD';

export interface WorldGoalIntent {
  readonly contractVersion: string;
  readonly sourceText: string;
  /** The scalar the search optimises, when the sentence named one this world computes. */
  readonly objectiveMetric: string | null;
  readonly direction: 'minimize' | 'maximize' | null;
  /** Lever ids the sentence explicitly asked about. Empty means "search every declared lever". */
  readonly requestedLeverIds: readonly string[];
  /** Lever phrases the sentence used that this world has no mechanism for. */
  readonly unknownLeverPhrases: readonly string[];
  readonly maxRounds: number | null;
  readonly unresolved: readonly WorldGoalUnresolved[];
}

/**
 * A lever the world really has: a declared mechanism plus the words a person
 * might use for it. Declared next to the world, because only the world knows
 * what it can actually do.
 */
export interface WorldLever {
  readonly leverId: string;
  readonly hypothesis: (metric: string, direction: 'minimize' | 'maximize') => MechanisticHypothesis;
  /** Lower-case phrases, both languages, that name this lever. */
  readonly phrases: readonly string[];
  /**
   * LIVING WORLD — the entity this lever's `apply` actually MUTATES, as real data rather than
   * something a caller has to read out of the `apply` closure's source. Distinct from
   * `MechanisticHypothesis.entityId` (the entity the CRITERION's metric is read from — for every
   * lever in this catalog today, the floodplain, even for the pump lever, since peak flood depth is
   * a floodplain scalar): a spatial "walk up to entity X, what can I do here" system needs the
   * mutation target, not the metric source, and until this field existed that information only
   * existed as unintrospectable code inside each lever's own `apply` function.
   */
  readonly targetEntityId: string;
}

export interface WorldLeverCatalog {
  /**
   * Stable, serialisable identity for this catalog. `buildWorld` is a function
   * and cannot survive a round-trip through storage, so anything that needs to
   * REBUILD this catalog later (memory replay, chiefly) stores this id and
   * looks the catalog back up via `resolveWorldLeverCatalog` rather than trying
   * to serialise the catalog itself.
   */
  readonly catalogId: string;
  readonly worldId: string;
  readonly domainId: string;
  readonly buildWorld: () => { graph: WorldGraph; updater: ReturnType<typeof buildGenesisScientificCity3>['updater'] };
  /** Metrics this world computes, keyed by the phrases a person uses for them. */
  readonly metricPhrases: Readonly<Record<string, string>>;
  readonly entityIdForMetric: Readonly<Record<string, string>>;
  readonly levers: readonly WorldLever[];
  readonly decisionAtTick: number;
  readonly horizonTick: number;
  readonly dt: number;
  readonly declaredAssumptions: readonly string[];
  readonly notModelledFactors: readonly string[];
}

// ---------------------------------------------------------------------------
// Parsing.
// ---------------------------------------------------------------------------

const MINIMIZE = /\b(?:minimi[sz]e|reduce|lower|cut|decrease|zmniejsz|obniż|obniz|ogranicz|zredukuj)\b/i;
const MAXIMIZE = /\b(?:maximi[sz]e|increase|raise|zwiększ|zwieksz|podnieś|podnies)\b/i;
const MAX_ROUNDS = /\b(?:up to|max(?:imum)?|at most)\s*(\d+)\s*(?:rounds?|experiments?)\b|\b(?:do|maksymalnie)\s*(\d+)\s*(?:rund|eksperyment)/i;

/**
 * Phrases that look like a lever being named. Used only to detect that the
 * sentence asked about something specific — the phrase is then matched against
 * the catalogue, and reported unresolved when the world has no such mechanism.
 */
const LEVER_CANDIDATE = /\b(?:by|via|using|through|przez|za pomocą|za pomoca)\s+([a-ząćęłńóśźż\s-]{3,40})/gi;

/**
 * Phrases that ask for EVERY declared lever rather than naming one.
 *
 * "using the available interventions" is a quantifier over the catalogue, not a
 * mechanism, and reporting it as an unmodelled mechanism would invent a gap the
 * sentence never claimed — the sentence is in fact asking for exactly what the
 * world does declare.
 */
const ALL_LEVERS_PHRASES: readonly string[] = [
  'available intervention',
  'available action',
  'available option',
  'available lever',
  'all interventions',
  'all actions',
  'every intervention',
  'any intervention',
  'dostępnych interwencji',
  'dostepnych interwencji',
  'dostępne interwencje',
  'dostepne interwencje',
  'wszystkich interwencji',
  'wszystkie interwencje',
];

/**
 * Removes catalogue quantifiers from the text before lever scanning.
 *
 * Stripping rather than skipping the match: one regex match can span a
 * quantifier AND a real named mechanism ("using the available interventions or
 * by relocating residents"), so discarding the whole match would swallow the
 * genuine gap. Same approach as the budget clause above, for the same reason.
 */
function stripCatalogueQuantifiers(text: string): string {
  let stripped = text;
  for (const generic of ALL_LEVERS_PHRASES) {
    // Optional trailing plural: the list is written in the singular, and leaving
    // the "s" behind turns "the available interventions" into the fragment "the s",
    // which would then be reported as an unmodelled mechanism.
    stripped = stripped.replace(new RegExp(`${generic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?`, 'gi'), ' ');
  }
  return stripped;
}

/**
 * A captured phrase only names a mechanism if it carries a real word. Articles
 * and stripping residue ("the s") are not mechanisms, and reporting them as
 * unmodelled would manufacture gaps out of grammar.
 */
const MEANINGFUL_TOKEN = /[a-ząćęłńóśźż]{4,}/i;

export function parseWorldDiscoveryGoal(sourceText: string, catalog: WorldLeverCatalog): WorldGoalIntent {
  const text = sourceText.toLowerCase();
  const unresolved: WorldGoalUnresolved[] = [];

  let objectiveMetric: string | null = null;
  // Longest phrase first, so "peak flood depth" wins over "depth".
  for (const phrase of Object.keys(catalog.metricPhrases).sort((a, b) => b.length - a.length)) {
    if (text.includes(phrase)) {
      objectiveMetric = catalog.metricPhrases[phrase];
      break;
    }
  }
  if (!objectiveMetric) unresolved.push('OBJECTIVE_METRIC');

  const direction: WorldGoalIntent['direction'] = MINIMIZE.test(text)
    ? 'minimize'
    : MAXIMIZE.test(text)
      ? 'maximize'
      : null;
  if (!direction) unresolved.push('DIRECTION');

  const rounds = MAX_ROUNDS.exec(text);
  const maxRounds = rounds ? Number(rounds[1] ?? rounds[2]) : null;

  const requestedLeverIds: string[] = [];
  const unknownLeverPhrases: string[] = [];
  // The budget clause is removed before scanning for levers: "using at most 3
  // experiments" is a budget, and reading "at most" as an unmodelled mechanism
  // would report a gap that the sentence never claimed.
  const leverScanText = stripCatalogueQuantifiers(rounds ? text.replace(rounds[0], ' ') : text);
  for (const lever of catalog.levers) {
    if (lever.phrases.some((phrase) => text.includes(phrase))) requestedLeverIds.push(lever.leverId);
  }
  // A sentence that names a lever this world cannot act on must say so rather
  // than silently searching only the levers that happen to exist.
  for (const match of leverScanText.matchAll(LEVER_CANDIDATE)) {
    const phrase = match[1].trim();
    if (!MEANINGFUL_TOKEN.test(phrase)) continue;
    const known = catalog.levers.some((lever) => lever.phrases.some((p) => phrase.includes(p) || p.includes(phrase)));
    if (!known && phrase.length > 3) unknownLeverPhrases.push(phrase.replace(/\s+/g, ' ').trim());
  }
  if (unknownLeverPhrases.length > 0) unresolved.push('NAMED_LEVER_NOT_IN_WORLD');

  return {
    contractVersion: WORLD_GOAL_INTENT_CONTRACT_VERSION,
    sourceText,
    objectiveMetric,
    direction,
    requestedLeverIds,
    unknownLeverPhrases,
    maxRounds,
    unresolved,
  };
}

/**
 * Turns a read goal into a runnable search, or refuses with the reason.
 *
 * Refusal is the point of the return type: a search built on a metric the
 * world does not compute would run, produce numbers, and mean nothing.
 */
export function buildWorldDiscoveryPlan(
  intent: WorldGoalIntent,
  catalog: WorldLeverCatalog,
): DiscoveryLoopInput | { readonly error: string } {
  if (!intent.objectiveMetric) {
    return {
      error: `No objective metric was recognised in the goal. This world computes: ${[...new Set(Object.values(catalog.metricPhrases))].join(', ')}.`,
    };
  }
  if (!intent.direction) {
    return { error: 'The goal does not say whether the objective should be reduced or increased.' };
  }
  const entityId = catalog.entityIdForMetric[intent.objectiveMetric];
  if (!entityId) {
    return { error: `No entity is declared as the source of "${intent.objectiveMetric}" in this world.` };
  }

  const selected = intent.requestedLeverIds.length > 0
    ? catalog.levers.filter((lever) => intent.requestedLeverIds.includes(lever.leverId))
    : catalog.levers;
  if (selected.length === 0) {
    return { error: 'The goal named no lever this world can act on, and the catalogue is empty.' };
  }

  return {
    question: intent.sourceText,
    worldId: catalog.worldId,
    domainId: catalog.domainId,
    buildWorld: catalog.buildWorld,
    hypotheses: selected.map((lever) => lever.hypothesis(intent.objectiveMetric!, intent.direction!)),
    decisionAtTick: catalog.decisionAtTick,
    horizonTick: catalog.horizonTick,
    dt: catalog.dt,
    maxRounds: intent.maxRounds ?? 4,
    declaredAssumptions: catalog.declaredAssumptions,
    notModelledFactors: [
      ...catalog.notModelledFactors,
      // Carried into the run so a search narrowed by an unreadable phrase says so.
      ...intent.unknownLeverPhrases.map((p) => `Named in the goal but not modelled in this world: "${p}"`),
    ],
  };
}

// ---------------------------------------------------------------------------
// The flood city's real levers.
// ---------------------------------------------------------------------------

/** Scales a floodplain scalar from its baseline to a declared full value. */
function floodplainLever(key: string, fullValue: number, baseValue: number) {
  return (graph: WorldGraph, strength: number) => {
    const floodplain = graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID)!;
    graph.updateEntity(floodplain.id, {
      domainState: { ...floodplain.domainState, [key]: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

/** The relation a criterion needs to express "move this metric in the wanted direction". */
function relationFor(direction: 'minimize' | 'maximize'): 'less-than' | 'greater-than' {
  return direction === 'minimize' ? 'less-than' : 'greater-than';
}

/**
 * The levers the flood city actually has. Declared here, once, so the loop's
 * tests and any caller driving it from a sentence search the same real
 * mechanisms rather than two hand-written copies that could drift apart.
 */
export const GENESIS_FLOOD_LEVERS: readonly WorldLever[] = [
  {
    leverId: 'lever:outlet-capacity',
    phrases: ['outlet', 'channel', 'kanał', 'kanal', 'przepust'],
    targetEntityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:outlet-capacity',
      statement: `Peak flood depth is limited by outlet capacity, so widening the outlet ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'widening the floodplain outlet',
      entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'If the outlet limits discharge, widening it must move the peak depth.',
      },
      apply: floodplainLever('outletWidthM', 40, 5),
      rationale: 'Outlet geometry is the drainage path the flood solver really integrates.',
    }),
  },
  {
    leverId: 'lever:infiltration',
    phrases: ['infiltration', 'permeable', 'suds', 'infiltracj', 'przepuszczaln'],
    targetEntityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:infiltration',
      statement: `Peak flood depth is limited by infiltration, so permeable ground ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'raising floodplain infiltration',
      entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Water that infiltrates is water not standing on the floodplain.',
      },
      apply: floodplainLever('infiltrationRateMPerS', 1.0e-4, 1.39e-6),
      rationale: 'Infiltration is a real loss term in the volume balance.',
    }),
  },
  {
    leverId: 'lever:pump-capacity',
    phrases: ['pump', 'pompa', 'pompy', 'przepompowni'],
    targetEntityId: GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:pump-capacity',
      statement: `Peak flood depth is limited by pump capacity, so a larger pump ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'increasing pump-pipe volumetric flow',
      entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'If the pump is the binding constraint, its capacity must move standing water.',
      },
      apply: (graph, strength) => {
        const pump = graph.getEntity(GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID)!;
        const base = pump.domainState!.volumetricFlow as number;
        graph.updateEntity(pump.id, { domainState: { ...pump.domainState, volumetricFlow: base * (1 + strength) } });
      },
      rationale: 'The pump is the asset an operator can actually change.',
    }),
  },
];

export const GENESIS_FLOOD_CATALOG_ID = 'genesis-flood-city';

export const GENESIS_FLOOD_CATALOG: WorldLeverCatalog = {
  catalogId: GENESIS_FLOOD_CATALOG_ID,
  worldId: 'genesis-scientific-city-3',
  domainId: 'flood-hydrology',
  buildWorld: () => buildGenesisScientificCity3({ rainfallAtTick: 2 }),
  metricPhrases: {
    'peak flood depth': 'maxDepthM',
    'flood depth': 'maxDepthM',
    'peak depth': 'maxDepthM',
    'water depth': 'maxDepthM',
    'głębokość': 'maxDepthM',
    'glebokosc': 'maxDepthM',
    'water level': 'waterLevelM',
    'poziom wody': 'waterLevelM',
    'flooded area': 'floodedAreaM2',
    'zalan': 'floodedAreaM2',
  },
  entityIdForMetric: {
    maxDepthM: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
    waterLevelM: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
    floodedAreaM2: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  },
  levers: GENESIS_FLOOD_LEVERS,
  decisionAtTick: 1,
  horizonTick: 40,
  dt: 600,
  declaredAssumptions: [
    'Synthetic terrain (PROCEDURAL_APPROXIMATION) — not surveyed ground',
    'A single storm at one intensity, uncalibrated against gauge data',
  ],
  notModelledFactors: [
    'Construction cost and funding',
    'Time to build — every lever is applied instantly',
    'Maintenance, clogging and long-term performance decay',
  ],
};

/**
 * Every lever catalog Genesis declares, keyed by `catalogId`. The only
 * registry of its kind: a caller that needs to rebuild a catalog from a
 * stored id (memory replay) looks it up here rather than the catalog's
 * functions being reconstructed some other way.
 */
export const WORLD_LEVER_CATALOGS: Readonly<Record<string, WorldLeverCatalog>> = {
  [GENESIS_FLOOD_CATALOG_ID]: GENESIS_FLOOD_CATALOG,
};

export function resolveWorldLeverCatalog(catalogId: string): WorldLeverCatalog | undefined {
  return WORLD_LEVER_CATALOGS[catalogId];
}
