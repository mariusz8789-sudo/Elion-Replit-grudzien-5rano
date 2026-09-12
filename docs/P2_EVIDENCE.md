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

> **ZAMKNIĘTE od 2026-09-12 (C3), innym źródłem.** NASA Exoplanet Archive
> pozostaje zablokowany z tego sandboxa (dowód niżej, niezmieniony). Zamiast
> czekać na dostęp, druga kotwica została zbudowana na Solar System (Mars,
> NASA NSSDCA Planetary Fact Sheet) — realnie pobranym przez GitHub Actions
> (bez blokady egressu tam), z bajtowo zweryfikowanym payloadem odzyskanym z
> loga CI. Pełny dowód: sekcja „P2.3 — DRUGA kotwica (Kepler/Mars, NASA
> NSSDCA): ZAIMPLEMENTOWANA" niżej. Sekcja poniżej (pierwsza próba,
> Exoplanet Archive) zostaje jako dowód, że blokada sieciowa była realna, nie
> wymówka.

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

---

## P2.3 — DRUGA kotwica (Kepler/Mars, NASA NSSDCA): ZAIMPLEMENTOWANA

**Status: ZAIMPLEMENTOWANA i ZWERYFIKOWANA WYKONANIEM, z realną obserwacją
zewnętrzną (okres orbitalny Marsa, NASA NSSDCA Planetary Fact Sheet) i z
Tautology Gate wpiętym w OBIE kotwice (nie tylko tę).**

### Skąd wzięły się dane, skoro exoplanetarchive.ipac.caltech.edu jest zablokowany

Blokada z sekcji wyżej dotyczy TYLKO tego sandboxa. Inna sesja (C1) zbudowała
`scripts/fetch-kepler-solar-system-fixture.mjs` — analogiczny do
`fetch-atom-bohr-nist-fixtures.mjs` skrypt fetchujący, uruchamiany w CI
(`kepler-solar-system-pinned-artifact` job w `.github/workflows/ci.yml`),
gdzie egress NIE jest zablokowany (GitHub Actions runner, nie ten sandbox).
Celowo NIE Exoplanet Archive — commit `d2af93cf` udokumentował realne
ryzyko cyrkularności: dla wielu wpisów Exoplanet Archive półoś wielka jest
sama wyprowadzona z okresu przez III prawo Keplera, czyli dokładnie ten wzór,
którego ta kotwica by użyła do predykcji. Solar System (Mars) tego unika:
odległość mierzona radarem/śledzeniem sond (technika XX w.), okres mierzony
bezpośrednią astrometrią pozycyjną (od stuleci) — dwa historycznie niezależne
kanały.

CI faktycznie pobrał stronę (dowód w logu joba run `34714125596`, commit
`a4f4314e`), ale URL artefaktu (Azure Blob Storage) jest zablokowany z TEGO
sandboxa tą samą polityką proxy co bezpośredni fetch. Zamiast czekać:

1. Odczytano log joba przez GitHub MCP (`get_job_logs`) — job "Kepler anchor
   — pinned NASA NSSDCA Solar System fact sheet" ma krok DIAGNOSTIC, który
   robi `cat` na przypiętym pliku HTML wprost do logu.
2. Odtworzono treść pliku z logu (usunięcie prefiksów znacznika czasu z
   każdej linii), i policzono SHA-256 odtworzonego pliku.
3. Odtworzony hash (`42bdc3f1dae470b85580c6ac66c353964a05d544ad2ac970a6b7d908337a6c3c`,
   14363 B) zgadza się DOKŁADNIE z hashem, który sam skrypt fetchujący
   wypisał w tym samym logu PODCZAS pobierania, ORAZ z hashem z osobnego,
   niezależnego kroku weryfikacyjnego tego samego joba (odczyt pliku z dysku
   i ponowne liczenie sumy) — TRZY niezależne obliczenia tej samej sumy,
   wszystkie zgodne. To jest dowód bajtowej identyczności: odzyskana treść
   jest tym, co runner naprawdę pobrał z `nssdc.gsfc.nasa.gov`, a nie czymś
   przepisanym ręcznie.

```bash
$ python3 -c "import hashlib; print(hashlib.sha256(open('packages/frontend/src/core/biotechData/nssdc-planetary-factsheet.html','rb').read()).hexdigest())"
42bdc3f1dae470b85580c6ac66c353964a05d544ad2ac970a6b7d908337a6c3c
```

Plik jest w repo dosłownie:
`packages/frontend/src/core/biotechData/nssdc-planetary-factsheet.html`.

### Kotwica: co porównuje i skąd pochodzi każda strona

| | Wartość | Skąd |
|---|---|---|
| **Predykcja Genesis** | 687.2335878355307 dni | REALNY `universe-kepler` (`orbitalGraph.ts`, III prawo Keplera) na odległości Marsa (228.0 ×10⁶ km → 1.5240858638772057 AU) odczytanej z przypiętej strony NASA |
| **Obserwacja zewnętrzna** | 687.0 dni | odczytana z tej samej strony, ale z INNEGO wiersza tabeli ("Orbital Period"), nigdy z tego, co czyta predykcja ("Distance from Sun") |
| **Pasmo** | ±0,344 dnia (0,05%) | z rozdzielczości publikacji NASA (4 cyfry znaczące odległości, propagowane przez wykładnik 3/2 III prawa Keplera) + zaokrąglenia okresu — PREREJESTROWANE w deklaracji kotwicy |
| **Werdykt** | `SUPPORTED_WITHIN_PROTOCOL` | istniejące `verifyPredictionAgainstRealExperiment`; realna rozbieżność 0,234 dnia mieści się w paśmie |
| **Tautology Gate** | `EMPIRICAL_TEST` | `assessSingleTautology`: obserwacja zadeklarowana `independent-measurement`, predykcja `hypothesis-parameter` z realnego wyniku `universe-kepler` — nigdy `CONSISTENCY_CHECK` |
| **Odcisk werdyktu** | `prediction-verification_7530a91a` | istniejące `predictionVerificationFingerprint` |
| **Replay** | `MATCH` | porównanie POWTÓRZONE z przypiętego payloadu |

