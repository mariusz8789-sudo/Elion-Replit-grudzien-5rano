/**
 * aiChat (V6) — conversation model + local persistence + the ask transport for the
 * AI Discovery chat. Sessions live in localStorage (offline-first, survives reload).
 *
 * HONESTY: this never invents answers. A message is only ever appended from a real
 * backend `/api/ask` response; when the model is unconfigured (503) the store records
 * an explicit AI_UNAVAILABLE turn (flagged, not a fabricated answer).
 */
import { readJSON, writeJSON } from './storage';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  at: number;
  status?: 'ok' | 'unavailable' | 'error';
  provenance?: string;
}
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

const KEY = 'ai-chat/v1';
let counter = 0;
/** Deterministic-ish id without Math.random (which is fine here, but keep it simple/testable). */
export function newId(prefix = 'c'): string { counter += 1; return `${prefix}${Date.now().toString(36)}-${counter}`; }

export function loadConversations(): Conversation[] {
  const raw = readJSON<Conversation[] | null>(KEY, null);
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages));
}
export function saveConversations(list: Conversation[]): void { writeJSON(KEY, list); }

export function createConversation(title = 'Nowa rozmowa'): Conversation {
  const now = Date.now();
  return { id: newId('conv'), title, messages: [], pinned: false, createdAt: now, updatedAt: now };
}

/** Order: pinned first, then most-recently-updated. */
export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt - a.updatedAt));
}

/** Derive a short title from the first user message. */
export function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 42 ? t.slice(0, 42) + '…' : (t || 'Nowa rozmowa');
}

export type AskReply =
  | { ok: true; answer: string }
  | { ok: false; kind: 'unavailable' | 'rate' | 'offline' | 'error'; message: string };

/**
 * Ask the discovery assistant. Sends only the question + a discovery context the
 * backend grounds against. Returns an explicit unavailable/ error status — never a
 * fabricated answer.
 */
export async function askDiscovery(question: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<AskReply> {
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f('/api/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ labId: 'discovery', lab: 'Discovery Console', experiment: 'AI Discovery Chat', honesty: 'computational', honestyNote: '', params: {}, stats: {}, narration: [], question }),
    });
    if (res.status === 503) { const d = await res.json().catch(() => null); return { ok: false, kind: 'unavailable', message: d?.message ?? 'Asystent AI nie jest skonfigurowany w tym wdrożeniu (brak klucza modelu).' }; }
    if (res.status === 429) return { ok: false, kind: 'rate', message: 'Limit zapytań — odczekaj chwilę.' };
    if (!res.ok) return { ok: false, kind: 'error', message: 'Serwis AI chwilowo niedostępny.' };
    const d = await res.json().catch(() => null) as { answer?: string } | null;
    return d?.answer ? { ok: true, answer: d.answer } : { ok: false, kind: 'error', message: 'Pusta odpowiedź serwisu AI.' };
  } catch {
    return { ok: false, kind: 'offline', message: 'Brak połączenia z backendem AI. Rozmowy działają lokalnie; pytania otwarte wymagają skonfigurowanego backendu.' };
  }
}

export const PROMPT_SUGGESTIONS: string[] = [
  'Wyjaśnij, dlaczego dokowanie to oszacowanie, nie zmierzone powinowactwo.',
  'Jak Genesis oznacza zablokowane zdolności (MD / MM-GBSA / FEP)?',
  'Co oznacza „MODEL_INFERRED" w predykcjach ADMET?',
  'Podsumuj przepływ kampanii odkrywczej krok po kroku.',
];
