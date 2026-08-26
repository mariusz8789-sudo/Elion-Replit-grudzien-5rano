/**
 * MATRIX FOUNDATION — DETERMINISTIC HEADLESS STEPPER.
 *
 * `core/simulationClock/clock.ts`'s `SimulationClock` is deliberately
 * wall-clock-driven (`requestAnimationFrame` elapsed real seconds ->
 * a variable number of fixed steps, clamped by `maxDaysPerFrame`) for the
 * interactive UI, and its own doc comment plus
 * `core/world/worldEngineInterface.ts`'s `REPLAY_REQUIREMENTS` ("bez
 * zegara ściennego") are explicit that nothing meant to replay identically
 * may depend on it. `core/simulation/scenarioEngine.ts`'s `runScenario()`
 * already proves the correct alternative works — a plain nested loop of
 * `days * stepsPerDay` calls to `sim.tick(dt)` — but that loop is written
 * inline, specific to one epidemic run, and not reusable.
 *
 * This extracts exactly that pattern — headless, no wall clock, no
 * randomness of its own — as a small, independently tested primitive so a
 * future domain does not re-derive or subtly vary it. It does not replace
 * or call into `runScenario()` or `SimulationClock`.
 */
export interface HeadlessRunPlan {
  readonly steps: number;
  readonly dt: number;
}

/**
 * Runs `plan.steps` fixed-size steps of `plan.dt`, strictly in order,
 * calling `stepFn` synchronously each time with the step's time delta and
 * zero-based index. Purely mechanical: no timing, no I/O, no randomness.
 */
export function runHeadlessSteps(plan: HeadlessRunPlan, stepFn: (dt: number, stepIndex: number) => void): void {
  for (let i = 0; i < plan.steps; i++) {
    stepFn(plan.dt, i);
  }
}
