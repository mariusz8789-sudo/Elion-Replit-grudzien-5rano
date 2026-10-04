import { runScenario, type ScenarioDaySample, type ScenarioRun } from '../simulation/scenarioEngine';
import { DISCOVERY_METRIC_KEYS } from './discoveryExecution';
import type {
  DiscoveryArm,
  DiscoveryCase,
  DemoReplay,
  DemoReplayDifference,
  DemoReplayStatus,
} from './discoveryCase';

/**
 * DEMO_REPLAY — powtarzalność DEMO przez PONOWNE PRZELICZENIE modelu w przeglądarce.
 *
 * DEMO_REPLAY nie odczytuje zapisanej odpowiedzi. Uruchamia przeglądarkowy Scenario
 * Engine jeszcze raz z wejść zapisanych w migawce i porównuje odciski oraz metryki.
 * Rozjazd musi pokazać, CO się różni — inaczej „DRIFT" byłby tylko etykietą.
 *
 * NOT GENESIS EVIDENCE, NOT GENESIS REPLAY. This module belongs to the browser-local
 * epidemic-city DEMO found by the 2026-10-04 architecture audit. Canonical Genesis
 * Evidence is the backend ResearchRun loop's single ledger; canonical Replay is
 * `packages/backend/src/campaign/verify.mjs`. The owner's 2026-10-04 resolution was to
 * rename this cluster rather than delete it, so the stored state is a
 * LOCAL_SIMULATION_SNAPSHOT and the re-run is a DEMO_REPLAY (D-172).
 *
 * DO NOT BUILD THE RESEARCHRUN MIGRATION NOW. The full redirect of this surface into
 * the canonical loop happens ONLY once the epidemic scenario is a real ResearchRun.
 */

const COMPARTMENTS = ['susceptible', 'exposed', 'infectious', 'recovered', 'deceased'] as const;

/**
 * Warstwa szpitalna wchodzi do `resultFingerprint` przebiegu (scenarioEngine),
 * więc DEMO_REPLAY musi ją porównywać tak samo. Bez tego rozjazd wyłącznie
 * szpitalny dawał WITHIN_TOLERANCE z komunikatem „każda metryka mieści się w
 * tolerancji", mimo że przebieg realnie się różnił — odcisk był jedyną
 * różnicą, a ta jest z werdyktu wyłączona. Lista pokrywa dokładnie pola
 * szpitalne, które odcisk obejmuje.
 */
const HOSPITAL_FIELDS = ['occupiedBeds', 'occupiedIcu', 'unmetCare', 'bedOccupancy', 'icuOccupancy', 'status'] as const;

interface DaySampleDifference {
  day: number;
  field: string;
  expected: number | string;
  actual: number | string;
}

/**
 * Pierwsza różnica w przebiegu dnia — z nazwą pola i OBIEMA wartościami.
 * Sam numer dnia nie mówi, co się rozjechało.
 */
function firstDaySampleDifference(
  expected: readonly ScenarioDaySample[],
  actual: readonly ScenarioDaySample[],
): DaySampleDifference | null {
  const n = Math.min(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    for (const key of COMPARTMENTS) {
      if (expected[i][key] !== actual[i][key]) {
        return { day: expected[i].day, field: key, expected: expected[i][key], actual: actual[i][key] };
      }
    }
    for (const key of HOSPITAL_FIELDS) {
      if (expected[i].hospital[key] !== actual[i].hospital[key]) {
        return {
          day: expected[i].day,
          field: `hospital.${key}`,
          expected: expected[i].hospital[key],
          actual: actual[i].hospital[key],
        };
      }
    }
  }
  return null;
}

/** Różnica z równymi wartościami (np. numer dnia) to fakt, nie rozjazd „a → a". */
function describeDifference(d: DemoReplayDifference): string {
  if (d.expected === d.actual) return `${d.field} = ${String(d.expected)}`;
  return `${d.field} (${String(d.expected)} → ${String(d.actual)})`;
}

