import { useMemo, useState } from 'react';
import {
  listRouterModels,
  getRouterModel,
  parseScienceChatMessage,
  planEvidenceGuidedExperiment,
  confirmEvidenceGuidedExperiment,
  isBackendEvidenceGuidedPlan,
  createScenarioCapsule,
  serializeScenarioCapsule,
  replayScenarioCapsule,
  type EvidenceGuidedExperimentPlan,
  type ConfirmedEvidenceGuidedExperiment,
  type ReproducibleScenarioCapsule,
  type ScenarioCapsuleReplay,
  type ExperimentValue,
  designScientificExperiment,
  executeScientificExperiment,
  type ScientificExperimentDesign,
  type ScientificEvidenceChain,
} from '../core/experimentFabric';
import { confirmBackendEvidenceGuidedExperiment } from '../core/experimentFabric/backendExecution';
import { buildStructuredRequestFromModel } from '../core/experimentFabric/structuredRequestBuilder';
import { track } from '../core/analytics';

/**
 * PILOT UI — Science Chat → eksperyment → wynik → provenance → Scenario
 * Capsule → eksport, w JEDNYM ekranie, dla realnego pilota.
 *
 * Świadomie NIE dubluje `core/experimentFabric`: ten komponent tylko woła
 * istniejące, czyste funkcje (`planEvidenceGuidedExperiment`,
 * `confirmEvidenceGuidedExperiment` / `confirmBackendEvidenceGuidedExperiment`,
 * `createScenarioCapsule`, `serializeScenarioCapsule`,
 * `replayScenarioCapsule`) — nie ma tu żadnej nowej logiki naukowej,
 * drugiego parsera ani drugiego provenance.
 *
 * Dwa deterministyczne wejścia (żadne nie jest LLM):
 *  - ustrukturyzowany formularz (wybór modelu + pola z jego własnego
 *    `parameterSchema`, przez `buildStructuredRequestFromModel`);
 *  - wolny tekst przez ISTNIEJĄCY, deterministyczny `parseScienceChatMessage`.
 */

type Phase = 'draft' | 'planned' | 'running' | 'ran' | 'capsuled';

