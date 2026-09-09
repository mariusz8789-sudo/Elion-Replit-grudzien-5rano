import { useEffect, useMemo, useRef, useState } from 'react';
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
  GENESIS_CELL_CULTURE_CATALOG,
  GENESIS_CELL_CULTURE_CATALOG_ID,
  GENESIS_CELL_CULTURE_LEVERS,
  LARGER_CAPACITY_CELLS,
  MITOGEN_G1_DURATION_H,
} from '../../core/agent/cellCultureLeverCatalog';
import { WorldDiscoveryPanel, type PanelState } from './WorldDiscoveryPanel';
import { ProvenanceBadge } from './provenance';
import { RealExperimentPipeline, type RealExperimentPredictionContext } from './RealExperimentPipeline';
import { DiscoveryLadder, ConclusionContent, EvidenceContent, ReplayContent, type LadderStep } from './DiscoveryLadder';
import { conclusionFor, nextExperimentFor } from './discoveryNarrative';
import type { WorldDiscoveryEvidenceSummary } from '../../core/agent/worldDiscoverySession';
import type { SavedWorldDiscoveryReplay } from '../../core/scienceMemory';

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
    // DEMO MODE fast-forward — a pacing control on how many real solver hours one real second
    // covers, not a second timeline: every hour still comes from `advanceArm`'s own RK4 steps.
    const speed = Number(params.speed ?? 1);
    const hours = Math.min(dt * HOURS_PER_REAL_SECOND * speed, MAX_HOURS - this.control.hoursElapsed);
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

/** The real search Demo Mode submits — same admission + `runWorldDiscoveryAndRemember` path a typed
 * goal would hit, matching this catalogue's own declared `metricPhrases` ("cell count") and the
 * MAXIMIZE keyword `worldGoalIntent.ts` parses ("increase"), so it genuinely admits and runs. */
const DEMO_GOAL = 'Increase cell count using a substance, at most 2 experiments.';
/** Real wall-clock budget for one guided walkthrough — the pacing item 17 of the product directive
 * asked for; the search itself typically resolves in well under a second (no network I/O). */
const DEMO_DURATION_MS = 55_000;
/** Fast-forward multiplier on `HOURS_PER_REAL_SECOND` while Demo Mode is active — the growth curve
 * still advances through the same real RK4 steps, just more of them per real second, so the culture
 * visibly grows within the walkthrough's time budget instead of needing to run for real minutes. */
const DEMO_SPEED = 4;

/** Builds this screen's six `LadderStep`s for the reusable `DiscoveryLadder` shell — the only
 * Cell-Lab-specific piece of the narrative; the shell itself computes nothing. */
