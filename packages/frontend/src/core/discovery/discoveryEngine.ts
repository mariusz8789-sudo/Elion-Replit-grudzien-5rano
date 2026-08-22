import { deriveDiscoveryConclusion } from './discoveryConclusion';
import { generateFollowUps } from './discoveryFollowUp';
import { createDiscoveryEvidencePack } from './discoveryEvidence';
import { executeDiscoveryCase } from './discoveryExecution';
import { replayDiscoveryCase } from './discoveryReplay';
import { runParameterSweep, runInterventionTimingSweep, type SweepResult } from './discoverySweep';
import { runMultiSeed, type MultiRunResult } from './discoveryMultiRun';
import { highestEarnedStatus, type DiscoveryCase, type DiscoveryCaseSpec, type DiscoveryFollowUp, type DiscoveryFollowUpPlan } from './discoveryCase';

/**
 * DISCOVERY ENGINE — pełna ścieżka sprawy w jednym wywołaniu:
 * PYTANIE → HIPOTEZA → EKSPERYMENT → PARAMETRY → WYKONANIE → WYNIK →
 * PORÓWNANIE → REPLAY → DOWÓD → WNIOSEK.
 *
 * Kolejność nie jest kosmetyczna. Odtworzenie musi się wydarzyć PRZED wnioskiem,
 * bo wniosek bez potwierdzonej odtwarzalności jest z definicji niewystarczająco
 * udowodniony. Pakiet dowodowy powstaje po wniosku, bo go zawiera. Status na
 * końcu nie jest deklarowany — wylicza go bramka z tego, co faktycznie zebrano.
 */
export function runDiscoveryCase(spec: DiscoveryCaseSpec): DiscoveryCase {
  const executed = executeDiscoveryCase(spec);
  if (executed.status === 'NOT_MODELED') return { ...executed, followUp: generateFollowUps(executed) };

  // Dźwignia zmieniona jako pakiet (np. łóżka + ICU) jest jedną interwencją,
  // ale jej składników nie da się rozdzielić — to ograniczenie tej sprawy.
  const bundled = (executed.comparison?.observedDifferences.length ?? 0) > 1;
  const withCase: DiscoveryCase = bundled
    ? {
        ...executed,
        limitations: [
          ...executed.limitations,
          `Kontrolowana dźwignia „${executed.comparison!.controlledDifference}" zmieniła kilka parametrów naraz (${executed.comparison!.observedDifferences.join(', ')}); wkładu żadnego z nich osobno ta sprawa nie rozstrzyga.`,
        ],
      }
    : executed;

  const replay = replayDiscoveryCase(withCase);
  const conclusion = deriveDiscoveryConclusion(withCase, withCase.comparison, replay);
  const withEvidence: DiscoveryCase = {
    ...withCase,
    replay,
    conclusion,
    evidence:
      withCase.comparison === null
        ? null
        : createDiscoveryEvidencePack(withCase, withCase.comparison, replay, conclusion),
  };
  const withFollowUp: DiscoveryCase = { ...withEvidence, followUp: generateFollowUps(withEvidence) };
  return { ...withFollowUp, status: highestEarnedStatus(withFollowUp) };
}

/** Wynik wykonania follow-upu — zawsze jeden z realnych typów przebiegu. */
export type DiscoveryFollowUpRun =
  | { kind: 'scenario-comparison'; case: DiscoveryCase }
  | { kind: 'parameter-sweep'; sweep: SweepResult }
  | { kind: 'intervention-timing'; sweep: SweepResult }
  | { kind: 'multi-seed'; multiRun: MultiRunResult };

/**
 * Uruchamia zaproponowany follow-up. To jest właśnie sens tego, że propozycja
 * jest wsadem, a nie zdaniem: przechodzi prosto do silnika i daje nowy, realny
 * przebieg z własnym odciskiem.
 */
export function runFollowUpPlan(plan: DiscoveryFollowUpPlan): DiscoveryFollowUpRun {
  switch (plan.kind) {
    case 'scenario-comparison':
      return { kind: 'scenario-comparison', case: runDiscoveryCase(plan.spec) };
    case 'parameter-sweep':
      return { kind: 'parameter-sweep', sweep: runParameterSweep(plan.spec) };
    case 'intervention-timing':
      return { kind: 'intervention-timing', sweep: runInterventionTimingSweep(plan.spec) };
    case 'multi-seed':
      return { kind: 'multi-seed', multiRun: runMultiSeed(plan.spec) };
  }
}

/** Wykonuje follow-up, o ile w ogóle da się go wykonać na tym modelu. */
export function runFollowUp(followUp: DiscoveryFollowUp): DiscoveryFollowUpRun | null {
  return followUp.plan === null ? null : runFollowUpPlan(followUp.plan);
}
