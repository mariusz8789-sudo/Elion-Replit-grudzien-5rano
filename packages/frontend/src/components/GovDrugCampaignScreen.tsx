import { useCallback, useState } from 'react';
import {
  runGovDrugDiscoveryCampaign,
  type GddCampaignResult,
} from '../core/biotechData/govDrugDiscoveryCampaign';

/**
 * The Government Drug Discovery campaign, on screen, from the real runtime.
 *
 * EVERY NUMBER HERE COMES FROM `runGovDrugDiscoveryCampaign()` EXECUTED IN THE
 * BROWSER. There is no pinned narrative, no scripted stage sequence and no
 * progress animation standing in for work: the run is synchronous (~200ms over
 * the pinned 2671-molecule space), so the screen simply has no result before
 * the click and the real result after it. A staged reveal would be theatre,
 * and this is the one screen where theatre would be a lie about the product.
 *
 * The verdict is whatever the engine returns. This component contains no
 * molecule identifier and no expected outcome — including the non-winner
 * outcomes, which are rendered with exactly the same prominence as a winner
 * would be.
 */

const STAGE_LABEL: Readonly<Record<string, string>> = {
  TIER_1: 'SCREENING — mechanizm + realny rozwój kliniczny',
  TIER_2: 'SCREENING — policzalna skuteczność + policzalne bezpieczeństwo',
};

function Funnel({ run }: { run: GddCampaignResult }): React.ReactElement {
  const start = run.generationCheck.generatedCount;
  const rows = [
    { label: 'PULA KANDYDATÓW — zbudowana z mechanizmu', count: start, note: `${run.generationCheck.outsidePresuppliedCount} spoza jakiejkolwiek listy podanej z góry` },
    ...run.stages.map((s) => ({ label: STAGE_LABEL[s.stage] ?? s.stage, count: s.outputCount, note: `odrzucono ${s.eliminatedCount}, każdy z powodem` })),
    { label: `SHORTLIST — TOP 10 (limit), realnie ${run.shortlist.length}`, count: run.shortlist.length, note: 'ranking po wadze dowodów' },
    { label: `FINALIŚCI — TOP 2 (limit), realnie ${run.finalists.length}`, count: run.finalists.length, note: 'po głębokiej falsyfikacji całego shortlistu' },
  ];
  const max = Math.log10(Math.max(start, 10));
  return (
    <ol className="gdd-funnel">
      {rows.map((r) => (
        <li key={r.label} className="gdd-funnel-row">
          <div className="gdd-funnel-head">
            <span className="gdd-funnel-label">{r.label}</span>
            <span className="gdd-funnel-count">{r.count}</span>
          </div>
          <div className="gdd-funnel-track">
            <div className="gdd-funnel-bar" style={{ width: `${Math.max(2, (Math.log10(Math.max(r.count, 1)) / max) * 100)}%` }} />
          </div>
          <span className="gdd-funnel-note">{r.note}</span>
        </li>
      ))}
    </ol>
  );
}