function cellLabLadderSteps(args: {
  stats: Record<string, number>;
  diff: number;
  conclusion: ReturnType<typeof conclusionFor>;
  nextExperiment: string;
  evidence: WorldDiscoveryEvidenceSummary | null;
  replay: SavedWorldDiscoveryReplay | null;
}): LadderStep[] {
  const { stats, diff, conclusion, nextExperiment, evidence, replay } = args;
  return [
    {
      key: 'control',
      label: 'CONTROL',
      color: CONTROL_COLOR,
      content: <p>{sci(stats.controlTotal ?? 0)} cells · S-phase {((stats.controlSPhase ?? 0) * 100).toFixed(1)}%</p>,
    },
    {
      key: 'treatment',
      label: 'TREATMENT',
      color: TREATMENT_COLOR,
      content: <p>{sci(stats.treatmentTotal ?? 0)} cells · S-phase {((stats.treatmentSPhase ?? 0) * 100).toFixed(1)}%</p>,
    },
    {
      key: 'observation',
      label: 'OBSERVATION',
      content: (
        <p>
          At t={Math.round(stats.hoursElapsed ?? 0)}h, the treatment culture holds {sci(stats.treatmentTotal ?? 0)} cells
          versus {sci(stats.controlTotal ?? 0)} in control.
        </p>
      ),
    },
    {
      key: 'difference',
      label: 'DIFFERENCE',
      content: <p>{diff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs control</p>,
    },
    {
      key: 'conclusion',
      label: 'CONCLUSION',
      content: <ConclusionContent conclusion={conclusion} pendingText="Run a Discovery search (left panel) to reach a real conclusion for this substance." />,
    },
    {
      key: 'next-experiment',
      label: 'NEXT EXPERIMENT',
      content: <p>{nextExperiment}</p>,
    },
    {
      key: 'evidence',
      label: 'EVIDENCE',
      content: (
        <EvidenceContent
          evidence={evidence}
          provenance="SIMULATED"
          pendingText="Run a Discovery search (left panel) to produce a real Evidence Bundle for this culture."
        />
      ),
    },
    {
      key: 'replay',
      label: 'REPLAY',
      content: (
        <ReplayContent
          replay={replay}
          pendingText="Available once a search has run — Genesis re-executes its own result from the same recorded inputs and checks it still matches."
        />
      ),
    },
  ];
}

export function CellLabScreen() {
  const sim = useMemo(() => new CellCultureLabSim(), []);
  const [treatmentId, setTreatmentId] = useState<TreatmentId>('mitogen');
  const [dose, setDose] = useState(1);
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [discoveryResult, setDiscoveryResult] = useState<PanelState | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoKey, setDemoKey] = useState(0);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const params = useMemo<SimParams>(() => ({ treatment: treatmentId, dose, speed: demoMode ? DEMO_SPEED : 1 }), [treatmentId, dose, demoMode]);
  const canvasRef = useSimLoop(sim, params, running, setStats);

  useEffect(() => () => { if (demoTimerRef.current) clearTimeout(demoTimerRef.current); }, []);

  const startDemo = () => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    setTreatmentId('mitogen');
    setDose(1);
    sim.reset?.();
    setDiscoveryResult(null);
    setRunning(true);
    setDemoKey((k) => k + 1); // remounts WorldDiscoveryPanel so its mount-effect re-runs initialGoal
    setDemoMode(true);
    demoTimerRef.current = setTimeout(() => setDemoMode(false), DEMO_DURATION_MS);
  };
  const stopDemo = () => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    setDemoMode(false);
  };

  const diff = stats.differencePct ?? 0;
  const conclusion = conclusionFor(discoveryResult, `h:${treatmentId}`);
  const nextExperiment = nextExperimentFor(discoveryResult);
  const currentLever = GENESIS_CELL_CULTURE_LEVERS.find((l) => l.leverId === `lever:${treatmentId}`)!;
  const currentHypothesis = currentLever.hypothesis('totalCells', 'maximize');
  const evidence = discoveryResult?.kind === 'COMPLETE' ? discoveryResult.evidence : null;
  const replay = discoveryResult?.kind === 'COMPLETE' ? discoveryResult.replay : null;
  const evidenceBundleId = evidence?.bundleId ?? null;
  const realExperimentPrediction: RealExperimentPredictionContext | null =
    discoveryResult?.kind === 'COMPLETE' && discoveryResult.intent.objectiveMetric
      ? {
          predictionSourceExperimentId: discoveryResult.savedExperimentId,
          loopResult: discoveryResult.result,
          domainId: GENESIS_CELL_CULTURE_CATALOG.domainId,
          metric: discoveryResult.intent.objectiveMetric,
        }
      : null;
  const comparisonNote = `control ${sci(stats.controlTotal ?? 0)} cells vs treatment ${sci(stats.treatmentTotal ?? 0)} cells (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)`;
  const demoStatusText = discoveryResult?.kind === 'COMPLETE'
    ? 'Real search complete — see CONCLUSION below.'
    : discoveryResult?.kind === 'REFUSED' || discoveryResult?.kind === 'NOT_ADMITTED'
      ? 'Genesis declined this search — see the Discovery panel on the left for why.'
      : 'Running a real Discovery search on this world (left panel)…';

  return (
    <div className="gsc-stage">
      <canvas
        ref={canvasRef}
        className="gsc-canvas"
        aria-label="Virtual Cell Lab — Control vs Treatment, real G1/S/G2M compartmental solver"
      />

      {/* Same generic Discovery Loop UI as flood/epidemic/chemistry, pre-selected onto this domain —
          this is P1 (Question -> Hypotheses -> Experiment -> Observation -> Falsification -> Next).
          `key={demoKey}` forces a fresh mount when Demo Mode starts, so its mount-effect re-fires
          `initialGoal` through the exact same `run()` a typed submission would call. */}
      <WorldDiscoveryPanel
        key={demoKey}
        defaultCatalogId={GENESIS_CELL_CULTURE_CATALOG_ID}
        initialGoal={demoMode ? DEMO_GOAL : undefined}
        onResult={setDiscoveryResult}
      />

      <div className="gsc-panel cell-lab-panel" data-testid="cell-lab-panel">
        <div className="gsc-panel-row">
          <ProvenanceBadge provenance="SIMULATED" testId="cell-lab-provenance-badge" />
          <span className="gx-status approximation">MODEL_ESTIMATE</span>
          <button type="button" onClick={demoMode ? stopDemo : startDemo} data-testid="cell-lab-demo-toggle">
            {demoMode ? 'Stop Demo' : '▶ Demo Mode'}
          </button>
        </div>

        {demoMode && (
          <div className="cell-lab-demo-banner" data-testid="cell-lab-demo-banner" role="status">
            <b>DEMO MODE</b> — {demoStatusText}
          </div>
        )}

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
          <span>t = {Math.round(stats.hoursElapsed ?? 0)} h{demoMode ? ` (${DEMO_SPEED}x)` : ''}</span>
        </div>

        {/* P0/P1 — FLAGSHIP NARRATIVE: QUESTION -> HYPOTHESIS (below, in the Discovery panel) ->
            EXPERIMENT (CONTROL/TREATMENT) -> OBSERVATION -> DIFFERENCE -> CONCLUSION -> NEXT
            EXPERIMENT -> EVIDENCE -> REPLAY, every value read from the live solver or from the real
            Discovery Loop result (via `onResult`) — never a second, independently-computed verdict,
            and never a second Evidence Bundle or replay check (both already come from the SAME
            `runWorldDiscoveryAndRemember` call the Discovery panel itself made). `DiscoveryLadder`
            is the reusable shell; only the step content below is Cell-Lab-specific. */}
        <DiscoveryLadder testId="cell-lab-narrative" steps={cellLabLadderSteps({ stats, diff, conclusion, nextExperiment, evidence, replay })} />

        {/* P1 — REAL EXPERIMENT INTERFACE, UI only. Every stage past Prediction is honestly refused;
            see RealExperimentPipeline.tsx's own doc for why. */}
        <RealExperimentPipeline
          predictionMechanism={currentHypothesis.mechanism}
          predictionRationale={currentHypothesis.rationale}
          comparisonNote={comparisonNote}
          evidenceBundleId={evidenceBundleId}
          prediction={realExperimentPrediction}
        />

        <details className="cell-lab-honesty" data-testid="cell-lab-honesty">
          <summary>What this model does and doesn't claim</summary>
          <p className="gsc-caption">
            Real G1/S/G2M compartmental solver (domains/cellCycle.ts), integrated with RK4 — the same
            solver the Discovery Loop panel on the left runs against this culture. Phase durations are
            representative textbook values for a generic proliferating line, not a measurement of any
            named cell line. The dose here is applied from t=0 for a legible Control vs Treatment view;
            the Discovery Loop instead applies its lever 12h into a running culture — same declared
            magnitude, different application time, stated here rather than hidden. No chronological
            age structure, no stochasticity, no specific drug identity or pharmacokinetics. Demo Mode
            submits the real goal “{DEMO_GOAL}” through this same Discovery panel and fast-forwards the
            solver's own pacing ({DEMO_SPEED}×  simulated hours per real second) — it never substitutes
            a precomputed result.
          </p>
        </details>
      </div>
    </div>
  );
}
