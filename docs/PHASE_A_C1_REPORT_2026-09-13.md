# PHASE A — RAPORT C1 (2026-09-13)

**HEAD:** `a2bd224`. Każde twierdzenie poniżej ma dowód runtime albo jest oznaczone jako
NIEZROBIONE/ZABLOKOWANE. Nie ma tu słowa „done" bez liczby.

## 1. Bramka (stan faktyczny, nie deklaracja)

| Sprawdzenie | Wynik |
|---|---|
| `repro-demo.mjs` | **53/53** |
| Frontend | **5478 przeszło / 1 pominięty** |
| Backend | **396/396** |
| tsc | czysto |
| eslint | czysto |
| build | czysto |
| `compute:bundle:check` | zsynchronizowany |

## 2. Co zostało zaimplementowane, z dowodem

| Sekcja | Stan | Dowód runtime |
|---|---|---|
| M1 ObservationGapRequest | **ZROBIONE** (`67380ce`) | 5 kontroli; realna rozróżnialność 0.6096σ < 1σ na danych Brydgesa → silnik odmawia eksperymentu |
| M2 rejestr sfalsyfikowanych | **ZROBIONE**, skanonikalizowane (D-027) | druga kampania QE4 z własnym rejestrem blokuje 54/55 modeli; Kepler z tym samym rejestrem blokuje **0** |
| M3 modele wielozmiennowe + interakcje | **ZROBIONE**, skanonikalizowane (D-027) | `y = a·x1 + b·x2 + c·x1·x2` odtworzone dokładnie (RSS < 1e-6); model bez członu interakcji nie potrafi (RSS > 1) |
| M3 parsymonia + hold-out | **ZROBIONE** | chi² + k·ln(n); hold-out deterministyczny, `null` gdy podział nie utrzyma dopasowania |
| Planner Redund + Fals | **ZROBIONE**, skanonikalizowane (D-027) | `Sep × (1+w·Fals) × (1−w·Redund)`, bez EIG |
| §5 Discovery Graph + transfer | **ZROBIONE** (`f72229d`) | 129 węzłów/128 krawędzi, replay MATCH; 21 węzłów przeniesionych QE4→Kepler ze statusem 1:1; 108 sfalsyfikowanych odrzuconych bez zmiany założeń |
| §8 bramka PracticalCandidate | **ZROBIONE** (`a2bd224`) | realny kandydat → ACTIVATE/GOVERNMENT_RESEARCH; język recepty → REFUSE; interwencja → REQUIRES_HUMAN_APPROVAL; wynik negatywny → dalej ACTIVATE |
| §9 acceptance E2E | **ZROBIONE** (`ee3ed70`) | pełny łańcuch: 5 rund, 7 obserwacji, 2 modele wyprowadzone (w tym z `log` odebranym gramatyce), przekonania 1↑/46↓, replay MATCH |
| §6 Government/Sovereign | **ZROBIONE PRZEZ INNĄ SESJĘ** (`eaa9ab8`, `d18a771`) | `sovereignTruthAnswer.ts`, `integrityGates.ts` |
| §7 A1 GLP-1 | **ZABLOKOWANE DANYMI** | patrz §5 tego raportu |

## 3. REUSE / EXTEND / NEW

**NEW (4 moduły):** `observationGap.ts`, `discoveryGraph.ts`, `practicalCandidateGate.ts`,
`falsifiedModelRegistry.ts` (skanonikalizowany wariant drugiej sesji + moja poprawka determinizmu).

**EXTEND:** `modelSpace.ts` (zmienne nazwane, INTERACTION, parsymonia, hold-out),
`discoveryCampaign.ts` (bramka M2 przed emisją, luka obserwacyjna, człony plannera, ranking z karą),
`campaignLabs.ts` (deklaracja przyrządu/wykonalności), `scienceMemory.ts` (zapis kampanii przez
istniejące `saveExperiment`), `reproEntry.node.ts`, `repro-demo.mjs`.

**REUSE, świadomie nie przepisane:** `core/governance/` (katalog uprawnień, zawężanie werdyktu
serwera, workflow zatwierdzeń z rozdziałem obowiązków) — bramka §8 **nazywa** uprawnienie
`candidate.activate` zamiast budować drugi silnik polityki. `GraphEpistemicStatus` zamiast
dziewiątego słownika statusów. `events/hash`, `beliefRevision`, `tautologyGate`,
`externalDatasetCase`, `hypothesisLoop` — bez zmian.

