# Genesis — Continuous Competitive R&D Policy

## Cel

Po zamknięciu aktualnie możliwych etapów roadmapy Genesis nie zatrzymuje pracy, ale przechodzi do uporządkowanego **Continuous Competitive R&D**. Celem nie jest kopiowanie UI, kodu, zamkniętych workflowów ani katalogów solverów konkurencji. Celem jest wybór i dowiezienie **jednej własnej przewagi**, która pozwala użytkownikowi powiedzieć naturalnym językiem, co chce sprawdzić, a następnie otrzymać rzeczywiście uruchomiony, zrozumiały i odtwarzalny eksperyment.

> Zasada główna: Genesis buduje tylko tę przewagę, która jest jednocześnie użyteczna, prawdziwa wobec stanu modeli i zgodna z jednym `World State`, jednym Event Engine oraz jednym Experiment Fabric.

## Niezmienne granice architektury

| Inwariant | Reguła |
|---|---|
| Jeden świat | Nie tworzyć drugiego World State ani alternatywnego renderera dla nowej funkcji. |
| Model-first | Model/solver jest źródłem wyników; LLM, UI, renderer i eksport nie mogą wytwarzać liczb udających wynik naukowy. |
| Brak fałszywych solverów | Brak runtime’u, licencji, danych lub walidacji pozostaje jawnym `ENGINE_NOT_AVAILABLE` / seamem. |
| Odtwarzalność | Każdy wykonany eksperyment zachowuje parametry, wersje, seed, provenance, ograniczenia i wynik. |
| Event truth | Event Engine przyjmuje tylko rzeczywiste zdarzenia modelu albo jawne akcje użytkownika z provenance. |
| Rozdział fikcji i faktu | Science fiction, popularnonaukowe inspiracje oraz wideo mogą podpowiadać scenariusz lub hipotezę, lecz nie stają się faktem ani capability. |
| Własna implementacja | Nie kopiować kodu, UI, modeli zamkniętych, licencjonowanych assetów ani zastrzeżonych workflowów konkurencji. |

## Bramka wyboru funkcji

Każda kandydatura otrzymuje ocenę 0–2 w sześciu wymiarach. Wdrożenie wymaga **minimum 10/12**, z obowiązkowym wynikiem 2 w polach „prawda naukowa” i „integralność architektury”.

| Wymiar | 0 | 1 | 2 |
|---|---|---|---|
| Wartość dla użytkownika | Efekt kosmetyczny lub niejasny buyer value. | Pomaga w istniejącym workflow. | Skraca drogę od pytania do rozstrzygalnego eksperymentu lub dowodu. |
| Własna przewaga | Kopia powszechnej funkcji. | Lepsza integracja znanej funkcji. | Trudny do zastąpienia workflow Genesis: NL → model → realny run → evidence. |
| Zgodność z architekturą | Wymaga drugiego świata/modelu/provenance. | Wymaga ograniczonego seam. | Rozszerza istniejący Fabric bez duplikacji. |
| Prawda naukowa | Wymaga fikcyjnego solvera, wyniku lub danych. | Wymaga widocznego `ENGINE_NOT_AVAILABLE`. | Działa na rzeczywistym modelu, danych lub jawnie zewnętrznym wykonawcy. |
| Wykonalność milestone’u | Wielomiesięczny program bez granicy MVP. | Zależność zewnętrzna lub duży refactor. | Addytywny milestone możliwy do walidacji testem i E2E. |
| Dowód i odtwarzalność | Nie można udowodnić działania. | Dowód częściowy. | Test, provenance i Evidence Pack potwierdzają całą pętlę. |

## Aktualna mapa przewag i luk