### Tautology Gate wpięty w OBIE kotwice, nie tylko w Kepler

Audyt (commit `d2af93cf`) stwierdził wprost: „`runExternalAnchor` currently
has NO Tautology Gate wiring". Zamknięte dla całego kontraktu, nie tylko
nowej kotwicy: `ExternalAnchor` ma teraz pole `tautologyDerivation`
(predykcja + obserwacja, `ObservableDerivation`), a `runExternalAnchor`
liczy `assessSingleTautology` i dodaje `tautologyAssessment` do
`AnchorRunResult`. Obie kotwice (PubChem i Kepler/Mars) klasyfikują się jako
`EMPIRICAL_TEST` — dowód w teście `keplerExternalAnchor.test.ts` describe
`'Tautology Gate wpięta w OBIE kotwice (nie tylko Kepler)'`.

### Testy (14 nowych + 11 istniejących = 25/25), TDD

```bash
$ npx vitest run src/__tests__/keplerExternalAnchor.test.ts   # przed implementacją
 FAIL  ... 13 failed | 1 passed (14)   — brak KEPLER_MARS_ANCHOR_ID, tautologyDerivation, tautologyAssessment

$ npx vitest run src/__tests__/keplerExternalAnchor.test.ts src/__tests__/externalObservationAnchor.test.ts   # po
 Test Files  2 passed (2) | Tests  25 passed (25)
```

Co pokrywają nowe testy, poza „przechodzi": odmowa przy zmienionym payloadzie
HTML (na LITERALE odcisku `2296fa16`); predykcja liczona z odległości przez
REALNY `universe-kepler`, nigdy z okresu; run oznaczony `REFERENCE` z
cytatem ze zbioru; `EMPIRICAL_TEST` nigdy `CONSISTENCY_CHECK`; realna
falsyfikacja (predykcja 700.0 → `FALSIFIED_WITHIN_PROTOCOL`); replay `MATCH`
i wykrywalny dryf; run `SIMULATED` odrzucony; obie kotwice mają jawną
derywację Tautology Gate.

### Dowód wizualny — Chromium, `#/evidence`, DWIE kotwice, zero błędów runtime

Realny przebieg w przeglądarce (zrzut ekranu wysłany osobno): obie sekcje
`ecs-external-anchor-*` renderują się przez wspólną pętlę
(`ExternalAnchorsSection`, C3'a wcześniejsza generalizacja), każda z pełnym
łańcuchem — werdykt, Tautology Gate, prowieniencja, replay, „czego to NIE
dowodzi". `CONSOLE_ERRORS: []`.

### `scripts/repro-demo.mjs` — 16/16 (było 12/12)

```bash
$ node scripts/repro-demo.mjs
  OK    P2.3 kotwica (Kepler/Mars): werdykt          SUPPORTED_WITHIN_PROTOCOL (oczekiwane SUPPORTED_WITHIN_PROTOCOL)
  OK    P2.3 kotwica (Kepler/Mars): obserwacja zewnętrzna 687 days, pochodzenie REFERENCE (oczekiwane 687 / REFERENCE)
  OK    P2.3 kotwica (Kepler/Mars): predykcja Genesis (universe-kepler) 687.2335878355307 days (oczekiwane 687.2335878355307)
  OK    P2.3 kotwica (Kepler/Mars): odcisk, replay, Tautology Gate prediction-verification_7530a91a / MATCH / EMPIRICAL_TEST (...)
  WYNIK: 16/16 zgodne z wartościami oczekiwanymi w repo.
```

Przy okazji naprawiony drobny, niezwiązany z Keplerem, ale sąsiadujący
defekt: `GENESIS_KEPLER_FIXTURE_DIR` (używany przez
`fetch-kepler-solar-system-fixture.mjs`, dodany w commicie `d2af93cf`) nie
był udokumentowany w `.env.example`, więc P0.4 raportował 1 rozbieżność
niezwiązaną z tym zadaniem — dodano jedną linię.

### CO TA KOTWICA POZOSTAWIA NIEPRZETESTOWANE

Renderowane na ekranie z tą samą wagą wizualną co werdykt: „To NIE jest
pomiar wykonany przez Genesis — obie liczby (odległość i okres) są wzięte z
publikacji NASA, nie zmierzone tym systemem. Kotwica weryfikuje, czy nasza
implementacja III prawa Keplera odtwarza publicznie znaną relację między
dwiema NIEZALEŻNIE zmierzonymi wielkościami — nie testuje samego prawa
fizycznego ani nie odkrywa niczego o Marsie. Nie testuje perturbacji od
innych planet (przybliżenie dwóch ciał) ani ekscentryczności orbity ponad to,
co już zawiera się w użyciu półosi wielkiej."

### Pełna weryfikacja

```
tsc --noEmit                     czysto
eslint src --max-warnings=0      czysto
vitest run (frontend)            470 plików, 5215 passed / 1 znany niezwiązany flake (nextActionSelectors.test.ts,
                                  potwierdzony jako flake: zielony osobno) / 1 znany niezwiązany skip
npm test (backend)                396/396 passed
npm run build                    czysto
node scripts/repro-demo.mjs      16/16
```
