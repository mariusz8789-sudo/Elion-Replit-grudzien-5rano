import type { GuideLang } from './narrationModel';

/**
 * VOICE ENGINE (D-119) — the guide's voice as a small state machine over
 * pluggable providers. OFF → READY → SPEAKING ⇄ PAUSED; one utterance at a
 * time; settings persisted per person. Providers are tried in order: a
 * pre-rendered audio file when one exists for the beat (premium recordings
 * for the Tour), otherwise the browser's own speech synthesis. No API key
 * is ever needed on the client; a cloud provider can be added later behind
 * the same interface without touching callers.
 */

export type VoiceState = 'OFF' | 'READY' | 'SPEAKING' | 'PAUSED';

export interface VoiceSettings {
  readonly enabled: boolean;
  readonly volume: number;
  readonly rate: number;
  readonly lang: GuideLang;
  readonly captions: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { enabled: true, volume: 0.9, rate: 0.95, lang: 'pl', captions: true };

export interface Utterance {
  /** Stable key (beat id) — lets a pre-rendered provider find its file. */
  readonly key: string;
  readonly text: string;
  readonly lang: GuideLang;
}

export interface SpeechHandle {
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface VoiceProvider {
  readonly name: string;
  available(): boolean;
  /** Returns null when this provider cannot speak this utterance (the engine then tries the next one). */
  speak(u: Utterance, settings: VoiceSettings, onEnd: () => void): SpeechHandle | null;
}

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; }

const STORAGE_KEY = 'genesis.voiceGuide.v1';

export function loadVoiceSettings(storage: StorageLike | null): VoiceSettings {
  if (storage === null) return DEFAULT_VOICE_SETTINGS;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_VOICE_SETTINGS;
    const p = JSON.parse(raw) as Partial<VoiceSettings>;
    return {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : DEFAULT_VOICE_SETTINGS.enabled,
      volume: typeof p.volume === 'number' && Number.isFinite(p.volume) ? Math.min(1, Math.max(0, p.volume)) : DEFAULT_VOICE_SETTINGS.volume,
      rate: typeof p.rate === 'number' && Number.isFinite(p.rate) ? Math.min(1.3, Math.max(0.7, p.rate)) : DEFAULT_VOICE_SETTINGS.rate,
      lang: p.lang === 'en' ? 'en' : 'pl',
      captions: typeof p.captions === 'boolean' ? p.captions : DEFAULT_VOICE_SETTINGS.captions,
    };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function saveVoiceSettings(storage: StorageLike | null, s: VoiceSettings): void {
  if (storage === null) return;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode / quota: settings stay in memory */ }
}

export class VoiceEngine {
  private stateValue: VoiceState;
  private settingsValue: VoiceSettings;
  private readonly providers: readonly VoiceProvider[];
  private readonly storage: StorageLike | null;
  private handle: SpeechHandle | null = null;
  private last: Utterance | null = null;
  private readonly listeners = new Set<() => void>();
  /** Which provider spoke the last utterance — surfaced to the UI as "voice: browser / recording". */
  public lastProvider: string | null = null;

  constructor(providers: readonly VoiceProvider[], storage: StorageLike | null = null) {
    this.providers = providers;
    this.storage = storage;
    this.settingsValue = loadVoiceSettings(storage);
    this.stateValue = this.settingsValue.enabled ? 'READY' : 'OFF';
  }

  get state(): VoiceState { return this.stateValue; }
  get settings(): VoiceSettings { return this.settingsValue; }
  get current(): Utterance | null { return this.last; }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(): void { for (const fn of this.listeners) fn(); }
  private set(state: VoiceState): void { this.stateValue = state; this.emit(); }

  update(patch: Partial<VoiceSettings>): void {
    this.settingsValue = { ...this.settingsValue, ...patch };
    saveVoiceSettings(this.storage, this.settingsValue);
    if (patch.enabled === false) { this.stop(); this.set('OFF'); return; }
    if (patch.enabled === true && this.stateValue === 'OFF') this.set('READY');
    else this.emit();
  }

  /** Speaks one utterance; a previous one is cancelled first. Returns true when a provider took it. */
  speak(u: Utterance): boolean {
    this.last = u;
    if (this.stateValue === 'OFF') { this.emit(); return false; }
    this.cancelCurrent();
    for (const p of this.providers) {
      if (!p.available()) continue;
      const h = p.speak(u, this.settingsValue, () => { if (this.handle === h) { this.handle = null; this.set('READY'); } });
      if (h !== null) { this.handle = h; this.lastProvider = p.name; this.set('SPEAKING'); return true; }
    }
    this.lastProvider = null;
    this.set('READY');
    return false;
  }

