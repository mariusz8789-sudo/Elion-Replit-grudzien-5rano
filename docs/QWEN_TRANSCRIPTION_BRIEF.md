# QWEN BRIEF — CO DOSTARCZYĆ ZAMIAST BAJTÓW

Status: kanał tekstowy. Wystawione po D-092b.
Progi, piny, split i Winner Gate ZAMROŻONE i nie podlegają tej pracy.

---

## 0. Dlaczego ten brief w ogóle istnieje

Po trzech rundach wiadomo, że blokada ma kształt, nie przyczynę:

| zdolność | kontener Genesis | Ty |
|---|---|---|
| dosięgnąć EBI / UniProt | **NIE** — 403 CONNECT, polityka sieci | z przerwami |
| push na gałąź repo | TAK | **NIE** — brak poświadczeń |

Żadna liczba ponowień po którejkolwiek stronie tego nie zamknie. Proszenie Cię
o commit było defektem mandatu, nie Twoją porażką. Więc: **przestajemy prosić
o 6,3 MB surowych bajtów** i prosimy o coś, co przez kanał tekstowy przejdzie.

---

## 1. USTALENIE, KTÓRE ZMIENIA CAŁE ZLECENIE

Sprawdziłem w kodzie, co naprawdę jest potrzebne do zmierzenia noise floor
(`packages/backend/src/campaign/replicateGrouping.mjs`).

`replicateGroups()` używa `canonicalSmiles` **wyłącznie jako klucza tożsamości**
w mapie. Rozrzut i odchylenie liczy z `pActivity`. Struktura chemiczna nie
wchodzi do żadnego obliczenia.

**Wniosek: noise floor nie potrzebuje SMILES-ów.** Potrzebuje tożsamości
molekuły, endpointu, `assayId` i wartości. To ~55 bajtów na wiersz.

To jest ta rzecz, która odblokowuje naukę — bo to ona rozstrzyga, czy
MAE 1.0425 to słaby model, czy szum danych. I mieści się w kanale tekstowym.

---

## 2. PRIORYTET A — pakiet noise floor (dostarcz to NAJPIERW)

Szacowana wielkość: **~100-125 KB**, do pocięcia na ~10 porcji. Wykonalne.

### A1 — aktywności zbioru replikacyjnego, BEZ struktur

Reguła wyboru, zadeklarowana **przed** transmisją i niepodlegająca Twojemu osądowi:

> weź KAŻDY wiersz EC50 każdej molekuły, która ma ≥2 RÓŻNE `assay_chembl_id`,
> po zastosowaniu istniejącej polityki Genesis (patrz §4).
> Kompletnie. Bez próbkowania, bez „reprezentatywnego wyboru".

Format — jeden wiersz na rekord, pola rozdzielone `|`, bez nagłówka w środku porcji:

```
activity_id|molecule_chembl_id|assay_chembl_id|standard_type|standard_relation|standard_value|standard_units|pchembl_value|document_chembl_id|assay_type|action_type|data_validity_comment|potential_duplicate
```

Puste pole = dwa pipe'y pod rząd. `null` zapisuj jako pusty ciąg, nie jako słowo.
Sortowanie: rosnąco po `activity_id`. Deterministyczne, żeby dało się wykryć
przestawienie.

### A2 — SMILES-y TYLKO dla molekuł z A1

**To jest konieczne i nie jest opcjonalne.** Wyjaśnienie w §3.

```
molecule_chembl_id|canonical_smiles
```

To ~325-400 molekuł, nie 1586. Dlatego mieści się w kanale.

---

## 3. DLACZEGO A2 JEST KONIECZNE — kierunek błędu

Kuszące jest pominąć SMILES-y i grupować po `molecule_chembl_id`. Arytmetyka
byłaby identyczna. **Nie rób tego i nie proponuj tego.**

