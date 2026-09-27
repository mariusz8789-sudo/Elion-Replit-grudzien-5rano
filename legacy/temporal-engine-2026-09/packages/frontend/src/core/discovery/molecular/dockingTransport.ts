/**
 * DOCKING TRANSPORT — the seam to AutoDock Vina, the repository's REAL docking
 * engine (`packages/backend/src/compute/dockingAdapter.mjs` + `dock_worker.py`,
 * wrapping AutoDock Vina and Meeko).
 *
 * THE DISTINCTION THIS FILE EXISTS TO ENFORCE: a docking score is only a
 * statement about a target if it was computed against a REAL 3D receptor.
 *
 * The backend adapter accepts either a real receptor (`receptorPdbqt`) or a
 * small-molecule stand-in (`receptorSmiles`). The stand-in exists to exercise
 * the docking pipeline; a score against it is a smoke-test number and says
 * NOTHING about binding to any biological target. Reporting one as
 * `targetAffinity` would be fabrication performed by real software, so the
 * receptor kind travels with every result and the provider refuses to emit a
 * target affinity from a stand-in.
 *
 * A Vina score is also a PREDICTION, never a measurement — an empirical
 * scoring function's estimate, not an observed binding constant.
 */
export const DOCKING_TRANSPORT_VERSION = '1.0.0';

export type ReceptorKind = 'REAL_RECEPTOR' | 'SMALL_MOLECULE_STANDIN';

export interface ReceptorSpec {
  kind: ReceptorKind;
  /** Real receptor in PDBQT, when one is genuinely available. */
  pdbqt?: string;
  /** Stand-in receptor as SMILES — pipeline exercise only. */
  smiles?: string;
  /** Where the receptor came from. Never blank for a real receptor. */
  provenance: string;
  /**
   * Docking box centre in the receptor's own coordinates. REQUIRED for a real
   * receptor: without it there is no defined search volume, and Vina would be
   * pointed at an arbitrary region of the protein. Derived from the structure
   * by `receptorPreparation.node.ts`, never typed in.
   */
  center?: readonly [number, number, number];
  boxSize?: readonly [number, number, number];
}

export type DockingDetect =
  | { available: true; engine: string; vinaVersion: string; meekoVersion: string }
  | { available: false; reason: string };

export interface DockingPose {
  affinityKcalMol: number;
  rank: number;
}

export type DockingResult =
  | {
    ok: true;
    bestAffinityKcalMol: number;
    poses: readonly DockingPose[];
    receptorKind: ReceptorKind;
    engine: string;
    /** Deterministic seed actually used. */
    seed: number;
  }
  | { ok: false; error: 'BLOCKED_BY_RUNTIME' | 'INVALID_INPUT' | 'EXECUTION_FAILED'; reason: string };

export interface DockingRequest {
  ligandSmiles: string;
  receptor: ReceptorSpec;
  /** Deterministic seed — the same request must give the same score. */
  seed?: number;
  exhaustiveness?: number;
  nPoses?: number;
}

export interface DockingTransport {
  transportId: string;
  detect(): DockingDetect;
  dock(request: DockingRequest): DockingResult;
}

const NO_TRANSPORT = 'no docking transport configured for this runtime';

export const unavailableDockingTransport: DockingTransport = {
  transportId: 'none',
  detect: () => ({ available: false, reason: NO_TRANSPORT }),
  dock: () => ({ ok: false, error: 'BLOCKED_BY_RUNTIME', reason: NO_TRANSPORT }),
};

/**
 * Whether a docking result may be reported as a target affinity.
 *
 * Only a real receptor qualifies. This is deliberately a separate, explicit
 * function so the rule is testable on its own rather than buried in a branch.
 */
export function isTargetAffinityMeaningful(receptorKind: ReceptorKind): { meaningful: boolean; reason: string } {
  return receptorKind === 'REAL_RECEPTOR'
    ? { meaningful: true, reason: '' }
    : {
      meaningful: false,
      reason: 'Docked against a small-molecule stand-in, not a biological receptor. This score exercises the docking pipeline and is not a target affinity.',
    };
}
