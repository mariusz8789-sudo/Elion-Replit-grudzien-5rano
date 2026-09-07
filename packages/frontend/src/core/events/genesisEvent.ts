/**
 * GENESIS EVENT — neutralny domenowo kontrakt zdarzenia (fundament przyszłego
 * Universal Event + Consequence Engine).
 *
 * NIE jest projektowany pod epidemiologię. `type` jest kropkowanym łańcuchem
 * („infection.transmission", w przyszłości „hazard.flood", „grid.blackout"…),
 * a ładunek domenowy trafia do `parameters`. Kontrakt jest WERSJONOWANY, żeby
 * konsument (renderer Manusa) mógł bezpiecznie ewoluować.
 *
 * Zasady:
 *  - zdarzenie zawsze ma jednoznaczne, DETERMINISTYCZNE `id` (patrz EventRegistry),
 *  - zdarzenie pochodzi ze ŹRÓDŁA MODELOWEGO lub jawnej akcji eksperymentu
 *    (`provenance.origin`), nigdy nie jest losowe,
 *  - `parentEventId` tworzy łańcuch przyczynowy (event → konsekwencja).
 */

import { canonicalJson, fnv1a } from './hash';

export const GENESIS_EVENT_CONTRACT_VERSION = '1.0.0';

/**
 * A CONTENT-DERIVED event identifier: `<prefix>:<entityId>:<tick>:<hash of
 * the event's own parameters>`.
 *
 * Solvers used to end this id with a module-global step counter, which made
 * event ids depend on how many events the PROCESS had emitted rather than on
 * what happened in the world. Two consequences, both real:
 *
 * 1. Re-running the same scenario in the same process produced different
 *    event ids for identical science, so a provenance export
 *    (`worldModel/evidence/worldEvidenceBundle.ts`) could not be
 *    byte-reproducible — it had to declare that as a known limitation.
 * 2. Two branches that diverged from a fork emitted ids that differed only
 *    by whichever branch happened to run first, rather than by what actually
 *    differed between them.
 *
 * Hashing the event's own parameters fixes both: the id is stable across
 * processes, and two events carrying different values necessarily get
 * different ids. Two events with identical entity, tick AND parameters get
 * the same id — which is correct, because they are the same event.
 *
 * `entityKey` is the same `kind:id` form `ecs/types.ts::entityId` produces;
 * it is spelled out here rather than imported so this module keeps no
 * dependency on the world-model layer.
 */
export function deterministicEventId(prefix: string, entityKey: string, tick: number, parameters: unknown): string {
  return `${prefix}:${entityKey}:${tick}:${fnv1a(canonicalJson(parameters))}`;
}

/** Referencja do bytu świata (agent, budynek, region, węzeł sieci…) — neutralna. */
export interface EntityRef {
  /** np. 'agent' | 'building' | 'region' | 'node'. Domenowo neutralne. */
  kind: string;
  id: string | number;
}

/** Lokalizacja w przestrzeni świata (jednostki definiuje model). z opcjonalne. */
export interface GenesisLocation {
  x: number;
  y: number;
  z?: number;
}

/** Skąd wzięło się zdarzenie: model albo jawna akcja eksperymentu. */
export interface EventProvenance {
  /** Źródło powstania zdarzenia. */
  origin: 'model' | 'experiment-action' | 'consequence-rule';
  modelId?: string;
  experimentId?: string;
  /** Ziarno RNG modelu — klucz reprodukowalności. */
  seed?: number | string;
  /** Skrót parametrów w chwili zdarzenia (deterministyczny; reuse FNV-1a). */
  paramsHash?: string;
  /** Odcisk zapisanego eksperymentu (scienceMemory), jeśli powiązany. */
  experimentContentHash?: string;
  /** Id reguły konsekwencji, jeśli origin === 'consequence-rule'. */
  ruleId?: string;
  notes?: string;
}

/**
 * Zdarzenie Genesis. `parameters` jest generyczny — domena wkłada tam swój
 * ładunek (np. {fromAgent,toAgent} dla transmisji), rdzeń go nie interpretuje.
 */
export interface GenesisEvent<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Wersja kontraktu — gwarancja zgodności dla konsumenta. */
  contractVersion: string;
  /** Deterministyczne, jednoznaczne ID (nadawane przez EventRegistry). */
  id: string;
  /** Typ kropkowany, domenowo neutralny (np. 'infection.transmission'). */
  type: string;
  /** Czas symulacji (jednostkę definiuje model, np. dni). */
  timestamp: number;
  /** Miejsce zdarzenia w świecie (opcjonalne dla zdarzeń nie-przestrzennych). */
  location?: GenesisLocation;
  /** Byt-sprawca (np. agent zakażający) — opcjonalny. */
  source?: EntityRef;
  /** Krótki znacznik przyczyny (np. 'proximity-contact'). */
  cause?: string;
  /** Byty dotknięte zdarzeniem (np. agent nowo zakażony). */
  affectedEntities: EntityRef[];
  /** Dotkliwość 0..1 (neutralna, opcjonalna). */
  severity?: number;
  /** Ładunek domenowy. */
  parameters: P;
  /** Rodzic w łańcuchu przyczynowym (null = zdarzenie pierwotne). */
  parentEventId?: string | null;
  modelId?: string;
  experimentId?: string;
  provenance?: EventProvenance;
}

/** Wejście do rejestru: wszystko oprócz `id` i `contractVersion` (te nadaje rejestr). */
export type GenesisEventInput<P extends Record<string, unknown> = Record<string, unknown>> =
  Omit<GenesisEvent<P>, 'id' | 'contractVersion'>;

export interface ValidationResult { ok: boolean; errors: string[] }

export const PROVENANCE_ORIGINS = ['model', 'experiment-action', 'consequence-rule'] as const;
export const EVENT_TYPE_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)+$/;

function isEntityRef(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.kind === 'string' && o.kind.length > 0 && (typeof o.id === 'string' || typeof o.id === 'number');
}

/** Walidacja kształtu zdarzenia (bez znajomości domeny). */
export function validateEvent(e: Partial<GenesisEvent>): ValidationResult {
  const errors: string[] = [];
  if (!e.type || typeof e.type !== 'string' || !EVENT_TYPE_PATTERN.test(e.type)) {
    errors.push('type must be a dotted lowercase string (e.g. "infection.transmission")');
  }
  if (typeof e.timestamp !== 'number' || !Number.isFinite(e.timestamp)) errors.push('timestamp must be a finite number');
  if (!Array.isArray(e.affectedEntities)) errors.push('affectedEntities must be an array');
  else if (!e.affectedEntities.every(isEntityRef)) errors.push('affectedEntities entries must be {kind:string, id:string|number}');
  if (e.source != null && !isEntityRef(e.source)) errors.push('source, when present, must be {kind:string, id:string|number}');
  if (e.location != null) {
    const l = e.location;
    if (typeof l.x !== 'number' || typeof l.y !== 'number' || (l.z != null && typeof l.z !== 'number')) {
      errors.push('location, when present, must have numeric x, y (and optional numeric z)');
    }
  }
  if (e.severity != null && (typeof e.severity !== 'number' || e.severity < 0 || e.severity > 1)) {
    errors.push('severity, when present, must be in [0,1]');
  }
  if (e.parameters == null || typeof e.parameters !== 'object') errors.push('parameters must be an object');
  if (e.provenance != null && !PROVENANCE_ORIGINS.includes(e.provenance.origin)) {
    errors.push(`provenance.origin must be one of ${PROVENANCE_ORIGINS.join(' | ')}`);
  }
  return { ok: errors.length === 0, errors };
}
