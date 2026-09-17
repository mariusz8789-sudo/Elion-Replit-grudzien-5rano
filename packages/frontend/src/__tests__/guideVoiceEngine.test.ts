import { describe, expect, it } from 'vitest';
import { BrowserSpeechProvider, DEFAULT_VOICE_SETTINGS, EMPTY_MANIFEST, PrerenderedAudioProvider, VoiceEngine, loadVoiceSettings, normalizeManifest, pickVoice, saveVoiceSettings, type SpeechHandle, type StorageLike, type Utterance, type VoiceProvider, type VoiceSettings } from '../core/guide/voiceEngine';

/** A recording provider double: remembers what it was asked to say and lets the test end the utterance. */
function fakeProvider(name: string, accepts: (u: Utterance) => boolean = () => true) {
  const spoken: Utterance[] = [];
  const events: string[] = [];
  let end: (() => void) | null = null;
  const provider: VoiceProvider = {
    name,
    available: () => true,
    speak(u, _s, onEnd) {
      if (!accepts(u)) return null;
      spoken.push(u); end = onEnd;
      const h: SpeechHandle = { cancel: () => events.push('cancel'), pause: () => events.push('pause'), resume: () => events.push('resume') };
      return h;
    },
  };
  return { provider, spoken, events, finish: () => { end?.(); } };
}

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

const U: Utterance = { key: 'intro', text: 'Witaj w Genesis.', lang: 'pl' };

describe('VoiceEngine state machine', () => {
  it('READY → SPEAKING → READY on end; pause/resume; stop cancels', () => {
    const p = fakeProvider('fake');
    const e = new VoiceEngine([p.provider]);
    expect(e.state).toBe('READY');
    expect(e.speak(U)).toBe(true);
    expect(e.state).toBe('SPEAKING');
    e.pause(); expect(e.state).toBe('PAUSED');
    e.resume(); expect(e.state).toBe('SPEAKING');
    p.finish(); expect(e.state).toBe('READY');
    e.speak(U); e.stop();
    expect(e.state).toBe('READY');
    expect(p.events).toEqual(['pause', 'resume', 'cancel']);
  });

  it('disabling turns the voice OFF and refuses to speak; enabling brings it back; repeat re-speaks the last utterance', () => {
    const p = fakeProvider('fake');
    const e = new VoiceEngine([p.provider]);
    e.update({ enabled: false });
    expect(e.state).toBe('OFF');
    expect(e.speak(U)).toBe(false);
    e.update({ enabled: true });
    expect(e.state).toBe('READY');
    expect(e.repeat()).toBe(true);
    expect(p.spoken.length).toBe(1);
  });

  it('a new utterance cancels the previous one — one voice at a time', () => {
    const p = fakeProvider('fake');
    const e = new VoiceEngine([p.provider]);
    e.speak(U); e.speak({ ...U, key: 'ask' });
    expect(p.events).toEqual(['cancel']);
    expect(p.spoken.map((u) => u.key)).toEqual(['intro', 'ask']);
  });

  it('providers are tried in order: a recording that steps aside falls back to the browser voice', () => {
    const rec = fakeProvider('recording', (u) => u.key === 'intro');
    const browser = fakeProvider('browser');
    const e = new VoiceEngine([rec.provider, browser.provider]);
    e.speak(U); expect(e.lastProvider).toBe('recording');
    e.speak({ ...U, key: 'ask' }); expect(e.lastProvider).toBe('browser');
    expect(browser.spoken.map((u) => u.key)).toEqual(['ask']);
  });

  it('settings persist through the injected storage and clamp bad values', () => {
    const storage = memoryStorage();
    const e = new VoiceEngine([fakeProvider('fake').provider], storage);
    e.update({ volume: 0.4, lang: 'en' });
    const again = loadVoiceSettings(storage);
    expect(again.volume).toBe(0.4); expect(again.lang).toBe('en');
    saveVoiceSettings(storage, { ...DEFAULT_VOICE_SETTINGS, volume: 9, rate: 0.1 } as VoiceSettings);
    const clamped = loadVoiceSettings(storage);
    expect(clamped.volume).toBe(1); expect(clamped.rate).toBe(0.7);
    storage.data['genesis.voiceGuide.v1'] = '{not json';
    expect(loadVoiceSettings(storage)).toEqual(DEFAULT_VOICE_SETTINGS);
  });
});

