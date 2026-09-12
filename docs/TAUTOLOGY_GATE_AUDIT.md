# Tautology Gate — Audit (P2.1, before any implementation)

> **STATUS: IMPLEMENTED.** This document is kept as-is — the audit history
> that shaped the design — and is not rewritten to describe the shipped
> code. See `docs/TAUTOLOGY_GATE_IMPLEMENTATION.md` for the final contract,
> integration point, classifications, known limitations and test evidence.

## 0. Bloker, zweryfikowany niezależnie

`docs/GENESIS_TAUTOLOGY_AND_EMPIRICAL_TEST_GATE.md` nie istnieje w tym repo.
Zweryfikowałem to sam, nie tylko przyjąłem z briefu:

```
$ git log --all --full-history --name-only --pretty=format: | grep -i tautolog
docs/prompts/C3-P2.1-tautology-gate.md
```

Jedyne trafienie to sam prompt zlecający to zadanie — plik specu nigdy nie
istniał w żadnej gałęzi ani w historii. Słownik ze specu
(`CONSISTENCY_CHECK`, `EMPIRICAL_TEST`, `MIXED_TEST`, `UNTESTABLE`,
`NON_DISCRIMINATING`, `DiscriminationRecord`) nie występuje nigdzie w
kodzie — potwierdzone (`grep -rln` po całym `packages/frontend/src`, zero
trafień poza tym samym promptem). Poniżej wyłącznie audyt i propozycja
kształtu; zero implementacji bramki, zero golden cases.

---

## 1. Gdzie rozróżnienie „tautologia vs test empiryczny" już żyje

Repo ma to rozróżnienie w co najmniej **sześciu niezależnie napisanych
miejscach**, pod różnymi nazwami, na różnych poziomach (per-hipoteza,
per-kryterium, per-sprawa, per-pytanie, per-model, per-katalog dźwigni).
Żadne z nich nie nazywa się „Tautology Gate" i żadne nie odwołuje się do
pozostałych.

### 1.1 Analityczny sufit algebry — `entanglementInquiry.ts`

Potwierdzony punkt startowy z briefu, zweryfikowany w pełni:
`packages/frontend/src/core/agent/entanglementInquiry.ts:149-155`
(`QE1_NOT_MODELLED`), `:226-231` (`QE2_NOT_MODELLED`), `:305-310`
(`QE3_NOT_MODELLED`).

Każda z tych tablic to **proza, nie typowany status** — string[] wyjaśniający
DLACZEGO dana hipoteza (np. źródło nadkwantowe naruszające granicę
Tsirelsona) nigdy nie zostaje nawet zamodelowana jako `ParameterHypothesis`:
„The Tsirelson bound 2√2 is an ANALYTIC CEILING of the algebra this model
computes… no run here could ever exceed it, so no run here tests it."

**Ważne zastrzeżenie znalezione przy weryfikacji**: sprawdziłem, czy
`QE1_NOT_MODELLED`/`QE2_NOT_MODELLED`/`QE3_NOT_MODELLED` są gdziekolwiek
importowane poza własnym plikiem —
```
$ grep -rln "QE1_NOT_MODELLED\|QE2_NOT_MODELLED\|QE3_NOT_MODELLED" packages/frontend/src --include="*.ts" --include="*.tsx" | grep -v entanglementInquiry.ts
(pusto)
```
Nic ich nie czyta. To jest **dokumentacja-jako-kod** (świadoma decyzja: hipoteza
o nadkwantowym źródle nigdy nie trafia do `QE1_CANDIDATES`/`QE1_HYPOTHESES` w
ogóle — wykluczenie następuje przez NIEUMIESZCZENIE w katalogu kandydatów, a
`_NOT_MODELLED` tylko to wyjaśnia czytelnikowi), a nie żywa klasyfikacja, którą
program gdzieś sprawdza. Wzorzec do naśladowania w PROZIE i STRUKTURZE
katalogu kandydatów, ale nie gotowy typ do reużycia wprost.

### 1.2 `applicable` vs `met` — `falsificationRelation.ts`

`packages/frontend/src/core/experimentFabric/falsificationRelation.ts:36-47`
(`TwoArmRelationOutcome`): `applicable: boolean` + `met: boolean`, z jawnym
kontraktem w komentarzu — „`met` is then meaningless and must not be read as
a falsification" gdy `applicable === false`. Dwa realne powody
`applicable: false` dziś: relacja seriowa (`monotonic-increase/decrease`)
oceniana na dwóch ramionach (`:61-68`), i brak wymaganej tolerancji dla
`equal-within-tolerance` (`:87-94`).

