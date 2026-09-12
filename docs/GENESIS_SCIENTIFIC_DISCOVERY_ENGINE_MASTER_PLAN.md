# GENESIS SCIENTIFIC DISCOVERY ENGINE — MASTER PLAN

**Data:** 2026-09-12 · **Autor:** C1 · **Gałąź:** `claude/genesis-autonomous-completion-95bt4e`
**Podstawa:** PHASE 0 — trzy równoległe audyty kodu (nie deklaracji), każde twierdzenie z `plik:linia`.

**ZASADA TEGO DOKUMENTU.** Rozdzielam to, co ZWERYFIKOWAŁEM czytaniem kodu, od tego, co
WNIOSKUJĘ, i od tego, co jest ZAPROJEKTOWANE, ale nieuruchomione. Nic tutaj nie jest oznaczone
DONE bez uruchomienia. Raport Qwena i raporty Solar Mind traktuję jako hipotezy o repo, nie jako
prawdę — trzy z nich poniżej okazały się nietrafione i to jest odnotowane.

---

## 1. CURRENT STATE (zweryfikowany)

Genesis ma **działający, przetestowany szkielet naukowy**, ale nie ma pętli odkrycia. Co realnie
istnieje i jest uruchamiane z produkcji:

| Warstwa | Moduł | Status |
|---|---|---|
| Wykonanie eksperymentu | `experimentFabric/executor.ts` — 57 zarejestrowanych modeli, `runExperiment` | DZIAŁA |
| Rejestr modeli | `experimentFabric/router.ts:43-480` | DZIAŁA |
| Proweniencja + odciski | `experimentFabric/provenance.ts` (`requestFingerprint`/`planFingerprint`/`runFingerprint`) | DZIAŁA |
| Falsyfikacja relacji | `experimentFabric/falsificationRelation.ts` | DZIAŁA, z poprawnym `applicable` |
| Rewizja przekonań | `experimentFabric/beliefRevision.ts:107` — log-odds, ograniczone [0,01; 0,99] | DZIAŁA, 2 konsumentów produkcyjnych |
| Pętla hipotez | `experimentFabric/hypothesisLoop.ts` | DZIAŁA (`#/pilot`) |
| Pętla dochodzenia | `agent/inquiryLoop.ts` | DZIAŁA (`#/inquiry`) |
| Kalibracja parametru | `agent/worldParameterCalibration.ts` | DZIAŁA (`#/calibration`) |
| Trzy strategie | `agent/discoveryStrategies.ts` — MECHANISM / PARAMETER / CALIBRATION | WSZYSTKIE TRZY uruchamiane |
| Wybór następnego pytania | `agent/nextQuestion.ts:149` | DZIAŁA — JEDNA ścieżka produkcyjna |
| Konflikt modeli | `core/mcre.ts` | DZIAŁA (`#/conflict`) |
| Pamięć naukowa | `core/scienceMemory.ts` | DZIAŁA |
| Replay | `matrixFoundation/replayVerdict.ts` + 4 warianty domenowe | DZIAŁA |

**Osiągalność:** 622 z 657 modułów produkcyjnych osiągalnych z `main.tsx`; 35 w allowliście, każdy
z powodem (`__tests__/moduleReachability.test.ts`).

---

## 2. TARGET STATE

```
NIEROZWIĄZANY PROBLEM → FORMALIZACJA → WYSZUKANIE WIEDZY/DOWODÓW →
GENEROWANIE HIPOTEZ → KONKURENCYJNE HIPOTEZY → MODEL → RÓWNANIA →
PREDYKCJE → NASTĘPNY NAJLEPSZY EKSPERYMENT → WYKONANIE → DOWÓD →
FALSYFIKACJA → REWIZJA PRZEKONAŃ → PAMIĘĆ → NASTĘPNE PYTANIE → KAMPANIA
```

Z 15 etapów **9 istnieje i działa**, 3 istnieją w formie okrojonej, 3 nie istnieją. Szczegóły w §3.

---

## 3. VERIFIED GAPS (i co NIE jest luką)

### G1 [ZWERYFIKOWANA, NAPRAWIONA] „nierozstrzygalne" czytane jako „sfalsyfikowane"
`discovery/discoveryConclusion.ts:44` zwijało `outcome.applicable && outcome.met` w jeden bool, więc
kryterium, którego nie dało się rozstrzygnąć (relacja monotoniczna na dwóch ramionach, albo brakująca
metryka), dawało werdykt `NOT_SUPPORTED`. **Naprawione** (commit `9963592`): `applicable` jest osobnym
polem, nierozstrzygalne pierwotne kryterium daje `INSUFFICIENT_EVIDENCE`. Trzy istniejące testy pinowały
ten defekt mimo że ich NAZWY mówiły „refuses" — poprawione z uzasadnieniem w miejscu.
Dotkliwość uczciwie: LATENTNA, nie czynna (jedyny produkcyjny caller ma `relation: 'less-than'` na sztywno).

