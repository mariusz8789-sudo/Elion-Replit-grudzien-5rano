import type React from 'react';
import type { LiveDrugRun } from '../core/liveExperiment/liveDrugRun';
import { DRUG_EFFECT_NOT_COMPUTED_PL, FINALIST_FALSIFICATION_CAVEAT_PL, FINALIST_FALSIFICATION_TITLE_PL, finalistFalsification } from '../core/liveExperiment/finalistFalsification';

/**
 * THE PANEL THAT REPLACES "SUCCESS" (D-148). Rendered under a candidate on the live drug bench; it
 * shows nothing unless `finalistFalsification` resolves for that candidate (a finalist of this run),
 * so it appears for the docked finalist only. Every cell is a field of the pure report: the 13
 * probe verdicts with the battery's own reasons, what is still unknown, and the next experiment
 * from the existing next-experiment logic.
 */
const METHOD_PL: Readonly<Record<string, string>> = {
  DETERMINISTIC_PROBE: 'sonda deterministyczna',
  STATISTICAL_TEST: 'test statystyczny',
  STRUCTURAL_REVIEW: 'przegląd strukturalny (deklaracja)',
};
const VERDICT_PL: Readonly<Record<string, string>> = { PASS: 'PASS', FAIL: 'FAIL', UNRESOLVED: 'UNRESOLVED' };

export function FinalistFalsificationPanel({ run, candidateId }: { readonly run: LiveDrugRun | null; readonly candidateId: string }): React.ReactElement | null {
  const report = finalistFalsification(run, candidateId);
  if (report.status !== 'RESOLVED') return null;
  return (
    <section className="sw-finalist-falsification" data-testid="drug-finalist-falsification" data-status={report.status}
      data-candidate-id={report.candidateId} data-pass={report.counts.PASS} data-fail={report.counts.FAIL} data-unresolved={report.counts.UNRESOLVED}
      data-verdict={report.hypothesisVerdict} data-state-hash={report.stateHash} data-report-fingerprint={report.reportFingerprint}>
      <div className="sw-cand-head">
        <strong>{FINALIST_FALSIFICATION_TITLE_PL}</strong>
        <span className="sw-procedure-label">PASS {report.counts.PASS} · FAIL {report.counts.FAIL} · UNRESOLVED {report.counts.UNRESOLVED}</span>
      </div>
      <p className="sw-falsify-caveat" data-testid="drug-finalist-falsification-caveat">{FINALIST_FALSIFICATION_CAVEAT_PL}</p>
      <span className="sw-procedure-label">
        werdykt zamrożonych kryteriów: {report.hypothesisVerdict}
        {report.hypothesisSource === 'DEFAULT_CRITERIA' ? ' (kryteria domyślne — brak zarejestrowanej hipotezy w tej sesji)' : ''}
        {report.sealed?.check ? ` · sprawdzenie serwera: ${report.sealed.check}` : ''}
      </span>
      <table className="sw-falsify-table" data-testid="drug-finalist-probes">
        <thead><tr><th>#</th><th>Sonda</th><th>Metoda</th><th>Werdykt</th><th>Powód / źródło deklaracji</th></tr></thead>
        <tbody>
          {report.probes.map((p, i) => (
            <tr key={p.id} data-testid="drug-finalist-probe" data-probe={p.id} data-verdict={p.verdict} data-declared={p.declaredFrom ? '1' : ''}>
              <td>{i + 1}</td>
              <td>{p.labelPl} <small><code>{p.id}</code></small></td>
              <td>{METHOD_PL[p.method] ?? p.method}</td>
              <td><span className={`sw-falsify-verdict is-${p.verdict.toLowerCase()}`}>{VERDICT_PL[p.verdict] ?? p.verdict}</span></td>
              <td>{p.reason}{p.declaredFrom ? <span className="sw-procedure-label"> · z: {p.declaredFrom}</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sw-cand-head"><strong>Czego jeszcze nie wiemy ({report.unknowns.length})</strong></div>
      <ul className="sw-falsify-list" data-testid="drug-finalist-unknowns" data-count={report.unknowns.length}>
        {report.unknowns.map((u) => (
          <li key={u.id} data-unknown={u.id} data-kind={u.kind}>
            <span className="sw-falsify-item">{u.labelPl}</span>
            <span className="sw-procedure-detail">{u.detail}</span>
          </li>
        ))}
      </ul>
      {!report.unknowns.some((u) => u.id === 'drug-effect-in-tissue') && (
        <span className="sw-procedure-label" data-testid="drug-finalist-no-anatomy">{DRUG_EFFECT_NOT_COMPUTED_PL} (brak zapisanej lokalizacji celu)</span>
      )}
      <div className="sw-cand-head"><strong>Jaki eksperyment powinien być następny</strong></div>
      <ol className="sw-falsify-list" data-testid="drug-finalist-next" data-count={report.nextExperiments.length}>
        {report.nextExperiments.map((n) => (
          <li key={`${n.probeId}:${n.labelPl}`} data-probe={n.probeId} data-source={n.source}>
            <span className="sw-falsify-item">{n.labelPl}</span>
            <span className="sw-procedure-detail">{n.whatItWouldResolve}</span>
          </li>
        ))}
      </ol>
      <span className="sw-procedure-label">propozycje, nie uruchomione automatycznie · odcisk raportu {report.reportFingerprint}</span>
    </section>
  );
}

export default FinalistFalsificationPanel;