To jest **najbliższy istniejący odpowiednik** spec'owego rozróżnienia
`EMPIRICAL_TEST` (kryterium da się rozstrzygnąć tymi danymi) vs coś w rodzaju
`UNTESTABLE` (nie da się) — tylko nazwane `applicable`, nie osobnym statusem
enumeracyjnym, i tylko na poziomie POJEDYNCZEGO kryterium dwuramiennego, nie
całej hipotezy.

### 1.3 Nierozstrzygalne ≠ sfalsyfikowane — `discoveryConclusion.ts` / `discoveryCase.ts`

`packages/frontend/src/core/discovery/discoveryConclusion.ts:88-90`:
gdy `!primary.applicable` (patrz 1.2), wniosek to `INSUFFICIENT_EVIDENCE`,
**nigdy** `NOT_SUPPORTED` — dokładnie zasada „nierozstrzygalne ≠
sfalsyfikowane" z briefu, tylko zaimplementowana na tym jednym poziomie
(werdykt sprawy), nie jako ogólna reguła.

`discoveryCase.ts:37-46` (`DiscoveryCaseStatus`) ma osobno status
`NOT_MODELED` (obok `BLOCKED`) — SPRAWA-poziomowy odpowiednik: model nie
wyraża pytania w ogóle (`record.notModeledReason`,
`discoveryConclusion.ts:70`), różne od kryterium-poziomowego
`!applicable`. `DiscoveryVerdict` (`discoveryCase.ts:138`) ma tylko cztery
wartości: `SUPPORTED | PARTIALLY_SUPPORTED | NOT_SUPPORTED |
INSUFFICIENT_EVIDENCE` — i `NOT_MODELED` (sprawa) oraz `!applicable`
(kryterium) OBA kolapsują do `INSUFFICIENT_EVIDENCE` na poziomie werdyktu.
To jest DWUWARSTWOWA architektura już dziś: status sprawy (bogatszy) →
werdykt (uboższy, celowo).

### 1.4 „Czy Genesis może w ogóle odpowiedzieć" — `AdmissionStatus`

**Korekta względem briefu**: `AdmissionStatus` nie jest zdefiniowany w
`discoveryAdmission.ts` (ten plik go tylko UŻYWA, importując typ `Admission`
z `./discoveryStrategy`) — sam typ żyje w
`packages/frontend/src/core/agent/discoveryStrategy.ts:114-128`:
```ts
export type AdmissionStatus = 'REAL' | 'APPROXIMATION' | 'NOT_MODELLED' | 'BLOCKED';
```
z polami `why`, `missing` (niepuste dla `NOT_MODELLED`/`BLOCKED`), `caveat`.

`discoveryAdmission.ts` (`admitWorldQuestion`, `admitParameterInquiry`,
`admitWorldCalibration`) mapuje na ten typ z DWÓCH innych, niezależnych
rejestrów zdolności:
- `SolverCapability`/`CAPABILITY_CODE`
  (`packages/frontend/src/core/worldModel/capability/solverCapability.ts:60-78`):
  `MODELLED (0) | PARTIALLY_MODELLED (1) | NOT_MODELLED (2)`, z `caveat`
  (dla PARTIALLY_MODELLED) i `missing` (dla NOT_MODELLED) — ŚCISŁE
  odzwierciedlenie w `Admission`.
- `experimentFabric/router.ts` (czy model o danym `modelId` w ogóle istnieje
  → `REAL` albo `BLOCKED`, `discoveryAdmission.ts:109-126`).

