import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExperimentDef, LabDefinition, SimParams } from '../core/types';
import { useSimLoop } from '../core/useSimLoop';
import { useThreeLoop } from '../core/three/useThreeLoop';
import { Controls, defaultParams } from './Controls';
import { NarratorPanel } from './NarratorPanel';
import { HonestyBadge } from './HonestyBadge';
import { CustomExperimentTab } from './CustomExperimentTab';
import { narrate } from '../narrator/engine';
import { buildContext } from '../narrator/askAI';
import { registerActiveSimControls } from '../core/activeSimControls';
import { recordVisit, recordStats } from '../core/discoveryLog';
import { track } from '../core/analytics';
import { consumePendingScenario } from '../core/scenarioBridge';
import { useScrollEdges } from '../core/useScrollEdges';
import { playSimStart, playSimPause } from '../core/sound';

const CREATE_TAB_ID = '__create';

/**
 * Standardowy ekran laboratorium. Od Etapu 1 laboratorium to kolekcja
 * eksperymentów: pola bazowe LabDefinition opisują eksperyment pierwszy,
 * lista lab.experiments dodaje kolejne (przełącznik nad sceną). Ostatnia
 * zakładka, zawsze obecna: "Stwórz eksperyment" — patrz CustomExperimentTab.
 */
export function LabShell({ lab }: { lab: LabDefinition }) {
  const experiments = useMemo<ExperimentDef[]>(() => {
    const base: ExperimentDef = {
      id: '__base',
      name: 'Podstawowy',
      honesty: lab.honesty,
      honestyNote: lab.honestyNote,
      params: lab.params,
      createSim: lab.createSim,
      createSim3D: lab.createSim3D,
      narrate: lab.narrate,
    };
    return [base, ...(lab.experiments ?? [])];
  }, [lab]);

  // Skonsumowany dokładnie raz na całe życie tego LabShell (nie przy każdym
  // przełączeniu zakładki) — most z "Co by było, gdyby?"/Multiverse Nexus/
  // Discovery Timeline może wskazać KONKRETNY eksperyment, nie tylko bazowy.
  const [pendingScenario] = useState(() => consumePendingScenario(lab.id));
  const targetExperimentId = pendingScenario?.experimentId ?? '__base';

  const [expIdx, setExpIdx] = useState(() => {
    if (!pendingScenario) return 0;
    const idx = experiments.findIndex((e) => e.id === targetExperimentId);
    return idx >= 0 ? idx : 0;
  });
  const isCreateTab = expIdx === experiments.length;
  const activeExp = experiments[expIdx];
  const initialParams = activeExp?.id === targetExperimentId ? pendingScenario?.params : undefined;

  const tabsRef = useRef<HTMLDivElement>(null);
  const { atStart, atEnd } = useScrollEdges(tabsRef);

  return (
    <div className="lab-view" style={{ ['--accent' as string]: lab.accent }}>
      <div className={`exp-tabs-wrap ${atStart ? '' : 'has-more-start'} ${atEnd ? '' : 'has-more-end'}`}>
        <div className="exp-tabs" role="tablist" aria-label="Eksperymenty" ref={tabsRef}>
          {experiments.map((e, i) => (
            <button key={e.id} role="tab" aria-selected={i === expIdx} onClick={() => setExpIdx(i)}>
              {i === 0 ? experimentBaseName(lab) : e.name}
            </button>
          ))}
          <button role="tab" aria-selected={isCreateTab} onClick={() => setExpIdx(experiments.length)}>
            🧪 Stwórz eksperyment
          </button>
        </div>
      </div>
      {isCreateTab ? (
        <CustomExperimentTab key={`${lab.id}:${CREATE_TAB_ID}`} lab={lab} />
      ) : activeExp.createSim3D ? (
        <ExperimentView3D key={`${lab.id}:${activeExp.id}`} exp={activeExp} lab={lab} initialParams={initialParams} />
      ) : (
        <ExperimentView key={`${lab.id}:${activeExp.id}`} exp={activeExp} lab={lab} initialParams={initialParams} />
      )}
    </div>
  );
}

/** Nazwa bazowego eksperymentu — z pierwszego członu tagline laboratorium. */
function experimentBaseName(lab: LabDefinition): string {
  const names: Record<string, string> = {
    universe: 'Ekspansja',
    spacetime: 'Zegary świetlne',
    einstein: 'Czarna dziura 3D',
    quantum: 'Dwie szczeliny',
    nuclear: 'Rozpad',
    particle: 'Detektor',
    chemistry: 'Wiązania chemiczne',
    multiverse: 'Inne stałe',
    civilization: 'Skala Kardaszewa',
  };
  return names[lab.id] ?? 'Podstawowy';
}

/**
 * Wspólny stan powłoki eksperymentu (parametry, tryb pracy, statystyki,
 * narracja) — identyczny dla scen 2D i 3D. Tylko silnik renderujący
 * (useSimLoop vs useThreeLoop) różni się między ExperimentView i
 * ExperimentView3D poniżej.
 */
