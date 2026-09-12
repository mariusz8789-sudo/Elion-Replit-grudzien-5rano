# PROMPT DLA C1 — B1: ULEZ 2023 → NO₂, niezależna adjudykacja sprzecznych publikacji

Gałąź: `claude/genesis-autonomous-completion-95bt4e`. **`git fetch` pierwsze.** To zadanie było
ŚWIADOMIE ODROCZONE (patrz sekcja „B1" na końcu `C1-A1-glp1-substitution.md` i wpis w
`docs/prompts/README.md`) — dopóki użytkownik jawnie nie zdecyduje, że warto zbudować nowy,
reużywalny prymityw przyczynowo-statystyczny. **Ta decyzja właśnie zapadła.** To zadanie
zaczyna się DOPIERO po zamknięciu CMS Z→μμ (`C1-R005-cms-zmumu-pinning.md`) i A1/GLP-1
(`C1-A1-glp1-substitution.md`) — kolejność, nie zamiennik.

## Skąd to się wzięło

Qwen dostarczył drugi pakiet badawczy — pełny ranking TOP 3 kandydatów na kolejny realny
eksperyment (ULEZ→NO₂ / Brydges dynamical entanglement / GLP-1) — i wybrał ULEZ jako
NAJLEPSZEGO kandydata (`docs/B1_ULEZ_NO2_ADJUDICATION_REAL_DATASET_AND_EXPERIMENT.md`,
`STATUS: NOT RUN`, zapisany DOSŁOWNIE). **Przeczytaj go w CAŁOŚCI** przed czymkolwiek innym —
sekcje A–E Kandydata 1 i cała sekcja „FINAL PACKAGE" to Twoja specyfikacja.

## Pytanie naukowe, w jednym zdaniu

Czy poszerzenie londyńskiej strefy ULEZ (29 sierpnia 2023) realnie obniżyło przyzdrożowe NO₂,
ponad trend tła, względem porównywalnych miast UK bez opłaty za wjazd? Publikacje SIĘ NIE
ZGADZAJĄ: Tong i in. 2025 (PMC12545172) nie widzą wykrywalnego efektu; raport roczny TfL i
komunikaty prasowe twierdzą poprawę (NOx −14%). Niezależna, prerejestrowana reanaliza na
SUROWYCH danych z monitorów DEFRA AURN — nie na przetworzonych szeregach żadnej ze stron —
adjudykuje ten spór. To jest realny wkład (ADJUDYKACJA wg §16 pakietu), nie powtórka.

## Dlaczego to NAPRAWDĘ jest nowy prymityw — i dlaczego mimo to nie łamie „zero nowych silników"

Pakiet nazywa to wprost jako **CAP-2, NEW REUSABLE CAPABILITY**: estymator
difference-in-differences / interrupted-time-series / synthetic-control z błędami
standardowymi klastrowanymi po mieście + testami placebo/kontrolnymi. Genesis tego nie ma —
**sprawdź to sam** (`grep -rn "differenceInDifferences\|syntheticControl\|causalInference"
packages/frontend/src` na commit bazowy tego promptu), nie zakładaj.

To jest budowa NOWEGO, OGÓLNEGO modułu (`core/agent/causalInference.ts` albo podobna nazwa w
istniejącej strukturze katalogów) — zaprojektowanego RAZ, reużywalnego dla przyszłych
eksperymentów polityki publicznej (Szkocja MUP, Francja 80 km/h, inne LEZ/CAZ), **nie
jednorazowego hacka wciśniętego pod ULEZ**. To jest DOKŁADNIE ta granica, o którą pytała
odroczona notatka — i użytkownik jawnie na nią odpowiedział: budować. Minimalny interfejs z
pakietu (§E, CAP-2): `fit(panel, treatment, controls, estimator) → {estimate, CI, diagnostics,
placebo_results}`. Zero nowego SILNIKA fizyki/chemii/biologii — to jest jeden statystyczny
prymityw, tego samego rzędu co `beliefRevision.ts`/`tautologyGate.ts`, nie druga Warstwa
Naukowa.

