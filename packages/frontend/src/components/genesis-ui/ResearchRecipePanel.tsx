import type React from 'react';
import type { LowerHarmWinnerRecord } from '../../core/orchestrator/winnerRecord';
import { FingerprintChip } from './FingerprintChip';

/**
 * ResearchRecipePanel — the WinnerRecord and its Research Recipe, shown
 * exactly as the real pipeline built them (D-116). Research artifact only:
 * the recipe's own text states there is no dose, no patient instruction and
 * no step-level synthesis, and this panel adds nothing on top.
 */
export function ResearchRecipePanel({ record }: { readonly record: LowerHarmWinnerRecord }): React.ReactElement {
  const r = record.recipe;
  return (
    <div className="gu-recipe" data-testid="winner-record">
      <div className="gu-recipe-head">
        <div>
          <div className="gu-recipe-eyebrow">WINNER RECORD · {record.scenarioId} · {record.mode}</div>
          <h3 className="gu-recipe-title">{record.candidateName} <code>{record.winnerId}</code></h3>
        </div>
        <div className="gu-recipe-gate">{record.gate.outcome}</div>
      </div>

      <div className="gu-recipe-fps">
        <FingerprintChip label="record" value={record.recordFingerprint} />
        <FingerprintChip label="recipe" value={record.fingerprints.recipeFingerprint} />
        <FingerprintChip label="run" value={record.fingerprints.runFingerprint} />
        <FingerprintChip label="prereg" value={record.fingerprints.preregistrationFingerprint} />
        <FingerprintChip label="falsification criteria" value={record.fingerprints.falsificationCriteriaFingerprint} />
        <FingerprintChip label="audit" value={record.fingerprints.auditFingerprint} />
        <FingerprintChip label="gate" value={record.fingerprints.gateFingerprint} />
      </div>

      <h4 className="section-label">Evidence behind the winner ({record.observationCount} real observations)</h4>
      <table className="gu-recipe-table">
        <thead><tr><th>Trial</th><th>Comparison</th><th>Δ vs reference</th><th>n</th><th>Within margin</th></tr></thead>
        <tbody>
          {record.evidence.map((e) => (
            <tr key={e.nctId}>
              <td><code>{e.nctId}</code></td>
              <td>{e.comparisonType} · {e.evidenceBasis}</td>
              <td>{e.deltaVsReferencePp === null ? 'n/a' : `${e.deltaVsReferencePp > 0 ? '+' : ''}${e.deltaVsReferencePp.toFixed(2)} pp`}</td>
              <td>{e.candidateArmN}</td>
              <td>{e.withinMargin === null ? 'n/a' : e.withinMargin ? 'yes' : 'NO'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {record.evidence.some((e) => e.fairnessFlags.length > 0) && (
        <p className="gu-hint">{record.evidence[0]?.fairnessFlags[0]}</p>
      )}

      {record.evidenceCustody !== null && (
        <p className="gu-hint">
          Evidence custody: {record.evidenceCustody.status} · source <code>{record.evidenceCustody.sourceId}</code> · {record.evidenceCustody.hashPolicy} <code>{record.evidenceCustody.hash?.slice(0, 16)}…</code>
        </p>
      )}

      <h4 className="section-label">Research Recipe</h4>
      <dl className="gu-recipe-dl">
        <dt>Mechanism</dt><dd>{r.mechanism}</dd>
        <dt>Formulation concept</dt><dd>{r.formulationConcept}</dd>
        <dt>Synthesis route</dt><dd>{r.conceptualSynthesisRoute}</dd>
        <dt>Required properties</dt><dd><ul>{r.requiredProperties.map((p) => <li key={p}>{p}</li>)}</ul></dd>
        <dt>Identifiers</dt><dd>{r.identifiers.map((id) => <code key={id} className="gu-recipe-id">{id}</code>)}</dd>
        <dt>Provenance</dt><dd>{r.provenance}</dd>
        <dt>Falsification results</dt>
        <dd><ul>{(r.falsificationResults ?? []).map((x) => <li key={x.probe}><code>{x.probe}</code> — {x.outcome}</li>)}</ul></dd>
        <dt>Limitations</dt><dd><ul>{(r.limitations ?? []).map((l) => <li key={l}>{l}</li>)}</ul></dd>
        <dt>Reproducibility</dt><dd><ul>{(r.reproducibilityInstructions ?? []).map((l) => <li key={l}>{l}</li>)}</ul></dd>
      </dl>

      <h4 className="section-label">What this record does not claim</h4>
      <ul className="gu-recipe-disclosures">
        {record.disclosures.map((d) => <li key={d}>{d}</li>)}
      </ul>
    </div>
  );
}
