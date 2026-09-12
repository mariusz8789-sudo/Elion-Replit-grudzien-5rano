# P2 EVIDENCE — Genesis OS, warstwa naukowa

Ta sama zasada dowodowa co w `P0_EVIDENCE.md`: **żadnego twierdzenia bez
komendy, wyjścia i hasha commita.** Gdzie czegoś nie wykonano, stoi
`NOT VERIFIED` z powodem.

---

## P2.3 — KOTWICA ZEWNĘTRZNA: obserwacja, której Genesis nie wyprodukował

**Status: KONTRAKT KOTWICY ZAIMPLEMENTOWANY I ZWERYFIKOWANY WYKONANIEM,
z jedną realną obserwacją zewnętrzną. LIVE INGESTION publicznego API:
NOT VERIFIED — egress zablokowany przez politykę proxy.**

### Bloker środowiskowy, ustalony pomiarem przed podjęciem decyzji projektowej

Wszystkie hosty danych naukowych są odrzucane przez proxy organizacji:

```bash
$ for u in exoplanetarchive.ipac.caltech.edu physics.nist.gov earthquake.usgs.gov \
           ssd-api.jpl.nasa.gov query.wikidata.org opendata.cern.ch ; do curl ... ; done
  000 BLOCKED  https://exoplanetarchive.ipac.caltech.edu/TAP/sync
  000 BLOCKED  https://physics.nist.gov/cgi-bin/cuu/Value?bohrrada0
  000 BLOCKED  https://earthquake.usgs.gov/fdsnws/event/1/query
  000 BLOCKED  https://ssd-api.jpl.nasa.gov/sbdb.api
  000 BLOCKED  https://query.wikidata.org/sparql
  000 BLOCKED  https://opendata.cern.ch/api/records/

$ curl -sS "$HTTPS_PROXY/__agentproxy/status"
  "recentRelayFailures": [ { "kind": "connect_rejected",
    "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)", ... } ]
  "noProxy": "...registry.npmjs.org, jsr.io, pypi.org, index.crates.io, proxy.golang.org..."
```

Przepuszczane są wyłącznie rejestry pakietów i API Anthropic. Pobranie danych
naukowych na żywo jest z tego środowiska niemożliwe — więc **sfabrykowanie
zbioru „zewnętrznego" byłoby dokładnie tym, czego ta misja zabrania.**

### Co za to zastano w repo — i czym dokładnie NIE było

Maszyneria „predykcja kontra realny pomiar" już istniała i jest dobra:
`realExperiment.ts::createReferenceMeasurementRun` buduje run oznaczony
`REFERENCE`; `predictionVerification.ts::verifyPredictionAgainstRealExperiment`
sądzi go przeciw PREREJESTROWANEMU kryterium i **odmawia** porównania z runem
`SIMULATED`; `predictionVerificationFingerprint` daje tożsamość do replayu.

Brakującym ogniwem było ŹRÓDŁO obserwacji. Jedyna produkcyjna ścieżka —
`DrugDiscoveryScreen.tsx:141-150` — brała ją tak:

```ts
const request: ReferenceMeasurementRequest = {
  structuredRequest,
  citation: { citationText: realEvidenceCitation.trim(), sourceRef: realEvidenceCitation.trim() },
  ...
};
const realRun = createReferenceMeasurementRun({
  request, derived: [{ outputKey: 'targetRelevance', value: observed, unit: 'score' }], ...
});
```

`realEvidenceObserved` i `realEvidenceCitation` to **stringi wpisane przez
człowieka w pola tekstowe**. Etykieta była uczciwa (`REFERENCE`, nie
`SIMULATED`), ale dowód — żaden: nic nie było sumowane, nic nie dawało się
ponownie pobrać, i nie istniał sposób stwierdzić, czy ta liczba pochodzi
skądkolwiek. **Wpisany cytat jest asercją, nie prowieniencją.** To była realna
luka P2.3 i dała się zamknąć bez sieci, bo w repo leży już przypięty,
opublikowany payload zewnętrzny.

