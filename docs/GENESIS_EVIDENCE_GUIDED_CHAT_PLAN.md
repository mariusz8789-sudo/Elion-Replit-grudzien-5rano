# Genesis Evidence-Guided Chat Plan — kontrakt

## Cel

Ten milestone zmienia ścieżkę Science Chat z natychmiastowego wykonania na bezpieczną, dwustopniową pętlę:

> Natural Language → `StructuredExperimentRequest` → jawny plan → **potwierdzenie użytkownika** → `runExperiment` → realny `ExperimentRun` → provenance / właściwy Evidence Pack lub A/B.

Chat nie jest LLM-em wyznaczającym parametry, capability ani wyniki. Parser pozostaje deterministycznym routerem nad zarejestrowanymi modelami. `planEvidenceGuidedExperiment()` wyłącznie projektuje istniejący request przez `createExperimentIntent()` i `createExperimentPlan()`; nie uruchamia modelu.

## Stan planu

| Stan | Znaczenie | Czy można potwierdzić? |
|---|---|---|
| `READY_FOR_CONFIRMATION` | Request jest poprawny, istnieje `REAL_ENGINE`, a router wskazał konkretny model i engine. | Tak, dokładnie ten sam request zostanie wykonany. |
| `ENGINE_NOT_AVAILABLE` | Domena/model nie ma dostępnego realnego silnika albo capability wymaga zewnętrznej zależności. | Nie. Pokazywany jest wymagany solver i jawne ograniczenie. |
| `INVALID_REQUEST` | Request łamie istniejącą walidację routera. | Nie. Pokazywane są błędy walidacji. |

## Ujawnienia przed potwierdzeniem

Każdy plan pokazuje użytkownikowi:

| Pole | Źródło prawdy |
|---|---|
| Model, wersja i engine | `ExperimentPlan` oraz `RouterModel` |
| Capability i czy wynik będzie realnym runem | `ExperimentIntent.capability` i `ExperimentPlan.runnable` |
| Parametry requestu oraz dopuszczalna schema | `StructuredExperimentRequest` i `ExperimentPlan.parameterSchema` |
| Seed, operation i route wizualizacji | `StructuredExperimentRequest` / `ExperimentPlan.route` |
| Rationale, wymagany solver, corpus i ograniczenia | `ExperimentIntent` oraz Knowledge Registry |
| Result origin po wykonaniu | `ExperimentRun.provenance.resultOrigin` |

## Potwierdzenie i integralność

`confirmEvidenceGuidedExperiment()` rekonstruuje plan z requestu, weryfikuje jego deterministyczny `confirmationId` i dopiero wtedy wywołuje istniejący `runExperiment`. Przekazanie zmodyfikowanego obiektu planu albo planu bez `READY_FOR_CONFIRMATION` jest odrzucane. Nie ma osobnego executora, World State ani magazynu provenance.

## Handoff do Evidence Pack i Counterfactual Compare

| Artefakt | Co się dzieje po potwierdzeniu | Granica prawdy |
|---|---|---|
| `ExperimentRun` | Powstaje zawsze, gdy wskazany model wykona realny run. | Jest kanonicznym runem i provenance. |
| `ScientificEvidencePack` | Nie jest automatycznie tworzone dla jednego pytania, ponieważ istniejący pack wymaga prerejestrowanego `ScientificEvidenceChain` z kontrolami i replikacją. Outcome zwraca jawny status `PROTOCOL_REQUIRED` oraz canonical run do użycia w protokole. | Nie udajemy kontroli, hipotezy ani replikacji. |
| `Counterfactual Evidence Compare` | Nie jest automatycznie tworzone dla jednego wariantu. Outcome zwraca status `VARIANT_REQUIRED`; drugi jawny request uruchamia istniejący `compareCounterfactual`. | Nie tworzymy wariantu ani wyniku A/B bez wejścia użytkownika. |
| World 3D / lab | Istniejący route może otrzymać realny run tylko po sukcesie. | Renderer dalej jest konsumentem read-only. |

## Science Chat UX

1. Wiadomość wskazująca model/domenę generuje plan, nie run.
2. Chat wypisuje: model, engine, capability, parametry, seed, route, ograniczenia i czy będzie realny wynik.
3. Przy `READY_FOR_CONFIRMATION` użytkownik wpisuje „potwierdź” albo używa przycisku „Uruchom potwierdzony plan”.
4. „anuluj” usuwa pending plan bez działania.
5. `ENGINE_NOT_AVAILABLE` nigdy nie oferuje uruchomienia.

## Dowód testowy

Testy muszą wykazać:

1. Plan Schwarzschilda ujawnia realny engine, model, parametry i stan gotowy, ale nie wykonuje runu.
2. Potwierdzenie dokładnego planu wykonuje realny run oraz zwraca `real-engine` provenance.
3. Zmodyfikowany plan jest odrzucony przed wykonaniem.
4. Nieobsługiwany solver pozostaje `ENGINE_NOT_AVAILABLE`, nie może zostać potwierdzony i nie zawiera wyniku.
5. Science Chat dla requestu pokazuje plan przed uruchomieniem, a `potwierdź` uruchamia wynik istniejącą ścieżką.
