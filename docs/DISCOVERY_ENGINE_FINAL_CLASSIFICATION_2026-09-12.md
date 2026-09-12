# FINAL CLASSIFICATION: Qwen MASTER SPEC × realne repo — REUSE / EXTEND / NEW / BLOCKED

**Wejście:** `docs/GENESIS_AUTONOMOUS_DISCOVERY_ENGINE_MASTER_SPEC.md` (pakiet Qwena, FINAL),
na commicie `558e1f7`. **Status: AUDIT + PLAN. NIC NIE ZAIMPLEMENTOWANE. Czeka na akceptację.**

Ten dokument zastępuje `docs/DISCOVERY_ENGINE_AUDIT_2026-09-12.md` jako podstawę do
implementacji. Tamten pozostaje w repo, bo zawiera historię dwóch własnych pomyłek, których
nie chcę kasować (patrz sekcja 0).

---

## 0. JAK TO BYŁO WERYFIKOWANE — i co było w poprzednich przebiegach ŹLE

Trzy równoległe audyty repo (generatory hipotez/predykcji; planer/stopowanie/dedup;
pamięć/discovery state/kontrakt laboratorium) plus własne czytanie kodu. **Każde twierdzenie
o dużych konsekwencjach sprawdziłem osobiście przed wpisaniem tutaj** — i to się opłaciło
trzy razy:

1. **Liczba selektorów `nextAction.ts`.** Pierwszy przebieg audytu (podagent): „brakuje 6.
   selektora". Druga wersja (moja): „jest 6, nie 5". **Obie błędne — jest 7.** Policzone
   bezpośrednio z wpisów `selectorId:` w tablicy. Nagłówek samego pliku mówi „ACROSS FIVE
   REAL SELECTORS" i też jest nieaktualny, więc KAŻDE dostępne streszczenie tej liczby
   było niezgodne z kodem. Wniosek operacyjny: w tym repo liczby trzeba liczyć, nie czytać.
2. **„Router jako kontrakt pluginów domenowych"** — tak to nazwałem we wcześniejszym
   audycie. **Nieprawda.** `experimentFabric/router.ts::RouterModel` nie ma ŻADNEGO pola
   funkcyjnego (to czysta deklaracja danych), a wykonanie to `switch (model.id)` z
   **51 przypadkami i BEZ `default`** w `experimentFabric/executor.ts::executeRealModel`,
   kończący się `throw`. Dodanie domeny wymaga edycji rdzenia — dokładne przeciwieństwo
   kontraktu pluginowego. Realny per-plugin `execute` istnieje TYLKO po stronie backendu
   (`compute/registry.mjs::graphModel/functionModel` → `execute(values, { seed })`).
3. **Zakres luki dedupu.** Prompt dla C2 opisywał brak dedupu MIĘDZY kampaniami. Luka jest
   szersza: `campaign/orchestrator.mjs::runCampaign` nie wczytuje niczego nawet dla własnej
   kampanii (`listCandidates` nie jest tam w ogóle zaimportowane; `seenCanonical`, `retained`,
   `history`, `generation` startują od zera przy każdym wywołaniu). Prompt C2 został
   poprawiony.

---

## 1. KLASYFIKACJA §-PO-§

Legenda: **REUSE** = jest, użyć wprost · **EXTEND** = jest częściowo, dołożyć ·
**NEW** = naprawdę brakuje · **BLOCKED** = nie da się uczciwie zbudować dziś, z podanym powodem.

### §1 Autonomous Discovery Core (orkiestrator)

**EXTEND.** Nie brakuje orkiestratora — **istnieje PIĘĆ wielorundowych pętli z realnym
wykonaniem między rundami**:

| Pętla | Wykonanie między rundami | Wybór rundy N+1 |
|---|---|---|
| `core/agent/inquiryLoop.ts::runAutonomousInquiryWithRuns` | realny router, `runId`+`runFingerprint` | regułowy (pierwsza para rozróżniająca) |
| `core/agent/discoveryLoop.ts::runAutonomousDiscoveryWithEngines` | realny fork świata `TemporalEngine` | regułowy (konsoliduj → eksploruj) |
| `backend/campaign/orchestrator.mjs::runCampaign` | realny RDKit | regułowy (`algorithm: 'rule-based-evidence'` — kod sam się tak nazywa) |
| `experimentFabric/researchCampaign.ts::runResearchCampaign` | realne wykonanie prerejestrowanych hipotez | regułowy |
| `core/agent/cyberReasoningKernel.ts::runAdaptiveInvestigation` | realne wykonanie na `ToyVulnerableApp` | **SKOROWANY** (jedyny) |

