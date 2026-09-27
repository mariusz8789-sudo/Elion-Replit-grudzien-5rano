import { useRef } from 'react';
import { useFocusTrap } from '../core/useFocusTrap';
import { track } from '../core/analytics';

/**
 * Pierwsze uruchomienie wyjaśnia produkt na jednym ekranie. Nie uczy
 * wewnętrznych modułów ani kontrolek: pokazuje jedną drogę od pytania do
 * odtwarzalnego wyniku i prowadzi do istniejącego Laboratorium.
 */
export function OnboardingOverlay({ onFinish }: { onFinish: (destination: 'laboratory' | 'home') => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  const finish = (destination: 'laboratory' | 'home') => {
    track('onboarding_finished');
    onFinish(destination);
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Wprowadzenie do Genesis OS">
      <span className="onboarding-brand">Genesis Physics</span>
      <span className="hud-corner hud-tl" aria-hidden="true" />
      <span className="hud-corner hud-tr" aria-hidden="true" />
      <span className="hud-corner hud-bl" aria-hidden="true" />
      <span className="hud-corner hud-br" aria-hidden="true" />
      <div className="onboarding-panel" ref={panelRef}>
        <button className="onboarding-skip" onClick={() => finish('home')}>
          Pomiń →
        </button>

        <ProductIntroduction onStart={() => finish('laboratory')} onGoHome={() => finish('home')} />
      </div>
    </div>
  );
}

function ProductIntroduction({ onStart, onGoHome }: { onStart: () => void; onGoHome: () => void }) {
  return (
    <div className="onboarding-step">
      <span className="onboarding-kicker">ONE CHAT · ONE LABORATORY</span>
      <h2>Zadajesz pytanie. Genesis przygotowuje eksperyment.</h2>
      <p>
        Nie musisz wybierać silnika ani szukać modułu. Genesis prowadzi jedną
        sesję od pytania do wyniku, dowodu i powtórzenia.
      </p>
      <ol className="onboarding-flow" aria-label="Przebieg pracy Genesis">
        <li><span>1</span><strong>Pytanie</strong><small>Opisz cel zwykłym językiem.</small></li>
        <li><span>2</span><strong>Laboratorium</strong><small>Genesis wybiera obsługiwany model.</small></li>
        <li><span>3</span><strong>Wynik</strong><small>Obserwujesz rzeczywiste wykonanie modelu.</small></li>
        <li><span>4</span><strong>Evidence + replay</strong><small>Sprawdzasz pochodzenie i powtarzalność.</small></li>
      </ol>
      <div className="onboarding-truth" aria-label="Rodzaje doświadczeń">
        <span><b>LIVE COMPUTATIONAL</b> prawdziwe obliczenie</span>
        <span><b>EDUCATIONAL MODEL</b> procedura edukacyjna</span>
        <span><b>REAL OBSERVATION</b> wyłącznie dane zewnętrzne lub pomiar</span>
      </div>
      <button className="chip-btn onboarding-start-btn" onClick={onStart} autoFocus>
        Wejdź do Laboratorium →
      </button>
      <button className="onboarding-later" onClick={onGoHome}>
        Najpierw zadaj własne pytanie
      </button>
    </div>
  );
}
