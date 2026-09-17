# GENESIS — Przewodnik głosowy, Guided Discovery, Genesis Tour (projekt, D-119)

Status: PROJEKT do akceptacji. Nic z tego dokumentu nie jest jeszcze zaimplementowane.
Zasada nadrzędna: głos i UI tylko PROJEKTUJĄ rzeczywisty stan Genesis. Narrator nie mówi niczego,
czego bieżący przebieg nie potwierdza. Żaden wynik naukowy nie zmienia się dla narracji ani obrazu.

## 0. Co już istnieje w repo (i zostaje jedynym silnikiem)

| Warstwa | Istniejący moduł | Rola w przewodniku |
|---|---|---|
| Narracja z realnego stanu | `core/agent/genesisNarration.ts` (`NarrationLine`, fazy INTRO/ACTION/PREDICTION/OBSERVATION/VERDICT/NEXT/CAVEAT) | wzorzec: linie narracji generowane z widoku stanu, nigdy z szablonu bez danych |
| Głos w przeglądarce | `GenesisWorldScreen.tsx` → `speakNarration()` na `window.speechSynthesis` | jedyny dziś dostawca TTS; zostanie wyniesiony do wspólnego `VoiceGuide` |
| Dźwięki zdarzeń | `core/sound.ts` (`playSimStart`, `playAchievement`, `playNarratorEvent`, …) | krótki dźwięk przy potwierdzeniu etapu |
| Oś czasu doświadczenia | `core/lookingGlass/experienceOrchestrator.ts` (`buildExperienceTimeline`, `ExperiencePlayer`: IDLE/PLAYING/PAUSED/FINISHED) | zegar Tour i Guided Mode: ujęcia + linie narracji na jednej osi |
| Kamera | `core/three/graphics/cameraRig.ts`, `cameraSequence.ts`, `cinematicCamera.ts`, `core/three/shotPlanPlayer.ts`, `labScene3D.focusScientific` | ujęcia w światach 3D; Discovery Hall już z tego korzysta |
| Stan przebiegu | `RunResult` + `LowerHarmRunDetail` + `WinnerRecord`/`NoWinnerBlocker` (D-116), `buildDiscoveryHallSequence` (D-117) | jedyne źródło faktów dla narratora |
| Onboarding | `OnboardingOverlay.tsx` (4 kroki, „Pomiń”) | zostaje zastąpiony przez Guided Discovery Mode (te same hooki `onFinish`) |
| Chat | `ScienceChat` + `scienceChatBridge.requestOpenScienceChat(text)` | „Zapytaj Genesis” pisze do tego samego, jednego chatu |

Nie powstaje drugi silnik 3D, drugi narrator ani drugi model stanu.

## 1. Architektura

```
                 ┌──────────────────────────────┐
  RunResult ───▶ │ narrationModel.ts             │  czyste funkcje: stan → NarrationBeat[]
  detail       │ (fakty → beaty: tekst PL/EN,   │  brak DOM, brak głosu, testowalne w node
  winnerRecord │  poziom EXPLORER/SCIENTIST/    │
  replay       │  AUDITOR, akcja UI, ujęcie 3D) │
                 └──────────────┬───────────────┘
                                │ NarrationBeat[]
                 ┌──────────────▼───────────────┐
                 │ guideMachine.ts               │  maszyna stanów sesji przewodnika
                 │ (IDLE→INTRO→ASK→RUNNING→…)    │  czysta, deterministyczna, testowalna
                 └───────┬────────────┬─────────┘
                         │            │
        ┌────────────────▼──┐   ┌─────▼──────────────────┐
        │ voiceEngine.ts     │   │ guideActions.ts         │  VOICE → ACTION → VISUAL
        │ (maszyna głosu:    │   │ (podświetl pole, wpisz  │  reakcje UI na beat: highlight,
        │ speak/pause/resume │   │  przykład, przewiń do   │  focus, scroll, otwórz świat,
        │ /repeat/stop, vol, │   │  bramki, uruchom ujęcie │  uruchom CameraSequence
        │ lang, provider)    │   │  kamery, dźwięk)        │
        └────────┬───────────┘   └─────────────────────────┘
                 │
     ┌───────────▼─────────────┐
     │ providers:               │
     │ BrowserSpeechProvider    │  domyślny, bez klucza (speechSynthesis)
     │ PrerenderedAudioProvider │  pliki audio dla Tour/filmu (głos premium nagrany raz)
     │ CloudTtsProvider (opc.)  │  przez backend, tylko gdy jest klucz — nigdy z frontu
     └──────────────────────────┘
```

