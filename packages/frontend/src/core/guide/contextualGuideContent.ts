export type ContextualGuideSurface =
  | 'CERN'
  | 'CYBER'
  | 'GOVERNMENT'
  | 'MIRROR'
  | 'WORLD_DIRECTOR'
  | 'VIRTUAL_LAB'
  | 'CAMPAIGN'
  | 'HUMAN_EXPLORER';

export interface ContextualGuideStep {
  readonly key: string;
  readonly pl: string;
  readonly en: string;
  readonly plainPl: string;
  readonly plainEn: string;
}

const GUIDES: Readonly<Record<ContextualGuideSurface, readonly ContextualGuideStep[]>> = {
  CERN: [
    {
      key: 'cern-scope',
      pl: 'To jest interaktywna wizualizacja edukacyjna zderzenia oparta na modelu TOY_MC_MODEL. Nie jest to transmisja z LHC ani pełna symulacja PYTHIA lub Geant4.',
      en: 'This is an interactive educational collision visualization driven by the TOY_MC_MODEL. It is not a live LHC feed or a full PYTHIA or Geant4 simulation.',
      plainPl: 'Oglądasz model edukacyjny zderzenia, a nie prawdziwy eksperyment transmitowany z CERN.',
      plainEn: 'You are viewing an educational collision model, not a live experiment streamed from CERN.',
    },
    {
      key: 'cern-action',
      pl: 'Uruchom serię zderzeń i obserwuj tory cząstek oraz podsumowanie zdarzeń. Te elementy pochodzą z aktualnego stanu modelu, nie z losowej dekoracji.',
      en: 'Run a collision batch and inspect particle tracks and the event summary. These elements come from the current model state, not random decoration.',
      plainPl: 'Uruchom zderzenia. Tory i liczby zmienią się zgodnie ze stanem modelu.',
      plainEn: 'Run collisions. Tracks and numbers will change with the model state.',
    },
    {
      key: 'cern-real-data',
      pl: 'Jeśli chcesz analizować prawdziwe dane historyczne CMS, przejdź do modułu REAL CMS DATA. Ten moduł utrzymuje oddzielnie model edukacyjny i dane eksperymentalne.',
      en: 'To analyse real historical CMS data, open REAL CMS DATA. Genesis keeps the educational model separate from experimental data.',
      plainPl: 'Prawdziwe dane CMS są w osobnym module i nie są mieszane z tym modelem.',
      plainEn: 'Real CMS data lives in a separate module and is not mixed with this model.',
    },
  ],
  CYBER: [
    {
      key: 'cyber-scope',
      pl: 'Cyber uruchamia kontrolowane dochodzenie: hipoteza, bezpieczny test, obserwacja, ocena i retest. Wynik dotyczy badanego środowiska, nie całego Internetu.',
      en: 'Cyber runs a controlled investigation: hypothesis, safe test, observation, assessment and retest. Results apply to the inspected environment, not the whole Internet.',
      plainPl: 'Genesis sprawdza hipotezy w kontrolowanym środowisku i pokazuje, co naprawdę przetestował.',
      plainEn: 'Genesis tests hypotheses in a controlled environment and shows what it actually tested.',
    },
    {
      key: 'cyber-evidence',
      pl: 'Czytaj osobno propozycję naprawy i wynik retestu. Propozycja nie staje się potwierdzoną poprawką, dopóki niezależny retest nie pokaże rezultatu.',
      en: 'Read the remediation proposal and retest result separately. A proposal is not a confirmed fix until an independent retest produces a result.',
      plainPl: 'Najpierw propozycja naprawy, potem osobny test, czy zadziałała.',
      plainEn: 'First comes a proposed fix, then a separate test of whether it worked.',
    },
  ],
  GOVERNMENT: [
    {
      key: 'government-scope',
      pl: 'Government Drug Discovery prowadzi źródłową kampanię badawczą nad kandydatami. Wyniki modeli i reguł selekcji pozostają wynikami in silico, a nie rekomendacją refundacyjną ani dowodem skuteczności klinicznej.',
      en: 'Government Drug Discovery runs a source-backed candidate research campaign. Model outputs and selection rules remain in-silico results, not a reimbursement recommendation or proof of clinical efficacy.',
      plainPl: 'To kampania badawcza na danych i modelach. Nie jest decyzją medyczną ani urzędową.',
      plainEn: 'This is a data-and-model research campaign. It is not a medical or government decision.',
    },
    {
      key: 'government-evidence',
      pl: 'Sprawdź źródło kandydata, bramki bezpieczeństwa, werdykt i ograniczenia. Evidence zachowuje provenance, a odrzucony lub niepotwierdzony kandydat nie jest promowany do terapii.',
      en: 'Inspect the candidate source, safety gates, verdict and limitations. Evidence retains provenance, and a rejected or unconfirmed candidate is never promoted to a therapy.',
      plainPl: 'Sprawdź źródła i ograniczenia. Kandydat pozostaje kandydatem, dopóki dowody go nie potwierdzą.',
      plainEn: 'Check sources and limitations. A candidate stays a candidate until evidence supports it.',
    },
  ],
  MIRROR: [
    {
      key: 'mirror-state',
      pl: 'Mirror pokazuje stan kamery, zgody, kalibracji i rejestracji. Brak zgody lub kalibracji pozostaje jawnie oznaczony i nie jest zastępowany fałszywym pomiarem.',
      en: 'Mirror exposes camera, consent, calibration and registration state. Missing permission or calibration stays explicit and is never replaced with a fake measurement.',
      plainPl: 'Najpierw kamera i kalibracja. Bez nich Genesis nie udaje prawdziwego pomiaru.',
      plainEn: 'Camera and calibration come first. Without them Genesis does not pretend to have a real measurement.',
    },
    {
      key: 'mirror-twin',
      pl: 'Syntetyczne odbicie może pokazać inny ruch lub wariant scenariusza, ale nie jest kopią medyczną użytkownika ani zweryfikowanym cyfrowym bliźniakiem pacjenta.',
      en: 'A synthetic reflection may show another motion or scenario variant, but it is not a medical copy of the user or a validated patient digital twin.',
      plainPl: 'To wizualny wariant użytkownika, nie medyczna kopia jego ciała.',
      plainEn: 'This is a visual user variant, not a medical copy of their body.',
    },
  ],
  WORLD_DIRECTOR: [
    {
      key: 'world-prompt',
      pl: 'Wpisz opis obsługiwanego świata albo wybierz propozycję. Genesis tłumaczy go na kanoniczną specyfikację, WorldGraph i istniejący renderer; nie jest to uniwersalny generator dowolnej rzeczywistości.',
      en: 'Enter a supported world description or choose a suggestion. Genesis maps it to the canonical specification, WorldGraph and existing renderer; this is not a universal reality generator.',
      plainPl: 'Opisujesz świat, a Genesis buduje go z obsługiwanych szablonów i prawdziwego WorldGraph.',
      plainEn: 'Describe a world and Genesis builds it from supported templates and the real WorldGraph.',
    },
    {
      key: 'world-proof',
      pl: 'Sprawdź World ID, liczbę encji i fingerprint. To dowody, że scena pochodzi z bieżącego stanu świata. Status AI cinematic pozostaje niepodłączony, dopóki lokalny model naprawdę nie wykona generacji.',
      en: 'Inspect World ID, entity count and fingerprint. They show that the scene comes from current world state. AI cinematic remains unconnected until a local model genuinely performs generation.',
      plainPl: 'Identyfikator i fingerprint wiążą obraz ze światem. AI-video nie jest jeszcze udawane.',
      plainEn: 'The ID and fingerprint bind the image to the world. AI video is not being faked.',
    },
    {
      key: 'world-film',
      pl: 'Tryb CINEMATIC steruje istniejącą kamerą deterministyczną. Przechwycone klatki mogą zostać zakodowane do MP4 z manifestem i SHA-256.',
      en: 'CINEMATIC mode controls the existing deterministic camera. Captured frames can be encoded into an MP4 with a manifest and SHA-256.',
      plainPl: 'Kamera tworzy powtarzalne ujęcia, które można zapisać jako sprawdzalny film MP4.',
      plainEn: 'The camera creates repeatable shots that can be saved as a verifiable MP4.',
    },
  ],
  VIRTUAL_LAB: [
    {
      key: 'virtual-lab-scope',
      pl: 'To laboratorium wykonuje dostępne eksperymenty obliczeniowe. Każdy panel powinien rozróżniać dane wejściowe, silnik, wynik i ograniczenia modelu.',
      en: 'This laboratory executes available computational experiments. Each panel separates inputs, engine, result and model limitations.',
      plainPl: 'Tutaj komputer wykonuje model eksperymentu i pokazuje, czym policzył wynik.',
      plainEn: 'Here the computer runs an experiment model and shows what produced the result.',
    },
    {
      key: 'virtual-lab-live',
      pl: 'Animacja pokazuje przebieg możliwy do wyprowadzenia z modelu. Nie oznacza fizycznego pomiaru na żywo, jeśli nie ma podłączonego i skalibrowanego urządzenia.',
      en: 'Animation shows a process supported by the model. It is not a live physical measurement unless a bound and calibrated instrument is present.',
      plainPl: 'Widzisz przebieg modelu. Prawdziwy pomiar wymaga podłączonego urządzenia.',
      plainEn: 'You see the model process. A real measurement requires a connected instrument.',
    },
  ],
  CAMPAIGN: [
    {
      key: 'campaign-loop',
      pl: 'Wybierz kandydata, zapisz hipotezę, zaplanuj eksperyment i uruchom zarejestrowany silnik. Panel pokazuje jego wejście, wykonanie, wynik, propozycję Evidence i replay.',
      en: 'Choose a candidate, state a hypothesis, plan an experiment and run a registered engine. The panel shows input, execution, result, Evidence proposal and replay.',
      plainPl: 'Kandydat przechodzi od hipotezy do prawdziwego obliczenia i sprawdzalnego wyniku.',
      plainEn: 'A candidate moves from hypothesis to a real computation and a verifiable result.',
    },
    {
      key: 'campaign-boundary',
      pl: 'Wynik RDKit, dockingu, ADMET, OpenMM lub PySCF pozostaje wynikiem in silico. Zewnętrzna obserwacja laboratoryjna trafia osobną ścieżką i wymaga niezależnego przeglądu.',
      en: 'An RDKit, docking, ADMET, OpenMM or PySCF result remains in silico. An external laboratory observation uses a separate path and requires independent review.',
      plainPl: 'Obliczenie komputerowe i wynik prawdziwego laboratorium są zawsze rozdzielone.',
      plainEn: 'A computer result and a real laboratory result are always kept separate.',
    },
  ],
  HUMAN_EXPLORER: [
    {
      key: 'human-scope',
      pl: 'Human Explorer używa ogólnego, legalnego modelu referencyjnego. Nie przedstawia anatomii konkretnego pacjenta ani diagnozy.',
      en: 'Human Explorer uses a generic, legally sourced reference model. It does not represent a specific patient or a diagnosis.',
      plainPl: 'To ogólny model człowieka do nauki, nie skan pacjenta.',
      plainEn: 'This is a general human learning model, not a patient scan.',
    },
    {
      key: 'human-action',
      pl: 'Wybierz układ i narząd, odizoluj go, a następnie przejdź do obsługiwanego poziomu mikro. Metadane wskazują źródło i status prezentowanej warstwy.',
      en: 'Select a system and organ, isolate it, then move to the supported micro level. Metadata exposes the source and status of the displayed layer.',
      plainPl: 'Kliknij układ, potem narząd i poziom mikro. Sprawdzaj opis źródła danych.',
      plainEn: 'Click a system, then an organ and micro level. Check the data-source description.',
    },
  ],
};

export function contextualGuideSteps(surface: ContextualGuideSurface): readonly ContextualGuideStep[] {
  return GUIDES[surface];
}
