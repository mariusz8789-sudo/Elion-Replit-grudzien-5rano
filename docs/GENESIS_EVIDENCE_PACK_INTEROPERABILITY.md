# Genesis Evidence Pack — RO-Crate / PROV-DM Interoperability Contract

## Cel

Ten etap dodaje **deterministyczny eksport JSON-LD** istniejącego `ScientificEvidencePack`. Eksport jest widokiem na ukończony łańcuch realnych runów: nie uruchamia modelu, nie pobiera danych sieciowych, nie wyprowadza nowych wyników, nie interpretuje hipotezy i nie tworzy drugiego World State lub źródła provenance.

Projekt wykorzystuje dwa standardowe kierunki interoperacyjności: RO-Crate dla opisu pakietu danych i artefaktów workflow oraz W3C PROV-DM dla relacji entity/activity/agent. Workflow Run RO-Crate jest profilem do opisu provenance wykonań workflow wraz z wejściami, wyjściami i oprogramowaniem. [1] W3C PROV-DM definiuje ogólny model provenance obejmujący entities, activities i agents. [2]

## Granica zgodności

Eksport oznacza **minimalny, kompatybilny JSON-LD RO-Crate z relacjami PROV**, a nie pełną certyfikację każdego profilu Workflow Run RO-Crate. Pełny profil wymagałby trwałego pakietu plików wejściowych/wyjściowych, metadanych procesu uruchomienia i lifecycle’u artefaktów poza obecnym frontendowym Experiment Fabric.

| Zakres tego etapu | Status |
|---|---|
| `@context` RO-Crate, `Dataset` i `CreativeWork` pakietu | Wdrożone |
| Protocol / request jako `prov:Entity` | Wdrożone |
| Realny run jako `prov:Activity` | Wdrożone |
| Result jako `prov:Entity` wygenerowany przez activity | Wdrożone |
| Model / engine jako `prov:SoftwareAgent` | Wdrożone, gdy model/engine występuje |
| Seed, parametry, output, warnings, validity i result origin | Wdrożone jako jawne właściwości `genesis:` |
| Kontrole, replikacje i ocena protokołu | Wdrożone jako właściwości dokumentujące istniejący Evidence Pack |
| Pełny Workflow Run RO-Crate profile / dane wykonania kontenera | Poza zakresem |
| Import/wykonanie FMI/FMUs | `ENGINE_NOT_AVAILABLE`; poza zakresem |

## Mapowanie źródłowych kontraktów

| Kontrakt Genesis — źródło prawdy | Eksport RO-Crate / PROV-DM | Zasada |
|---|---|---|
| `ScientificEvidencePack` | root `Dataset` + `CreativeWork` | Identyfikator packa oraz fingerprinty pozostają niezmienione. |
| `ScientificExperimentDesign` | `prov:Entity` | Prerejestrowany protocol i jego założenia są danymi wejściowymi. |
| `ExperimentRun` | `prov:Activity` | Tylko completed Fabric run; aktywność nie jest reprezentacją miasta ani renderem. |
| `ExperimentResult` | `prov:Entity`, `prov:wasGeneratedBy` | Wystawiane są dokładnie istniejące outputs, units i status. |
| `ExperimentProvenance` | `prov:used`, `prov:wasAssociatedWith`, `genesis:*` | Fingerprinty, model, version, engine, parameters, seed i origin są mapowane bez obliczania nowych wartości. |
| Model / engine | `prov:SoftwareAgent` | Nie występuje, jeśli lokalny pakiet nie wskazuje konkretnego modelu lub engine. |

## Inwarianty

1. Eksport przyjmuje tylko `ScientificEvidencePack`; nie istnieje wejście umożliwiające podanie ręcznie wymyślonego outputu.
2. `evidencePackId`, `runId`, `runFingerprint` oraz `resultOrigin` są przenoszone bez zmiany.
3. Pack posiada ten sam disclaimer co lokalny kontrakt, dlatego export nie ogłasza odkrycia ani walidacji świata rzeczywistego.
4. Eksport jest deterministyczny: identyczny pack daje identyczne `JSON.stringify`.
5. Brak `modelId` albo `engine` jest zachowany jako brak, a nie zastępowany nazwą fikcyjnego solvera.
6. Eksport nie może modyfikować `EpidemicCitySimulation`, Event Registry, rendererów Three.js ani `worldHandoff`.

## API

```ts
export const RO_CRATE_EVIDENCE_PACK_VERSION: '0.1.0';

export interface GenesisRoCrate {
  '@context': readonly (string | Record<string, string>)[];
  '@graph': readonly Record<string, unknown>[];
}

export function exportEvidencePackRoCrate(pack: ScientificEvidencePack): GenesisRoCrate;
export function serializeEvidencePackRoCrate(pack: ScientificEvidencePack): string;
```

## Minimalny test kontraktowy

Test tworzy prawdziwy `ScientificEvidenceChain` z deterministycznych Schwarzschild runów, buduje z niego `ScientificEvidencePack`, eksportuje JSON-LD, a następnie weryfikuje: root dataset, protocol, aktywność każdego runu, wynik każdego runu, `prov:used`, `prov:wasGeneratedBy`, software agent tam gdzie jest znany, zachowanie `resultOrigin`, disclaimer oraz deterministyczną serializację.

## References

[1]: https://www.researchobject.org/workflow-run-crate/ "Workflow Run RO-Crate"
[2]: https://www.w3.org/TR/prov-dm/ "W3C — PROV-DM: The PROV Data Model"