### Kotwica: co porównuje i skąd pochodzi każda strona

| | Wartość | Skąd |
|---|---|---|
| **Predykcja Genesis** | 194.194 g/mol | `compute/cheminformatics.ts`: `parseFormula('C8H10N4O2')` + `molecularWeight()`, tablica IUPAC 2021 **w repo** |
| **Obserwacja zewnętrzna** | 194.19 g/mol | odczytana z `pubchem-cid-2519.json` — surowej odpowiedzi PUG REST PubChem, przypiętej w repo |
| **Pasmo** | ±0.971 g/mol (0,5%) | PREREJESTROWANE w deklaracji kotwicy, z uzasadnieniem: zaokrąglenie publikacji do dwóch miejsc + różnica niezależnie utrzymywanych tablic mas konwencjonalnych |
| **Werdykt** | `SUPPORTED_WITHIN_PROTOCOL` | istniejące `verifyPredictionAgainstRealExperiment` |
| **Odcisk werdyktu** | `prediction-verification_c5c0af94` | istniejące `predictionVerificationFingerprint` |
| **Replay** | `MATCH` | porównanie POWTÓRZONE z przypiętego payloadu, nie odczyt zapisanego werdyktu |

Predykcja NIE czyta kolumny `MolecularWeight` z payloadu — czyta wyłącznie
`MolecularFormula`. Gdyby czytała obie, kotwica porównywałaby liczbę z samą
sobą.

### Testy (10/10), TDD

```bash
$ npx vitest run src/__tests__/externalObservationAnchor.test.ts   # przed implementacją
 Test Files  1 failed (1) | Tests  no tests        (moduł nie istnieje)

$ npx vitest run src/__tests__/externalObservationAnchor.test.ts   # po
 Test Files  1 passed (1) | Tests  10 passed (10)
```

Co pokrywają, poza „przechodzi":
- **ODMOWA przy zmienionym payloadzie.** Test podmienia opublikowaną wartość na
  `999.99` i wymaga, żeby `resolveExternalAnchor` odmówiło, a
  `buildAnchoredReferenceRun` rzuciło wyjątkiem. To jest cała wartość sumy
  kontrolnej: kotwica, która cicho zaczyna mierzyć coś innego, jest gorsza niż
  brak kotwicy.
- **FALSYFIKACJA JEST REALNA.** Predykcja celowo błędna (200.0) dostaje
  `FALSIFIED_WITHIN_PROTOCOL` od tego samego kryterium. Bez tego testu
  „SUPPORTED" nic nie znaczy — trzeba pokazać, że kryterium POTRAFI zawieść.
- **Cytat pochodzi ze zbioru, nie od użytkownika.** Test wymaga, żeby
  `run.request.sourceText` zawierał URL, datę pobrania I odcisk payloadu.
- **Ta sama liczba jako run `SIMULATED` zostaje ODRZUCONA** (`INCONCLUSIVE`) —
  kotwica nie może być własną symulacją.
- **Dryf jest wykrywalny**: zmiana predykcji zmienia odcisk werdyktu, więc
  `MATCH` cokolwiek dowodzi.

### Dowód wizualny — Chromium, `#/evidence`, zero błędów runtime

Kotwica jest podpięta do `EvidenceShowcaseScreen` — ekranu, którego własna
dokumentacja mówi, że jest „dla zewnętrznej publiczności: audytora R&D,
regulatora, inwestora". Jest to JEDYNY blok na tym ekranie niezależny od tego,
czy ktokolwiek cokolwiek wcześniej zapisał, więc recenzent na świeżej
przeglądarce widzi go zawsze.

