# World Engine ↔ Scientific Core — kontrakt naukowy

**Wersja kontraktu:** `1.0.0` (`core/world/worldEngineInterface.ts`)
**Właściciel World Engine:** Manus · **Właściciel Scientific Core:** warstwa naukowa
**Status:** kontrakt gotowy do implementacji. Scientific Core nie buduje mapy ani ruchu.

---

## 1. CURRENT — jak to działa dzisiaj

Audyt istniejącej mechaniki, bez zmian w niej.

| element | stan faktyczny | plik |
| --- | --- | --- |
| ruch | linia prosta do celu, `speed = worldWidth · 0,10` px/dzień, krok `speed · dt`. Brak dróg, kolizji i szukania trasy. | `agents/cityAgent.ts::stepMovement` |
| wybór celu | `rng() < mobilityScale · goOutScale` → dom albo losowy typ z `['shop','school','park','shop','park']`, potem losowy punkt w obrysie | `agents/cityAgent.ts::chooseDestination` |
| postój | `0,15 + rng() · (dom ? 0,8 : 0,4)` dnia | `simulation/epidemicCity.ts` |
| wykrycie kontaktu | siatka przestrzenna o komórce = `contactRadius` (14 px), sąsiedztwo 3×3, odległość euklidesowa | `interactions/contacts.ts::resolveContacts` |
| czas kontaktu | **nie istnieje.** Model widzi bliskość w pojedynczym kroku i nie łączy kroków w spotkanie. Dostępne jest tylko `stepDurationDays`. | — |
| transmisja | `P = (1 − e^(−β·Δt)) · transmissionScale · podatność · pairScale`, jedno losowanie na parę na krok | `interactions/contacts.ts` |
| przypisanie miejsca | `buildingAt(layout, x_celu, y_celu)` w chwili transmisji | `world/cityWorld.ts::buildingAt` |
| skąd bierze się `OTHER` | `buildingAt` zwraca `-1`, czyli punkt jest poza każdym obrysem — agent jest w tranzycie po linii prostej | `contacts/contactNetwork.ts::classifyContact` |

### Zmierzony problem

Przebieg referencyjny: 260 agentów, ziarno 4242, 60 dni, `severeRate` 0,2, `mobility` 0,85.
Odcisk wyniku `95cc4b33`, odtwarzalny (`replayScenario` → `MATCH`).

| kategoria | transmisje | w postoju | **w drodze** | udział |
| --- | ---: | ---: | ---: | ---: |
| OTHER | 88 | **0** | **88** | 39% |
| PUBLIC (park) | 60 | 21 | 39 | 27% |
| SHOP | 49 | 20 | 29 | 22% |
| SCHOOL | 19 | 8 | 11 | 8% |
| HOUSEHOLD | 8 | 7 | 1 | 4% |
| UNKNOWN_CONTACT_TYPE | 1 | 0 | 1 | 0% |
| **razem** | **225** | 56 | **169 (75,1%)** | |

Trzy fakty, które definiują ten kontrakt:

1. **100% transmisji `OTHER` zachodzi w tranzycie.** `OTHER` nie jest miejscem — jest artefaktem geometrii ruchu.
2. **75,1% wszystkich transmisji zachodzi, gdy agent jest w drodze.** `locationAttribution.confidence = LOW`.
3. **81 ze 137 transmisji „w budynkach" to przechodzenie przez obrys**, a nie pobyt. Zdanie „to zakażenie zaszło w szkole" jest dziś nieuprawnione dla większości przypadków — także dla kategorii, które wyglądają na wiarygodne.

Punkt 3 jest ważniejszy od punktu 1: problem nie ogranicza się do `OTHER`, tylko skaża **całą** atrybucję miejsca.

---

## 2. TARGET — czego potrzebuje Scientific Core

```
WORLD ENGINE → MOVEMENT → LOCATION → CONTACT → TRANSMISSION → DISCOVERY
```

Podział własności jest sztywny:

- **World Engine dostarcza:** mapę, sieć tras, typy segmentów, identyfikatory miejsc, przypisanie pozycji do segmentu, obłożenie pojazdów.
- **Scientific Core liczy:** kto się zaraża, z jakim prawdopodobieństwem, jaki to typ kontaktu, jaki jest wniosek.
- **Nikt nie liczy dwa razy.** World Engine nigdy nie rozstrzyga, czy doszło do zakażenia.

