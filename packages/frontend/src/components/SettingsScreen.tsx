import { useState } from 'react';
import { useSettings } from '../core/useSettings';
import { getCounters, clearAnalytics, type AnalyticsEvent } from '../core/analytics';
import { getVisitedCount, getLogState, ACHIEVEMENTS } from '../core/discoveryLog';
import { clearAll } from '../core/storage';
import { AccountPanel } from './AccountPanel';
import { useI18n } from '../core/i18n';

/** Analytics event → its i18n label key (resolved at render so it follows the language). */
const EVENT_LABEL_KEYS: Record<AnalyticsEvent, string> = {
  experiment_open: 'set.ev.experiment_open',
  ask_ai_used: 'set.ev.ask_ai_used',
  search_used: 'set.ev.search_used',
  shortcut_used: 'set.ev.shortcut_used',
  discovery_log_viewed: 'set.ev.discovery_log_viewed',
  glossary_viewed: 'set.ev.glossary_viewed',
  custom_experiment_run: 'set.ev.custom_experiment_run',
  custom_experiment_saved: 'set.ev.custom_experiment_saved',
  what_if_opened: 'set.ev.what_if_opened',
  onboarding_finished: 'set.ev.onboarding_finished',
};

/**
 * Ustawienia — w całości lokalne (localStorage), zero backendu. Trzy grupy:
 * dostępność (wpływa realnie na CSS przez applyDocumentFlags), Twoja
 * aktywność (podgląd analytics.ts — celowo przezroczysty, użytkownik widzi
 * dokładnie to, co jest zliczane) i skróty klawiszowe (dokumentacja).
 */
export function SettingsScreen({ onReplayOnboarding }: { onReplayOnboarding?: () => void }) {
  const { t } = useI18n();
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
    if (!window.confirm(t('set.confirmClearAll'))) {
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
        <h2>{t('set.account.h')}</h2>
        <p className="settings-hint">{t('set.account.hint')}</p>
        <AccountPanel />
      </section>

      <section className="settings-section">
        <h2>{t('set.a11y.h')}</h2>
        <div className="control toggle-row">
          <span>{t('set.a11y.reduceMotion')}</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.reducedMotion}
            aria-label={t('set.a11y.reduceMotion')}
            onClick={() => updateSettings({ reducedMotion: !settings.reducedMotion })}
          />
        </div>
        <div className="control toggle-row">
          <span>{t('set.a11y.highContrast')}</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.highContrast}
            aria-label={t('set.a11y.highContrast')}
            onClick={() => updateSettings({ highContrast: !settings.highContrast })}
          />
        </div>
        <div className="control toggle-row">
          <span>{t('set.a11y.compactNarrator')}</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.compactNarrator}
            aria-label={t('set.a11y.compactNarrator')}
            onClick={() => updateSettings({ compactNarrator: !settings.compactNarrator })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h2>{t('set.sound.h')}</h2>
        <div className="control toggle-row">
          <span>{t('set.sound.ui')}</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.soundEnabled}
            aria-label={t('set.sound.ui')}
            onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
          />
        </div>
        <p className="settings-hint">{t('set.sound.hint')}</p>
      </section>

      <section className="settings-section">
        <h2>{t('set.privacy.h')}</h2>
        <div className="control toggle-row">
          <span>{t('set.privacy.localStats')}</span>
          <button
            className="switch"
            role="switch"
            aria-checked={settings.analyticsEnabled}
            aria-label={t('set.privacy.localStats')}
            onClick={() => updateSettings({ analyticsEnabled: !settings.analyticsEnabled })}
          />
        </div>
        <p className="settings-hint">{t('set.privacy.hint')}</p>
      </section>

      <section className="settings-section">
        <h2>{t('set.activity.h')}</h2>
        {counterEntries.length === 0 ? (
          <p className="settings-hint">{t('set.activity.empty')}</p>
        ) : (
          <div className="stat-list">
            {counterEntries.map(([event, count]) => (
              <div className="stat-row" key={event}>
                <span>{EVENT_LABEL_KEYS[event] ? t(EVENT_LABEL_KEYS[event]) : event}</span>
                <span className="val">{count}</span>
              </div>
            ))}
          </div>
        )}
        <div className="stat-row">
          <span>{t('set.activity.labsVisited')}</span>
          <span className="val">{logSummary.visited} / {logSummary.totalLabs}</span>
        </div>
        <div className="stat-row">
          <span>{t('set.activity.badges')}</span>
          <span className="val">{logSummary.unlocked} / {logSummary.total}</span>
        </div>
        <button className="chip-btn" onClick={handleClearAnalytics}>{t('set.activity.clear')}</button>
      </section>

      {onReplayOnboarding && (
        <section className="settings-section">
          <h2>{t('set.onb.h')}</h2>
          <p className="settings-hint">{t('set.onb.hint')}</p>
          <button className="chip-btn" onClick={onReplayOnboarding}>{t('set.onb.replay')}</button>
        </section>
      )}

      <section className="settings-section">
        <h2>{t('ovl.help.title')}</h2>
        <ShortcutsList />
      </section>

      <section className="settings-section">
        <h2>{t('set.local.h')}</h2>
        <p className="settings-hint">{t('set.local.hint')}</p>
        <button className="chip-btn danger" onClick={handleClearAll}>{t('set.local.clear')}</button>
      </section>
    </main>
  );
}

export function ShortcutsList() {
  const { t } = useI18n();
  return (
    <div className="shortcuts-list">
      <div className="shortcut-row"><kbd>{t('set.sc.spaceKey')}</kbd><span>{t('set.sc.space')}</span></div>
      <div className="shortcut-row"><kbd>R</kbd><span>{t('set.sc.reset')}</span></div>
      <div className="shortcut-row"><kbd>/</kbd><span>{t('ovl.search.aria')}</span></div>
      <div className="shortcut-row"><kbd>?</kbd><span>{t('set.sc.question')}</span></div>
      <div className="shortcut-row"><kbd>Esc</kbd><span>{t('set.sc.esc')}</span></div>
    </div>
  );
}