describe('providers', () => {
  it('pickVoice prefers a premium local voice of the right language and returns null when none matches', () => {
    const v = (name: string, lang: string, localService = false, def = false) => ({ name, lang, localService, default: def, voiceURI: name }) as SpeechSynthesisVoice;
    const voices = [v('Alex', 'en-US'), v('Zosia (Enhanced)', 'pl-PL', true), v('Google polski', 'pl-PL'), v('Ewa', 'pl-PL')];
    expect(pickVoice(voices, 'pl')!.name).toBe('Zosia (Enhanced)');
    expect(pickVoice(voices, 'en')!.name).toBe('Alex');
    expect(pickVoice([v('Alex', 'en-US')], 'pl')).toBeNull();
  });

  it('the browser provider reports unavailable outside a browser and never throws', () => {
    const p = new BrowserSpeechProvider(null);
    expect(p.available()).toBe(false);
    expect(p.speak(U, DEFAULT_VOICE_SETTINGS, () => {})).toBeNull();
  });

  it('the recording provider plays only what the manifest lists, honours volume, and steps aside otherwise', () => {
    const made: { src: string; volume: number; played: number; paused: number }[] = [];
    const p = new PrerenderedAudioProvider({ pl: { intro: { src: '/audio/genesis_intro_pl.mp3', text: U.text } }, en: {} }, (src) => {
      const a = { src, volume: 1, playbackRate: 1, currentTime: 0, onended: null as ((ev: Event) => void) | null, onerror: null as ((ev: Event | string) => void) | null, played: 0, paused: 0, play() { this.played++; }, pause() { this.paused++; } };
      made.push(a); return a;
    });
    const h = p.speak(U, { ...DEFAULT_VOICE_SETTINGS, volume: 0.3 }, () => {});
    expect(h).not.toBeNull();
    expect(made[0]!.src).toBe('/audio/genesis_intro_pl.mp3');
    expect(made[0]!.volume).toBe(0.3);
    expect(made[0]!.played).toBe(1);
    expect(p.speak({ ...U, key: 'ask' }, DEFAULT_VOICE_SETTINGS, () => {})).toBeNull();
    expect(new PrerenderedAudioProvider(EMPTY_MANIFEST).speak(U, DEFAULT_VOICE_SETTINGS, () => {})).toBeNull();
  });
});

describe('recordings are bound to their sentence', () => {
  it('a recording whose text differs from what the model says now is skipped (the browser speaks the true sentence)', () => {
    const p = new PrerenderedAudioProvider({ pl: { intro: { src: '/audio/x.mp3', text: 'Stare zdanie z innego przebiegu.' } }, en: {} }, () => { throw new Error('must not be constructed'); });
    expect(p.speak(U, DEFAULT_VOICE_SETTINGS, () => {})).toBeNull();
  });

  it('normalizeManifest accepts the generator\'s array form and the object form, drops entries without text', () => {
    const m = normalizeManifest([
      { id: 'intro:EXPLORER', lang: 'pl', file: 'genesis_intro_pl.mp3', text: 'Witaj.' },
      { id: 'intro:EXPLORER', lang: 'en', file: 'genesis_intro_en.mp3', text: 'Welcome.' },
      { id: 'no-text', lang: 'pl', file: 'x.mp3' },
      { id: 'bad-lang', lang: 'de', file: 'y.mp3', text: 'Hallo' },
    ]);
    expect(m.pl['intro:EXPLORER']).toEqual({ src: '/audio/genesis_intro_pl.mp3', text: 'Witaj.' });
    expect(m.en['intro:EXPLORER']!.src).toBe('/audio/genesis_intro_en.mp3');
    expect(m.pl['no-text']).toBeUndefined();
    const o = normalizeManifest({ pl: { a: { src: '/a.mp3', text: 'A' } }, en: { b: { src: '/b.mp3' } } });
    expect(o.pl.a).toEqual({ src: '/a.mp3', text: 'A' });
    expect(o.en.b).toBeUndefined();
    expect(normalizeManifest(null)).toEqual(EMPTY_MANIFEST);
  });
});
