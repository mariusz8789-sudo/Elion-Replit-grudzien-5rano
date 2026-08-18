import { useEffect, useRef, useState } from 'react';
import { ensureGeneratorReady, getRecipes, epistemicStatusOf, EPISTEMIC_LABELS } from '../core/generator';
import { resolveCommand, type ChatResponse, type ChatSimSnapshot, type EpistemicTag, type ScientificIntent } from '../core/scienceChat/resolveCommand';
import { getSimContext, subscribeSimContext } from '../core/simContext';
import { setPendingScenario } from '../core/scenarioBridge';
import { setPendingComparison } from '../core/compareBridge';
import { resetActiveSim, toggleActiveSimRunning } from '../core/activeSimControls';
import { saveExperiment, listExperiments } from '../core/scienceMemory';
import { track } from '../core/analytics';
import { parseScienceChatMessage, runExperiment, type ExperimentRun } from '../core/experimentFabric';
import { setPendingExperimentWorld } from '../core/experimentFabric/worldHandoff';

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

function formatFabricRun(run: ExperimentRun): string {
  const entries = Object.entries(run.result.outputs).slice(0, 6).map(([key, value]) => {
    const unit = run.result.units[key] ? ` ${run.result.units[key]}` : '';
    return `${key}: ${typeof value === 'number' ? value.toPrecision(5) : String(value)}${unit}`;
  });
  const source = run.provenance.knowledgeSources.length > 0 ? `\nCorpus: ${run.provenance.knowledgeSources.join(', ')}.` : '';
  const route = run.result.route.kind === 'live-world'
    ? '\nŚwiat 3D używa tej samej instancji modelu z tego przebiegu.'
    : run.result.route.kind === 'lab'
      ? `\nWizualizacja: laboratorium ${run.result.route.labId}.`
      : '';
  return `${run.result.summary}${entries.length > 0 ? `\n${entries.join('\n')}` : ''}${run.result.warnings.length > 0 ? `\nUwaga: ${run.result.warnings.join(' ')}` : ''}${source}${route}\nProvenance: ${run.provenance.runFingerprint}.`;
}

const SUGGESTIONS = [
  'Zbadaj problem trzech ciał',
  'Zwiększ masę 2×',
  'Co się zmieniło?',
  'Pokaż równanie',
  'Porównaj SIR R0=1.5 z SIR R0=3',
  'Zaproponuj kolejny eksperyment',
  'Zapisz eksperyment',
  'Pokaż zapisane',
];

export function ScienceChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([{
    role: 'genesis',
    text: 'Cześć! Jestem Science Chat. Napisz np. „pokaż czarną dziurę", potem „zwiększ masę 2×", a potem „co się zmieniło?". Rozmawiam z realnymi silnikami Genesis i steruję otwartą symulacją.',
    tag: 'SYSTEM',
  }]);
  const [ctxName, setCtxName] = useState<string | null>(() => getSimContext()?.experimentName ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { ensureGeneratorReady(); }, []);
  useEffect(() => {
    const openFromWorld = () => setOpen(true);
    window.addEventListener('genesis:open-science-chat', openFromWorld);
    return () => window.removeEventListener('genesis:open-science-chat', openFromWorld);
  }, []);
  useEffect(() => subscribeSimContext((c) => setCtxName(c?.experimentName ?? null)), []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [turns, open]);

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    const fabricRequest = parseScienceChatMessage(msg);
    const isFabricRequest = fabricRequest.modelId !== undefined || fabricRequest.domainId !== 'unknown';
    if (isFabricRequest) {
      const run = runExperiment(fabricRequest);
      const tag: EpistemicTag = run.result.status === 'completed' ? 'WYNIK' : 'SYSTEM';
      setTurns((t) => [...t, { role: 'user', text: msg }, { role: 'genesis', text: formatFabricRun(run), tag }]);
      setInput('');
      track('experiment_fabric_run', { model: run.request.modelId ?? run.request.domainId, status: run.result.status });
      if (run.result.status === 'completed' && run.result.route.kind === 'live-world') {
        if (setPendingExperimentWorld(run.runId)) window.location.hash = run.result.route.hash;
      } else if (run.result.status === 'completed' && run.result.route.kind === 'lab') {
        setPendingScenario(run.result.route.labId, run.provenance.parameterSnapshot, run.result.route.experimentId);
        window.location.hash = `#/lab/${run.result.route.labId}`;
      }
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
          placeholder="Napisz komendę lub pytanie…"
          aria-label="Wiadomość do Science Chat"
        />
        <button className="primary-btn" type="submit" disabled={!input.trim()}>Wyślij</button>
      </form>
    </aside>
  );
}
