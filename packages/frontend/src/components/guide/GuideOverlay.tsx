import type React from 'react';
import type { GuideLang, GuideLevel } from '../../core/guide/narrationModel';
import type { GuideSession } from '../../core/guide/guideMachine';
import type { VoiceSettings, VoiceState } from '../../core/guide/voiceEngine';

/**
 * GuideOverlay — the guide's bar (D-119): the current line as a caption
 * (always available, also with the voice off), transport (back / pause /
 * repeat / next), "explain it simpler", audience level, language, volume,
 * voice on/off, close. It renders exactly the text it is handed.
 */
export interface GuideOverlayProps {
  readonly session: GuideSession;
  readonly caption: string | null;
  readonly voiceState: VoiceState;
  readonly settings: VoiceSettings;
  readonly level: GuideLevel;
  readonly plain: boolean;
  readonly canNext: boolean;
  readonly canBack: boolean;
  readonly nextLabel: string;
  readonly voiceSource: string | null;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onRepeat: () => void;
  readonly onPauseResume: () => void;
  readonly onTogglePlain: () => void;
  readonly onLevel: (level: GuideLevel) => void;
  readonly onLang: (lang: GuideLang) => void;
  readonly onVolume: (v: number) => void;
  readonly onToggleVoice: () => void;
  readonly onClose: () => void;
  readonly extra?: React.ReactNode;
}

const LEVEL_LABEL: Record<GuideLevel, { pl: string; en: string }> = {
  EXPLORER: { pl: 'Odkrywca', en: 'Explorer' },
  SCIENTIST: { pl: 'Naukowiec', en: 'Scientist' },
  AUDITOR: { pl: 'Audytor', en: 'Auditor' },
};

export function GuideOverlay(p: GuideOverlayProps): React.ReactElement {
  const pl = p.settings.lang === 'pl';
  const paused = p.voiceState === 'PAUSED';
  return (
    <div className={`guide guide-${p.session.mode.toLowerCase()}`} role="region" aria-label={pl ? 'Przewodnik Genesis' : 'Genesis guide'} data-testid="guide-overlay">
      <div className="guide-head">
        <span className="guide-mark" aria-hidden="true">✦</span>
        <span className="guide-title">{p.session.mode === 'TOUR' ? 'Genesis Tour' : (pl ? 'Przewodnik' : 'Guide')}</span>
        <span className="guide-state" data-testid="guide-state">{p.session.state.toLowerCase().replace(/_/g, ' ')}</span>
        {p.voiceSource !== null && <span className="guide-source">{pl ? 'głos' : 'voice'}: {p.voiceSource === 'recording' ? (pl ? 'nagranie' : 'recording') : (pl ? 'przeglądarka' : 'browser')}</span>}
        <button type="button" className="guide-close" onClick={p.onClose} aria-label={pl ? 'Zamknij przewodnik' : 'Close guide'}>✕</button>
      </div>
      {p.settings.captions && (
        <p className={`guide-caption${p.plain ? ' guide-caption-plain' : ''}`} aria-live="polite" data-testid="guide-caption">
          {p.caption ?? ''}
        </p>
      )}
      {p.extra}
      <div className="guide-controls">
        <button type="button" className="chip-btn" onClick={p.onBack} disabled={!p.canBack}>◀ {pl ? 'Wstecz' : 'Back'}</button>
        <button type="button" className="chip-btn" onClick={p.onPauseResume} disabled={p.voiceState === 'OFF' || p.voiceState === 'READY'} aria-label={paused ? (pl ? 'Wznów' : 'Resume') : (pl ? 'Pauza' : 'Pause')}>{paused ? '▶' : '⏸'}</button>
        <button type="button" className="chip-btn" onClick={p.onRepeat} disabled={p.voiceState === 'OFF'}>↻ {pl ? 'Powtórz' : 'Repeat'}</button>
        <button type="button" className="chip-btn primary" onClick={p.onNext} disabled={!p.canNext} data-testid="guide-next">{p.nextLabel}</button>
        <button type="button" className={`chip-btn${p.plain ? ' active' : ''}`} onClick={p.onTogglePlain} aria-pressed={p.plain} data-testid="guide-plain">{pl ? 'Wyjaśnij prościej' : 'Explain simpler'}</button>
      </div>
      <div className="guide-settings">
        <div className="guide-levels" role="radiogroup" aria-label={pl ? 'Poziom szczegółów' : 'Level of detail'}>
          {(['EXPLORER', 'SCIENTIST', 'AUDITOR'] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={p.level === l} className={`chip-btn tiny${p.level === l ? ' active' : ''}`} onClick={() => p.onLevel(l)}>{LEVEL_LABEL[l][p.settings.lang]}</button>
          ))}
        </div>
        <div className="guide-lang" role="radiogroup" aria-label={pl ? 'Język' : 'Language'}>
          {(['pl', 'en'] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={p.settings.lang === l} className={`chip-btn tiny${p.settings.lang === l ? ' active' : ''}`} onClick={() => p.onLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
        <label className="guide-volume">
          <span>{pl ? 'Głośność' : 'Volume'}</span>
          <input type="range" min={0} max={1} step={0.05} value={p.settings.volume} onChange={(e) => p.onVolume(Number(e.target.value))} aria-label={pl ? 'Głośność przewodnika' : 'Guide volume'} />
        </label>
        <button type="button" className={`chip-btn tiny${p.settings.enabled ? ' active' : ''}`} onClick={p.onToggleVoice} aria-pressed={p.settings.enabled} data-testid="guide-voice-toggle">
          {p.settings.enabled ? (pl ? '🔊 Głos włączony' : '🔊 Voice on') : (pl ? '🔇 Głos wyłączony' : '🔇 Voice off')}
        </button>
      </div>
    </div>
  );
}
