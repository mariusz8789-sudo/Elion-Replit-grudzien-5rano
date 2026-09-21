# PROMPT DLA C1 — R-005 domknięcie: PIERWSZA prawdziwie instrumentalna kotwica (CMS Open Data Z→μμ)

Gałąź: `claude/genesis-autonomous-completion-95bt4e`, stan wejściowy: commit `a822fa0` (P2.3
zamknięte na dwóch kotwicach — PubChem + Kepler/Mars, z belief revision i next question; pełny
opis w `docs/P2_EVIDENCE.md`, `docs/DECISIONS.md` D-022).

## Dlaczego to jest Twoje zadanie, nie nowe

`docs/RISKS.md` R-005 mówi wprost, od dawna: obie istniejące kotwice (PubChem, Kepler/Mars) są
WERYFIKACJĄ WOBEC NIEZALEŻNEGO ŹRÓDŁA (arytmetyka/model kontra publikacja), nie POMIAREM
PRZYRODY. „Następny krok, konkretnie": kotwica empiryczna na CMS Open Data Z→μμ 2011 (rekord 5208,
CC0) — **instrumentalny pomiar**, pierwszy taki w repo. To jest dokładnie Twój wzorzec pracy z tej
sesji (fetch+pin+weryfikacja SHA-256 przez GitHub Actions, bo lokalny sandbox blokuje ogólne hosty
danych naukowych) — zastosowany do trzeciego już źródła (po NIST/CODATA i NASA NSSDCA).

## Co JUŻ ISTNIEJE — nie buduj tego drugi raz

To zadanie jest w 90% ZROBIONE. Sprawdź, zanim napiszesz jedną linijkę:

- `packages/backend/src/compute/cms_zmumu_worker.py` — kompletny worker Pythona. Oczekuje pliku
  `Zmumu.csv` w katalogu `$GENESIS_CERN_OPEN_DATA_DIR`, liczy `sha256`, ODMAWIA jeśli nie zgadza
  się z `EXPECTED_SHA256 = '7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1'`
  (linia 22), liczy masę niezmienniczą `m² = 2·pT1·pT2·(cosh(Δη) − cos(Δφ))` z realnych kolumn CSV.
- `packages/backend/src/compute/cmsOpenDataAdapter.mjs` — `detect()`/`zMuMuInvariantMassStats()`,
  fail-closed: `DATA_REQUIRED` zamiast substytutu, gdy plik brakuje albo suma się nie zgadza.
- `packages/backend/src/compute/registry.mjs` (~linia 1200) — model Fabric
  `particle-cern-cms-zmumu-invariant-mass` W PEŁNI ZAREJESTROWANY: inputs, outputs (8 pól
  statystyki opisowej), `provenance` z URL-em, SHA-256, licencją CC0-1.0, `validate()`/`execute()`
  gotowe.
- `packages/backend/src/cmsOpenDataCompute.test.mjs` — trzy testy. Dwa pierwsze (odmowa bez pliku)
  już przechodzą. **Trzeci jest `{ skip: !configuredDataDir }`** i zawiera DOKŁADNE oczekiwane
  wartości z realnego pliku (`eventCount: 10_000`, `events80To100GeV: 8259`,
  `median: 90.28540772526225`) — ktoś już policzył je raz na prawdziwych danych. Twoje zadanie
  odblokowuje ten test, nie pisze nowego.
- `.env.example` już ma `GENESIS_CERN_OPEN_DATA_DIR=` — kontrakt env jest kompletny.

**Twoje zadanie to WYŁĄCZNIE: pobrać plik przez CI (gdzie egress działa), zweryfikować sumę,
przypiąć go do repo, ustawić zmienną w CI, i potwierdzić że model faktycznie liczy na realnych
danych.** Zero nowego kodu domenowego — worker, adapter i model już istnieją i są przetestowane
pod nieobecność danych.

## Krok po kroku — dokładnie wzorzec Kepler/NIST, ten sam co robiłeś wcześniej

1. **Zmierz dostęp, nie zakładaj.** `curl -sS -o /dev/null -w "%{http_code}\n" --max-time 20
   https://opendata.cern.ch/record/5208/files/Zmumu.csv` z TWOJEGO sandboxa. Zanotuj wynik w
   `docs/RISKS.md` — jeśli 403/timeout (spodziewane, jak dla NASA/NIST/Zenodo), to potwierdza że
   trzeba iść przez CI, dokładnie jak poprzednio.
2. Napisz `scripts/fetch-cms-zmumu-fixture.mjs`, dokładnie wzorem
   `scripts/fetch-kepler-solar-system-fixture.mjs`: fetch `Zmumu.csv`, policz SHA-256, **porównaj z
   `EXPECTED_SHA256` już zapisanym w `cms_zmumu_worker.py` — jeśli się NIE zgadza, przerwij z
   wyjaśnieniem (nie przypinaj innej wersji pliku niż ta, dla której worker i test mają twarde
   oczekiwane liczby)**, zapisz `manifest.json`.