Warstwa UI: `GuideOverlay.tsx` (pasek przewodnika: play/pauza/powtórz/głośność/język/wyłącz, napisy,
poziom EXPLORER/SCIENTIST/AUDITOR), `GuideSpotlight.tsx` (podświetlenie elementu + animowany kursor),
`GenesisTourScreen.tsx` (tryb autonomiczny 2–3 min na `#/tour`), przycisk „Wyjaśnij prościej”,
„Follow the evidence” w rekordzie, „Co jeśli?” w światach z symulacją.

## 2. Model narracji (fakty → beaty)

```ts
interface NarrationBeat {
  id: string;                       // 'intro' | 'ask' | 'running' | 'candidates' | 'evidence' | 'falsification' | 'gate' | 'verdict' | 'recipe' | 'replay' | 'world'
  text: { pl: string; en: string }; // krótko, bez żargonu; liczby WSTAWIANE z stanu
  level: 'EXPLORER' | 'SCIENTIST' | 'AUDITOR';
  requires: (state: GuideFacts) => boolean;   // beat istnieje tylko, gdy fakty go potwierdzają
  action: GuideAction;              // co robi UI w tej samej chwili
  shot?: HallShotKind | CameraIntent; // ujęcie w 3D, jeśli beat gra w świecie
  sound?: 'stage' | 'gate' | 'winner' | 'none';
}
```

`GuideFacts` to projekcja z realnego stanu: `candidatesTotal`, `candidatesCleared`, `observations`,
`g2Discriminability`, `conjuncts[]`, `gateOutcome`, `verdict`, `winnerName|null`, `blockedAt|null`,
`recipeFingerprint|null`, `replay: MATCH|DRIFT|null`, `custodyHash|null`. Każda liczba w tekście
pochodzi z tych pól; test sprawdza, że żaden beat nie zawiera literału liczbowego w szablonie.

Przykłady (EXPLORER, PL):
- running: „Genesis analizuje {candidatesTotal} kandydatów.” — tylko gdy `candidatesTotal > 0`.
- verdict WINNER: „Genesis znalazł kandydata spełniającego wymagania tej ścieżki: {winnerName}.” — tylko gdy `winnerRecord.kind === 'WINNER_RECORD'`.
- verdict NO_WINNER: „Tym razem Genesis nie znalazł wyniku spełniającego wszystkie wymagania. Pokazujemy dlaczego: {blockedAt}.” — tylko dla `NoWinnerBlocker`.
- falsification: „Genesis szuka powodu, dla którego jego własna hipoteza może być błędna.” + SCIENTIST: „Test G2 rozdziela dwóch kandydatów z siłą {g2Discriminability}σ.” + „Wyjaśnij prościej”: „Ten test bardzo dobrze rozróżniał obie możliwości.”

Poziomy zmieniają ilość szczegółu, nie fakty: EXPLORER (jedno zdanie), SCIENTIST (+ liczby, nazwy
testów), AUDITOR (+ odciski, hash kustodii, identyfikatory NCT/ChEMBL).

## 3. Maszyna stanów przewodnika (`guideMachine.ts`)

```
IDLE ──start──▶ INTRO ──next──▶ ASK ──question submitted──▶ RUNNING ──run finished──▶ CANDIDATES
   ▲                                                            │ (blocked)                │
   └──────────── stop/exit ◀──────── any state                  ▼                          ▼
                                                            BLOCKED                   EVIDENCE ─▶ FALSIFICATION ─▶ GATE ─▶ VERDICT ─▶ RECIPE(only WINNER) ─▶ REPLAY ─▶ WORLD ─▶ DONE
```
Przejścia zależą wyłącznie od faktów (`run.verdict`, `winnerRecord.kind`, `replay.ok`). Stan
`RECIPE` nie istnieje bez WinnerRecord. `BLOCKED` mówi o `EXECUTION_BLOCKED` wprost.
Tryby: `GUIDED` (użytkownik klika „Dalej”/klika elementy; narrator czeka), `TOUR` (autonomiczny
zegar z `ExperiencePlayer`, pauza/wznów), `FOLLOW_EVIDENCE` (podmaszyna: RESULT→SCORE→OBSERVATION→
EXPERIMENT→SOURCE→HASH→FROZEN ARTIFACT nad `ProvenanceDag`), `WHAT_IF` (podmaszyna w świecie z
forkiem scenariusza: BASELINE vs WHAT-IF, z `scenarioComparison.ts`).