---

## 3. DATA CONTRACT

Pełna lista w `WORLD_ENGINE_FIELD_CONTRACT`. Prowenancja każdego pola:
`MODEL_DERIVED` (liczy Core) · `WORLD_DERIVED` (dostarcza Manus) · `NOT_MODELED` (nie istnieje — **nie wolno wypełniać**).

### AgentPosition / AgentMovement

| pole | prowenancja | uwaga |
| --- | --- | --- |
| `agentId`, `position`, `timestamp` | MODEL_DERIVED | World Engine nie tworzy agentów ani własnego zegara |
| `speed`, `inTransit`, `destinationLocationId` | MODEL_DERIVED | `inTransit` jest miarą zaufania do atrybucji miejsca |
| `route` | **WORLD_DERIVED** | odblokowuje eksperyment A |
| `routeSegmentId` | **WORLD_DERIVED** | odblokowuje rozbicie `OTHER` |

### Location / Route

| pole | prowenancja | uwaga |
| --- | --- | --- |
| `locationId`, `locationType`, `footprint` | **WORLD_DERIVED** | identyfikator musi być stabilny między przebiegami |
| `capacity`, `ventilation` | NOT_MODELED | brak danych po obu stronach; nie zastępować powierzchnią |
| `Route.segments`, `Route.segmentType`, `Route.length` | **WORLD_DERIVED** | `segmentType ∈ {ROAD, SIDEWALK, CROSSING, INDOOR}` |

### ContactEvent / TransmissionEvent

| pole | prowenancja | uwaga |
| --- | --- | --- |
| `source`, `target`, `position`, `timestamp`, `distance` | MODEL_DERIVED | |
| `duration` | **NOT_MODELED** | model nie łączy kroków w spotkanie; jest tylko `stepDurationDays` |
| `locationId` | WORLD_DERIVED | dziś wyprowadzane z obrysu i **zawodne** |
| `contactType` | MODEL_DERIVED | rozdzielczość rośnie dopiero z danymi ze świata |
| `transmissionProbability`, `transmissionOccurred` | MODEL_DERIVED | **wyłącznie** decyzja Core |
| `targetInTransit` | MODEL_DERIVED | miara zaufania do atrybucji |

---

## 4. EVENT CONTRACT — wymagania dla miejsc

`REQUIRED_LOCATION_TYPES`. Dostępne dziś: `BUILDING`, `SCHOOL`, `SHOP`, `HOSPITAL`, `PARK` — **wszystkie z zastrzeżeniem tranzytowym**.

Wymagają dostarczenia przez World Engine:

| typ | co musi dostarczyć Manus | mapuje na |
| --- | --- | --- |
| `ROAD` | sieć jezdni z identyfikatorami segmentów + przypisanie pozycji agenta do segmentu | `OTHER` → `STREET` |
| `SIDEWALK` | sieć chodników odrębna od jezdni | `OTHER` → `SIDEWALK` |
| `CROSSING` | przejścia jako osobne segmenty | `OTHER` → `STREET` |
| `WORK` | miejsca pracy w layoucie **oraz** stabilne przypisanie agent → pracodawca | `WORK` |
| `TRANSPORT` | pojazdy jako poruszające się pojemniki z listą pasażerów, linie, przystanki | `TRANSPORT` |

---

## 5. OTHER — zasada podziału

`OTHER_REFINEMENT`:

- kategoria **nie znika i nie zmienia nazwy**, dopóki dane realnie nie pozwolą na podział;
- podział na `STREET / SIDEWALK / PUBLIC_SPACE / UNKNOWN` wymaga **wyłącznie** pola `Route.segmentType`;
- gdy segmentu nie da się ustalić → `UNKNOWN_CONTACT_TYPE`, **nigdy** kategoria zgadnięta.

Kategoria szeroka jest lepsza niż kategoria zmyślona.

---

## 6. WORK — co odblokowuje kontakty w pracy

Zdolność `WORKPLACE_CONTACTS`, dziś zablokowana.