const CAPABILITY_LABEL: Record<string, string> = {
  REAL_ENGINE: 'Rzeczywisty silnik (klient)',
  BACKEND_REAL_ENGINE: 'Rzeczywisty silnik (backend)',
  HYPOTHETICAL_VISUALIZATION: 'Wizualizacja hipotetyczna',
  KNOWLEDGE_ONLY: 'Tylko wiedza (bez wyniku)',
  CAPABILITY_SEAM: 'Zdolność niedostępna (seam)',
  ENGINE_NOT_AVAILABLE: 'Silnik niedostępny',
};

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExperimentPilotScreen() {
  const models = useMemo(() => listRouterModels(), []);
  const [inputMode, setInputMode] = useState<'structured' | 'freeText' | 'protocol'>('structured');
  const [modelId, setModelId] = useState<string>(() => (getRouterModel('epidemic-city') ? 'epidemic-city' : models[0]?.id ?? ''));
  const [paramInputs, setParamInputs] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState('');
  const [seedInput, setSeedInput] = useState('');

  const [phase, setPhase] = useState<Phase>('draft');
  const [plan, setPlan] = useState<EvidenceGuidedExperimentPlan | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedEvidenceGuidedExperiment | null>(null);
  const [capsule, setCapsule] = useState<ReproducibleScenarioCapsule | null>(null);
  const [replay, setReplay] = useState<ScenarioCapsuleReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [protocolStatement, setProtocolStatement] = useState('Zmienność parametru wpływa na wynik modelu w sposób zgodny z kryterium.');
  const [protocolParameter, setProtocolParameter] = useState('');
  const [protocolMetric, setProtocolMetric] = useState('');
  const [protocolValues, setProtocolValues] = useState('');
  const [protocolRepetitions, setProtocolRepetitions] = useState('2');
  const [protocolRelation, setProtocolRelation] = useState<'greater-than' | 'less-than' | 'equal-within-tolerance' | 'monotonic-increase' | 'monotonic-decrease'>('greater-than');
  const [protocolExpectedValue, setProtocolExpectedValue] = useState('');
  const [protocolTolerance, setProtocolTolerance] = useState('');
  const [protocolDesign, setProtocolDesign] = useState<ScientificExperimentDesign | null>(null);
  const [protocolEvidence, setProtocolEvidence] = useState<ScientificEvidenceChain | null>(null);

  const selectedModel = modelId ? getRouterModel(modelId) : undefined;

  function resetDownstream() {
    setConfirmed(null);
    setCapsule(null);
    setReplay(null);
    setProtocolDesign(null);
    setProtocolEvidence(null);
    setError(null);
  }

  function buildBaselineRequest() {
    if (!selectedModel) throw new Error('Wybierz model przed zbudowaniem protokołu.');
    return buildStructuredRequestFromModel(
      selectedModel,
      Object.fromEntries(
        Object.entries(paramInputs)
          .filter(([, v]) => v.trim() !== '')
          .map(([k, v]): [string, ExperimentValue] => {
            const spec = selectedModel.parameters.find((p) => p.id === k);
            if (spec?.type === 'number') return [k, Number(v)];
            if (spec?.type === 'boolean') return [k, v === 'true'];
            return [k, v];
          }),
      ),
      { seed: seedInput.trim() ? Number(seedInput) : undefined },
    );
  }

  function handleBuildProtocol() {
    setError(null);
    setProtocolEvidence(null);
    try {
      const baselineRequest = buildBaselineRequest();
      if (!baselineRequest.modelId) throw new Error('Wybrany model nie ma identyfikatora wykonawczego.');
      if (!protocolMetric.trim()) throw new Error('Podaj dokładny output key metryki z wyniku modelu.');
      const values = protocolValues.split(',').map((value) => value.trim()).filter(Boolean).map((value) => Number(value));
      if (values.some((value) => !Number.isFinite(value))) throw new Error('Sweep musi zawierać liczby oddzielone przecinkami.');
      if (!protocolParameter) throw new Error('Wybierz parametr sweepu.');
      const criterion = {
        metric: protocolMetric.trim(),
        relation: protocolRelation,
        ...(protocolExpectedValue.trim() ? { expectedValue: Number(protocolExpectedValue) } : {}),
        ...(protocolTolerance.trim() ? { tolerance: Number(protocolTolerance) } : {}),
        rationale: 'Kryterium zostało zadeklarowane przed wykonaniem armów.',
      } as const;
      const built = designScientificExperiment({
        hypothesis: {
          statement: protocolStatement.trim(),
          domainId: baselineRequest.domainId,
          modelId: baselineRequest.modelId,
          declaredAssumptions: ['Wynik obowiązuje wyłącznie w granicach wybranego modelu i jego parametrów.'],
          falsification: criterion,
        },
        baselineRequest,
        sweep: { parameter: protocolParameter, values, label: selectedModel?.parameters.find((p) => p.id === protocolParameter)?.label ?? protocolParameter },
        repetitionsPerArm: Number(protocolRepetitions),
      });
      setProtocolDesign(built);
      setPhase('planned');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleExecuteProtocol() {
    if (!protocolDesign) return;
    setBusy(true);
    setError(null);
    try {
      setProtocolEvidence(executeScientificExperiment(protocolDesign));
      setPhase('ran');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleBuildPlan() {
    setError(null);
    resetDownstream();
    try {
      const request = inputMode === 'freeText'
        ? parseScienceChatMessage(freeText)
        : selectedModel
          ? buildStructuredRequestFromModel(
              selectedModel,
              Object.fromEntries(
                Object.entries(paramInputs)
                  .filter(([, v]) => v.trim() !== '')
                  .map(([k, v]): [string, ExperimentValue] => {
                    const spec = selectedModel.parameters.find((p) => p.id === k);
                    if (spec?.type === 'number') return [k, Number(v)];
                    if (spec?.type === 'boolean') return [k, v === 'true'];
                    return [k, v];
                  }),
              ),
              { seed: seedInput.trim() ? Number(seedInput) : undefined },
            )
          : null;
      if (!request) throw new Error('Wybierz model przed zbudowaniem planu.');
      const built = planEvidenceGuidedExperiment(request);
      setPlan(built);
      setPhase('planned');
      track('what_if_opened');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleConfirmAndRun() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const result = isBackendEvidenceGuidedPlan(plan)
        ? await confirmBackendEvidenceGuidedExperiment(plan)
        : confirmEvidenceGuidedExperiment(plan);
      setConfirmed(result);
      setPhase('ran');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleGenerateCapsule() {
    if (!confirmed) return;
    try {
      const built = createScenarioCapsule({
        title: `Pilot: ${confirmed.run.request.modelId ?? confirmed.run.request.domainId} — ${confirmed.run.runId.slice(0, 8)}`,
        baselineRun: confirmed.run,
      });
      setCapsule(built);
      setReplay(null);
      setPhase('capsuled');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleExport() {
    if (!capsule) return;
    downloadJson(`${capsule.capsuleId}.json`, serializeScenarioCapsule(capsule));
  }

  function handleVerifyReplay() {
    if (!capsule) return;
    setReplay(replayScenarioCapsule(capsule));
  }

  function handleReset() {
    setPhase('draft');
    setPlan(null);
    resetDownstream();
  }

  return (
    <main className="pilot-view" id="main-content" tabIndex={-1}>
      <div className="pilot-intro">
        <p>
          Reprodukowalny eksperyment krok po kroku: wybierz model (albo opisz go zwykłym zdaniem), zobacz jawny plan
          zanim cokolwiek się policzy, potwierdź, uruchom istniejący silnik, i zamień prawdziwy wynik w przenośny,
          odtwarzalny dowód metody — Scenario Capsule do pobrania.
        </p>
      </div>

      <section className="pilot-step">
        <h2>1 · Opisz eksperyment</h2>
        <div className="pilot-mode-switch" role="tablist" aria-label="Sposób wprowadzania eksperymentu">
          <button className="chip-btn" aria-pressed={inputMode === 'structured'} onClick={() => setInputMode('structured')}>Pojedynczy run</button>
          <button className="chip-btn" aria-pressed={inputMode === 'protocol'} onClick={() => { setInputMode('protocol'); setPhase('draft'); resetDownstream(); }}>Protocol / A-B</button>
          <button className="chip-btn" aria-pressed={inputMode === 'freeText'} onClick={() => setInputMode('freeText')}>Zwykły tekst</button>
        </div>

        {inputMode === 'structured' || inputMode === 'protocol' ? (
          <div className="pilot-form">
            <label className="pilot-field">
              <span>Model</span>
              <select
                className="pilot-input"
                value={modelId}
                onChange={(e) => { setModelId(e.target.value); setParamInputs({}); setPhase('draft'); resetDownstream(); }}
              >
                {models.map((m) => <option key={m.id} value={m.id}>{m.id} — {m.domainId}</option>)}
              </select>
            </label>
            {selectedModel && (
              <>
                <p className="pilot-rationale">{selectedModel.rationale}</p>
                {selectedModel.parameters.map((spec) => (
                  <label className="pilot-field" key={spec.id}>
                    <span>{spec.label}{spec.unit ? ` (${spec.unit})` : ''}</span>
                    <input
                      className="pilot-input"
                      type={spec.type === 'number' ? 'number' : 'text'}
                      placeholder={spec.default !== undefined ? String(spec.default) : ''}
                      min={spec.min}
                      max={spec.max}
                      value={paramInputs[spec.id] ?? ''}
                      onChange={(e) => setParamInputs((prev) => ({ ...prev, [spec.id]: e.target.value }))}
                    />
                  </label>
                ))}
                <label className="pilot-field">
                  <span>Seed (opcjonalnie — dla odtwarzalności)</span>
                  <input className="pilot-input" type="number" value={seedInput} onChange={(e) => setSeedInput(e.target.value)} />
                </label>
              </>
            )}
          </div>
        ) : (
          <div className="pilot-form">
            <label className="pilot-field">
              <span>Opisz eksperyment jednym zdaniem (deterministyczny parser, bez LLM)</span>
              <textarea
                className="pilot-input pilot-textarea"
                rows={2}
                placeholder="np. „symuluj epidemię w mieście r0=3 90 dni”"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
              />
            </label>
          </div>
        )}

        {inputMode === 'protocol' && selectedModel && (
          <div className="pilot-protocol-form">
            <label className="pilot-field"><span>Hipoteza (kandydat, nie odkrycie)</span><textarea className="pilot-input pilot-textarea" rows={2} value={protocolStatement} onChange={(e) => setProtocolStatement(e.target.value)} /></label>
            <label className="pilot-field"><span>Parametr sweepu</span><select className="pilot-input" value={protocolParameter} onChange={(e) => setProtocolParameter(e.target.value)}><option value="">— wybierz parametr —</option>{selectedModel.parameters.filter((p) => p.type === 'number').map((p) => <option key={p.id} value={p.id}>{p.label}{p.unit ? ` (${p.unit})` : ''}</option>)}</select></label>
            <label className="pilot-field"><span>Primary metric output key</span><input className="pilot-input" value={protocolMetric} onChange={(e) => setProtocolMetric(e.target.value)} placeholder="np. I, radiusKm, totalEnergyMeV" /></label>
            <label className="pilot-field"><span>Wartości sweepu (liczby, przecinki)</span><input className="pilot-input" value={protocolValues} onChange={(e) => setProtocolValues(e.target.value)} placeholder="np. 1, 2, 3" /></label>
            <div className="pilot-protocol-grid">
              <label className="pilot-field"><span>Powtórzenia / arm</span><input className="pilot-input" type="number" min="1" max="5" value={protocolRepetitions} onChange={(e) => setProtocolRepetitions(e.target.value)} /></label>
              <label className="pilot-field"><span>Relacja kryterium</span><select className="pilot-input" value={protocolRelation} onChange={(e) => setProtocolRelation(e.target.value as typeof protocolRelation)}><option value="greater-than">greater-than</option><option value="less-than">less-than</option><option value="equal-within-tolerance">equal-within-tolerance</option><option value="monotonic-increase">monotonic-increase</option><option value="monotonic-decrease">monotonic-decrease</option></select></label>
            </div>
            {(protocolRelation === 'greater-than' || protocolRelation === 'less-than' || protocolRelation === 'equal-within-tolerance') && <div className="pilot-protocol-grid"><label className="pilot-field"><span>Expected value (opcjonalnie)</span><input className="pilot-input" type="number" value={protocolExpectedValue} onChange={(e) => setProtocolExpectedValue(e.target.value)} /></label>{protocolRelation === 'equal-within-tolerance' && <label className="pilot-field"><span>Tolerance</span><input className="pilot-input" type="number" min="0" value={protocolTolerance} onChange={(e) => setProtocolTolerance(e.target.value)} /></label>}</div>}
            <p className="pilot-rationale">Planner wymaga istniejącego REAL_ENGINE. Każdy arm jest prerejestrowany przed wykonaniem, a wyniki pochodzą wyłącznie z realnych runów.</p>
          </div>
        )}

        <button className="chip-btn pilot-primary" onClick={inputMode === 'protocol' ? handleBuildProtocol : handleBuildPlan} disabled={inputMode === 'freeText' ? !freeText.trim() : !selectedModel}>
          {inputMode === 'protocol' ? 'Zarejestruj protokół' : 'Zbuduj plan'}
        </button>
      </section>

      {error && <div className="pilot-error" role="alert">⚠ {error}</div>}

      {protocolDesign && (
        <section className="pilot-step pilot-protocol-result">
          <h2>2 · Protokół prerejestrowany (nic jeszcze nie zostało policzone)</h2>
          <div className="pilot-disclosure"><span className="honesty simplified">REAL ENGINE · PREREGISTERED</span><p className="pilot-rationale">{protocolDesign.hypothesis.disclaimer}</p><ul className="pilot-limitations">{protocolDesign.protocolAssumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>
          <dl className="pilot-provenance"><div><dt>designId</dt><dd className="mono">{protocolDesign.designId}</dd></div><div><dt>protocolFingerprint</dt><dd className="mono">{protocolDesign.protocolFingerprint}</dd></div><div><dt>arms</dt><dd>{protocolDesign.arms.length} · {protocolDesign.repetitionsPerArm} powtórzenia</dd></div><div><dt>kryterium</dt><dd>{protocolDesign.hypothesis.falsification.relation} · {protocolDesign.primaryMetric}</dd></div></dl>
          <button className="chip-btn pilot-primary" onClick={handleExecuteProtocol} disabled={busy}>{busy ? 'Wykonuję arm’y…' : 'Potwierdź i wykonaj protokół'}</button>
        </section>
      )}

      {protocolEvidence && (
        <section className="pilot-step pilot-protocol-result">
          <h2>3 · Evidence chain z realnych runów</h2>
          <div className="pilot-disclosure"><span className={`honesty ${protocolEvidence.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL' ? 'simplified' : 'theoretical'}`}>{protocolEvidence.assessment.assessment}</span><p className="pilot-summary">{protocolEvidence.assessment.message}</p></div>
          <dl className="pilot-outputs">{protocolEvidence.arms.map((arm) => <div key={arm.armId} className="pilot-output-row"><dt>{arm.kind} · {arm.armId}</dt><dd>{arm.outputValues.join(' / ')} {arm.units} · {arm.reproduction}</dd></div>)}</dl>
          <dl className="pilot-provenance"><div><dt>evidenceId</dt><dd className="mono">{protocolEvidence.evidenceId}</dd></div><div><dt>runs</dt><dd>{protocolEvidence.allRuns.length} · createdFromRealRunsOnly=true</dd></div><div><dt>provenance</dt><dd className="mono">{protocolEvidence.provenanceFingerprint}</dd></div></dl>
        </section>
      )}

      {plan && inputMode !== 'protocol' && (
        <section className="pilot-step">
          <h2>2 · Plan (nic jeszcze nie zostało policzone)</h2>
          <div className="pilot-disclosure">
            <span className={`honesty ${plan.disclosure.runnable ? 'simplified' : 'theoretical'}`}>
              {CAPABILITY_LABEL[plan.disclosure.capability] ?? plan.disclosure.capability}
            </span>
            <p className="pilot-rationale">{plan.disclosure.rationale}</p>
            <ul className="pilot-limitations">
              {plan.disclosure.limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
            {plan.validationErrors.length > 0 && (
              <ul className="pilot-limitations pilot-errors">
                {plan.validationErrors.map((e, i) => <li key={i}>✗ {e}</li>)}
              </ul>
            )}
          </div>
          <button
            className="chip-btn pilot-primary"
            onClick={handleConfirmAndRun}
            disabled={busy || (plan.status !== 'READY_FOR_CONFIRMATION' && plan.status !== 'READY_FOR_HYPOTHETICAL_CONFIRMATION')}
          >
            {busy ? 'Wykonuję…' : 'Potwierdź i uruchom prawdziwy model'}
          </button>
        </section>
      )}

      {confirmed && (
        <section className="pilot-step">
          <h2>3 · Wynik + provenance</h2>
          <p className="pilot-summary">{confirmed.run.result.summary}</p>
          <dl className="pilot-outputs">
            {Object.entries(confirmed.run.result.outputs).map(([k, v]) => (
              <div key={k} className="pilot-output-row">
                <dt>{k}</dt>
                <dd>{String(v)} {confirmed.run.result.units[k] ?? ''}</dd>
              </div>
            ))}
          </dl>
          {confirmed.run.result.warnings.length > 0 && (
            <ul className="pilot-limitations">
              {confirmed.run.result.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
            </ul>
          )}
          <dl className="pilot-provenance">
            <div><dt>runId</dt><dd className="mono">{confirmed.run.runId}</dd></div>
            <div><dt>runFingerprint</dt><dd className="mono">{confirmed.run.provenance.runFingerprint}</dd></div>
            <div><dt>engine</dt><dd className="mono">{confirmed.run.provenance.engine ?? '—'}</dd></div>
            <div><dt>resultOrigin</dt><dd className="mono">{confirmed.run.provenance.resultOrigin}</dd></div>
          </dl>
          <button className="chip-btn pilot-primary" onClick={handleGenerateCapsule}>Wygeneruj Scenario Capsule</button>
        </section>
      )}

      {capsule && (
        <section className="pilot-step">
          <h2>4 · Scenario Capsule — dowód metody</h2>
          <dl className="pilot-provenance">
            <div><dt>capsuleId</dt><dd className="mono">{capsule.capsuleId}</dd></div>
            <div><dt>baselineRunFingerprint</dt><dd className="mono">{capsule.references.baselineRunFingerprint}</dd></div>
          </dl>
          <p className="pilot-disclaimer">{capsule.disclaimer}</p>
          <div className="pilot-actions">
            <button className="chip-btn pilot-primary" onClick={handleExport}>⬇ Eksportuj (JSON)</button>
            <button className="chip-btn" onClick={handleVerifyReplay}>Zweryfikuj odtwarzalność (replay)</button>
          </div>
          {replay && (
            <p className={`pilot-replay pilot-replay-${replay.status.toLowerCase()}`}>
              {replay.status === 'MATCH' ? '✓' : replay.status === 'DRIFT' ? '⚠' : '✗'} {replay.message}
            </p>
          )}
        </section>
      )}

      {phase !== 'draft' && (
        <div className="pilot-reset-row">
          <button className="chip-btn" onClick={handleReset}>↺ Nowy eksperyment</button>
        </div>
      )}
    </main>
  );
}