Jawnie typowana maszyna stanów z §1 nie istnieje, ale wszystkie jej fazy istnieją jako kod.
**Brakuje nie rdzenia, tylko szwu do substratu danych — patrz sekcja 2.**

### §2 Hypothesis Generator

| Operator | Klasyfikacja | Dowód |
|---|---|---|
| `COMPETE` | **EXTEND** | `experimentFabric/hypothesisLoop.ts::generateCompetingHypotheses` rozwija ZADEKLAROWANĄ listę `candidateValues` w N rywali. Bierze *problem*, nie hipotezę — nie ma operatora „rywale dla H". `agent/competingModels.ts::assessCompetingModels` to DETEKTOR, jego własny nagłówek mówi, że nic nie generuje. |
| `VARIANT` | **REUSE** (4 implementacje) | `worldModel/discovery/worldCounterfactual.ts::deriveAlternativeCriteria` (`RELATION_FLIP`, `TOLERANCE_WIDENED` liczone z realnych zmierzonych wartości); `agent/parameterAlternative.ts::deriveAlternativeParameterValue`; `agent/intervalNarrowing.ts::proposeInteriorCandidates`; strukturalny rebinding w `discoveryLoop.ts`. |
| `ABDUCT` | **NEW** | Zero trafień repo-wide. Nic nie bierze obserwacji O i nie wyprowadza „co musi być prawdą, żeby O". |
| `RESIDUAL` | **NEW** (detektor istnieje) | `agent/modelSufficiency.ts::assessModelSufficiency` zwraca `DECLARED_SPACE_INSUFFICIENT` + prozę `nextStep` i **nic nie generuje**; używany jako bramka wejściowa w `parameterAlternative.ts`. |
| `CONFLICT` | **EXTEND** (detekcja+ranking, zero rekoncyliacji) | `agent/crossDomainSynthesis.ts` — rodzaj `UNRESOLVED_CONFLICT`, priorytet najwyższy. Kod mówi wprost: „deliberately not silently reconciled". |
| `DERIVE` | **REUSE** | `hypothesisLoop.ts::deriveNarrowedHypothesisProblem` (midpoint zwycięzcy i wicelidera, z realnie zmierzonych wartości); `agent/mechanismGeneration.ts::generateJointMechanismFrom` (składa `apply` dwóch ocalałych w mechanizm, którego nie zadeklarowano). |

**Schemat hipotezy: EXTEND.** Istnieją CZTERY niekompatybilne typy i żaden nie niesie
jednocześnie rodowodu i założeń:
`hypothesisLoop.ts::PreregisteredHypothesis` (ma `falsificationCriteria`, `assumptions[]`,
`provenance[]`, `status`; **nie ma** `parentHypothesisId`/`derivationOp`/`lineage[]`),
`beliefRevision.ts::Hypothesis` (ma `parentHypothesisId` + `generatedBy` + append-only
`history[]`; **nie ma** `statement`/`assumptions`/`prediction`),
`discoveryLoop.ts::MechanisticHypothesis` (niesie wykonywalne `apply()`),
`inquiryLoop.ts::ParameterHypothesis` (4 pola). Pole o nazwie `lineage` nie istnieje nigdzie —
rodowód jest zakodowany w stringach id (`a+b`, `h~RELATION_FLIP`).

**Inwariant fingerprintu: REUSE** — `core/events/hash.ts::fnv1a` + `::canonicalJson`. Z realnym
zastrzeżeniem, patrz §20.

### §3 Candidate / Mechanism Generator (type-agnostic)