1. **Dane od World Engine:** obiekty `locationType = WORK` z obrysem i stabilnym `locationId`.
2. **Przypisanie agenta:** `Agent.workplaceId`, deterministyczne przy ustalonym ziarnie, stałe w obrębie przebiegu. Core nie wymyśla pracodawców.
3. **Powstanie kontaktu:** bez zmian w mechanice — agent wybiera miejsce pracy jako cel podróży, a kontakt powstaje z bliskości, tak jak dziś. Nowy jest wyłącznie **typ miejsca**.
4. **Replay:** `workplaceId` wchodzi do odcisku wejścia przebiegu. Zmiana przypisania → inny odcisk → `DRIFT`.

Do tego czasu `WORK` pozostaje `NOT_MODELED` i **nie jest podstawiane pod `SHOP` ani `OTHER`**.

---

## 7. TRANSPORT — kontrakt na przyszłość, status NOT_MODELED

Dotyczy `BUS`, `TRAM`, `TRAIN`, `OTHER_TRANSPORT`. Wymagane:

- `Vehicle.vehicleId`, `Vehicle.type`, `Vehicle.route`, `Vehicle.occupants` (lista `agentId` w danym kroku);
- przystanki jako miejsca o `locationType = TRANSPORT`;
- pozycja pojazdu w czasie, żeby kontakt w pojeździe miał współrzędne.

**Do czasu dostarczenia tych danych `TRANSPORT` zostaje `NOT_MODELED`.** Scenariusz `TRANSPORT_REDUCTION` pozostaje zablokowany — nie ma czego ograniczać, skoro nie ma pojazdów.

---

## 8. REPLAY REQUIREMENTS

`REPLAY_REQUIREMENTS` — sześć twardych warunków:

1. Identyfikatory miejsc i segmentów **stabilne** między przebiegami tej samej mapy.
2. Mapa ma własną wersję i odcisk; wchodzą one do odcisku wejścia przebiegu.
3. Trasa agenta jest funkcją mapy, celu i ziarna — bez ukrytego stanu i bez zegara ściennego.
4. **Zmiana mapy zmienia odcisk wejścia. Ten sam przebieg na innej mapie to `DRIFT`, nie `MATCH`.**
5. World Engine **nie może mutować** pozycji, celu ani stanu agenta. Jest wyłącznie konsumentem.
6. Przypisania agent → gospodarstwo i agent → miejsce pracy są deterministyczne przy ustalonym ziarnie.

Stan dzisiejszy: warunki 3–6 są spełnione i pokryte testami. Ruch, trasa, miejsce, typ kontaktu i transmisja odtwarzają się w całości (`replayScenario` → `MATCH`, identyczny `transmissionGraph`).

---

## 9. VALIDATION RULES

`validateWorldPayload()` — walidator odrzuca, **nigdy nie uzupełnia**:

| reguła | severity | działanie |
| --- | --- | --- |
| `contract-version` | ERROR | wersja ładunku musi zgadzać się z wersją kontraktu |
| `not-modeled-must-stay-empty` | ERROR | pole `NOT_MODELED` przysłane z wartością = ktoś je wymyślił |
| `model-derived-not-supplied-by-world` | WARNING | wartość ze świata dla pola Core zostaje **zignorowana** |
| `location-id-required` / `location-type-known` | ERROR | miejsce bez stabilnego id albo z typem spoza listy |
| `segment-id-required` / `segment-type-known` / `segment-length-positive` | ERROR | segment nieużyteczny do atrybucji |

`unlockedCapabilities` wylicza się **z faktycznie zadeklarowanych pól**, nie z obietnic.

---

## 10. NOT_MODELED

`INTERFACE_NOT_MODELED`: `contact-duration`, `location-capacity`, `ventilation`, `vehicle-occupancy`, `workplace-assignment`, `road-network`, `sidewalk-network`, `pedestrian-crossings`.

Żadne z tych pól nie ma być wypełniane wartością zastępczą po którejkolwiek ze stron.

---

## 11. BLOCKERS — eksperymenty czekające na dane

| eksperyment | status | czego brakuje |
| --- | --- | --- |
| **A.** ROAD_NETWORK vs STRAIGHT_LINE | 🔴 BLOCKED | `Route.segments`, `AgentMovement.route` |
| **B.** WORKPLACE_CONTACTS | 🔴 BLOCKED | `Location.locationType=WORK`, `Agent.workplaceId` |
| **C.** SCHOOL_CLOSURE | 🟢 **DOSTĘPNY** | — wykonany, `closeSchools` jest realną dźwignią |
| **D.** TRANSPORT_REDUCTION | 🔴 BLOCKED | `Vehicle.occupants`, `Vehicle.route`, przystanki |
| **E.** HOUSEHOLD_PROTECTION | 🟢 **DOSTĘPNY** | — wykonany, `householdTransmissionScale` jest realną dźwignią |

