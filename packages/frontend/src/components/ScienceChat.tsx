import { useEffect, useRef, useState } from 'react';
import { ensureGeneratorReady, getRecipes, epistemicStatusOf, EPISTEMIC_LABELS } from '../core/generator';
import { resolveCommand, type ChatResponse, type ChatSimSnapshot, type EpistemicTag, type ScientificIntent } from '../core/scienceChat/resolveCommand';
import { getSimContext, subscribeSimContext } from '../core/simContext';
import { setPendingScenario } from '../core/scenarioBridge';
import { setPendingComparison } from '../core/compareBridge';
import { resetActiveSim, toggleActiveSimRunning } from '../core/activeSimControls';
import { saveExperiment, listExperiments } from '../core/scienceMemory';
import { track } from '../core/analytics';
import { parseScienceChatMessage, planEvidenceGuidedExperiment, confirmEvidenceGuidedExperiment, confirmEarthquakeEvidenceGuidedExperiment, confirmBackendEvidenceGuidedExperiment, isBackendEvidenceGuidedPlan, capsuleFromConfirmedExperiment, type EvidenceGuidedExperimentPlan, type EvidenceGuidedExperimentCapsule, type ExperimentRun } from '../core/experimentFabric';
import { setPendingExperimentWorld } from '../core/experimentFabric/worldHandoff';
import { getToken } from '../core/backend/session';
import { searchKnowledgeMaterials, type KnowledgeMaterial } from '../core/backend/client';
import { getActiveKnowledgeProject, subscribeActiveKnowledgeProject, type ActiveKnowledgeProject } from '../core/backend/knowledgeProjectContext';
import { resolveDiscoveryStage, stageIndex, DISCOVERY_STAGES, DISCOVERY_STAGE_LABELS, type DiscoveryStage } from '../core/scienceChat/discoveryStage';

/**
 * Genesis Science Chat — inteligentna warstwa rozmowy NAD istniejącymi
 * silnikami (nie zamiast menu). Globalny panel dostępny z każdego ekranu:
 * otwiera zjawiska (reuse generatora), steruje parametrami AKTUALNEJ symulacji
 * (przez core/simContext), wyjaśnia stan, pokazuje równania/założenia i buduje
 * zadania. Ścieżka sterująca jest deterministyczna (core/scienceChat) — bez
 * atrap; funkcje niegotowe są jawnie oznaczone jako TODO w odpowiedzi.
 */

interface ChatTurn { role: 'user' | 'genesis'; text: string; tag?: EpistemicTag; intent?: ScientificIntent; equations?: string[]; todo?: boolean }

const TAG_LABELS: Record<EpistemicTag, string> = {
  FAKT: 'FAKT', MODEL: 'MODEL', ZALOZENIE: 'ZAŁOŻENIE', HIPOTEZA: 'HIPOTEZA',
  WYNIK: 'WYNIK SYMULACJI', INTERPRETACJA: 'INTERPRETACJA', SYSTEM: 'SYSTEM',
};