```
### ecs-anchor-verdict
SUPPORTED_WITHIN_PROTOCOL — Genesis predicted 194.194 g/mol for
molecularWeightGramsPerMole from the published molecular formula; the externally
published value is 194.19 g/mol. Preregistered band ±0.971 g/mol.

### ecs-anchor-provenance
OBSERVATION ORIGIN   REFERENCE DATA
SOURCE               https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2519/property/...
VERSION / RETRIEVED  PubChem CID 2519 (PUG REST property table) · 2026-08-29
LICENCE              Public domain (U.S. NCBI/NLM PubChem)
PINNED PAYLOAD DIGEST  470de276
VERDICT FINGERPRINT    prediction-verification_c5c0af94

### ecs-anchor-replay
MATCH — the comparison was re-executed just now, in this browser, from the
pinned payload; the two verdict fingerprints were then compared.

### ecs-anchor-untested
What this does NOT establish: To NIE jest pomiar przyrody. [...]

ERRORS: none
```

### CO TA KOTWICA POZOSTAWIA NIEPRZETESTOWANE — punkt obowiązkowy

Renderowane na ekranie z tą samą wagą wizualną co werdykt, nie w przypisie:

> **To NIE jest pomiar przyrody.** PubChem swojej masy molowej też nie mierzy —
> liczy ją z wzoru, własną konwencją mas atomowych. Kotwica jest więc
> **weryfikacją wobec niezależnego źródła**, nie testem empirycznym: zgodność nie
> potwierdza żadnej hipotezy fizycznej, a jedynie to, że nasza arytmetyka i
> nasza tablica pierwiastków nie rozjechały się z cudzymi. Empiryczną kotwicą
> byłby dopiero POMIAR (np. spektrometria mas), którego w tym zbiorze nie ma.

To jest ta sama dyscyplina, którą wymuszono przy QE1 (granica Tsirelsona jako
analityczny sufit liczonej algebry, a nie wynik empiryczny). Bez tego zdania
kotwica sugerowałaby pomiar rzeczywistości, którym nie jest.

### Skutek dla ryzyka R-005 — ZWĘŻONE, NIE ZAMKNIĘTE

Przed: „obserwacje, wobec których hipotezy są testowane, pochodzą z tych samych
modeli" oraz „obserwacja zewnętrzna wchodzi jako liczba wpisana ręcznie".
Po: istnieje działający, przetestowany kontrakt kotwicy z obserwacją z
przypiętego, sumowanego, cytowanego zbioru zewnętrznego, odmawiający działania
przy zmianie payloadu — ale jest to weryfikacja wobec źródła, nie pomiar
przyrody, i nie ma jeszcze ingestion publicznego API na żywo.

### NOT VERIFIED w tym punkcie

- **Live ingestion publicznego API (SDO/HEK, NIST, USGS, CERN, PubChem).**
  Egress zablokowany politycznie (dowód wyżej). Kontrakt kotwicy jest gotowy
  na taki zbiór: wystarczy dodać wpis do `EXTERNAL_ANCHORS` z payloadem, URL-em,
  licencją i odciskiem — reszta łańcucha jest już wykonana i przetestowana.
- **Kotwica empiryczna (pomiar przyrody, nie wartość opublikowana).** Wymaga
  zbioru z realnym pomiarem instrumentalnym; `compute/cmsOpenDataAdapter.mjs`
  (CMS Open Data Z→μμ 2011, rekord 5208, CC0, SHA-256 weryfikowany, `detect()`
  zwracający `DATA_REQUIRED` zamiast syntetyku) jest do tego właściwym
  substratem, ale plik `Zmumu.csv` nie jest w repo, a `opendata.cern.ch` jest
  zablokowany. To jest następny krok P2.3, nie rzecz zrobiona.

---

## P2.3 — DRUGA kotwica (Kepler, NASA Exoplanet Archive): BLOCKED — brak dostępu do źródła

