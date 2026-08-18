# Genesis Competitive R&D — decyzja o milestone’ie USP

**Data:** 18 sierpnia 2026
**Wybrany milestone:** **Counterfactual Evidence Compare**

## Problem użytkownika

Narzędzia symulacyjne zazwyczaj wymagają, aby użytkownik najpierw umiał zbudować model, wybrać eksperyment, dobrać parametry, zapamiętać warianty, a dopiero potem porównać wyniki. AnyLogic udostępnia multimethod modelling, experiments, GIS oraz cloud comparison; SimScale i Ansys dostarczają szerokie środowiska solverów i workflowów; Esri łączy dane przestrzenne i digital-twin views; GAMA jest środowiskiem spatial ABM. [1] [2] [3] [4] [5]

Genesis nie powinien kopiować ich katalogów, edytorów lub dashboardów. Własną przewagą może być krótsza, uczciwa pętla:

> **„Porównaj co się stanie w wariancie A oraz B” → te same modele → realne runy → mierzalne różnice → jawne provenance → eksportowalny dowód.**

## Porównanie konkurencji i własnej luki

| Platforma | Co ma | Czego Genesis dziś nie ma | Co Genesis może zrobić lepiej bez kopiowania |
|---|---|---|---|
| AnyLogic | Multimethod modelling, biblioteki branżowe, GIS, cloud experiments i comparison. [1] | Pełny graficzny edytor modeli i szeroki zestaw bibliotek. | Zamiast wymagać budowy modelu, pokazać czytelne porównanie tylko dostępnych, rzeczywiście uruchamianych modeli wraz z ich granicami. |
| Ansys Twin Builder | Systemy multidomain, reduced-order models, co-simulation, FMI i industrial digital twins. [2] | Zweryfikowane solvery i przemysłowe toolchainy. | Wyróżnić *dowód eksperymentu* ponad konfigurację toolchainu: parametry, seedy, model, wynik, kontrola i eksport provenance. |
| SimScale | Cloud-native multiphysics, elastic compute, enterprise governance i uporządkowane dane uruchomień. [3] | Compute, enterprise controls i katalog wysokiej jakości solverów. | Rozpocząć od jednoznacznego, ludzkiego „A vs B” opartego o realne runy oraz zrozumiałą niepewność. |
| Esri | Geospatial digital twin, dane i kontekst przestrzenny, temporalne warstwy oraz integracja sensorów. [4] | Produkcyjny GIS/time-series/sensor twin. | Nie deklarować living twin przed czasem; pozwolić porównać odtwarzalne scenariusze modelu zanim zbuduje się integrację danych. |
| GAMA | Open-source, spatially explicit agent-based modelling. [5] | Uniwersalny język modelowania agentowego i IDE. | Udostępnić proste eksperymentowanie nad istniejącymi zwalidowanymi modelami bez ukrywania provenance. |

## Ocena kandydatów

Ocena zgodnie z `GENESIS_CONTINUOUS_COMPETITIVE_RND.md`: minimum 10/12 i 2 pkt dla prawdy naukowej oraz integralności architektury.

| Kandydat | Użytkownik | Własna przewaga | Architektura | Prawda | Wykonalność | Dowód | Suma | Decyzja |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| **Counterfactual Evidence Compare** | 2 | 2 | 2 | 2 | 2 | 2 | **12** | **Wybrany** |
| Evidence-guided Chat Plan | 2 | 2 | 2 | 2 | 1 | 2 | 11 | Następny; wymaga bezpiecznej semantyki NL i UX potwierdzenia. |
| Safe multi-domain handoff explainer | 1 | 2 | 2 | 2 | 2 | 2 | 11 | Następny po pierwszym realnym, naukowo uzasadnionym połączeniu domen. |
| Reproducible scenario capsule | 1 | 2 | 2 | 2 | 2 | 2 | 11 | Częściowo pokryte przez Evidence Pack/RO-Crate; nie duplikować teraz. |
| Real-time digital twin / sensory | 2 | 2 | 1 | 0 | 0 | 1 | 6 | Odrzucony: wymaga danych, kalibracji i zewnętrznego pilota. |
| Katalog „wszystkich solverów” | 1 | 0 | 1 | 0 | 0 | 0 | 2 | Odrzucony: byłby imitacją konkurencji i fałszywą capability. |

## Definicja milestone’u

`Counterfactual Evidence Compare` jest małym, czysto model-first kontraktem w `Experiment Fabric`:

| Element | Zakres |
|---|---|
| Wejście | Dwa istniejące `StructuredExperimentRequest`: baseline A oraz wariant B. |
| Guardrail | Ten sam model i domena, obie walidacje przechodzą, oba runy pochodzą wyłącznie z `runExperiment`. Przy porównaniu stochastycznym seed musi być jawnie taki sam albo wynik jest oznaczony jako niekontrolowany. |
| Wykonanie | Dwa rzeczywiste `ExperimentRun` z istniejącego executora. Brak drugiego modelu, świata lub stanu eventów. |
| Wynik | Wspólne numeryczne metryki, baseline, wariant, delta absolutna, delta względna, jednostka oraz jawne ograniczenia. |
| Dowód | Run IDs, fingerprinty, model/version/engine, różnice parametrów, status kontroli seedów, warningi i disclaimer. |
| Granica | To porównanie **wewnątrz modelu**, nie predykcja świata, dowód przyczynowości ani rekomendacja działania. |
| Interoperacyjność | Każdy bazowy run pozostaje kompatybilny z istniejącym Evidence Pack i eksportem RO-Crate. Milestone nie tworzy drugiej reprezentacji provenance. |

## Czego nie robimy

Nie budujemy nowego dashboardu, edytora modeli, LLM parsera, zewnętrznego solvera, automatycznej polityki publicznej, rekomendacji decyzyjnej, integracji czujników ani fałszywej symulacji interwencji, której model epidemii nie obsługuje. Przykładowo „zamknięcie szkół” pozostaje niewykonalne, dopóki istniejący model nie ma jawnego parametru i semantyki tej interwencji.

## References

[1]: https://www.anylogic.com/ "AnyLogic — Simulation Modeling Software"
[2]: https://ansys.synopsys.com/products/digital-twin/ansys-twin-builder "Ansys — Twin Builder"
[3]: https://www.simscale.com/product/cloud-native-simulation/ "SimScale — Cloud-Native Simulation"
[4]: https://www.esri.com/en-us/digital-twin/overview "Esri — Digital Twin"
[5]: https://gama-platform.org/ "GAMA Platform"
[6]: /home/ubuntu/genesis_repo/docs/GENESIS_CONTINUOUS_COMPETITIVE_RND.md "Genesis — Continuous Competitive R&D Policy"
