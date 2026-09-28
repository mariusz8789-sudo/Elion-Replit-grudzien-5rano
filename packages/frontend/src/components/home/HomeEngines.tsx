import { useEffect, useState } from 'react';
import type React from 'react';
import { listToolchain, type ToolchainEntry } from '../../core/backend/client';

/**
 * ENGINES — the scientific engines Genesis calls, each with two separate facts:
 *   - "This server": the live status the backend's toolchain registry reports
 *     (`GET /api/compute/toolchain`, validated at runtime). Never assumed: until
 *     it answers the chip reads "checking", and a BLOCKED engine reads blocked.
 *   - "Recorded run": the committed evidence file in which the engine really ran,
 *     or plainly "no committed run yet".
 * Engines outside the runtime registry (Meeko, GNINA) say so instead of borrowing
 * a status. GNINA is a benchmark scorer only and is not a product dependency.
 */

export interface HomeEngine {
  readonly name: string;
  readonly role: string;
  /** Toolchain id in the backend registry, or null when the engine is not a registered runtime. */
  readonly toolId: string | null;
  readonly note?: string;
  /** Where it really ran, as committed evidence; null when no run record is committed. */
  readonly record: string | null;
}

export const HOME_ENGINES: readonly HomeEngine[] = [
  { name: 'RDKit', role: 'Reads molecules, computes descriptors and 3D conformers.', toolId: 'rdkit', record: 'Astex runs 1–6' },
  { name: 'AutoDock Vina', role: 'Docks a ligand into the protein pocket and scores the pose.', toolId: 'vina', record: 'imatinib redock, Astex 1–6' },
  { name: 'Meeko', role: 'Prepares ligands and receptors for Vina.', toolId: null, note: 'in the Vina worker', record: 'imatinib redock' },
  { name: 'GNINA', role: 'CNN rescoring of docked poses.', toolId: null, note: 'benchmark only · not in product', record: 'Astex run 7' },
  { name: 'ADMET-AI', role: 'Estimates 52 absorption, metabolism and toxicity endpoints.', toolId: 'admet', record: null },
  { name: 'PySCF', role: 'Quantum chemistry: energies and orbitals.', toolId: 'pyscf', record: 'natural-product QM run' },
  { name: 'OpenMM', role: 'Molecular dynamics of the protein.', toolId: 'openmm', record: null },
  { name: 'AiZynthFinder', role: 'Retrosynthesis: how a chemist could make it.', toolId: 'aizynthfinder', record: 'imatinib route, Replay MATCH' },
  { name: 'Biopython', role: 'Reads protein structures and sequences.', toolId: 'biopython', record: null },
];

type Live = { phase: 'checking' } | { phase: 'ready'; byId: ReadonlyMap<string, ToolchainEntry> } | { phase: 'unreachable' };

export function liveLabel(engine: HomeEngine, live: Live): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (engine.toolId === null) return { text: engine.note ?? 'Not a registered runtime', tone: 'muted' };
  if (live.phase === 'checking') return { text: 'checking…', tone: 'muted' };
  if (live.phase === 'unreachable') return { text: 'server unreachable', tone: 'muted' };
  const entry = live.byId.get(engine.toolId);
  if (!entry) return { text: 'not reported', tone: 'muted' };
  if (entry.status === 'AVAILABLE') return { text: `AVAILABLE${entry.version ? ` · ${entry.version}` : ''}`, tone: 'ok' };
  if (entry.status === 'VALIDATION_FAILED') return { text: 'VALIDATION_FAILED', tone: 'bad' };
  return { text: entry.status, tone: 'warn' };
}

export function HomeEngines(): React.ReactElement {
  const [live, setLive] = useState<Live>({ phase: 'checking' });
  useEffect(() => {
    let cancelled = false;
    void listToolchain()
      .then((r) => {
        if (cancelled) return;
        setLive(r.ok ? { phase: 'ready', byId: new Map(r.data.map((t) => [t.toolId, t])) } : { phase: 'unreachable' });
      })
      .catch(() => { if (!cancelled) setLive({ phase: 'unreachable' }); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="hp-panel hp-span-7" aria-labelledby="hp-engines-title" data-testid="home-engines">
      <header className="hp-panel-head">
        <h2 id="hp-engines-title">Scientific engines already connected</h2>
        <span className="hp-panel-meta">status: live from this server</span>
      </header>
      <ul className="hp-engines">
        {HOME_ENGINES.map((e) => {
          const s = liveLabel(e, live);
          return (
            <li key={e.name} className="hp-engine" data-testid={`home-engine-${e.name.toLowerCase().replace(/[^a-z]+/g, '-')}`} title={e.role}>
              <p className="hp-engine-name">{e.name}</p>
              <p className={`hp-pill hp-pill-${s.tone}`}>{s.text}</p>
              <p className="hp-engine-record">{e.record ? <>Ran: {e.record}</> : 'No committed run yet'}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
