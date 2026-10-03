# Centralny audyt stanu Genesis po nocnej pracy — 3 października 2026 (sobota)

Źródło prawdy: repozytorium, GitHub (PR-y, branche, check-runy), pliki dowodowe na main. Nic tu nie pochodzi z pamięci rozmów; tam gdzie czegoś nie sprawdziłem, jest napisane NIE SPRAWDZONE.
Stan w chwili audytu: **main = c68e71f9** (merge PR #68). **Produkcja = b3be8635** (deploy main 23cd1340 z 29 września). Nic nie zostało wdrożone w tym audycie.
CI na main: 20 jobów zielonych, `verify` na c68e71f9 jeszcze trwał w chwili pisania; ten sam kod przeszedł `verify` na gałęzi PR-a #68 (207de8b7).

## 1. ASTRA

Co zrobiła (dowód: PR #55, gałąź `astra/evidence-researchrun-roadmap`, 6 commitów, 909 linii, 10 plików, scalony 2 października 01:02Z jako 7b6dd401): dokumentacja `docs/astra/` — kontrakt Evidence Pack (RESEARCHRUN_EVIDENCE_PACK_SPEC), bramka licencji komercyjnych, plan przewagi Genesis, luka względem Kosmos z 30-dniowym DoD, proces pracy z klientem, odpowiedź na review, `schema.json` + `example.json`.
Sprawdzone teraz: wszystkie 10 plików są na main; `example.json` waliduje się względem `schema.json`; słownictwo werdyktów jest poprawione (SUPPORTED_WITHIN_PROTOCOL / FALSIFIED_WITHIN_PROTOCOL / INCONCLUSIVE, stare CONFIRMED/REFUTED opisane jako przestarzałe). Wcześniejsza uwaga „SUPPORTED / REFUTED wymaga poprawy" jest już nieaktualna.
Poza main zostały dwie starsze gałęzie wizualne Astry (23–24 września, nie PR-y):
- `astra/genesis-investor-visual-polish` (1 commit, 7 plików): 5 plików jest na main identycznych, 2 zmienione później. Praktycznie wchłonięte.
- `astra/human-explorer-visual-ceiling` (2 commity, 63 pliki): 56 plików nie ma na main (głównie zrzuty ekranu, 2 skrypty przeglądu, 2 dokumenty, `HumanExplorerHero.css`), 5 zmienionych, 2 identyczne. To prototyp „world-first explorer" sprzed przebudowy Human Explorera (PR #33–#35, #64). Nie ma zapisu decyzji o odrzuceniu ani scalenia; NIE przeglądałem go linia po linii.
Testy po integracji: PR #55 to dokumentacja i JSON, żaden kod ani test na main go nie używa. Nic nie wykonuje specyfikacji Evidence Pack (zob. CODE REMAINING).
Konflikty/duplikaty: brak konfliktów przy #55.

**ASTRA: PARTIAL.** Praca dokumentacyjna (#55) jest w całości na main i spójna ze słownictwem kodu. Dwie gałęzie wizualne są poza main (jedna prawie w całości wchłonięta, druga to nieprzejrzany, prawdopodobnie przestarzały prototyp), a specyfikacja Evidence Pack nie ma implementacji.

## 2. SOL

Co zrobił: PR #56 (`codex/sol-master-execution`, 84 commity, +14 401/−214, 140 plików, scalony 3 października 00:39Z jako 97940b8c): bramka na ciężkie wykonania naukowe (security), model wykonania generowanej analizy, BYT projection i testy restartu, Science Flight Control, candidateLabHandoff i labClosedLoop, kontrakty wykonawcze silników (PySCF, Vina, OpenMM, ADMET), workflow Railway, matryce pokrycia testami, dowody w `docs/evidence/` (pełny backend 88269a25, regresja lokalna, proof UI). PR #57 (literatura: konektor Europe PMC, powiązanie twierdzeń ze źródłami, port dla ResearchRun; 634 linie, scalony jako fc5c88ce) wyrósł z #56 w wątku Universal Inquiry.
Poprawione po jego pracy (moje, PR #58, 122ef7da): jedno Laboratorium z przełącznikiem trybu, bramka licencji silników, ponowienie nieudanej analizy, uczciwe sformułowanie atestacji sandboxa. Dalej #59, #61, #63, #68 (kolejka, silniki przez ResearchRun, artefakty).
Sprawdzone teraz: gałąź `codex/sol-master-execution` jest 0 commitów przed main (całość na main). Jedyna rzecz poza main: `codex/bodyparts3d-claude-ready` (1 commit, README + zip pilota BodyParts3D z 24 września), zastąpiona przez PR #17 (pełny atlas 2 234 struktur); zawartości zipa nie porównywałem.
Testy potwierdzające integrację: CI 60/60 w chwili merge #56 (wg zapisu z tamtego merge), potem CI zielone na #58, #59, #61, #63, #66, #68; lokalnie po integracji backend 1599 testów / 0 błędnych (2 zestawy startu serwera przekroczyły 8 s przy pełnym obciążeniu, osobno 9/9).

**SOL: FULLY INTEGRATED** dla pracy produkcyjnej (#56, #57 na main, CI zielone), z jednym drobnym nieprzeniesionym artefaktem (zip pilota BodyParts3D, zastąpiony przez #17).

## 3. MOJA PRACA PRZEZ NOC (wątek konsolidacji) — konkretne rezultaty

Uwaga: w tej sesji nie mam zapisu o uruchamianiu subagentów; wszystko poniżej zrobił ten wątek. Inne wątki (Human Explorer, GLP-1R, Run 9, Universal Inquiry, ingest) wymienione są w pkt 4.

| Problem przed | Co zrobiono | PR / commit | W main | Testy | Efekt dla Genesis |
|---|---|---|---|---|---|
| Dwa laboratoria, brak bramki licencji silników, nieponawialna nieudana analiza, zawyżone słowa o sandboxie | Jedno Laboratorium z trybami, bramka licencji (domyślnie TECHNICAL_VALIDATION), retry tylko nieudanych, uczciwa atestacja; scalenie #56 | #58, 122ef7da | TAK | CI 40/40 | Jeden produkt zamiast dwóch; komercyjne użycie ADMET/retrosyntezy blokowane |
| Brak dowodu równoległości kolejki | 32 zadania, 4 workery, 1 zatruty izolowany; Completion Matrix | #59, 86823e70 | TAK | scientificFanOut.test, CI zielone | Kolejka zachowuje się deterministycznie pod obciążeniem (tylko jeden węzeł) |
| ResearchRun działał tylko synchronicznie w żądaniu | Trwała kolejka leasingowa podłączona do trasy: dedupe, anulowanie, dead-letter przy zepsutym łańcuchu, worker w serwerze | #61, 5916987b | TAK | researchRunJobs.test (3, prawdziwy RDKit), CI 40/40 | Uruchomienia przeżywają restart, nie wykonują się dwa razy |
| Tylko RDKit przechodził przez ResearchRun; reszta silników „miała kontrakt" | PySCF, Vina/Meeko, OpenMM, ADMET przez ten sam port i kolejkę; osobny job CI z GENESIS_REQUIRE_ENGINES; test bramki licencji ADMET | #63, 729a67ae | TAK | researchRunEngines.real.test (5), job CI zielony | 5 prawdziwych silników z werdyktem, replayem i hashami |
| Wyniki asynchroniczne bez przechowania | ARTIFACT_PERSISTED w łańcuchu hashy, odczyt z weryfikacją, odrzucenie uszkodzenia, odzyskanie luki; potem ta sama ścieżka dla trasy synchronicznej | #63, #68 (c68e71f9) | TAK | researchRunArtifacts.test (6) | Wynik ma tożsamość i dowód nienaruszenia |
| Brak dowodu E2E z awarią | Golden E2E: pytanie → kolejka → prawdziwy RDKit → artefakt → werdykt → Evidence PROPOSED → Replay → pamięć; awaria workera, restart, odzyskanie. Znalazł i naprawił błąd numeracji zadań po odzyskaniu | #63 | TAK | goldenResearchRun.e2e.test | Jedyny pełny dowód przepływu na prawdziwym silniku |
| CSRN bez okna ważności i rotacji | Okno ważności klucza, rotacja (RETIRED/REVOKED), 5 testów skryptów na kluczach jednorazowych, instrukcja dla właściciela. Klucza produkcyjnego NIE ma | #63 | TAK | reviewerSignedEvidence (20), csrnScripts (5) | Gotowe do podpisania, gdy właściciel wygeneruje klucz |
| Rozproszone statusy | Tabela prawdy silników, matryca, audyt SaaS, zapis QA UI (66/66 mechanicznie), raport końcowy | #63, #66 | TAK | — | Jedno źródło statusu (ten plik je zastępuje) |

## 4. CO WESZŁO DO MAIN (od północy 2→3 października)

HEAD main: **c68e71f9**. Bez podwójnego liczenia (autor = wątek, który pisał kod):
- #54 R1-b/R1-c ResearchRun: wykonanie → werdykt → Evidence → Replay (Universal Inquiry; 5b0e20f3); #55 Astra (docs, 7b6dd401); #57 literatura (Sol/Universal Inquiry, fc5c88ce); #56 Sol bezpieczeństwo/wykonanie (97940b8c).
- #58, #59, #61, #63, #66, #68 — moje (konsolidacja), opis w pkt 3.
- #35 Human Explorer (atlas, role, PL/EN/AR) i #64, #65, #67: pankreas schematycznie, znaczniki pochodzenia CERN, QA wizualne, język Startu (Human Explorer). #60: D-153 funkcjonalny model GLP-1R + D-154/D-156/D-157/D-159 (wątek GLP-1R). #62: surowe dane źródłowe GLP-1R z RCSB, Reactome, HPA, ChEMBL (ingest).
Otwarte: #69 (język ekranu CMS, Human Explorer, `unstable`), #1 i #2 (stare PR-y z września, nie dotyczą tego przebiegu).
CI po integracji: zielone na każdym zmergowanym PR; main c68e71f9: 20 jobów zielonych, `verify` w toku w chwili audytu.
Poza main leżą też 68 starych gałęzi z commitami niedostępnymi z main (przeważnie 500–2000 commitów za main, wrzesień). Nie weryfikowałem ich pojedynczo; PR #13 z 27 września odzyskał część. To dług porządkowy, nie praca tej nocy. Dwie gałęzie z tej nocy mają niescalone commity: `claude/project-thread-mk7f49` (Run 9, 5 commitów) i `claude/project-thread-2wdmhf` (dane Run 9 + ingest, reszta już w main przez #62).

## 5. CO NADAL NIE JEST DOPIĘTE

**CODE REMAINING**
1. Brak realnego ResearchRun GLP-1R i brak ścieżki candidate → docking → ranking (patrz pkt 7).
2. Implementacja Evidence Pack (specyfikacja Astry jest tylko dokumentem).
3. OpenMM tylko jako wzorcowa woda TIP3P, bez replayu bit-w-bit.
4. Retrosynteza (AiZynthFinder) nie jest w żadnym jobie CI.
5. Dwa magazyny doświadczeń laboratoriów (kernelLedger, scienceMemory) nadal osobne.
6. ~15 słowników epistemicznych niezmapowanych; łańcuch hashy frontend/backend nie jest jedną biblioteką.
7. Scalenie linii Run 9 do main (evidence Run 9 jest tylko na gałęzi).
8. Dwa zestawy testów startu serwera przekraczają 8 s przy pełnym lokalnym obciążeniu (przechodzą osobno i w CI).
**ENVIRONMENT BLOCKED**
9. Tylko jeden węzeł: brak wspólnej kolejki i magazynu obiektów; brak GPU/HPC.
10. Ta sesja ma politykę sieci sprzed zmiany (zenodo.org, RCSB zablokowane); nowe sesje mają hosty otwarte.
**DATA BLOCKED**
11. 8 z 16 testów aktywności (assay) w D-157 pozostaje UNKNOWN (4 „cAMP bez stwierdzonego agonizmu", 4 nieklasyfikowalne wg zamrożonych reguł); brak danych ekspresji dla łańcucha receptor → neuron.
**LICENSE BLOCKED**
12. GNINA tylko do benchmarku, żaden ranker z GNINA nie wchodzi do produktu; ADMET i retrosynteza BLOCKED_BY_LICENSE przy użyciu komercyjnym; licencje Vina/Meeko i OpenMM nie potwierdzone.
**OWNER ACTION REQUIRED**
13. Wygenerować klucz CSRN na własnym komputerze (docs/keys/OWNER-CSRN-KEY-COMMANDS.md); do tego czasu certyfikaty UNSIGNED.
14. „Startuj Run 9" (jedyna zgoda, która uruchamia ostateczny przebieg).
15. Cel docking GLP-1R: D-159 odmówił rejestracji 6X18; potrzebna osobna decyzja, gdzie jest kieszeń małej cząsteczki.
16. Laboratorium do pomiaru i chemik do badania czasu przygotowania; klient pilotażowy, wolumen, backup; encja prawna dopiero po Hub71.
17. Decyzje otwarte: model wybuchu / klucze „Defense" w repo, archiwum z plikami substancji psychoaktywnych.
**DEPLOYMENT ONLY**
18. Produkcja stoi na b3be8635 (29 września). Main jest 315 commitów dalej; produkcja nie ma: konsolidacji #58, kolejki, pięciu silników, artefaktów, CSRN okna/rotacji, Human Explorera z #35/#64/#67, literatury, zmian bezpieczeństwa #56. Wdrożenie dopiero na „wdrażaj" w wątku Human Explorer.

## 6. Stan procentowy (uczciwy, z aktualnego kodu i testów)

Metoda: procent = ile ze zdefiniowanego zakresu ma dowód E2E w testach na main; 100% tylko przy pełnym E2E z dowodem. Żaden obszar nie ma 100%.

| OBSZAR | % | STATUS | CZEGO BRAKUJE DO 100% |
|---|---|---|---|
| ResearchRun / proces naukowy | 72 | Golden E2E zielony na prawdziwym silniku, pauza/wznowienie/anulowanie, kolejka, artefakty | Prawdziwy model w pętli (testy używają zamrożonej odpowiedzi modelu jako planu), harmonogram wieloetapowy (faza 2 tylko na zlecenie), wiele węzłów, realny run GLP-1R |
| Evidence / Replay / provenance | 80 | Replay MATCH dla deskryptorów, QC, dokowania, ADMET; łańcuch hashy; custody | Replay OpenMM, podpis CSRN (klucz), wspólna biblioteka hashy |
| BYT / trwały stan | 75 | Restart, korupcja łańcucha fail-closed, test między runami | Trwałość zależy od wolumenu; jedna baza SQLite; brak backupu |
| Hipotezy / steering / falsyfikacja | 80 | Zamrożona predykcja przed uruchomieniem, werdykty w protokole, steering, wyjątki | Brak kalibracji niepewności (celowo), brak pętli wielu hipotez bez człowieka |
| NL → kod → sandbox | 70 | Prawdziwy sandbox w CI, analiza generowana wykonana i powtórzona, ponowienie nieudanych | Atestacja to deklarowana polityka, nie atestacja sprzętowa; zależność od jakości modelu; brak GPU |
| Literatura / dane | 55 | Konektor Europe PMC, wiązanie twierdzeń ze źródłami, surowe dane GLP-1R z hashami | Pełne teksty, ocena jakości źródeł w skali, 8 assayów UNKNOWN, brak ekspresji |
| Silniki / workflowy naukowe | 68 | 5 prawdziwych silników przez jeden port, test w CI wymuszony | Retrosynteza, MD białko–ligand, GPU/HPC, licencje |
| Candidate → lab handoff | 35 | Kod i testy handoffu (Sol), dowód zamknięcia pętli na symulacji | Brak zweryfikowanego adaptera sprzętowego, brak kandydata, brak laboratorium |
| Science Flight Control | 55 | Moduł i testy (Sol) | Nie sprawdzałem tej nocy pełnej drogi UI; brak dowodu pod obciążeniem |
| UI / produkt | 65 | Build zielony, 66/66 widoków mechanicznie w 6 viewportach, Human Explorer w trakcie | Pełna kontrola wzrokowa i prawdziwe telefony, arabski z natywnym czytelnikiem, interakcje Human Explorera, wdrożenie |
| Skalowanie / subagenci / enterprise | 30 | Fan-out 32 zadań na jednym węźle | Wiele replik, wspólny storage, SSO, billing, backup |

**GENESIS FUNCTIONAL COMPLETION: 62%**
**GRANT READINESS: 35%** (platforma weryfikowalna jest mocna, brak kandydata, brak pomiaru w laboratorium, brak LOI/pilotu, encji i doradcy chemicznego)
**PILOT READINESS: 55%** (PILOT_READY dla jednego nadzorowanego klienta na jednym węźle; brak klienta, wolumenu i backupu)
**ENTERPRISE READINESS: 20%** (brak SSO, billingu, backupu z testem odtworzenia, wielu replik)
Są to moje oceny z przeglądu dowodów, nie pomiar; rozrzut ±10 punktów.

## 7. Kandydat do grantu

- Stan ścieżki GLP-1R: dane źródłowe pobrane i zahashowane (#62); luka łańcucha jest kodem: receptor → szlak → typ komórki → odpowiedź neuronu. D-155 zamyka połowę Gs → cAMP z rekordów Reactome, reszta to brak ekspresji. Brak zarejestrowanego celu dokowania GLP-1R (tylko ABL1_1IEP).
- D-153 oznacza: model dopasowany tylko do podzbioru FUNKCJONALNEGO AGONIZMU przeszedł NIEZMIENIONĄ bramkę d2f77a7e6042f0fc (MAE 0,656, R² 0,783, n=53, cztery kontrole wycieku utrzymane), mimo że zamrożona przed liczeniem predykcja zakładała porażkę (zapisana jako błędna). Wniosek jedyny: oś skuteczności jest OCENIALNA. Zastrzeżenie obowiązkowe: mediana najbliższego sąsiada Tanimoto test→trening 0,84, 22 z 53 wierszy ≥0,90, więc model interpoluje WEWNĄTRZ jednej serii chemicznej; nie wolno rankingować kandydatów ani twierdzić nowej serii. D-144 nadal nie przechodzi własnej bramki (MAE 1,0118 > 1,0) i nie jest reinterpretowane.
- Prawdziwy prospektywny kandydat: NIE. Realny przebieg candidate discovery: NIE. „16 testów": nie ma 16 testów kandydatów; w D-157 sklasyfikowano 16 opisów assayów (1 → funkcjonalny agonizm, 5 → wiązanie, 2 → inne funkcjonalne, 8 UNKNOWN). Winner Gate: żaden kandydat go nie przeszedł, bo żaden nie był oceniany. Niezależna walidacja: NIE (Run 8 DOES_NOT_GENERALISE dla rankingu pozycji, bez związku z kandydatem). **GRANT-READY CANDIDATE: NIE.** Werdykt: NO GRANT-READY CANDIDATE YET.
- Kroki od teraz do GRANT-READY CANDIDATE NOMINATED: (1) Decyzja właściciela o celu dokowania: nowa, osobno zamrożona decyzja, która ustala kieszeń małej cząsteczki (6X18 odrzucone w D-159; kandydaci z małą cząsteczką 7S15/5VEW mają mutacje i nie spełniają zamrożonej reguły). (2) Zarejestrować cel i zamrożoną regułę przed jakimkolwiek dokowaniem. (3) Preregistracja prospektywnej kampanii (zbiór cząsteczek, lejek, Winner Gate, zakaz zmiany progu po wynikach). (4) Prawdziwy ResearchRun GLP-1R na tej ścieżce. (5) Lista 20–50 kupowalnych cząsteczek z Evidence/Replay, osobny model funkcjonalny walidowany na NOWEJ preregistracji dla zbioru poza serią z D-153. (6) Laboratorium mierzy (pomiar to krok właściciela; może być pilotem/LOI). (7) Dossier i pakiet grantowy. Dopiero krok 6 zmienia „obliczeniowy hit" w cokolwiek, co wolno nazwać zmierzonym.

## 8. Run 9 (nie uruchamiany w tym audycie)

Źródło: gałąź `claude/project-thread-mk7f49` (nie ma jej na main), commit 59258c42, `docs/evidence/run9/`.
- Seal A: zamrożony, odcisk 7f998117…; Seal B: zamrożony (odcisk 036497a2…), wybrany ranker C1(0,7): 217/308 na PoseBusters, +4,22 pp nad regułą Run 8 (204/308), tylko na zbiorze rozwojowym i in-sample, więc to nie wynik. Przewidywanie z Seal A (+1,5…+4,0 pp, najpewniej PARTIAL) bez zmian. C1(0,7) używa GNINA, więc nie wchodzi do produktu niezależnie od wyniku (licencja).
- Zenodo: pobrane i zweryfikowane przez ten wątek (rekord 14794785, wersja v18366081, `annotations.csv` z hashem w Seal B); ta sesja nadal nie ma dostępu do zenodo.org.
- 300 przypadków zamrożone: TAK (`fresh-set-cases.json`, sha256 92bf6db7…, niezależnie odtworzone z tekstu Seal A, 2 098 kwalifikujących się układów). Dane lokalnie na gałęzi, nie na main.
- Run 9 czeka na „startuj Run 9": TAK (`run9-final.py` odmawia, jeśli cokolwiek się nie zgadza).

## 9. MAIN vs PRODUKCJA

Main: c68e71f9 (wszystko z pkt 4). Produkcja: b3be8635 = deploy main 23cd1340 z 29 września (Start jako centrum dowodzenia, Więcej · Scientific OS, wyszukiwarka). Produkcja pokazuje więc nadal stary stan, m.in. Run 8 jako „running". Różnica: main 315 commitów przed, 6 za (commity deployowe). Nie wdrożono niczego w tym audycie.

## 10. Po ludzku

A. Astra: praca dokumentacyjna jest dopięta (#55 w main, spójna z kodem), ale dwie jej stare gałęzie wizualne i spec Evidence Pack nie są dopięte. PARTIAL.
B. Sol: tak, dopięta (#56 i #57 w main, CI zielone), poza jednym zipem pilota BodyParts3D. FULLY INTEGRATED.
C. Najważniejsze przez noc: jedno Laboratorium, kolejka w ResearchRun, 5 prawdziwych silników z werdyktem i replayem, artefakty z weryfikacją, Golden E2E z awarią i restartem, narzędzia CSRN gotowe na Twój klucz.
D. Realnie gotowe: ok. 62% funkcjonalnie; 35% pod grant; 55% pilot; 20% enterprise.
E. Do kandydata do grantu: daleko. Nie mamy celu dokowania, prospektywnej kampanii, kandydata ani pomiaru. Najbliższy krok to Twoja decyzja o celu GLP-1R.
F. Pięć najważniejszych: (1) decyzja o celu dokowania GLP-1R i prospektywna kampania, (2) laboratorium do pomiaru, (3) klucz CSRN, (4) „startuj Run 9" i scalenie linii Run 9 do main, (5) „wdrażaj", bo produkcja jest 315 commitów za main.
