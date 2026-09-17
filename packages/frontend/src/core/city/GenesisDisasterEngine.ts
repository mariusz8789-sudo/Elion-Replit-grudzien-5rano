import { createSeirState, seirStep, seirMetrics, createFloodState, floodStep, floodMetrics, blastSolve } from '../../../../core/src/city-enterprise/GenesisCrisisEngine.js';
import type { SeirState, SeirParams, FloodState, FloodParams, BlastParams, BlastResult } from '../../../../core/src/city-enterprise/GenesisCrisisEngine.js';
import type { CityGrid } from '../../../../core/src/city-enterprise/GenesisCityGenerator.js';
export type DisasterScenarioId = 'EPIDEMIC' | 'FLOOD' | 'BLAST';
export interface DisasterRunState { scenario: DisasterScenarioId; seir?: SeirState; flood?: FloodState; blast?: BlastResult; t: number; }
export interface DisasterSnapshot { scenario: DisasterScenarioId; t: number; metrics: Record<string, number>; dataLabel: 'DISASTER_SCENARIO' | 'SYNTHETIC_CRISIS_MODEL'; }
/** Real-time stepping wrapper over the core crisis models. Deterministic. */
export class GenesisDisasterEngine {
  private state: DisasterRunState;
  constructor(private grid: CityGrid, scenario: DisasterScenarioId, patientZeroCell = 100) {
    this.state = { scenario, t: 0, seir: scenario === 'EPIDEMIC' ? createSeirState(grid, patientZeroCell) : undefined, flood: scenario === 'FLOOD' ? createFloodState(grid) : undefined };
    if (scenario === 'BLAST') this.state.blast = blastSolve(grid, { x: Math.floor(grid.gridSize / 2), y: Math.floor(grid.gridSize / 2), yieldKg: 1000 });
  }
  step(dt: number, params: { seir?: SeirParams; flood?: FloodParams }): void {
    if (this.state.seir && params.seir) this.state.seir = seirStep(this.grid, this.state.seir, params.seir, dt);
    if (this.state.flood && params.flood) this.state.flood = floodStep(this.grid, this.state.flood, params.flood, dt);
    this.state.t += dt;
  }
  setBlast(p: BlastParams): void { this.state.blast = blastSolve(this.grid, p); }
  snapshot(): DisasterSnapshot {
    const m: Record<string, number> = {};
    if (this.state.seir) { const s = seirMetrics(this.state.seir); m.susceptible = s.susceptible; m.exposed = s.exposed; m.infected = s.infected; m.recovered = s.recovered; }
    if (this.state.flood) { const f = floodMetrics(this.grid, this.state.flood); m.inundatedCells = f.inundatedCells; m.maxDepthM = f.maxDepthM; m.floodedBuildings = f.floodedBuildings; m.paralysisRatio = f.paralysisRatio; }
    if (this.state.blast) { m.lethalM = this.state.blast.zones.lethalM; m.severeM = this.state.blast.zones.severeM; m.glassM = this.state.blast.zones.glassM; }
    return { scenario: this.state.scenario, t: this.state.t, metrics: m, dataLabel: this.state.scenario === 'BLAST' ? 'DISASTER_SCENARIO' : 'SYNTHETIC_CRISIS_MODEL' };
  }
  getState(): DisasterRunState { return this.state; }
}