**TDD dla CAP-2 samego w sobie, zanim dotkniesz ULEZ:** symulowane panele z WSTRZYKNIĘTYM
znanym efektem (estymator musi go odzyskać w granicach błędu), panele placebo (musi zwrócić
null), test równoległych trendów przed leczeniem (parallel-trends pre-test). Bez tego CAP-2 jest
nieprzetestowaną skrzynką, a cały wniosek o ULEZ jest wart tyle, ile ta skrzynka.

## Dane — zmierz dostęp, nie zakładaj

`https://uk-air.defra.gov.uk/data/` (Data Selector), metadane sieci
`https://uk-air.defra.gov.uk/networks/network-info?view=aurn`, dane lokalnych władz Londynu
`https://www.airqualityengland.co.uk/local-authority/data`, agregaty
`https://www.gov.uk/government/statistical-data-sets/env02-air-quality-statistics`; krzyżowo
EEA `https://www.eea.europa.eu/en/datahub/datahubitem-view/778ef9f5-6293-4846-badd-56a29c70880d`
i OpenAQ `https://openaq.org`. **Zmierz dostęp bezpośrednio z sandboksa PIERWSZE**
(`curl -sS -o /dev/null -w "%{http_code}\n" --max-time 20 https://uk-air.defra.gov.uk/data/`);
jeśli zablokowane, ta sama technika CI-fetch-pin, której użyłeś już pięciokrotnie (NIST, Kepler,
CMS, QE4/Brydges, A1/ChEMBL).

**[NOT VERIFIED] w pakiecie — zweryfikuj PRZED zamrożeniem prerejestracji, nie po:**
- dokładny tekst licencji DEFRA (Open Government Licence) i EEA,
- nazwy pól/flag ratified/non-ratified w rzeczywistym pobranym CSV,
- status polityki (brak strefy opłat w oknie badania) dla każdego miasta kontrolnego
  (Manchester, Leeds, Sheffield, Liverpool, Newcastle) — osobno, nie z pamięci,
- cytat źródłowy dla prerejestrowanego zakresu efektu [−6, −2] µg/m³ (literatura
  wcześniejszej, WEWNĘTRZNEJ strefy ULEZ — nie ten sam artykuł, który adjudykujesz).

DEFRA/EEA nie publikują sum kontrolnych — policz SHA-256 przy zamrożeniu (ten sam wzorzec co
`nssdc-planetary-factsheet.html`/`pubchem-cid-2519.json`), zapisz w manifeście z URL-em
zapytania i znacznikiem czasu.

## Prerejestracja — zamknij PRZED analizą, dokładnie wg §6 pakietu

Pierwotny punkt końcowy: DiD 12-miesięczny na przyzdrożowym NO₂. Wtórne: 6/24-miesięczne,
przyzdrożowe-vs-tło, heterogeniczność dzielnic (EXPLORATORY, oznacz jako taką). Kryterium
falsyfikacji: 95% CI wyklucza −1 µg/m³ (obejmuje 0 lub dodatnie) → odrzuca sensowną redukcję.
Kryterium podparcia: 95% CI całkowicie poniżej −1 I pokrywa się z [−6,−2] → SUPPORTED. CI między
−1 a 0 → INCONCLUSIVE. **Zakres, estymator, miasta kontrolne i pasma MUSZĄ być zapisane i
odciśnięte PRZED pobraniem jakichkolwiek danych z DEFRA/EEA** — to jest audyt HARK-owania z
pakietu (§10): jeśli zakres [−6,−2] zostanie „dostrojony" po zobaczeniu liczb Tonga/TfL, cały
wynik jest bezwartościowy.

## Kontrole negatywne — obowiązkowe, muszą realnie przejść

(a) para miast kontrolnych (Manchester vs Leeds) — oczekiwany null; (b) zanieczyszczenie mniej
zależne od ruchu (SO₂) — oczekiwany słabszy/zerowy efekt; (c) placebo na dacie sprzed
wprowadzenia ULEZ. Bez tego „SUPPORTED" nic nie znaczy — dokładnie ta sama dyscyplina co
falsyfikacja w P2.3/QE1-3/A1.

