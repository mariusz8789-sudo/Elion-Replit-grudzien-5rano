import { useEffect, useState } from 'react';
import { BrowserSpeechProvider, EMPTY_MANIFEST, PrerenderedAudioProvider, VoiceEngine, normalizeManifest, type AudioManifest } from './voiceEngine';

/**
 * The ONE voice engine of the app (D-119). Providers in order: pre-rendered
 * recordings (manifest at /voice/manifest.json, absent until premium
 * recordings ship — then nothing else changes), then the browser's own
 * speech synthesis. Created lazily on first use so a page that never opens
 * the guide never touches speechSynthesis.
 */
let engine: VoiceEngine | null = null;
let manifest: AudioManifest = EMPTY_MANIFEST;
let manifestLoaded = false;

export function getVoiceEngine(): VoiceEngine {
  if (engine === null) {
    const storage = typeof window !== 'undefined' ? safeStorage() : null;
    engine = new VoiceEngine([new PrerenderedAudioProvider({ get pl() { return manifest.pl; }, get en() { return manifest.en; } }), new BrowserSpeechProvider()], storage);
    if (!manifestLoaded && typeof fetch === 'function') {
      manifestLoaded = true;
      // Recordings come from scripts/genesis_tts.py → public/audio/manifest.json (served at /audio/).
      fetch('/audio/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m: unknown) => {
        if (m !== null) manifest = normalizeManifest(m, '/audio/');
      }).catch(() => { /* no recordings shipped: browser voice stays */ });
    }
  }
  return engine;
}

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** React binding: re-renders on every engine state/settings change. */
export function useVoiceEngine(): VoiceEngine {
  const e = getVoiceEngine();
  const [, bump] = useState(0);
  useEffect(() => e.subscribe(() => bump((n) => n + 1)), [e]);
  return e;
}

/** Test seam. */
export function resetVoiceEngineForTests(): void { engine = null; manifestLoaded = false; manifest = EMPTY_MANIFEST; }
