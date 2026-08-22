import { deriveDiscoveryConclusion } from './discoveryConclusion';
import { createDiscoveryEvidencePack } from './discoveryEvidence';
import { executeDiscoveryCase } from './discoveryExecution';
import { replayDiscoveryCase } from './discoveryReplay';
import { highestEarnedStatus, type DiscoveryCase, type DiscoveryCaseSpec } from './discoveryCase';

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
  if (executed.status === 'NOT_MODELED') return executed;

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
  return { ...withEvidence, status: highestEarnedStatus(withEvidence) };
}