## 4. Frontier score — przed / po

Qwen wyliczył 55/100 metodą z §7 swojego dokumentu (wagi × % ukończenia). Ta sama metoda,
te same wagi, na stanie potwierdzonym w repo:

| Zdolność | Waga | Przed | Po | Uzasadnienie zmiany |
|---|---|---|---|---|
| Fundament epistemiczny | 20 | 90 | 95 | + graf odkrycia z zachowaniem statusu, + bramka wyniku |
| Pętla odkrycia | 25 | 75 | 90 | + luka obserwacyjna, + parsymonia, + hold-out |
| Tworzenie modeli | 15 | 20 | 65 | + wielozmiennowość, + interakcje, + strukturalne wyprowadzanie z residuum z rodowodem |
| Autonomia eksperymentu | 15 | 25 | 60 | + Redund/Fals, + żądanie brakującej obserwacji |
| Pamięć + graf | 10 | 40 | 80 | + Discovery Graph, + transfer międzykampanijny, + rejestr M2 |
| Cross-domain | 10 | 60 | 60 | **bez zmian** — nadal dwie realne domeny (QE4, Kepler) |
| Interfejs laboratorium | 3 | 50 | 60 | + `ObservationGapRequest` jako protokół żądania, ale bez sprzętu |
| Praktyczny kandydat | 2 | 10 | 55 | + bramka maszynowa, ale **nieprzetestowana na domenie interwencyjnej** |

**Wynik: 55 → 78/100.** To jest instrument planistyczny wobec zdefiniowanego Frontier,
nie procent ukończenia projektu — i celowo **nie** zaokrąglam w górę.

## 5. Co blokuje 80+ (konkretnie, nie ogólnie)

1. **A1 nie ma danych.** W repo **zero** danych GLP-1 (grep: `semaglutide`, `liraglutide`,
   `GLP-1` — brak trafień; przypięte payloady ChEMBL to adenozyna i teofilina). Egress do
   ChEMBL i ClinicalTrials.gov jest z sandboxa zablokowany. Bez pobrania w CI i przypięcia
   z sha256 **każdy „wynik A1" byłby zmyślony**. To jest jedyna rzecz, która podniosłaby
   jednocześnie Cross-domain (60→80) i Praktycznego kandydata (55→85), bo dałaby pierwszą
   domenę INTERWENCYJNĄ.
2. **Nadal dwie domeny.** Silnik jest domain-agnostyczny z dowodu (ten sam kod, dwie
   niezależne nauki), ale trzecia domena to nadal deklaracja. Lucy czeka na potwierdzenie
   przez Qwena, że bundle PDS da się pobrać.
3. **Brak ekranu.** Żaden widok w przeglądarce nie renderuje kampanii ani grafu odkrycia.
   Wszystko idzie przez `repro-demo`. To nie blokuje nauki, ale blokuje użycie.
4. **Gramatyka jest zadeklarowana.** „Otwartość" znaczy: poza wyliczenie (przez residuum),
   nie poza gramatykę. Silnik nie wymyśli członu spoza słownika baz.
5. **EIG pozostaje BLOCKED** — i ma pozostać, dopóki nie ma reprezentacji posterioru.

## 6. Dług zapisany, nie ukryty

- **Globalny stan mutowalny w rejestrze M2** (`let LOG` + reset dla testów). Obronne dla
  pamięci „globalnej", ale w silniku, którego wartością jest deterministyczny replay, dwie
  kampanie w jednym procesie dzielą go niejawnie. Zapisane w D-027 jako dług.
- **Dwa hold-outy.** Moje `holdoutScore` (`modelSpace.ts`) i `holdoutDiagnostic` drugiej
  sesji (`integrityGates.ts`) wylądowały równolegle. Nie kolidują, ale to jest kandydat do
  konsolidacji, zanim urosną.
- **D-026 i D-027 to ten sam błąd dwa razy.** Trzy komponenty zrobione podwójnie w jeden
  dzień. Plik `docs/prompts/2026-09-13-PHASE-A-claims.md` istnieje właśnie po to, żeby
  nie było trzeciego razu.
