import { describe, expect, it } from 'vitest';
import {
  classifyStoredEvidencePack,
  compareScientificEvidencePacks,
  getStoredEvidencePackReplayVerdict,
} from '../core/experimentFabric/evidencePackStore';
import {
  createScientificEvidencePack,
  designScientificExperiment,
  executeScientificExperiment,
  parseScienceChatMessage,
} from '../core/experimentFabric';

/**
 * REGRESJA — granica integralności paczek Evidence z localStorage.
 *
 * `classifyStoredEvidencePack` zwracał `VALID` dla rekordów, których czytelnicy
 * nie są w stanie obsłużyć, bo walidator sprawdzał tylko `typeof
 * pack.reproducibility === 'object'` — a `typeof null === 'object'`. Skutek na
 * realnych ścieżkach:
 *
 *  - `ScientificMemoryScreen.tsx` woła `getStoredEvidencePackReplayVerdict`
 *    dla każdego wylistowanego rekordu i czyta `pack.protocol.hypothesis.modelId`;
 *  - `ExperimentPilotScreen.tsx` woła `compareScientificEvidencePacks`, które
 *    czyta `protocol.protocolFingerprint`.
 *
 * `protocol` nie był walidowany w ogóle. Rekord z `reproducibility: null` albo
 * bez `protocol` przechodził jako VALID i wywracał ekran na TypeError —
 * dokładnie ten scenariusz, przed którym warstwa `core/storage.ts` deklaruje
 * ochronę („cicha awaria zamiast wywalenia aplikacji").
 *
 * VALID ma znaczyć „da się to bezpiecznie pokazać i porównać".
 */

function realPack() {
  const request = parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.');
  const design = designScientificExperiment({
    hypothesis: {
      statement: 'W granicach modelu Schwarzschilda promień horyzontu rośnie wraz z masą.',
      domainId: 'spacetime-einstein',
      modelId: 'einstein-schwarzschild',
      declaredAssumptions: [],
      falsification: { metric: 'radiusKm', relation: 'monotonic-increase', rationale: 'Większa masa ma dać większy promień.' },
    },
    baselineRequest: request,
    sweep: { parameter: 'massSolar', values: [1, 2], label: 'Masa M☉' },
    repetitionsPerArm: 1,
  });
  return createScientificEvidencePack(executeScientificExperiment(design));
}

describe('Evidence Pack — granica integralności zapisu lokalnego', () => {
  it('realna paczka z prawdziwego przebiegu dalej jest VALID i porównywalna', () => {
    const pack = realPack();
    expect(classifyStoredEvidencePack(pack)).toBe('VALID');
    expect(pack.runCount).toBe(pack.runs.length);
    expect(getStoredEvidencePackReplayVerdict(pack)).toBe('MATCH');
    expect(compareScientificEvidencePacks(pack, pack)).toBe('MATCH');
  });

  it('reproducibility: null nie jest VALID — typeof null === "object" nie może być dowodem', () => {
    const pack = realPack();
    const corrupt = { ...pack, reproducibility: null };

    expect(classifyStoredEvidencePack(corrupt)).toBe('INVALID_LOCAL_RECORD');
    // Rekord odrzucony na granicy nigdy nie dociera do czytelnika, który by się
    // na nim wywrócił; gdyby dotarł, byłby to TypeError na ekranie.
    expect(() => getStoredEvidencePackReplayVerdict(corrupt as never)).toThrow();
  });

  it('brak protocol nie jest VALID — czytają go i ekran, i komparator replayu', () => {
    const pack = realPack();
    const { protocol: _protocol, ...withoutProtocol } = pack;

    expect(classifyStoredEvidencePack(withoutProtocol)).toBe('INVALID_LOCAL_RECORD');
    expect(() => compareScientificEvidencePacks(withoutProtocol as never, pack)).toThrow();
  });

  it('run bez provenance.runFingerprint nie jest VALID', () => {
    const pack = realPack();
    const stripped = { ...pack, runs: pack.runs.map(({ provenance: _p, ...rest }) => rest) };

    expect(classifyStoredEvidencePack(stripped)).toBe('INVALID_LOCAL_RECORD');
  });

  it('paczka kłamiąca o liczbie własnych przebiegów nie jest VALID', () => {
    const pack = realPack();

    expect(classifyStoredEvidencePack({ ...pack, runCount: pack.runs.length + 97 })).toBe('INVALID_LOCAL_RECORD');
  });

  it('reproducibility bez wymaganych pól nie jest VALID', () => {
    const pack = realPack();

    expect(classifyStoredEvidencePack({ ...pack, reproducibility: {} })).toBe('INVALID_LOCAL_RECORD');
    expect(classifyStoredEvidencePack({
      ...pack,
      reproducibility: { ...pack.reproducibility, armsNotExecuted: 'nie-tablica' },
    })).toBe('INVALID_LOCAL_RECORD');
  });
});
