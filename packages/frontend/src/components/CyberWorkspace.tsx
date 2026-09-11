import { useMemo, useState } from 'react';
import {
  ToyVulnerableApp, runAdaptiveInvestigation,
  type AdaptiveInvestigationResult, type AdaptiveStep,
} from '../core/agent/cyberReasoningKernel';
import type { HypothesisAssessment } from '../core/experimentFabric/scientificDiscovery';
import type { ObservableExpectation } from '../core/agent/cyberInvestigation';

/**
 * CYBER WORKSPACE — the UI for a reasoning core that already existed and ran,
 * but that no screen had ever shown.
 *
 * `cyberReasoningKernel.ts` (570 lines) + `cyberInvestigation.ts` (241) +
 * `cyberTestPlanner.ts` (130) were 941 lines of working code with no route
 * and no component: every cyber run was invisible except as a label in the
 * Matrix. This screen runs the REAL kernel in the browser and renders what it
 * actually produced. It adds no second cyber engine, no heuristics of its own
 * and no scoring — every number, verdict and justification below is read
 * straight off `runAdaptiveInvestigation`'s result.
 *
 * WHAT THE TARGET IS: `ToyVulnerableApp`, a synthetic application that ships
 * with the kernel. It is not a scan of anything real, and the screen says so.
 * Its `hiddenGroundTruth` is deliberately WRONG on two endpoints precisely so
 * that a kernel which peeked at it instead of testing would be caught — the
 * kernel never reads it, and neither does this component.
 *
 * WHAT IS DELIBERATELY PRESERVED: `conflicts` — hypotheses whose history
 * holds BOTH a SUPPORTED and a FALSIFIED assessment. A dashboard would
 * average those into one confident number. This one shows them as conflicts,
 * because that is what the data says.
 */

const ASSESSMENT_LABEL: Record<HypothesisAssessment, string> = {
  CANDIDATE: 'kandydat',
  SUPPORTED_WITHIN_PROTOCOL: 'potwierdzona w protokole',
  FALSIFIED_WITHIN_PROTOCOL: 'obalona w protokole',
  INCONCLUSIVE: 'nierozstrzygnięta',
};

const ASSESSMENT_CLASS: Record<HypothesisAssessment, string> = {
  CANDIDATE: 'cy-verdict-candidate',
  SUPPORTED_WITHIN_PROTOCOL: 'cy-verdict-supported',
  FALSIFIED_WITHIN_PROTOCOL: 'cy-verdict-falsified',
  INCONCLUSIVE: 'cy-verdict-inconclusive',
};

/**
 * A falsifier is a structured `ObservableExpectation`, not prose — so it is
 * rendered from its real fields rather than from a description string the
 * type does not have. Showing the actual expectation is also the honest
 * choice: the reader can check the verdict against it.
 */
