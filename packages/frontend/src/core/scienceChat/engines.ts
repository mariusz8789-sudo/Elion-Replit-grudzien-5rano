import { capabilityLabel, type CapabilityKey } from '../capabilityNames';

/**
 * WHAT THE ASK FIELD CAN RUN — the picker above the chat input. Every prompt
 * here is one the existing router already understands (resolveCommand or the
 * Experiment Fabric parser); picking one only fills the field, nothing runs
 * until the person sends it (and a plan still waits for confirmation).
 *
 * The chip names the task and its capability, never the engine: the engine
 * that runs it is recorded in Evidence and Replay once it has run, and stays
 * in `engine` here for technical views only.
 */
export interface ChatEngine {
  readonly id: string;
  /** What the person gets, in plain words. */
  readonly task: string;
  /** The capability that does it (shown), or a public data source when the task reads data. */
  readonly capability?: CapabilityKey;
  readonly source?: string;
  /** The engine behind it: technical details only, never on the chip. */
  readonly engine: string;
  readonly prompt: string;
}

export const CHAT_ENGINES: readonly ChatEngine[] = [
  { id: 'docking', task: 'Drug docking', capability: 'interaction-modeling', engine: 'AutoDock Vina', prompt: 'Znajdź kandydatów dla A1' },
  { id: 'molecule', task: 'Molecule in 3D', capability: 'molecular-analysis', engine: 'RDKit', prompt: 'Show molecule lab' },
  { id: 'md', task: 'Protein motion', capability: 'molecular-dynamics', engine: 'OpenMM', prompt: 'Uruchom dynamikę molekularną białka 1VII' },
  { id: 'qc', task: 'Molecule energy', capability: 'quantum-chemistry', engine: 'PySCF', prompt: 'Policz energię Hartree-Fock RHF dla H2' },
  { id: 'antibody', task: 'Antibody structure', capability: 'structural-analysis', engine: 'Biopython', prompt: 'Porównaj RMSD struktur PDB HIV 10E8 5GHW i 4G6F' },
  { id: 'depmap', task: 'Cancer genetics', source: 'DepMap CRISPR', engine: 'DepMap CRISPR', prompt: 'Uruchom panel DepMap CRISPR p53/p21/p16/RB' },
  { id: 'photonics', task: 'Light and optics', capability: 'simulation', engine: 'PyMeep FDTD', prompt: 'Uruchom symulację FDTD: transmisja Fresnela na granicy dielektrycznej' },
  { id: 'cern', task: 'Particle physics', source: 'CMS Open Data', engine: 'CMS Open Data', prompt: 'Open real CMS data' },
  { id: 'human', task: 'Human body', source: 'BodyParts3D atlas', engine: 'BodyParts3D atlas', prompt: 'Show brain' },
  { id: 'orbits', task: 'Gravity', capability: 'simulation', engine: 'N-body integrator', prompt: 'Run a three-body simulation' },
];

/** The line under a chip: its capability, or the public data source it reads. */
export function chatEngineLine(engine: ChatEngine): string {
  return engine.capability !== undefined ? capabilityLabel(engine.capability, 'en') : engine.source ?? '';
}