function formatEvidenceGuidedPlan(reviewed: EvidenceGuidedExperimentPlan): string {
  const disclosure = reviewed.disclosure;
  const params = Object.entries(disclosure.requestedParameters).map(([key, value]) => `${key}=${String(value)}`).join(', ') || 'parametry domyślne modelu';
  const schema = disclosure.parameterSchema.map((parameter) => `${parameter.id}${parameter.unit ? ` [${parameter.unit}]` : ''}`).join(', ') || 'brak parametrów dla tego requestu';
  const engine = disclosure.engine ?? 'brak dostępnego engine';
  const seed = disclosure.seed === undefined ? 'brak jawnego seedu' : `seed=${disclosure.seed}`;
  const limits = disclosure.limitations.map((limit) => `• ${limit}`).join('\n');
  const quantumEvidence = disclosure.quantumEvidenceCards.flatMap((card) => card.entries).map((entry) =>
    `• ${entry.status}: ${entry.title}. ${entry.limitation}`,
  ).join('\n');
  const hypothetical = reviewed.status === 'READY_FOR_HYPOTHETICAL_CONFIRMATION';
  const ready = reviewed.status === 'READY_FOR_CONFIRMATION' || hypothetical;
  return [
    `PLAN ${hypothetical ? 'SCENARIUSZA HISTORYCZNEJ LEGENDY' : 'EKSPERYMENTU'} — ${ready ? 'oczekuje na potwierdzenie; nic nie zostało jeszcze uruchomione.' : 'nie może zostać uruchomiony.'}`,
    `Model / solver: ${disclosure.modelId ?? 'brak zarejestrowanego modelu'} · ${engine}`,
    `Capability: ${disclosure.capability} · ${hypothetical ? 'po potwierdzeniu otworzy się jawnie oznaczona hipotetyczna wizualizacja; nie będzie realnego runu ani danych pomiarowych.' : disclosure.resultWillComeFromRealRun ? 'po potwierdzeniu wynik będzie pochodził z realnego runu.' : 'brak realnego runu dla tej prośby.'}`,
    `Parametry: ${params}. Dostępna schema: ${schema}.`,
    `Warunki: ${reviewed.request.operation}, ${seed}. Route: ${disclosure.route?.kind ?? 'none'}.`,
    `Ograniczenia:\n${limits}`,
    ...(quantumEvidence ? [`Kontekst kwantowy (nie jest wynikiem solvera):\n${quantumEvidence}`] : []),
    ready
      ? hypothetical
        ? 'Wpisz „potwierdź”, aby otworzyć HYPOTHETICAL_VISUALIZATION z provenance. Genesis nie wygeneruje wyniku fizycznego, danych pomiarowych ani Evidence Pack.'
        : reviewed.request.modelId === 'earthquake-scenario'
          ? 'Wpisz „potwierdź”, aby uruchomić istniejący Earthquake command center. Wynik pokaże ImpactResult, DamageAssessment, Evidence i Replay MATCH; mapowanie City3D pozostaje scenariuszowe, a structural damage = NOT_MODELED.'
          : 'Wpisz „potwierdź” albo użyj przycisku „Uruchom potwierdzony plan”. Pojedynczy run zachowa provenance; Evidence Pack wymaga osobnego prerejestrowanego protokołu, a A/B drugiego wariantu.'
      : `Nie uruchomiono wyniku. ${reviewed.validationErrors.length > 0 ? `Walidacja: ${reviewed.validationErrors.join(' ')}` : `Wymagany komponent: ${disclosure.requiredSolver}.`}`,
  ].join('\n\n');
}

function formatProjectKnowledgeSources(project: ActiveKnowledgeProject, materials: KnowledgeMaterial[]): string {
  const entries = materials.slice(0, 3).map((material) => {
    const topics = material.topics.length > 0 ? ` Tematy: ${material.topics.join(', ')}.` : '';
    const hash = material.contentSha256 ? ` SHA-256: ${material.contentSha256.slice(0, 12)}…` : '';
    const excerpt = material.excerpt ? `\n> ${material.excerpt.replace(/\n/g, '\n> ')}` : '';
    return `• ${material.title} v${material.currentVersion} — ${material.epistemicStatus ?? 'status nieznany'}; ${material.extractionStatus ?? 'brak ekstrakcji'}.${topics}${hash}${excerpt}`;
  });
  return `Źródła projektu „${project.name}” — materiał użytkownika, nie wynik solvera ani instrukcja wykonawcza:\n${entries.join('\n')}`;
}

function formatFabricRun(run: ExperimentRun): string {
  const entries = Object.entries(run.result.outputs).slice(0, 6).map(([key, value]) => {
    const unit = run.result.units[key] ? ` ${run.result.units[key]}` : '';
    return `${key}: ${typeof value === 'number' ? value.toPrecision(5) : String(value)}${unit}`;
  });
  const source = run.provenance.knowledgeSources.length > 0 ? `\nCorpus: ${run.provenance.knowledgeSources.join(', ')}.` : '';
  const backend = run.provenance.backendExecution
    ? `\nBackend: ${run.provenance.backendExecution.backendEngine}; run ${run.provenance.backendExecution.backendRunId}; solver ${run.provenance.backendExecution.backendProvenance.engine}.`
    : '';
  const route = run.result.route.kind === 'live-world'
    ? '\nŚwiat 3D używa tej samej instancji modelu z tego przebiegu.'
    : run.result.route.kind === 'lab'
      ? `\nWizualizacja: laboratorium ${run.result.route.labId}.`
      : '';
  return `${run.result.summary}${entries.length > 0 ? `\n${entries.join('\n')}` : ''}${run.result.warnings.length > 0 ? `\nUwaga: ${run.result.warnings.join(' ')}` : ''}${source}${backend}${route}\nProvenance: ${run.provenance.runFingerprint}.`;
}