export function GovDrugCampaignScreen(): React.ReactElement {
  const [run, setRun] = useState<GddCampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const execute = useCallback(() => {
    setBusy(true);
    setError(null);
    // Deferred a frame so the button's own busy state paints before the
    // synchronous engine run blocks the thread.
    window.setTimeout(() => {
      try {
        setRun(runGovDrugDiscoveryCampaign());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 0);
  }, []);

  return (
    <div className="settings-view gdd-screen">
      <section className="settings-section">
        <h2>Government Drug Discovery — kampania</h2>
        <p className="settings-hint">
          Pełny przebieg uruchamiany w przeglądarce na przypiętej, realnej przestrzeni kandydatów
          (ChEMBL + ClinicalTrials.gov). Każda liczba poniżej pochodzi z tego uruchomienia — nie ma tu
          zapisanego scenariusza ani animacji postępu.
        </p>
        <button className="chip-btn primary" onClick={execute} disabled={busy}>
          {busy ? 'Liczę…' : run === null ? 'Uruchom kampanię' : 'Uruchom ponownie'}
        </button>
        {error !== null && (
          <p className="gdd-error">
            Kampania zatrzymała się asercją: {error}
          </p>
        )}
      </section>

      {run === null ? (
        <section className="settings-section">
          <p className="empty-state">
            Nic nie jest policzone, dopóki nie klikniesz. To celowe: ekran nie pokazuje wyniku, którego nie było.
          </p>
        </section>
      ) : (
        <>
          <section className="settings-section">
            <h3 className="section-label">Problem rządowy</h3>
            <p className="gdd-problem">{run.problem}</p>
          </section>

          <section className="settings-section">
            <h3 className="section-label">Lejek</h3>
            <Funnel run={run} />
          </section>

          <section className="settings-section">
            <h3 className="section-label">Shortlist — dlaczego przetrwali</h3>
            <div className="gdd-table-wrap">
              <table className="gdd-table">
                <thead>
                  <tr><th>#</th><th>Kandydat</th><th>Wynik</th><th>Δ vs referencja</th><th>Falsyfikacja</th><th>Veto bezpieczeństwa</th></tr>
                </thead>
                <tbody>
                  {run.shortlist.map((c) => {
                    const f = run.falsifications.find((x) => x.moleculeChemblId === c.moleculeChemblId);
                    return (
                      <tr key={c.moleculeChemblId}>
                        <td>{c.rank}</td>
                        <td><strong>{c.prefName}</strong><br /><span className="gdd-dim">{c.moleculeChemblId}</span></td>
                        <td className="gdd-num">{c.weightedScore.toFixed(3)}</td>
                        <td className="gdd-num">{c.bestEfficacyDeltaPp === null ? '—' : `${c.bestEfficacyDeltaPp.toFixed(2)}pp`}</td>
                        <td>{f === undefined ? '—' : f.survivedAll ? 'przetrwał 6/6' : `${f.unresolvedCounterevidence.length} nierozstrzygniętych kontrdowodów`}</td>
                        <td>{c.vetoed ? <span className="gdd-veto">{c.vetoReason}</span> : 'brak'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="settings-section">
            <h3 className="section-label">Bramka bezpieczeństwa</h3>
            {run.safetyGate.length === 0 ? (
              <p className="empty-state">Żaden kandydat nie doszedł do finału, więc bramka nie miała czego oceniać.</p>
            ) : (
              <ul className="gdd-list">
                {run.safetyGate.map((g) => (
                  <li key={g.moleculeChemblId} className={g.blocked ? 'gdd-blocked' : ''}>
                    <strong>{g.prefName}</strong> — {g.decision.outcome} (warstwa: {g.surface})
                    <div className="gdd-dim">{g.unresolvedContradictions.length} nierozstrzygniętych sprzeczności podanych bramce</div>
                    {g.decision.failures.map((f) => <div key={f.criterion} className="gdd-fail">✕ {f.criterion}</div>)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="settings-section">
            <h3 className="section-label">Wyczerpanie ścieżek — zanim padnie werdykt bez zwycięzcy</h3>
            <ul className="gdd-list">
              {run.exhaustion.steps.map((s) => (
                <li key={s.path}>
                  <strong>{s.path}</strong> — <span className={`gdd-status gdd-status-${s.status}`}>{s.status}</span>
                  <div className="gdd-dim">{s.finding}</div>
                </li>
              ))}
            </ul>
            {run.exhaustion.differentiatingExperiment !== null && (
              <p className="settings-hint">
                Eksperyment różnicujący: <code>{run.exhaustion.differentiatingExperiment.observableId}</code>,
                moc falsyfikacyjna {(run.exhaustion.differentiatingExperiment.falsificationPower * 100).toFixed(0)}%,
                reguła decyzyjna zamrożona jako <code>{run.exhaustion.differentiatingExperiment.decisionRuleFingerprint}</code> przed odczytem danych.
              </p>
            )}
            {run.exhaustion.observationGapRequest !== null && (
              <p className="settings-hint">
                Zgłoszona luka obserwacyjna: {run.exhaustion.observationGapRequest.requiredObservable.quantity}.
                Koszt: {run.exhaustion.observationGapRequest.feasibility.costEstimate === null ? 'NIEZADEKLAROWANY' : String(run.exhaustion.observationGapRequest.feasibility.costEstimate)}.
              </p>
            )}
          </section>

          <section className="settings-section">
            <h3 className="section-label">Werdykt</h3>
            <p className="gdd-verdict">{run.decision.outcome}</p>
            <p className="settings-hint">
              Przed wyczerpaniem ścieżek: {run.provisionalDecision.outcome} — zmienił się po wyczerpaniu: {run.exhaustionChangedVerdict ? 'tak' : 'nie'}.
            </p>
            <p className="gdd-reason">{run.decision.reason}</p>
          </section>

          <section className="settings-section">
            <h3 className="section-label">Receptura badawcza</h3>
            {run.researchRecipe === null ? (
              <p className="empty-state">
                Nie wygenerowano — receptura powstaje wyłącznie dla werdyktu WINNER. Ten przebieg go nie wskazał.
              </p>
            ) : (
              <ul className="gdd-list">
                <li><strong>Mechanizm:</strong> {run.researchRecipe.mechanism}</li>
                <li><strong>Koncepcja postaci:</strong> {run.researchRecipe.formulationConcept}</li>
                <li><strong>Droga syntezy:</strong> {run.researchRecipe.conceptualSynthesisRoute}</li>
                <li><strong>Wymagane własności:</strong> {run.researchRecipe.requiredProperties.join(' ')}</li>
              </ul>
            )}
          </section>

          <section className="settings-section">
            <h3 className="section-label">Rekomendacja dla decydenta</h3>
            <p className="gdd-reason">{run.governmentRecommendation}</p>
          </section>

          <section className="settings-section">
            <h3 className="section-label">Audyt</h3>
            <ul className="gdd-list gdd-audit">
              <li>Zarejestrowanych prób: <strong>{run.trials.length}</strong> (każda z powodem)</li>
              <li>Korekta na wielokrotne testowanie: α {run.multiplicity.nominalAlpha} → <strong>{run.multiplicity.correctedAlpha.toExponential(3)}</strong> przy {run.multiplicity.trialsCounted} atakach falsyfikacyjnych</li>
              <li>Odcisk kampanii: <code>{run.campaignFingerprint}</code></li>
              <li>Odcisk rejestru prób: <code>{run.trialRegistryFingerprint}</code></li>
              <li>Prerejestracja kampanii: <code>{run.preregistrationFingerprint}</code>, stoi na zapieczętowanej <code>{run.inheritedFromFingerprint}</code></li>
              <li>Zakazane sformułowania w wyniku: <strong>{run.bannedStringHits.length}</strong></li>
              <li>Źródła wymagane, lecz nieosiągalne: <strong>{run.noAccessDeclarations.length}</strong> (zadeklarowane, nie uzupełnione domysłem)</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
