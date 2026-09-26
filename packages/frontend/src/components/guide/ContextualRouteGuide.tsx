import { useEffect, useMemo, useState } from 'react';
import { contextualGuideSteps, type ContextualGuideSurface } from '../../core/guide/contextualGuideContent';
import { useVoiceEngine } from '../../core/guide/guideRuntime';

const TITLE: Record<ContextualGuideSurface, string> = {
  CERN: 'CERN',
  CYBER: 'Cyber',
  GOVERNMENT: 'Government',
  MIRROR: 'Mirror',
  WORLD_DIRECTOR: 'World Director',
  VIRTUAL_LAB: 'Virtual Lab',
  CAMPAIGN: 'Campaign Lab',
  HUMAN_EXPLORER: 'Human Explorer',
};

export function ContextualRouteGuide({ surface }: { readonly surface: ContextualGuideSurface | null }): JSX.Element | null {
  const voice = useVoiceEngine();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [plain, setPlain] = useState(false);
  const steps = useMemo(() => surface ? contextualGuideSteps(surface) : [], [surface]);
  const step = steps[index] ?? null;
  const pl = voice.settings.lang === 'pl';
  const caption = step === null ? '' : plain ? (pl ? step.plainPl : step.plainEn) : (pl ? step.pl : step.en);

  useEffect(() => {
    setOpen(false);
    setIndex(0);
    setPlain(false);
    voice.stop();
  }, [surface]);

  if (surface === null || step === null) return null;

  const speak = (nextIndex = index, nextPlain = plain): void => {
    const next = steps[nextIndex];
    if (!next) return;
    const text = nextPlain
      ? (voice.settings.lang === 'pl' ? next.plainPl : next.plainEn)
      : (voice.settings.lang === 'pl' ? next.pl : next.en);
    voice.speak({ key: `context-${surface.toLowerCase()}-${next.key}-${nextPlain ? 'plain' : 'full'}`, text, lang: voice.settings.lang });
  };

  if (!open) {
    return (
      <button
        type="button"
        className="context-guide-launch chip-btn primary"
        data-testid="context-guide-start"
        onClick={() => { setOpen(true); speak(0, false); }}
      >
        ✦ {pl ? 'Uruchom przewodnika' : 'Start guide'}
      </button>
    );
  }

  return (
    <aside className="guide context-guide" role="region" aria-label={pl ? `Przewodnik: ${TITLE[surface]}` : `Guide: ${TITLE[surface]}`} data-testid="context-guide">
      <div className="guide-head">
        <span className="guide-mark" aria-hidden="true">✦</span>
        <span className="guide-title">{TITLE[surface]}</span>
        <span className="guide-state">{index + 1} / {steps.length}</span>
        {voice.lastProvider && <span className="guide-source">{pl ? 'głos' : 'voice'}: {voice.lastProvider}</span>}
        <button type="button" className="guide-close" aria-label={pl ? 'Zamknij przewodnik' : 'Close guide'} onClick={() => { voice.stop(); setOpen(false); }}>✕</button>
      </div>
      <p className={`guide-caption${plain ? ' guide-caption-plain' : ''}`} aria-live="polite" data-testid="context-guide-caption">{caption}</p>
      <div className="guide-controls">
        <button type="button" className="chip-btn" disabled={index === 0} onClick={() => { const next = index - 1; setIndex(next); speak(next); }}>◀ {pl ? 'Wstecz' : 'Back'}</button>
        <button type="button" className="chip-btn" onClick={() => { voice.repeat(); }}>↻ {pl ? 'Powtórz' : 'Repeat'}</button>
        <button type="button" className="chip-btn primary" disabled={index >= steps.length - 1} data-testid="context-guide-next" onClick={() => { const next = index + 1; setIndex(next); speak(next); }}>{pl ? 'Dalej' : 'Next'} ▶</button>
        <button type="button" className={`chip-btn${plain ? ' active' : ''}`} aria-pressed={plain} onClick={() => { const nextPlain = !plain; setPlain(nextPlain); speak(index, nextPlain); }}>{pl ? 'Wyjaśnij prościej' : 'Explain simpler'}</button>
        <button type="button" className={`chip-btn${voice.settings.enabled ? ' active' : ''}`} aria-pressed={voice.settings.enabled} data-testid="context-guide-voice-toggle" onClick={() => voice.update({ enabled: !voice.settings.enabled })}>
          {voice.settings.enabled ? (pl ? '🔊 Głos' : '🔊 Voice') : (pl ? '🔇 Bez głosu' : '🔇 Muted')}
        </button>
        <button type="button" className="chip-btn" onClick={() => voice.update({ lang: pl ? 'en' : 'pl' })}>{pl ? 'EN' : 'PL'}</button>
      </div>
    </aside>
  );
}
