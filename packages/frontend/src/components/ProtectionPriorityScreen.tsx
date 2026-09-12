import { useState } from 'react';
import {
  PROTECTION_OBJECTIVES, runProtectionPriorityStudy,
  type ProtectionObjective, type ProtectionPriorityStudy,
} from '../core/discovery/protectionPriority';
import { NEUTRAL_COHORT_PROFILE, defineCohortProfile } from '../core/agents/cohortModel';

/**
 * „KOGO CHRONIĆ NAJPIERW?" — the multi-objective protection study.
 *
 * `core/discovery/protectionPriority.ts` was complete and tested and reached
 * by nothing, so the one result in this codebase that most directly refuses to
 * pretend was invisible: it runs each protection option as its own fully
 * evidenced discovery case and then reports a SEPARATE ranking per objective,
 * because "whom do we protect first" has no answer until you say what you are
 * minimising. Different objectives can crown different groups, and the module
 * records that conflict rather than hiding it behind one number.
 *
 * THIS SCREEN COMPUTES NOTHING. It picks the inputs, calls
 * `runProtectionPriorityStudy`, and renders what came back — including the
 * rejections, the conflict note and the limitations, which are the parts a
 * dishonest version of this screen would drop.
 *
 * WHY IT RUNS ON A CLICK, NOT ON MOUNT: each candidate is a full discovery
 * case (two arms, comparison gate, replay, evidence pack) and there are three
 * of them. Measured at these settings it is a few hundred milliseconds, but
 * spending it before the user has asked for anything would make the route feel
 * broken.
 */

const OBJECTIVE_LABEL: Readonly<Record<ProtectionObjective, string>> = {
  totalDeaths: 'zgony łącznie',
  peakInfectious: 'szczyt zakażonych',
  attackRate: 'attack rate',
  totalUnmetCareDays: 'dni nieudzielonej opieki',
  deaths_senior: 'zgony — seniorzy',
  deaths_adult: 'zgony — dorośli',
  deaths_child: 'zgony — dzieci',
  hospitalizedEver_senior: 'hospitalizowani — seniorzy',
};

/**
 * Two cohort profiles, because the answer genuinely depends on which one is
 * used and the module says so. NEUTRAL assumes no age gradient in severity at
 * all — so the study then measures only exposure and group size. The
 * illustrative gradient is DECLARED illustrative, not calibrated against any
 * real population: `defineCohortProfile` without a provenance argument marks
 * it UNCALIBRATED, and that marking is rendered below rather than hidden.
 */
const ILLUSTRATIVE_COHORT = defineCohortProfile('age-gradient-illustrative', {
  severityMultiplier: { child: 0.2, adult: 1, senior: 4 },
  fatalityMultiplier: { child: 0.1, adult: 1, senior: 6 },
});

const INITIAL_CONDITIONS = { nAgents: 260, initialInfected: 5, seed: 4242, days: 60, stepsPerDay: 4 };

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.abs(value) >= 100 || Number.isInteger(value) ? value.toFixed(0) : value.toFixed(4);
}

