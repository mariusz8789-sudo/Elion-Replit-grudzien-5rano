import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, getLogState, getVisitedCount } from '../core/discoveryLog';
import { getLab } from '../core/registry';
import { track } from '../core/analytics';

/**
 * Dziennik odkryć: postęp zwiedzania (odwiedzone laboratoria) + odznaki
 * odblokowane przez realne progi fizyczne wyliczone przez symulacje.
 * Czysty odczyt localStorage przy montażu — ekran nie nasłuchuje symulacji
 * na żywo (te działają tylko wewnątrz otwartego laboratorium).
 */
export function DiscoveryLogScreen() {
  const [state] = useState(getLogState);
  const [visited] = useState(getVisitedCount);

  useEffect(() => {
    track('discovery_log_viewed');
  }, []);

  return (
    <main className="discovery-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <div className="stat-row">
          <span>Laboratoria odwiedzone</span>
          <span className="val">{visited.visited} / {visited.totalLabs}</span>
        </div>
        <div className="stat-row">
          <span>Odznaki odblokowane</span>
          <span className="val">{state.unlocked.length} / {ACHIEVEMENTS.length}</span>
        </div>
      </section>

      <section className="settings-section">
        <h2>Odznaki</h2>
        <div className="achv-grid">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = state.unlocked.includes(a.id);
            const lab = getLab(a.labId);
            const at = state.unlockedAt[a.id];
            return (
              <div className={`achv-card ${unlocked ? 'unlocked' : 'locked'}`} key={a.id}>
                <span className="achv-icon" aria-hidden="true">{unlocked ? '🏆' : '🔒'}</span>
                <div className="achv-body">
                  <div className="achv-title">{unlocked ? a.title : '???'}</div>
                  <div className="achv-desc">
                    {unlocked ? a.description : `Odznaka do odkrycia w: ${lab ? `${lab.icon} ${lab.name}` : a.labId}`}
                  </div>
                  {unlocked && at && (
                    <div className="achv-at">Odblokowano {new Date(at).toLocaleDateString('pl-PL')}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {visited.visited === 0 && (
        <p className="empty-state">Jeszcze nie odwiedziłeś żadnego laboratorium — zacznij od strony głównej.</p>
      )}
    </main>
  );
}