**NEW** — ale **poza P0**. Każdy istniejący generator jest związany z domeną
(`campaign/drugAdapter.mjs::generateProposals` — realny RDKit, zero mutacji stringów SMILES).
Jedyny naprawdę domenowo-neutralny kształt, `core/cde/passport.ts::Candidate`
(`{label?, params: Record<string, number>}`), jest **wejściem do oceny**, nie wyjściem
generatora — nic go nie produkuje. Demonstrator §22 nie potrzebuje tego modułu: tam
„kandydatem" jest nastawa eksperymentu `(T, k)`, nie substancja.

### §4 Prediction Engine + rozdział epistemiczny

- **Rekord `Prediction`: NEW.** Nie istnieje. Najbliższe, `agent/predictionVerification.ts::PredictionVerification`, jest *werdyktem*, nie predykcją.
- **Unia 8-wartościowa: EXTEND.** `core/biotechDiscoveryContract.ts::BiotechEpistemicStatus` trafia 6/8 (FACT, OBSERVED, PREDICTION, INFERENCE, HYPOTHESIS, UNKNOWN); `MODEL` jest w `core/knowledge/supplementalRegistry.ts::KnowledgeEpistemicStatus`; **`CONFLICTING_EVIDENCE` nie istnieje nigdzie w repo.** `core/epistemicReliability.ts` to już podjęta próba konsolidacji (mapuje 3 z 6 słowników na wspólną drabinę) — rozszerzać ją, nie zaczynać szóstej.
- **„Predykcja zapieczętowana, nigdy automatycznie promowana": REUSE, i to mocne.** `hypothesisLoop.ts::preregisterHypotheses` + `::verifyPreregistrationIntact` (fingerprint zamrożonego widoku) + `::verifyAntiHarkingAnchor`. `predictionVerification.ts::verifyPredictionAgainstRealExperiment` **odmawia**, jeśli `dataProvenance ∉ {REAL_EXPERIMENTAL, REFERENCE}` — predykcji nie da się po cichu sprawdzić przeciw resymulacji.

### §5 Autonomous Experiment Planner (formalne skorowanie)

**EXTEND — wzorzec już działa, tylko nie na substracie naukowym.** `agent/cyberTestPlanner.ts::scoreCandidate`
to realna ważona suma (6 wag) napędzająca realną wielorundową pętlę. Per człon:

| Człon | Klasyfikacja | Dowód |
|---|---|---|
| `α·EIG` | **BLOCKED** | Patrz sekcja 3 — to nie jest „brakujący moduł", to brakująca podstawa. |
| `β·Sep` | **REUSE** | `experimentFabric/beliefRevision.ts::checkDiscriminability` + `::selectMostDiscriminatingExperiment`; `inquiryLoop.ts::separatesAt`; waga `discrimination: 0.25` w `cyberTestPlanner.ts`. |
| `γ·Fals` | **NEW** | Liczby falsyfikowalności nie ma. `tautologyGate.ts::evidenceCeiling` **ogranicza ruch przekonania**, ale nie odrzuca kandydata. |
| `δ·Avail` | **EXTEND** | Istnieje jako twarda bramka, nie człon: `campaign/toolchain.mjs::capabilityAvailable` → `BLOCKED_BY_RUNTIME`; `experimentFabric/scientificPlanner.ts::designScientificExperiment` rzuca. |
| `ε·Cost` | **EXTEND** | Waga `-0.20` istnieje, ale karmiona stałymi (`0.1`/`0.15`), więc dziś nic nie różnicuje. Realna kontrola kosztu to `budget` w `campaign/multiFidelity.mjs::selectForStage`. |
| `ζ·Time` | **NEW** | `durationMs` jest zapisywane, ale nie czyta go żaden selektor ani reguła stopu. |
| `η·Risk` | **EXTEND** | Twardy filtr przed skorowaniem (`c.safety === 'SAFE'`), nie waga. |
| `θ·Redund` | **EXTEND** | `repeatPenalty: -0.6`; `seenCanonical` — wyłącznie tożsamość dokładna, wyłącznie w obrębie jednego przebiegu. |

### §6 Self-falsification / adversarial

