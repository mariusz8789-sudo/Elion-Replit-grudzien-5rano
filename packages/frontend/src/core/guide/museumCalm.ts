import type { GuideLang } from './narrationModel';
import type { VoiceSettings } from './voiceEngine';

/**
 * MUSEUM CALM — the delivered guide-voice pack's behavioural contract on the
 * existing voice engine (no second TTS): calm pacing, one idea per utterance,
 * captions always on, and an optional spoken epistemic status line that never
 * promotes a model to a fact. The engine's provider chain (pre-rendered
 * audio, then browser SpeechSynthesis) stays as it is; this module only
 * shapes settings and text.
 */

export const MUSEUM_CALM: Readonly<Pick<VoiceSettings, 'rate' | 'volume' | 'captions'>> = { rate: 0.84, volume: 0.78, captions: true };
export const MUSEUM_MAX_UTTERANCE_CHARS = 180;

export function normalizeMuseumRate(rate: number): number { return Number.isFinite(rate) ? Math.min(1.05, Math.max(0.72, rate)) : MUSEUM_CALM.rate; }
export function normalizeMuseumVolume(volume: number): number { return Number.isFinite(volume) ? Math.min(1, Math.max(0.45, volume)) : MUSEUM_CALM.volume; }

/** Museum settings over the user's own: language and enabled flag are kept, pacing is calmed, captions forced on. */
export function museumCalmSettings(current: VoiceSettings): VoiceSettings {
  return { ...current, rate: normalizeMuseumRate(Math.min(current.rate, MUSEUM_CALM.rate)), volume: normalizeMuseumVolume(Math.min(current.volume, MUSEUM_CALM.volume)), captions: true };
}

/** Split text into spoken chunks: sentence boundaries first, then hard-wrap on word boundaries; never mid-word, never empty. */
export function chunkForSpeech(text: string, maxChars = MUSEUM_MAX_UTTERANCE_CHARS): readonly string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentences = normalized.split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  for (const s of sentences) {
    if (s.length <= maxChars) { out.push(s); continue; }
    let rest = s;
    while (rest.length > maxChars) {
      const cut = rest.lastIndexOf(' ', maxChars);
      const at = cut > maxChars * 0.4 ? cut : maxChars;
      out.push(rest.slice(0, at).trim()); rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

export type SpokenEpistemicStatus = 'REAL_OBSERVATION' | 'VERIFIED_SOURCE' | 'MODEL' | 'SIMULATION' | 'HYPOTHESIS' | 'SPECULATIVE' | 'INSUFFICIENT_EVIDENCE' | 'NOT_MODELED' | 'FICTION_INSPIRED_SCENARIO';

const STATUS_LINE: Readonly<Record<GuideLang, Readonly<Record<SpokenEpistemicStatus, string>>>> = {
  pl: { REAL_OBSERVATION: 'To rzeczywista obserwacja.', VERIFIED_SOURCE: 'To informacja ze zweryfikowanego źródła.', MODEL: 'To obraz modelowy, nie obserwacja.', SIMULATION: 'To wynik symulacji, nie bezpośrednia obserwacja.', HYPOTHESIS: 'To hipoteza w trakcie badania.', SPECULATIVE: 'To spekulacja bez dowodów.', INSUFFICIENT_EVIDENCE: 'Dowody są niewystarczające.', NOT_MODELED: 'Tego nie modelujemy.', FICTION_INSPIRED_SCENARIO: 'To scenariusz inspirowany fikcją.' },
  en: { REAL_OBSERVATION: 'This is a real observation.', VERIFIED_SOURCE: 'This comes from a verified source.', MODEL: 'This is a model view, not an observation.', SIMULATION: 'This is a simulation result, not a direct observation.', HYPOTHESIS: 'This is a hypothesis under investigation.', SPECULATIVE: 'This is speculation without evidence.', INSUFFICIENT_EVIDENCE: 'The evidence is insufficient.', NOT_MODELED: 'This is not modelled.', FICTION_INSPIRED_SCENARIO: 'This is a fiction-inspired scenario.' },
};

/** One short spoken status line; unknown statuses are not invented (null). */
export function epistemicStatusLine(status: string, lang: GuideLang): string | null {
  const table = STATUS_LINE[lang] ?? STATUS_LINE.pl;
  return (table as Record<string, string>)[status] ?? null;
}

/** Museum delivery of a narration: the status line first (when known), then one idea per chunk. */
export function museumUtterances(lines: readonly { readonly key: string; readonly text: string }[], status: string | null, lang: GuideLang): readonly { readonly key: string; readonly text: string; readonly lang: GuideLang }[] {
  const out: { key: string; text: string; lang: GuideLang }[] = [];
  const statusLine = status ? epistemicStatusLine(status, lang) : null;
  if (statusLine) out.push({ key: 'status', text: statusLine, lang });
  for (const l of lines) chunkForSpeech(l.text).forEach((chunk, i) => out.push({ key: `${l.key}:${i}`, text: chunk, lang }));
  return out;
}
