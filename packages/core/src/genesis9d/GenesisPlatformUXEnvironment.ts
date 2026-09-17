import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const UX_DISCLAIMER = 'Session/UX state manager only: no audio playback, no file IO, no network. Ambient track configs reference public-domain classical works.';
export interface Attachment { readonly id: string; readonly kind: 'ZIP' | 'PDF'; readonly name: string; readonly sizeBytes: number; readonly sha256: string; readonly parsedEntries: readonly string[]; }
export interface MusicTrack { readonly id: string; readonly title: string; readonly composer: string; readonly bpm: number; readonly baseFreqHz: number; readonly volumeDb: number; }
export const AMBIENT_TRACKS: readonly MusicTrack[] = [
  { id: 'TR-SATIE', title: 'Gymnopédie No.1', composer: 'Erik Satie (public domain)', bpm: 60, baseFreqHz: 220, volumeDb: -24 },
  { id: 'TR-DEBUSSY', title: 'Clair de Lune', composer: 'Claude Debussy (public domain)', bpm: 66, baseFreqHz: 246.94, volumeDb: -26 },
  { id: 'TR-BACH', title: 'Air on the G String', composer: 'J.S. Bach (public domain)', bpm: 58, baseFreqHz: 196, volumeDb: -25 },
];
export interface IconState { readonly id: string; readonly glyph: string; readonly label: string; readonly tone: 'POSITIVE'; }
export const POSITIVE_ICONS: readonly IconState[] = [
  { id: 'IC-PEACE', glyph: '☮', label: 'Pokój', tone: 'POSITIVE' }, { id: 'IC-LEAF', glyph: '🌿', label: 'Wzrost', tone: 'POSITIVE' },
  { id: 'IC-STAR', glyph: '✦', label: 'Nadzieja', tone: 'POSITIVE' }, { id: 'IC-HAND', glyph: '🤝', label: 'Współpraca', tone: 'POSITIVE' },
];
export interface OptionItem { readonly id: string; readonly label: string; readonly group: 'GOVERNMENT' | 'AGENT'; }
export const NAV_OPTIONS: readonly OptionItem[] = [
  { id: 'OP-OPEN', label: 'Otwarta nawigacja', group: 'GOVERNMENT' }, { id: 'OP-AUDIT', label: 'Tryb audytu', group: 'GOVERNMENT' },
  { id: 'OP-FREE', label: 'Wolna wola agenta', group: 'AGENT' }, { id: 'O-ASSIST', label: 'Asysta deterministyczna', group: 'AGENT' },
];
export interface UXState { readonly attachments: readonly Attachment[]; readonly currentTrackId: string | null; readonly playing: boolean; readonly volumeDb: number; readonly selectedOptionId: string | null; readonly playlistOrder: readonly string[]; }
export class GenesisPlatformUXEnvironment {
  private attachments: Attachment[] = []; private currentTrackId: string | null = null; private playing = false; private volumeDb = -24; private selectedOptionId: string | null = null; private seq = 0;
  constructor(private clock: Clock, private seed: number) {}
  addAttachment(kind: 'ZIP' | 'PDF', name: string, sizeBytes: number, sha: string): Attachment {
    const rng = mulberry32(this.seed ^ parseInt(sha.slice(0, 8), 16));
    const entries = kind === 'ZIP' ? ['manifest.json', 'data/epoch.csv', 'docs/notes.pdf'] : ['page-1', 'page-2', 'page-3'];
    const a: Attachment = { id: 'ATT-' + (this.seq++), kind, name, sizeBytes, sha256: sha, parsedEntries: entries.map(e => e + '#' + Math.floor(rng() * 9999)) };
    this.attachments.push(a); return a;
  }
  removeAttachment(id: string): void { this.attachments = this.attachments.filter(a => a.id !== id); }
  setTrack(id: string): void { if (AMBIENT_TRACKS.some(t => t.id === id)) this.currentTrackId = id; }
  togglePlay(): void { this.playing = !this.playing; }
  setVolume(db: number): void { this.volumeDb = Math.min(-12, Math.max(-36, db)); }
  selectOption(id: string): void { if (NAV_OPTIONS.some(o => o.id === id)) this.selectedOptionId = id; }
  playlistOrder(): readonly string[] { const rng = mulberry32(this.seed); return [...AMBIENT_TRACKS].map(t => ({ id: t.id, k: rng() })).sort((a, b) => a.k - b.k).map(x => x.id); }
  state(): UXState { return { attachments: this.attachments, currentTrackId: this.currentTrackId, playing: this.playing, volumeDb: this.volumeDb, selectedOptionId: this.selectedOptionId, playlistOrder: this.playlistOrder() }; }
  fingerprint(): string { return sha256hex(stableStringify(this.state())); }
  disclaimer(): string { return UX_DISCLAIMER; }
}
