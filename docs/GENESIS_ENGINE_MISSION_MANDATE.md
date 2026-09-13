# GENESIS — MISSION MANDATE: BUILD THE ACTUAL ENGINE, NOT ANOTHER DEMO

> **C1 EDITORIAL NOTE (2026-09-13).** Nadrzędne zadanie od użytkownika, zapisane dosłownie.
> To jest dokument, wobec którego mierzone jest „done" dla silnika odkryć — w szczególności
> §13 („CZEGO NIE UZNAJĘ ZA DONE"), §15 (model B nie mógł istnieć przed obserwacją)
> i zakaz udawania EIG.
>
> **Stan realizacji na HEAD (2026-09-13), weryfikowalny runtime'owo:**
> - PHASE 1 (kanonikalizacja dubli) — zrobione, D-026, commit `54c78c1`.
> - PHASE 2–8 (gramatyka modeli, struktura rezyduów, generyczna pętla kampanii,
>   autonomiczny wybór eksperymentu, dwie realne domeny) — zrobione, commit `166665f`,
>   dowód: `packages/frontend/src/__tests__/discoveryCampaign.test.ts` + `scripts/repro-demo.mjs` (35/35).
> - §15 udowodnione na **realnych** danych: gramatyce odebrano bazę `LOG`, a silnik
>   wyprowadził człon logarytmiczny z samej struktury rezyduów i tym modelem wygrał kampanię.
> - **Czego silnik nadal NIE potrafi** — spisane wprost w
>   `docs/prompts/2026-09-13-PO-SILNIKU-podzial.md`; m.in. brak domeny interwencyjnej
>   (`PracticalCandidate.proposedProtocol` jest zawsze `null`, bo QE4 i Kepler są opisowe),
>   brak członów wielowymiarowych, brak cross-campaign dedup, EIG nadal BLOCKED.

---

GENESIS — AUTONOMOUS SCIENTIFIC DISCOVERY ENGINE
MISSION: BUILD THE ACTUAL ENGINE, NOT ANOTHER DEMO

To jest zadanie nadrzędne.

Nie chcę kolejnej warstwy dokumentacji, kolejnego mocka, kolejnego hardcoded QE4 loop ani kolejnego „frameworku na przyszłość”.

Celem jest doprowadzenie istniejącego Genesis do działającego end-to-end Scientific Discovery Engine, który potrafi:

PROBLEM
→ GENERATE HYPOTHESES
→ GENERATE NEW MODELS / MECHANISMS
→ GENERATE PREDICTIONS
→ DESIGN NEXT BEST EXPERIMENT
→ EXECUTE
→ OBSERVE
→ FALSIFY
→ REVISE
→ GENERATE NEW HYPOTHESIS / MODEL
→ REPEAT
→ CONVERGE / STOP
→ PRODUCE DISCOVERY
→ PRODUCE PRACTICAL CANDIDATE / PROTOCOL / “RECIPE”
→ PRESERVE EVIDENCE + PROVENANCE + REPLAY

Nie chodzi o to, żeby Genesis zawsze znalazł poprawną odpowiedź.
Chodzi o to, żeby potrafił rzeczywiście prowadzić autonomiczny proces naukowy i uczciwie zakończyć się:
- DISCOVERY
- SUPPORTED
- FALSIFIED
- UNRESOLVED
- CONVERGED
- STOPPED
z pełnym uzasadnieniem.

==================================================
1. ABSOLUTE RULES
==================================================

1. Nie buduj drugiego silnika obok istniejącego Genesis.
2. Najpierw zrób pełny audit repo.
3. Wykorzystaj istniejące:
   - inquiryLoop
   - discoveryLoop
   - beliefRevision
   - DiscoveryHypothesis
   - DatasetLaboratory
   - externalDatasetCase
   - Tautology Gate
   - anti-HARK
   - provenance
   - fingerprint
   - replay
   - falsification
   - scientific memory
   - existing planners / discriminability
   - existing campaign infrastructure
4. Minimalnie rozszerzaj istniejące API zamiast tworzyć równoległe abstrakcje.
5. Nie hardcode'uj QE4 jako architektury.
6. Nie używaj list typu:
   ["question1", "question2", "question3"]
   jako substytutu autonomicznego planera.
7. Nie deklaruj „autonomous”, jeśli następna akcja jest zakodowana ręcznie.
8. Nie dodawaj EIG jako fikcyjnego score tylko po to, żeby wyglądało naukowo.
9. Nie ukrywaj brakujących elementów pod nazwą interface/contract.
10. Każda istotna funkcja ma mieć runtime test.
11. DONE oznacza:
    RED test → implementation → GREEN → integration → real runtime → replay/provenance verification.
12. Jeżeli istnieją dwie konkurencyjne implementacje tego samego mechanizmu, najpierw wybierz canonical implementation według:
    - generyczność,
    - zgodność z obecną architekturą,
    - brak duplikacji,
    - reuse przez wiele domen,
    - lineage/provenance,
    - runtime verification.
    Nie zostawiaj dwóch równoległych silników bez powodu.

==================================================
2. DEFINICJA „GOTOWEGO SILNIKA”
==================================================

Genesis ma przestać być tylko:

„wybieramy hipotezę z istniejącej przestrzeni i testujemy ją”.

Ma stać się:

„sam tworzymy przestrzeń modeli i hipotez, testujemy je, odrzucamy i tworzymy kolejne”.

Minimalna różnica:

OBECNIE:

candidate space
→ choose candidate
→ test candidate

CEL:

problem
→ represent problem
→ generate candidate models
→ derive competing hypotheses
→ generate predictions
→ design experiment
→ execute
→ evaluate residuals
→ falsify
→ modify/create model
→ derive new hypothesis
→ test again

To jest główny cel projektu.

==================================================
3. PIERWSZY KROK — REPO AUDIT
==================================================

Zanim napiszesz kod:

A. Znajdź wszystkie istniejące:
- hypothesis generators
- model generators
- candidate generators
- prediction generators
- experiment selectors
- stop rules
- discovery state
- lineage
- belief revision
- residual handling
- scientific memory
- campaign orchestration
- laboratory adapters

B. Zrób mapę:

EXISTING
→ REUSE
→ EXTEND
→ MISSING

C. Znajdź duplikaty:
- P0-2 implementation variants
- QE4-specific generators
- campaign-specific planners
- duplicate anti-HARK logic
- duplicate lineage systems

D. Nie implementuj ponownie czegoś, co już istnieje.

Raport audytu ma być krótki i techniczny.
Następnie od razu implementuj.

==================================================
4. CORE: MODEL GENERATION
==================================================

To jest najważniejszy brak.

Zbuduj generyczny mechanizm:

ModelSpace
+
ModelRepresentation
+
ModelGenerator
+
ModelMutator
+
ModelEvaluator

Model musi mieć reprezentację możliwą do:
- serializacji,
- fingerprint,
- replay,
- porównania,
- mutacji,
- falsyfikacji.

Nie wymagaj od razu pełnego symbolicznego AI.

Minimalna wersja może operować na compositional model grammar.

Przykład:

CONSTANT
LINEAR
POWER
LOG
EXPONENTIAL
SATURATION
RATIONAL
PIECEWISE
INTERACTION
COMPOSITION

oraz operatorach:

ADD
MULTIPLY
DIVIDE
POWER
LOG
EXP
MIN
MAX
COMPOSE

Przykład modelu:

y = a + bx

może wygenerować:

y = a + b log(x)
y = a + b x^c
y = a(1 - exp(-bx))
y = a x^b
y = a + b x + c x²

Nie chodzi o spamowanie formułami.
Generator musi:
- respektować domain constraints,
- generować małą konkurencyjną pulę,
- eliminować duplikaty,
- zachować lineage,
- mierzyć complexity,
- umożliwiać falsification.

==================================================
5. NEW HYPOTHESIS OPERATORS
==================================================

Zaimplementuj generycznie:

COMPETE
VARIANT
ABDUCT
RESIDUAL
CONFLICT
DERIVE
MUTATE_MODEL

RESIDUAL jest obowiązkowy.

Definicja:

observed - predicted
→ characterize residual
→ detect structure
→ derive candidate explanation
→ generate new model/hypothesis

Nie wolno robić:

„residual != 0 => nowa hipoteza”

Musi istnieć logiczne kryterium struktury:
- trend,
- curvature,
- regime change,
- heteroscedasticity,
- systematic bias,
- dependence,
- temporal structure,
- spatial structure,
- subgroup effect.

Nowa hipoteza musi wskazywać:
- parent,
- residual source,
- derivation operator,
- predicted consequence,
- proposed test.

==================================================
6. PREDICTION ENGINE
==================================================

Każda hipoteza/model musi móc wygenerować:

Prediction {
  observable
  expectedPattern
  expectedRange
  assumptions
  modelFingerprint
  hypothesisFingerprint
}

Prediction NIE jest faktem.

Bezwzględnie utrzymać:
FACT
OBSERVATION
MODEL
PREDICTION
INFERENCE
HYPOTHESIS
UNKNOWN
CONFLICTING_EVIDENCE

Nie wolno awansować prediction do fact.

==================================================
7. EXPERIMENT DESIGNER
==================================================

Zbuduj generyczny mechanizm:

ExperimentCandidate
→ evaluate discrimination
→ evaluate feasibility
→ evaluate falsification power
→ evaluate novelty
→ evaluate redundancy
→ select next experiment

Wykorzystaj istniejące:
- discriminability
- selectMostDiscriminatingExperiment
- beliefRevision
- laboratory
- provenance

Nie implementuj „EIG” jako pustego wzoru.

Jeżeli pełne EIG jest obecnie BLOCKED:
- nie udawaj EIG,
- zbuduj istniejący verified planner score,
- nazwij go zgodnie z rzeczywistą semantyką.

Planner ma odpowiadać na:

„Który następny eksperyment najbardziej rozdziela żyjące hipotezy przy akceptowalnym koszcie/ryzyku?”

a nie:

„jaki eksperyment jest pierwszy na liście?”

==================================================
8. AUTONOMOUS CAMPAIGN LOOP
==================================================

Zbuduj generyczny loop:

for each round:

1. READ DISCOVERY STATE
2. GENERATE / UPDATE HYPOTHESES
3. GENERATE / MUTATE MODELS
4. GENERATE PREDICTIONS
5. BUILD EXPERIMENT CANDIDATES
6. SCORE EXPERIMENTS
7. APPLY ANTI-HARK
8. APPLY TAUTOLOGY GATE
9. EXECUTE
10. OBSERVE
11. UPDATE BELIEFS
12. CALCULATE RESIDUALS
13. FALSIFY
14. GENERATE NEW HYPOTHESES
15. UPDATE MEMORY
16. CHECK STOP RULE
17. REPLAY-CHECK ROUND
18. CONTINUE OR STOP

Nie wolno mieć ręcznie zakodowanej „next question list”.

==================================================
9. STOP RULES
==================================================

Wykorzystaj istniejące, nie twórz siedmiu nowych słowników.

Minimalnie:

CONVERGENCE
NO_INFORMATION_GAIN
ROUND_BUDGET_EXHAUSTED
ANTI_HARKING_VIOLATION
ALL_HYPOTHESES_FALSIFIED
ROBUST_WINNER

CONVERGENCE musi mieć mierzalny warunek.

NO_INFORMATION_GAIN musi być oparty na rzeczywistym stanie rund, nie na komentarzu.

==================================================
10. SCIENTIFIC MEMORY
==================================================

Każda runda musi zapisywać:

campaignId
roundId
parentHypothesisId
generatedBy
modelFingerprint
predictionFingerprint
experimentFingerprint
observationFingerprint
resultFingerprint
beliefRevision
residualSummary
decisionBasis
stopDecision

Genesis musi po kampanii wiedzieć:

„Dlaczego jestem obecnie przy tej hipotezie?”

==================================================
11. OUTPUT: DISCOVERY
==================================================

Na końcu kampanii Genesis ma produkować nie tylko:

winner = hypothesis-X

ale:

Discovery {
  question
  survivingHypotheses
  falsifiedHypotheses
  winningModel
  supportingEvidence
  counterEvidence
  uncertainty
  assumptions
  residuals
  nextExperiment
  practicalCandidate
  decisionBasis
}

==================================================
12. „PRZEPIS” / PRACTICAL SOLUTION
==================================================

To jest ważne.

Genesis ma umieć przejść z:

SCIENTIFIC DISCOVERY

do:

PRACTICAL CANDIDATE

ale NIE może zmyślać przepisu.

Wynik ma być zależny od domeny:

np.
- materiał → composition + process parameters
- chemia → candidate compound + synthesis constraints
- biologiczny system → intervention candidate + measurable protocol
- engineering → design parameters
- policy → evidence-backed intervention scenario

Wspólny kontrakt:

PracticalCandidate {
  derivedFromHypothesis
  derivedFromModel
  supportingEvidence
  uncertainty
  constraints
  requiredValidation
  proposedProtocol
}

`proposedProtocol` może być konkretny tylko wtedy, gdy istnieją wystarczające podstawy.

Nigdy nie fabrykuj parametrów.

==================================================
13. PIERWSZY PRAWDZIWY DEMONSTRATOR
==================================================

Po zbudowaniu generycznego silnika NIE wystarczy unit test.

Wymagane są minimum DWA prawdziwe end-to-end cases:

CASE A:
QE4 / pinned external dataset

CASE B:
drugi istniejący domain adapter, który NIE jest QE4.

Cel:

Ten sam discovery engine.

Nie:

QE4 engine
+
drugi specjalny engine.

Musi być:

GENERIC DISCOVERY ENGINE
+
LABORATORY ADAPTER

Dla każdego case:

INPUT
→ autonomous rounds
→ generated competing models
→ prediction
→ experiment selection
→ execution
→ residual
→ new hypothesis
→ stopping
→ evidence
→ replay

==================================================
14. DOWÓD, ŻE TO NIE JEST HARDCODED
==================================================

Dodaj test/proof, który zmieni:
- dataset,
- domain adapter,
lub model grammar

i pokaże, że engine nadal sam generuje hipotezy i kolejne eksperymenty.

Nie wystarczy ten sam QE4 dataset z inną nazwą.

==================================================
15. DOWÓD „NOWEGO MODELU”
==================================================

W co najmniej jednym case:

model A
→ prediction
→ residual
→ model B

gdzie model B NIE był wcześniej jawnie zarejestrowany jako kandydat.

To jest krytyczny acceptance criterion.

Jeżeli nie zachodzi:

„model B powstał po obserwacji residualu”

to engine nadal nie jest prawdziwym discovery engine.

==================================================
16. ANTI-HARK / CIRCULARITY
==================================================

Każda nowa hipoteza musi przejść:

- anti-HARK
- tautology gate
- provenance
- fingerprint

przed potraktowaniem jej jako kandydat badawczy.

Nie wolno tworzyć hipotezy po zobaczeniu wyniku i udawać, że była prerejestrowana.

Nowa hipoteza może być PO-RESULT DERIVED,
ale musi być jawnie oznaczona jako:
generatedAfterObservation = true

oraz mieć:
parentResultFingerprint.

==================================================
17. SAFETY / DOMAIN BOUNDARIES
==================================================

Nie rozszerzaj istniejących safety boundaries.

Dla medycyny:
- populacyjne wnioski naukowe,
- żadnych recept,
- żadnych indywidualnych dawek,
- żadnej indywidualnej porady.

Dla polityki:
- Genesis analizuje,
- Genesis może wskazywać konsekwencje,
- Genesis nie wydaje dekretów.

==================================================
18. TDD / EXECUTION STANDARD
==================================================

Każdy nowy komponent:

RED
→ GREEN
→ integration
→ real runtime
→ replay
→ provenance
→ full gate

Obowiązkowo:

- frontend tests
- backend tests jeśli dotknięty
- typecheck
- lint
- build
- repro-demo
- Chromium/E2E tam, gdzie dotyczy
- real dataset run

==================================================
19. ACCEPTANCE TEST — NAJWAŻNIEJSZY
==================================================

Na koniec muszę móc uruchomić:

genesis discover <problem>

lub równoważny istniejący entrypoint

i zobaczyć:

ROUND 1
generated hypotheses: [...]
selected experiment: [...]
result: [...]

ROUND 2
generated models: [...]
residual detected: [...]
new hypothesis: [...]

ROUND 3
experiment selected because: [...]

...

FINAL:
DISCOVERY / SUPPORTED / FALSIFIED / UNRESOLVED

z pełną:
provenance
lineage
belief revision
fingerprints
replay

Nie przyjmuję jako dowodu:
- screenshotu,
- komentarza,
- samego testu jednostkowego,
- dokumentacji,
- „architecture ready”.

Ma działać.

==================================================
20. CO MASZ TERAZ ZROBIĆ
==================================================

Nie pytaj mnie, czy możesz zacząć.

Zacznij od repo audit.

Następnie:

PHASE 1
canonicalize istniejące P0-2 implementations

PHASE 2
zbuduj generic ModelRepresentation / ModelGenerator / ModelMutator

PHASE 3
zbuduj residual → new model/hypothesis pipeline

PHASE 4
podłącz prediction + experiment selection

PHASE 5
zbuduj generic autonomous discovery campaign

PHASE 6
podłącz memory + provenance + replay + anti-HARK

PHASE 7
QE4 end-to-end

PHASE 8
DRUGI domain end-to-end

PHASE 9
practical candidate / protocol output

PHASE 10
full verification

Nie zatrzymuj się na P0.x tylko dlatego, że P0.x wygląda na „ukończone”.

P0 jest środkiem, nie celem.

CEL = RZECZYWISTY AUTONOMOUS SCIENTIFIC DISCOVERY ENGINE.

==================================================
21. RAPORT KOŃCOWY
==================================================

Raport dopiero po wykonaniu pracy.

Ma zawierać:

1. co było już w repo,
2. co rozszerzyłeś,
3. co było brakujące,
4. jakie nowe API powstały,
5. jakie duplikaty zostały usunięte/canonicalized,
6. jakie realne eksperymenty wykonano,
7. przykład:
   model A → residual → model B,
8. przykład autonomicznego wyboru kolejnego eksperymentu,
9. wynik QE4,
10. wynik drugiej domeny,
11. provenance/fingerprint/replay,
12. pełne wyniki testów,
13. czego NADAL nie potrafi,
14. dokładnie dlaczego nadal nie potrafi.

Nie pisz „completed” dla funkcji, która istnieje tylko jako interface albo stub.

Jeżeli któryś element pozostanie niezaimplementowany, powiedz to wprost.

JEDYNY CEL:
sprawić, żeby Genesis naprawdę potrafił prowadzić autonomiczny proces odkrywania naukowego, a następnie wygenerować oparty na dowodach praktyczny kandydat/protokół tam, gdzie dane i model na to pozwalają.