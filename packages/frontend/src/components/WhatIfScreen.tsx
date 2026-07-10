import { useEffect } from 'react';
import { WHAT_IF_SCENARIOS } from '../data/whatIfScenarios';
import { getLab } from '../core/registry';
import { setPendingScenario } from '../core/scenarioBridge';
import { track } from '../core/analytics';
import { HONESTY_LABELS } from '../core/types';

/**
 * "Co by było, gdyby?" — punkt wejścia do dramatycznych pytań fizycznych.
 * Każda karta to NIE nowa symulacja: to nadpisanie parametrów już
 * istniejącego eksperymentu bazowego jednego laboratorium
 * (core/scenarioBridge.ts + data/whatIfScenarios.ts). Etykieta wiarygodności
 * na karcie (klasa .honesty, ta sama co HonestyBadge) pochodzi LIVE z
 * HonestyLevel tego laboratorium — nie jest osobno wpisywana, więc nie może
 * się z nią rozjechać.
 */
export function WhatIfScreen() {
  useEffect(() => {
    track('what_if_opened');
  }, []);

  return (
    <main className="whatif-view" id="main-content" tabIndex={-1}>
      <div className="whatif-intro">
        <p>
          Wybierz pytanie. Genesis OS nadstawi suwaki właściwego laboratorium na te wartości i uruchomi symulację —
          to te same, przetestowane modele fizyczne co reszta platformy, tylko od razu w dramatycznym ustawieniu.
        </p>
      </div>
      <div className="whatif-grid">
        {WHAT_IF_SCENARIOS.map((s) => {
          const lab = getLab(s.labId);
          if (!lab) return null;
          return (
            <button
              key={s.id}
              className="whatif-card"
              style={{ ['--accent' as string]: lab.accent }}
              onClick={() => {
                setPendingScenario(s.labId, s.params);
                track('what_if_opened');
                window.location.hash = `#/lab/${s.labId}`;
              }}
            >
              <span className="whatif-lab-tag">{lab.icon} {lab.name}</span>
              <span className="whatif-question">{s.question}</span>
              <span className="whatif-teaser">{s.teaser}</span>
              <span className={`honesty ${lab.honesty}`}>{HONESTY_LABELS[lab.honesty]}</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