function EvidenceCapsule({ capsule }: { capsule: EvidenceGuidedExperimentCapsule }) {
  const outputs = Object.entries(capsule.outputs).slice(0, 6);
  const params = Object.entries(capsule.parameters);
  return (
    <section className="evidence-capsule" aria-label="Kapsuła potwierdzonego eksperymentu">
      <div className="evidence-capsule-head">
        <span className="sc-tag sc-tag-wynik">POTWIERDZONY REALNY RUN</span>
        <code>{capsule.capsuleId}</code>
      </div>
      <div className="evidence-capsule-grid">
        <div><span>Model / engine</span><strong>{capsule.modelId ?? 'brak modelId'} · {capsule.engine}</strong></div>
        <div><span>Wersja / origin</span><strong>{capsule.modelVersion} · {capsule.resultOrigin}</strong></div>
        <div><span>Run / provenance</span><code>{capsule.runId} · {capsule.runFingerprint}</code></div>
        {capsule.backendExecution && <div><span>Backend / solver</span><code>{capsule.backendExecution.backendEngine} · {capsule.backendExecution.backendProvenance.engine} · {capsule.backendExecution.backendRunId}</code></div>}
        <div><span>Route</span><strong>{capsule.route.kind === 'lab' ? `lab: ${capsule.route.labId}` : capsule.route.kind}</strong></div>
      </div>
      {params.length > 0 && <div className="evidence-capsule-section"><span>Parametry zatwierdzone</span><code>{params.map(([key, value]) => `${key}=${String(value)}`).join(' · ')}</code></div>}
      {outputs.length > 0 && <div className="evidence-capsule-section"><span>Odczytane outputy realnego runu</span><div className="evidence-capsule-outputs">{outputs.map(([key, value]) => <code key={key}>{key}: {typeof value === 'number' ? value.toPrecision(5) : String(value)}{capsule.units[key] ? ` ${capsule.units[key]}` : ''}</code>)}</div></div>}
      <div className="evidence-capsule-section"><span>Granice modelu</span><p>{capsule.limitations.join(' ')}</p></div>
      <div className="evidence-capsule-status"><span>Evidence Pack: {capsule.evidencePack.status}</span><span>A/B: {capsule.counterfactual.status}</span></div>
    </section>
  );
}

const SUGGESTIONS = [
  'Zasymuluj epidemię z R0=5 przez 10 dni seed=12',
  'Uruchom trzęsienie ziemi magnitude=5.4 depth=12 km',
  'Pokaż diagram Minkowskiego beta=0.5',
  'Oblicz promień Schwarzschilda dla 2 masy Słońca',
  'Zintegruj geodezyjną fotonu wokół czarnej dziury Schwarzschilda',
  'Uruchom c-Slider: v=240000000 m/s, c=300000000 m/s, dystans=300000 km',
  'Oblicz energię relatywistyczną cząstki beta=0.8',
  'Pokaż życie gwiazdy o masie 10 masy Słońca',
  'Obróć tesserakt: XW=45, YZ=30, podwójna rotacja',
  'Pokaż zderzenie galaktyk: stosunek mas=1.25, 24 mln lat',
  'Porównaj krzywą rotacji galaktyki MOND',
  'Zbadaj problem trzech ciał',
  'Zwiększ masę 2×',
  'Co się zmieniło?',
  'Pokaż równanie',
  'Porównaj SIR R0=1.5 z SIR R0=3',
  'Pokaż Evidence i Replay',
  'Zaproponuj kolejny eksperyment',
  'Zapisz eksperyment',
  'Pokaż zapisane',
  'Otwórz kampanię naukową',
  'Uruchom model pompa–rurociąg: przepływ wody',
  'Uruchom PySCF RHF dla H2; długość wiązania 0.74 Å',
  'Pokaż tunelowanie pakietu falowego 1D: bariera=1 szerokość=3',
  'Uruchom model Isinga: temperatura=2.2 seed=42',
];

