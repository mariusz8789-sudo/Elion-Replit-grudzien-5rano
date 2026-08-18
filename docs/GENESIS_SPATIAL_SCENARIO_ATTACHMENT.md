# Genesis Spatial Scenario Attachment — kontrakt

## Cel

Ten etap łączy dwa istniejące, prawdziwe artefakty: `GenesisSpatialDataset` z importera OSM i `ReproducibleScenarioCapsule` z Experiment Fabric. Użytkownik może zapisać realny, znormalizowany kontekst geograficzny obok realnego runu lub A/B, aby przyszłe odtworzenie scenariusza znało **który** artefakt mapy, bbox, timestamp, licencja, atrybucja i fingerprint były użyte.

> Attachment jest rejestrem danych wejściowych. Nie jest World State, nie włącza WorldAdaptera i nie dowodzi, że model został skalibrowany do wskazanego miasta.

## Dopuszczony artefakt przestrzenny

| Warunek | Powód |
|---|---|
| Dataset jest `GenesisSpatialDataset@1.0.0`. | Zachowujemy jeden istniejący kontrakt importu. |
| Ma ODbL, `© OpenStreetMap contributors`, bbox, timestamp, URL, query i fingerprint normalizacji. | Zachowuje pochodzenie oraz obowiązkową atrybucję. |
| `worldIntegration = NOT_WIRED`. | Kapsuła nie może sugerować istniejącego modelu świata lub Digital Twin. |
| Jest załączany jako artefakt statyczny. | Re-run nie odpyta ponownie OSM i nie zmieni danych historycznych ukrytym fetch’em. |

## Odtworzenie

`replayScenarioCapsule()` nadal uruchamia wyłącznie istniejący request eksperymentu. Attachment GIS jest zwracany jako `RETAINED_STATIC_ARTIFACT` wraz z identyfikatorem i fingerprintem. Nie jest pobierany ponownie, a jego obecność nie modyfikuje parametrów runu.

## Granice produkcyjne

Oficjalna polityka OSMF mówi, że core OSM API jest przeznaczone do edycji, nie dla read-only projektów, a duzi użytkownicy powinni korzystać z własnego serwera danych, planet extract lub innego dostawcy. [1] Wymagana jest widoczna atrybucja i informacja o ODbL dla publicznie pokazywanej mapy lub symulacji. [2] [3]

Dlatego bieżący importer pozostaje **artifact-first**. Produkcyjny GIS wymaga zatwierdzonego provider/cache/worker, polityki aktualizacji, geometrii relacji, walidacji topologii, polityki licencyjnej dla danych pochodnych oraz jawnego WorldAdaptera.

## Dowody testowe

1. Prawdziwy, znormalizowany OSM XML może zostać dołączony do kapsuły realnego A/B.
2. Kapsuła zachowuje `datasetId`, raw i normalization fingerprint oraz ODbL attribution.
3. Replay zwraca artefakt jako statycznie utrzymany, bez fetchu i bez zmiany fingerprintu runu.
4. Dataset z niepoprawną licencją, atrybucją lub statusem world integration jest odrzucany.

## Referencje

[1]: https://operations.osmfoundation.org/policies/api/ "OSMF API Usage Policy"
[2]: https://osmfoundation.org/wiki/Licence/Attribution_Guidelines "OSMF Attribution Guidelines"
[3]: https://www.openstreetmap.org/copyright "OpenStreetMap Copyright and License"
