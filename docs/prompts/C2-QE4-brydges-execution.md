# PROMPT DLA C2 — kontynuacja własnego pakietu: wykonanie QE4 na danych Brydgesa (Zenodo 2527010)

Gałąź: `claude/genesis-autonomous-completion-95bt4e`. **UWAGA: ta gałąź porusza się szybko —
zanim zrobisz cokolwiek, wykonaj `git fetch origin claude/genesis-autonomous-completion-95bt4e`
i porównaj z commit `73f79cf` (stan na chwilę pisania tego promptu). Jeśli tip jest inny, przeczytaj
NAJNOWSZE commity dotyczące `qe4`/`Brydges`/`QE4_PREREGISTRATION` PRZED przyjęciem czegokolwiek
poniżej za aktualne — poniższy opis „co już jest zrobione" może być już częściowo nieaktualny.**

To jest KONTYNUACJA Twojego własnego zadania `QE4_REAL_DATASET_AND_EXPERIMENT.md` (dostarczonego
jako dokument w rozmowie — sprawdź, czy jest już w repo, patrz Krok 0). Werdykt z tamtego etapu:
PARTIAL — ścisły test QE4 (prawo powierzchni / log-CFT ze STANU PODSTAWOWEGO, niezależnym kanałem
c) jest `BLOCKED` na tym zbiorze (dane Brydgesa to stany DYNAMICZNE po quenchu w modelu z
oddziaływaniem dalekozasięgowym, brak niezależnego kanału c/gap) — ale PREREJESTROWANY wycinek
strukturalny + walidacja pipeline'u (P1–P4 z Twojego dokumentu) jest `READY FOR GENESIS EXECUTION`.
To zadanie to wykonanie TEGO wycinka, uczciwie, bez rozszerzania zakresu na ścisły test, który sam
nazwałeś BLOCKED.

## Krok 0 — zapisz własny dokument do repo, jeśli jeszcze go nie ma