| Kontrola | Klasyfikacja | Dowód |
|---|---|---|
| Wykrywanie HARKingu | **REUSE strukturalnie / EXTEND operacyjnie** | `hypothesisLoop.ts::verifyAntiHarkingAnchor` jest realne i poprawne. **Ale każde miejsce wywołania w repo podaje `{ priorRunFingerprints: [] }`** — kotwica jest wszędzie pusta, więc dziś nie może niczego wykryć. To dołożenie danych, nie budowa modułu. |
| Dowód cyrkularny / test tautologiczny | **REUSE** | `agent/tautologyGate.ts::assessTautology` — 4-wartościowa klasyfikacja + `evidenceCeiling`. Nazwane kontrole „T1–T8" ze specu nie istnieją jako osiem osobnych sprawdzeń; to EXTEND nazewnictwa, nie brak funkcji. |
| Szukanie kontrdowodu / eksperyment rozróżniający | **REUSE** | `beliefRevision.ts::checkDiscriminability`. |
| Dane zależne od modelu | **REUSE** | `core/dataProvenance.ts` + odmowa w `predictionVerification.ts`. |
| Bias konfirmacyjny, alternatywne wyjaśnienia | **NEW** | Brak. |

### §7 Belief Revision

**REUSE — i to, co spec nazywa „required extension", jest już zrobione.**
`experimentFabric/beliefRevision.ts::updateConfidence` **już** dopisuje append-only rekord do
`Hypothesis.history` i nigdy nie nadpisuje poprzedniego (`history: [...hypothesis.history, record]`).
`::rankHypotheses`, `::activeHypotheses`, `::ReasoningTraceEntry` też istnieją.
Jedyne realne dołożenie: operacja `conflicting` — **NEW, ale mała**.

### §8 Nowa hipoteza z wyniku

**EXTEND, z jednym realnym konfliktem do naprawienia.** `REFINE`/`ALTERNATIVE` istnieją (§2 DERIVE/VARIANT).
`ANOMALY_MECHANISM`, `RESIDUAL_HYPOTHESIS`, `CONFLICT_HYPOTHESIS`: **NEW**.
`NEXT_QUESTION` istnieje — **ale dokładnie w formie, którą §8 zakazuje**:
`core/agent/externalDatasetCase.ts::buildNextQuestion` to sztywny `switch` na cztery szablony
prozy, a `core/agent/nextQuestion.ts` to zadeklarowana kaskada priorytetów. Spec mówi
„must not be a fixed next-question list" i ma tu rację.

### §9 Long-horizon campaign

**EXTEND.** Rundy W OBRĘBIE jednego wywołania: realnie utrwalone append-only
(`campaign_candidates`, `campaign_decisions`, `campaign_events`).
**Między sesjami: NEW (i to błąd, nie tylko brak).** `runCampaign` nie rehydratuje —
`listCandidates` nie jest w tym pliku zaimportowane. `api.mjs` pozwala wystartować kampanię
ze statusu `cancelled`, a `campaign_candidates` nie ma UNIQUE na `canonical_smiles`.

### §10 Stopping rules

**EXTEND.** Istnieje **siedem** oddzielnych słowników stopu (`InquiryStopReason`,
`ProbeSelectionRule`, `DiscoveryStopReason`, `DECISIONS` w `nextExperiment.mjs`, literały w
`orchestrator.mjs`, `WorldCalibrationStopReason`, sentinele `researchCampaign.ts`), plus dwa
miejsca z nietypowanym `stopReason: string` wypełnianym prozą.

`RESOURCE_LIMIT`: **REUSE**. `CONVERGENCE`, `NO_INFORMATION_GAIN`, `EXHAUSTED_SPACE`:
**EXTEND** (istnieją bliskie odpowiedniki o węższym znaczeniu). `DISCOVERY`, `FALSIFICATION`,
`CONFIDENCE_THRESHOLD`, `UNRESOLVED_CONFLICT`, `SAFETY_BOUNDARY`: **NEW**.
Uwaga: `UNRESOLVED_CONFLICT` jako powód STOPU byłby zmianą zachowania — dziś konflikty są
zapisywane i pętla leci dalej, co jest świadomą decyzją, nie przeoczeniem.

### §11 Campaign deduplication

**NEW (klucz) / EXTEND (mechanizm).** Najbliższy istniejący klucz złożony to
`scientificPlanner.ts::protocolFingerprint` (pokrywa hipotezę + projekt + konfigurację +
źródła wiedzy), **ale nie pokrywa `datasetVersion`** i nigdy nie służy do pomijania pracy —
używany jest do wykrywania DRYFTU (`evidencePackStore.ts`). Sam `datasetVersion` występuje
w całym repo dwa razy i nigdy w żadnym kluczu.

