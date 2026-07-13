import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabDefinition, NarrationBlock, SimParams } from '../core/types';
import { useSimLoop } from '../core/useSimLoop';
import { useThreeLoop } from '../core/three/useThreeLoop';
import { Controls, defaultParams } from './Controls';
import { NarratorPanel } from './NarratorPanel';
import { HonestyBadge } from './HonestyBadge';
import { buildContext } from '../narrator/askAI';
import { registerActiveSimControls } from '../core/activeSimControls';
import { track } from '../core/analytics';
import { appendSample, type RunSample } from '../core/experimentRun';
import { analyzeRun, paramRangeSummary } from '../core/experimentAnalysis';
import {
  saveCustomExperiment,
  listCustomExperiments,
  deleteCustomExperiment,
  type CustomExperiment,
} from '../core/customExperiment';

/**
 * "Stwórz eksperyment" — dostępne na każdym laboratorium jako dodatkowa
 * zakładka. Bezpieczne przez konstrukcję: użytkownik dobiera WYŁĄCZNIE
 * wartości parametrów już zdefiniowanych przez lab.params — żadnego
 * wykonywania własnego kodu, żadnej nowej powierzchni ataku. To ten sam
 * kontrakt Sim/ExperimentDef co reszta aplikacji, tylko z dwiema warstwami
 * nałożonymi na wierzch: nagrywanie przebiegu (core/experimentRun.ts) i
 * analiza trendu (core/experimentAnalysis.ts) zamiast pojedynczego odczytu.
 *
 * Scena bazowa laboratorium bywa 2D (createSim) albo 3D (createSim3D) — np.
 * Chemia i Biologia mają bazę wyłącznie 3D. Dlatego wybieramy silnik
 * renderujący zależnie od tego, co laboratorium faktycznie udostępnia, zamiast
 * zakładać createSim (dawniej `lab.createSim!()` wywalał zakładkę na labach 3D:
 * „createSim is not a function"). Gdy laboratorium nie ma żadnej sceny bazowej,
 * pokazujemy uczciwy komunikat zamiast się wywalać.
 */
/**
 * Wybór silnika sceny bazowej dla zakładki „Stwórz eksperyment". Czysta funkcja,
 * żeby dało się ją przetestować bez renderowania (regresja błędu
 * „createSim is not a function" na laboratoriach z bazą wyłącznie 3D).
 */
export function customStageMode(lab: Pick<LabDefinition, 'createSim' | 'createSim3D'>): '2d' | '3d' | 'none' {
  if (lab.createSim) return '2d';
  if (lab.createSim3D) return '3d';
  return 'none';
}

export function CustomExperimentTab({ lab }: { lab: LabDefinition }) {
  const mode = customStageMode(lab);
  if (mode === '2d') return <CustomExperiment2D lab={lab} />;
  if (mode === '3d') return <CustomExperiment3D lab={lab} />;
  return (
    <div className="empty-state">
      To laboratorium nie ma bazowej sceny symulacji, więc tryb „Stwórz eksperyment" jest tu niedostępny.
      Skorzystaj z gotowych eksperymentów powyżej.
    </div>
  );
}

/**
 * Wspólny stan zakładki „Stwórz eksperyment" — identyczny dla sceny 2D i 3D.
 * Różni się tylko silnik renderujący (useSimLoop vs useThreeLoop) w komponentach
 * poniżej. Zwraca też `onStats` z logiką nagrywania próbek co sekundę.
 */
function useCustomExperimentState(lab: LabDefinition) {
  const [params, setParams] = useState<SimParams>(() => defaultParams(lab.params));
  const [running, setRunning] = useState(true);
  const [recording, setRecording] = useState(false);
  const [samples, setSamples] = useState<RunSample[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saved, setSaved] = useState<CustomExperiment[]>(() => listCustomExperiments(lab.id));
  const startRef = useRef(0);
  const lastSampleAt = useRef(0);
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const onStats = useMemo(
    () => (s: Record<string, number>) => {
      if (!recordingRef.current) return;
      const now = performance.now();
      if (now - lastSampleAt.current < 1000) return;
      lastSampleAt.current = now;
      setSamples((prev) => appendSample(prev, (now - startRef.current) / 1000, s));
    },
    [],
  );

  useEffect(() => {
    track('experiment_open', { lab: lab.id, experiment: 'create-experiment' });
  }, [lab.id]);

  const toggleRecording = () => {
    if (!recording) {
      startRef.current = performance.now();
      lastSampleAt.current = 0;
      setSamples([]);
      track('custom_experiment_run');
    }
    setRecording((r) => !r);
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    saveCustomExperiment(lab.id, saveName, params);
    setSaved(listCustomExperiments(lab.id));
    setSaveName('');
    track('custom_experiment_saved');
  };

  const handleLoad = (entry: CustomExperiment) => setParams((prev) => ({ ...prev, ...entry.params }));
  const handleDelete = (id: string) => {
    deleteCustomExperiment(id);
    setSaved(listCustomExperiments(lab.id));
  };

  const blocks: NarrationBlock[] = useMemo(() => {
    const summary = paramRangeSummary(lab.params, params);
    if (samples.length >= 3) return [summary, ...analyzeRun(samples)];
    return [
      summary,
      {
        title: recording ? 'Nagrywanie w toku…' : 'Ustaw parametry i nagraj przebieg',
        body: recording
          ? 'Zbieram próbki co sekundę. Poczekaj chwilę, a analiza pojawi się poniżej automatycznie.'
          : 'Dostosuj suwaki, naciśnij „⏺ Nagrywaj", poczekaj kilka–kilkanaście sekund, potem zatrzymaj — zobaczysz trend, ewentualne niespójności i sugestię następnego testu.',
      },
    ];
  }, [lab.params, params, samples, recording]);

  const expLabel = samples.length >= 3 ? `Twój eksperyment (analiza ${samples.length} próbek)` : 'Twój eksperyment';

  return {
    params, setParams, running, setRunning, recording, samples, saveName, setSaveName, saved,
    onStats, toggleRecording, handleSave, handleLoad, handleDelete, blocks, expLabel,
  };
}

