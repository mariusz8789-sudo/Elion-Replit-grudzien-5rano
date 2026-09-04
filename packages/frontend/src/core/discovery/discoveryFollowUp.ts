import { SCENARIOS } from '../simulation/scenarioEngine';
import { leverOf } from './discoveryExecution';
import type { DiscoveryCase, DiscoveryCaseSpec, DiscoveryFollowUp } from './discoveryCase';

/**
 * FOLLOW-UP ENGINE — kolejny eksperyment jako WSAD, nie jako zdanie.
 *
 * Każda propozycja niesie kompletny, wykonywalny plan: porównanie scenariuszy,
 * sweep parametru, sweep momentu interwencji albo przebieg wielokrotny. Nic tu
 * nie jest listą pomysłów „do rozważenia" — to wejścia, które da się od razu
 * podać do silnika i policzyć.
 *
 * Propozycje wynikają Z TEJ sprawy: z tego, którą dźwignię faktycznie zmieniono,
 * co pokazały realne liczby i czego sprawa jawnie nie rozstrzygnęła. Tam, gdzie
 * modelowi brakuje dźwigni, follow-up jest zgłaszany razem z powodem
 * NOT_MODELED, zamiast obiecywać eksperyment, którego nie da się wykonać.
 */

/** Ziarna dobrane deterministycznie z ziarna sprawy — replikacja, nie loteria. */
function replicationSeeds(seed: number, count = 7): number[] {
  return Array.from({ length: count }, (_, i) => seed + (i + 1) * 101);
}

function timingDays(days: number): number[] {
  // Momenty rozłożone po horyzoncie, zawsze z natychmiastowym startem jako odniesieniem.
  const candidates = [0, Math.round(days * 0.1), Math.round(days * 0.25), Math.round(days * 0.4), Math.round(days * 0.6)];
  return [...new Set(candidates)].filter((d) => d >= 0 && d <= days).sort((a, b) => a - b);
}

function unconfoundedPair(record: DiscoveryCase, variant: DiscoveryCase['scenarios']['variant']): DiscoveryCaseSpec {
  return {
    question: `Jak „${SCENARIOS[variant].label}" wypada wobec braku interwencji przy tych samych warunkach?`,
    hypothesis: record.hypothesis,
    baselineScenario: 'BASELINE',
    variantScenario: variant,
    initialConditions: record.initialConditions,
    ...(record.replayTolerance > 0 ? { replayTolerance: record.replayTolerance } : {}),
  };
}

/**
 * Proponuje kolejne eksperymenty na podstawie tego, co ta sprawa faktycznie
 * pokazała i czego nie rozstrzygnęła.
 */