| Obszar | Co Genesis ma dziś | Główna luka | Właściwa reakcja R&D |
|---|---|---|---|
| Pytanie → eksperyment | StructuredExperimentRequest, parser/routing, realne dostępne modele, plan/execute/evidence. | Natural-language parsing ma ograniczony zakres i wymaga bezpiecznej semantyki. | Rozwijać plan z potwierdzeniem, capability disclosure i evaluation, nie „autonomiczną prawdę LLM”. |
| Evidence Pack | Protocol, kontrola, replikacja, provenance i minimalny RO-Crate/PROV-DM export. | Brak pełnego pakietu artefaktów oraz niezależnego runnera. | Priorytet: Evidence Pack jako przenośny dowód, dopiero później pełny workflow profile. |
| Model A vs B | Deterministyczne runy i experiment arms są dostępne. | Brak prostego, czytelnego produktu kontrfaktycznego dla użytkownika. | Kandydat USP: *Counterfactual Evidence Compare* na prawdziwych runach. |
| Multi-domain | Guardrails blokują niezgodne transfery; adapter seams są jawne. | Brak zwalidowanych transferów między prawdziwymi solverami. | Dodawać pojedyncze, uzasadnione połączenie z testem jednostek i ekspertem; nie tworzyć kaskad marketingowych. |
| Digital twin | OSM provenance, świat 3D i modele scenariusza. | Brak sensorów, data assimilation, kalibracji i real-time feedback. | Nie deklarować production twin; wybrać pilota z realnymi danymi przed integracją. |
| High-fidelity 3D | PBR/LOD street slice, renderer konsumujący realny model, fallback 2D. | Uliczny E2E dla camera close-up pozostaje niepotwierdzony; brak skali/benchmarków docelowych. | Najpierw domknąć dowód wizualny, potem rozwijać interoperacyjność OpenUSD jako seam. |

## Priorytety poszukiwania USP

1. **Counterfactual Evidence Compare:** jeden człowiek mówi „co jeśli?”, Genesis tworzy dwa jawne warianty tego samego realnego modelu, uruchamia je z kontrolowanymi seedami, porównuje mierzalne różnice i eksportuje dowód.
2. **Evidence-guided Chat Plan:** Chat nie odpowiada ogólną teorią, tylko pokazuje wybrany model, dostępne capability, parametry, ograniczenia i prosi o potwierdzenie wykonania.
3. **Safe multi-domain handoff:** Genesis pokazuje nie tylko dopuszczony transfer, ale dlaczego dany transfer jest blokowany: jednostki, skala, brak solvera, brak modelu pośredniego albo brak walidacji.
4. **Reproducible scenario capsule:** mała, przenośna definicja scenariusza i Evidence Pack, którą druga osoba może otworzyć, odtworzyć oraz poddać review.
5. **Human-readable uncertainty:** wynik wyraźnie odróżnia output silnika, założenie scenariusza, teorię referencyjną, hipotezę i wynik `ENGINE_NOT_AVAILABLE`.

## Procedura autonomiczna

| Krok | Działanie |
|---|---|
| 1. Skan | Badać konkurencję, standardy i interakcje wyłącznie na źródłach pierwotnych/wiarygodnych. |
| 2. Porównanie | Zapisać: co mają, czego Genesis nie ma, co Genesis robi lepiej i jaka luka użytkownika nie jest jeszcze dobrze obsłużona. |
| 3. Selekcja | Oceniać kandydatury kartą 0–12; odrzucać rzeczy poniżej 10 lub naruszające inwarianty. |
| 4. Milestone | Wybrać **jedno** USP z konkretnym wejściem, realnym modelem, testem, E2E/provenance i Definition of Done. |
| 5. Implementacja | Zmiany addytywne, minimalne, bez nowego dashboardu, bez drugiego świata i bez semantycznych obietnic ponad dostępny solver. |
| 6. Dowód | Build, lint, testy, `git diff --check`, evidence output oraz dokumentacja granic. |
| 7. Publikacja | Commit i jedna próba push po bramce jakości; błąd 403 dokumentować, ale nie zatrzymywać pracy lokalnej. |

## Kiedy nie implementować

Nie implementować funkcji, gdy nie ma realnego modelu, nie ma danych i jest to konieczne do obiecanego wyniku, funkcja wymaga drugiego World State, nie daje użytkownikowi decyzji/eksperymentu/dowodu, albo jest tylko imitacją produktu konkurenta. Zamiast tego udokumentować seam, zachować poprawny status capability i przejść do następnej technicznie możliwej przewagi.

## Oczekiwany raport po milestone’ie

Każdy zakończony milestone R&D zawiera: **co ma konkurencja → czego Genesis nie ma → co Genesis robi lepiej → co zbudowano → jakie są granice → testy i provenance → TOP 5 przewag Genesis → TOP 3 następne funkcje przyciągające użytkowników**.