## Tautology Gate — oczekiwany `MIXED_TEST`

Reużyj `tautologyGate.ts::assessTautology` (wielo-komponentowy, jak w A1/QE4): agregacja
CSV→miesięczna średnia = `CONSISTENCY_CHECK` (waga 0); odczyty monitorów wobec prerejestrowanego
pasma = `EMPIRICAL_TEST`; założenia identyfikacyjne (równoległe trendy, brak różnicowych
szoków) = `MODEL_DEPENDENT`. Jeśli wyjdzie coś innego niż `MIXED_TEST` — to sygnał, że któraś
strona nie jest tak niezależna, jak zakładano (dokładnie lekcja z QE1).

## Audyt cyrkularności (§11 pakietu)

Surowe monitory są niezależne od OBU adjudykowanych twierdzeń. **Nigdy nie pobieraj
przetworzonych szeregów z artykułu Tonga ani z raportu TfL** jako danych wejściowych — tylko
surowe odczyty DEFRA/AURN. Wspólne czynniki sezonowe/pogodowe obsłuż przez efekty stałe/kowarianty,
nie przez selekcję okna czasowego po fakcie.

## Reużyj, nie buduj drugi raz

`predictionVerification.ts`/`verifyPredictionAgainstRealExperiment` dla kryterium DiD wobec
pasma; `tautologyGate.ts` jak wyżej; `beliefRevision.ts`/next-question jak w P2.3/QE1-3/A1;
wzorzec freeze+checksum+manifest z `fetch-kepler-solar-system-fixture.mjs`/
`fetch-cms-zmumu-fixture.mjs`. CAP-2 (estymator) jest JEDYNYM nowym kodem naukowym w tym
zadaniu — wszystko inne to podłączenie do istniejącej maszynerii.

## TDD i weryfikacja

1. Test na czerwono najpierw dla CAP-2: symulowany panel z wstrzykniętym efektem (musi się
   odzyskać), panel placebo (musi wyjść null).
2. Test na czerwono dla freeze: brak manifestu/sumy kontrolnej → odmowa (wzorzec
   `externalObservationAnchor.test.ts`).
3. Pełny cykl: DiD + ITS + synthetic-control jako robustness, klastrowane błędy, kontrole
   negatywne, Tautology Gate, replay.
4. Regresja: P2.3/QE1-3/A1 nietknięte.

## ZASADY TWARDE

1. Dowód = komenda + wyjście + hash commita.
2. `git fetch` przed KAŻDYM pushem — inne sesje pchają równolegle.
3. CAP-2 to JEDEN nowy, ogólny, reużywalny moduł — nie wolno zaszyć logiki DiD wewnątrz
   samego zadania ULEZ ani skopiować jej po cichu przy następnym eksperymencie polityki.
4. Zakres efektu, miasta kontrolne, estymator i pasma ZAMROŻONE przed pobraniem danych —
   żadnej korekty po zobaczeniu wyniku.
5. Zero pobierania przetworzonych danych z adjudykowanych publikacji (Tong/TfL) jako wejścia.
6. Gdziekolwiek pakiet mówi `[NOT VERIFIED]` — zweryfikuj realnie albo zostaw jako `BLOCKED`
   z nazwanym powodem; nie zgaduj i nie przepisuj z pamięci.
7. Werdykt = ADJUDYKACJA (§16 pakietu), nigdy nie nazywaj tego „DISCOVERY" — to zastrzeżone
   dla nowego, nieoczekiwanego wyniku POZA samą adjudykacją.
8. Pełna bramka przed pushem: eslint, tsc, oba suite'y, build, `node scripts/repro-demo.mjs`.

## POLICY SAFETY BOUNDARY — twarda granica, nie luka