  repeat(): boolean { return this.last === null ? false : this.speak(this.last); }
  pause(): void { if (this.stateValue === 'SPEAKING' && this.handle !== null) { this.handle.pause(); this.set('PAUSED'); } }
  resume(): void { if (this.stateValue === 'PAUSED' && this.handle !== null) { this.handle.resume(); this.set('SPEAKING'); } }
  stop(): void { this.cancelCurrent(); if (this.stateValue !== 'OFF') this.set('READY'); }
  private cancelCurrent(): void { if (this.handle !== null) { const h = this.handle; this.handle = null; h.cancel(); } }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

type SynthLike = {
  speak(u: SpeechSynthesisUtterance): void; cancel(): void; pause(): void; resume(): void;
  getVoices(): SpeechSynthesisVoice[];
};

/** Picks the most natural voice the browser offers for the language (premium/enhanced/local first). */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: GuideLang): SpeechSynthesisVoice | null {
  const prefix = lang === 'pl' ? 'pl' : 'en';
  const candidates = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  if (candidates.length === 0) return null;
  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/premium|enhanced|natural|neural|siri/.test(n)) s += 4;
    if (/zosia|ewa|krzysztof|google|microsoft/.test(n)) s += 2;
    if (v.localService) s += 1;
    if (v.default) s += 1;
    return s;
  };
  return [...candidates].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export class BrowserSpeechProvider implements VoiceProvider {
  readonly name = 'browser';
  private readonly synth: SynthLike | null;
  constructor(synth?: SynthLike | null) {
    this.synth = synth !== undefined ? synth : (typeof window !== 'undefined' && 'speechSynthesis' in window ? (window.speechSynthesis as unknown as SynthLike) : null);
  }
  available(): boolean { return this.synth !== null && typeof SpeechSynthesisUtterance !== 'undefined'; }
  speak(u: Utterance, s: VoiceSettings, onEnd: () => void): SpeechHandle | null {
    const synth = this.synth;
    if (synth === null) return null;
    const utt = new SpeechSynthesisUtterance(u.text);
    utt.lang = u.lang === 'pl' ? 'pl-PL' : 'en-US';
    utt.rate = s.rate;
    utt.volume = s.volume;
    utt.pitch = 1;
    const voice = pickVoice(synth.getVoices(), u.lang);
    if (voice !== null) utt.voice = voice;
    let ended = false;
    const finish = (): void => { if (!ended) { ended = true; onEnd(); } };
    utt.onend = finish;
    utt.onerror = finish;
    synth.cancel();
    synth.speak(utt);
    return { cancel: () => { ended = true; synth.cancel(); }, pause: () => synth.pause(), resume: () => synth.resume() };
  }
}

/** One recording per (language, utterance key): where the file is and the exact text it speaks. */
export interface AudioEntry { readonly src: string; readonly text: string; }
export type AudioManifest = Readonly<Record<GuideLang, Readonly<Record<string, AudioEntry>>>>;

/** Whitespace-insensitive equality: a recording may only play for the sentence it was rendered from. */
export function sameText(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
}

/**
 * Accepts both manifest shapes: the generator's array
 * `[{ id, lang, file, text }]` (files next to the manifest under /audio/) and
 * the object form `{ pl: { key: { src, text } }, en: {...} }`. Entries without
 * a text are dropped — a recording whose sentence is unknown can never be
 * verified against the narration model, so it is never played.
 */
export function normalizeManifest(raw: unknown, baseUrl = '/audio/'): AudioManifest {
  const out: { pl: Record<string, AudioEntry>; en: Record<string, AudioEntry> } = { pl: {}, en: {} };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item === null || typeof item !== 'object') continue;
      const { id, lang, file, text, src } = item as { id?: unknown; lang?: unknown; file?: unknown; text?: unknown; src?: unknown };
      if (typeof id !== 'string' || (lang !== 'pl' && lang !== 'en') || typeof text !== 'string') continue;
      const url = typeof src === 'string' ? src : typeof file === 'string' ? `${baseUrl}${file}` : null;
      if (url === null) continue;
      out[lang][id] = { src: url, text };
    }
    return out;
  }
  if (raw !== null && typeof raw === 'object') {
    for (const lang of ['pl', 'en'] as const) {
      const table = (raw as Record<string, unknown>)[lang];
      if (table === null || typeof table !== 'object') continue;
      for (const [key, v] of Object.entries(table as Record<string, unknown>)) {
        if (v !== null && typeof v === 'object' && typeof (v as { src?: unknown }).src === 'string' && typeof (v as { text?: unknown }).text === 'string') out[lang][key] = { src: (v as { src: string }).src, text: (v as { text: string }).text };
      }
    }
  }
  return out;
}

type AudioElementLike = { src: string; volume: number; playbackRate: number; play(): Promise<void> | void; pause(): void; currentTime: number; onended: ((ev: Event) => void) | null; onerror: ((ev: Event | string) => void) | null };

/**
 * Plays a pre-rendered recording for an utterance key when the manifest has
 * one for the language AND its recorded text equals the utterance; otherwise
 * it steps aside (returns null) so the engine falls back to the browser voice.
 * That text check is what keeps a recording from ever saying more, less or
 * something else than the narration model derived from the current run.
 */
export class PrerenderedAudioProvider implements VoiceProvider {
  readonly name = 'recording';
  constructor(private readonly manifest: AudioManifest, private readonly makeAudio: (src: string) => AudioElementLike = (src) => new Audio(src)) {}
  available(): boolean { return true; }
  speak(u: Utterance, s: VoiceSettings, onEnd: () => void): SpeechHandle | null {
    const entry = this.manifest[u.lang]?.[u.key];
    // No file, or a file rendered from a different sentence than the one the model
    // wants to say now → step aside; the browser voice speaks the true sentence.
    if (entry === undefined || !sameText(entry.text, u.text)) return null;
    const a = this.makeAudio(entry.src);
    a.volume = s.volume;
    a.playbackRate = s.rate;
    let ended = false;
    const finish = (): void => { if (!ended) { ended = true; onEnd(); } };
    a.onended = finish;
    a.onerror = finish;
    const played = a.play();
    if (played !== undefined) played.catch(finish);
    return { cancel: () => { ended = true; a.pause(); }, pause: () => a.pause(), resume: () => { void a.play(); } };
  }
}

/** The empty manifest: no recordings shipped yet — every utterance falls back to the browser voice. */
export const EMPTY_MANIFEST: AudioManifest = { pl: {}, en: {} };
