/**
 * aiChat (V6) — conversation model + local persistence + the ask transport for the
 * AI Discovery chat. Sessions live in localStorage (offline-first, survives reload).
 *
 * HONESTY: this never invents answers. A message is only ever appended from a real
 * backend `/api/ask` response; when the model is unconfigured (503) the store records
 * an explicit AI_UNAVAILABLE turn (flagged, not a fabricated answer).
 */
import { readJSON, writeJSON } from './storage';
import { t } from './i18n';

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

export function createConversation(title = t('ai.new')): Conversation {
  const now = Date.now();
  return { id: newId('conv'), title, messages: [], pinned: false, createdAt: now, updatedAt: now };
}

/** Order: pinned first, then most-recently-updated. */
export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt - a.updatedAt));
}

/** Derive a short title from the first user message. */
export function deriveTitle(text: string): string {
  const title = text.trim().replace(/\s+/g, ' ');
  return title.length > 42 ? title.slice(0, 42) + '…' : (title || t('ai.new'));
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
    if (res.status === 503) { const d = await res.json().catch(() => null); return { ok: false, kind: 'unavailable', message: d?.message ?? t('aic.err.unavailable') }; }
    if (res.status === 429) return { ok: false, kind: 'rate', message: t('aic.err.rate') };
    if (!res.ok) return { ok: false, kind: 'error', message: t('aic.err.service') };
    const d = await res.json().catch(() => null) as { answer?: string } | null;
    return d?.answer ? { ok: true, answer: d.answer } : { ok: false, kind: 'error', message: t('aic.err.empty') };
  } catch {
    return { ok: false, kind: 'offline', message: t('aic.err.offline') };
  }
}

/** Prompt-suggestion i18n keys (resolved by the caller so they follow the language). */
export const PROMPT_SUGGESTIONS: string[] = [
  'aic.suggest.1',
  'aic.suggest.2',
  'aic.suggest.3',
  'aic.suggest.4',
];