### G2 [ZWERYFIKOWANA — RAPORT QWENA NIETRAFIONY] monotonic w `deriveAlternativeCriteria`
**REFUTED, po raz drugi w tej sesji.** Ścieżka realna: `falsificationRelation.ts:61-68` zwraca
`applicable:false` → `worldCounterfactual.ts:566` → `INCONCLUSIVE` → `:690-699` emituje
`RELATION_NEEDS_SERIES` z gotowym następnym eksperymentem. `deriveAlternativeCriteria` jest bramkowane
na `FALSIFIED_WITHIN_PROTOCOL`, którego relacja monotoniczna nigdy nie osiąga — brak gałęzi jest
KONSEKWENCJĄ projektu, nie dziurą. Falsyfikacja nie kończy się po cichu; kończy się głośno
nierozstrzygnięta z nazwanym następnym krokiem.

### G3 [ZWERYFIKOWANA] prerejestracja jest anty-manipulacyjna, nie anty-HARKing
`hypothesisLoop.ts:299` ustawia `createdBeforeRun: true` **bezwarunkowo**. Odcisk (`:301-305`) nie
zawiera ani `createdAt`, ani żadnego id/odcisku przebiegu. Dowodzi więc: „ten tekst nie zmienił się od
zahaszowania" — i nic o TYM, KIEDY powstał względem danych. Sekwencja „uruchom → zobacz wyniki → napisz
`candidateValues` → prerejestruj → wykonaj" produkuje rekord bit-identyczny, „nienaruszony",
`createdBeforeRun: true`. To jest realna luka i jest dokładnie tym, co prompt nazywa P1.

### G4 [ZWERYFIKOWANA] generowanie hipotez nie jest generowaniem
`generateCompetingHypotheses` (`hypothesisLoop.ts:201-268`) nie czyta żadnych obserwacji, dowodów ani
wcześniejszych przebiegów. Rozwija zadeklarowaną tablicę `candidateValues` w szablony. Plik mówi to o
sobie wprost (`:22-29`). `inquiryLoop` hipotezy DOSTAJE. Jedyny kod, który TWORZY nową wartość, to
interpolacja środka przedziału (`parameterAlternative.ts:240`, `intervalNarrowing.ts:233`).
**To nie jest wada ukryta — jest udokumentowana. Ryzykiem jest czytelnik biorący NAZWY funkcji za dobrą monetę.**

### G5 [ZWERYFIKOWANA] brak jakiegokolwiek scoringu wartości eksperymentu
Nie ma KL, informacji wzajemnej, oczekiwanej redukcji entropii, projektowania bayesowskiego. Jest
**boolowska rozróżnialność**: `beliefRevision.ts:180` `checkDiscriminability`, `inquiryLoop.ts:455`
`selectNextProbe` — bierze PIERWSZY probe, który rozdziela dwie czołowe hipotezy, w kolejności
deklaracji. `hypothesisLoop.ts:646-650` jawnie ODMAWIA scoringu: „nie ma metodologii, która by go
uzasadniła". Jedyne pole `expectedInformationGain` (`cyberTestPlanner.ts:128`) to iloczyn dwóch
ręcznie wpisanych stałych i plik sam nazywa to heurystyką.
**Wniosek: to nie jest luka do zaklejenia byle czym. Scoring bez uzasadnionej metodologii byłby regresem.**

### G6 [ZWERYFIKOWANA] `epistemicStatus` = sześć osi w jednym polu
`scienceMemory.ts:267-283`: unia sześciu nazwanych osi + dziesięć literałów ad-hoc. Kolizje realne:
`HYPOTHESIS` należy do TRZECH osi; `SIMULATION` i `DataProvenance.SIMULATED` to to samo pojęcie w
dwóch pisowniach (plik przyznaje to w `:236-240`). Istnieje 11+ innych słowników epistemicznych,
z czego **cztery są genuinnie ortogonalne** (`ReplayVerdict`, `DataProvenance`, `GroundingLevel`,
`AdmissionStatus`), a trzy to redundantne rankingi „jak ustalone jest twierdzenie"
(`ConfirmationLevel` / `EpistemicStatus` / `KnowledgeEpistemicStatus`).

