# Genesis — Supplemental Knowledge Provenance

**Status:** addytywny rejestr źródeł. Dokument nie rozszerza listy 20 autorytatywnych plików corpus, nie zmienia równań modelu i nie nadaje teorii statusu wyniku eksperymentu. Wpisy są dostępne dla `ExperimentIntent`, `ExperimentPlan`, `ExperimentRun` i `ScientificEvidencePack` przez `supplementalKnowledgeIds`.

| Identyfikator | Treść | Status epistemiczny | Stan engine | Źródło |
|---|---|---|---|---|
| `chaos-sensitive-initial-conditions` | Wrażliwość nieliniowych układów deterministycznych na warunki początkowe, znana jako efekt motyla. | Teoria | `CAPABILITY_SEAM`; aktualny Kepler dwóch ciał nie jest demonstracją chaosu. | American Physical Society, historia prac E. Lorenza [1] |
| `einstein-special-relativity` | Szczególna względność w zakresie modelu Lorentza. | Teoria | `REAL_ENGINE`: `sr-lorentz`. | Einstein Portal / Collected Papers [2] |
| `einstein-general-relativity-static` | Analityczna granica Schwarzschilda oraz obliczenia masy chirp. | Teoria | `REAL_ENGINE` w ograniczonym zakresie: `einstein-schwarzschild`, `einstein-chirp-mass`. | Einstein Portal / Collected Papers [2] |
| `einstein-photoelectric-effect` | Model kwantu światła i efekt fotoelektryczny. | Model | `CAPABILITY_SEAM`; `photon-energy` oblicza energię, nie pełną fotoemisję materiałową. | Nobel Prize — Einstein Facts [3] |
| `tesla-polyphase-ac-history` | Historyczny kontekst układów AC i silnika indukcyjnego Tesli. | Fakt źródłowy | `ENGINE_NOT_AVAILABLE` dla modelu maszyny elektrycznej. | Publiczna wyszukiwarka patentów USPTO [4] |
| `video-n-psychological-observer` | Teza o wpływie obserwacji własnych procesów psychicznych. | Hipoteza | `ENGINE_NOT_AVAILABLE`; wymaga walidowanego modelu poznawczego i danych empirycznych. | Materiał użytkownika: `N_JAnj77Svc` [5] |
| `video-n-scenario-inner-thermostat` | Parametr zachowania agenta dążącego do stanu wewnętrznego. | Założenie scenariusza | `ENGINE_NOT_AVAILABLE`; wymaga jawnego modelu decyzyjnego, kontroli i testów wrażliwości. | Materiał użytkownika: `N_JAnj77Svc` [5] |

> **Reguła interpretacji.** Wpis może wzbogacić pytanie, hipotezę, parametr scenariusza lub provenance. Wynik liczbowy albo przestrzenny powstaje wyłącznie z istniejącego realnego engine. `ENGINE_NOT_AVAILABLE` jest poprawną odpowiedzią, nie brakującym mockiem.

## Wideo w kolejce

Pozostałe URL-e przekazane przez użytkownika są zapisane w [`GENESIS_VIDEO_KNOWLEDGE_QUEUE.md`](../genesis_delivery/GENESIS_VIDEO_KNOWLEDGE_QUEUE.md) poza repozytorium. Nie zostały zaklasyfikowane na podstawie samych tytułów. Zostaną analizowane treściowo w kolejnym, odrębnym etapie bez blokowania prac nad silnikami.

## References

[1] [American Physical Society — *Circa January 1961: Lorenz and the Butterfly Effect*](https://www.aps.org/archives/publications/apsnews/200301/history.cfm)

[2] [Einstein Portal — *The Collected Papers of Albert Einstein*](https://einsteinpapers.press.princeton.edu/)

[3] [Nobel Prize — *Albert Einstein: Facts*](https://www.nobelprize.org/prizes/physics/1921/einstein/facts/)

[4] [United States Patent and Trademark Office — public patent search](https://ppubs.uspto.gov/pubwebapp/)

[5] [YouTube — materiał przekazany przez użytkownika: `N_JAnj77Svc`](https://youtu.be/N_JAnj77Svc?is=oZTcaT_WfIVvkLK)