function useExperimentShell(exp: ExperimentDef, lab: LabDefinition, initialParams?: Partial<SimParams>) {
  const [params, setParams] = useState<SimParams>(() => {
    const base = defaultParams(exp.params);
    // Nadpisanie z mostu scenariusza (LabShell konsumuje go raz, wyżej) —
    // "Co by było, gdyby?"/Multiverse Nexus/Discovery Timeline. Jednorazowe:
    // przełączenie zakładki i powrót już niczego nie nadpisze (nowy mount).
    if (initialParams) return { ...base, ...initialParams } as SimParams;
    return base;
  });
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const statsRef = useRef(stats);
  const lastStatsAt = useRef(0);

  const onStats = useMemo(
    () => (s: Record<string, number>) => {
      // Narracja odświeża się najwyżej raz na sekundę — bez tego szybko
      // zmieniające się statystyki powodują ciągłe przerysowania panelu.
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

  const expLabel = exp.id === '__base' ? lab.name : exp.name;

  useEffect(() => {
    recordVisit(lab.id, exp.id === '__base' ? '__base' : exp.id);
    track('experiment_open', { lab: lab.id, experiment: exp.id });
  }, [lab.id, exp.id]);
  useEffect(() => {
    recordStats(lab.id, exp.id === '__base' ? '__base' : exp.id, stats);
  }, [lab.id, exp.id, stats]);

  const blocks = narrate({ ...lab, honesty: exp.honesty, narrate: exp.narrate }, params, stats);

  return { params, setParams, running, setRunning, stats, onStats, expLabel, blocks };
}

function StageActions({ running, onToggle, onReset }: { running: boolean; onToggle: () => void; onReset?: () => void }) {
  return (
    <div className="sim-actions">
      {onReset && (
        <button className="chip-btn" onClick={onReset} title="Skrót: R">
          ↺ Od nowa
        </button>
      )}
      <button className="chip-btn" onClick={onToggle} title="Skrót: Spacja">
        {running ? '❚❚ Pauza' : '▶ Start'}
      </button>
    </div>
  );
}

function BelowStage({
  exp, lab, params, setParams, blocks, expLabel, stats,
}: {
  exp: ExperimentDef; lab: LabDefinition; params: SimParams; setParams: (fn: (p: SimParams) => SimParams) => void;
  blocks: ReturnType<typeof narrate>; expLabel: string; stats: Record<string, number>;
}) {
  return (
    <>
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

function ExperimentView({ exp, lab, initialParams }: { exp: ExperimentDef; lab: LabDefinition; initialParams?: Partial<SimParams> }) {
  const { params, setParams, running, setRunning, stats, onStats, expLabel, blocks } = useExperimentShell(exp, lab, initialParams);
  const sim = useMemo(() => exp.createSim!(), [exp]);
  const canvasRef = useSimLoop(sim, params, running, onStats);
  const toggleRunning = () => setRunning((r) => { const next = !r; (next ? playSimStart : playSimPause)(); return next; });

  useEffect(() => {
    return registerActiveSimControls({
      toggleRunning,
      reset: sim.reset ? () => sim.reset!() : undefined,
    });
  }, [sim, setRunning]);

  return (
    <>
      <div className="sim-stage">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Symulacja: ${expLabel}. Wartości i wnioski opisuje panel Narrator AI poniżej.`}
        />
        <StageActions running={running} onToggle={toggleRunning} onReset={sim.reset ? () => sim.reset!() : undefined} />
      </div>
      <BelowStage exp={exp} lab={lab} params={params} setParams={setParams} blocks={blocks} expLabel={expLabel} stats={stats} />
    </>
  );
}

/** Wariant sceny 3D (Three.js) — patrz core/three/useThreeLoop.ts i core/three/types.ts. */
function ExperimentView3D({ exp, lab, initialParams }: { exp: ExperimentDef; lab: LabDefinition; initialParams?: Partial<SimParams> }) {
  const { params, setParams, running, setRunning, stats, onStats, expLabel, blocks } = useExperimentShell(exp, lab, initialParams);
  const sim = useMemo(() => exp.createSim3D!(), [exp]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, running, onStats);
  const toggleRunning = () => setRunning((r) => { const next = !r; (next ? playSimStart : playSimPause)(); return next; });

  useEffect(() => {
    return registerActiveSimControls({
      toggleRunning,
      reset: sim.reset ? () => sim.reset!() : undefined,
    });
  }, [sim, setRunning]);

  return (
    <>
      <div className="sim-stage stage-3d">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Scena 3D: ${expLabel}. Przeciągnij, by obrócić kamerę. Wartości i wnioski opisuje panel Narrator AI poniżej.`}
        />
        {!failed && (
          <div className="stage-3d-badge">
            <span className="mdot" aria-hidden="true" /> {loading ? 'ŁADOWANIE SILNIKA 3D…' : '3D · WEBGL'}
          </div>
        )}
        {!loading && !failed && <div className="stage-3d-hint">przeciągnij / scrolluj</div>}
        {failed && (
          <div className="empty-state" style={{ position: 'absolute', inset: '1rem', margin: 0 }}>
            Nie udało się uruchomić silnika 3D w tej przeglądarce (WebGL niedostępny lub zablokowany). Pozostała
            część platformy, łącznie z płaską wersją tego eksperymentu, działa bez zmian.
          </div>
        )}
        <StageActions running={running} onToggle={toggleRunning} onReset={sim.reset ? () => sim.reset!() : undefined} />
      </div>
      <BelowStage exp={exp} lab={lab} params={params} setParams={setParams} blocks={blocks} expLabel={expLabel} stats={stats} />
    </>
  );
}