function expectationText(e: ObservableExpectation): string {
  const parts: string[] = [];
  if (e.statusCode !== undefined) parts.push(`status = ${e.statusCode}`);
  if (e.statusCodeIn?.length) parts.push(`status ∈ {${e.statusCodeIn.join(', ')}}`);
  if (e.summaryContains?.length) parts.push(`odpowiedź zawiera: ${e.summaryContains.join(', ')}`);
  if (e.summaryNotContains?.length) parts.push(`odpowiedź NIE zawiera: ${e.summaryNotContains.join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : 'brak zadeklarowanego oczekiwania';
}

function StepCard({ step, expanded, onToggle }: { step: AdaptiveStep; expanded: boolean; onToggle: () => void }): JSX.Element {
  const { selection, testResult, verdict, remediation, outcomeVerification } = step;
  return (
    <li className={`cy-step${expanded ? ' expanded' : ''}`}>
      <button className="cy-step-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="cy-step-index">#{step.stepIndex + 1}</span>
        <span className="cy-step-hyp">{step.hypothesisId ?? 'brak wybranej hipotezy'}</span>
        {verdict && <span className={`cy-verdict ${ASSESSMENT_CLASS[verdict.assessment]}`}>{ASSESSMENT_LABEL[verdict.assessment]}</span>}
        <span className="cy-step-score">score {selection.score.toFixed(3)}</span>
      </button>

      {expanded && (
        <div className="cy-step-body">
          {/* PLANNER — why this test and not another. Both strings come from
              the planner itself; nothing here is re-derived for display. */}
          <section className="cy-block">
            <h4>Dlaczego ten test</h4>
            <p className="cy-why">{selection.whySelected}</p>
            {selection.whyNotAlternative && <p className="cy-why cy-why-alt">Alternatywa: {selection.whyNotAlternative}</p>}
            <dl className="cy-kv">
              <div><dt>expected information gain</dt><dd className="mono">{selection.expectedInformationGain.toFixed(4)}</dd></div>
              <div><dt>rozważane hipotezy</dt><dd className="mono">{selection.targetHypotheses.length}</dd></div>
            </dl>
          </section>

          {/* TEST → OBSERVATION. A real execution against the synthetic target. */}
          <section className="cy-block">
            <h4>Test i obserwacja</h4>
            {testResult ? (
              <dl className="cy-kv">
                <div><dt>test</dt><dd className="mono">{testResult.testId}</dd></div>
                <div><dt>status</dt><dd className="mono">{testResult.observedResult.statusCode}</dd></div>
                <div><dt>odpowiedź</dt><dd className="mono">{testResult.observedResult.responseSummary}</dd></div>
                <div><dt>provenance</dt><dd className="mono">{testResult.provenance}</dd></div>
              </dl>
            ) : (
              <p className="cy-empty">Ten krok nie wykonał testu — planner nie znalazł kandydata spełniającego kryteria.</p>
            )}
          </section>

          {/* VERDICT — the comparison of falsifier vs observation. */}
          <section className="cy-block">
            <h4>Werdykt</h4>
            {verdict ? <p className="cy-why">{verdict.reasoning}</p> : <p className="cy-empty">Brak werdyktu w tym kroku.</p>}
          </section>

          {/* NEXT ACTION — remediation, and whether re-testing actually confirmed it. */}
          <section className="cy-block">
            <h4>Następne działanie</h4>
            {remediation ? (
              <>
                <p className="cy-why">{remediation.description}</p>
                <dl className="cy-kv"><div><dt>remediation</dt><dd className="mono">{remediation.remediationId}</dd></div></dl>
                {outcomeVerification ? (
                  <p className={outcomeVerification.verified ? 'cy-ok' : 'cy-warn'}>
                    {outcomeVerification.verified ? '✓ Ponowny test potwierdził skutek' : '✗ Ponowny test NIE potwierdził skutku'} — {outcomeVerification.reasoning}
                  </p>
                ) : (
                  <p className="cy-empty">Remediacja zgłoszona, ale nie została jeszcze niezależnie przetestowana.</p>
                )}
              </>
            ) : (
              <p className="cy-empty">Brak remediacji dla tego kroku.</p>
            )}
          </section>
        </div>
      )}
    </li>
  );
}

export function CyberWorkspace(): JSX.Element {
  const [result, setResult] = useState<AdaptiveInvestigationResult | null>(null);
  const [openStep, setOpenStep] = useState<number | null>(0);
  const [brokenRemediation, setBrokenRemediation] = useState(false);
  const [running, setRunning] = useState(false);

  const run = (): void => {
    setRunning(true);
    // The kernel is synchronous; the flag exists so the button reads as busy
    // rather than as unresponsive on a slower device.
    try {
      const app = new ToyVulnerableApp({ brokenRemediation });
      setResult(runAdaptiveInvestigation(app));
      setOpenStep(0);
    } finally {
      setRunning(false);
    }
  };

  const counts = useMemo(() => {
    if (!result) return null;
    const byAssessment = new Map<HypothesisAssessment, number>();
    for (const step of result.steps) {
      if (!step.verdict) continue;
      byAssessment.set(step.verdict.assessment, (byAssessment.get(step.verdict.assessment) ?? 0) + 1);
    }
    return byAssessment;
  }, [result]);

  return (
    <main className="cy-workspace" id="main-content" tabIndex={-1}>
      <header className="cy-head">
        <span className="dash-eyebrow">Genesis · Cyber</span>
        <h1 className="dash-title">Dochodzenie bezpieczeństwa</h1>
        <p className="dash-subtitle">
          Pełna pętla na realnym rdzeniu Genesis: HIPOTEZA → TEST → OBSERWACJA → WERDYKT → REMEDIACJA → WERYFIKACJA.
          Celem jest <strong>syntetyczna aplikacja</strong> dostarczona razem z kernelem (<code>ToyVulnerableApp</code>) —
          to nie jest skan niczego realnego. Jej ukryta „prawda" jest celowo błędna na dwóch endpointach, żeby kernel,
          który by do niej zajrzał zamiast testować, został na tym złapany. Kernel jej nie czyta; ten ekran też nie.
        </p>
      </header>

      <div className="cy-controls">
        <button className="dash-btn dash-btn-primary" onClick={run} disabled={running}>
          {running ? 'Uruchamiam…' : '▶ Uruchom dochodzenie'}
        </button>
        <label className="cy-toggle">
          <input type="checkbox" checked={brokenRemediation} onChange={(e) => setBrokenRemediation(e.target.checked)} />
          <span>Zepsuta remediacja — poprawka jest przyjmowana, ale nic nie zmienia</span>
        </label>
      </div>

      {!result ? (
        <section className="cy-block cy-intro">
          <h2>Co zobaczysz po uruchomieniu</h2>
          <ul className="locked-caps">
            <li><span aria-hidden="true">◆</span>Powierzchnię ataku wyprowadzoną z realnych obserwacji celu</li>
            <li><span aria-hidden="true">◆</span>Hipotezy wraz z ich falsyfikatorami — każda mówi, co by ją obaliło</li>
            <li><span aria-hidden="true">◆</span>Wybór kolejnego testu przez planner EIG, z uzasadnieniem „dlaczego ten, a nie tamten"</li>
            <li><span aria-hidden="true">◆</span>Konflikty: hipotezy, które dostały i potwierdzenie, i obalenie — zachowane, nie uśrednione</li>
          </ul>
          <p className="locked-note">
            Nic nie jest tu zapisane z góry. Przebieg liczy się w przeglądarce przy każdym uruchomieniu.
          </p>
        </section>
      ) : (
        <>
          <section className="cy-summary">
            <div className="dash-tile"><span className="dash-tile-count">{result.assets.length}</span><span className="dash-tile-label">Zasoby</span><span className="dash-tile-hint">powierzchnia ataku</span></div>
            <div className="dash-tile"><span className="dash-tile-count">{result.hypotheses.length}</span><span className="dash-tile-label">Hipotezy</span><span className="dash-tile-hint">każda z falsyfikatorem</span></div>
            <div className="dash-tile"><span className="dash-tile-count">{result.steps.length}</span><span className="dash-tile-label">Kroki</span><span className="dash-tile-hint">wybrane adaptacyjnie</span></div>
            <div className="dash-tile"><span className="dash-tile-count">{result.conflicts.length}</span><span className="dash-tile-label">Konflikty</span><span className="dash-tile-hint">potwierdzona i obalona naraz</span></div>
          </section>

          {counts && counts.size > 0 && (
            <section className="cy-block">
              <h2>Werdykty</h2>
              <ul className="cy-verdict-list">
                {[...counts.entries()].map(([assessment, count]) => (
                  <li key={assessment}>
                    <span className={`cy-verdict ${ASSESSMENT_CLASS[assessment]}`}>{ASSESSMENT_LABEL[assessment]}</span>
                    <span className="mono">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.conflicts.length > 0 && (
            <section className="cy-block cy-conflicts">
              <h2>Konflikty — zachowane, nie uśrednione</h2>
              <p className="cy-why">
                Te hipotezy mają w historii ZARÓWNO potwierdzenie, JAK I obalenie. Dashboard uśredniłby to do jednej
                pewnej liczby; tutaj konflikt zostaje widoczny, bo tak mówią dane.
              </p>
              <ul className="cy-conflict-list">
                {result.conflicts.map((id) => (
                  <li key={id}>
                    <strong className="mono">{id}</strong>
                    <span className="mono">
                      {(result.assessmentHistory.get(id) ?? []).map((a) => ASSESSMENT_LABEL[a]).join(' → ')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="cy-block">
            <h2>Hipotezy i ich falsyfikatory</h2>
            <ul className="cy-hyp-list">
              {result.hypotheses.map((h) => (
                <li key={h.hypothesisId}>
                  <div className="cy-hyp-head"><span className="cy-kind">{h.kind}</span><strong className="mono">{h.hypothesisId}</strong></div>
                  <p className="cy-why">{h.statement}</p>
                  <p className="cy-falsifier">
                    Potwierdziłoby ją: {expectationText(h.falsifier.predictedObservable)}
                  </p>
                  <p className="cy-falsifier">
                    Obaliłoby ją: {expectationText(h.falsifier.falsifyingObservable)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="cy-block">
            <h2>Przebieg adaptacyjny</h2>
            <ol className="cy-steps">
              {result.steps.map((step) => (
                <StepCard
                  key={step.stepIndex}
                  step={step}
                  expanded={openStep === step.stepIndex}
                  onToggle={() => setOpenStep(openStep === step.stepIndex ? null : step.stepIndex)}
                />
              ))}
            </ol>
            <p className="locked-note">Zatrzymano, ponieważ: {result.stopReason}</p>
          </section>
        </>
      )}
    </main>
  );
}

export default CyberWorkspace;