Ten eksperyment jest CELOWO zaprojektowany jako **niezależna adjudykacja dowodowa**: rozstrzyga
sprzeczne opublikowane szacunki (Tong 2025 vs TfL) na surowych odczytach monitorów DEFRA/AURN, z
jawnym werdyktem SUPPORTED/FALSIFIED/INCONCLUSIVE i jawnym oznaczeniem, co jest pomiarem, co
modelem statystycznym, a co założeniem przyczynowym. To NIE jest luka do domknięcia w
przyszłości — to trwała granica funkcji, obowiązująca DZIŚ i w KAŻDEJ przyszłej rozbudowie tego
modułu (`causalInference.ts`/CAP-2 i wszystkiego, co go użyje: Szkocja MUP, Francja 80 km/h, inne
LEZ/CAZ):

1. **Nigdy** dekret, nakaz ani „rekomendacja dla rządu" sformułowana jako decyzja — silnik nie
   jest organem władzy publicznej i nie wolno mu udawać, że nim jest.
2. **Nigdy** twierdzenie przyczynowe silniejsze niż to, na co pozwalają założenia
   identyfikacyjne (równoległe trendy przed leczeniem, brak różnicowych szoków) — werdykt musi
   zawsze jawnie oznaczać, które elementy są pomiarem (surowe odczyty), które modelem
   (DiD/ITS/synthetic-control), a które założeniem (parallel trends, brak szoków), i nie wolno
   mu tego zatrzeć w podsumowaniu ani w UI.
3. Decyzję o polityce (utrzymać/rozszerzyć/wycofać ULEZ lub jakąkolwiek inną interwencję)
   podejmuje rząd, samorząd lub regulator — **nigdy silnik**. Werdykt Genesis jest materiałem do
   decyzji (dowód z oceną + odcisk palca + replay), nie decyzją ani zaleceniem politycznym.
4. Ta granica dotyczy WYNIKU (co wolno powiedzieć), nie tylko UI — jeśli werdykt trafi kiedyś do
   `#/evidence`, do raportu grantowego, do komunikatu prasowego albo do jakiegokolwiek
   przyszłego ekranu, sformułowanie MUSI zachować dokładnie to ograniczenie (adjudykacja z
   zastrzeżeniami, nie dekret), niezależnie od tego, kto go tam wstawi.
5. Żadna przyszła rozbudowa CAP-2 (kolejne interwencje polityki publicznej, kolejne miasta/kraje,
   kolejne zanieczyszczenia) nie może po cichu przekroczyć tej granicy — rozszerzenie zakresu
   wymaga jawnej decyzji użytkownika, tej samej rangi co decyzja o zbudowaniu tego eksperymentu.

## DONE

- `causalInference.ts` (albo analogicznie nazwany moduł) — nowy, ogólny, TESTOWANY estymator
  DiD/ITS/synthetic-control z klastrowanymi błędami, testami wstrzykniętego efektu i placebo.
- Dane DEFRA/AURN (+ EEA/OpenAQ jeśli potrzebne do krzyżowej weryfikacji) zamrożone z
  manifestem, SHA-256, URL-em zapytania, datą pobrania.
- Prerejestracja zamknięta i odciśnięta PRZED analizą — zakres, estymator, miasta kontrolne,
  pasma falsyfikacji.
- DiD/ITS/synthetic-control realnie policzone, kontrole negatywne realnie przeszły, Tautology
  Gate `MIXED_TEST`, replay MATCH.
- Werdykt adjudykacyjny wobec Tonga i TfL, z pełną prowieniencją.
- Werdykt sformułowany WYŁĄCZNIE jako dowód z oceną (SUPPORTED/FALSIFIED/INCONCLUSIVE + jawne
  oznaczenie pomiar/model/założenie) — patrz POLICY SAFETY BOUNDARY — bez dekretu, bez
  rekomendacji politycznej, bez twierdzeń przyczynowych ponad założenia identyfikacyjne.
- `docs/RISKS.md`/`docs/MASTER_PRIORITY_GENESIS.md` zaktualizowane z realnym dowodem.
- Jeśli którykolwiek z `[NOT VERIFIED]` punktów pakietu okaże się nie do zweryfikowania —
  zadanie kończy się `BLOCKED` z nazwanym powodem, nie improwizacją.
