/**
 * ENGINES THE ASK FIELD CAN RUN — the picker above the chat input. Every prompt
 * here is one the existing router already understands (resolveCommand or the
 * Experiment Fabric parser); picking an engine only fills the field, nothing runs
 * until the person sends it (and a plan still waits for confirmation).
 */
export interface ChatEngine {
  readonly id: string;
  /** What the person gets, in plain words. */
  readonly task: string;
  /** The engine or data source that does it. */
  readonly engine: string;
  readonly prompt: string;
}

export const CHAT_ENGINES: readonly ChatEngine[] = [
  { id: 'docking', task: 'Drug docking', engine: 'AutoDock Vina', prompt: 'Znajdź kandydatów dla A1' },
  { id: 'molecule', task: 'Molecule in 3D', engine: 'RDKit', prompt: 'Show molecule lab' },
  { id: 'md', task: 'Molecular dynamics', engine: 'OpenMM', prompt: 'Uruchom OpenMM na białku 1VII' },
  { id: 'qc', task: 'Quantum chemistry', engine: 'PySCF', prompt: 'Policz PySCF RHF dla H2' },
  { id: 'antibody', task: 'Antibody structure', engine: 'Biopython', prompt: 'Porównaj RMSD struktur PDB HIV 10E8 5GHW i 4G6F' },
  { id: 'depmap', task: 'Cancer genetics', engine: 'DepMap CRISPR', prompt: 'Uruchom panel DepMap CRISPR p53/p21/p16/RB' },
  { id: 'photonics', task: 'Light and optics', engine: 'PyMeep FDTD', prompt: 'Uruchom Meep FDTD: transmisja Fresnela na granicy dielektrycznej' },
  { id: 'cern', task: 'Particle physics', engine: 'CMS Open Data', prompt: 'Open real CMS data' },
  { id: 'human', task: 'Human body', engine: 'BodyParts3D atlas', prompt: 'Show brain' },
  { id: 'orbits', task: 'Gravity', engine: 'N-body integrator', prompt: 'Run a three-body simulation' },
];
