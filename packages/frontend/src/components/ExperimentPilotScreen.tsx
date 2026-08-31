import { useEffect, useMemo, useState } from 'react';
import {
  listRouterModels,
  getRouterModel,
  parseScienceChatMessage,
  planEvidenceGuidedExperiment,
  confirmEvidenceGuidedExperiment,
  confirmEarthquakeEvidenceGuidedExperiment,
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
  executeScientificBackendExperiment,
  explainScientificEvidence,
  createScientificEvidencePack,
  saveScientificEvidencePack,
  getScientificEvidencePack,
  compareScientificEvidencePacks,
  serializeScientificEvidencePack,
  serializeEvidencePackRoCrate,
  analyseExperimentSeries,
  type ScientificExperimentDesign,
  type ScientificEvidenceChain,
  type ScientificEvidencePack,
  type ScientificEvidenceReplayVerdict,
} from '../core/experimentFabric';
import { confirmBackendEvidenceGuidedExperiment } from '../core/experimentFabric/backendExecution';
import { buildStructuredRequestFromModel } from '../core/experimentFabric/structuredRequestBuilder';
import { track } from '../core/analytics';
import { saveScientificEvidencePackToMemory } from '../core/scienceMemory';
import { buildExperimentGraph, executeNextExperiment, type ExperimentGraph } from '../core/experimentFabric/experimentGraph';
import type { ExperimentRun } from '../core/experimentFabric/types';
import { runExperiment } from '../core/experimentFabric/executor';
import { GOVERNED_PREPAREDNESS_QUESTIONS, governedCounterfactualParameters, resolvePreparednessQuestion, type PreparednessResolution } from '../core/simulation/preparednessQuestions';
import {
  executePreregisteredHypotheses,
  generateCompetingHypotheses,
  HYPOTHESIS_PROBLEMS,
  preregisterHypotheses,
  selectNextHypothesisExperiment,
  type HypothesisLoopResult,
  type NextHypothesisExperiment,
  type Preregistration,
} from '../core/experimentFabric/hypothesisLoop';
import { setPendingScenario } from '../core/scenarioBridge';
import { setPendingExperimentWorld, setPendingScenarioTimeline } from '../core/experimentFabric/worldHandoff';
import { analyzeExperimentResult } from '../core/experimentAnalysis';
import { compareAme2020Observations } from '../core/observation/nuclearAme2020';

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
  const [inputMode, setInputMode] = useState<'structured' | 'freeText' | 'protocol'>(() => {
    const mode = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('mode');
    return mode === 'protocol' ? 'protocol' : 'structured';
  });
  const [modelId, setModelId] = useState<string>(() => (getRouterModel('epidemic-city') ? 'epidemic-city' : models[0]?.id ?? ''));
  const [paramInputs, setParamInputs] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState('');
  const [seedInput, setSeedInput] = useState('');

  const [phase, setPhase] = useState<Phase>('draft');
  const [plan, setPlan] = useState<EvidenceGuidedExperimentPlan | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedEvidenceGuidedExperiment | null>(null);
  /**
   * Historia REALNYCH przebiegów tej sesji Pilota. Graf eksperymentu jest
   * odczytem tego stanu — nie osobnym magazynem i nie ilustracją.
   */
  const [runHistory, setRunHistory] = useState<ExperimentRun[]>([]);
  const [graph, setGraph] = useState<ExperimentGraph | null>(null);
  const [graphNotice, setGraphNotice] = useState<string | null>(null);
  // Rządzone pytanie o gotowość: bramka między zdaniem użytkownika a tym, co
  // Genesis wolno uruchomić. Brak dopasowania = NOT_AVAILABLE i zero runów.
  const [preparednessText, setPreparednessText] = useState('');
  const [preparedness, setPreparedness] = useState<PreparednessResolution | null>(null);
  // Autonomiczna pętla hipotez: prerejestracja przed wykonaniem, wykonanie na
  // istniejącym silniku, status z prerejestrowanego kryterium, następny krok
  // ze stanu — nic z tego nie jest tekstem wygenerowanym po fakcie.
  const [prereg, setPrereg] = useState<Preregistration | null>(null);
  const [loopResult, setLoopResult] = useState<HypothesisLoopResult | null>(null);
  const [nextStep, setNextStep] = useState<NextHypothesisExperiment | null>(null);
  const [loopBusy, setLoopBusy] = useState(false);
  const [loopNotice, setLoopNotice] = useState<string | null>(null);
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
  const [protocolAdvice, setProtocolAdvice] = useState<ReturnType<typeof explainScientificEvidence> | null>(null);
  const [replayReferencePack, setReplayReferencePack] = useState<ScientificEvidencePack | null>(null);
  const [replayVerdict, setReplayVerdict] = useState<ScientificEvidenceReplayVerdict | null>(null);

  const selectedModel = modelId ? getRouterModel(modelId) : undefined;

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const evidencePackId = params.get('replay');
    if (!evidencePackId) return;
    const stored = getScientificEvidencePack(evidencePackId);
    if (!stored) {
      setError(`Nie znaleziono lokalnego Evidence Pack: ${evidencePackId}`);
      return;
    }
    setInputMode('protocol');
    setModelId(stored.pack.protocol.hypothesis.modelId);
    setProtocolDesign(stored.pack.protocol);
    setReplayReferencePack(stored.pack);
    setReplayVerdict(null);
    setProtocolEvidence(null);
    setProtocolAdvice(null);
    setPhase('planned');
  }, []);

  const protocolSeriesAnalysis = useMemo(() => {
    if (!protocolEvidence || !protocolParameter.trim()) return null;
    return analyseExperimentSeries(protocolEvidence.allRuns, protocolParameter, protocolEvidence.design.primaryMetric);
  }, [protocolEvidence, protocolParameter]);

  function resetDownstream() {
    setConfirmed(null);
    setCapsule(null);
    setReplay(null);
    setProtocolDesign(null);
    setProtocolEvidence(null);
    setProtocolAdvice(null);
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
    setProtocolAdvice(null);
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

  async function handleExecuteProtocol() {
    if (!protocolDesign) return;
    setBusy(true);
    setError(null);
    try {
      const evidence = getRouterModel(protocolDesign.hypothesis.modelId)?.capability === 'BACKEND_REAL_ENGINE'
        ? await executeScientificBackendExperiment(protocolDesign)
        : executeScientificExperiment(protocolDesign);
      setProtocolEvidence(evidence);
      const pack = createScientificEvidencePack(evidence);
      saveScientificEvidencePack(pack);
      saveScientificEvidencePackToMemory(pack);
      setReplayVerdict(replayReferencePack ? compareScientificEvidencePacks(replayReferencePack, pack) : null);
      setProtocolAdvice(explainScientificEvidence(evidence));
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
        : plan.request.modelId === 'earthquake-scenario'
          ? await confirmEarthquakeEvidenceGuidedExperiment(plan)
          : confirmEvidenceGuidedExperiment(plan);
      setConfirmed(result);
      const history = [...runHistory, result.run];
      setRunHistory(history);
      setGraph(buildExperimentGraph({ question: plan.request.sourceText, runs: history }));
      setGraphNotice(null);
      setPhase('ran');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleExportProtocolEvidence() {
    if (!protocolEvidence) return;
    const pack = createScientificEvidencePack(protocolEvidence);
    downloadJson(`${pack.evidencePackId}.json`, serializeScientificEvidencePack(pack));
  }

  function handleExportProtocolRoCrate() {
    if (!protocolEvidence) return;
    const pack = createScientificEvidencePack(protocolEvidence);
    downloadJson(`${pack.evidencePackId}.ro-crate.json`, serializeEvidencePackRoCrate(pack));
  }

  function handleOpenVisualization() {
    const run = confirmed?.run;
    if (!run) return;
    const route = run.result.route;
    if (route.kind === 'live-world') {
      if (!setPendingScenarioTimeline(run.runId) && !setPendingExperimentWorld(run.runId)) {
        setError('Wynik ma trasę World, ale live simulation nie jest dostępna w tej sesji. Replay nie został uruchomiony.');
        return;
      }
      window.location.hash = route.hash;
    } else if (route.kind === 'lab') {
      setPendingScenario(route.labId, run.provenance.parameterSnapshot, route.experimentId);
      window.location.hash = `#/lab/${route.labId}`;
    } else if (route.kind === 'hypothetical-visualization') {
      window.location.hash = route.hash;
    } else {
      setError('Ten wynik nie ma zarejestrowanej trasy wizualizacji.');
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

  /**
   * Rozstrzyga pytanie względem katalogu rządzonego i — tylko przy GOVERNED —
   * buduje plan kontrfaktyku z zadeklarowanych dźwigni. Pytanie niedopasowane
   * NIE uruchamia niczego: pokazujemy NOT_AVAILABLE i listę tego, co istnieje.
   */
  function handleResolvePreparedness(text: string, questionId?: string) {
    const resolution = resolvePreparednessQuestion(text, questionId);
    setPreparedness(resolution);
    setError(null);
    if (resolution.status !== 'GOVERNED' || resolution.question === null) {
      setPlan(null);
      resetDownstream();
      return;
    }
    const model = getRouterModel('scenario-counterfactual');
    if (model === undefined) {
      setError('Model scenario-counterfactual nie jest zarejestrowany w routerze.');
      return;
    }
    const request = buildStructuredRequestFromModel(model, {
      ...governedCounterfactualParameters(resolution.question),
      preparednessQuestionId: resolution.question.questionId,
      preparednessAskedText: resolution.askedText,
    }, { sourceText: resolution.askedText, seed: resolution.question.levers.seed });
    try {
      setPlan(planEvidenceGuidedExperiment(request));
      resetDownstream();
      setPhase('planned');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleReset() {
    setPhase('draft');
    setPlan(null);
    resetDownstream();
  }

  return (
    <main className="pilot-view" id="main-content" tabIndex={-1}>
      <section className="pilot-step" aria-label="Autonomiczna pętla hipotez">
        <h2>0a · Problem → konkurencyjne hipotezy → prerejestracja → wykonanie</h2>
        <p className="settings-hint">
          Genesis stawia hipotezy z WŁASNEJ zadeklarowanej powierzchni modelu, zamraża je razem z kryteriami
          falsyfikacji PRZED jakimkolwiek przebiegiem, wykonuje je istniejącym silnikiem i przypisuje status
          z prerejestrowanego kryterium. Zmiana hipotezy po zobaczeniu wyniku jest wykrywana, nie dopuszczana.
        </p>
        <p className="pilot-disclaimer">
          SYNTHETIC · SCENARIO · NON_OPERATIONAL · NOT_CALIBRATED — to nie jest odkrycie naukowe,
          obserwacja świata ani wskazówka operacyjna.
        </p>
        <div className="pilot-actions">
          {HYPOTHESIS_PROBLEMS.map((problem) => (
            <button
              key={problem.problemId}
              className="chip-btn"
              disabled={loopBusy}
              onClick={() => {
                const registered = preregisterHypotheses(generateCompetingHypotheses(problem));
                setPrereg(registered);
                setLoopResult(null);
                setNextStep(null);
                setLoopNotice(`Prerejestrowano ${registered.hypotheses.length} konkurencyjnych hipotez. Nic jeszcze nie zostało uruchomione.`);
              }}
            >
              {problem.statement}
            </button>
          ))}
        </div>
        {prereg && (
          <>
            <dl className="pilot-provenance">
              <div><dt>preregistrationId</dt><dd className="mono">{prereg.preregistrationId}</dd></div>
              <div><dt>fingerprint</dt><dd className="mono">{prereg.preregistrationFingerprint}</dd></div>
              <div><dt>createdAt</dt><dd className="mono">{prereg.createdAt}</dd></div>
            </dl>
            <details className="settings-details" open>
              <summary>Prerejestrowane hipotezy ({prereg.hypotheses.length})</summary>
              {prereg.hypotheses.map((hypothesis) => {
                const outcome = loopResult?.outcomes.find((entry) => entry.hypothesisId === hypothesis.hypothesisId);
                return (
                  <section key={hypothesis.hypothesisId}>
                    <strong>{outcome?.status ?? hypothesis.status} · {hypothesis.statement}</strong>
                    <p className="settings-hint">PRZEWIDYWANIE: {hypothesis.predictedOutcome}</p>
                    <p className="settings-hint">CO JĄ OBALI: {hypothesis.falsificationCriteria.metric} {hypothesis.falsificationCriteria.relation} — {hypothesis.falsificationCriteria.rationale}</p>
                    <p className="settings-hint">CO JĄ ODRÓŻNIA: {hypothesis.expectedDiscriminator}</p>
                    <p className="settings-hint">DLACZEGO: {hypothesis.rationale}</p>
                    <p className="settings-hint mono">
                      {hypothesis.hypothesisId} · createdBeforeRun={String(hypothesis.createdBeforeRun)}
                      {outcome ? ` · ${hypothesis.falsificationCriteria.metric}=${outcome.observedMetric ?? 'brak'} (odniesienie ${outcome.baselineMetric ?? 'brak'}) · ${outcome.evidencePackId ?? 'brak paczki'}` : ' · nie uruchomiono'}
                    </p>
                    {outcome && outcome.runIds.length > 0 && (
                      <p className="settings-hint mono">
                        runIds: {[...new Set(outcome.runIds)].join(', ')} · odciski: {[...new Set(outcome.runFingerprints)].join(', ')} · chain {outcome.evidenceChainId ?? 'brak'}
                      </p>
                    )}
                  </section>
                );
              })}
            </details>
            <div className="pilot-actions">
              <button
                className="chip-btn pilot-primary"
                disabled={loopBusy || loopResult !== null}
                onClick={() => {
                  setLoopBusy(true);
                  try {
                    const executed = executePreregisteredHypotheses(prereg);
                    setLoopResult(executed);
                    setNextStep(selectNextHypothesisExperiment(executed));
                    setLoopNotice(executed.claim);
                  } catch (loopError) {
                    setLoopNotice(`Pętla nie wykonała się: ${loopError instanceof Error ? loopError.message : String(loopError)}`);
                  } finally {
                    setLoopBusy(false);
                  }
                }}
              >
                {loopBusy ? 'Wykonuję…' : 'Wykonaj prerejestrowane hipotezy'}
              </button>
            </div>
          </>
        )}
        {loopResult && (
          <>
            <dl className="pilot-provenance">
              <div><dt>prerejestracja nienaruszona</dt><dd className="mono">{String(loopResult.preregistrationIntact.intact)}</dd></div>
              <div><dt>realne przebiegi</dt><dd className="mono">{loopResult.allRuns.length}</dd></div>
              <div><dt>Evidence Packs</dt><dd className="mono">{loopResult.packs.map((pack) => pack.evidencePackId).join(', ')}</dd></div>
            </dl>
            <p className="pilot-summary">ROZSTRZYGNIĘCIE: {loopResult.discrimination.reason}</p>
            <p className="settings-hint">{loopResult.preregistrationIntact.reason}</p>
            {nextStep && (
              <>
                <h3>Następny eksperyment</h3>
                <p className="settings-hint">STATUS: {nextStep.status}</p>
                <p className="settings-hint">DLACZEGO: {nextStep.why}</p>
                <p className="settings-hint">CO ROZSTRZYGNIE: {nextStep.resolves}</p>
                <p className="settings-hint">REGUŁA: {nextStep.rule}</p>
                <div className="pilot-actions">
                  <button
                    className="chip-btn pilot-primary"
                    disabled={nextStep.status !== 'READY_TO_RUN' || nextStep.request === null}
                    onClick={() => {
                      if (nextStep.request === null) return;
                      const executed = runExperiment(nextStep.request);
                      setLoopNotice(`Wykonano następny eksperyment: ${executed.runId} (${executed.result.status}); ${nextStep.request.modelId} · ${executed.result.summary}`);
                    }}
                  >
                    Wykonaj następny eksperyment
                  </button>
                </div>
              </>
            )}
          </>
        )}
        {loopNotice && <p className="settings-hint" role="status">{loopNotice}</p>}
      </section>

      <section className="pilot-step" aria-label="Rządzone pytanie o gotowość">
        <h2>0 · Pytanie o gotowość — rządzony scenariusz</h2>
        <p className="settings-hint">
          Wybierz pytanie albo wpisz je własnymi słowami. Pytanie mapuje się wyłącznie na ISTNIEJĄCY kontrakt
          scenariusza. Pytanie spoza katalogu kończy się statusem NOT_AVAILABLE i nie uruchamia żadnego modelu —
          scenariusz „zbliżony" odpowiadałby na inne pytanie niż zadane.
        </p>
        <p className="pilot-disclaimer">
          SYNTHETIC · SCENARIO · NON_OPERATIONAL · NOT_CALIBRATED — dane i dźwignie są demonstracyjne, nie pochodzą
          z żadnej rzeczywistej epidemii, miasta ani placówki i nie są wskazówką operacyjną.
        </p>
        <div className="pilot-actions">
          {GOVERNED_PREPAREDNESS_QUESTIONS.map((entry) => (
            <button
              key={entry.questionId}
              className="chip-btn"
              onClick={() => { setPreparednessText(entry.question); handleResolvePreparedness(entry.question, entry.questionId); }}
            >
              {entry.question}
            </button>
          ))}
        </div>
        <label className="account-field">
          <span>Albo zadaj pytanie własnymi słowami</span>
          <input
            className="pilot-input governed-question-input"
            value={preparednessText}
            onChange={(event) => setPreparednessText(event.target.value)}
            placeholder="np. ile kosztuje opóźnienie izolacji objawowych o 20 dni?"
          />
        </label>
        <div className="pilot-actions">
          <button className="chip-btn pilot-primary" disabled={!preparednessText.trim()} onClick={() => handleResolvePreparedness(preparednessText)}>
            Utwórz rządzony scenariusz
          </button>
        </div>
        {preparedness && (
          <>
            <dl className="pilot-provenance">
              <div><dt>status</dt><dd className="mono">{preparedness.status}</dd></div>
              <div><dt>questionId</dt><dd className="mono">{preparedness.question?.questionId ?? 'brak'}</dd></div>
              <div><dt>resolutionFingerprint</dt><dd className="mono">{preparedness.resolutionFingerprint}</dd></div>
            </dl>
            <p className="settings-hint" role="status">{preparedness.reason}</p>
            {preparedness.status === 'GOVERNED' && preparedness.question && (
              <p className="settings-hint">
                RZĄDZONA RÓŻNICA: {preparedness.question.governedDifference} · odniesienie {preparedness.question.baselineScenarioId} (dzień {preparedness.question.levers.baselineInterventionStartDay})
                {' '}vs wariant {preparedness.question.variantScenarioId} (dzień {preparedness.question.levers.variantInterventionStartDay}) · ziarno {preparedness.question.levers.seed}
                {' '}· populacja {preparedness.question.levers.nAgents} · {preparedness.question.levers.days} dni
              </p>
            )}
            {preparedness.status === 'NOT_AVAILABLE' && (
              <details className="settings-details" open>
                <summary>Pytania, które Genesis potrafi wykonać ({preparedness.available.length})</summary>
                {preparedness.available.map((entry) => <p className="settings-hint" key={entry.questionId}>{entry.question}</p>)}
              </details>
            )}
          </>
        )}
      </section>

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
          {replayReferencePack && replayVerdict && <div className="pilot-disclosure"><span className={`honesty ${replayVerdict === 'MATCH' ? 'simplified' : 'theoretical'}`}>REPLAY {replayVerdict}</span><p className="pilot-summary">Porównanie nowego jawnie uruchomionego packa z lokalnym snapshotem referencyjnym. Identyfikatory backend runów nie są kryterium MATCH.</p></div>}
          <div className="pilot-actions"><button className="chip-btn pilot-primary" onClick={handleExportProtocolEvidence}>⬇ Evidence Pack JSON</button><button className="chip-btn" onClick={handleExportProtocolRoCrate}>⬇ RO-Crate JSON-LD</button></div>
          {protocolAdvice && <div className="pilot-why-panel"><h3>WHY / NEXT EXPERIMENT</h3><p className="pilot-summary">{protocolAdvice.why}</p><p><strong>Baza dowodu:</strong> {protocolAdvice.evidenceBasis.join(' · ')}</p><ul className="pilot-limitations">{protocolAdvice.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul><p><strong>Następny bounded krok:</strong> {protocolAdvice.nextExperiment.action}</p><p><strong>Parametr:</strong> <code>{protocolAdvice.nextExperiment.parameter}</code> · {protocolAdvice.nextExperiment.rationale}</p><span className="honesty theoretical">AUTO-RUN: DISABLED</span></div>}
          {protocolSeriesAnalysis && <div className="pilot-why-panel" data-testid="experiment-series-analysis"><h3>SERIES OBSERVATION · NOT A DISCOVERY</h3><p><strong>Status:</strong> {protocolSeriesAnalysis.findings.length > 0 ? protocolSeriesAnalysis.findings[0].verdict : 'NO_THRESHOLD_FINDING'}</p><p><strong>Parametr:</strong> <code>{protocolSeriesAnalysis.parameterKey}</code> · <strong>Wynik:</strong> <code>{protocolSeriesAnalysis.outputKey}</code></p>{protocolSeriesAnalysis.findings.length === 0 ? <p className="pilot-summary">Nie zaobserwowano korelacji przekraczającej próg w tej serii. To nie jest dowód braku zależności ani wynik negatywny.</p> : <ul className="pilot-limitations">{protocolSeriesAnalysis.findings.map((finding) => <li key={`${finding.kind}-${finding.runIds.join('-')}`}>{finding.message} <span className="mono">[{finding.runIds.join(', ')}]</span></li>)}</ul>}<p className="pilot-disclaimer">{protocolSeriesAnalysis.disclaimer} Model: {protocolSeriesAnalysis.modelId ?? 'brak porównywalnego modelu'}.</p></div>}
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
          <details className="settings-details" open>
            <summary>Analiza wyniku</summary>
            {analyzeExperimentResult(confirmed.run.result).map((block) => <section key={`${block.title}:${block.body}`}><strong>{block.title}</strong><p className="settings-hint">{block.body}</p></section>)}
          </details>
          {confirmed.run.request.modelId === 'nuclear-semf' && (() => {
            const comparison = compareAme2020Observations();
            return <details className="settings-details" open>
              <summary>Independent real observation — AME2020</summary>
              <p className="settings-hint">{comparison.comparisons.map((item) => `${item.nuclide}: prediction ${item.prediction.toPrecision(6)} vs observation ${item.observation.toPrecision(6)} ${item.unit} → ${item.status}`).join('; ')}</p>
              <p className="settings-hint">MAE {comparison.meanAbsoluteError.toPrecision(5)} · RMSE {comparison.rootMeanSquareError.toPrecision(5)} {comparison.unit} · calibration {comparison.calibration.status} · replay {comparison.replay.status}</p>
              <p className="settings-hint">Calibration path: {comparison.calibrationPath.method}, n={comparison.calibrationPath.sampleCount}, mean residual {comparison.calibrationPath.meanSignedError.toPrecision(5)}, residual SD {comparison.calibrationPath.residualStandardDeviation.toPrecision(5)}, max |error| {comparison.calibrationPath.maxAbsoluteError.toPrecision(5)}; {comparison.calibrationPath.claim}.</p>
              <p className="settings-hint">Source: {comparison.provenance.sourceUrl} · raw SHA-256: {comparison.provenance.rawPayloadSha256}</p>
              <p className="pilot-disclaimer">Replay {comparison.replay.status}: {comparison.replay.reason} Nie jest to świeży pomiar ani skalibrowana skuteczność modelu.</p>
            </details>;
          })()}
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
            {confirmed.run.provenance.backendExecution && <>
              <div><dt>backendRunId</dt><dd className="mono">{confirmed.run.provenance.backendExecution.backendRunId}</dd></div>
              <div><dt>backendEngine</dt><dd className="mono">{confirmed.run.provenance.backendExecution.backendEngine}</dd></div>
              <div><dt>backendModelVersion</dt><dd className="mono">{confirmed.run.provenance.backendExecution.backendModelVersion}</dd></div>
              <div><dt>backendHonesty</dt><dd className="mono">{confirmed.run.provenance.backendExecution.backendProvenance.honesty}</dd></div>
              <div><dt>backendClassification</dt><dd className="mono">{confirmed.run.provenance.backendExecution.backendProvenance.classification}</dd></div>
            </>}
          </dl>
          {confirmed.run.provenance.backendExecution && <p className="pilot-disclaimer">Backend provenance pochodzi z kanonicznego Compute API; Pilot nie rekonstruuje formuły, wersji silnika ani klasyfikacji lokalnie.</p>}
          {confirmed.run.result.route.kind !== 'none' && <button className="chip-btn" onClick={handleOpenVisualization}>Otwórz wynik w wizualizacji</button>}
          <button className="chip-btn pilot-primary" onClick={handleGenerateCapsule}>Wygeneruj Scenario Capsule</button>
        </section>
      )}

      {graph && (
        <section className="pilot-step" aria-label="Graf eksperymentu naukowego">
          <h2>3b · Graf eksperymentu — co wiemy, czego nie wiemy, co dalej</h2>
          <p className="settings-hint">
            Pytanie → eksperyment → wynik → niepewność → następny krok. Graf jest odczytem stanu tej sesji
            ({runHistory.length} {runHistory.length === 1 ? 'wykonane żądanie' : 'wykonanych żądań'}), a nie ilustracją.
            Hipoteza pojawia się tylko wtedy, gdy została prerejestrowana przed wykonaniem.
          </p>
          <dl className="pilot-provenance">
            <div><dt>graphFingerprint</dt><dd className="mono">{graph.graphFingerprint}</dd></div>
            <div><dt>węzły / krawędzie</dt><dd className="mono">{graph.nodes.length} / {graph.edges.length}</dd></div>
          </dl>
          <details className="settings-details" open>
            <summary>Węzły ({graph.nodes.length})</summary>
            <div className="stat-list">
              {graph.nodes.map((node) => (
                <div className="stat-row" key={node.nodeId}>
                  <span>{node.kind} · {node.label}</span>
                  <span className="val mono">{node.epistemicStatus}{node.runId ? ` · ${node.runId}` : ''}</span>
                </div>
              ))}
            </div>
          </details>
          <details className="settings-details" open>
            <summary>Otwarte niepewności ({graph.uncertainties.length})</summary>
            {graph.uncertainties.length === 0
              ? <p className="settings-hint">Brak otwartych niepewności wyliczonych ze stanu tej sesji.</p>
              : graph.uncertainties.map((uncertainty) => (
                <section key={uncertainty.uncertaintyId}>
                  <strong>{uncertainty.kind}</strong>
                  <p className="settings-hint">{uncertainty.statement}</p>
                  <p className="pilot-disclaimer">{uncertainty.blocksClaim}</p>
                </section>
              ))}
          </details>
          {graph.nextExperiment && (
            <>
              <h3>Następny najbardziej informacyjny eksperyment</h3>
              <p className="pilot-summary">{graph.nextExperiment.action}</p>
              <p className="settings-hint">DLACZEGO: {graph.nextExperiment.why}</p>
              <p className="settings-hint">CO ROZSTRZYGNIE: {graph.nextExperiment.resolves}</p>
              <p className="settings-hint">REGUŁA WARTOŚCI: {graph.nextExperiment.rule}</p>
              <p className="pilot-disclaimer">Status: {graph.nextExperiment.status}. To propozycja kroku, nie jego wynik.</p>
              <div className="pilot-actions">
                <button
                  className="chip-btn pilot-primary"
                  disabled={graph.nextExperiment.status !== 'READY_TO_RUN'}
                  onClick={() => {
                    const execution = executeNextExperiment(graph, runExperiment);
                    if (!execution.executed || execution.run === null) {
                      setGraphNotice(execution.reason);
                      return;
                    }
                    const history = [...runHistory, execution.run];
                    setRunHistory(history);
                    setGraph(buildExperimentGraph({ question: graph.question, runs: history }));
                    setGraphNotice(`${execution.reason} Nowy przebieg: ${execution.run.runId} (${execution.run.result.status}).`);
                  }}
                >
                  Wykonaj następny eksperyment
                </button>
              </div>
              {graphNotice && <p className="settings-hint" role="status">{graphNotice}</p>}
            </>
          )}
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