Kluczowe rozróżnienie nazwane WPROST w komentarzu pliku
(`discoveryAdmission.ts:34-37`): to jest **inne pytanie** niż
`experimentFabric/capabilityAdmission.ts`:
```ts
export type CapabilityAdmissionStatus = 'CONNECTED' | 'MODEL_AVAILABLE' | 'VERIFY_REQUIRED' | 'PARKED';
```
(`capabilityAdmission.ts:5`) — tamto pyta „czy TEN model router jest gotowy
do użycia" (standing modelu), `AdmissionStatus` pyta „czy TO pytanie da się
w ogóle zadać" (standing pytania). G6 (patrz `docs/GENESIS_SCIENTIFIC_
DISCOVERY_ENGINE_MASTER_PLAN.md:97-99`) już nazwał `AdmissionStatus` jednym
z CZTERECH genuinnie ortogonalnych słowników epistemicznych repo (obok
`ReplayVerdict`, `DataProvenance`, `GroundingLevel`) — **nie do
konsolidacji**, tylko do reużycia.

### 1.5 „Brak dyskryminującej sondy" — `inquiryLoop.ts`

Najbliższy istniejący odpowiednik spec'owego `NON_DISCRIMINATING`:
`packages/frontend/src/core/agent/inquiryLoop.ts:202-224`
(`ProbeSelectionRule`), wartość `NO_DISCRIMINATING_PROBE` (`:219`) — „No
untried setting separates ANY pair still in contention; the inquiry stops
rather than running an uninformative experiment", zdecydowane w praktyce
przy `:530` i `:604`.

**Uwaga o zakresie, żeby nie zlać dwóch różnych pojęć**: `NO_DISCRIMINATING_PROBE`
to fakt O KONKRETNYM PRZEBIEGU PĘTLI — te konkretne, już rozważane hipotezy,
przy TEJ sondzie, akurat się nie rozróżniają teraz. To NIE to samo co
analityczny sufit z §1.1 (hipoteza nadkwantowa nigdy nie wchodzi do
`QE1_HYPOTHESES` — nie jest „nierozróżnialna", jest NIEOBECNA). Spec'owe
`NON_DISCRIMINATING` z briefu (z `DiscriminationRecord` i priorytetem 0)
brzmi bliżej temu pierwszemu — ale bez specu nie da się potwierdzić, czy to
naprawdę to samo pojęcie, czy trzecie, jeszcze inne. Patrz §3 (BLOCKED).

`ProbeSelectionRule` ma też `DISCRIMINATES_TOP_TWO` vs
`DISCRIMINATES_OTHER_PAIR` (`:207-218`) — rozróżnienie „rozstrzyga
najsilniejszy spór" vs „tylko zawęża pole" — którego spec (nieznany) może,
ale nie musi, potrzebować.

### 1.6 Anty-cyrkularność — TRZY różne mechanizmy, zero wspólnej funkcji

To jest najważniejsze znalezisko audytu względem `C1–C6` z briefu: zasada
„eksperyment nie może testować własnej definicji" istnieje w repo
**trzy razy, niezależnie napisana, zero współdzielonego kodu**:

**(a) Wykluczenie dźwigni z katalogu** — POWTÓRZONE w czterech domenach,
zawsze tym samym rozumowaniem, zawsze przez OMINIĘCIE w statycznej tablicy,
nigdy przez wspólną funkcję sprawdzającą:
- `epidemicLeverCatalog.ts:271-275` — `r0` policzone z dźwigni, więc cel
  „minimalizuj r0" byłby cyrkularny.
- `cellCultureLeverCatalog.ts:238-245` — `occupancyFraction` to
  `totalCells / carryingCapacityCells`, a `lever:vessel-capacity` ustawia
  mianownik.
- `rainfallRunoffLeverCatalog.ts:168-172` — jedyna zmienna, którą solver
  faktycznie LICZY, reszta to wejścia tylko-do-odczytu.
- `chemistryLeverCatalog.ts:179-183` — ten sam wzorzec, explicite
  odwołujący się do `rainfallRunoffLeverCatalog.ts` jako precedensu.

  Tylko JEDEN z tych czterech ma realny, uruchamialny test tego faktu (nie
  tylko komentarz): `__tests__/rainfallRunoffLeverCatalog.test.ts:61-66`
  (`'no lever's own input field name is offered as a metric phrase target'`)
  — ale to jest STATYCZNA lista pól zaszyta w teście dla TEJ jednej domeny,
  nie generyczna reguła.

**(b) Test na danych wydzielonych (holdout)** — inna domena, inny mechanizm:
`core/agent/decipherment/deciphermentOrchestrator.ts:38-40` — „A REAL,
non-tautological test: decode a HELD-OUT second half of the sequence… independently
from whatever built the reading's own `structuralFit`", zweryfikowane w
`__tests__/decipherment.test.ts:169` (`describe('holdoutSupportsReading —
the real, non-tautological falsification test'`).

**(c) Analityczny sufit** — patrz §1.1 (QE1–QE3): wykluczenie NIE przez
porównanie z metryką ani przez holdout, tylko przez to, że żaden przebieg
modelu fizycznie nie może dać wyniku poza granicą.

