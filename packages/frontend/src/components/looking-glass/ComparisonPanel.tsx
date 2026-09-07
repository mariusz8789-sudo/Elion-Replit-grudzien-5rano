import type { ScenarioComparisonView } from '../../core/lookingGlass/scenarioComparison';

/**
 * LOOKING GLASS — ONE RENDERING OF A REAL COMPARISON.
 *
 * Shared by the chat card and both world screens so "what a comparison
 * looks like" cannot drift into three slightly different claims about the
 * same numbers. Renders exactly what `ScenarioComparisonView` says: real
 * metrics when READY, the engine's own refusal message when blocked, and —
 * critically — nothing that implies a comparison happened when `comparison`
 * is null despite the user having asked for one.
 */
export function ComparisonPanel({
  comparison, requestedButMissing,
}: { readonly comparison: ScenarioComparisonView | null; readonly requestedButMissing: boolean }): JSX.Element | null {
  if (!comparison) {
    if (!requestedButMissing) return null;
    return (
      <div className="lg-cmp lg-cmp-none">
        <span className="lg-cmp-title">PORÓWNANIE</span>
        <p className="lg-cmp-blocked">Poproszono o porównanie, ale ten świat nie ma z czym porównać.</p>
      </div>
    );
  }

  return (
    <div className={`lg-cmp lg-cmp-${comparison.status.toLowerCase()}`}>
      <span className="lg-cmp-title">PORÓWNANIE</span>
      {comparison.status === 'READY' ? (
        <>
          <div className="lg-cmp-sides">
            <span>{comparison.baselineLabel}</span>
            <span className="lg-cmp-vs">vs</span>
            <span>{comparison.variantLabel}</span>
          </div>
          <table className="lg-cmp-table">
            <tbody>
              {comparison.metrics.map((metric) => (
                <tr key={metric.key}>
                  <td>{metric.key}</td>
                  <td>{metric.baseline.toFixed(2)}</td>
                  <td>→</td>
                  <td>{metric.variant.toFixed(2)}</td>
                  <td className={metric.absoluteDelta < 0 ? 'is-down' : metric.absoluteDelta > 0 ? 'is-up' : ''}>
                    {metric.absoluteDelta > 0 ? '+' : ''}{metric.absoluteDelta.toFixed(2)}
                    {metric.relativeDeltaPercent !== null ? ` (${metric.relativeDeltaPercent > 0 ? '+' : ''}${metric.relativeDeltaPercent.toFixed(0)}%)` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {comparison.evidence !== null ? (
            <p className="lg-cmp-evidence">
              {comparison.evidence.firstDivergentDay !== null
                ? `Światy rozeszły się w dniu ${comparison.evidence.firstDivergentDay}.`
                : 'Światy nigdy się nie rozeszły — różnica wyniku pochodzi z innej warstwy modelu.'}
              {' '}
              <span className="lg-cmp-fingerprint">odcisk {comparison.evidence.counterfactualFingerprint}</span>
            </p>
          ) : null}
          <p className="lg-cmp-produced">{comparison.producedBy}</p>
        </>
      ) : (
        <p className="lg-cmp-blocked">{comparison.message}</p>
      )}
    </div>
  );
}
