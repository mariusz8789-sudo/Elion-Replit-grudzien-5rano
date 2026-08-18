# Genesis Reproducible Scenario Capsule — kontrakt

## Cel

Scenario Capsule jest przenośnym, deterministycznym rekordem scenariusza, który umożliwia drugiej osobie zobaczenie **dokładnie tego**, co zostało uruchomione i ponowne wykonanie tego samego requestu. Kapsuła nie przechowuje niezależnej prawdy naukowej: referuje istniejące `ExperimentRun`, `CounterfactualComparison` i opcjonalny `ScientificEvidencePack`.

> Kapsuła zachowuje provenance istniejących artefaktów. Nie tworzy nowego World State, Event Engine, silnika ani wyników.

## Zawartość

| Element | Źródło prawdy | Warunek |
|---|---|---|
| Baseline request i realny run | `ExperimentRun` | Run musi mieć `status = completed` oraz `resultOrigin = real-engine`. |
| Wariant A/B | `CounterfactualComparison` | Jeśli występuje, comparison musi być `COMPLETED`, a jego fingerprinty muszą odpowiadać kapsułowanym runom. |
| Seed, model, engine, wersja, parametry | `ExperimentRun.provenance` | Kopiowane bez przekształcania. |
| Wynik i jednostki | `ExperimentRun.result` | Nie są obliczane ponownie przez kapsułę. |
| Evidence Pack | `ScientificEvidencePack` | Opcjonalny; jeżeli występuje, musi zawierać referencję do co najmniej jednego kapsułowanego realnego runu. |
| Identyfikator kapsuły | Deterministyczny fingerprint | Opiera się tylko na istniejących fingerprintach, referencjach i nazwie scenariusza. |

## Tworzenie

```ts
createScenarioCapsule({
  title: 'Schwarzschild: 1 M☉ vs 2 M☉',
  baselineRun: comparison.baseline,
  variantRun: comparison.variant,
  comparison,
  evidencePack, // opcjonalny, gdy istnieje prawdziwy prerejestrowany protocol
})
```

Funkcja odrzuca niedokończony run, `knowledge_only`, `capability_seam`, `engine_not_available`, sfałszowany comparison lub Evidence Pack bez powiązanego rzeczywistego runu.

## Odtworzenie

`replayScenarioCapsule()` nie ufa zapisanemu outputowi jako wynikowi re-run. Uruchamia istniejący `runExperiment` ponownie z `baselineRun.request`, a gdy kapsuła ma wariant — istniejący `compareCounterfactual()` na zapisanych requestach. Następnie porównuje nowe `runFingerprint` z oryginałem i zwraca `MATCH`, `DRIFT` lub `NOT_COMPARABLE`.

| Stan replay | Znaczenie |
|---|---|
| `MATCH` | Canonical fingerprint każdego re-run odpowiada kapsule. |
| `DRIFT` | Re-run zakończył się, ale fingerprint odbiega od kapsuły; nie ukrywamy różnicy. |
| `NOT_COMPARABLE` | Re-run nie ukończył się albo capsule nie jest kompletna. |

## Granice

Kapsuła nie gwarantuje replikacji na innym runtime’ie, nie kalibruje modelu względem świata rzeczywistego i nie zastępuje eksperckiego review. Przenosi tylko to, co Genesis faktycznie wykonał wraz z wystarczającym kontekstem do ponownego uruchomienia w granicach tego samego systemu.

## Minimalne testy

1. Kapsuła prawdziwego Schwarzschild A/B zachowuje requests, model/version/engine, fingerprinty, seed control i porównanie.
2. Re-run deterministycznej kapsuły zwraca `MATCH` bez tworzenia nowego provenance poza nowymi canonical runami executor.
3. Kapsuła odrzuca run bez `real-engine` provenance.
4. Kapsuła odrzuca comparison, którego run fingerprint nie pasuje do przekazanych runów.
5. Serializacja kapsuły jest deterministyczna.
