import { useMemo, useState } from 'react';
import { sci, useSimLoop } from '../../core/useSimLoop';
import type { Sim, SimParams } from '../../core/types';
import {
  CELL_CYCLE_DEFAULTS,
  CULTURE_STATE_CODE,
  cultureStateCode,
  cultureStateLabel,
  rk4CellCycleStep,
  type CellCycleParams,
  type CultureState,
} from '../../core/worldModel/domains/cellCycle';
import {
  BLOCKED_S_DURATION_H,
  CYTOTOXIC_DEATH_RATE_PER_HOUR,
  GENESIS_CELL_CULTURE_CATALOG_ID,
  LARGER_CAPACITY_CELLS,
  MITOGEN_G1_DURATION_H,
} from '../../core/agent/cellCultureLeverCatalog';
import { WorldDiscoveryPanel } from './WorldDiscoveryPanel';

/**
 * VIRTUAL CELL LAB — Control vs Treatment (P0, GENESIS C2 next-sprint directive).
 *
 * Uses `domains/cellCycle.ts` EXACTLY as it already exists — the real G1/S/G2M
 * compartmental model, integrated with RK4, that already backs the Discovery
 * Loop's `genesis-cell-culture` catalogue (`cellCultureLeverCatalog.ts`). No new
 * engine: this screen runs the SAME `rk4CellCycleStep` twice (a control culture
 * seeded from `CELL_CYCLE_DEFAULTS`, and a treatment culture with one real lever
 * magnitude applied), reads the phase counts it returns, and draws them. Rule 6
 * of that solver ("ONE entity for the whole culture... must never be rendered
 * as a million placed objects") is why this is an aggregate growth curve plus
 * compartment/occupancy readouts, never per-cell sprites.
 *
 * One disclosed simplification vs. the Discovery Loop catalogue: here the dose
 * is applied from t=0 (so a slider drag is immediately legible), where the
 * catalogue applies its lever at 12 h into a running culture. Same model,
 * same declared magnitudes (imported straight from `cellCultureLeverCatalog.ts`
 * so they cannot drift), different application time — stated in the honesty
 * panel below, not hidden.
 *
 * The embedded `WorldDiscoveryPanel` (pre-selected onto this exact catalogue via
 * its `defaultCatalogId` prop) is P1: the real Question -> Hypotheses ->
 * Experiment -> Observation -> Falsification -> Next Experiment loop already
 * exists and is already wired to this domain — nothing new was built for it.
 */

export type TreatmentId = 'mitogen' | 's-phase-inhibitor' | 'cytotoxic' | 'vessel-capacity';

interface TreatmentDef {
  label: string;
  paramKey: keyof CellCycleParams;
  baseValue: number;
  fullValue: number;
}

/** Real lever magnitudes, imported verbatim from the Discovery Loop's own catalogue — no second copy. */
export const TREATMENTS: Record<TreatmentId, TreatmentDef> = {
  mitogen: { label: 'Mitogen / growth factor (shortens G1)', paramKey: 'g1DurationH', baseValue: CELL_CYCLE_DEFAULTS.g1DurationH, fullValue: MITOGEN_G1_DURATION_H },
  's-phase-inhibitor': { label: 'S-phase inhibitor (blocks DNA synthesis)', paramKey: 'sDurationH', baseValue: CELL_CYCLE_DEFAULTS.sDurationH, fullValue: BLOCKED_S_DURATION_H },
  cytotoxic: { label: 'Cytotoxic agent (first-order death)', paramKey: 'deathRatePerHour', baseValue: CELL_CYCLE_DEFAULTS.deathRatePerHour, fullValue: CYTOTOXIC_DEATH_RATE_PER_HOUR },
  'vessel-capacity': { label: 'Larger vessel (raises contact-inhibition capacity)', paramKey: 'carryingCapacityCells', baseValue: CELL_CYCLE_DEFAULTS.carryingCapacityCells, fullValue: LARGER_CAPACITY_CELLS },
};

interface Phases { g1: number; s: number; g2m: number }

interface CultureArm {
  phases: Phases;
  params: CellCycleParams;
  history: { h: number; total: number }[];
  hoursElapsed: number;
  netGrowthPerHour: number;
  /** Sum of the model's own first-order death term (deathRatePerHour * total) over elapsed time — a
   * real quantity implied by the ODE the solver already integrates, not a separately invented one. */
  cumulativeDeaths: number;
}

export interface ArmStats {
  totalCells: number;
  g1Fraction: number;
  sFraction: number;
  g2mFraction: number;
  sPhaseFraction: number;
  occupancyFraction: number;
  stateCode: number;
  stateLabel: CultureState;
  hoursElapsed: number;
  cumulativeDeaths: number;
}

