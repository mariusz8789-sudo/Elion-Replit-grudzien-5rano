import { useEffect, useRef, useState } from 'react';
import type React from 'react';

/**
 * 🎙 Ask Genesis — dictate a question where the browser offers speech
 * recognition (Chrome, Safari); renders nothing where it does not, so the
 * text field is always the honest fallback. Recognised text is handed to the
 * caller; nothing is sent anywhere by this component.
 */
type RecognitionLike = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void;
};

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AskGenesisMic({ lang, onText, className }: { readonly lang: 'pl' | 'en'; readonly onText: (text: string) => void; readonly className?: string }): React.ReactElement | null {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<RecognitionLike | null>(null);
  useEffect(() => { setSupported(recognitionCtor() !== null); }, []);
  if (!supported) return null;
  const toggle = (): void => {
    if (listening) { rec.current?.stop(); return; }
    const Ctor = recognitionCtor();
    if (Ctor === null) return;
    const r = new Ctor();
    r.lang = lang === 'pl' ? 'pl-PL' : 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (ev) => { const t = ev.results[0]?.[0]?.transcript ?? ''; if (t.trim()) onText(t.trim()); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };
  return (
    <button type="button" className={`${className ?? 'chip-btn'} ask-mic${listening ? ' ask-mic-on' : ''}`} onClick={toggle} aria-pressed={listening} aria-label={lang === 'pl' ? 'Powiedz pytanie' : 'Say your question'} title={lang === 'pl' ? 'Powiedz pytanie' : 'Say your question'}>
      🎙
    </button>
  );
}