**Wniosek**: w przeciwieństwie do statusów epistemicznych (gdzie G6 znalazł
SZEŚĆ typowanych słowników do skonsolidowania), tutaj nie ma CZEGO
konsolidować — nie istnieje żadna wspólna, wywoływalna funkcja
`isCircular(lever, metric)` ani jej odpowiednik. Reguła żyje wyłącznie jako
POWTÓRZONA PROZA i ręczne wykluczenia. To realna luka, nie siódmy słownik —
ale bez specu C1–C6 nie wiadomo, czy zamierzone reguły w ogóle pokrywają
ten sam przypadek (dźwignia == metryka), czy coś szerszego.

### 1.7 Oś pochodzenia danych — `dataProvenance.ts` (NIE mylić z testowalnością)

`packages/frontend/src/core/dataProvenance.ts:1-30`:
`DataProvenance = 'SIMULATED' | 'REFERENCE' | 'REAL_EXPERIMENTAL'`. Własna
dokumentacja pliku already nazywa to OSOBNĄ osią od `ConfirmationLevel`
(jak ugruntowana jest nauka) i od `ExperimentProvenance['resultOrigin']`
(jak przebieg został wykonany). Żadna z tych trzech nie odpowiada na
pytanie „czy tę hipotezę da się w ogóle sfalsyfikować" — bramka anty-tautologii
musi to rozróżnienie SZANOWAĆ (np. brak `REAL_EXPERIMENTAL` danych to inny
powód `NOT_MODELED`/`INSUFFICIENT_EVIDENCE` niż analityczny sufit algebry),
ale nie powinna go dublować ani z niego wyprowadzać statusu testowalności.

### 1.8 Wzorzec konsolidacji do naśladowania — `epistemicReliability.ts` (G6)

`packages/frontend/src/core/epistemicReliability.ts` — realny, wdrożony
precedens tego, JAK wygląda „konsoliduj, nie duplikuj" w tym repo:
- Zero nowego typu nadrzędnego — istniejący `EpistemicStatus`
  (`generator/recipe.ts`) staje się kanoniczną skalą (`:64`).
- Czyste, TOTALNE funkcje mapujące (`knowledgeToCanonicalReliability`,
  `:98-112`; `biotechToCanonicalReliability`, `:120-140`) z `switch` bez
  `default` — brakujący case to błąd `tsc`, nie cichy fallback.
- Jawne rozróżnienie „stan procesu" (`BLOCKED`) od „twierdzenie o
  wiarygodności" — `biotechToCanonicalReliability('BLOCKED')` zwraca
  `undefined`, nigdy nie zgaduje poziomu (`:120-138`).
- ZERO dotknięcia zapisanych danych — żaden zapisany string się nie zmienia.
- Realny konsument produkcyjny: `components/CandidateDossierScreen.tsx`
  (zweryfikowane: `grep -rln epistemicReliability packages/frontend/src`).

To jest dokładnie kształt, pod który powinna pasować bramka anty-tautologii
— patrz §2.

---

## 2. Propozycja kształtu bramki (bez implementacji)

Wnioski z §1 wprost determinują kształt:

### 2.1 Co bramka NIE powinna robić
- Nie wprowadzać ósmego/siódmego słownika epistemicznego równoległego do
  `AdmissionStatus`/`DiscoveryCaseStatus`/`ReplayVerdict`/`DataProvenance` —
  te cztery zostają, tak jak G6 już to rozstrzygnął dla trzech rankingów
  wiarygodności.
- Nie dublować `falsificationRelation.ts`'s `applicable`/`met` — to jest
  JUŻ dokładnie odpowiedź na „czy kryterium jest testowalne tymi danymi".
- Nie zastępować `NO_DISCRIMINATING_PROBE` — to jest JUŻ odpowiedź na „czy
  ten konkretny przebieg pętli ma jeszcze co rozstrzygać".

### 2.2 Co bramka powinna dodać (realna luka, zidentyfikowana w §1.6)
Jedyna prawdziwie brakująca, wspólna rzecz to **generyczna funkcja
klasyfikująca cyrkularność między dźwignią a metryką**, wyciągnięta z
czterech niezależnych implementacji w §1.6(a) do jednego miejsca — kandydat
na kształt (czysta funkcja, zero silnika):

