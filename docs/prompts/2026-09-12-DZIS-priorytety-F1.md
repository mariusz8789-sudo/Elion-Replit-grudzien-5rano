# DZIŚ (2026-09-12) — zadania C1/C2/C3/Qwen na podstawie klasyfikacji Discovery Engine

Wejście: `docs/DISCOVERY_ENGINE_FINAL_CLASSIFICATION_2026-09-12.md` na `75ebdc1`.
To jest GO dla P0 z tamtego dokumentu — audyt był warunkiem wstępnym, jest zamknięty,
teraz działamy. F2–F4 (Reasoning Core, World/Project, Mythos domains) **świadomie poza
zakresem dzisiaj** — user sam to tak podzielił.

## Krótki czek: F1 punkt-po-punkcie, co mamy / co brakuje

| # | Luka z listy F1 | Realny stan | Kto dziś |
|---|---|---|---|
| 1 | Real-data autonomous loop | **BLOCKED/NEW — jedyna prawdziwie blokująca luka.** `inquiryLoop.ts`/`discoveryLoop.ts` wymagają `hiddenParameters`/`buildWorld()`, nie umieją przyjąć przypiętego zbioru jako źródła obserwacji | **C2 lub C3 (kto wolny pierwszy) — P0.1** |
| 2 | Formalny planner scoring | EXTEND — wzorzec ważonej sumy już działa (`cyberTestPlanner.ts`) i napędza realną pętlę, tylko na złym substracie. EIG jest **BLOCKED** (uzasadnienie w klasyfikacji §3), nie wchodzi do wzoru | **ten sam co #1 — P0.3, po #1** |
| 3 | Open-ended hypothesis generation | EXTEND — VARIANT i DERIVE realne (4 implementacje), COMPETE bierze problem nie hipotezę, ABDUCT nie istnieje | P0.2 wchodzi w #1 (hipotezy z siatki danych, nie z literału) |
| 4 | Open-ended next-question | **NEW, potwierdzone** — `externalDatasetCase.ts::buildNextQuestion` to dosłownie sztywny switch na 4 szablony, dokładnie to, czego spec zakazuje | **C3 — mały, osobny task, dziś jeśli starczy czasu** |
| 5 | Candidate/mechanism generation domenowo-neutralny | NEW, ale **poza P0** — demonstrator QE4 nie potrzebuje substancji, tylko nastawy `(T,k)` | odłożone |
| 6 | Stopping rules | EXTEND — 7 osobnych słowników istnieje. **Nie unifikować wszystkich dziś** (ryzyko regresji), tylko dołożyć CONVERGENCE/NO_INFORMATION_GAIN do pętli z #1 | **C3 — P0.5** |
| 7 | Adversarial self-falsification jako obowiązkowy krok | EXTEND — tautology gate, discriminability, anti-HARK są realne, ale kotwica anty-HARK jest wszędzie pusta (`priorRunFingerprints: []`) i nic nie wymusza kroku co rundę | **C3 — wpiąć jako obowiązkowy krok w pętli z #1, po P0.4** |
| 8 | Laboratory abstraction | Backend EXTEND (ma realny `execute(values,{seed})`), **frontend NEW** — router to czyste dane, dyspozytor to 51-case switch bez default | to samo zadanie co #1 (P0.1 to właśnie ten kontrakt, wąsko: jeden substrat) |
| 9 | Truth schema (INFERENCE, CONFLICTING_EVIDENCE, ...) | EXTEND — `CONFLICTING_EVIDENCE` nie istnieje NIGDZIE w repo, `epistemicReliability.ts` to już zaczęta konsolidacja 3 z 6 słowników | **Qwen — research: jak realnie zdefiniować CONFLICTING_EVIDENCE i evidence strength, żeby C1/C2/C3 nie zgadywali** |
| 10 | Cross-campaign scientific memory / dedup | NEW, **już w toku** — `docs/prompts/C2-cross-campaign-dedup.md`, zakres poszerzony (orchestrator nie rehydratuje nawet WŁASNYCH poprzednich generacji) | **C2 — dokończyć TO przed P0.1** |
| 11 | Autonomous provenance/replay wiring | REUSE w większości (fingerprint/provenance/replay realne). `codeHash` NEW (zero implementacji), ryzyko: ≥4 niezależne implementacje canonical JSON, front liczy inaczej niż backend (§20 klasyfikacji) | zapisane jako ryzyko w klasyfikacji, nie blokuje dziś |

## Zadania na dziś