/** Pure — same derived-stat formulas `makeCellCycleSolver()` itself computes. */
export function deriveArmStats(arm: CultureArm): ArmStats {
  const { g1, s, g2m } = arm.phases;
  const totalCells = g1 + s + g2m;
  const occupancyFraction = arm.params.carryingCapacityCells > 0 ? totalCells / arm.params.carryingCapacityCells : 0;
  const stateCode = cultureStateCode(occupancyFraction, arm.netGrowthPerHour);
  return {
    totalCells,
    g1Fraction: totalCells > 0 ? g1 / totalCells : 0,
    sFraction: totalCells > 0 ? s / totalCells : 0,
    g2mFraction: totalCells > 0 ? g2m / totalCells : 0,
    sPhaseFraction: totalCells > 0 ? s / totalCells : 0,
    occupancyFraction,
    stateCode,
    stateLabel: cultureStateLabel(stateCode),
    hoursElapsed: arm.hoursElapsed,
    cumulativeDeaths: arm.cumulativeDeaths,
  };
}

export function stateBarColor(code: number): string {
  switch (code) {
    case CULTURE_STATE_CODE.DECLINING: return '#f47c7c';
    case CULTURE_STATE_CODE.ARRESTED: return '#e8b34a';
    case CULTURE_STATE_CODE.CONFLUENT: return '#f0b35c';
    default: return '#6ee7a0';
  }
}

/** 6 simulated hours per real second — reaches the 180h Discovery Loop horizon in 30s at 1x. */
const HOURS_PER_REAL_SECOND = 6;
/** RK4 substep cap for accuracy; also the cellCultureLeverCatalog.ts's own dt (`CELL_DT_HOURS`). */
const SUBSTEP_MAX_H = 0.5;
/** Sample the growth curve every 3h — enough resolution over a 240h run without unbounded memory. */
const SAMPLE_INTERVAL_H = 3;
/** Beyond the Discovery Loop's 180h horizon, into the arrest the catalogue's own doc describes at
 * tick 50 (300h) — 240h is far enough to show the story turning over without an unbounded run. */
const MAX_HOURS = 240;

const CONTROL_COLOR = '#5ad1e6';
const TREATMENT_COLOR = '#f0b35c';

export class CellCultureLabSim implements Sim {
  private treatmentId: TreatmentId = 'mitogen';
  private dose = 1;
  private control: CultureArm = this.freshArm(CELL_CYCLE_DEFAULTS);
  private treatment: CultureArm = this.freshArm(CELL_CYCLE_DEFAULTS);

  init(_w: number, _h: number) {
    this.relaunch(this.treatmentId, this.dose);
  }

  private freshArm(params: CellCycleParams): CultureArm {
    const total = params.g1Cells + params.sCells + params.g2mCells;
    return {
      phases: { g1: params.g1Cells, s: params.sCells, g2m: params.g2mCells },
      params,
      history: [{ h: 0, total }],
      hoursElapsed: 0,
      netGrowthPerHour: 0,
      cumulativeDeaths: 0,
    };
  }

  private relaunch(treatmentId: TreatmentId, dose: number) {
    this.treatmentId = treatmentId;
    this.dose = dose;
    this.control = this.freshArm(CELL_CYCLE_DEFAULTS);
    const t = TREATMENTS[treatmentId];
    const dosedValue = t.baseValue + (t.fullValue - t.baseValue) * dose;
    this.treatment = this.freshArm({ ...CELL_CYCLE_DEFAULTS, [t.paramKey]: dosedValue });
  }

  private advanceArm(arm: CultureArm, hours: number) {
    let remaining = hours;
    while (remaining > 1e-9) {
      const step = Math.min(SUBSTEP_MAX_H, remaining);
      const totalBefore = arm.phases.g1 + arm.phases.s + arm.phases.g2m;
      const next = rk4CellCycleStep(arm.phases, arm.params, step);
      const totalAfter = next.g1 + next.s + next.g2m;
      arm.cumulativeDeaths += arm.params.deathRatePerHour * totalBefore * step;
      arm.netGrowthPerHour = step > 0 ? (totalAfter - totalBefore) / step : 0;
      arm.phases = next;
      arm.hoursElapsed += step;
      remaining -= step;
      const last = arm.history[arm.history.length - 1];
      if (!last || arm.hoursElapsed - last.h >= SAMPLE_INTERVAL_H || remaining <= 1e-9) {
        arm.history.push({ h: arm.hoursElapsed, total: totalAfter });
      }
    }
  }

