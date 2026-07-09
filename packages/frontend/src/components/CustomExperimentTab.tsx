import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabDefinition, NarrationBlock, SimParams } from '../core/types';
import { useSimLoop } from '../core/useSimLoop';
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
 * Zero nowej infrastruktury AI: bloki analizy mają dokładnie kształt
 * NarrationBlock, więc trafiają do tego samego NarratorPanel i tego samego
 * askAI()/backendu z groundingiem w knowledge/<lab>.md, co reszta platformy.
 */
export function CustomExperimentTab({ lab }: { lab: LabDefinition }) {
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

  const sim = useMemo(() => lab.createSim!(), [lab]);

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

  const canvasRef = useSimLoop(sim, params, running, onStats);

  useEffect(() => {
    return registerActiveSimControls({
      toggleRunning: () => setRunning((r) => !r),
      reset: sim.reset ? () => sim.reset!() : undefined,
    });
  }, [sim]);

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

  const handleLoad = (entry: CustomExperiment) => {
    setParams((prev) => ({ ...prev, ...entry.params }));
  };

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

  return (
    <>
      <div className="sim-stage">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Twój własny eksperyment w ${lab.name}. Wartości i analizę opisuje panel poniżej.`}
        />
        <div className="sim-actions">
          {sim.reset && (
            <button className="chip-btn" onClick={() => sim.reset!()}>
              ↺ Od nowa
            </button>
          )}
          <button className="chip-btn" onClick={() => setRunning((r) => !r)}>
            {running ? '❚❚ Pauza' : '▶ Start'}
          </button>
        </div>
        <div className="record-actions">
          <button className={`chip-btn record-btn ${recording ? 'active' : ''}`} onClick={toggleRecording}>
            {recording ? `⏹ Zatrzymaj (${samples.length})` : '⏺ Nagrywaj'}
          </button>
        </div>
      </div>

      <HonestyBadge level={lab.honesty} note={lab.honestyNote} />

      <Controls defs={lab.params} params={params} onChange={(k, v) => setParams((p) => ({ ...p, [k]: v }))} />

      <div className="custom-exp-save">
        <input
          type="text"
          value={saveName}
          maxLength={60}
          placeholder="Nazwij ten zestaw parametrów…"
          aria-label="Nazwa eksperymentu do zapisania"
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
        />
        <button className="chip-btn" onClick={handleSave} disabled={!saveName.trim()}>
          Zapisz
        </button>
      </div>

      {saved.length > 0 && (
        <div className="custom-exp-list">
          {saved.map((e) => (
            <div className="custom-exp-item" key={e.id}>
              <button className="custom-exp-load" onClick={() => handleLoad(e)}>
                {e.name}
              </button>
              <button className="custom-exp-delete" aria-label={`Usuń „${e.name}"`} onClick={() => handleDelete(e.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <NarratorPanel
        blocks={blocks}
        askContext={buildContext(
          { id: lab.id, name: lab.name, honesty: lab.honesty, honestyNote: lab.honestyNote },
          expLabel,
          params,
          samples.length > 0 ? samples[samples.length - 1].stats : {},
          blocks,
        )}
      />
    </>
  );
}
