/* Proprietary / All Rights Reserved - Genesis OS */
import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const ENTITY_DISCLAIMER = 'Procedural historical entity and NPC dialogue interaction model. Speech, cultural responses, and attire are synthetic reconstructions based on temporal/archaeological data matrices. NOT real persons, NOT real speech.';
export type EraCulture = 'MAYAN_CLASSIC' | 'MEDIEVAL_EUROPE' | 'INDUSTRIAL_XIX' | 'MODERN_CYBER' | 'FUTURE_2099' | 'PREHISTORIC';
export interface HistoricalEntity { readonly entityId: string; readonly name: string; readonly era: EraCulture; readonly birthYear: number; readonly role: string; readonly position5D: readonly [number, number, number, number, number]; readonly culturalKnowledgeKeys: readonly string[]; readonly dispositionIndex: number; }
export interface InteractionUtterance { readonly timestamp: number; readonly speakerId: string; readonly utteranceText: string; readonly translatedText: string; readonly emotionalState: 'NEUTRAL' | 'AWED' | 'CURIOUS' | 'CAUTIOUS' | 'REVERENT'; readonly integrityHash: string; }
export interface DialogueLedgerEntry { readonly index: number; readonly at: number; readonly sessionId: string; readonly utteranceHash: string; readonly prevHash: string; readonly hash: string; }
export interface EntityInteractionSession { readonly sessionId: string; readonly entity: HistoricalEntity; readonly userAgentId: string; readonly dialogueHistory: readonly InteractionUtterance[]; readonly bulletTimeActive: boolean; readonly dataLabel: 'SYNTHETIC_HISTORICAL_NPC'; readonly disclaimer: string; readonly fingerprint: string; }
const DIALOGUE_LEXICON: Record<EraCulture, { greeting: string[]; lore: string[] }> = {
  PREHISTORIC: { greeting: ['[Gesty, powitalny okrzyk]', '[Ciche wskazanie na ognisko]'], lore: ['Dym oznacza bezpieczne schronienie.', 'Rzeka niesie czystą wodę od świtu.'] },
  MAYAN_CLASSIC: { greeting: ['In Lak’ech (Ja jestem innym tobą).', 'Niech K’inich Ajaw oświetla twój krok.'], lore: ['Piramida rezonuje z gwiazdami Plejad.', 'Kalendarz K’atun wskazuje czas przeznaczenia.'] },
  MEDIEVAL_EUROPE: { greeting: ['Niech będzie pochwalony.', 'Witaj, podróżny, w naszej osadzie.'], lore: ['Młyn wodny pracuje od świtu do zmierzchu.', 'Zbiory w tym roku wymagają błogosławieństwa.'] },
  INDUSTRIAL_XIX: { greeting: ['Dzień dobry Panu/Pani.', 'Czym mogę służyć w ten chłodny poranek?'], lore: ['Maszyna parowa w fabryce zmieniła całe miasto.', 'Kolej żelazna łączy rynki i ludzi.'] },
  MODERN_CYBER: { greeting: ['Dostęp autoryzowany.', 'Witaj w sieci lokalnego węzła.'], lore: ['Dane płyną strumieniem światłowodowym.', 'Kwantowy rejestr czuwa nad spójnością.'] },
  FUTURE_2099: { greeting: ['Tożsamość rozpoznana. Witaj w biosferze 2099.', 'Sygnał synchroniczny nawiązany.'], lore: ['Atmosfera jest filtrowana przez wieże hyperox.', 'Grawitacja lokalna jest stabilizowana polowo.'] },
};
export function generateEntityFromSeed(seed: number, era: EraCulture, year: number, role = 'Mieszkaniec'): HistoricalEntity {
  const rng = mulberry32(seed ^ parseInt(sha256hex(era).slice(0, 8), 16));
  const names = ['K’inich', 'Antoni', 'Aethelgard', 'Elena', 'IX-77', 'Ogar'];
  const name = `${names[Math.floor(rng() * names.length)]}-${Math.floor(rng() * 900 + 100)}`;
  return { entityId: 'ENT-' + sha256hex(`${seed}:${era}:${year}`).slice(0, 12), name, era, birthYear: year - Math.floor(20 + rng() * 30), role, position5D: [year, +(rng() * 100).toFixed(2), 0, +(rng() * 100).toFixed(2), +rng().toFixed(3)], culturalKnowledgeKeys: ['TRADITION', 'ARCHITECTURE', 'DAILY_LIFE', 'MYTHOLOGY'], dispositionIndex: +(0.5 + rng() * 0.5).toFixed(2) };
}
export class GenesisInteractiveEntityEngine {
  private sessions = new Map<string, EntityInteractionSession>();
  private ledger: DialogueLedgerEntry[] = [];
  private seq = 0;
  constructor(private clock: Clock, private seed: number) {}
  startSession(userAgentId: string, entity: HistoricalEntity): EntityInteractionSession {
    const sessionId = 'SESS-' + sha256hex(`${userAgentId}:${entity.entityId}:${this.seq++}`).slice(0, 12);
    const s: EntityInteractionSession = { sessionId, entity, userAgentId, dialogueHistory: [], bulletTimeActive: false, dataLabel: 'SYNTHETIC_HISTORICAL_NPC', disclaimer: ENTITY_DISCLAIMER, fingerprint: sha256hex(stableStringify({ sessionId, entityId: entity.entityId })) };
    this.sessions.set(sessionId, s); return s;
  }
  interact(sessionId: string, userQuery: string): EntityInteractionSession {
    const session = this.sessions.get(sessionId); if (!session) throw new Error(`SESSION_NOT_FOUND: ${sessionId}`);
    const rng = mulberry32(this.seed ^ session.dialogueHistory.length ^ parseInt(sha256hex(userQuery).slice(0, 8), 16));
    const lex = DIALOGUE_LEXICON[session.entity.era];
    const lore = lex.lore[Math.floor(rng() * lex.lore.length)];
    const responseText = session.dialogueHistory.length === 0 ? `${lex.greeting[Math.floor(rng() * lex.greeting.length)]} ${lore}` : lore;
    const t = this.clock.now();
    const utteranceHash = sha256hex(stableStringify({ userQuery, responseText, speakerId: session.entity.entityId, t }));
    const prev = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : 'GENESIS';
    const index = this.ledger.length;
    this.ledger.push(Object.freeze({ index, at: t, sessionId, utteranceHash, prevHash: prev, hash: sha256hex(stableStringify({ index, sessionId, utteranceHash, prevHash: prev, at: t })) }));
    const utterance: InteractionUtterance = { timestamp: t, speakerId: session.entity.entityId, utteranceText: responseText, translatedText: `[Tłumaczenie syntetyczne - ${session.entity.era}]: ${responseText}`, emotionalState: session.entity.dispositionIndex > 0.7 ? 'CURIOUS' : 'CAUTIOUS', integrityHash: utteranceHash };
    const updated: EntityInteractionSession = { ...session, dialogueHistory: [...session.dialogueHistory, utterance], fingerprint: sha256hex(stableStringify({ prevFingerprint: session.fingerprint, utteranceHash })) };
    this.sessions.set(sessionId, updated); return updated;
  }
  toggleBulletTime(sessionId: string, active: boolean): EntityInteractionSession {
    const session = this.sessions.get(sessionId); if (!session) throw new Error(`SESSION_NOT_FOUND: ${sessionId}`);
    const updated: EntityInteractionSession = { ...session, bulletTimeActive: active, fingerprint: sha256hex(stableStringify({ prevFingerprint: session.fingerprint, bulletTime: active })) };
    this.sessions.set(sessionId, updated); return updated;
  }
  getDialogueLedger(): readonly DialogueLedgerEntry[] { return this.ledger; }
  verifyDialogueLedger(): { ok: boolean; errors: readonly string[] } { const errors: string[] = []; let prev = 'GENESIS'; for (const e of this.ledger) { if (e.prevHash !== prev) errors.push('CHAIN_BREAK@' + e.index); if (e.hash !== sha256hex(stableStringify({ index: e.index, sessionId: e.sessionId, utteranceHash: e.utteranceHash, prevHash: e.prevHash, at: e.at }))) errors.push('HASH_MISMATCH@' + e.index); prev = e.hash; } return { ok: errors.length === 0, errors }; }
  disclaimer(): string { return ENTITY_DISCLAIMER; }
}
