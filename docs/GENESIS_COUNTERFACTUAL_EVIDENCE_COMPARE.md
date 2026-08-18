# Genesis Counterfactual Evidence Compare — kontrakt milestone’u

## Intencja użytkownika

Użytkownik może postawić pytanie typu „co się zmieni, jeśli w wariancie B parametr będzie inny niż w wariancie A?”. Genesis nie odpowiada wtedy ogólną narracją ani nie generuje nowej fizyki. Tworzy dwa istniejące `StructuredExperimentRequest`, uruchamia istniejący `runExperiment` dwa razy i zwraca porównanie wyłącznie w granicach wspólnego modelu.

> Counterfactual Evidence Compare pokazuje **różnicę między dwoma realnymi wynikami tego samego modelu**. Nie jest predykcją świata rzeczywistego, rekomendacją interwencji, dowodem przyczynowości ani automatycznym odkryciem.

## Wejście i guardraile

```ts
interface CounterfactualComparisonInput {
  baseline: StructuredExperimentRequest;
  variant: StructuredExperimentRequest;
  labels?: { baseline?: string; variant?: string };
}
```

| Warunek | Zachowanie |
|---|---|
| Baseline albo variant nie przechodzi istniejącej walidacji routera | Zwrócić `BLOCKED_INVALID_REQUEST`; nie uruchamiać modelu. |
| Domena lub `modelId` są różne | Zwrócić `BLOCKED_MODEL_MISMATCH`; nie uruchamiać modelu. Model-vs-model jest osobnym, późniejszym problemem metodologicznym. |
| Te same requesty | Uruchomić oba realne runy; wynik może mieć wszystkie delta = 0 i jest nadal audytowalny. |
| Seed obu runów jest taki sam | `MATCHED`, porównanie ma kontrolowany seed. |
| Seed różny lub podany tylko po jednej stronie | `MISMATCHED` / `UNSPECIFIED`; porównanie nie jest blokowane, ale status kontroli jest jawny. |
| Model jest deterministyczny bez seedów | `DETERMINISTIC_NO_SEED`; brak seedów nie jest przedstawiany jako błąd. |
| Oba runy nie mają wspólnych metryk liczbowych o zgodnych jednostkach | `NO_SHARED_NUMERIC_METRICS`; brak wyliczonej delty. |

## Wynik

```ts
interface CounterfactualComparison {
  contractVersion: '1.0.0';
  comparisonId: string;
  status: 'COMPLETED' | 'BLOCKED_INVALID_REQUEST' | 'BLOCKED_MODEL_MISMATCH' | 'INCOMPLETE_RUN' | 'NO_SHARED_NUMERIC_METRICS';
  baseline?: ExperimentRun;
  variant?: ExperimentRun;
  model: { domainId: string; modelId: string; modelVersion?: string; engine: string | null };
  seedControl: { status: 'MATCHED' | 'MISMATCHED' | 'UNSPECIFIED' | 'DETERMINISTIC_NO_SEED'; baselineSeed?: number; variantSeed?: number };
  parameterDifferences: readonly ParameterDifference[];
  metrics: readonly CounterfactualMetric[];
  evidence: { baselineRunId: string; variantRunId: string; baselineRunFingerprint: string; variantRunFingerprint: string; };
  disclaimer: string;
}
```

`CounterfactualMetric` zawiera `key`, wartość baseline, wartość wariantu, deltę absolutną i względną, zgodną jednostkę oraz jawny status delty względnej przy baseline równym zero. Wykazywane są wyłącznie wspólne, skończone outputy liczbowe o takich samych jednostkach. Jednostki konfliktowe nie są przeliczane ani ukrywane.

## Źródło prawdy i provenance

| Własność | Źródło |
|---|---|
| Wynik, units, status, warnings, validity | `ExperimentRun.result` |
| Model, engine, wersja, seed i result origin | `ExperimentRun.provenance` |
| Walidacja wejścia | `validateStructuredExperimentRequest` |
| Wykonanie | `runExperiment` |
| Identyfikator porównania | Deterministyczny fingerprint wyłącznie z run fingerprintów, modelu, statusu kontroli seedów i etykiet. |

Moduł nie tworzy `ScientificEvidencePack`, bo nie zastępuje prerejestrowanego eksperymentu z kontrolami i replikacjami. Jeśli użytkownik potrzebuje takiego poziomu dowodu, oba requesty mogą zostać zaprojektowane istniejącym `designScientificExperiment` i wyeksportowane istniejącym Evidence Pack/RO-Crate. Counterfactual Compare pozostaje najkrótszą ścieżką „A vs B” do realnych runów.

## Dowód testowy

Testy muszą wykazać:

1. Realne dwa runy Schwarzschilda, wspólną metrykę `radiusKm`, dodatnią deltę dla masy 2 M☉ względem 1 M☉, model `einstein-schwarzschild` i `real-engine` provenance.
2. Kontrolowany, realny przebieg epidemii ze wspólnym seedem oraz różnym `r0`; oba runy muszą zachować ten sam seed w provenance.
3. Blokadę niezgodnego modelu przed wykonaniem runu.
4. Determinizm serializacji dla identycznego wejścia.

## Zakres celowo wykluczony

Nie dodajemy UI, LLM parsera, nowego dashboardu, automatycznych rekomendacji, transferu między domenami, interwencji „zamknięcie szkół” bez istniejącego parametru modelu, zewnętrznego solvera, danych syntetycznych ani drugiego World State.