### G7 [ZWERYFIKOWANA] `generateAlternativeHypotheses` — realna sierota
`worldCounterfactual.ts:918`, zero konsumentów produkcyjnych, przyznane w jego własnej dokumentacji
(`:874-917`, nagłówek „Read this before looking for the caller — there isn't one"). Jego rdzeń
`deriveAlternativeCriteria` JEST osiągalny (`discoveryLoop.ts:623`).

### G8 [ZWERYFIKOWANA — RAPORT QWENA NIETRAFIONY] konsumenci `selectNextResearchQuestion`
Raport twierdził trzech konsumentów. Faktycznie: `researchChain.ts:308` jest TYLKO testowy,
`discoveryTrace.ts:192` jest TYLKO testowy, `WorldDiscoveryPanel.tsx` NIE wywołuje go bezpośrednio.
Istnieje **dokładnie jedna** ścieżka produkcyjna: `WorldDiscoveryPanel → runMechanismResearchChain
(researchChain.ts:547) → selectNextResearchQuestion`.

### G9 [ZWERYFIKOWANA] brak starzenia dowodów — i to jest w porządku
Nie ma nigdzie mechanizmu staleness/decay/TTL dla przekonań. `Hypothesis` nie ma nawet znacznika czasu.
Jedyne miejsce rozumujące o wieku (`crossDomainSynthesis.ts:609-613`) ODWRACA recency: wiek służy do
wykrywania zaniedbania, nie do dyskontowania pewności. **NIE dodawać warstwy starzenia** — stała
rozpadu bez uzasadnienia byłaby dokładnie tym, czego repo słusznie odmawia. Brakuje natomiast KOMENTARZA,
który to mówi wprost; to jedyna akcja tutaj.

---

## 4. EXISTING COMPONENTS TO REUSE (nie budować od nowa)

`runExperiment` · `router.ts` (rejestr modeli) · `provenance.ts` (wszystkie odciski) ·
`falsificationRelation.ts` · `beliefRevision.ts` (log-odds) · `hypothesisLoop.ts` · `inquiryLoop.ts` ·
`worldParameterCalibration.ts` · `discoveryStrategies.ts` (3 strategie, jeden kontrakt `StrategyRun`) ·
`nextQuestion.ts` · `nextAction.ts` (7 adapterów) · `scienceMemory.ts` · `core/mcre.ts` ·
`replayVerdict.ts` · `StrategyRunReport.tsx` (jeden renderer na trzy strategie) ·
`core/quantum/entanglementMeasures.ts` (nowa warstwa miar).

---

## 5. COMPONENTS TO EXTEND

| Co | Jak | Dlaczego |
|---|---|---|
| `hypothesisLoop.ts` prerejestracja | dodać do odcisku kotwicę czasową/przebiegową (G3) | odróżnić przed-danymi od po-danych |
| `router.ts` + `executor.ts` | zarejestrować modele splątania (QE1–QE3) | jedyny warunek dopuszczenia przez strategię PARAMETER to `getRouterModel(id) !== undefined` (`discoveryAdmission.ts:109-126`) |
| `scienceMemory.ts` `epistemicStatus` | warstwa zgodności + jeden kanoniczny słownik (G6) | bez łamania danych |
| `StrategyRunReport.tsx` | bez zmian — już obsługuje trzy strategie | — |

## 6. COMPONENTS NOT NEEDED

- **Drugi planer badań.** `nextQuestion.ts` istnieje; wpiąć, nie duplikować.
- **Drugi silnik konfliktów.** Jest siedem detektorów; zintegrować, nie dodawać ósmego.
- **Warstwa starzenia dowodów** (G9).
- **Scoring EIG bez metodologii** (G5) — dopóki nie ma uzasadnienia, boolowska rozróżnialność jest uczciwsza.
- **Osobny Solar Engine.** Solar to KONSUMENT pętli, nie wyspa.
- **Osobny „Entanglement Lab".** `labs/experiments/quantum-chsh.ts` już jest.

---

## 7. ARCHITECTURE

```
                     ┌──────────────────────────────────┐
                     │  DOMAIN KNOWLEDGE (knowledge/*.md)│
                     └───────────────┬──────────────────┘
                                     │
  PROBLEM ──► HypothesisProblem / SystemUnderStudy / WorldParameterCalibrationInput
                                     │
                     ┌───────────────▼──────────────────┐
                     │  discoveryStrategies.ts          │
                     │  MECHANISM · PARAMETER · CALIBRATION│
                     │  admit() → AdmissionStatus        │
                     └───────────────┬──────────────────┘
                                     │  runExperiment (router + executor)
                     ┌───────────────▼──────────────────┐
                     │  falsificationRelation → applicable/met │
                     │  beliefRevision (log-odds, bounded)     │
                     └───────────────┬──────────────────┘
                                     │  StrategyRun (JEDEN kontrakt)
                     ┌───────────────▼──────────────────┐
                     │ StrategyRunReport · scienceMemory │
                     │ nextQuestion · mcre · replay      │
                     └──────────────────────────────────┘
```

Domeny (Solar, Quantum, Particle, Chemistry, Biology) wpinają się **wyłącznie** jako:
(a) model w `router.ts` + `executor.ts`, (b) `HypothesisProblem` lub `SystemUnderStudy`, (c) ekran
czytający `StrategyRun`. Żadna domena nie dostaje własnej pętli.

## 8. DATA FLOW

```
parametry (płaskie prymitywy, max 24) → validateStructuredExperimentRequest
 → createExperimentIntent → createExperimentPlan → executeRealModel
 → ExperimentResult { outputs, units, warnings, validity, assumptions }
 → createExperimentProvenance → runFingerprint = fnv1a(request+plan+status+outputs+units+warnings)
 → ExperimentRun → pętla (hypothesis/inquiry/calibration) → StrategyRun → pamięć + replay
```

**Ograniczenie kontraktu, istotne dla QE:** `ExperimentValue = number | string | boolean`. Macierzy
gęstości NIE da się przekazać jako obiektu. Precedens w repo: `quantum-bloch-circuit` przekazuje
strukturę jako JEDEN string (`router.ts:474-479`, `executor.ts:801-803`). QE1–QE3 pójdą tą drogą:
`stateId` jako nazwany preset + parametr rodziny jako liczba.

## 9. CONTRACTS

Przepis na nowy model (zweryfikowany na `particle-newtonian-energy`, commit `ea22c8b`):
1. Solver (`core/modelGraph/*Graph.ts` z `unit`/`honesty`/`honestyNote`/`formula` per węzeł).
2. Wpis w `ROUTER_MODELS` (`router.ts`).
3. `case '<id>':` w `executor.ts` zwracający pełny `ExperimentResult`.
4. Dopisanie id do `realModels` domeny w `core/knowledge/registry.ts`.
5. Opcjonalnie: regex w `parser.ts`, `HypothesisProblem`, `SystemUnderStudy`.
6. Testy.

Bramki, które to wymuszą: `realEngineExecutorCoverage.test.ts:39-50` (każdy model musi dać
`status: 'completed'` na własnych domyślnych), `discoveryAdmission.test.ts:68-69` (każdy musi dopuszczać
się jako REAL), `capabilityAdmission.ts:51-66`.

## 10. IMPLEMENTATION PHASES

- **PHASE 0 — audyt** ✅ WYKONANY (trzy równoległe audyty, §3).
- **PHASE 1 — domknięcie luk logicznych.** G1 ✅ · G3 · G6 · komentarz do G9.
- **PHASE 2 — QE1→QE2→QE3 przez prawdziwy StrategyRun.** Kolejno, każde z pełnym cyklem.
- **PHASE 3 — warstwa matematyczna.** Analiza wymiarowa, propagacja niepewności — dopiero po PHASE 2.
- **PHASE 4 — domeny.** Solar (H051–H056 mają realne zdarzenia do falsyfikacji), reszta.

## 11. TEST STRATEGY

Każdy komponent: test czerwony PRZED implementacją. Wartości porównywane z **postacią zamkniętą**,
nigdy z wyjściem własnego modułu — ta reguła złapała w tej sesji trzy moje własne błędy
(√2 w pierwiastku hermitowskim, założenie o rozjeździe PPT/CCNR, regex w teście dome).
Do tego: `moduleReachability.test.ts` (żadnej nowej sieroty) i `orphanModuleWiring.test.ts`
(podpięte DLA SWOJEGO CELU, nie dla sweepa).

## 12. DEMONSTRATOR (Definition of Done dla silnika)

Jeden przebieg, w którym Genesis **może przegrać**:
UNKNOWN PROBLEM → ≥2 konkurencyjne hipotezy → predykcje → eksperyment → realne obliczenie →
dowód → PRÓBA FALSYFIKACJI → zmiana przekonania → następne pytanie.
Z proweniencją, odciskiem deterministycznym, replayem i statusem epistemicznym.
**Stan dziś:** `#/inquiry` i `#/calibration` realizują 7 z 9 ogniw na realnych solverach; brakuje
generowania hipotez (G4) i kotwicy anty-HARKing (G3).

## 13. DOMAIN EXPANSION STRATEGY

Solar, Quantum, Matter, Chemistry, Biology = konsumenci. Pakiety wiedzy (Solar Mind, Entanglement,
Collider) wchodzą do `knowledge/*.md` jako DANE z klauzulą weryfikacji cytowań, a ich hipotezy
wchodzą jako `HypothesisProblem`/`SystemUnderStudy` — nigdy jako nowy silnik.

## 14. RISKS

- **Nazwy funkcji obiecują więcej niż robią** (G4) — największe ryzyko reputacyjne przy grancie.
- **Sześć osi w `epistemicStatus`** (G6) — konsument czytający goły string nie wie, którą oś czyta.
- **Pokusa dodania scoringu EIG** bez metodologii (G5).
- **Przyjmowanie raportów Qwena bez weryfikacji** — trzy z nich w tym audycie były nietrafione.

## 15. DEPENDENCIES

Rejestracja modelu zależy od: `router.ts` → `executor.ts` → `registry.ts`. Strategia PARAMETER zależy
WYŁĄCZNIE od obecności modelu w rejestrze. Pętla synchroniczna (`runExperiment`) **nie wykona** modelu
`BACKEND_REAL_ENGINE` — dopuszczenie zwróci REAL, a pomiar padnie jako `MEASUREMENT_FAILED`. Modele QE
muszą być lokalne i zamknięte analitycznie.

## 16. PRIORITY MATRIX

| P | Pozycja | Stan |
|---|---|---|
| P0 | G1 — „nierozstrzygalne" ≠ „sfalsyfikowane" | ✅ ZROBIONE, zweryfikowane |
| P0 | QE1→QE2→QE3 przez prawdziwy StrategyRun | W TOKU |
| P0 | G3 — kotwica anty-HARKing w prerejestracji | ZAPROJEKTOWANE |
| P1 | G6 — kanoniczny słownik epistemiczny + warstwa zgodności | ZAPROJEKTOWANE |
| P1 | G4 — kontrakt generowania hipotez świadomego obserwacji | ZAPROJEKTOWANE |
| P1 | Solar H051–H056 jako `HypothesisProblem` | ZAPLANOWANE |
| P2 | Warstwa matematyczna (§10 PHASE 3) | ZAPLANOWANE |
| P2 | Solar Visualizer 3D | ZAPLANOWANE |

## 17. CONCRETE COMMIT PLAN

1. `9963592` ✅ P0 G1 + CCNR + stan związany Horodeckich.
2. QE1: model `quantum-entanglement-measures` w router+executor+registry, `SystemUnderStudy`, ekran.
3. QE2: monogamia jako drugi problem nad tym samym modelem.
4. QE3: stan związany jako trzeci — z realną możliwością obalenia „PPT wystarcza".
5. G3: kotwica anty-HARKing + test.
6. G6: kanoniczny słownik + migracja bez łamania danych.

## 18. DEFINITION OF DONE

Nie wolno oznaczyć niczego jako DONE bez: uruchomionego testu, pełnej bramki
(tsc/eslint/build/vitest/smoke) i — dla ekranu — realnego screenshotu z Chromium.
Raportować osobno: IMPLEMENTED · TESTED · RUNTIME VERIFIED · E2E VERIFIED · NOT VERIFIED ·
DESIGNED · PLANNED · BLOCKED.

---

## ZAŁĄCZNIK — MAPA ZALEŻNOŚCI DLA NOWEGO KOMPONENTU

```
nowy model naukowy
  ├─ core/modelGraph/<x>Graph.ts        (solver, jednostki per węzeł)
  ├─ experimentFabric/router.ts         (ROUTER_MODELS — wpis)
  ├─ experimentFabric/executor.ts       (case → ExperimentResult)
  ├─ core/knowledge/registry.ts         (realModels domeny)
  └─ [opcjonalnie] hypothesisLoop.ts HYPOTHESIS_PROBLEMS
                   agent/<x>Inquiry.ts  SystemUnderStudy
         ↓ automatycznie, bez dodatkowego kodu:
      discoveryAdmission → strategia PARAMETER/CALIBRATION
      provenance → odciski → replay
      beliefRevision → aktualizacja przekonań
      StrategyRunReport → ekran
```