Dwa różne `molecule_chembl_id` mogą być tą samą strukturą (sole, nieokreślona
stereochemia, duplikaty depozytów). Tożsamość po ID **rozdzieli** grupy, które
tożsamość po strukturze **scaliłaby**. Skutek:

- grupa rozdzielona na dwie może spaść poniżej 2 assayów → **mniej grup**
- rozrzut wewnątrz grupy nie obejmie zmienności międzydepozytowej → **niższy floor**

**Niższy floor to kierunek niebezpieczny** — sprawia, że dane wyglądają na
bardziej wiarygodne niż są, i prowadziłby do wniosku „model jest daleko od
podłogi szumu, strojmy dalej". Dokładnie ten błąd dał wycofane 1.1212 w D-089.

Dlatego Genesis kanonizuje SMILES-y własnym RDKit-em i używa **własnej** reguły
tożsamości. Ty dostarczasz surowe `canonical_smiles` z ChEMBL — nie kanonizujesz,
nie normalizujesz, nie „poprawiasz".

Jeżeli dla którejś molekuły ChEMBL nie ma `canonical_smiles`: wpisz pusty ciąg
i **wymień jej ID w bloku `notRetrieved`**. Nie zgaduj struktury.

---

## 4. Polityka wyboru wierszy — istniejąca, nie nowa

To jest reguła już w repo (`scripts/fetch-gov-drug-discovery-generated-space.mjs:198`).
Zastosuj ją w tej kolejności, zanim wyznaczysz zbiór replikacyjny:

1. `target_chembl_id == CHEMBL1784` (po ID, nie po nazwie)
2. `target_organism == "Homo sapiens"`
3. `standard_type == "EC50"`
4. `standard_relation == "="`
5. `data_validity_comment` puste → **wiersz z komentarzem ODPADA**, nie jest flagą
6. `potential_duplicate` nieustawione → **ODPADA**
7. `standard_units` obecne i jawne (nM/uM/µM/pM/M)

**`action_type` NIE filtruj.** Genesis nie ma reguły o `action_type`, a napisanie
jej teraz byłoby nową polityką. Przekaż pole tak, jak jest — decyzja należy do
człowieka pieczętującego preregistrację.

Po tych siedmiu krokach: zbiór replikacyjny = wszystkie wiersze molekuł
z ≥2 różnymi `assay_chembl_id`.

---

## 5. Integralność transmisji — bez tego pakiet jest bezwartościowy

Kanał tekstowy gubi i przestawia. Każda porcja musi nieść własny dowód.

Dla **każdej** porcji, w tej samej wiadomości co dane:

```
CHUNK <n>/<N>  SET=<A1|A2|B|C>  ROWS=<ile wierszy w tej porcji>
FIRST_KEY=<activity_id lub molecule_chembl_id pierwszego wiersza>
LAST_KEY=<... ostatniego wiersza>
SHA256=<sha256 dokładnie tych bajtów porcji, bez nagłówka, LF na końcu każdej linii>
```

Na koniec **jeden manifest**:

```
SET=A1 TOTAL_ROWS=<n> TOTAL_CHUNKS=<N> CONCAT_SHA256=<sha256 sklejonych porcji w kolejności>
SET=A2 TOTAL_ROWS=<n> TOTAL_CHUNKS=<N> CONCAT_SHA256=<...>
DISTINCT_MOLECULES_IN_A1=<n>
DISTINCT_ASSAYS_IN_A1=<n>
EXPECTED_REPLICATE_GROUPS=<n>
```

`EXPECTED_REPLICATE_GROUPS` to **Twoje przewidywanie**, nie pomiar Genesis.
Genesis policzy własną liczbę swoim modułem i porówna. Rozjazd nie jest błędem —
jest informacją o tym, że reguły tożsamości się różnią, i zostanie zapisany.

---

## 6. Jak to będzie zaetykietowane w Genesis — przeczytaj, zanim wyślesz

