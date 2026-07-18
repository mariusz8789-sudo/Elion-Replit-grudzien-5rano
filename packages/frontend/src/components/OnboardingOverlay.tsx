import { useRef, useState } from 'react';
import { useFocusTrap } from '../core/useFocusTrap';
import { track } from '../core/analytics';
import { useI18n } from '../core/i18n';

/**
 * Wprowadzenie przy pierwszym uruchomieniu — 4 krótkie, interaktywne kroki
 * zamiast ściany tekstu (patrz core/onboarding.ts dla trwałości "widziane").
 * Cel: w mniej niż 2 minuty użytkownik wie, czym jest Genesis OS, że
 * parametry są przeciągalne, że Narrator AI tłumaczy obserwacje, i gdzie
 * zacząć. Pomijalne w każdej chwili — pominięcie liczy się tak samo jak
 * ukończenie (patrz onFinish poniżej). Wszystkie napisy przez seam i18n.
 */
export function OnboardingOverlay({ onFinish }: { onFinish: (destination: 'timeline' | 'home') => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  const totalSteps = 4;
  const isLast = step === totalSteps - 1;

  const finish = (destination: 'timeline' | 'home') => {
    track('onboarding_finished');
    onFinish(destination);
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label={t('onb.aria.overlay')}>
      <span className="onboarding-brand">Genesis OS</span>
      <span className="hud-corner hud-tl" aria-hidden="true" />
      <span className="hud-corner hud-tr" aria-hidden="true" />
      <span className="hud-corner hud-bl" aria-hidden="true" />
      <span className="hud-corner hud-br" aria-hidden="true" />
      <div className="onboarding-panel" ref={panelRef}>
        <button className="onboarding-skip" onClick={() => finish('home')}>
          {t('onb.skip')}
        </button>

        {step === 0 && <StepWelcome />}
        {step === 1 && <StepInteractive />}
        {step === 2 && <StepNarrator />}
        {step === 3 && <StepStart onStart={() => finish('timeline')} onGoHome={() => finish('home')} />}

        <div className="onboarding-dots" aria-hidden="true">
          {Array.from({ length: totalSteps }, (_, i) => (
            <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
          ))}
        </div>

        {!isLast && (
          <div className="onboarding-nav">
            {step > 0 && (
              <button className="chip-btn" onClick={() => setStep((s) => s - 1)}>
                {t('onb.back')}
              </button>
            )}
            <button className="chip-btn onboarding-next" onClick={() => setStep((s) => s + 1)} autoFocus={step === 0}>
              {t('onb.next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepWelcome() {
  const { t } = useI18n();
  return (
    <div className="onboarding-step">
      <div className="onboarding-icons" aria-hidden="true">
        <span>🌌</span><span>⚛️</span><span>🧬</span><span>∑</span>
      </div>
      <h2>{t('onb.welcome.title')}</h2>
      <p>{t('onb.welcome.body')}</p>
    </div>
  );
}

function StepInteractive() {
  const { t } = useI18n();
  const [v, setV] = useState(30);
  return (
    <div className="onboarding-step">
      <h2>{t('onb.interactive.title')}</h2>
      <p>{t('onb.interactive.body')}</p>
      <div className="control onboarding-demo-control">
        <label>
          <span>{t('onb.interactive.param')}</span>
          <span className="val">{v}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={v}
          aria-label={t('onb.interactive.sliderAria')}
          onChange={(e) => setV(Number(e.target.value))}
        />
      </div>
      <div className="onboarding-demo-visual" aria-hidden="true">
        <span
          className="onboarding-demo-dot"
          style={{ transform: `scale(${0.4 + v / 80})`, opacity: 0.35 + v / 160 }}
        />
      </div>
    </div>
  );
}

function StepNarrator() {
  const { t } = useI18n();
  return (
    <div className="onboarding-step">
      <h2>{t('onb.narrator.title')}</h2>
      <p>{t('onb.narrator.body')}</p>
      <div className="nblock insight onboarding-narrator-demo">
        <div className="ntitle">{t('onb.narrator.exampleLabel')}</div>
        <div className="nbody">{t('onb.narrator.exampleBody')}</div>
      </div>
    </div>
  );
}

function StepStart({ onStart, onGoHome }: { onStart: () => void; onGoHome: () => void }) {
  const { t } = useI18n();
  return (
    <div className="onboarding-step">
      <h2>{t('onb.start.title')}</h2>
      <p>{t('onb.start.body')}</p>
      <button className="chip-btn onboarding-start-btn" onClick={onStart} autoFocus>
        {t('onb.start.cta')}
      </button>
      <button className="onboarding-later" onClick={onGoHome}>
        {t('onb.start.later')}
      </button>
    </div>
  );
}