### §12 Scientific Memory

**EXTEND, z dwiema lukami uczciwościowymi, które uważam za ważniejsze niż sam spec.**
Backend: `campaign_decisions`, `campaign_events`, `science_run_verifications` są realnie
INSERT-only. Frontend: **NIE jest append-only** — `scienceMemory.ts::saveExperiment` robi
`.slice(-MAX_TOTAL)` (cicha eksmisja powyżej 100) i istnieje `::deleteExperiment`.

Dwie luki do zaadresowania (niezależnie od tego planu):
1. `hypothesisLoop.ts::buildSavedHypothesisLoop` **rzuca wyjątkiem**, gdy prerejestracja
   została naruszona. Czyli najważniejsza naukowa porażka, jaką system potrafi wykryć, jest
   jedyną rzeczą, która nigdy nie trafia do pamięci.
2. `evidencePackStore.ts::isPack` wymaga statusu `completed`/`failed` — pakiet zawierający
   `knowledge_only`/`capability_seam`/`rejected` nie da się w ogóle zapisać.

### §13 Discovery State

**NEW jako rekord, ale każde pole ma już źródło.** `bestHypothesisId`: REUSE
(`hypothesisLoop.ts::HypothesisDiscrimination.winnerHypothesisId`, `null` gdy nierozstrzygnięte).
`whyBest.evidenceIds`: REUSE. `rankedHypotheses`: EXTEND — **pole `rank` nie istnieje nigdzie**.
`whyBest.revisionChain`: dane istnieją (`Hypothesis.history`), ale **`revisionChain` ma 0 trafień
w repo** i nic tego nie utrwala. `openConflicts[]`: NEW. `stoppedReason`: REUSE na backendzie,
nieutrwalone na froncie.

### §14 Laboratory / plugin contract

**Backend: EXTEND. Frontend: NEW.** To najważniejsza korekta wobec mojego wcześniejszego audytu.
- Backend `compute/registry.mjs::graphModel/functionModel` **ma** realny per-plugin
  `execute(values, { seed }) → { outputs, warnings, provenance? }`, a
  `campaign/toolchain.mjs::present` jest najbliższym istniejącym odpowiednikiem całego
  proponowanego interfejsu (`validate()` odpala realny przypadek referencyjny).
- Frontend **nie ma** kontraktu pluginowego: `RouterModel` to czyste dane, a wykonanie to
  51-przypadkowy `switch` bez `default`.
- `problemIntake()`, `hypothesisSeed()`, `candidateSource()`, `safetyBoundary` (jako pole
  sprawdzalne maszynowo): **NEW**.
- `LaboratoryResult`: `provenance`/`fingerprint`/`replay.inputs`/`replay.seed`/`status`: REUSE.
  `replay.envHash`: EXTEND (jest, ale tylko backend, `science_runs.environment_hash`).
  **`replay.codeHash`: NEW — zero implementacji w całym repo** (jedyne trafienie to literał
  `'worker hash'` w deklaracji `externalAdapters.ts`, nigdy nieliczony).
  `uncertainty` i `evidence[]` na wyniku: NEW (istnieją poziom wyżej).

### §15 Drug Discovery

**REUSE.** `[VERIFY]` ze specu zweryfikowane: RDKit, OpenMM i PySCF mają realne adaptery i
workery w `packages/backend/src/compute/`, a `env_probe.py` przy braku biblioteki oznacza
zdolność jako niedostępną zamiast ją udawać.

### §16 Government Science / Policy Control Plane

**NEW.** Brak płaszczyzny autoryzacji/ról/audytu. Przyczynowość (DiD/ITS/synthetic control):
**NEW, już zakresowana osobno** w `docs/prompts/C1-B1-ulez-no2-adjudication.md`. **Poza P0/P1.**

### §17 Spatial / World Engine

