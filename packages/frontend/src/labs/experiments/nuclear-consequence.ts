import type { ExperimentDef } from '../../core/types';
import { buildNuclearModelGraph } from '../../core/modelGraph/nuclearGraph';

/**
 * Nuclear Lab × Graf Modeli (Priorytet 1: adopcja Grafu Modeli przez laby).
 *
 * Wcześniej `nuclearGraph` (SEMF) był wykonywalny i przetestowany, ale HEADLESS
 * — żaden ekran go nie pokazywał. Ten eksperyment podłącza go do UI jako łańcuch
 * konsekwencji: zmieniasz Z lub N, a energia wiązania, energia na nukleon,
 * liczba masowa i gradient stabilności β PRZELICZAJĄ się przez ten sam graf,
 * z zapisem „co spowodowało zmianę". Fizyka (półempiryczny wzór na masę,
 * Weizsäcker) jest niezmieniona — to tylko jej udostępnienie w laboratorium.
 */
export const nuclearConsequence: ExperimentDef = {
  id: 'nuclear.semf-consequence',
  name: 'Łańcuch konsekwencji: SEMF',
  honesty: 'simplified',
  honestyNote:
    'Półempiryczny wzór na masę (SEMF / model kroplowy Weizsäckera) — MODEL PRZYBLIŻONY dopasowany do danych: dobrze oddaje trend energii wiązania i dolinę stabilności, ale NIE przewiduje efektów powłokowych ani liczb magicznych. Wszystkie wielkości liczy wykonywalny Graf Modeli (core/modelGraph/nuclearGraph); dotknięcie Z lub N propaguje konsekwencje w kolejności zależności.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildNuclearModelGraph(),
    headline: 'Struktura jądra: Z, N → A, energia wiązania, energia/nukleon, kierunek rozpadu β',
    params: [
      { id: 'protonNumber', min: 1, max: 100, step: 1 },
      { id: 'neutronNumber', min: 0, max: 160, step: 1 },
    ],
    outputs: [
      { id: 'massNumber' },
      { id: 'bindingEnergy', format: (v) => v.toFixed(1) },
      { id: 'bindingPerNucleon', format: (v) => v.toFixed(3) },
      { id: 'stabilityGradient', format: (v) => v.toFixed(3) },
    ],
  }),
};