### C1 — kontynuacja B1 (już w toku, zdecydowane)
Druga instancja C1 utknęła na blokerze A1 i wybrała "Skip to B1 now" — kontynuuj
`docs/prompts/C1-B1-ulez-no2-adjudication.md` (causalInference.ts, DiD/ITS/synthetic-control
na realnych danych DEFRA). To już ma pełną specyfikację, nic tu nie zmieniam.

### C2 — najpierw dokończ dedup, potem P0.1 (DatasetLaboratory seam)
1. Dokończ `docs/prompts/C2-cross-campaign-dedup.md` (zakres już poszerzony o brak
   rehydratacji własnych generacji — przeczytaj zaktualizowaną wersję przed startem).
2. Jeśli zostanie dziś czas: **P0.1 z klasyfikacji, sekcja 4** — wąski kontrakt
   `DatasetLaboratory { labId, observableSpec, run(config, seed) → LaboratoryResult }`
   dla JEDNEGO substratu (QE4), czytający przypięte CSV i wołający
   `qe4BrydgesEstimator.ts::bootstrapMultiK`. Prowenancja z
   `externalDatasetCase.ts::ExternalDatasetProvenance` (ma już `archiveSha256`), odcisk z
   `events/hash.ts::fnv1a`+`canonicalJson`. **NIE generalizować na 17 domen — to P2.**

### C3 — P0.2 + P0.4 + P0.5 (hipotezy z siatki, hipoteza rezydualna, stopowanie)
1. **P0.2**: hipotezy konkurencyjne LICZONE z siatki `(T,k)` przypiętego zbioru QE4
   (reżimy: liniowy w t / logarytmiczny / saturujący), z `parentHypothesisId`/`generatedBy`
   przez `beliefRevision.ts::createHypothesis` — nie z literału.
2. **P0.4**: operator hipotezy rezydualnej z `weightedResidualSumOfSquares` po dopasowanym
   reżimie (np. czas przejścia t*) — to jest ten element, który realnie spełnia "derives a
   new hypothesis from the result" ze §23 specu Qwena.
3. **P0.5**: dołóż `CONVERGENCE`/`NO_INFORMATION_GAIN` do słownika stopu TEJ JEDNEJ pętli
   (nie unifikuj wszystkich siedmiu istniejących słowników — osobne zadanie, osobne ryzyko).
4. Jeśli starczy czasu: punkt 4 z tabeli — zastąp `buildNextQuestion`'s cztery szablony
   generowaniem wynikającym z realnego stanu (reżim odrzucony / potwierdzony / hipoteza
   rezydualna wygenerowana), bez wymyślania nowego formatu — reużyj `nextQuestion.ts`'ego
   wzorca zadeklarowanej kaskady, tylko zasilonej stanem, nie stałym switchem.

### Qwen — dwa zadania badawcze
1. **PILNE, odblokuj A1**: brakujący pakiet badawczy GLP-1 (semaglutyd↔liraglutyd) dla
   `docs/prompts/C1-A1-glp1-substitution.md` — to jest bloker, który druga instancja C1
   właśnie ominęła, przechodząc do B1. Dostarcz go, żeby A1 dało się domknąć równolegle.
2. Jeśli starczy czasu: research punkt 9 z tabeli — jak inne systemy naukowe formalnie
   definiują `CONFLICTING_EVIDENCE` jako stan epistemiczny (nie jako "unresolved conflict"
   na poziomie pamięci, tylko jako stan POJEDYNCZEGO twierdzenia) i "evidence strength" jako
   liczbę — żeby C1/C2/C3 nie musieli tego wymyślać przy P2 (§9 klasyfikacji).