Dodatkowo zablokowane: rozbicie `OTHER` (`Route.segmentType`) i ekspozycja zależna od czasu spotkania (`ContactEvent.duration`).

---

## 12. INTEGRATION TESTS

`src/__tests__/worldEngineInterface.test.ts` — 31 testów:

- kompletność kontraktu (wszystkie encje i pola minimalne z briefu);
- prowenancja każdego pola; pola decyzyjne po stronie Core;
- wymagania miejsc, z rozdziałem „dostępne dziś" / „do dostarczenia";
- `OTHER` nierozbite bez danych; blokada podziału przy niepełnych polach;
- walidator: zła wersja, `NOT_MODELED` z wartością, brak `locationId`, nieznany typ, zły segment;
- odblokowanie zdolności wyłącznie z kompletu pól;
- replay: `MATCH` na realnym przebiegu, identyczny graf transmisji;
- pomiary uzasadniające ten kontrakt: `transitShare > 0,5`, `confidence = LOW`, `OTHER` w 100% tranzytowe, przewaga tranzytu nad postojem w budynkach.

---

## TOP 10 — co Manus musi dostarczyć

Uporządkowane wg zysku naukowego na jednostkę pracy.

| # | element | odblokowuje | dlaczego to jest tu |
| --- | --- | --- | --- |
| 1 | **Sieć tras** (`Route.segments`) + trasy agentów zamiast linii prostych | eksperyment A | usuwa źródło 75% dzisiejszej transmisji „w drodze" |
| 2 | **`Route.segmentType`** (`ROAD`/`SIDEWALK`/`CROSSING`/`INDOOR`) | rozbicie `OTHER` | zamienia 39% „nigdzie" w kategorie, które da się opisać polityką |
| 3 | **`AgentMovement.routeSegmentId`** — pozycja agenta na segmencie | atrybucja kontaktu ulicznego | bez tego segmenty istnieją, ale kontakt nie ma do czego się przypiąć |
| 4 | **Stabilne `locationId`** dla wszystkich miejsc | replay + atrybucja | dziś miejsce to indeks w tablicy; przy zmianie layoutu wszystko się rozjeżdża |
| 5 | **Rozróżnienie „w obrysie" od „przechodzi przez obrys"** | wiarygodność `SCHOOL`/`SHOP`/`PARK` | 81 ze 137 transmisji w budynkach to przechodzenie |
| 6 | **Miejsca pracy** (`locationType = WORK`) | eksperyment B | jedyna duża brakująca kategoria kontaktu |
| 7 | **`Agent.workplaceId`**, deterministyczne przy ziarnie | eksperyment B + replay | bez tego kontakt w pracy nie jest odtwarzalny |
| 8 | **Wersja i odcisk mapy** | replay | zmiana świata musi dawać `DRIFT`, a nie cichy `MATCH` |
| 9 | **Pojazdy z listą pasażerów** (`Vehicle.occupants`, `route`) | eksperyment D | odblokowuje `TRANSPORT`, dziś `NOT_MODELED` |
| 10 | **Czas przebywania na segmencie** | `ContactEvent.duration` | jedyna droga do ekspozycji zależnej od czasu spotkania |

Pozycje 1–3 rozwiązują największe ograniczenie naukowe. Pozycje 4–5 są warunkiem, żeby cokolwiek dało się wiarygodnie przypisać. Reszta otwiera nowe pytania.

### Czego Manus **nie** ma dostarczać

- `transmissionOccurred`, `transmissionProbability`, `contactType` — liczy je Scientific Core; wartość ze świata zostanie zignorowana z ostrzeżeniem.
- `ContactEvent.duration`, `Location.capacity`, `ventilation` — `NOT_MODELED`; przysłanie ich to błąd walidacji.
- Jakiejkolwiek liczby, dla której nie ma źródła. Kategoria szeroka jest lepsza niż kategoria zmyślona.
