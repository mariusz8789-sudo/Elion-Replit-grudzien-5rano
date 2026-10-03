import { useEffect, useState } from 'react';
import type React from 'react';
import { getGenesisSelfModel, listToolchain, type SelfModelEngine, type ToolchainEntry } from '../../core/backend/client';

/**
 * ENGINES — the scientific engines Genesis calls, each with two separate facts:
 *   - "This server": whether the runtime works NOW, read from the backend self
 *     model (`GET /api/genesis/self`: an engine is available only with current
 *     worker health and a proof run), with its own sentence when it is not. The
 *     toolchain registry only adds the version. Never assumed: until the self
 *     model answers the chip reads "checking", and a BLOCKED engine reads blocked.
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

export type Live =
  | { phase: 'checking' }
  | { phase: 'ready'; self: ReadonlyMap<string, SelfModelEngine>; byId: ReadonlyMap<string, ToolchainEntry> }
  | { phase: 'unreachable' };

export interface LiveLabel { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted'; detail?: string }

/** Polish chip words for `pl`; every other language keeps the English ones (no unchecked translation). */
const CHIP_PL = { checking: 'sprawdzam…', unreachable: 'serwer nie odpowiada', notReported: 'brak zgłoszenia', blocked: 'ZABLOKOWANY', available: 'DOSTĘPNY' } as const;
const CHIP_EN = { checking: 'checking…', unreachable: 'server unreachable', notReported: 'not reported', blocked: 'BLOCKED', available: 'AVAILABLE' } as const;

export function liveLabel(engine: HomeEngine, live: Live, locale: 'pl' | 'en' = 'en'): LiveLabel {
  const w = locale === 'pl' ? CHIP_PL : CHIP_EN;
  if (engine.toolId === null) return { text: engine.note ?? 'Not a registered runtime', tone: 'muted' };
  if (live.phase === 'checking') return { text: w.checking, tone: 'muted' };
  if (live.phase === 'unreachable') return { text: w.unreachable, tone: 'muted' };
  const self = live.self.get(engine.toolId);
  if (!self) return { text: w.notReported, tone: 'muted' };
  if (!self.runtimeAvailableNow) return { text: w.blocked, tone: 'warn', detail: self.statement };
  const version = live.byId.get(engine.toolId)?.version;
  return { text: `${w.available}${version ? ` · ${version}` : ''}`, tone: 'ok', detail: self.statement };
}

export function HomeEngines(): React.ReactElement {
  const live = useLiveToolchain();

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
              <p className={`hp-pill hp-pill-${s.tone}`} title={s.detail}>{s.text}</p>
              <p className="hp-engine-record">{e.record ? <>Ran: {e.record}</> : 'No committed run yet'}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The live engine answer (self model first, toolchain for versions), shared by the full panel and the dashboard row. */
export function useLiveToolchain(): Live {
  const [live, setLive] = useState<Live>({ phase: 'checking' });
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getGenesisSelfModel(), listToolchain().catch(() => null)])
      .then(([self, tools]) => {
        if (cancelled) return;
        if (!self.ok) { setLive({ phase: 'unreachable' }); return; }
        setLive({
          phase: 'ready',
          self: new Map(self.data.engines.map((e) => [e.toolId, e])),
          byId: new Map(tools?.ok ? tools.data.map((t) => [t.toolId, t]) : []),
        });
      })
      .catch(() => { if (!cancelled) setLive({ phase: 'unreachable' }); });
    return () => { cancelled = true; };
  }, []);
  return live;
}

/**
 * Dashboard row: one chip per registered runtime engine, status live from the
 * server. Engines outside the runtime registry (Meeko, GNINA) are named in the
 * footnote instead of getting a status they do not have.
 */
export function HomeEnginesRow(): React.ReactElement {
  const live = useLiveToolchain();
  const runtimes = HOME_ENGINES.filter((e) => e.toolId !== null);
  const outside = HOME_ENGINES.filter((e) => e.toolId === null);
  const meta = live.phase === 'checking' ? 'checking this server…' : live.phase === 'unreachable' ? 'server unreachable · status unknown' : 'live from this server';
  return (
    <section className="hp-card hp-engines-row" aria-labelledby="hp-engines-title" data-testid="home-engines">
      <header className="hp-card-head">
        <h2 id="hp-engines-title">Engines</h2>
        <span>{meta}</span>
      </header>
      <ul>
        {runtimes.map((e) => {
          const s = liveLabel(e, live);
          return (
            <li key={e.name} className={`hp-tone-${s.tone}`} title={`${e.role} ${s.detail ?? s.text}`} data-testid={`home-engine-${e.name.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
              <i aria-hidden="true" />{e.name}<span className="hp-sr"> · {s.text}</span>
            </li>
          );
        })}
      </ul>
      <p className="hp-area-note">{outside.map((e) => `${e.name}: ${e.note ?? 'not a registered runtime'}`).join(' · ')}</p>
    </section>
  );
}
