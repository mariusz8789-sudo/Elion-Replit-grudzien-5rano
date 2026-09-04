import { COHORT_NOT_MODELED } from '../agents/cohortModel';
import { CONTACT_NETWORK_NOT_MODELED } from '../contacts/contactNetwork';
import { canonicalJson, fnv1a } from '../events/hash';
import { HOSPITAL_NOT_MODELED } from './hospitalResource';
import { WORLD_NOT_MODELED } from './worldEngineContract';
import type { ScenarioRun } from './scenarioEngine';

/**
 * CO MODEL LICZY, A CZEGO NIE LICZY.
 *
 * Genesis deklarował już braki modelu w SIEDMIU miejscach — `COHORT_NOT_MODELED`,
 * `HOSPITAL_NOT_MODELED`, `WORLD_NOT_MODELED`, `CONTACT_NETWORK_NOT_MODELED`
 * i pokrewne. Każda z tych list jest prawdziwa i utrzymywana przy swojej
 * warstwie. Żadna nie docierała do użytkownika oglądającego przebieg: człowiek
 * patrzący na scenę widział to, co model liczy, i nie miał jak zobaczyć tego,
 * czego nie liczy. Cicha luka jest gorsza od jawnego braku.
 *
 * Ten moduł NICZEGO nie dopisuje do tych list i nie tworzy ósmej. Zbiera
 * istniejące deklaracje przy konkretnym przebiegu i — po drugiej stronie —
 * wyprowadza listę efektów MODELOWANYCH z REALNIE OBECNYCH pól wyniku, a nie
 * z zapisanego katalogu. Efekt trafia na listę „modelowane" wtedy i tylko
 * wtedy, gdy przebieg naprawdę wystawił jego liczbę.
 */
export const SCENARIO_DISCLOSURE_CONTRACT_VERSION = '1.0.0';

export interface ModeledEffect {
  effect: string;
  /** Pole wyniku, które to potwierdza — sprawdzalne, nie deklaratywne. */
  evidenceField: string;
  /** Wartość odczytana z tego przebiegu. */
  value: number | string;
}

export interface NotModeledEffect {
  effect: string;
  /** Rejestr, który to zadeklarował. Jedno miejsce prawdy na warstwę. */
  declaredBy: string;
}

export interface ScenarioEffectDisclosure {
  contractVersion: string;
  scenarioId: string;
  modeled: readonly ModeledEffect[];
  notModeled: readonly NotModeledEffect[];
  /**
   * Zdanie graniczne pokazywane razem z przebiegiem. Nie jest ozdobą: bez
   * niego liczby wyglądają jak prognoza.
   */
  boundary: string;
  disclosureFingerprint: string;
}

const NOT_MODELED_REGISTRIES: readonly { declaredBy: string; effects: readonly string[] }[] = [
  { declaredBy: 'agents/cohortModel.COHORT_NOT_MODELED', effects: COHORT_NOT_MODELED },
  { declaredBy: 'simulation/hospitalResource.HOSPITAL_NOT_MODELED', effects: HOSPITAL_NOT_MODELED },
  { declaredBy: 'simulation/worldEngineContract.WORLD_NOT_MODELED', effects: WORLD_NOT_MODELED },
  { declaredBy: 'contacts/contactNetwork.CONTACT_NETWORK_NOT_MODELED', effects: CONTACT_NETWORK_NOT_MODELED },
];

/** Efekty niemodelowane, zebrane z istniejących rejestrów. Bez duplikatów, bez dopisków. */
export function collectNotModeledEffects(): readonly NotModeledEffect[] {
  const seen = new Map<string, string>();
  for (const registry of NOT_MODELED_REGISTRIES) {
    for (const effect of registry.effects) {
      // Pierwszy rejestr, który deklaruje dany brak, pozostaje jego źródłem.
      if (!seen.has(effect)) seen.set(effect, registry.declaredBy);
    }
  }
  return [...seen.entries()]
    .map(([effect, declaredBy]) => ({ effect, declaredBy }))
    .sort((a, b) => a.effect.localeCompare(b.effect));
}

/**
 * Efekty MODELOWANE wyprowadzone z pól, które ten przebieg faktycznie wystawił.
 * Pole nieobecne albo puste nie trafia na listę — brak dowodu nie jest dowodem.
 */
