import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExperimentDef, LabDefinition, SimParams } from '../core/types';
import { useSimLoop } from '../core/useSimLoop';
import { Controls, defaultParams } from './Controls';
import { NarratorPanel } from './NarratorPanel';
import { HonestyBadge } from './HonestyBadge';
import { narrate } from '../narrator/engine';
import { buildContext } from '../narrator/askAI';
import { registerActiveSimControls } from '../core/activeSimControls';
import { recordVisit, recordStats } from '../core/discoveryLog';
import { track } from '../core/analytics';

/**
 * Standardowy ekran laboratorium. Od Etapu 1 laboratorium to kolekcja
 * eksperymentów: pola bazowe LabDefinition opisują eksperyment pierwszy,
 * lista lab.experiments dodaje kolejne (przełącznik nad sceną).
 */
export function LabShell({ lab }: { lab: LabDefinition }) {
  const experiments = useMemo<ExperimentDef[]>(() => {
    const base: ExperimentDef = {
      id: '__base',
      name: 'Podstawowy',
      honesty: lab.honesty,
      honestyNote: lab.honestyNote,
      params: lab.params,
      createSim: lab.createSim!,
      narrate: lab.narrate,
    };
    return [base, ...(lab.experiments ?? [])];
  }, [lab]);

  const [expIdx, setExpIdx] = useState(0);
  const exp = experiments[expIdx];

  return (
    <div className="lab-view" style={{ ['--accent' as string]: lab.accent }}>
      {experiments.length > 1 && (
        <div className="exp-tabs" role="tablist" aria-label="Eksperymenty">
          {experiments.map((e, i) => (
            <button
              key={e.id}
              role="tab"
              aria-selected={i === expIdx}
              onClick={() => setExpIdx(i)}
            >
              {i === 0 ? experimentBaseName(lab) : e.name}
            </button>
          ))}
        </div>
      )}
      <ExperimentView key={`${lab.id}:${exp.id}`} exp={exp} lab={lab} />
    </div>
  );
}

/** Nazwa bazowego eksperymentu — z pierwszego członu tagline laboratorium. */
function experimentBaseName(lab: LabDefinition): string {
  const names: Record<string, string> = {
    universe: 'Ekspansja',
    spacetime: 'Zegary świetlne',
    einstein: 'Ugięcie światła',
    quantum: 'Dwie szczeliny',
    nuclear: 'Rozpad',
    particle: 'Detektor',
    multiverse: 'Inne stałe',
    civilization: 'Skala Kardaszewa',
  };
  return names[lab.id] ?? 'Podstawowy';
}

function ExperimentView({ exp, lab }: { exp: ExperimentDef; lab: LabDefinition }) {
  const [params, setParams] = useState<SimParams>(() => defaultParams(exp.params));
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const statsRef = useRef(stats);

  const sim = useMemo(() => exp.createSim(), [exp]);
  const lastStatsAt = useRef(0);
  const onStats = useMemo(
    () => (s: Record<string, number>) => {
      // Narracja odświeża się najwyżej raz na sekundę — bez tego szybko
      // zmieniające się statystyki (np. licznik par w CHSH) powodują ciągłe
      // przerysowania panelu i "uciekające" przyciski pod palcem.
      const now = performance.now();
      if (now - lastStatsAt.current < 1000) return;
      const prev = statsRef.current;
      const keys = Object.keys(s);
      if (keys.length !== Object.keys(prev).length || keys.some((k) => prev[k] !== s[k])) {
        lastStatsAt.current = now;
        statsRef.current = s;
        setStats(s);
      }
    },
    [],
  );
  const canvasRef = useSimLoop(sim, params, running, onStats);
  const expLabel = exp.id === '__base' ? lab.name : exp.name;

  // Skróty klawiszowe (Space/R) sterują AKTYWNYM eksperymentem — rejestracja
  // przy montażu, wyrejestrowanie przy zmianie/opuszczeniu (patrz activeSimControls.ts).
  useEffect(() => {
    return registerActiveSimControls({
      toggleRunning: () => setRunning((r) => !r),
      reset: sim.reset ? () => sim.reset!() : undefined,
    });
  }, [sim]);

  // Dziennik odkryć: wizyta odnotowana raz na eksperyment; progi osiągnięć
  // liczone z tych samych statystyk, które i tak widzi Narrator (zero nowych
  // obliczeń fizycznych — czysto lokalna obserwacja istniejących danych).
  useEffect(() => {
    recordVisit(lab.id, exp.id === '__base' ? '__base' : exp.id);
    track('experiment_open', { lab: lab.id, experiment: exp.id });
  }, [lab.id, exp.id]);
  useEffect(() => {
    recordStats(lab.id, exp.id === '__base' ? '__base' : exp.id, stats);
  }, [lab.id, exp.id, stats]);

  const blocks = narrate({ ...lab, honesty: exp.honesty, narrate: exp.narrate }, params, stats);

  return (
    <>
      <div className="sim-stage">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Symulacja: ${expLabel}. Wartości i wnioski opisuje panel Narrator AI poniżej.`}
        />
        <div className="sim-actions">
          {sim.reset && (
            <button className="chip-btn" onClick={() => sim.reset!()} title="Skrót: R">
              ↺ Od nowa
            </button>
          )}
          <button className="chip-btn" onClick={() => setRunning((r) => !r)} title="Skrót: Spacja">
            {running ? '❚❚ Pauza' : '▶ Start'}
          </button>
        </div>
      </div>

      <HonestyBadge level={exp.honesty} note={exp.honestyNote} />

      <Controls defs={exp.params} params={params} onChange={(k, v) => setParams((p) => ({ ...p, [k]: v }))} />

      <NarratorPanel
        blocks={blocks}
        askContext={buildContext(
          { id: lab.id, name: lab.name, honesty: exp.honesty, honestyNote: exp.honestyNote },
          expLabel,
          params,
          stats,
          blocks,
        )}
      />
    </>
  );
}