**Status: NIE ZAIMPLEMENTOWANA. Pomiar dostępu sieciowego wykonany PRZED
podjęciem decyzji projektowej — środowisko odmawia egresu do
`exoplanetarchive.ipac.caltech.edu`, tak samo jak udokumentowano wyżej dla
pierwszej kotwicy.**

Zadanie (`docs/prompts/C3-P2.3-kepler-anchor-i-P2.2-solar-ingestion.md`)
zakładało: drugi wpis w `EXTERNAL_ANCHORS` (ten sam kontrakt
`externalAnchor.ts`, ta sama zasada literalnego `payloadDigest` — patrz
D-014), z predykcją liczoną przez istniejący model Fabric `universe-kepler`
(`orbitalGraph.ts::buildOrbitalModelGraph()`, III prawo Keplera,
`orbitalPeriodYears = 2π√(a³/(G·M))`) i obserwacją `pl_orbper` pobraną z NASA
Exoplanet Archive dla przypiętej listy planet.

**Pomiar:**

```bash
$ curl -sS -o /tmp/exo-check.out -w "HTTP_CODE:%{http_code}\n" --max-time 20 \
    "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+count(*)+from+ps&format=csv"
curl: (56) CONNECT tunnel failed, response 403
HTTP_CODE:000

[agent-proxy] While this command ran, 1 connection through the agent proxy failed:
- exoplanetarchive.ipac.caltech.edu:443 — connect_rejected (the egress proxy denied
  the CONNECT (organization policy) or could not reach the destination)
```

Ten sam host był już wcześniej zmierzony jako zablokowany (sekcja wyżej,
inny agent, inne środowisko) — ten pomiar potwierdza to niezależnie, w innym
środowisku wykonania, tym samym kodem błędu (403 na CONNECT).

**Co to oznacza, zgodnie z regułą zadania.** Zadanie wprost instruowało:
„Jeśli NIE masz dostępu: zgłoś to jako `NOT VERIFIED`... Nie przypinaj
rekordu ilustracyjnego. W takim razie ta część zadania (kotwica keplerowska)
zostaje `BLOCKED — brak dostępu do źródła`". Pakiet badawczy Qwena (Part A
promptu `QWEN-P2.3-kotwica-zewnetrzna.md`) zawierał w swojej pierwotnej
emisji ilustracyjny rekord CSV z jawną adnotacją „wartości do potwierdzenia
live" — **ten rekord nie został przypięty jako obserwacja**, bo byłby
dokładnie tą fabrykacją, której ta misja zabrania (asercja podpisana jako
dowód, bez możliwości ponownego pobrania).

**Co JEST gotowe, niezależnie od bloku sieciowego.** `EvidenceShowcaseScreen.tsx`
(`ExternalAnchorSection` → `ExternalAnchorCard`/`ExternalAnchorsSection`)
został wygeneralizowany, żeby iterować po CAŁYM `EXTERNAL_ANCHORS` zamiast
hardkodować `MOLECULAR_WEIGHT_ANCHOR_ID` — więc druga kotwica wyrenderuje się
bez dalszych zmian tego ekranu w chwili, gdy zostanie dodana. Zweryfikowane:
`npx tsc --noEmit` czysto, `npx eslint` czysto, `evidenceShowcaseScreen.test.tsx`
+ `externalObservationAnchor.test.ts` + `moduleReachability.test.ts` — 17/17
zielono, bez regresji (jedna istniejąca kotwica nadal renderuje się
identycznie, teraz przez pętlę zamiast stałej).

**Co NIE jest zrobione.** Sam wpis kotwicy keplerowskiej w `EXTERNAL_ANCHORS`
(pasmo z `pl_orbpererr1` per §4 promptu, `whatThisTests`/`whatRemainsUntested`
per §6) — bo wymaga realnego, pobranego payloadu, którego to środowisko nie
może pobrać. `scripts/repro-demo.mjs` nie zyskał nowego wpisu w `EXPECTED` z
tego samego powodu: nie ma czego dodać bez fabrykacji.