To, co przyjdzie tym kanałem, **NIE jest pinem bajtów ChEMBL**. Bajty nigdy
nie dotarły z ChEMBL do nas — dotarła Twoja transkrypcja.

Genesis zapisze to jako `sourceKind: 'user-supplied-reference'` (etykieta, która
już istnieje w `activityDataset.mjs`) i odnotuje, że wierność opiera się na
transkrybującym, nie na hashu odpowiedzi serwera.

**To nie blokuje nauki.** Blokuje tylko jedno: nazwanie tego kiedykolwiek
„zweryfikowanym bajtowo pinem ChEMBL". Jeśli kiedyś pojawi się maszyna mająca
naraz egress i push — pobierze bajty, porówna i podniesie klasę proweniencji.
Do tego czasu klasa jest niższa i jest tak nazwana.

---

## 7. PRIORYTET B i C — dopiero po odebraniu i zweryfikowaniu A

Nie wysyłaj ich razem z A. A ma się domknąć pierwsze.

- **B — tablica molekuł**: `molecule_chembl_id|canonical_smiles` dla wszystkich
  ~1586 molekuł. ~240 KB, ~20-25 porcji. Potrzebne do treningu i scaffoldów.
- **C — pełna tablica aktywności**: format jak A1, wszystkie ~2173 wiersze po
  polityce z §4. ~120 KB, ~10-12 porcji.

Razem B+C dają zbiór treningowy. A sam daje noise floor. **A jest ważniejsze**,
bo bez niego nawet udany model nie wie, co znaczy jego błąd.

---

## 8. Czego NIE wysyłać

1. ❌ Podsumowań, agregatów, median, „statystyk zamiast wierszy". Genesis liczy sam.
2. ❌ „Reprezentatywnej próbki". Każdy podzbiór ma być zdefiniowany regułą z §4, kompletny w swoich granicach.
3. ❌ Wartości odtworzonej z pamięci modelu, jeżeli pobranie się nie powiodło.
4. ❌ Własnej kanonizacji SMILES, zaokrągleń, przeliczeń jednostek. Surowe pola ChEMBL.
5. ❌ Propozycji zmiany progu, splitu, polityki ingestu albo reguły repliki.
6. ❌ Kodu. Genesis ma loadery. Kod bez danych jest bezwartościowy.

---

## 9. Kiedy pobranie znów padnie

Twój egress jest przerywany — w rundzie 3 były cztery timeouty. To jest
przewidziane, nie jest porażką.

Napisz dokładnie:

```
NOT_RETRIEVED  SET=<A1|A2|B|C>  CHUNK=<n>/<N>
ATTEMPTS=<ile>  ERROR=<dokładny błąd>
```

i **skończ tę porcję**. Nie uzupełniaj z pamięci. Porcja, która nie przyszła,
jest lepsza niż porcja, która przyszła zmyślona — pierwszą widać, drugiej nie.

Porcje możesz dosyłać pojedynczo, w dowolnych turach. Manifest z §5 wysyłasz
dopiero, gdy wszystkie porcje danego zbioru faktycznie przeszły.

---

## 10. Kryterium sukcesu

Zlecenie wykonane, gdy Genesis ma zbiór A kompletny i zweryfikowany hashami
porcji, pozwalający policzyć **≥20 grup replikacyjnych własną regułą tożsamości**
i zmierzyć noise floor EC50.

Zlecenie **nie jest** wykonane przez:
- zbiór bez SMILES-ów z A2 (tożsamość po ID zaniża floor — §3),
- zbiór z brakującymi porcjami i manifestem udającym komplet,
- jakąkolwiek liczbę, której Genesis nie może przeliczyć z dostarczonych wierszy.

Uczciwe `NOT_RETRIEVED` na porcji jest lepszym wynikiem niż komplet, którego
wierności nie da się sprawdzić. Genesis ma prawo skończyć z NO_WINNER.
Nie ma prawa skończyć z Winnerem na danych, których nie da się zreplikować.
