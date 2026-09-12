import { useMemo, useState } from 'react';
import {
  MODEL_AGREEMENT_THRESHOLD, compareModelVsModel, sweepModelDivergence, verdictOf,
  type ModelVsModelComparison,
} from '../core/experimentFabric/modelVsModelCompare';
import type { StructuredExperimentRequest } from '../core/experimentFabric/types';

/**
 * MODEL TOURNAMENT — "which experiment would best tell these two models
 * apart?", answered by running both of them for real.
 *
 * WHY THIS IS A SECOND PANEL AND NOT AN EXTENSION OF ModelConflictPanel.
 * They answer different questions on different data. `ModelConflictPanel`
 * reads `core/mcre`'s `ModelConflict` — friction correlations already
 * recorded in the Model Graph. This one EXECUTES two registered models
 * through the existing `runExperiment` and compares what they actually
 * computed. Retyping either onto the other's shape would mean converting one
 * real result into the other's vocabulary, which is exactly the kind of
 * silent re-labelling this codebase forbids.
 *
 * `counterfactualCompare.ts` explicitly refuses a two-model comparison
 * ("Porównanie różnych modeli jest osobnym, niewdrożonym protokołem
 * Model-vs-Model") — `modelVsModelCompare.ts` IS that protocol, and until now
 * nothing in the application ever called it.
 *
 * NOTHING IS COMPUTED HERE. Every number rendered below is read off a real
 * `ExperimentRun`. This panel chooses the two models and the sweep points,
 * and displays what came back.
 */

/**
 * The two registered models this panel opens on: Newtonian and relativistic
 * kinetic energy. They are the honest default because they are exact
 * closed-form physics with a textbook-known answer — they must agree at low
 * velocity and diverge as v approaches c — so a reader can check the panel
 * against physics rather than trust it.
 */
const MODEL_A_ID = 'particle-newtonian-energy';
const MODEL_B_ID = 'particle-relativistic-energy';
const OBSERVABLE = 'kineticEnergyMeV';
const SWEEP_PARAMETER = 'velocityFraction';
const SWEEP_VALUES: readonly number[] = [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 0.99];
const REST_MASS_MEV = 0.511; // electron

function baseRequest(modelId: string): StructuredExperimentRequest {
  return {
    contractVersion: '1.0.0',
    sourceText: `model-tournament:${modelId}`,
    domainId: 'particle',
    operation: 'compute',
    modelId,
    parameters: { restMassMeV: REST_MASS_MEV },
  };
}

function requestAt(modelId: string, velocityFraction: number): StructuredExperimentRequest {
  const base = baseRequest(modelId);
  return { ...base, parameters: { ...base.parameters, velocityFraction } };
}

const VERDICT_LABEL: Readonly<Record<ReturnType<typeof verdictOf>, string>> = {
  MODELS_AGREE: 'MODELE ZGODNE',
  MODELS_DIVERGE: 'MODELE ROZBIEŻNE',
  UNTESTED: 'NIEPRZETESTOWANE',
};

function Comparison({ comparison }: { comparison: ModelVsModelComparison }) {
  const verdict = verdictOf(comparison);
  if (comparison.metric === null) {
    return (
      <p className="settings-hint" data-testid="tournament-blocked">
        {VERDICT_LABEL[verdict]} — status {comparison.status}. {comparison.disclaimer}
        {comparison.validationErrors.length > 0 && <> ({comparison.validationErrors.join('; ')})</>}
      </p>
    );
  }
  const { metric } = comparison;
  return (
    <dl className="pilot-provenance" data-testid="tournament-comparison">
      <div><dt>{comparison.labels.modelA}</dt><dd className="mono">{metric.modelAValue.toPrecision(6)} {metric.unit}</dd></div>
      <div><dt>{comparison.labels.modelB}</dt><dd className="mono">{metric.modelBValue.toPrecision(6)} {metric.unit}</dd></div>
      <div><dt>różnica bezwzględna</dt><dd className="mono">{metric.absoluteDelta.toPrecision(6)} {metric.unit}</dd></div>
      <div><dt>rozbieżność względna</dt><dd className="mono" data-testid="tournament-divergence">{metric.relativeDivergence.toFixed(4)}</dd></div>
      <div><dt>werdykt</dt><dd className="mono" data-testid="tournament-verdict">{VERDICT_LABEL[verdict]}</dd></div>
      <div><dt>kontrola ziarna</dt><dd className="mono">{comparison.seedControl === null ? '—' : comparison.seedControl.status}</dd></div>
    </dl>
  );
}