function modeledEffectsFor(run: ScenarioRun): ModeledEffect[] {
  const modeled: ModeledEffect[] = [];
  const summary = run.summary;
  if (summary === null) return modeled;

  modeled.push({ effect: 'przebieg zakażeń w czasie (S/E/I/R/D)', evidenceField: 'ScenarioRun.series', value: `${run.series.length} próbek dobowych` });
  modeled.push({ effect: 'szczyt zakażeń i dzień szczytu', evidenceField: 'ScenarioSummary.peakInfectious/peakInfectiousDay', value: `${summary.peakInfectious} w dniu ${summary.peakInfectiousDay}` });
  modeled.push({ effect: 'zgony w horyzoncie przebiegu', evidenceField: 'ScenarioSummary.totalDeaths', value: summary.totalDeaths });
  modeled.push({ effect: 'odsetek populacji, który przeszedł zakażenie', evidenceField: 'ScenarioSummary.attackRate', value: Number(summary.attackRate.toFixed(6)) });
  modeled.push({ effect: 'obłożenie łóżek i ICU', evidenceField: 'ScenarioSummary.peakBedOccupancy/peakIcuOccupancy', value: `${Number(summary.peakBedOccupancy.toFixed(4))} / ${Number(summary.peakIcuOccupancy.toFixed(4))}` });
  modeled.push({ effect: 'osobodni bez zapewnionej opieki', evidenceField: 'ScenarioSummary.totalUnmetCareDays', value: summary.totalUnmetCareDays });

  const bands = Object.entries(summary.byBand).filter(([, outcome]) => outcome.population > 0);
  if (bands.length > 0) {
    modeled.push({ effect: 'wyniki w podziale na pasma wieku', evidenceField: 'ScenarioSummary.byBand', value: bands.map(([band, outcome]) => `${band}=${outcome.deaths} zgonów / ${outcome.population} osób`).join(', ') });
  }
  const contactTypes = Object.entries(summary.transmissionsByContactType).filter(([, count]) => count > 0);
  if (contactTypes.length > 0) {
    modeled.push({ effect: 'transmisje wg typu kontaktu', evidenceField: 'ScenarioSummary.transmissionsByContactType', value: contactTypes.map(([type, count]) => `${type}=${count}`).join(', ') });
  }
  if (run.transmissionGraph.length > 0) {
    modeled.push({ effect: 'graf transmisji: kto kogo zaraził i gdzie', evidenceField: 'ScenarioRun.transmissionGraph', value: `${run.transmissionGraph.length} krawędzi` });
  }
  if (run.interventionStartDay > 0) {
    modeled.push({ effect: 'moment wejścia interwencji w życie', evidenceField: 'ScenarioRun.interventionStartDay', value: `dzień ${run.interventionStartDay}` });
  }
  return modeled;
}

export function describeScenarioEffects(run: ScenarioRun): ScenarioEffectDisclosure {
  const modeled = modeledEffectsFor(run);
  const notModeled = run.status === 'NOT_MODELED' ? [] : collectNotModeledEffects();
  const boundary = run.status === 'NOT_MODELED'
    ? `Scenariusz ${run.scenarioId} nie jest modelowany: ${run.notModeledReason ?? 'model nie ma dla niego reprezentacji'}. Nie powstał żaden przebieg.`
    : 'Model nie jest skalibrowany do żadnej rzeczywistej epidemii, miasta ani placówki. To przebieg scenariuszowy (SYNTHETIC / SCENARIO / NON_OPERATIONAL): nie jest prognozą, obserwacją ani wskazówką operacyjną. Efekty spoza listy „modelowane" NIE są liczone i nie wolno ich odczytywać jako zera.';
  return {
    contractVersion: SCENARIO_DISCLOSURE_CONTRACT_VERSION,
    scenarioId: run.scenarioId,
    modeled,
    notModeled,
    boundary,
    disclosureFingerprint: fnv1a(canonicalJson({
      contractVersion: SCENARIO_DISCLOSURE_CONTRACT_VERSION,
      scenarioId: run.scenarioId,
      modeled: modeled.map((entry) => entry.evidenceField),
      notModeled: notModeled.map((entry) => entry.effect),
    })),
  };
}
