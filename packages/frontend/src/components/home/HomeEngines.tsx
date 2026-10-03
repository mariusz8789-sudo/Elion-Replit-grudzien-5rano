import { useEffect, useState } from 'react';
import { getGenesisSelfModel, listToolchain, type SelfModelEngine, type ToolchainEntry } from '../../core/backend/client';
import type { CapabilityKey } from '../../core/capabilityNames';

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
 *
 * Customer screens show each engine's CAPABILITY (`core/capabilityNames.ts`);
 * the engine name itself is shown only under technical details.
 */

export interface HomeEngine {
  readonly name: string;
  /** What the engine does for a person, in the capability vocabulary. */
  readonly capability: CapabilityKey;
  readonly role: string;
  /** Toolchain id in the backend registry, or null when the engine is not a registered runtime. */
  readonly toolId: string | null;
  readonly note?: string;
  /** Where it really ran, as committed evidence; null when no run record is committed. */
  readonly record: string | null;
}

export const HOME_ENGINES: readonly HomeEngine[] = [
  { name: 'RDKit', capability: 'molecular-analysis', role: 'Reads molecules, computes descriptors and 3D conformers.', toolId: 'rdkit', record: 'Astex runs 1–6' },
  { name: 'AutoDock Vina', capability: 'interaction-modeling', role: 'Docks a ligand into the protein pocket and scores the pose.', toolId: 'vina', record: 'imatinib redock, Astex 1–6' },
  { name: 'Meeko', capability: 'interaction-modeling', role: 'Prepares ligands and receptors for Vina.', toolId: null, note: 'in the Vina worker', record: 'imatinib redock' },
  { name: 'GNINA', capability: 'interaction-modeling', role: 'CNN rescoring of docked poses.', toolId: null, note: 'benchmark only · not in product', record: 'Astex run 7' },
  { name: 'ADMET-AI', capability: 'property-safety', role: 'Estimates 52 absorption, metabolism and toxicity endpoints.', toolId: 'admet', record: null },
  { name: 'PySCF', capability: 'quantum-chemistry', role: 'Quantum chemistry: energies and orbitals.', toolId: 'pyscf', record: 'natural-product QM run' },
  { name: 'OpenMM', capability: 'molecular-dynamics', role: 'Molecular dynamics of the protein.', toolId: 'openmm', record: null },
  { name: 'AiZynthFinder', capability: 'retrosynthetic-planning', role: 'Retrosynthesis: how a chemist could make it.', toolId: 'aizynthfinder', record: 'imatinib route, Replay MATCH' },
  { name: 'Biopython', capability: 'structural-analysis', role: 'Reads protein structures and sequences.', toolId: 'biopython', record: null },
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

/** The live engine answer (self model first, toolchain for versions). */
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
