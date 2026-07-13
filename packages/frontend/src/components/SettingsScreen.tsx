import { useState } from 'react';
import { useSettings } from '../core/useSettings';
import { getCounters, clearAnalytics, type AnalyticsEvent } from '../core/analytics';
import { getVisitedCount, getLogState, ACHIEVEMENTS } from '../core/discoveryLog';
import { clearAll } from '../core/storage';
import { AccountPanel } from './AccountPanel';

const EVENT_LABELS: Record<AnalyticsEvent, string> = {
  experiment_open: 'Otwarte eksperymenty',
  ask_ai_used: 'Pytania do AI',
  search_used: 'Użycia wyszukiwarki',
  shortcut_used: 'Użycia skrótów klawiszowych',
  discovery_log_viewed: 'Wizyty w dzienniku odkryć',
  glossary_viewed: 'Wizyty w słowniczku',
  custom_experiment_run: 'Uruchomione własne eksperymenty',
  custom_experiment_saved: 'Zapisane własne eksperymenty',
  what_if_opened: 'Otwarte scenariusze „Co by było, gdyby?"',
  onboarding_finished: 'Ukończone wprowadzenie',
};

/**
 * Ustawienia — w całości lokalne (localStorage), zero backendu. Trzy grupy:
 * dostępność (wpływa realnie na CSS przez applyDocumentFlags), Twoja
 * aktywność (podgląd analytics.ts — celowo przezroczysty, użytkownik widzi
 * dokładnie to, co jest zliczane) i skróty klawiszowe (dokumentacja).
 */
export function SettingsScreen({ onReplayOnboarding }: { onReplayOnboarding?: () => void }) {
  const [settings, updateSettings] = useSettings();
  const [counters, setCounters] = useState(getCounters);
  const [logSummary, setLogSummary] = useState(() => ({
    ...getVisitedCount(),
    unlocked: getLogState().unlocked.length,
    total: ACHIEVEMENTS.length,
  }));

  const handleClearAnalytics = () => {
    clearAnalytics();
    setCounters(getCounters());
  };

  const handleClearAll = () => {
    if (!window.confirm('To usunie wszystkie lokalne dane: ustawienia, dziennik odkryć i statystyki aktywności. Kontynuować?')) {
      return;
    }
    clearAll();
    setCounters({});
    setLogSummary({ visited: 0, totalLabs: logSummary.totalLabs, unlocked: 0, total: ACHIEVEMENTS.length });
    window.location.reload();
  };

  const counterEntries = Object.entries(counters) as [AnalyticsEvent, number][];

  return (
    <main className="settings-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <h2>Konto (chmura)</h2>
        <p className="settings-hint">
          Opcjonalne konto odblokowuje współdzielone Projekty i trwałe, reprodukowalne Serie Prób na serwerze —
          zobacz zakładkę „Projekty" na ekranie głównym. Bez logowania Genesis OS działa w pełni lokalnie (offline).
        </p>
        <AccountPanel />
      </section>

      <section className="settings-section">
        <h2>Dostępność</h2>
        <div className="control toggle-row">
          <span>Ogranicz animacje</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.reducedMotion}
            aria-label="Ogranicz animacje"
            onClick={() => updateSettings({ reducedMotion: !settings.reducedMotion })}
          />
        </div>
        <div className="control toggle-row">
          <span>Wysoki kontrast</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.highContrast}
            aria-label="Wysoki kontrast"
            onClick={() => updateSettings({ highContrast: !settings.highContrast })}
          />
        </div>
        <div className="control toggle-row">
          <span>Kompaktowy Narrator</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.compactNarrator}
            aria-label="Kompaktowy Narrator"
            onClick={() => updateSettings({ compactNarrator: !settings.compactNarrator })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h2>Dźwięk</h2>
        <div className="control toggle-row">
          <span>Dźwięki interfejsu</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.soundEnabled}
            aria-label="Dźwięki interfejsu"
            onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
          />
        </div>
        <p className="settings-hint">
          Krótkie, ciche dźwięki potwierdzające: wejście do laboratorium, start/pauza symulacji, odblokowana
          odznaka, przejście epoki w Discovery Timeline, odpowiedź Narratora AI. Zero muzyki, zero pętli.
        </p>
      </section>

      <section className="settings-section">
        <h2>Prywatność</h2>
        <div className="control toggle-row">
          <span>Lokalna statystyka aktywności</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.analyticsEnabled}
            aria-label="Lokalna statystyka aktywności"
            onClick={() => updateSettings({ analyticsEnabled: !settings.analyticsEnabled })}
          />
        </div>
        <p className="settings-hint">
          Te liczniki nigdy nie opuszczają Twojego urządzenia — nie ma żadnego serwera analitycznego. Służą wyłącznie
          do panelu poniżej.
        </p>
      </section>

      <section className="settings-section">
        <h2>Twoja aktywność</h2>
        {counterEntries.length === 0 ? (
          <p className="settings-hint">Jeszcze nic nie zliczono w tej sesji.</p>
        ) : (
          <div className="stat-list">
            {counterEntries.map(([event, count]) => (
              <div className="stat-row" key={event}>
                <span>{EVENT_LABELS[event] ?? event}</span>
                <span className="val">{count}</span>
              </div>
            ))}
          </div>
        )}
        <div className="stat-row">
          <span>Laboratoria odwiedzone</span>
          <span className="val">{logSummary.visited} / {logSummary.totalLabs}</span>
        </div>
        <div className="stat-row">
          <span>Odznaki odblokowane</span>
          <span className="val">{logSummary.unlocked} / {logSummary.total}</span>
        </div>
        <button className="chip-btn" onClick={handleClearAnalytics}>Wyczyść statystykę aktywności</button>
      </section>

      {onReplayOnboarding && (
        <section className="settings-section">
          <h2>Wprowadzenie</h2>
          <p className="settings-hint">
            Krótkie, interaktywne wprowadzenie pokazywane automatycznie przy pierwszym uruchomieniu. Możesz je
            obejrzeć ponownie w każdej chwili — nie wpływa to na Twój zapisany postęp.
          </p>
          <button className="chip-btn" onClick={onReplayOnboarding}>🔁 Pokaż wprowadzenie ponownie</button>
        </section>
      )}

      <section className="settings-section">
        <h2>Skróty klawiszowe</h2>
        <ShortcutsList />
      </section>

      <section className="settings-section">
        <h2>Dane lokalne</h2>
        <p className="settings-hint">
          Domyślnie wszystko (ustawienia, dziennik odkryć, statystyka aktywności, próby lokalne) mieszka w
          localStorage tej przeglądarki — bez konta i bez serwera. Trwałe Projekty w chmurze (po zalogowaniu) to
          osobna, opcjonalna warstwa; ten przycisk czyści tylko dane lokalne.
        </p>
        <button className="chip-btn danger" onClick={handleClearAll}>Wyczyść wszystkie dane lokalne</button>
      </section>
    </main>
  );
}

export function ShortcutsList() {
  return (
    <div className="shortcuts-list">
      <div className="shortcut-row"><kbd>Spacja</kbd><span>Pauza / start symulacji</span></div>
      <div className="shortcut-row"><kbd>R</kbd><span>Reset symulacji</span></div>
      <div className="shortcut-row"><kbd>/</kbd><span>Szukaj laboratorium lub eksperymentu</span></div>
      <div className="shortcut-row"><kbd>?</kbd><span>Pokaż tę listę skrótów</span></div>
      <div className="shortcut-row"><kbd>Esc</kbd><span>Zamknij okno wyszukiwania / pomocy</span></div>
    </div>
  );
}
