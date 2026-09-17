/* Proprietary / All Rights Reserved - Genesis OS */
export interface Clock { now(): number; }
export type EpistemicTag = 'SPECULATIVE_SANDBOX_SOLVER' | 'UNPHYSICAL_THEORY' | 'VERIFIED_PHYSICS';
export type WarningFlag = 'NEGATIVE_ENERGY_REQUIRED' | 'RETROCAUSAL_FIXED_POINT' | 'UNCONVERGED_FIXED_POINT' | 'TORSION_BOUNDARY_SPECULATIVE' | 'NON_METRIC_SHORTCUT';
export interface EcsWorld {
  createEntity(): number;
  setComponent<T>(entity: number, name: string, data: T): void;
  getComponent<T>(entity: number, name: string): T | undefined;
}
export interface SandboxContext {
  readonly allowUnphysicalSandbox: boolean;
  readonly dt: number;
  readonly seed: number;
  readonly clock: Clock;
  readonly ecs?: EcsWorld;
}
export interface SpeculativeSolverState {
  readonly solverId: string;
  readonly tag: EpistemicTag;
  readonly step: number;
  readonly fields: Readonly<Record<string, Float64Array>>;
  readonly scalars: Readonly<Record<string, number>>;
  readonly warnings: readonly WarningFlag[];
  readonly provenanceHash: string;
}
export interface SpeculativeSolverPlugin<P> {
  readonly id: string;
  readonly tag: EpistemicTag;
  createInitialState(ctx: SandboxContext, params: P): SpeculativeSolverState;
  step(state: SpeculativeSolverState, ctx: SandboxContext, params: P): SpeculativeSolverState;
  warnings(state: SpeculativeSolverState): readonly WarningFlag[];
  fingerprint(state: SpeculativeSolverState): string;
}
export interface SandboxRunResult<S> {
  readonly ok: boolean;
  readonly error?: 'SANDBOX_DISABLED' | 'UNKNOWN_SOLVER';
  readonly state?: S;
  readonly warnings?: readonly WarningFlag[];
  readonly fingerprint?: string;
}
export interface SpeculativeLedgerEntry {
  readonly index: number; readonly solverId: string; readonly fingerprint: string;
  readonly warnings: readonly WarningFlag[]; readonly at: number; readonly prevHash: string; readonly hash: string;
}