3. Dodaj job CI `cms-zmumu-pinned-artifact` w `.github/workflows/ci.yml`, wzorem
   `kepler-solar-system-pinned-artifact`: checkout, setup-node, fetch script, weryfikacja
   manifestu+hasha, upload artefaktu.
4. **Artefakt CI (Azure Blob Storage) będzie zablokowany z Twojego sandboksa tak samo jak
   poprzednio dwa razy.** Znasz już obejście: odczytaj log joba przez `mcp__github__get_job_logs`,
   znajdź realną zawartość (dodaj tymczasowy krok `cat`/wypisanie do loga jeśli fetch script sam
   tego nie robi), zrekonstruuj plik lokalnie, policz SHA-256 i porównaj **potrójnie** (fetch
   script w logu, osobny krok weryfikacyjny joba, Twoje niezależne przeliczenie) — dokładnie
   protokół z D-0XX dla Keplera. Dopiero pełna zgodność uzasadnia przypięcie pliku do repo (obok
   workera albo w `packages/backend/src/compute/` — zdecyduj po tym, gdzie worker go czyta łatwiej;
   NIE zmieniaj samego workera bez realnego powodu).
5. Usuń krok diagnostyczny, zastąp trwałą kontrolą dryfu (świeży fetch vs przypięta kopia) —
   dokładnie jak zrobiłeś dla `kepler-solar-system-pinned-artifact`.
6. Ustaw `GENESIS_CERN_OPEN_DATA_DIR` w kroku testowym backendu w CI (`verify` job w
   `ci.yml`), żeby wskazywał na przypięty katalog — trzeci, dotąd pomijany test w
   `cmsOpenDataCompute.test.mjs` MUSI zacząć realnie się wykonywać (nie zostać `skip`) w CI.

## Co zrobić, jeśli dostęp jest ZABLOKOWANY nawet z GitHub Actions

Mało prawdopodobne (Actions ma zwykły dostęp do internetu, potwierdzone trzy razy z rzędu dla
innych hostów), ale jeśli się zdarzy: zgłoś `BLOCKED — brak dostępu do źródła` w `docs/RISKS.md`
R-005 z dowodem próby (kod HTTP z loga CI), nie próbuj obejścia przez inny plik ani nie
fabrykuj CSV.

## ZASADY TWARDE (te same co zawsze)

1. Dowód = komenda + wyjście + hash commita. Bez dowodu → `NOT VERIFIED`.
2. `git fetch` PRZED każdym pushem — inne sesje (C2 na QE4, C3 na QE5-7) pchają na tę samą gałąź
   równolegle. Twoje pliki (`scripts/fetch-cms-zmumu-fixture.mjs`, `ci.yml` nowy job,
   `cms_zmumu_worker.py`'s katalog danych) nie powinny kolidować z niczyimi, ale i tak sprawdź.
3. NIE dotykaj `externalAnchor.ts`, `entanglementMeasures.ts`, `tautologyGate.ts` — to jest strefa
   C2/C3 w tym samym oknie czasowym.
4. Zero nowego silnika: worker, adapter, model Fabric już istnieją, gotowe do użycia.
5. Pełna bramka przed pushem: eslint, tsc, `npm run test --workspace=packages/backend` (trzeci
   test w `cmsOpenDataCompute.test.mjs` musi przejść NAPRAWDĘ, nie zostać skip), build,
   `node scripts/repro-demo.mjs` (regresja — nie powinieneś tam nic zmieniać).

## DONE

- `Zmumu.csv` przypięty w repo, SHA-256 bajt-w-bajt zgodny z `EXPECTED_SHA256` w
  `cms_zmumu_worker.py` — potwierdzone trzema niezależnymi obliczeniami.
- Job CI `cms-zmumu-pinned-artifact` zielony, z trwałą kontrolą dryfu.
- `cmsOpenDataCompute.test.mjs` — WSZYSTKIE TRZY testy przechodzą naprawdę w CI (trzeci już nie
  `skip`), z dokładnie tymi liczbami, które są tam zapisane (`eventCount: 10000`,
  `events80To100GeV: 8259`, `median: 90.28540772526225`).
- `docs/RISKS.md` R-005 zaktualizowane: PIERWSZA prawdziwie INSTRUMENTALNA kotwica w repo (nie
  weryfikacja wzajemna jak PubChem/Kepler) — realny pomiar detektora CMS, nie przeliczona wartość.
- `docs/DECISIONS.md` — nowy wpis ADR z numerem kolejnym po najwyższym istniejącym w chwili
  Twojego pushu (sprawdź `grep -n "^## D-0" docs/DECISIONS.md | tail -1` PO `git fetch`, bo C2/C3
  mogą dopisać własne w międzyczasie).