`git log --oneline -- docs/QE4_REAL_DATASET_AND_EXPERIMENT.md`. Jeśli pusto: zapisz dokument
DOSŁOWNIE pod tą ścieżką, z nagłówkiem zachowanym („Scope: research only. No production code...").
To jest zapis kontraktu prerejestracji (sekcje 8–13: predykcje P1–P4, tolerancje, dekompozycja
tautologii, kryteria falsyfikacji) — MUSI być zamrożony w repo z hashem commita ZANIM policzysz
cokolwiek na danych. Jeśli commit `73f79cf` (albo nowszy) już wspomina `QE4_PREREGISTRATION.md` —
sprawdź czy ten plik już istnieje i czy pokrywa tę samą treść; jeśli tak, nie duplikuj, tylko go
przeczytaj i kontynuuj od niego.

## STAN NA `73f79cf` — Faza 0 (pozyskanie i przypięcie danych) już ZROBIONA, w całości

Nie rób tego drugi raz. Na commit `73f79cf` w repo jest już:

- **Wszystkie 29 realnych plików Brydgesa przypięte**, bajtowo zweryfikowane przez CI (fetch z
  `zenodo.org/api/records/2527010`, odczyt logów joba, SHA-256 per plik) — pod
  `packages/frontend/src/core/biotechData/qe4-brydges/`:
  `10Ions_CleanSystem/{MeasuredStates,RenyiEntropy}_T_{0..5}ms.csv` +
  `RenyiEntropyAllPartitions_T_5ms.csv`, `10Ions_withDisorder/{MeasuredStates,RenyiEntropy}_T_{1,2,4,6,10,16,20}ms.csv`
  (rekordy pogrupowane w bloki po 10 = jedna realizacja nieporządku na blok, potwierdzone z
  `.docx`), `Fig1a/{PureState,MixedState}.csv`, `zenodo-record.json`, `manifest.json` (pełna
  prowieniencja: DOI, licencja, joby CI, SHA-256 każdego pliku).
- **Oba Twoje `[VERIFY]` z sekcji 18 dokumentu ROZWIĄZANE**: licencja = **CC-BY-4.0** (nie
  placeholder), `.docx` potwierdza że `MeasuredStates_*.csv` to SUROWE dekadowo zakodowane wyniki
  10-bitowego pomiaru projekcyjnego (0–1023) — nie przetworzone.
- Trwały job CI `qe4-brydges-verify-pinned` w `ci.yml` (analogiczny do
  `kepler-solar-system-pinned-artifact`) — świeży fetch porównywany z przypiętą kopią, kontrola
  dryfu na każdym pushu.

**Twoje zadanie zaczyna się TUTAJ: implementacja estymatora + prerejestracja + Tautology Gate +
werdykty P1–P4.** Nie fetchuj niczego ponownie, nie zmieniaj plików w `qe4-brydges/` (chyba że
znajdziesz w nich realny błąd — wtedy dokumentuj dlaczego, z dowodem).

## Implementacja — jedna wąska funkcja, nie nowy silnik

`entanglementMeasures.ts::renyiEntropy(rho, alpha)` liczy Rényi DOKŁADNIE z macierzy gęstości —
**to NIE jest to, czego potrzebujesz.** Potrzebujesz ESTYMATORA S₂ z SUROWYCH próbek losowego
pomiaru (randomized-measurement cross-correlation estimator, [[2]][[3]] z Twojego dokumentu:
odczytujesz `MeasuredStates_T_Xms.csv`, każdy wiersz to jedna losowa baza pomiarowa, każda kolumna
jeden strzał; estymator S₂ liczy korelacje krzyżowe między parami strzałów tej samej losowej
bazy). To jest inna operacja niż algebra na znanej macierzy — napisz ją jako JEDNĄ nową, wąsko
zdefiniowaną funkcję (np. `randomizedMeasurementRenyi2(samples): {value, sigma}` w nowym pliku
`core/quantum/randomizedMeasurementEstimator.ts` albo dopisaną do `entanglementMeasures.ts` —
zdecyduj, ale NIE buduj wokół tego nowego „silnika" z własnym stanem). Bootstrap (sekcja 12
dokumentu) jest częścią tej samej funkcji/modułu, nie osobnym komponentem.

## Prerejestracja i Tautology Gate — reużyj to, co JUŻ ISTNIEJE

- **Prerejestracja**: `FalsificationCriterion` (`experimentFabric/scientificDiscovery.ts`) — ten
  sam typ, którego używa `externalAnchor.ts`. P1–P4 to CZTERY kryteria (albo jedno z czterema
  komponentami), każde z `tolerance`/`rationale` zamrożonym PRZED odczytaniem
  `RenyiEntropy_*.csv` (te pliki są już w repo jako REFERENCE-only, patrz manifest — nie czytaj
  ich do liczenia predykcji, tylko do P4).
- **Tautology Gate — to jest dokładnie przypadek, dla którego istnieje wielo-komponentowy
  `assessTautology(components)`** (`core/agent/tautologyGate.ts`, NIE `assessSingleTautology`,
  którego używa `externalAnchor.ts` dla pojedynczej pary). Twoja sekcja 10 dokumentu (warstwa
  algebry = `CONSISTENCY_CHECK` waga 0; warstwa empiryczna = realne `MeasuredStates` + odtworzone
  S₂) mapuje się WPROST na `TautologyComponent[]` → oczekiwany wynik `MIXED_TEST`. Przeczytaj
  komentarz przy `evidenceCeiling('MIXED_TEST')` (`tautologyGate.ts` ~linia 224) — zwraca `null`
  CELOWO: musisz sam, jawnie, ograniczyć ruch przekonania per-komponent (`components` w wyniku),
  nie użyć jednego zagregowanego sufitu jak w kotwicach P2.3.
- **Falsyfikacja/werdykt**: `verifyPredictionAgainstRealExperiment`/`predictionVerification.ts` —
  ten sam prymityw dla KAŻDEGO z P1–P4 osobno (cztery werdykty, nie jeden zbiorczy).
- **NIE reużywaj `runExternalAnchor`/`ExternalAnchor` z `externalAnchor.ts` wprost** — ten kontrakt
  zakłada JEDNĄ predykcję i JEDNĄ obserwację na uruchomienie; QE4 ma cztery niezależne predykcje na
  tym samym zbiorze danych. Jeśli po przeczytaniu kodu uznasz, że da się go uczciwie rozszerzyć —
  udokumentuj dlaczego; jeśli nie, nowy, mały moduł `qe4BrydgesExecution.ts` jest uzasadniony
  (reużywający `FalsificationCriterion`, `assessTautology`, `verifyPredictionAgainstRealExperiment`,
  `beliefRevision.ts` — zero nowej logiki werdyktu).

## Zakaz, którego pilnujesz sam wobec siebie

Twoja sekcja 17 („co NIE liczy się jako odkrycie") i sekcja 13 (audyt cyrkularności) już nazywają
pułapkę: NIE porównuj wyników do `*_Numerics_*.csv` (jeśli w ogóle przypięte — sprawdź manifest;
jeśli nie ma ich w repo, tym lepiej, nie musisz się przed nimi bronić) ani do sparametryzowanych
krzywych Hamiltona z publikacji — to współdzieli kalibrację aparatu z danymi (cyrkularność).
Jedyne dozwolone porównanie: odtworzone S₂ (z Twojego estymatora na surowych `MeasuredStates`)
przeciw OPUBLIKOWANYM `RenyiEntropy_*.csv` (P4, kontrola integralności pipeline'u) i przeciw
prerejestrowanym progom uniwersalności (P1–P3, nie liczbom z symulacji autorów).

## TDD i weryfikacja

1. Test na czerwono najpierw: estymator na znanym, ręcznie policzalnym przypadku (np. próbka z
   jednorodnym rozkładem odpowiadająca znanej czystości) PRZED podłączeniem prawdziwych danych.
2. Testy P1–P4 na realnych, przypiętych CSV (już w repo — patrz wyżej) — czerwone przed
   implementacją logiki werdyktu.
3. Regresja: `externalObservationAnchor.test.ts`, `keplerExternalAnchor.test.ts`, QE1–QE3
   (`scripts/inquiry-e2e.mjs`) muszą zostać nietknięte — to nie jest ich domena.
4. `docs/RISKS.md`, `docs/MASTER_PRIORITY_GENESIS.md`, `docs/DECISIONS.md` — wpis z realnym
   dowodem (komenda+wyjście+hash), stan `MIXED_TEST` nazwany wprost, i jasne zdanie że ścisły test
   QE4 (ground-state) POZOSTAJE `BLOCKED` (to NIE jest to samo zadanie — nie myl czytelnika).

## ZASADY TWARDE

1. Dowód = komenda + wyjście + hash commita.
2. `git fetch` przed KAŻDYM pushem — inne sesje (C1 na CMS, C3 na QE5-7) pchają równolegle na tę
   samą gałąź, a QE4 samo już pokazało, że może się zmieniać w ciągu minut.
3. Zero nowego silnika tam, gdzie `tautologyGate.ts`/`predictionVerification.ts`/
   `beliefRevision.ts`/`scientificDiscovery.ts` się nadają.
4. Nie fabrykuj: jeśli coś w danych okaże się niezgodne z tym, co zakładał dokument badawczy —
   zgłoś `BLOCKED`/`INCONCLUSIVE` z dowodem, nie improwizuj.
5. Pełna bramka przed pushem: eslint, tsc, oba suite'y, build, `node scripts/repro-demo.mjs`.

## DONE

- `docs/QE4_REAL_DATASET_AND_EXPERIMENT.md` w repo (jeśli jeszcze nie było).
- Estymator S₂ z surowych próbek zaimplementowany, przetestowany na znanym przypadku.
- P1–P4 uruchomione realnie na już przypiętych danych: werdykt per predykcja, `assessTautology` →
  `MIXED_TEST` z nazwanymi komponentami, bootstrap σ policzony.
- Ścisły test QE4 (ground-state/log-CFT z niezależnym c) NADAL jawnie `BLOCKED` w dokumentacji —
  to zadanie go NIE zamyka i nie udaje, że zamyka.
