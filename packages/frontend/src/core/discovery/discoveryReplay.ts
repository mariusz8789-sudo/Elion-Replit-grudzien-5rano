import { runScenario, type ScenarioDaySample, type ScenarioRun } from '../simulation/scenarioEngine';
import { DISCOVERY_METRIC_KEYS } from './discoveryExecution';
import type {
  DiscoveryArm,
  DiscoveryCase,
  DiscoveryReplay,
  DiscoveryReplayDifference,
  DiscoveryReplayStatus,
} from './discoveryCase';

/**
 * DISCOVERY REPLAY — dowód odtwarzalności przez PONOWNE PRZELICZENIE modelu.
 *
 * Replay nie odczytuje zapisanej odpowiedzi. Uruchamia Scenario Engine jeszcze
 * raz z wejść zapisanych w sprawie i porównuje odciski oraz metryki. Rozjazd
 * musi pokazać, CO się różni — inaczej „DRIFT" byłby tylko etykietą.
 */

const COMPARTMENTS = ['susceptible', 'exposed', 'infectious', 'recovered', 'deceased'] as const;

function firstDifferingDay(expected: readonly ScenarioDaySample[], actual: readonly ScenarioDaySample[]): number | null {
  const n = Math.min(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    for (const key of COMPARTMENTS) {
      if (expected[i][key] !== actual[i][key]) return expected[i].day;
    }
  }
  return null;
}

function armDifferences(expected: ScenarioRun, actual: ScenarioRun, tolerance: number): DiscoveryReplayDifference[] {
  const differences: DiscoveryReplayDifference[] = [];
  if (expected.resultFingerprint !== actual.resultFingerprint) {
    differences.push({ field: 'resultFingerprint', expected: expected.resultFingerprint, actual: actual.resultFingerprint });
  }
  if (expected.series.length !== actual.series.length) {
    differences.push({ field: 'series.length', expected: expected.series.length, actual: actual.series.length });
  }
  const day = firstDifferingDay(expected.series, actual.series);
  if (day !== null) differences.push({ field: 'firstDifferingDay', expected: day, actual: day });

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
export function replayDiscoveryCase(record: DiscoveryCase): DiscoveryReplay {
  return replayDiscoveryCaseWithTolerance(record, Math.max(0, record.replayTolerance));
}

export function replayDiscoveryCaseWithTolerance(record: DiscoveryCase, tolerance: number): DiscoveryReplay {
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
      differences: armDifferences(arm.run, actual, tolerance) as readonly DiscoveryReplayDifference[],
    };
  });

  const fingerprintsMatch = arms.every((a) => a.expectedRunFingerprint === a.actualRunFingerprint);
  // Różnice poza samym odciskiem: to one decydują o DRIFT.
  const substantive = arms.flatMap((a) => a.differences).filter((d) => d.field !== 'resultFingerprint');

  let status: DiscoveryReplayStatus;
  let message: string;
  if (fingerprintsMatch && substantive.length === 0) {
    status = 'MATCH';
    message = 'Wszystkie ramiona odtworzone bit w bit z zapisanych wejść.';
  } else if (substantive.length === 0) {
    status = 'WITHIN_TOLERANCE';
    message = `Odcisk przebiegu się różni, ale każda metryka mieści się w tolerancji ${tolerance}.`;
  } else {
    status = 'DRIFT';
    message = `Odtworzenie dało inny przebieg. Różnice: ${substantive.map((d) => `${d.field} (${String(d.expected)} → ${String(d.actual)})`).join('; ')}.`;
  }
  return { status, tolerance, arms, message };
}
