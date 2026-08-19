import type { KnowledgeCapability } from './registry';

export const SUPPLEMENTAL_KNOWLEDGE_VERSION = '1.0.0';

export type KnowledgeEpistemicStatus = 'FACT' | 'MODEL' | 'THEORY' | 'HYPOTHESIS' | 'SCENARIO_ASSUMPTION' | 'FICTIONAL_REFERENCE';
export type KnowledgeSourceKind = 'institutional-reference' | 'historical-reference' | 'peer-reviewed-publication' | 'user-supplied-video' | 'fictional-reference';

export interface SupplementalKnowledgeRecord {
  id: string;
  title: string;
  domainId: string;
  epistemicStatus: KnowledgeEpistemicStatus;
  statement: string;
  source: { kind: KnowledgeSourceKind; title: string; url: string; retrievedAt: string };
  capability: KnowledgeCapability;
  realModelIds: readonly string[];
  requiredSolver: string;
  scenarioEligible: boolean;
  limitation: string;
  keywords: readonly string[];
}

/**
 * An additive registry. Entries are source-bound and never change the 20-file
 * authoritative corpus or claim that a theory already has a runnable solver.
 */
const RECORDS: readonly SupplementalKnowledgeRecord[] = [
  {
    id: 'chaos-sensitive-initial-conditions', title: 'Wrażliwość na warunki początkowe (efekt motyla)', domainId: 'classical-mechanics',
    epistemicStatus: 'THEORY', statement: 'W nieliniowych układach deterministycznych małe różnice warunków początkowych mogą prowadzić do istotnie różnych trajektorii.',
    source: { kind: 'institutional-reference', title: 'American Physical Society — historia pracy Edwarda Lorenza', url: 'https://www.aps.org/archives/publications/apsnews/200301/history.cfm', retrievedAt: '2026-08-18' },
    capability: 'CAPABILITY_SEAM', realModelIds: ['universe-kepler'], requiredSolver: 'walidowany układ nieliniowy z analizą ensemble; obecny Kepler dwóch ciał nie demonstruje chaosu', scenarioEligible: true,
    limitation: 'Metafora motyla nie jest uniwersalnym dowodem, że każda mała zmiana wywoła dużą konsekwencję. Wymaga konkretnego dynamical system, zakresu i analizy czułości.',
    keywords: ['efekt motyla', 'motyl', 'chaos', 'wrażliwość', 'warunki początkowe', 'lorenz'],
  },
  {
    id: 'einstein-special-relativity', title: 'Szczególna teoria względności', domainId: 'spacetime-einstein',
    epistemicStatus: 'THEORY', statement: 'Dla inercjalnych obserwatorów model Lorentza opisuje relacje między pomiarem czasu i przestrzeni przy skończonej prędkości światła.',
    source: { kind: 'institutional-reference', title: 'Einstein Portal — Collected Papers of Albert Einstein', url: 'https://einsteinpapers.press.princeton.edu/', retrievedAt: '2026-08-18' },
    capability: 'REAL_ENGINE', realModelIds: ['sr-lorentz'], requiredSolver: 'sr-lorentz', scenarioEligible: true,
    limitation: 'Obecny engine obejmuje zadeklarowane obliczenia SR, nie pełną dynamikę relatywistyczną ani pole grawitacyjne.',
    keywords: ['einstein', 'szczególna względność', 'szczegolna wzglednosc', 'lorentz', 'dylatac'],
  },
  {
    id: 'einstein-general-relativity-static', title: 'Ogólna względność — granica analityczna Schwarzschilda', domainId: 'spacetime-einstein',
    epistemicStatus: 'THEORY', statement: 'Analityczny przypadek Schwarzschilda jest ograniczonym rozwiązaniem wykorzystywanym przez obecny model promienia horyzontu.',
    source: { kind: 'institutional-reference', title: 'Einstein Portal — Collected Papers of Albert Einstein', url: 'https://einsteinpapers.press.princeton.edu/', retrievedAt: '2026-08-18' },
    capability: 'REAL_ENGINE', realModelIds: ['einstein-schwarzschild', 'einstein-chirp-mass'], requiredSolver: 'einstein-schwarzschild / einstein-chirp-mass', scenarioEligible: true,
    limitation: 'Nie obejmuje spinu, ładunku, pełnej numerycznej relatywistyki ani dynamicznych pól czasoprzestrzeni.',
    keywords: ['einstein', 'ogólna względność', 'ogolna wzglednosc', 'schwarzschild', 'czarna dziura', 'fala grawitacyjna'],
  },
  {
    id: 'einstein-photoelectric-effect', title: 'Efekt fotoelektryczny i kwant światła', domainId: 'electrodynamics',
    epistemicStatus: 'MODEL', statement: 'Energia fotonu zależy od częstotliwości; opis efektu fotoelektrycznego był szczególnie wskazany w motywacji Nagrody Nobla Einsteina.',
    source: { kind: 'institutional-reference', title: 'Nobel Prize — Albert Einstein Facts', url: 'https://www.nobelprize.org/prizes/physics/1921/einstein/facts/', retrievedAt: '2026-08-18' },
    capability: 'CAPABILITY_SEAM', realModelIds: ['photon-energy'], requiredSolver: 'photon-energy dla energii; solver materiałowy dla emisji fotoelektronów', scenarioEligible: true,
    limitation: 'Genesis oblicza energię fotonu, ale nie deklaruje kompletnego modelu materiału, pracy wyjścia ani wydajności fotoemisji.',
    keywords: ['einstein', 'fotoelektryczny', 'foton', 'energia fotonu', 'światło', 'swiatlo'],
  },
  {
    id: 'tesla-polyphase-ac-history', title: 'Tesla — układy wielofazowego prądu przemiennego', domainId: 'electrodynamics',
    epistemicStatus: 'FACT', statement: 'Historyczny wpis kontekstowy dla systemów AC i silników indukcyjnych związanych z pracą Nikoli Tesli.',
    source: { kind: 'historical-reference', title: 'United States Patent and Trademark Office — publiczna wyszukiwarka patentów', url: 'https://ppubs.uspto.gov/pubwebapp/', retrievedAt: '2026-08-18' },
    capability: 'KNOWLEDGE_ONLY', realModelIds: [], requiredSolver: 'solver elektromagnetyczny i model maszyny elektrycznej', scenarioEligible: true,
    limitation: 'Wpis historyczny nie stanowi dowodu konkretnych twierdzeń przypisywanych Tesli ani silnika obliczeniowego. Pełne pola EM i silnik indukcyjny wymagają walidowanego solvera.',
    keywords: ['tesl', 'prąd przemienny', 'prad przemienny', 'silnik indukcyjny', 'wielofazowy'],
  },
  {
    id: 'video-n-psychological-observer', title: 'Wideo użytkownika: obserwacja własnych procesów psychicznych', domainId: 'biology',
    epistemicStatus: 'HYPOTHESIS', statement: 'Materiał proponuje, że świadome monitorowanie myśli i emocji może zmieniać automatyczne wzorce zachowania.',
    source: { kind: 'user-supplied-video', title: 'YouTube N_JAnj77Svc — materiał przekazany przez użytkownika', url: 'https://youtu.be/N_JAnj77Svc?is=oZTcaT_WfIVvkLK', retrievedAt: '2026-08-18' },
    capability: 'ENGINE_NOT_AVAILABLE', realModelIds: [], requiredSolver: 'walidowany model poznawczy/behawioralny oraz protokół danych empirycznych', scenarioEligible: true,
    limitation: 'Nie wolno utożsamiać tej hipotezy z efektem obserwatora w mechanice kwantowej ani przedstawiać jej jako faktu medycznego lub psychologicznego.',
    keywords: ['obserwator', 'świadomość', 'swiadomosc', 'podświadomość', 'podswadomosc', 'zachowanie'],
  },
  {
    id: 'video-n-scenario-inner-thermostat', title: 'Wideo użytkownika: wewnętrzny termostat jako założenie agenta', domainId: 'biology',
    epistemicStatus: 'SCENARIO_ASSUMPTION', statement: 'Materiał opisuje agentowy parametr dążenia do zadeklarowanego stanu wewnętrznego; w Genesis może to być wyłącznie jawne założenie scenariusza.',
    source: { kind: 'user-supplied-video', title: 'YouTube N_JAnj77Svc — materiał przekazany przez użytkownika', url: 'https://youtu.be/N_JAnj77Svc?is=oZTcaT_WfIVvkLK', retrievedAt: '2026-08-18' },
    capability: 'ENGINE_NOT_AVAILABLE', realModelIds: [], requiredSolver: 'jawnie zdefiniowany model decyzyjny agenta z testami wrażliwości', scenarioEligible: true,
    limitation: 'Nie istnieje w aktualnym modelu epidemii i nie może mutować World State bez jawnego modelu, parametrów, kontroli oraz walidacji.',
    keywords: ['termostat', 'agent', 'przekonanie', 'scenariusz zachowania'],
  },
  {
    id: 'majorana-1-parity-measurement', title: 'Majorana 1 — recenzowany pomiar parzystości w InAs–Al', domainId: 'quantum',
    epistemicStatus: 'FACT', statement: 'Publikacja Nature opisuje pojedynczy interferometryczny pomiar parzystości w hybrydowych urządzeniach InAs–Al oraz jawnie zaznacza, że sam pomiar nie odróżnia jednoznacznie topologicznych modów Majorany od dostrojonych stanów Andreeva w fazie trywialnej.',
    source: { kind: 'peer-reviewed-publication', title: 'Nature — Interferometric single-shot parity measurement in InAs–Al hybrid devices (2025)', url: 'https://www.nature.com/articles/s41586-024-08445-2', retrievedAt: '2026-08-19' },
    capability: 'KNOWLEDGE_ONLY', realModelIds: [], requiredSolver: 'zwalidowany model urządzenia InAs–Al z parametrami materiałowymi i eksperymentalnymi', scenarioEligible: false,
    limitation: 'Jest to fakt o zakresie opublikowanego pomiaru, nie dowód, że Genesis posiada dane urządzenia, symuluje Majorana 1 ani rozstrzyga obecność topologicznych modów Majorany.',
    keywords: ['majorana', 'majorana 1', 'pomiar parzystości', 'inAs', 'aluminium', 'in as al', 'topoconductor'],
  },
  {
    id: 'majorana-1-topological-qubit-claim', title: 'Majorana 1 — claim topologicznego kubitu pod dalszą weryfikacją', domainId: 'quantum',
    epistemicStatus: 'HYPOTHESIS', statement: 'Microsoft przedstawia Majorana 1 jako architekturę topologicznych kubitów, lecz niezależne omówienia APS wskazują, że pełny claim topologicznego kubitu pozostawał przedmiotem naukowej dyskusji i wymaga dalszych, rozstrzygających dowodów.',
    source: { kind: 'institutional-reference', title: 'Microsoft — Majorana 1 (2025), skonfrontowane z omówieniami APS Physics', url: 'https://news.microsoft.com/source/features/innovation/microsofts-majorana-1-chip-carves-new-path-for-quantum-computing/', retrievedAt: '2026-08-19' },
    capability: 'ENGINE_NOT_AVAILABLE', realModelIds: [], requiredSolver: 'zwalidowany solver topologicznego układu skondensowanej materii oraz niezależnie zweryfikowane dane eksperymentalne', scenarioEligible: false,
    limitation: 'Nie wolno przedstawiać claimu jako rozstrzygniętego faktu, jako wyniku aktualnych modeli quantum-bloch/chsh-correlation ani jako dowodu dostępności quantum solvera w Genesis.',
    keywords: ['majorana', 'majorana 1', 'topologiczny kubit', 'topological qubit', 'topologiczny stan', 'topological state'],
  },
  {
    id: 'majorana-film-time-travel-reference', title: 'Reel Majorana 1 — fikcyjna referencja podróży w czasie', domainId: 'quantum',
    epistemicStatus: 'FICTIONAL_REFERENCE', statement: 'Materiał używa fragmentu Avengers: Endgame jako narracyjnej analogii podróży w czasie; nie jest to fakt fizyczny, dane eksperymentalne ani model naukowy.',
    source: { kind: 'fictional-reference', title: 'Facebook Reel użytkownika — odwołanie do Avengers: Endgame (2019)', url: 'https://www.facebook.com/reel/2139439816988286', retrievedAt: '2026-08-19' },
    capability: 'KNOWLEDGE_ONLY', realModelIds: [], requiredSolver: 'Brak — referencja fikcyjna nie jest wejściem do eksperymentu', scenarioEligible: false,
    limitation: 'Może inspirować warstwę narracyjną lub estetyczną, ale nie może zasilać parametrów, obserwowalnych, Evidence Pack, provenance eksperymentu ani claimu naukowego.',
    keywords: ['avengers', 'endgame', 'podróż w czasie', 'podroz w czasie', 'film majorana'],
  },
] as const;

export function listSupplementalKnowledge(): readonly SupplementalKnowledgeRecord[] { return RECORDS; }
export function getSupplementalKnowledge(id: string): SupplementalKnowledgeRecord | undefined { return RECORDS.find((entry) => entry.id === id); }
export function findSupplementalKnowledge(text: string): readonly SupplementalKnowledgeRecord[] {
  const normalized = text.toLocaleLowerCase('pl-PL');
  return RECORDS.filter((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)));
}