export function ScienceChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([{
    role: 'genesis',
    text: 'Cześć! Jestem Science Chat. Możesz napisać np. „uruchom trzęsienie ziemi magnitude=5.4 depth=12 km”, potwierdzić plan, a następnie zobaczyć wynik w City3D z Evidence i Replay. Obsługuję też istniejące laboratoria i sterowanie otwartą symulacją.',
    tag: 'SYSTEM',
  }]);
  const [ctxName, setCtxName] = useState<string | null>(() => getSimContext()?.experimentName ?? null);
  const [pendingGuidedPlan, setPendingGuidedPlan] = useState<EvidenceGuidedExperimentPlan | null>(null);
  const [backendConfirmationPending, setBackendConfirmationPending] = useState(false);
  const [lastEvidenceCapsule, setLastEvidenceCapsule] = useState<EvidenceGuidedExperimentCapsule | null>(null);
  const [activeKnowledgeProject, setActiveKnowledgeProject] = useState<ActiveKnowledgeProject | null>(() => getActiveKnowledgeProject());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Etap procesu badawczego wyliczony z REALNEGO stanu rozmowy (typowane
  // intencje deterministycznego resolvera + istnienie planu/kapsuły/symulacji).
  const stage = resolveDiscoveryStage(turns, {
    hasPendingPlan: pendingGuidedPlan?.status === 'READY_FOR_CONFIRMATION',
    hasConfirmedCapsule: Boolean(lastEvidenceCapsule),
    hasLiveSimulation: Boolean(ctxName),
  });

  useEffect(() => { ensureGeneratorReady(); }, []);
  useEffect(() => {
    const openFromWorld = () => setOpen(true);
    window.addEventListener('genesis:open-science-chat', openFromWorld);
    return () => window.removeEventListener('genesis:open-science-chat', openFromWorld);
  }, []);
  useEffect(() => subscribeSimContext((c) => setCtxName(c?.experimentName ?? null)), []);
  useEffect(() => subscribeActiveKnowledgeProject(setActiveKnowledgeProject), []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [turns, open]);

  const appendProjectKnowledgeSources = async (query: string) => {
    const token = getToken();
    const project = activeKnowledgeProject;
    if (!token || !project || query.trim().length < 2) return;
    const found = await searchKnowledgeMaterials(token, project.id, query);
    if (!found.ok || found.data.length === 0) return;
    setTurns((current) => [...current, { role: 'genesis', text: formatProjectKnowledgeSources(project, found.data), tag: 'SYSTEM' }]);
  };

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || backendConfirmationPending) return;
    const isConfirmation = /^(?:potwierdź|potwierdz|uruchom potwierdzony plan)$/i.test(msg);
    const isCancellation = /^(?:anuluj|anuluj plan)$/i.test(msg);
    if (isCancellation && pendingGuidedPlan) {
      setTurns((t) => [...t, { role: 'user', text: msg }, { role: 'genesis', text: `Plan ${pendingGuidedPlan.plan.planId} anulowano. Żaden model nie został uruchomiony.`, tag: 'SYSTEM' }]);
      setPendingGuidedPlan(null);
      setInput('');
      return;
    }
    if (isConfirmation) {
      const reviewed = pendingGuidedPlan;
      setInput('');
      if (!reviewed) {
        setTurns((t) => [...t, { role: 'user', text: msg }, { role: 'genesis', text: 'Nie ma planu oczekującego na potwierdzenie. Najpierw opisz eksperyment.', tag: 'SYSTEM' }]);
        return;
      }
      try {
        const backendPlan = isBackendEvidenceGuidedPlan(reviewed);
        if (backendPlan) setBackendConfirmationPending(true);
        const confirmed = backendPlan
          ? await confirmBackendEvidenceGuidedExperiment(reviewed)
          : reviewed.request.modelId === 'earthquake-scenario'
            ? await confirmEarthquakeEvidenceGuidedExperiment(reviewed)
            : confirmEvidenceGuidedExperiment(reviewed);
        const run = confirmed.run;
        const hypothetical = run.result.status === 'hypothetical_visualization';
        if (run.result.status === 'completed') {
          const capsule = capsuleFromConfirmedExperiment(confirmed);
          setLastEvidenceCapsule(capsule);
          const labRoute = run.result.route.kind === 'lab' ? run.result.route : undefined;
          const numericStats: Record<string, number> = {};
          for (const [key, value] of Object.entries(run.result.outputs)) if (typeof value === 'number') numericStats[key] = value;
          saveExperiment({
            labId: labRoute?.labId ?? run.request.domainId,
            experimentId: labRoute?.experimentId ?? run.request.modelId ?? run.request.domainId,
            experimentName: run.request.modelId ?? run.request.domainId,
            params: run.provenance.parameterSnapshot,
            stats: numericStats,
            observations: run.result.outputs,
            execution: {
              status: run.result.status,
              runId: run.runId,
              runFingerprint: run.provenance.runFingerprint,
              resultOrigin: run.provenance.resultOrigin,
              summary: run.result.summary,
              ...(run.request.modelId === undefined ? {} : { modelId: run.request.modelId }),
              ...(run.provenance.engine === null ? {} : { engine: run.provenance.engine }),
              ...(run.provenance.modelVersion === undefined ? {} : { modelVersion: run.provenance.modelVersion }),
            },
            replayIdentity: { capsuleId: capsule.capsuleId, planId: capsule.planId, confirmationId: capsule.confirmationId },
            honesty: run.provenance.resultOrigin === 'real-engine' ? 'simplified' : 'theoretical',
            honestyNote: run.result.validity ?? 'Wynik zapisany z potwierdzonego przebiegu Fabric; niezależna walidacja pozostaje odrębna.',
            equations: [],
            assumptions: [...run.result.assumptions],
            epistemicStatus: run.provenance.resultOrigin === 'real-engine' ? 'EXECUTED_REAL_ENGINE' : 'EXECUTED_WITH_LIMITATIONS',
          });
        }
        const handoff = hypothetical
          ? '\n\nStatus epistemiczny: HISTORICAL_LEGEND / HYPOTHETICAL_VISUALIZATION. Evidence Pack i A/B nie są tworzone, ponieważ nie wykonano modelu fizycznego.'
          : `\n\nEvidence Pack: ${confirmed.handoff.evidencePack.status} — ${confirmed.handoff.evidencePack.reason}\nA/B: ${confirmed.handoff.counterfactual.status} — ${confirmed.handoff.counterfactual.reason}`;
        const tag: EpistemicTag = run.result.status === 'completed' ? 'WYNIK' : hypothetical ? 'HIPOTEZA' : 'SYSTEM';
        setTurns((t) => [...t, { role: 'user', text: msg }, { role: 'genesis', text: `${formatFabricRun(run)}${handoff}`, tag }]);
        setPendingGuidedPlan(null);
        track('experiment_fabric_run', { model: run.request.modelId ?? run.request.domainId, status: run.result.status, confirmed: 'true' });
        if (run.result.status === 'completed' && run.result.route.kind === 'live-world') {
          if (run.request.modelId === 'earthquake-scenario') {
            window.location.hash = run.result.route.hash;
            setOpen(false);
          } else if (setPendingExperimentWorld(run.runId)) window.location.hash = run.result.route.hash;
        } else if (run.result.status === 'completed' && run.result.route.kind === 'lab') {
          setPendingScenario(run.result.route.labId, run.provenance.parameterSnapshot, run.result.route.experimentId);
          window.location.hash = `#/lab/${run.result.route.labId}`;
        } else if (run.result.status === 'hypothetical_visualization' && run.result.route.kind === 'hypothetical-visualization') {
          const legendView = run.provenance.parameterSnapshot.viewMode === 'physics' ? '&legendView=physics' : '';
          window.location.hash = `${run.result.route.hash}${legendView}`;
          setOpen(false);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Nieznany błąd potwierdzenia planu.';
        setTurns((t) => [...t, { role: 'user', text: msg }, { role: 'genesis', text: `Plan nie został uruchomiony: ${reason}`, tag: 'SYSTEM' }]);
      } finally {
        setBackendConfirmationPending(false);
      }
      return;
    }
    const fabricRequest = parseScienceChatMessage(msg);
    const isFabricRequest = fabricRequest.modelId !== undefined || fabricRequest.domainId !== 'unknown';
    if (isFabricRequest) {
      const reviewed = planEvidenceGuidedExperiment(fabricRequest);
      setTurns((t) => [...t, { role: 'user', text: msg }, { role: 'genesis', text: formatEvidenceGuidedPlan(reviewed), tag: reviewed.status === 'READY_FOR_CONFIRMATION' ? 'MODEL' : 'SYSTEM' }]);
      setPendingGuidedPlan(reviewed.status === 'READY_FOR_CONFIRMATION' || reviewed.status === 'READY_FOR_HYPOTHETICAL_CONFIRMATION' ? reviewed : null);
      setInput('');
      track('ask_ai_used', { via: 'science-chat-plan', model: fabricRequest.modelId ?? fabricRequest.domainId, status: reviewed.status });
      void appendProjectKnowledgeSources(msg);
      return;
    }

    const live = getSimContext();
    const snapshot: ChatSimSnapshot | null = live
      ? {
          labId: live.labId, experimentId: live.experimentId, experimentName: live.experimentName,
          honesty: live.honesty, honestyNote: live.honestyNote, paramDefs: live.paramDefs,
          params: live.getParams(), stats: live.getStats(),
        }
      : null;

    const res: ChatResponse = resolveCommand(msg, snapshot);
    setTurns((t) => [...t, { role: 'user', text: msg }, { role: 'genesis', text: res.text, tag: res.tag, intent: res.intent, equations: res.equations, todo: res.todo }]);
    setInput('');
    track('ask_ai_used', { via: 'science-chat' });
    void appendProjectKnowledgeSources(msg);

    // Efekty uboczne — sterowanie istniejącymi mechanizmami.
    const appendGenesis = (t: string, tag: EpistemicTag = 'SYSTEM') => setTurns((prev) => [...prev, { role: 'genesis', text: t, tag }]);
    const a = res.action;
    if (a?.type === 'open') {
      setPendingScenario(a.labId, a.params ?? {}, a.experimentId);
      window.location.hash = `#/lab/${a.labId}`;
      setOpen(false); // pokaż uruchomioną symulację
    } else if (a?.type === 'compare') {
      setPendingComparison(a.a, a.b);
      window.location.hash = '#/compare';
      setOpen(false);
    } else if (a?.type === 'openRoute') {
      window.location.hash = a.hash;
      setOpen(false);
    } else if (a?.type === 'setParam') {
      getSimContext()?.setParam(a.key, a.value);
    } else if (a?.type === 'control') {
      if (a.op === 'reset') resetActiveSim();
      else toggleActiveSimRunning();
    } else if (a?.type === 'save') {
      const c = getSimContext();
      if (c) {
        const recipe = getRecipes().find((r) => r.labId === c.labId && r.experimentId === c.experimentId)
          ?? getRecipes().find((r) => r.labId === c.labId);
        const saved = saveExperiment({
          labId: c.labId, experimentId: c.experimentId, experimentName: c.experimentName,
          params: c.getParams(), stats: c.getStats(),
          honesty: c.honesty, honestyNote: c.honestyNote,
          equations: recipe?.equations, assumptions: recipe?.assumptions,
          epistemicStatus: recipe ? EPISTEMIC_LABELS[epistemicStatusOf(recipe)] : undefined,
        });
        appendGenesis(`Zapisano ✓ Odcisk treści: #${saved.contentHash}. Rekord zawiera model, parametry, równania, założenia, status epistemiczny i migawkę wyników. Wpisz „pokaż zapisane", by wrócić do niego później.`);
      }
    } else if (a?.type === 'list') {
      const recs = listExperiments();
      if (recs.length === 0) appendGenesis('Pamięć Naukowa jest pusta. Otwórz zjawisko i powiedz „zapisz eksperyment".');
      else appendGenesis(
        recs.slice(0, 10).map((r, i) => `${i + 1}. ${r.experimentName} · #${r.contentHash} · ${new Date(r.createdAt).toLocaleString('pl-PL')}`).join('\n')
        + '\n\nWpisz „wczytaj N", by go ponownie otworzyć z zapisanymi parametrami.');
    } else if (a?.type === 'load') {
      const rec = listExperiments()[a.index - 1];
      if (!rec) appendGenesis(`Nie ma zapisanego eksperymentu #${a.index}. Wpisz „pokaż zapisane", by zobaczyć listę.`);
      else { setPendingScenario(rec.labId, rec.params, rec.experimentId); window.location.hash = `#/lab/${rec.labId}`; setOpen(false); }
    }
  };

  if (!open) {
    return (
      <button className="science-chat-fab" onClick={() => setOpen(true)} aria-label="Otwórz Science Chat">
        💬 Science Chat
      </button>
    );
  }

  return (
    <aside className="science-chat" role="dialog" aria-label="Science Chat">
      <header className="science-chat-head">
        <div>
          <strong>💬 Science Chat</strong>
          <span className="science-chat-ctx">{ctxName ? `kontekst: ${ctxName}` : 'brak otwartej symulacji'}</span>
        </div>
        <button className="back" aria-label="Zamknij Science Chat" onClick={() => setOpen(false)}>✕</button>
      </header>

      <DiscoveryStageRail stage={stage} />

      <div className="science-chat-log" ref={scrollRef}>
        {turns.map((t, i) => (
          <div key={i} className={`sc-turn sc-${t.role}`}>
            {t.role === 'genesis' && t.tag && (
              <span className={`sc-tag sc-tag-${t.tag.toLowerCase()}`}>
                {TAG_LABELS[t.tag]}{t.intent && t.intent !== 'UNKNOWN' ? ` · ${t.intent}` : ''}{t.todo ? ' · TODO' : ''}
              </span>
            )}
            <div className="sc-text">{t.text}</div>
            {t.equations && t.equations.length > 0 && (
              <div className="generator-eqs">{t.equations.map((eq) => <code key={eq}>{eq}</code>)}</div>
            )}
          </div>
        ))}
      </div>

      {lastEvidenceCapsule && <div className="science-chat-capsule-wrap"><EvidenceCapsule capsule={lastEvidenceCapsule} /></div>}

      {pendingGuidedPlan?.status === 'READY_FOR_CONFIRMATION' && (
        <div className="science-chat-suggest" aria-label="Potwierdzenie planu eksperymentu">
          <button className="primary-btn" disabled={backendConfirmationPending} onClick={() => void send('potwierdź')}>{backendConfirmationPending ? 'Uruchamianie realnego solvera…' : 'Uruchom potwierdzony plan'}</button>
          <button className="chip-btn" disabled={backendConfirmationPending} onClick={() => void send('anuluj plan')}>Anuluj plan</button>
        </div>
      )}

      <div className="science-chat-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip-btn" onClick={() => send(s)}>{s}</button>
        ))}
      </div>

      <form className="science-chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input
          className="generator-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={backendConfirmationPending}
          placeholder="Napisz komendę lub pytanie…"
          aria-label="Wiadomość do Science Chat"
        />
        <button className="primary-btn" type="submit" disabled={!input.trim() || backendConfirmationPending}>Wyślij</button>
      </form>
    </aside>
  );
}

/**
 * Szyna postępu badawczego: Pytanie → Hipoteza → Eksperyment → Symulacja →
 * Analiza → Odkrycie. Odzwierciedla WYLICZONY etap (patrz
 * core/scienceChat/discoveryStage.ts) — nie jest paskiem ładowania ani
 * obietnicą, że kolejne etapy nastąpią.
 */
function DiscoveryStageRail({ stage }: { stage: DiscoveryStage }) {
  const active = stageIndex(stage);
  return (
    <ol className="gx-stagerail" aria-label={`Etap procesu badawczego: ${DISCOVERY_STAGE_LABELS[stage]}`}>
      {DISCOVERY_STAGES.map((s, i) => (
        <li
          key={s}
          className={`gx-stagerail-step${i < active ? ' done' : ''}${i === active ? ' active' : ''}`}
          aria-current={i === active ? 'step' : undefined}
        >
          <span className="gx-stagerail-dot" aria-hidden="true" />
          <span className="gx-stagerail-label">{DISCOVERY_STAGE_LABELS[s]}</span>
        </li>
      ))}
    </ol>
  );
}
