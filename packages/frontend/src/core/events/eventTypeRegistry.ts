import { EVENT_TYPE_PATTERN } from './genesisEvent';
import { EVENT_INFECTION_TRANSMISSION, EVENT_INFECTION_EXPOSURE } from './domains/epidemic';
import { URBAN_CASCADE_TYPE_DECLS } from './domains/urbanCascade';

/**
 * EVENT TYPE REGISTRY — neutralne, rozszerzalne typowanie zdarzeń.
 *
 * Pozwala domenom DEKLAROWAĆ swój typ zdarzenia (string, wymagane pola
 * parameters, opis) BEZ dotykania rdzenia. Dzięki temu przyszłe domeny
 * (flood/fire/earthquake/blackout/evacuation/asteroid/solarStorm) rejestrują
 * TYLKO kontrakt; ich modele dochodzą osobno, dopiero gdy realnie powstaną
 * (`implemented: false` dopóki nie ma modelu — żadnych „fake simulation").
 */

export interface EventTypeDecl {
  type: string;
  domain: string;
  description: string;
  requiredParams: readonly string[];
  /** Czy istnieje realny model/reguła wystawiająca to zdarzenie. */
  implemented: boolean;
}

const REGISTRY = new Map<string, EventTypeDecl>();

export function registerEventType(decl: EventTypeDecl): void {
  if (!EVENT_TYPE_PATTERN.test(decl.type)) throw new Error(`Invalid event type "${decl.type}" (must be dotted lowercase)`);
  REGISTRY.set(decl.type, decl);
}

export function getEventType(type: string): EventTypeDecl | undefined { return REGISTRY.get(type); }
export function listEventTypes(): EventTypeDecl[] { return [...REGISTRY.values()].sort((a, b) => a.type.localeCompare(b.type)); }
export function isKnownType(type: string): boolean { return REGISTRY.has(type); }
export function assertKnownType(type: string): void {
  if (!REGISTRY.has(type)) throw new Error(`Unknown event type "${type}" — register it via registerEventType first`);
}

/** Deklaracje domen jeszcze BEZ modeli — kontrakt gotowy, implementacja później. */
const FUTURE_DOMAIN_DECLS: EventTypeDecl[] = [
  { type: 'hazard.flood', domain: 'hazard', description: 'Flood event (model TBD).', requiredParams: ['regionId'], implemented: false },
  { type: 'hazard.fire', domain: 'hazard', description: 'Fire event (model TBD).', requiredParams: ['originId'], implemented: false },
  { type: 'hazard.earthquake', domain: 'hazard', description: 'Earthquake event (model TBD).', requiredParams: ['epicenterId'], implemented: false },
  { type: 'grid.blackout', domain: 'infrastructure', description: 'Blackout event (model TBD).', requiredParams: ['regionId'], implemented: false },
  { type: 'population.evacuation', domain: 'population', description: 'Evacuation event (model TBD).', requiredParams: ['regionId'], implemented: false },
  { type: 'hazard.asteroidimpact', domain: 'hazard', description: 'Asteroid impact event (model TBD).', requiredParams: ['siteId'], implemented: false },
  { type: 'hazard.solarstorm', domain: 'hazard', description: 'Solar storm event (model TBD).', requiredParams: ['region'], implemented: false },
];

/** Rejestruje wszystkie znane deklaracje (idempotentne). Wołane raz przy imporcie. */
export function registerBuiltinEventTypes(): void {
  registerEventType({ type: EVENT_INFECTION_TRANSMISSION, domain: 'epidemic', description: 'Contact-driven transmission (source→target).', requiredParams: ['fromAgent', 'toAgent'], implemented: true });
  registerEventType({ type: EVENT_INFECTION_EXPOSURE, domain: 'epidemic', description: 'Target entered Exposed (E) as a consequence of transmission.', requiredParams: ['agent', 'exposedBy'], implemented: true });
  for (const d of URBAN_CASCADE_TYPE_DECLS) registerEventType({ ...d, implemented: false });
  for (const d of FUTURE_DOMAIN_DECLS) registerEventType(d);
}

registerBuiltinEventTypes();