**REUSE/EXTEND.** Teza specu („jeden silnik, wiele światów, nie silnik na planetę") jest już
spełniona: jeden `TemporalEngine`/`WorldGraph` plus adaptery per domena w `core/world/`
(`cellWorldAdapter`, `epidemiologyWorldAdapter`, `moleculeWorldAdapter`, `particleWorldAdapter`…).
**Poza P0/P1.**

### §18 Cross-domain discovery

**NEW.** Mimo nazwy, `agent/crossDomainSynthesis.ts` **nie jest** transferem przez analogię —
to triage otwartych pozycji PRZEZ laboratoria: zwraca pytanie, nigdy hipotezy, nigdy założeń.
Maszynerii analogii nie ma w repo. **Poza P0/P1** (spec sam to stawia jako P6).

### §19 Discovery Graph

**EXTEND.** Trzy grafy istnieją i żaden nie pokrywa pełnej listy węzłów:
`campaign/discoveryGraph.mjs` (backend, z persystencji, ma krawędzie `REJECTED_BECAUSE`/
`STOPPED_BECAUSE`), `experimentFabric/experimentGraph.ts` (sesja), `agent/epistemicStateGraph.ts`
(cała pamięć, ze statusami **wyprowadzanymi** regułami, nie czytanymi z pola).

### §20 Formal data contracts — i jedno realne ryzyko

**EXTEND.** `fnv1a` + `canonicalJson` do reużycia. Ale audyt znalazł coś, czego spec nie
przewiduje i co jest realnym błędem czekającym na wywołanie: **co najmniej cztery niezależne
implementacje kanonicznego JSON-a** (`core/events/hash.ts`, `core/integrity/integrityEnvelope.ts`,
`packages/csrn/src/crypto/canonicalJson.ts`, `backend/src/provenance.mjs`), przy czym
**frontend sortuje klucze przez `localeCompare`, a backend domyślnym `.sort()`** — dla kluczy
spoza ASCII dają różną postać kanoniczną. Do tego frontend liczy 32-bitowy FNV-1a, a backend
sha256, więc **odciski obu połówek systemu są wzajemnie nieporównywalne**.
`campaign/toolchain.mjs::present` nie kanonizuje w ogóle (zależny od kolejności kluczy).
To nie blokuje P0, ale musi być zapisane jako ryzyko, bo §20 zakłada jeden wspólny odcisk.

### §22 Demonstrator na przypiętym zbiorze Brydgesa

**WYKONALNY — zweryfikowane.** `core/biotechData/qe4BrydgesEstimator.ts` liczy S₂ z SUROWYCH
`MeasuredStates` dla dowolnego `(T, k)`: `precomputeRowStatistics(rows, ks)`,
`bootstrapMultiK(...)`, `bootstrapMultiKBlocked(...)`. Dostępne 13 punktów czasowych
(6 clean + 7 z nieporządkiem) × k = 1..9. `weightedLinearFit` i
`weightedResidualSumOfSquares` już istnieją — czyli hipoteza rezydualna jest liczalna
z istniejących prymitywów. Prowenancja zbioru jest przypięta z sumą kontrolną
(`qe4-brydges/manifest.json`, `archiveSha256` sprawdzany w `qe4EvidenceCase.test.ts`).

### §23 Definition of Done

Osiągalne, z dwoma zastrzeżeniami nazwanymi wprost w sekcji 5.

---

## 2. JEDYNA LUKA, KTÓRA REALNIE BLOKUJE §22/§23

Nie jest nią orkiestrator, generator ani pamięć. Jest nią to:

> **Obie autonomiczne pętle naukowe wymagają substratu SYMULOWALNEGO i nie potrafią przyjąć
> przypiętego realnego zbioru danych jako źródła obserwacji.**

Dowód z kodu, nie z rozumowania:
- `inquiryLoop.ts::SystemUnderStudy` wymaga pola `hiddenParameters` — „prawdziwych" wartości
  systemu. Pomiar polega na uruchomieniu solvera NA TEJ PRAWDZIE. Dla realnego zbioru danych
  nie ma czego tam wstawić: gdybyśmy znali prawdę, nie byłoby czego odkrywać.
- `discoveryLoop.ts::DiscoveryLoopInput` wymaga `buildWorld(): { graph, updater }`, a każda
  hipoteza niesie `apply(graph, strength)` — interwencję na symulowanym świecie.

Zbiór QE4 daje realną, parametryzowaną przestrzeń eksperymentu i realne liczenie.
Brakuje **szwu**, który pozwoli pętli pytać zbiór zamiast symulacji. To jest cały P0.

---

## 3. DLACZEGO `EIG` JEST **BLOCKED**, A NIE `NEW`

`experimentFabric/beliefRevision.ts` we własnej dokumentacji deklaruje, że jego rewizja
przekonań jest **deterministyczną heurystyką log-odds, a NIE skalibrowanym posteriorem
bayesowskim**. `EIG` ze §5 jest zdefiniowane jako „expected posterior-entropy reduction".
Policzenie entropii posteriora z liczb, które nie są posteriorem, wyprodukowałoby precyzję,
której w systemie nie ma — i byłoby dokładnie tym rodzajem fabrykacji, którego ta misja zakazuje.

Repo już raz podjęło tę decyzję świadomie: `experimentFabric/modelVsModelCompare.ts` odmawia
nazwania swojej miary „information gain" albo prawdopodobieństwem, „bo nie stoi za nią żaden
skalibrowany model oceny". `agent/inquiryLoop.ts` w dokumentacji `selectNextProbe` pisze wprost,
że nie wprowadza żadnego wyniku ani rankingu, bo „nic w tym kodzie nie uzasadnia ważenia jednej
niepewności ponad drugą liczbowo". `agent/cyberTestPlanner.ts` liczy pole nazwane
`expectedInformationGain`, ale **oblicza je PO wyborze, tylko dla zwycięzcy, i nigdy nie karmi
nim rankingu** — to etykieta raportowa, nie wejście decyzyjne.

**Rekomendacja:** w P0 planer NIE dostaje członu EIG. Dostaje człony liczalne z tego, co
istnieje, a wykluczenie EIG zostaje zapisane w dokumentacji modułu z tym uzasadnieniem.
Realny EIG to osobne, większe zadanie (najpierw skalibrowany posterior), i tak należy je
zgłosić, a nie podstawiać heurystykę pod wzór.

---

## 4. FINAL IMPLEMENTATION PLAN

### P0 — minimum, żeby uruchomić prawdziwą autonomiczną pętlę odkrycia

Pięć pozycji. Wszystkie na substracie QE4, wszystkie reużywają istniejące kontrakty.

**P0.1 — szew `DatasetLaboratory` (jedyny naprawdę blokujący NEW).**
Wąski kontrakt: `{ labId, observableSpec, run(config, seed) → LaboratoryResult }`, gdzie
implementacja QE4 czyta przypięte CSV i woła `bootstrapMultiK`. Prowenancja z
`agent/externalDatasetCase.ts::ExternalDatasetProvenance` (już ma `archiveSha256`), odcisk z
`events/hash.ts::fnv1a`+`canonicalJson`, status z `experimentFabric/types.ts::ExperimentRunStatus`.
**Nie** generalizować na 17 domen — jeden substrat, jedna implementacja, udowodniona.
Generalizacja to P2.

**P0.2 — parametryzowane generowanie hipotez z siatki danych.**
Szablony reżimów (liniowy w t / logarytmiczny / saturujący) × własna siatka `(T, k)` zbioru.
Hipotezy **liczone z siatki**, nie wybierane z literału, z `parentHypothesisId`/`generatedBy`.
Reużywa `beliefRevision.ts::createHypothesis` i `qe4BrydgesEstimator.ts::weightedLinearFit`.

**P0.3 — skorowany planer (EXTEND wzorca `cyberTestPlanner.ts` na substrat naukowy).**
Człony liczalne dziś: `Sep` (reużyć `checkDiscriminability`), `Redund` (tożsamość odcisku),
`Avail` (czy dany `(T, k)` jest przypięty), `Cost` (liczba iteracji bootstrapu).
`Fals` jako realnie liczalny udział hipotez, które ten eksperyment mógłby sfalsyfikować —
nazwany uczciwie, **nie** nazwany prawdopodobieństwem. **`EIG` wykluczone, z uzasadnieniem
w dokumentacji modułu** (sekcja 3).

**P0.4 — operator hipotezy rezydualnej (NEW, mały).**
Z `weightedResidualSumOfSquares` po dopasowanym reżimie → hipoteza o czasie przejścia t*.
To jest ta pozycja, która sprawia, że „wyprowadza nową hipotezę z wyniku" ze §23 jest realne,
a nie szablonowe.

**P0.5 — słownik stopu: dołożyć `CONVERGENCE` i `NO_INFORMATION_GAIN`.**
Do słownika TEJ pętli. **Nie** unifikować wszystkich siedmiu istniejących słowników —
to osobne zadanie i osobne ryzyko regresji.

### P1 — pierwsze runtime-verified autonomiczne odkrycie

Uruchomić realnie, dwie rundy, zgodnie z §22: hipotezy konkurencyjne → planer wybiera →
realne przeliczenie S₂ → bramka tautologii → falsyfikacja → rewizja przekonania →
hipoteza rezydualna → planer wybiera DRUGI eksperyment → stop przez regułę → zapis do pamięci
→ replay `MATCH`.
**Warunek odbioru:** dowód = komenda + wyjście + hash commita, plus dołożenie kontroli do
`scripts/repro-demo.mjs` (żeby weszło do stałej bramki, nie było jednorazowym pokazem)
i zadanie CI, jak przy QE4/CMS.

### P2+ — rozszerzenia, świadomie odłożone

1. Generalizacja `DatasetLaboratory` na kolejne substraty (CMS, ChEMBL, Kepler).
2. Ujednolicony rekord hipotezy (dziś 4 niekompatybilne typy).
3. Konsolidacja unii epistemicznej + dodanie `CONFLICTING_EVIDENCE` (rozszerzyć `epistemicReliability.ts`).
4. **Ujednolicenie kanonicznego JSON-a i odcisków** (§20) — realne ryzyko, nie kosmetyka.
5. `codeHash` + `envHash` po stronie frontendu.
6. Rehydratacja kampanii + dedup międzykampanijny (`docs/prompts/C2-cross-campaign-dedup.md`).
7. Realne zapełnienie kotwicy anty-HARKingowej (dziś wszędzie `[]`).
8. Naprawa dwóch luk uczciwościowych pamięci z §12.
9. Przyczynowość / `causalInference` (`docs/prompts/C1-B1-ulez-no2-adjudication.md`).
10. Policy Control Plane (§16), analogia międzydomenowa (§18), Discovery State jako rekord (§13).
11. Realny EIG — dopiero po skalibrowanym posteriorze.

---

## 5. CZEGO **NIE** BUDOWAĆ — i co uczciwie zostanie NIEDOMKNIĘTE

**Nie budować (istnieje, z cytatem):** `DiscoveryCore` jako nowy orkiestrator (§1 — pięć pętli),
`HypothesisGenerator` od zera (§2 — VARIANT i DERIVE realne),
Belief Revision z historią (§7 — **już zrobione**),
Evidence / Provenance / Replay / Falsification / Tautology Gate / External Dataset Case
(§24 — wszystkie realne), interfejs `Laboratory` dla wszystkich domen naraz (§14 — backend ma
swój, frontend potrzebuje JEDNEGO, nie siedemnastu), kolejny selektor `nextAction.ts`
(jest ich siedem), silnik na planetę (§17 — jeden silnik + adaptery).

**Dwa zastrzeżenia do §23, które zostaną otwarte nawet po P1 — mówię to teraz, nie po fakcie:**

1. **„≥2 competing hypotheses NOT drawn from a fixed list".** P0.2 daje hipotezy
   *parametryzowane z siatki danych*, nie wybierane z literału — a §23 dopuszcza
   „parameterized/refined/derived". Ale **przestrzeń szablonów reżimów pozostaje zadeklarowana**.
   To jest zgodne ze §22, który sam przyznaje, że otwarta nowość to P2+. Nie będę tego
   raportował jako „otwartego generowania hipotez".
2. **„planner selects by scoring".** Będzie realne skorowanie, ale **bez członu EIG**
   (sekcja 3). Czyli wzór §5 NIE zostanie zaimplementowany w całości, świadomie.
   Raport z P1 musi to powiedzieć wprost, a nie pokazać wzór z ośmioma członami, z których
   jeden jest atrapą.

---

## 6. STAN

**AUDIT + PLAN GOTOWE. ZERO IMPLEMENTACJI. Czeka na akceptację użytkownika przed P0.**