export function generateFollowUps(record: DiscoveryCase): DiscoveryFollowUp[] {
  const followUps: DiscoveryFollowUp[] = [];
  const ic = record.initialConditions;
  const lever = record.comparison?.controlledDifference ?? null;

  // 1. Sprawa splątana: najpierw rozplątać, dopiero potem cokolwiek wnioskować.
  if (record.comparison?.blockedReason === 'CONFOUNDED_MULTIPLE_DIFFERENCES') {
    for (const scenario of [record.scenarios.baseline, record.scenarios.variant]) {
      if (scenario === 'BASELINE') continue;
      followUps.push({
        question: `Jaki jest efekt samego „${SCENARIOS[scenario].label}" bez drugiej interwencji?`,
        rationale: `Porównanie w tej sprawie zostało zablokowane: ramiona różniły się dwiema dźwigniami (${record.comparison.observedDifferences.join(', ')}), więc efektu nie da się przypisać żadnej z nich.`,
        plan: { kind: 'scenario-comparison', spec: unconfoundedPair(record, scenario) },
      });
    }
  }

  // 2. Jedno ziarno to jedna realizacja — replikacja jest zawsze uzasadniona.
  if (record.arms.length === 2) {
    followUps.push({
      question: `Czy różnica między „${SCENARIOS[record.scenarios.baseline].label}" a „${SCENARIOS[record.scenarios.variant].label}" utrzymuje się na innych ziarnach?`,
      rationale: `Sprawa policzyła jedno ziarno (${record.seed}); różnica może być cechą tej jednej realizacji, a nie polityki.`,
      plan: {
        kind: 'multi-seed',
        spec: {
          question: `Rozrzut wyników „${SCENARIOS[record.scenarios.variant].label}" po ziarnach.`,
          scenario: record.scenarios.variant,
          seeds: replicationSeeds(record.seed),
          initialConditions: { nAgents: ic.nAgents, initialInfected: ic.initialInfected, days: ic.days, stepsPerDay: ic.stepsPerDay },
        },
      },
    });
  }

  // 3. Dźwignia binarna: pozostaje pytanie o MOMENT jej włączenia.
  if (lever === 'isolate') {
    followUps.push({
      question: 'Czy późniejsze rozpoczęcie izolacji zmienia szczyt zakażeń?',
      rationale: 'Sprawa porównała izolację włączoną od pierwszego dnia z jej brakiem. Model potrafi włączyć ją w trakcie przebiegu, więc moment startu jest osobną, policzalną dźwignią.',
      plan: {
        kind: 'intervention-timing',
        spec: {
          question: 'Jak szczyt zakażeń zależy od dnia rozpoczęcia izolacji?',
          scenario: 'ISOLATION',
          startDays: timingDays(ic.days),
          initialConditions: ic,
        },
      },
    });
  }

  // 4. Dźwignia ciągła: gdzie efekt się nasyca.
  if (lever === 'restrictions') {
    followUps.push({
      question: 'Przy jakim poziomie restrykcji efekt przestaje rosnąć?',
      rationale: 'Sprawa porównała dwa punkty na ciągłej dźwigni. Kształt zależności — w tym ewentualne nasycenie — wymaga serii punktów.',
      plan: {
        kind: 'parameter-sweep',
        spec: {
          question: 'Jak szczyt zakażeń zależy od poziomu restrykcji?',
          scenario: 'BASELINE',
          parameter: 'restrictions',
          values: [0, 0.2, 0.4, 0.6, 0.8, 1],
          initialConditions: ic,
        },
      },
    });
  }

  // 5. Dźwignia zmieniona w pakiecie: rozłożyć ją na składniki.
  if (lever === 'hospital-capacity' && (record.comparison?.observedDifferences.length ?? 0) > 1) {
    for (const parameter of ['totalBeds', 'icuBeds']) {
      followUps.push({
        question: `Jaki jest osobny wkład parametru „${parameter}" w obciążenie systemu?`,
        rationale: `Ta sprawa zmieniła pojemność jako pakiet (${record.comparison!.observedDifferences.join(', ')}) i sama deklaruje, że wkładu składników nie rozstrzyga.`,
        plan: {
          kind: 'parameter-sweep',
          spec: {
            question: `Jak dni bez opieki zależą od „${parameter}"?`,
            scenario: 'BASELINE',
            parameter,
            values: parameter === 'icuBeds' ? [0, 2, 4, 8, 16] : [4, 8, 16, 32, 64],
            initialConditions: ic,
            ...(record.arms.length === 2 ? { hospitalCapacity: record.arms[0].run.hospitalCapacity } : {}),
          },
        },
      });
    }
  }

  // 6. Realny przeciąg systemu w ramieniu bazowym: ile łóżek go usuwa.
  const baselineUnmet = record.arms.find((a) => a.role === 'baseline')?.summary?.totalUnmetCareDays ?? 0;
  if (baselineUnmet > 0 && lever !== 'hospital-capacity') {
    followUps.push({
      question: 'Ile łóżek usuwa dni bez opieki przy tym przebiegu epidemii?',
      rationale: `Ramię bazowe miało ${baselineUnmet} dni, w których zabrakło miejsca — to policzalny próg pojemności, a nie domysł.`,
      plan: {
        kind: 'parameter-sweep',
        spec: {
          question: 'Jak dni bez opieki zależą od liczby łóżek?',
          scenario: record.scenarios.baseline,
          parameter: 'totalBeds',
          values: [2, 4, 8, 16, 32, 64],
          initialConditions: ic,
          ...(record.arms.length === 2 ? { hospitalCapacity: record.arms[0].run.hospitalCapacity } : {}),
        },
      },
    });
  }

  // 7. Granica modelu: pytanie, którego ten model nie umie postawić.
  for (const scenario of ['VACCINATION', 'TRANSPORT_REDUCTION'] as const) {
    const def = SCENARIOS[scenario];
    if (def.notModeledReason === undefined) continue;
    followUps.push({
      question: `Czy „${def.label}" zmieniłoby ten wynik?`,
      rationale: 'To naturalne kolejne pytanie przy tej sprawie, ale model nie ma dla niego dźwigni — zgłaszamy je jako granicę, a nie jako eksperyment do wykonania.',
      plan: null,
      notModeledReason: def.notModeledReason,
    });
  }

  return followUps;
}

/** Czy propozycja jest gotowa do uruchomienia bez dopisywania czegokolwiek. */
export function isRunnable(followUp: DiscoveryFollowUp): boolean {
  return followUp.plan !== null && followUp.notModeledReason === undefined;
}

export { leverOf };
