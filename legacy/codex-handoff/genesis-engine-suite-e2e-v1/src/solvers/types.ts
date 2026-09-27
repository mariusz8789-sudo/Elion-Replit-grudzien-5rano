export interface SolverRun<I,O> {
  solverId: string;
  run(input: I): O;
}

export interface ODEState { t: number; y: number[]; }