```ts
// core/experimentFabric/circularityCheck.ts (propozycja nazwy, NIE zaimplementowane)
export type CircularityVerdict =
  | { circular: false }
  | { circular: true; reason: string };

export function checkLeverMetricCircularity(
  leverInputFieldNames: readonly string[],
  metricFieldName: string,
): CircularityVerdict;
```

— czysta funkcja nad ISTNIEJĄCYMI polami katalogu dźwigni (nie nowy typ
rekordu), do wpięcia w miejscu, gdzie dziś każdy z czterech katalogów robi
to ręcznie (i przetestować przeciw wszystkim czterem naraz, żeby złapać
regresję którejkolwiek).

### 2.3 Mapowanie na istniejące słowniki (co się z czym łączy)

| Warstwa pytania | Istniejący mechanizm | Plik:linie |
|---|---|---|
| Czy pytanie/model da się w ogóle zadać | `AdmissionStatus` (`REAL/APPROXIMATION/NOT_MODELLED/BLOCKED`) | `discoveryStrategy.ts:114` |
| Czy KRYTERIUM da się rozstrzygnąć tymi danymi | `TwoArmRelationOutcome.applicable` | `falsificationRelation.ts:36` |
| Czy SPRAWA ma wystarczający dowód | `DiscoveryVerdict` (`INSUFFICIENT_EVIDENCE`) | `discoveryCase.ts:138` |
| Czy PĘTLA ma jeszcze co rozstrzygać teraz | `ProbeSelectionRule.NO_DISCRIMINATING_PROBE` | `inquiryLoop.ts:219` |
| Czy hipoteza jest analitycznie nietestowalna (nigdy nie modelowana) | proza `*_NOT_MODELLED` + nieobecność w katalogu kandydatów | `entanglementInquiry.ts:149,226,305` |
| Czy dźwignia == własna metryka (cyrkularność) | **BRAK wspólnej funkcji — 4 ręczne wykluczenia** | §1.6(a) |
| Skąd pochodzi liczba (nie testowalność!) | `DataProvenance` | `dataProvenance.ts:24` |

Jeśli spec (gdy się pojawi) definiuje `CONSISTENCY_CHECK` /
`EMPIRICAL_TEST` / `MIXED_TEST` / `UNTESTABLE`, najbardziej prawdopodobne
mapowanie na bazie powyższego to: `UNTESTABLE` ≈ unia
`AdmissionStatus.NOT_MODELLED` (pytanie) + `applicable: false` (kryterium)
+ analityczny sufit (hipoteza) — ale to jest HIPOTEZA MAPOWANIA, nie fakt,
dopóki spec nie potwierdzi definicji. Nie zakładam więcej niż to.

---

## 3. BLOCKED — brak specu, nic poniżej nie jest zgadywane

- **Reguły anty-cyrkularności C1–C6**: §1.6 pokazuje TRZY różne, realne
  mechanizmy anty-cyrkularności już w repo (wykluczenie z katalogu, holdout,
  analityczny sufit) i JEDNĄ realną lukę (brak wspólnej funkcji dla
  wykluczenia z katalogu). Bez specu nie wiadomo, czy C1–C6 to formalizacja
  TYCH TRZECH, podzbioru, czy czegoś zupełnie innego (np. cykli w grafie
  zależności hipotez). Nie zgaduję.
- **`DiscriminationRecord` z priorytetem 0 dla `NON_DISCRIMINATING`**: §1.5
  pokazuje najbliższy istniejący odpowiednik (`NO_DISCRIMINATING_PROBE`),
  ale bez specu nie wiadomo, czy `DiscriminationRecord` to nowy typ
  potrzebny NA WIERZCHU istniejącego `ProbeSelection`, czy w ogóle inne
  pojęcie (np. coś o priorytetyzacji MIĘDZY różnymi pytaniami, nie
  wewnątrz jednej pętli). Nie zgaduję.
- **25 golden test cases z §6 specu**: zero podstawy do ich napisania.
  Wymyślenie ich i podpisanie jako „z §6 specu" byłoby fabrykacją.

**Rekomendacja**: zażądać specu od autora briefu. Do tego czasu jedyna
bezpieczna kontynuacja to (a) wyciągnięcie `checkLeverMetricCircularity`
z §2.2 jako realnej, samodzielnie uzasadnionej poprawki (nie części
„bramki" — osobne zadanie, osobny PR), albo (b) czekać.