export function ProtectionPriorityScreen() {
  const [ageGradient, setAgeGradient] = useState(true);
  const [study, setStudy] = useState<ProtectionPriorityStudy | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (): void => {
    setBusy(true);
    // Synchronous and deliberately so — the study is a real, deterministic
    // computation, not a request; a fake await would only pretend otherwise.
    try {
      setStudy(runProtectionPriorityStudy({
        question: 'Kogo chronić najpierw?',
        initialConditions: INITIAL_CONDITIONS,
        baseParams: { severeRate: 0.2 },
        cohort: ageGradient ? ILLUSTRATIVE_COHORT : NEUTRAL_COHORT_PROFILE,
      }));
    } finally {
      setBusy(false);
    }
  };

  const admitted = study?.candidates.filter((c) => c.admitted) ?? [];

  return (
    <main className="home" id="main-content" tabIndex={-1}>
      <section className="pilot-step">
        <p className="settings-hint">
          Każdy wariant ochrony jest uruchamiany jako OSOBNA, pełna sprawa odkrycia wobec tego samego odniesienia, przy
          identycznych warunkach początkowych i tym samym ziarnie ({INITIAL_CONDITIONS.nAgents} agentów,{' '}
          {INITIAL_CONDITIONS.days} dni, ziarno {INITIAL_CONDITIONS.seed}). Kandydat wchodzi do rankingu wyłącznie wtedy,
          gdy jego sprawa przeszła bramkę porównania, odtworzenie i ma kompletny pakiet dowodowy.
        </p>
        <p className="settings-hint">
          <strong>To pytanie nie ma jednej odpowiedzi, dopóki nie powiesz, CO minimalizujesz.</strong> Dlatego ranking
          powstaje osobno dla każdego z {PROTECTION_OBJECTIVES.length} celów, a rozbieżność między nimi jest pokazana, nie
          uśredniona.
        </p>

        <div className="pilot-actions">
          <label>
            <input type="checkbox" checked={ageGradient} data-testid="protection-cohort-toggle"
              onChange={(e) => { setAgeGradient(e.target.checked); setStudy(null); }} />
            {' '}Profil kohortowy z gradientem wieku (ILUSTRACYJNY, nieskalibrowany)
          </label>
          <button className="chip-btn pilot-primary" data-testid="run-protection-study" onClick={run} disabled={busy}>
            {busy ? 'Liczę…' : 'Przeprowadź badanie'}
          </button>
        </div>
        {!ageGradient && (
          <p className="settings-hint">
            Przy profilu neutralnym wiek nie wpływa na ciężkość, więc badanie mierzy WYŁĄCZNIE efekt ekspozycji i
            liczebności grup.
          </p>
        )}
      </section>

      {study !== null && (
        <>
          <section className="pilot-step" data-testid="protection-summary">
            <h2>{study.question}</h2>
            <dl className="pilot-provenance">
              <div><dt>status</dt><dd className="mono" data-testid="protection-status">{study.status}</dd></div>
              <div><dt>odniesienie</dt><dd className="mono">{study.referenceScenario}</dd></div>
              <div><dt>profil kohortowy</dt><dd className="mono">{study.cohortProfileId} ({study.cohortCalibration})</dd></div>
              <div><dt>dopuszczeni kandydaci</dt><dd className="mono">{admitted.length}/{study.candidates.length}</dd></div>
              <div><dt>id badania</dt><dd className="mono">{study.studyId}</dd></div>
            </dl>
            <p className="pilot-summary">{study.message}</p>

            {/* THE CONFLICT IS THE FINDING. When different objectives crown
                different groups, saying so IS the scientific result — a screen
                that quietly showed the first ranking would be answering a
                question the data does not answer. */}
            {study.conflictNote !== null && (
              <p className="pilot-summary" data-testid="protection-conflict">⚠ {study.conflictNote}</p>
            )}
            {study.conflictNote === null && study.status === 'COMPLETED' && (
              <p className="settings-hint" data-testid="protection-no-conflict">
                Wszystkie cele wskazały tego samego zwycięzcę — przy TYCH warunkach i TYM profilu kohortowym wybór celu
                niczego nie zmienia. To wynik, nie reguła.
              </p>
            )}
          </section>

          <section className="pilot-step">
            <h3>Ranking osobno dla każdego celu (mniej = lepiej)</h3>
            <div className="compare-table-wrap">
              <table className="compare-table" data-testid="protection-matrix">
                <thead>
                  <tr>
                    <th>cel</th>
                    {study.candidates.map((c) => <th key={c.scenario}>{c.label}</th>)}
                    <th>zwycięzca</th>
                  </tr>
                </thead>
                <tbody>
                  {PROTECTION_OBJECTIVES.map((objective) => {
                    const winner = study.winnerByObjective[objective];
                    return (
                      <tr key={objective} data-testid={`protection-row-${objective}`}>
                        <td>{OBJECTIVE_LABEL[objective]}</td>
                        {study.candidates.map((c) => (
                          <td key={c.scenario} className="mono">
                            {c.admitted ? formatValue(c.objectives[objective]) : '—'}
                          </td>
                        ))}
                        <td className="mono">{winner ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pilot-step">
            <h3>Dowód każdego kandydata</h3>
            <ul className="matrix-relation-list">
              {study.candidates.map((c) => (
                <li key={c.scenario} data-testid={`protection-candidate-${c.scenario}`}>
                  <strong>{c.label}</strong>{' '}
                  {c.admitted
                    ? <span className="mono">DOPUSZCZONY — porównanie {c.case.comparison?.status ?? '—'}, odtworzenie {c.case.replay?.status ?? '—'}</span>
                    : <span className="mono">ODRZUCONY — {c.rejectionReason}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="pilot-step">
            <h3>Ograniczenia</h3>
            <ul className="matrix-relation-list" data-testid="protection-limitations">
              {study.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