type CustomState = ReturnType<typeof useCustomExperimentState>;

/** Panele wspólne pod sceną: nagrywanie, honesty, suwaki, zapis, Narrator. */
function CustomBelowStage({ lab, s }: { lab: LabDefinition; s: CustomState }) {
  return (
    <>
      <HonestyBadge level={lab.honesty} note={lab.honestyNote} />
      <Controls defs={lab.params} params={s.params} onChange={(k, v) => s.setParams((p) => ({ ...p, [k]: v }))} />
      <div className="custom-exp-save">
        <input
          type="text"
          value={s.saveName}
          maxLength={60}
          placeholder="Nazwij ten zestaw parametrów…"
          aria-label="Nazwa eksperymentu do zapisania"
          onChange={(e) => s.setSaveName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') s.handleSave(); }}
        />
        <button className="chip-btn" onClick={s.handleSave} disabled={!s.saveName.trim()}>Zapisz</button>
      </div>
      {s.saved.length > 0 && (
        <div className="custom-exp-list">
          {s.saved.map((e) => (
            <div className="custom-exp-item" key={e.id}>
              <button className="custom-exp-load" onClick={() => s.handleLoad(e)}>{e.name}</button>
              <button className="custom-exp-delete" aria-label={`Usuń „${e.name}"`} onClick={() => s.handleDelete(e.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
      <NarratorPanel
        blocks={s.blocks}
        askContext={buildContext(
          { id: lab.id, name: lab.name, honesty: lab.honesty, honestyNote: lab.honestyNote },
          s.expLabel,
          s.params,
          s.samples.length > 0 ? s.samples[s.samples.length - 1].stats : {},
          s.blocks,
        )}
      />
    </>
  );
}

function RecordButton({ s }: { s: CustomState }) {
  return (
    <div className="record-actions">
      <button className={`chip-btn record-btn ${s.recording ? 'active' : ''}`} onClick={s.toggleRecording}>
        {s.recording ? `⏹ Zatrzymaj (${s.samples.length})` : '⏺ Nagrywaj'}
      </button>
    </div>
  );
}

/** Wariant 2D — laboratoria z createSim (pętla płótna). */
function CustomExperiment2D({ lab }: { lab: LabDefinition }) {
  const s = useCustomExperimentState(lab);
  const sim = useMemo(() => lab.createSim!(), [lab]);
  const canvasRef = useSimLoop(sim, s.params, s.running, s.onStats);

  useEffect(() => registerActiveSimControls({
    toggleRunning: () => s.setRunning((r) => !r),
    reset: sim.reset ? () => sim.reset!() : undefined,
  }), [sim]);

  return (
    <>
      <div className="sim-stage">
        <canvas ref={canvasRef} role="img" aria-label={`Twój własny eksperyment w ${lab.name}. Wartości i analizę opisuje panel poniżej.`} />
        <div className="sim-actions">
          {sim.reset && <button className="chip-btn" onClick={() => sim.reset!()}>↺ Od nowa</button>}
          <button className="chip-btn" onClick={() => s.setRunning((r) => !r)}>{s.running ? '❚❚ Pauza' : '▶ Start'}</button>
        </div>
        <RecordButton s={s} />
      </div>
      <CustomBelowStage lab={lab} s={s} />
    </>
  );
}

/** Wariant 3D — laboratoria z createSim3D (Three.js). Chemia, Biologia i inne bazy 3D. */
function CustomExperiment3D({ lab }: { lab: LabDefinition }) {
  const s = useCustomExperimentState(lab);
  const sim = useMemo(() => lab.createSim3D!(), [lab]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, s.params, s.running, s.onStats);

  useEffect(() => registerActiveSimControls({
    toggleRunning: () => s.setRunning((r) => !r),
    reset: sim.reset ? () => sim.reset!() : undefined,
  }), [sim]);

  return (
    <>
      <div className="sim-stage stage-3d">
        <canvas ref={canvasRef} role="img" aria-label={`Twój własny eksperyment 3D w ${lab.name}. Przeciągnij, by obrócić. Wartości i analizę opisuje panel poniżej.`} />
        {!failed && (
          <div className="stage-3d-badge"><span className="mdot" aria-hidden="true" /> {loading ? 'ŁADOWANIE SILNIKA 3D…' : '3D · WEBGL'}</div>
        )}
        {failed && (
          <div className="empty-state" style={{ position: 'absolute', inset: '1rem', margin: 0 }}>
            Nie udało się uruchomić silnika 3D w tej przeglądarce (WebGL niedostępny lub zablokowany). Reszta platformy działa bez zmian.
          </div>
        )}
        <div className="sim-actions">
          {sim.reset && <button className="chip-btn" onClick={() => sim.reset!()}>↺ Od nowa</button>}
          <button className="chip-btn" onClick={() => s.setRunning((r) => !r)}>{s.running ? '❚❚ Pauza' : '▶ Start'}</button>
        </div>
        <RecordButton s={s} />
      </div>
      <CustomBelowStage lab={lab} s={s} />
    </>
  );
}