export function ModelTournamentPanel() {
  const [velocityFraction, setVelocityFraction] = useState(0.9);

  /** Two real executions per change of the slider — cheap, closed-form models. */
  const comparison = useMemo(() => compareModelVsModel({
    observableKey: OBSERVABLE,
    modelA: requestAt(MODEL_A_ID, velocityFraction),
    modelB: requestAt(MODEL_B_ID, velocityFraction),
    labels: { modelA: 'Newton (klasyczna)', modelB: 'Einstein (relatywistyczna)' },
  }), [velocityFraction]);

  /** The sweep is the actual point of the panel: WHERE to measure, not just what the models say here. */
  const sweep = useMemo(() => sweepModelDivergence(
    baseRequest(MODEL_A_ID), baseRequest(MODEL_B_ID),
    SWEEP_PARAMETER, SWEEP_VALUES, OBSERVABLE,
    { modelA: 'Newton (klasyczna)', modelB: 'Einstein (relatywistyczna)' },
  ), []);

  return (
    <section className="pilot-step" aria-label="Turniej modeli" data-testid="model-tournament">
      <h2>Turniej modeli — Newton vs Einstein</h2>
      <p className="settings-hint">
        Oba modele są NAPRAWDĘ uruchamiane (ten sam <span className="mono">runExperiment</span>, którego używa reszta
        Genesis) i porównywane na jednej wspólnej obserwabli <span className="mono">{OBSERVABLE}</span> dla elektronu
        ({REST_MASS_MEV} MeV). Żadna liczba poniżej nie jest tu liczona — wszystkie są odczytane z realnych przebiegów.
      </p>

      <label>
        Prędkość v/c: <strong data-testid="tournament-velocity">{velocityFraction.toFixed(2)}</strong>
        <input
          type="range" min={0.01} max={0.99} step={0.01} value={velocityFraction}
          data-testid="tournament-velocity-slider"
          onChange={(e) => setVelocityFraction(Number(e.target.value))}
        />
      </label>
      <Comparison comparison={comparison} />

      <h3>Gdzie te modele najbardziej się rozjeżdżają?</h3>
      <div className="compare-table-wrap">
        <table className="compare-table" data-testid="tournament-sweep">
          <thead>
            <tr><th>v/c</th><th>Newton</th><th>Einstein</th><th>rozbieżność</th><th>werdykt</th></tr>
          </thead>
          <tbody>
            {sweep.points.map((point) => {
              const metric = point.comparison.metric;
              return (
                <tr key={point.parameterValue} data-testid={`tournament-sweep-row-${point.parameterValue}`}>
                  <td className="mono">{point.parameterValue}</td>
                  <td className="mono">{metric === null ? '—' : metric.modelAValue.toPrecision(5)}</td>
                  <td className="mono">{metric === null ? '—' : metric.modelBValue.toPrecision(5)}</td>
                  <td className="mono">{metric === null ? '—' : metric.relativeDivergence.toFixed(4)}</td>
                  <td className="mono">{VERDICT_LABEL[verdictOf(point.comparison)]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="pilot-summary" data-testid="tournament-most-discriminating">
        {sweep.mostDiscriminatingValue === null
          ? 'Żaden punkt nie dał rozstrzygającego porównania — nie wskazujemy eksperymentu.'
          : `Najbardziej rozróżniający eksperyment: v/c = ${sweep.mostDiscriminatingValue} ` +
            `(rozbieżność ${sweep.mostDiscriminatingDivergence?.toFixed(4)}).`}
      </p>

      {/* The module's own disclaimer, rendered rather than paraphrased: the
          cutoff is a disclosed, arbitrary-but-stated distance, never a p-value,
          and "most discriminating" is a heuristic, never information gain. */}
      <p className="settings-hint" data-testid="tournament-disclaimer">{sweep.reasoning}</p>
      <p className="settings-hint">
        Próg zgodności to jawnie zadeklarowana wartość {MODEL_AGREEMENT_THRESHOLD} znormalizowanej odległości — nie jest
        to p-value, przedział ufności ani prawdopodobieństwo.
      </p>
    </section>
  );
}