## 4. Maszyna głosu (`voiceEngine.ts`)

```
OFF ──enable──▶ READY ──speak(beat)──▶ SPEAKING ──end──▶ READY
                 ▲                        │ pause ▶ PAUSED ──resume──▶ SPEAKING
                 │                        │ stop  ▶ READY   repeat ▶ SPEAKING (ten sam beat)
                 └── disable (z każdego) ── OFF
```
Ustawienia (persist w localStorage, per użytkownik): `enabled`, `volume 0..1`, `rate 0.9–1.0`,
`lang pl|en`, `provider`, `captions on/off`, `level`. Kolejka: jeden beat naraz; nowy beat przerywa
poprzedni tylko w TOUR; w GUIDED czeka. `prefers-reduced-motion` → bez animowanego kursora, napisy zostają.

Dostawcy głosu — decyzja do podjęcia:
1. `BrowserSpeechProvider` (speechSynthesis): działa od razu, bez klucza, offline; jakość zależy od
   systemu (macOS/iOS mają dobre polskie głosy, Windows/Chrome — przeciętne). Wybieramy najlepszy
   dostępny głos dla języka (`lang`, `localService`, nazwy premium), rate 0.95, pitch 1.0.
2. `PrerenderedAudioProvider`: dla Genesis Tour i filmu nagrywamy raz głos premium (dowolny TTS
   studyjny) do plików `public/voice/{lang}/{beatId}.mp3`; tekst pliku musi równać się tekstowi
   beatu wygenerowanemu z zamrożonego artefaktu `artifacts/lower-harm/*` — test porównuje manifest
   z modelem narracji, więc nagranie nie może „mówić więcej niż dane”.
3. `CloudTtsProvider` (opcjonalnie): backend `/api/voice` z kluczem operatora; frontend nigdy nie
   trzyma klucza. Bez klucza — automatyczny fallback do 1.

## 5. Model interakcji: VOICE → ACTION → VISUAL

Każdy beat ma dokładnie jedną akcję UI wykonywaną w tej samej chwili, co start mowy:
- `ask`: `GuideSpotlight` na `.start-ask-input` / textarea konsoli, animowany kursor, wpisanie
  przykładowego pytania (kanoniczne pytanie LOWER-HARM), przycisk „Użyj tego pytania”.
- `running`: scroll do `PipelineTimeline`, etapy podświetlają się w rytmie realnych `stages`.
- `candidates`: `CandidateSpaceMap` + lista; kliknięcie kandydata otwiera jego dane (istniejące).
- `evidence`: `ProvenanceDag` wjeżdża; kliknięcie źródła podświetla ścieżkę do hashu kustodii.
- `falsification`: pasmo G2 (`g2-band`) animuje rozsunięcie dwóch pasm — z realnych wartości.
- `gate`: trzy bramki `WinnerGateDiagram` otwierają się kolejno TYLKO dla `held === true`; dźwięk
  `gate` przy każdej otwartej, brak dźwięku przy zamkniętej.
- `verdict`: `RunVerdictHero` (WINNER lub NO_WINNER — ta sama waga wizualna).
- `recipe`: `ResearchRecipePanel`; `replay`: `ReplayTwinPanel` po realnym replayu.
- `world`: przejście do Discovery Hall / świata z `CameraSequence` (istniejące ujęcia).

## 6. Guided Discovery Mode (sceny 1–8) i Genesis Tour

Guided: sceny dokładnie jak w briefie; użytkownik może kliknąć, zmienić pytanie lub wpisać własne;
przebieg jest PRAWDZIWY (`runGenesisDomainDiscovery`), więc scena 8 zależy od wyniku.
Tour (`#/tour`, 2–3 min, bez klikania): Question → Discovery → Candidate Space → Evidence →
Falsification → Winner Gate → Winner/NO_WINNER → Research Recipe → Replay → 3D World, na osi
`buildExperienceTimeline`; kamera: `CameraSequence` w Discovery Hall; na wejściu logo (mark),
na wyjściu ujęcie finałowe. Wszystkie liczby i werdykt z przebiegu wykonanego na starcie Tour.

## 7. Zapytaj Genesis (🎙 + tekst)

Mikrointerfejs w pasku i na Starcie: tekst → `requestOpenScienceChat(text)`; mowa → Web Speech
`SpeechRecognition` tam, gdzie istnieje (Chrome/Safari), z jawnym fallbackiem do tekstu. Po
odpowiedzi chatu przewodnik proponuje świat według klasyfikacji pytania (istniejący routing domen:
molekuła → Molecule World, epidemia → Miasto, hipoteza → Konsola, „co jeśli” → świat z forkiem).