  update(dt: number, params: SimParams) {
    const treatmentId = String(params.treatment ?? 'mitogen') as TreatmentId;
    const dose = Number(params.dose ?? 1);
    if (treatmentId !== this.treatmentId || dose !== this.dose || !TREATMENTS[treatmentId]) {
      this.relaunch(TREATMENTS[treatmentId] ? treatmentId : 'mitogen', dose);
    }
    if (this.control.hoursElapsed >= MAX_HOURS) return;
    const hours = Math.min(dt * HOURS_PER_REAL_SECOND, MAX_HOURS - this.control.hoursElapsed);
    this.advanceArm(this.control, hours);
    this.advanceArm(this.treatment, hours);
  }

  reset() {
    this.relaunch(this.treatmentId, this.dose);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b0f16';
    ctx.fillRect(0, 0, w, h);

    const chartH = Math.round(h * 0.55);
    this.renderGrowthChart(ctx, w, chartH);
    const armW = w / 2;
    this.renderArmPanel(ctx, 0, chartH, armW, h - chartH, this.control, CONTROL_COLOR, 'CONTROL');
    this.renderArmPanel(ctx, armW, chartH, armW, h - chartH, this.treatment, TREATMENT_COLOR, 'TREATMENT');

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.moveTo(armW, chartH); ctx.lineTo(armW, h); ctx.stroke();
  }

  private renderGrowthChart(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const padL = 56, padR = 16, padT = 20, padB = 26;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);

    const allTotals = [...this.control.history, ...this.treatment.history].map((p) => p.total);
    const maxTotal = Math.max(10, ...allTotals);
    const minTotal = 500; // just under the seeded 1000 cells; log axis needs a positive floor
    const logMin = Math.log10(minTotal);
    const logMax = Math.log10(Math.max(minTotal * 10, maxTotal * 1.15));
    const maxH = Math.max(this.control.hoursElapsed, this.treatment.hoursElapsed, 1);

    const xOf = (hh: number) => padL + (hh / maxH) * plotW;
    const yOf = (total: number) => padT + plotH - ((Math.log10(Math.max(total, minTotal)) - logMin) / (logMax - logMin)) * plotH;

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '11px sans-serif';
    ctx.fillText(sci(maxTotal), 4, padT + 8);
    ctx.fillText(`${Math.round(maxH)}h`, padL + plotW - 24, padT + plotH + 18);

