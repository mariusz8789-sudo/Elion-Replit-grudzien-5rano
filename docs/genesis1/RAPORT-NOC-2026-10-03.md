# GENESIS 1 — relacja z nocy 2→3 października 2026

DATA: 2026-10-03 (sobota) · GODZINA: 18:30 UTC
MAIN: 5f52356a · PRODUCTION: b3be8635 (main jest 320 commitów dalej) · nic nie wdrożono

Źródło: GitHub (PR-y, commity, check-runy) i pliki na main. Pełny audyt z liczbami jest na main: `docs/evidence/GENESIS-CENTRAL-AUDIT-2026-10-03.md` (PR #70). Ten plik zbiera noc w jednym miejscu, według tego, kto co zrobił.

## Kto pracował

| Okno (od teraz) | Co robiło w nocy |
|---|---|
| GENESIS 1 — CENTRAL COMMAND (ten wątek, wcześniej Human Explorer) | ekrany: Human Explorer, CERN, Start, QA wizualne |
| GENESIS 2 — KONSOLIDACJA I SKALOWANIE | scalenie Sola, kolejka, silniki, Golden E2E, CSRN, audyt |
| GENESIS 4 — BENCHMARKI I RUN 9 | Run 9: Seal A i Seal B |
| GENESIS 5 — GLP-1R | D-153 i decyzje D-154…D-159 |
| GENESIS 6 — RESEARCHRUN / AI SCIENTIST | ResearchRun R1-b/R1-c, literatura, przegląd Sola |
| GENESIS 7 — DANE ŹRÓDŁOWE | pobranie surowych danych GLP-1R i Run 9 |
| Astra (bez dostępu do push) | dokumentacja Evidence Pack, licencje, proces klienta |
| Sol / Codex | bezpieczeństwo, wykonanie analiz, Flight Control, handoff do laboratorium |

## Co weszło do main (każdy PR raz)

| PR | Kiedy (UTC) | Kto | Co przed | Co zrobiono | Commit | Testy | Efekt dla Genesis |
|---|---|---|---|---|---|---|---|
| #54 | 2 X 01:00 | GENESIS 6 | Science Chat nie prowadził do eksperymentu | pytanie → ResearchRun → eksperyment → werdykt → Evidence → Replay → następny eksperyment | 5b0e20f3 | CI zielone | pierwszy pełny łańcuch naukowy w kodzie |
| #55 | 2 X 01:02 | Astra | brak kontraktu Evidence Pack | specyfikacja Evidence Pack, schema.json, bramka licencji, proces klienta | 7b6dd401 | example.json zgodny ze schema | dokument; BRAK implementacji (robi ją teraz agent GENESIS 1) |
| #57 | 2 X 01:29 | GENESIS 6 (z pracy Sola) | twierdzenia bez źródeł | konektor Europe PMC, wiązanie twierdzeń ze źródłami | fc5c88ce | CI zielone | literatura z identyfikatorem źródła |
| #56 | 3 X 00:39 | Sol | ciężkie obliczenia bez bramki | bramka bezpieczeństwa, analizy generowane, BYT, Flight Control, handoff, kontrakty silników | 97940b8c | CI 60/60 | duży pakiet; usterki poprawione w #58 |
| #58 | 3 X 01:03 | GENESIS 2 | dwa laboratoria, brak bramki licencji, zawyżona atestacja sandboxa | jedno Laboratorium, bramka licencji, ponawianie nieudanych, uczciwa atestacja | 122ef7da | CI 40/40 | jeden produkt zamiast dwóch |
| #59 | 3 X 02:32 | GENESIS 2 | brak dowodu równoległości | 32 zadania, 4 workery, 1 zatrute odizolowane | 86823e70 | scientificFanOut.test | kolejka deterministyczna pod obciążeniem (1 węzeł) |
| #61 | 3 X 02:56 | GENESIS 2 | ResearchRun tylko w żądaniu HTTP | trwała kolejka: dedupe, anulowanie, dead-letter, worker | 5916987b | researchRunJobs.test (prawdziwy RDKit), CI 40/40 | przeżywa restart, nie liczy dwa razy |
| #62 | 3 X 03:30 | GENESIS 7 | brak danych GLP-1R | surowe pliki RCSB, Reactome, HPA, ChEMBL z sha256 | 9a2f9e15 | CI zielone | dane źródłowe z pochodzeniem |
| #60 | 3 X 03:49 | GENESIS 5 | D-144 nie przechodził bramki | D-153: podzbiór agonizmu funkcjonalnego przeszedł tę samą bramkę (MAE 0,656, R² 0,783, n=53) | c2bd90fc | 4 kontrole wycieku | oś skuteczności OCENIALNA, model interpoluje w jednej serii; nie wolno rankingować |
| #64 | 3 X 04:21 | GENESIS 1 | trzustka pokazywana jak tkanka ogólna; CERN „LIVE” bez pochodzenia | własny schemat trzustki, „brak modelu tkanki” dla nerki/żołądka/jelita, znaczniki MODEL / PRAWDZIWE DANE w CERN | 90d2fca2 | CI 40/40, 576 przypadków (96 ekranów × 6 rozmiarów) bez błędu | uczciwe etykiety nauki w UI |
| #63 | 3 X 04:56 | GENESIS 2 | tylko RDKit przez ResearchRun; brak dowodu E2E | PySCF, Vina/Meeko, OpenMM, ADMET przez ten sam port; artefakty; Golden E2E z awarią i restartem; CSRN okno i rotacja | 729a67ae | researchRunEngines.real (5), Golden E2E, csrnScripts (5) | 5 prawdziwych silników z werdyktem i replayem |
| #65 | 3 X 05:01 | GENESIS 1 | nagłówek ucięty na 1366×768, Dowody techniczne | poprawka nagłówka, werdykt Dowodów po ludzku ze źródłem, konsola badań po polsku | b2e2ae13 | CI zielone | czytelne dla laika |
| #66 | 3 X 05:20 | GENESIS 2 | rozproszone statusy | raport kompletności | 6bf3b53f | — | jedno źródło statusu |
| #67 | 3 X 08:25 | GENESIS 1 | Start zawsze po angielsku | Start idzie za przełącznikiem języka (Twoja decyzja) | ed1ff4a6 | CI 42/42 | polski Start |
| #68 | 3 X 17:22 | GENESIS 2 | trasa synchroniczna nie zapisywała artefaktu | ta sama ścieżka artefaktu co kolejka | c68e71f9 | researchRunArtifacts.test (6) | każdy wynik ma tożsamość |
| #69 | 3 X 17:53 | GENESIS 1 | ekran CMS zawsze po angielsku, surowe nazwy domen | język aplikacji, polskie opisy domen | a3ae4726 | CI 42/42 | spójny język |
| #70 | 3 X 18:03 | GENESIS 2 | brak centralnego obrazu | centralny audyt | 5f52356a | CI zielone | ten stan |

## Czego NIE ma na main (praca nocy poza main)

- Run 9 (GENESIS 4): gałąź `claude/project-thread-mk7f49`, 5 commitów: plan, Seal A (5cafd9f9), pobranie Zenodo, Seal B (59258c42, D-160). 300 przypadków zamrożonych. Run 9 czeka na Twoje „startuj Run 9”.
- Astra: dwie stare gałęzie wizualne. Przegląd trwa teraz (agent GENESIS 1).
- Sol: tylko zip pilota BodyParts3D z 24 września, zastąpiony przez PR #17. Sprawdzenie trwa teraz.

## Stan uczciwie

- Kandydata do grantu NIE ma: nie było realnej kampanii kandydatów i żaden kandydat nie przeszedł Winner Gate.
- Silniki: RDKit, PySCF, Vina, ADMET działają; OpenMM częściowo; retrosynteza i komercyjny ADMET zablokowane licencją lub środowiskiem.
- Klucz CSRN nie wygenerowany, więc certyfikaty są UNSIGNED.
- Produkcja jest na 29 września.

## Co robię teraz (od 18:11 UTC)

1. Agent: przegląd gałęzi Astry i implementacja Evidence Pack z testami manipulacji.
2. Agent: Genesis Verify od danych klienta do raportu na telefon, plus macierz monetyzacji 5 produktów.
3. Agent: weryfikacja Sola, naprawa jego otwartych usterek, prawdziwy stan Flight Control.
4. GENESIS 2: skalowanie i podzadania (jeden run, wiele zadań, kontrolowana awaria).
5. Ja: jeden plik dashboardu z dwoma procentami (Edison i produkcja) oraz monetyzacją.