## Warunek odbioru — bez zmian względem reszty misji
Dowód = komenda + wyjście + hash commita. `git fetch` przed KAŻDYM pushem — cztery strony
pchają na tę samą gałąź równolegle, dziś bardziej niż zwykle. Pełna bramka (tsc/eslint/oba
suite'y/build/`repro-demo.mjs`) przed każdym pushem kodu.

## Uczciwe zastrzeżenie
"Wszystko dopięte dziś" nie znaczy gotowego silnika P1 (dwie rundy end-to-end na QE4,
replay MATCH) — to jest cel, nie gwarancja, bo C2/C3 startują P0 od zera dopiero teraz.
Realistyczny wynik dzisiejszy: P0.1–P0.5 GREEN, każde z realnym dowodem, plus B1 i dedup
domknięte. P1 (pełny dwurundowy demonstrator) to naturalne jutro, jeśli P0 wejdzie dziś
bez blokerów.

## UPDATE (ten sam dzień) — dodatek Qwena v2, dwie poprawki, uzgodniona numeracja P0-1..P0-6

Qwen przysłał `MASTER_SPEC_DELTA_ADDENDUM_v2` z bardziej szczegółową numeracją P0
(P0-1..P0-6). Zweryfikowałem go bezpośrednio w kodzie przed przyjęciem — pełny zapis w
`docs/DISCOVERY_ENGINE_FINAL_CLASSIFICATION_2026-09-12.md` sekcja 7. Dwie poprawki:

1. **"Demonstrator QE4 na `campaign/orchestrator.mjs`" jest nieuczciwym uproszczeniem.**
   Ten plik jest związany z RDKit/SMILES na trzech poziomach (`describeAsRun`→
   `runModel('chem-rdkit-descriptors',...)`, `adapter.canonicalize`, sortowanie `smiles`
   w `hashState`) — dosłowne uruchomienie na nim wymagałoby przepisania rdzenia. Reużywamy
   KSZTAŁT pętli, nie ten plik — `DatasetLaboratory` (P0.1 z sekcji 4 klasyfikacji) jest
   dziewiątą implementacją tego samego wzorca co `campaign/toolchain.mjs`'s 8 narzędzi,
   nie nowym silnikiem. **Bez zmian względem wcześniejszego podziału: P0.1 zostaje osobnym,
   wąskim adapterem, nie wciśnięciem QE4 w silnik lekowy.**
2. **"Cross-campaign dedup: REUSE/C1-VERIFIED" jest fałszywe.** Zero implementacji w kodzie
   (`seenCanonicalGlobal`/`listCandidatesAcrossCampaigns` — 0 trafień). **C2 kontynuuje to
   zadanie, nikt go nie pomija.**

Numeracja P0-1..P0-6 z dodatku Qwena (dokładniejsza niż moja P0.1-P0.5) — przyjęta, z
zastrzeżeniem EIG (patrz niżej), i mapowana na tych samych ludzi co wyżej:

| # (Qwen) | Zakres | Kto | Zmiana względem wcześniejszego podziału |
|---|---|---|---|
| P0-1 | Bramki skorowania selektora | C2 (po dedupie) | = wcześniejsze P0.3, **bez członu EIG** |
| P0-2 | Operatory derywacji hipotez + rodowód | C3 | = wcześniejsze P0.2 |
| P0-3 | Enum + ewaluacja reguł stopu | C3 | = wcześniejsze P0.5, **tylko dla jednej pętli, nie unifikacja 7 słowników** |
| P0-4 | Pola truth-schema (`INFERENCE`, `CONFLICTING_EVIDENCE`, ...) | **nowe, C2 po P0-1** | wcześniej to był tylko temat badawczy dla Qwena — dodatek słusznie podnosi to do P0, przyjęte |
| P0-5 | Obowiązkowy przebieg adwersarialny po rundzie | C3 (po P0-2/P0-3) | = punkt 7 z wcześniejszej tabeli, teraz jawnie ponumerowany |
| P0-6 | Odcisk prowieniencji/replay na rundę | C2 lub C3, kto skończy pierwszy | reużycie `fnv1a`/`canonicalJson`/`ExperimentProvenance` — bramka replay MATCH przed zamknięciem P0 |

**Zastrzeżenie do P0-1, podtrzymane:** EIG nie wchodzi do wzoru skorowania — `beliefRevision.ts`
jest heurystyką log-odds, nie skalibrowanym posteriorem, więc "expected posterior-entropy
reduction" nie da się z niego uczciwie policzyć (pełne uzasadnienie: klasyfikacja, sekcja 3).

**C1 zostaje przy B1** — dodatek proponował przenieść C1 na sześć zadań P0, ale druga
instancja C1 już zdecydowała "Skip to B1 now" i jest w trakcie. Nie zmieniam tego w połowie
pracy na podstawie propozycji z zewnątrz bez dostępu do repo. Jeśli C1 skończy B1 dziś i
zostanie czas, naturalny kolejny krok to P0.1 albo P0-4 (P0-4 nie ma jeszcze przypisanej
osoby poza "C2 po P0-1" — C1 może je przejąć równolegle, żeby nie czekać w kolejce).

## STATUS (2026-09-13, rano) — co się realnie ruszyło w nocy

Zero commitów od C2/C3/Qwena od wczoraj wieczorem — ich zadania z tabeli wyżej **bez zmian**,
nikt jeszcze nie zaczął.

**C1/B1 — realny postęp**: `core/agent/causalInference.ts` (DiD/ITS/synthetic-control)
zbudowane i TDD-zweryfikowane na symulowanych panelach (`ebcea54`). Znalezione realne kody
stacji DEFRA AURN (MY1/MAN3/LED6/SHBR, D-025 w `DECISIONS.md`) i realny wzorzec URL. **Wszystkie
12 zadań macierzy CI pobrania (4 stacje × 2022-2024) przeszły na zielono** — dane NO₂/SO₂ są
pobrane i zweryfikowane w logach joba, ale **jeszcze nie przypięte** jako plik w repo (brakuje
kroku rekonstrukcji z logów CI, tak jak przy CMS Zmumu/QE4 — patrz D-023) i `causalInference.ts`
jeszcze nie jest podłączone do żadnych prawdziwych danych. **Następny krok C1**: (1) zrekonstruuj
12 plików z logów CI joba `b1-defra-aurn-pin-narrow` (uruchomienie 34726778201) w ten sam sposób
co CMS/QE4, zamień tymczasowy job na stały `*-verify-pinned` (wzorzec D-023), (2) dopiero wtedy
podłącz `causalInference.ts` do realnych danych i uruchom właściwą analizę DiD z prerejestracją.

**Ja (P0.1 → teraz P0.2)**: `DatasetLaboratory` + implementacja QE4 domknięte i wypchnięte
(`f268cdc`, pełna bramka zielona). Nikt inny nie zaczął P0.2 — biorę je teraz: generator hipotez
konkurencyjnych liczony z siatki `(T,k)` przypiętego zbioru QE4 (reżimy liniowy/logarytmiczny/
saturujący), z `parentHypothesisId`/`generatedBy` przez `beliefRevision.ts::createHypothesis`,
zasilany przez `QE4_DATASET_LABORATORY.observableSpec()` — nie z literału.

## UPDATE 2 (2026-09-13) — P0.2 domknięte, P0-2 zdjęte z listy C3

`core/biotechData/qe4RegimeHypotheses.ts` domknięte i wypchnięte (`6a6e039`/`e7c73be`):
trzy konkurencyjne hipotezy reżimowe (LINEAR_GROWTH/LOGARITHMIC_GROWTH/SATURATING) liczone
z siatki `(T,k)` przez `qe4DatasetLaboratory.ts::pointsForGrid`, z realnym dopasowaniem
(`weightedLinearFit`, rozszerzone o `slopeSigma`) i realną rewizją przekonania. **C3: P0-2
jest już zrobione — zacznij od P0-3 (reguły stopu), potem P0-5 (przebieg adwersarialny).**

Przy okazji scalania z B1 (C1) dwukrotnie naprawiony kontrakt `.env` (`SITE`/`YEAR`/
`GENESIS_B1_FIXTURE_DIR` w `scripts/fetch-b1-defra-aurn-fixture.mjs` bez wpisu w
`.env.example`) — nie luka mojej pracy, złapana przez pełną bramkę przy pushu.

Biorę teraz **P0-6** (odcisk prowieniencji/replay na rundę) sam, żeby domknąć most
między P0.1/P0.2 a tym, co budują C2 (P0-1/P0-4) i C3 (P0-3/P0-5).

## UWAGA DLA C1 (przekazana przez Qwena, 2026-09-13) — proweniencja B1 przed freeze

Nie zaimplementowane przeze mnie (to zadanie C1, nie moje) — tylko przekazuję, bo dotyczy
kroku freeze, który C1 ma przed sobą po 12 zielonych shardach macierzy DEFRA:

1. **Korzeń proweniencji to DEFRA, nie CI-artefakty.** Artefakty GitHub Actions to transport
   (obejście blokady proxy na `uk-air.defra.gov.uk`), nie źródło. W rekordzie provenance
   zapisz: URL źródłowy DEFRA, metodę dostępu WRAZ Z obejściem (dlaczego przez artefakty CI,
   nie bezpośrednio), timestamp, oraz SHA-256 surowych plików PO ściągnięciu — inaczej replay
   nie odtworzy realnie "skąd to wzięliśmy" (ten sam wymóg co przy CMS Zmumu/QE4/Kepler, ale
   z dodatkowym poziomem pośrednictwa artefaktów, którego tamte kotwice nie miały).
2. **Granice shardów wchodzą do fingerprintu.** Który podział na stacje/lata i kolejność
   scalania 12 shardów w jeden zbiór — to musi być częścią odcisku prerejestracji/preprocessingu,
   żeby merge był bitowo odtwarzalny. Sprawdź brak duplikatów na stykach shardów.
3. **Rozważ zamrożenie próbki surowych danych godzinowych obok agregatów**, jeśli artefakty
   shardów to już godzina→miesiąc — warstwa "raw" do niezależnej kontroli preprocessingu,
   analogicznie do tego, jak QE4 trzyma zarówno `MeasuredStates` (surowe) jak i
   `RenyiEntropy` (opublikowany agregat) osobno.

Nie blokuje niczyjej dzisiejszej pracy poza C1 — informacyjne, do uwzględnienia przed
uznaniem freeze B1 za zamknięty.
