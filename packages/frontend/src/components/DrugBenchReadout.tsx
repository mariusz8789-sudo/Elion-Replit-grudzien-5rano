import { capabilityLabel } from '../core/capabilityNames';
import { BENCH_ZONES, type BenchLayout, type BenchZone } from '../core/liveExperiment/drugBenchLayout';
import type { DockingStep, LiveCandidate, LiveDrugRunState } from '../core/liveExperiment/drugRunState';
import { TechnicalDetails, engineRowsFor } from './TechnicalDetails';

/**
 * The drug bench's readout in the Laboratory: what the persisted campaign state
 * says, row by row. Rows name the capability (Interaction Modeling, Quantum
 * Chemistry); the engines behind them sit under technical details.
 */

/** The docking chip on a candidate card: the step's name, never the engine's. */
export const DOCKING_SHORT = 'Dokowanie';

/** What the bench shows for each persisted docking step (the backend writes a step only once it is done). */
export const DOCKING_STEP_LABEL: Record<DockingStep | 'NONE', string> = {
  NONE: '—',
  SELECTED: 'kandydat wybrany do dokowania',
  LIGAND_PREPARED: 'ligand przygotowany do dokowania',
  VINA_STARTED: 'trwa dokowanie',
  POSE_SCORED: 'poza wyznaczona i oceniona',
  FAILED: 'dokowanie nie powiodło się',
};

/** What each bench row is called in the world — plain words, no engine names. */
const ZONE_LABEL_PL: Readonly<Record<BenchZone, string>> = {
  QUEUE: 'w kolejce', ADMET: 'w analizatorze', DOCKING: 'w dokowaniu', FINALIST: 'finaliści', DISCARD: 'odrzucone',
};

export function DrugBenchReadout({ state: st, focus, layout }: { readonly state: LiveDrugRunState; readonly focus: LiveCandidate | null; readonly layout: BenchLayout }): JSX.Element {
  return (
    <dl className="sw-drug-dl">
      <dt>Cel białkowy</dt><dd>{st.target ? `${st.target.protein} · PDB ${st.target.pdbId}, łańcuch ${st.target.chain} (${st.target.receptorAtoms} atomów)` : 'receptor jeszcze nieprzygotowany'}</dd>
      <dt>Generacje</dt><dd>{st.generationsCompleted}/{st.maxGenerations}</dd>
      <dt>Kandydaci</dt><dd>{st.candidates.length} (zachowani {st.candidates.filter((c) => c.status === 'retained').length})</dd>
      <dt>Na stole</dt><dd>{BENCH_ZONES.map((z) => `${ZONE_LABEL_PL[z]} ${layout.counts[z]}`).join(' · ')}</dd>
      {layout.finalists.length > 0 && <><dt>Finaliści</dt><dd>{layout.finalists.map((f) => `#${f.rank} ${f.dockingScore?.toFixed(2)} kcal/mol`).join(' · ')}</dd></>}
      {layout.samples.some((x) => x.rejectedReason) && <><dt>Odrzucone</dt><dd>{[...new Set(layout.samples.filter((x) => x.rejectedReason).map((x) => x.rejectedReason))].join(' · ')}</dd></>}
      <dt>Fokus</dt><dd className="cw-mono">{focus?.smiles ?? '—'}</dd>
      <dt>{capabilityLabel('property-safety')}</dt><dd>{focus?.stages.admet?.status ?? '—'}</dd>
      <dt>Krok dokowania</dt><dd>{DOCKING_STEP_LABEL[focus?.dockingStep ?? 'NONE']}</dd>
      <dt>{capabilityLabel('interaction-modeling')}</dt><dd>{focus?.stages.docking?.value != null ? `${focus.stages.docking.value.toFixed(2)} kcal/mol` : focus?.stages.docking?.status ?? '—'}</dd>
      <dt>Poza w kieszeni</dt><dd>{focus?.pose ? `${focus.pose.atoms.length} atomów, reszty: ${focus.pose.pocketResidues.slice(0, 6).join(', ')}${focus.pose.pocketResidues.length > 6 ? '…' : ''}` : '—'}</dd>
      <dt>{capabilityLabel('quantum-chemistry')}</dt><dd>{focus?.stages.quantum?.value != null ? `${focus.stages.quantum.value.toFixed(2)} eV` : focus?.stages.quantum?.status ?? '—'}</dd>
      {st.blocked.length > 0 && <><dt>Zablokowane</dt><dd>{st.blocked.map((b) => `${b.stage}: ${b.blocker}`).join(' · ')}</dd></>}
    </dl>
  );
}

export function DrugBenchNote({ focus }: { readonly focus: LiveCandidate | null }): JSX.Element {
  return (
    <>
      <p className="sw-drug-note">
        Geometria cząsteczek i przebieg dokowania to REAL ENGINE OUTPUT; wynik dokowania pozostaje estymatą funkcji oceniającej przy sztywnym receptorze, nie zmierzonym powinowactwem.
        Predykcje właściwości i bezpieczeństwa (ADMET) to MODEL_ESTIMATE. Przekształcenia cząsteczek to COMPUTATIONAL TRANSFORMATION — obliczenia, nie synteza w laboratorium.
      </p>
      <TechnicalDetails testId="drug-bench-tech" rows={[
        ...engineRowsFor(['molecular-analysis', 'property-safety', 'interaction-modeling', 'quantum-chemistry']),
        ...(focus?.pose ? [{ label: 'Silnik pozy w fokusie', value: focus.pose.engine }] : []),
        { label: 'Przygotowanie ligandu', value: 'RDKit + Meeko' },
      ]} />
    </>
  );
}