    const drawLine = (arm: CultureArm, color: string) => {
      if (arm.history.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      arm.history.forEach((p, i) => {
        const x = xOf(p.h), y = yOf(p.total);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    drawLine(this.control, CONTROL_COLOR);
    drawLine(this.treatment, TREATMENT_COLOR);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = CONTROL_COLOR; ctx.fillText('CONTROL', padL + 4, padT + 12);
    ctx.fillStyle = TREATMENT_COLOR; ctx.fillText('TREATMENT', padL + 90, padT + 12);
  }

  private renderArmPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, _h: number, arm: CultureArm, color: string, label: string) {
    const stats = deriveArmStats(arm);
    const pad = 14;
    let cy = y + pad + 4;

    ctx.fillStyle = color;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(label, x + pad, cy);
    cy += 20;

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${sci(stats.totalCells)} cells`, x + pad, cy);
    cy += 18;

    // G1/S/G2M stacked bar — the compartment structure a logistic model cannot produce.
    const barW = w - pad * 2, barH = 14;
    let bx = x + pad;
    const segs: [number, string][] = [[stats.g1Fraction, '#6aa9ff'], [stats.sFraction, '#f0b35c'], [stats.g2mFraction, '#e86ad1']];
    for (const [frac, segColor] of segs) {
      const segW = barW * frac;
      ctx.fillStyle = segColor;
      ctx.fillRect(bx, cy, Math.max(0, segW), barH);
      bx += segW;
    }
    cy += barH + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px sans-serif';
    ctx.fillText(`G1 ${(stats.g1Fraction * 100).toFixed(0)}% · S ${(stats.sFraction * 100).toFixed(0)}% · G2M ${(stats.g2mFraction * 100).toFixed(0)}%`, x + pad, cy);
    cy += 20;

    // Occupancy gauge, colored by the real discrete culture state.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + pad, cy, barW, barH);
    ctx.fillStyle = stateBarColor(stats.stateCode);
    ctx.fillRect(x + pad, cy, Math.max(0, Math.min(1, stats.occupancyFraction)) * barW, barH);
    cy += barH + 14;

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '11px sans-serif';
    ctx.fillText(stats.stateLabel, x + pad, cy);
    cy += 16;
    ctx.fillText(`deaths (cum.): ${sci(stats.cumulativeDeaths)}`, x + pad, cy);
  }

  getStats(): Record<string, number> {
    const c = deriveArmStats(this.control);
    const t = deriveArmStats(this.treatment);
    return {
      controlTotal: c.totalCells,
      treatmentTotal: t.totalCells,
      controlSPhase: c.sPhaseFraction,
      treatmentSPhase: t.sPhaseFraction,
      controlDeaths: c.cumulativeDeaths,
      treatmentDeaths: t.cumulativeDeaths,
      controlOccupancy: c.occupancyFraction,
      treatmentOccupancy: t.occupancyFraction,
      hoursElapsed: this.control.hoursElapsed,
      differencePct: c.totalCells > 0 ? ((t.totalCells - c.totalCells) / c.totalCells) * 100 : 0,
    };
  }
}

export function CellLabScreen() {
  const sim = useMemo(() => new CellCultureLabSim(), []);
  const [treatmentId, setTreatmentId] = useState<TreatmentId>('mitogen');
  const [dose, setDose] = useState(1);
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const params = useMemo<SimParams>(() => ({ treatment: treatmentId, dose }), [treatmentId, dose]);
  const canvasRef = useSimLoop(sim, params, running, setStats);

  const diff = stats.differencePct ?? 0;

  return (
    <div className="gsc-stage">
      <canvas
        ref={canvasRef}
        className="gsc-canvas"
        aria-label="Virtual Cell Lab — Control vs Treatment, real G1/S/G2M compartmental solver"
      />

      {/* Same generic Discovery Loop UI as flood/epidemic/chemistry, pre-selected onto this domain —
          this is P1 (Question -> Hypotheses -> Experiment -> Observation -> Falsification -> Next). */}
      <WorldDiscoveryPanel defaultCatalogId={GENESIS_CELL_CULTURE_CATALOG_ID} />

      <div className="gsc-panel cell-lab-panel" data-testid="cell-lab-panel">
        <div className="gsc-panel-row">
          <span className="gx-matrix-badge" data-testid="cell-lab-provenance-badge">SIMULATION</span>
          <span className="gx-status approximation">MODEL_ESTIMATE</span>
        </div>

        <div className="gsc-panel-row">
          <label htmlFor="cell-lab-treatment">Substance</label>
          <select
            id="cell-lab-treatment"
            value={treatmentId}
            onChange={(e) => setTreatmentId(e.target.value as TreatmentId)}
          >
            {(Object.keys(TREATMENTS) as TreatmentId[]).map((id) => (
              <option key={id} value={id}>{TREATMENTS[id].label}</option>
            ))}
          </select>
        </div>

        <div className="gsc-panel-row">
          <label htmlFor="cell-lab-dose">Dose: {(dose * 100).toFixed(0)}%</label>
          <input
            id="cell-lab-dose"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={dose}
            onChange={(e) => setDose(Number(e.target.value))}
          />
        </div>

        <div className="gsc-panel-row">
          <button type="button" onClick={() => setRunning((r) => !r)}>{running ? 'Pause' : 'Run'}</button>
          <button type="button" onClick={() => { sim.reset?.(); setStats(sim.getStats?.() ?? {}); }}>Reset</button>
          <span>t = {Math.round(stats.hoursElapsed ?? 0)} h</span>
        </div>

        <div className="cell-lab-readout" data-testid="cell-lab-readout">
          <div className="cell-lab-arm" data-testid="cell-lab-control">
            <span className="cell-lab-arm-title" style={{ color: CONTROL_COLOR }}>CONTROL</span>
            <span>{sci(stats.controlTotal ?? 0)} cells</span>
            <span className="gsc-caption">S-phase {((stats.controlSPhase ?? 0) * 100).toFixed(1)}%</span>
          </div>
          <div className="cell-lab-arm" data-testid="cell-lab-treatment-arm">
            <span className="cell-lab-arm-title" style={{ color: TREATMENT_COLOR }}>TREATMENT</span>
            <span>{sci(stats.treatmentTotal ?? 0)} cells</span>
            <span className="gsc-caption">S-phase {((stats.treatmentSPhase ?? 0) * 100).toFixed(1)}%</span>
          </div>
        </div>
        <p className="gsc-caption" data-testid="cell-lab-difference">
          Difference vs control: {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
        </p>

        <details className="cell-lab-honesty" data-testid="cell-lab-honesty">
          <summary>What this model does and doesn't claim</summary>
          <p className="gsc-caption">
            Real G1/S/G2M compartmental solver (domains/cellCycle.ts), integrated with RK4 — the same
            solver the Discovery Loop panel on the left runs against this culture. Phase durations are
            representative textbook values for a generic proliferating line, not a measurement of any
            named cell line. The dose here is applied from t=0 for a legible Control vs Treatment view;
            the Discovery Loop instead applies its lever 12h into a running culture — same declared
            magnitude, different application time, stated here rather than hidden. No chronological
            age structure, no stochasticity, no specific drug identity or pharmacokinetics.
          </p>
        </details>
      </div>
    </div>
  );
}