## 8. Dostępność

Napisy zawsze dostępne (także przy wyłączonym głosie); wszystkie kontrolki klawiaturą; `aria-live`
dla bieżącej linii; pełna praca bez dźwięku; `prefers-reduced-motion` honorowane; kontrast tokenów
v4 ≥ 4.5:1 dla tekstu; język przewodnika niezależny od języka UI.

## 9. Testy (node, bez DOM — jak reszta repo)

- `narrationModel.test.ts`: dla zamrożonego artefaktu LOWER-HARM beaty zawierają dokładnie
  `12` kandydatów, `2` przez próg, `WINNER — LIRAGLUTIDE`, `MATCH`; dla syntetycznego blokera —
  beat NO_WINNER z `blockedAt`, brak beatu RECIPE; brak literałów liczbowych w szablonach.
- `guideMachine.test.ts`: przejścia tylko na faktach; `RECIPE` niedostępny bez WinnerRecord;
  `BLOCKED` przy `EXECUTION_BLOCKED`; pauza/wznów w TOUR; „powtórz” nie zmienia stanu.
- `voiceEngine.test.ts` z fałszywym dostawcą: kolejka, pauza, głośność, wyłączenie, fallback.
- `prerenderedManifest.test.ts`: każdy plik audio ma tekst równy beatowi z artefaktu.
- Smoke: `#/tour` i Guided bez błędów runtime, desktop i telefon.

## 10. Scenariusz demo i film

Film „Poznaj Genesis” po wdrożeniu przewodnika: nagranie `#/tour` (`genesis-investor-demo-capture.mjs`
rozszerzony o Tour), z głosem z `PrerenderedAudioProvider`, bez napisów wymuszonych przez skrypt —
napisy z `GuideOverlay`. Sekwencja: logo → głos → pytanie → świat → discovery → evidence →
falsification → Winner Gate → Winner/NO_WINNER → Research Recipe → Replay → ujęcie finałowe.

## 11. Kolejność wdrożenia

1. `narrationModel.ts` + testy (fakty → beaty, trzy poziomy, PL/EN).
2. `voiceEngine.ts` + `BrowserSpeechProvider` + `GuideOverlay` (sterowanie, napisy) + testy.
3. `guideMachine.ts` + `guideActions.ts` + `GuideSpotlight` → Guided Discovery Mode w konsoli
   (zastępuje OnboardingOverlay).
4. Genesis Tour na `ExperiencePlayer` + `CameraSequence` w Discovery Hall.
5. Follow the Evidence nad `ProvenanceDag`; „Wyjaśnij prościej”; poziomy odbiorców.
6. What If w Mieście (fork scenariusza z istniejącego `scenarioComparison`).
7. Zapytaj Genesis (🎙) i propozycja świata.
8. Nagrania premium (manifest + test) i film.

## 12. Weryfikacja pakietu „GENESIS-MULTIVERSE-HARDWARE” (Qwen)

Werdykt: NIE INTEGROWAĆ teraz. Powody:
- To symulator urządzeń z fikcji (laser „Paycheck”, „Dark Matter Box”, dawka tłumiąca obserwatora).
  Nawet z etykietą FICTION stoi obok światów z realnymi danymi i rozmywa granicę, na której opiera
  się wiarygodność Genesis u inwestora. Jest też wprost sprzeczny z bieżącym poleceniem
  „nie buduj przypadkowych nowych modułów”.
- To nie jest „Looking Glass”: Looking Glass w repo to realna konsola obserwacji (zdanie → intencja
  kamery → plan ujęć nad prawdziwym przebiegiem). Pakiet dzieli z nim tylko ideę kamer.
- Techniczne niezgodności: `node:crypto` w kodzie przeglądarki; własna pętla `WebGLRenderer`
  zamiast `Sim3D`/`useThreeLoop` (drugi silnik); style inline zamiast systemu v4; własny słownik
  etykiet (`SCENARIO`, `POC`) zamiast słownika epistemicznego repo; brak trasy, menu, testu
  osiągalności; test czyta plik po ścieżce zależnej od cwd.
Jeśli mimo to ma wejść później: jako jawny sandbox „FIKCJA — symulacja koncepcji” w „Wszystkie
moduły”, przepisany na `Sim3D`, `fnv1a/canonicalJson` z repo, słownik epistemiczny i design v4.