function armDifferences(expected: ScenarioRun, actual: ScenarioRun, tolerance: number): DemoReplayDifference[] {
  const differences: DemoReplayDifference[] = [];
  if (expected.resultFingerprint !== actual.resultFingerprint) {
    differences.push({ field: 'resultFingerprint', expected: expected.resultFingerprint, actual: actual.resultFingerprint });
  }
  if (expected.series.length !== actual.series.length) {
    differences.push({ field: 'series.length', expected: expected.series.length, actual: actual.series.length });
  }
  const first = firstDaySampleDifference(expected.series, actual.series);
  if (first !== null) {
    differences.push({ field: 'firstDifferingDay', expected: first.day, actual: first.day });
    differences.push({ field: `series.day${first.day}.${first.field}`, expected: first.expected, actual: first.actual });
  }

  const a = expected.summary;
  const b = actual.summary;
  if (a === null || b === null) {
    differences.push({ field: 'summary', expected: a === null ? null : 'present', actual: b === null ? null : 'present' });
    return differences;
  }
  for (const key of DISCOVERY_METRIC_KEYS) {
    if (Math.abs(a[key] - b[key]) > tolerance) differences.push({ field: `summary.${key}`, expected: a[key], actual: b[key] });
  }
  return differences;
}

function rerunArm(arm: DiscoveryArm, record: DiscoveryCase): ScenarioRun {
  return runScenario(arm.scenario, {
    days: record.initialConditions.days,
    stepsPerDay: record.initialConditions.stepsPerDay,
    baseParams: arm.run.preInterventionParams,
    overrideParams: arm.run.params,
    baseHospital: arm.run.preInterventionHospital,
    // Bez profilu kohortowego odtworzenie biegłoby na populacji jednorodnej i
    // każdy przebieg z heterogenicznością wychodziłby jako DRIFT.
    baseCohort: arm.run.cohort,
    interventionStartDay: arm.run.interventionStartDay,
  });
}

/**
 * Odtwarza wszystkie ramiona sprawy i wydaje werdykt.
 *
 *  MATCH             — odciski identyczne we wszystkich ramionach.
 *  WITHIN_TOLERANCE  — odcisk się różni, ale każda metryka mieści się w
 *                      zadeklarowanej tolerancji. Model jest deterministyczny,
 *                      więc domyślna tolerancja to 0 i ten stan wymaga jawnej
 *                      decyzji autora sprawy.
 *  DRIFT             — metryki wyszły poza tolerancję; lista różnic w wyniku.
 *  BLOCKED           — sprawy nie da się wykonać (scenariusz NOT_MODELED).
 *  NOT_REPRODUCIBLE  — sprawa nie niesie kompletnego zapisu przebiegu.
 */
export function runDemoReplay(record: DiscoveryCase): DemoReplay {
  return runDemoReplayWithTolerance(record, Math.max(0, record.demoReplayTolerance));
}

export function runDemoReplayWithTolerance(record: DiscoveryCase, tolerance: number): DemoReplay {
  if (record.status === 'NOT_MODELED' || record.notModeledReason) {
    return {
      status: 'BLOCKED',
      tolerance,
      arms: [],
      message: 'Sprawa nie jest wykonywalna na tym modelu — nie ma czego odtwarzać.',
    };
  }
  if (record.arms.length === 0 || record.arms.some((a) => a.run.resultFingerprint === null || a.run.series.length === 0)) {
    return {
      status: 'NOT_REPRODUCIBLE',
      tolerance,
      arms: record.arms.map((a) => ({
        armId: a.armId,
        expectedRunFingerprint: a.run.resultFingerprint,
        actualRunFingerprint: null,
        differences: [],
      })),
      message: 'Sprawa nie zawiera kompletnego zapisu przebiegu, więc nie da się jej odtworzyć.',
    };
  }

  const arms = record.arms.map((arm) => {
    const actual = rerunArm(arm, record);
    return {
      armId: arm.armId,
      expectedRunFingerprint: arm.run.resultFingerprint,
      actualRunFingerprint: actual.resultFingerprint,
      differences: armDifferences(arm.run, actual, tolerance) as readonly DemoReplayDifference[],
    };
  });

  const fingerprintsMatch = arms.every((a) => a.expectedRunFingerprint === a.actualRunFingerprint);
  // Różnice poza samym odciskiem: to one decydują o DRIFT.
  const substantive = arms.flatMap((a) => a.differences).filter((d) => d.field !== 'resultFingerprint');

  let status: DemoReplayStatus;
  let message: string;
  if (fingerprintsMatch && substantive.length === 0) {
    status = 'MATCH';
    message = 'Wszystkie ramiona odtworzone bit w bit z zapisanych wejść.';
  } else if (substantive.length === 0) {
    status = 'WITHIN_TOLERANCE';
    message = `Odcisk przebiegu się różni, ale każda metryka mieści się w tolerancji ${tolerance}.`;
  } else {
    status = 'DRIFT';
    message = `Odtworzenie dało inny przebieg. Różnice: ${substantive.map(describeDifference).join('; ')}.`;
  }
  return { status, tolerance, arms, message };
}
