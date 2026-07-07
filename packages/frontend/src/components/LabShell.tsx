import { useMemo, useRef, useState } from 'react';
import type { LabDefinition, SimParams } from '../core/types';
import { HONESTY_LABELS } from '../core/types';
import { useSimLoop } from '../core/useSimLoop';
import { Controls, defaultParams } from './Controls';
import { NarratorPanel } from './NarratorPanel';
import { narrate } from '../narrator/engine';

/**
 * Standardowy ekran laboratorium: scena symulacji + tag uczciwości +
 * kontrolki + Narrator AI. Laboratoria z CustomView renderują własny ekran.
 */
export function LabShell({ lab }: { lab: LabDefinition }) {
  const [params, setParams] = useState<SimParams>(() => defaultParams(lab.params));
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const statsRef = useRef(stats);

  const sim = useMemo(() => lab.createSim?.() ?? null, [lab]);
  const onStats = useMemo(
    () => (s: Record<string, number>) => {
      // Aktualizacja stanu tylko gdy statystyki realnie się zmieniły —
      // inaczej narrator renderowałby się 4× na sekundę bez powodu.
      const prev = statsRef.current;
      const keys = Object.keys(s);
      if (keys.length !== Object.keys(prev).length || keys.some((k) => prev[k] !== s[k])) {
        statsRef.current = s;
        setStats(s);
      }
    },
    [],
  );
  const canvasRef = useSimLoop(sim, params, running, onStats);

  const blocks = narrate(lab, params, stats);

  return (
    <div className="lab-view" style={{ ['--accent' as string]: lab.accent }}>
      <div className="sim-stage">
        <canvas ref={canvasRef} />
        <div className="sim-actions">
          {sim?.reset && (
            <button className="chip-btn" onClick={() => sim.reset!()}>
              ↺ Od nowa
            </button>
          )}
          <button className="chip-btn" onClick={() => setRunning((r) => !r)}>
            {running ? '❚❚ Pauza' : '▶ Start'}
          </button>
        </div>
      </div>

      <div className="honesty-row">
        <span className={`honesty ${lab.honesty}`}>{HONESTY_LABELS[lab.honesty]}</span>
        <span className="honesty-note">{lab.honestyNote}</span>
      </div>

      <Controls defs={lab.params} params={params} onChange={(k, v) => setParams((p) => ({ ...p, [k]: v }))} />

      <NarratorPanel blocks={blocks} />
    </div>
  );
}
