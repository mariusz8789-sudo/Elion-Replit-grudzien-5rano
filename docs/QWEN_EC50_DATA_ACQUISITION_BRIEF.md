# QWEN BRIEF — CZEGO SZUKAĆ W DANYCH EC50 (GLP-1R, human)

Status: DATA-ACQUISITION ONLY. Nie jest to zlecenie na kod, model ani "ulepszenie QSAR".
Wystawione po D-091. Progi, piny i Winner Gate są ZAMROŻONE i nie podlegają tej pracy.

---

## 0. Co Genesis JUŻ zmierzył (to są fakty zapieczętowane, nie założenia)

Nie podważaj tych liczb i nie "poprawiaj" ich. One definiują, czego brakuje.

| Pomiar | Wartość | Źródło |
|---|---|---|
| Gate GLP-1R (zamrożony) | MIN_TRAIN=150, MIN_TEST=40, MAX_MAE=1.0, MIN_R2=0.25 | ruleFingerprint `d2f77a7e6042f0fc` |
| EC50-only, po splicie | train **118**, test **32** | D-089 |
| IC50-only, po splicie | train 56, test 13 | D-089 |
| Ki-only, po splicie | train 4, test 0 | D-089 |
| Wszystkie 7 podzbiorów endpointów | ŻADEN homogeniczny podzbiór nie przechodzi 150/40 | D-089, enumeracja wyczerpująca |
| Molekuły z EC50 **i** IC50/Ki jednocześnie | **65** | D-089 |
| Mediana rozjazdu EC50 vs IC50/Ki | **1.7618** jednostki pActivity | D-089 |
| Grupy replikacyjne EC50 (ta sama molekuła + ten sam endpoint + ≥2 różne assayId) | **4** | D-091 |
| Grupy replikacyjne IC50 / Ki | 2 / 0 | D-091 |
| Próg mierzalności noise floor | **20 grup** | `replicateGrouping.mjs` |
| Noise floor | **NOT_MEASURED** na każdej osi | D-091, seal `e965ac46...` |
| Unikalne szkielety Murcko w pinie | **89** | D-089 |
| Udział top-10 szkieletów | **57.5%** | D-089 |
| NN-Tanimoto p95 (ECFP4) | **1.00** | D-089 |
| Molekuły mające sąsiada ≥0.7 | **92%** | D-089 |
| Najlepszy zmierzony model (V2, arm B) | MAE 1.0425, R² 0.5182 | D-088 |
| Wynik D-088 | BOTH_ARMS_BLOCKED, budżet prób 1/2 | seal `fc6cf73e63a9e569` |

**Wniosek, który z tego wynika i którego ten brief dotyczy:**
model nie jest wąskim gardłem. MAE 1.0425 przy progu 1.0 to rozjazd 0.0425 — mniejszy niż
wewnętrzna sprzeczność danych (1.7618). **Wąskim gardłem są dane.** Dlatego szukamy danych,
a nie architektur.

---

## 1. Czego NIE rób

Wymienione wprost, bo każdy z tych punktów już raz wrócił jako "ulepszenie":

1. ❌ Nie proponuj nowej architektury modelu, nowych deskryptorów, ensembli, GNN, transferu.
2. ❌ Nie proponuj zmiany MIN_TRAIN / MIN_TEST / MAX_MAE / MIN_R2. Ani o 0.01.
3. ❌ Nie proponuj zmiany reguły splitu (`scaffold-hash-mod10`, djb2, kubełki 0-1 test / 2-3 calib / 4-9 train).
4. ❌ Nie proponuj mieszania endpointów ("EC50 ≈ IC50 po korekcie Cheng-Prusoff"). Zmierzony rozjazd to 1.7618. To jest odrzucone empirycznie, nie z zasady.
5. ❌ Nie pisz kodu parsera "na wszelki wypadek". Genesis ma `bindingDbImport.mjs` i loadery z pinami. Kod bez danych jest bezwartościowy.
6. ❌ Nie zgaduj liczb wierszy, hashy, identyfikatorów assayów ani SMILES. Jeżeli czegoś nie masz — pisz `NOT_AVAILABLE`.
7. ❌ Nie podawaj P43119. To receptor prostacykliny. GLP-1R to **P43220**.

---

## 2. Tożsamość celu — jedyna dopuszczalna

```
target            : Glucagon-like peptide 1 receptor (GLP-1R)
species           : Homo sapiens (human) ONLY
uniprot           : P43220
chembl_target_id  : CHEMBL1784
```

Zasady identyfikacji:
- Dopasowanie **po identyfikatorze**, nigdy po nazwie. "GLP-1 receptor", "GLP1R", "Glucagon receptor family" to nie jest dowód.
- Ortologi (mysz, szczur, małpa) → **odrzuć**. Nie "przeskaluj".
- Konstrukty chimeryczne, GLP-1R/GIPR dual, receptory w fuzji → **odrzuć**, chyba że rekord jednoznacznie raportuje aktywność na natywnym ludzkim GLP-1R.
- Uwaga proweniencyjna: **P43220 jest w Genesis DEKLARACJĄ, nie faktem zweryfikowanym** — `rest.uniprot.org` jest obecnie nieosiągalny (`http=000`). Jeżeli masz dostęp do UniProt, pierwszą rzeczą, którą raportujesz, jest potwierdzenie mapowania P43220 ↔ CHEMBL1784 wraz z bajtowym hashem odpowiedzi.

---

## 3. Czego dokładnie szukamy — kryteria wiersza

Wiersz jest **AKCEPTOWALNY** tylko jeżeli spełnia **wszystkie** poniższe:

**A. Endpoint — homogeniczność**
- `standardType` = **EC50** i tylko EC50.
- Assay musi być **funkcjonalny** (cAMP accumulation, cAMP HTRF/AlphaScreen, β-arrestin recruitment, reporter CRE-luc, internalizacja).
- Kierunek: **agonizm**. Antagonist EC50 / IC50 przeliczone na EC50 → odrzuć.
- `standardRelation` = `=`. Cenzurowane (`>`, `<`, `>=`, `<=`) → odrzuć, ale **policz i zaraportuj** ile ich było.
- Jednostki: nM / µM / pM z jawną kolumną jednostek. Jednostka wzięta z sąsiedniej kolumny lub z nagłówka to błąd, który już raz wystąpił — nie powtarzaj go.

**B. Struktura**
- Jest `canonicalSmiles` albo struktura dająca się skanonizować (InChI, MOL, sekwencja peptydu z jawnymi modyfikacjami).
- Peptydy: sekwencja + modyfikacje (Aib, kwas tłuszczowy, linker, C-koniec amid) muszą być jawne. Tirzepatyd, semaglutyd, liraglutyd, eksenatyd i pochodne **są w zakresie** — Genesis parsuje peptydy (`batch_peptide_parse`, RDKit 2026.03.6).
- Mieszaniny, sole bez zdefiniowanego jonu macierzystego, "compound 14" bez struktury → odrzuć.

**C. Proweniencja — pełna, na wiersz**
Każdy wiersz musi nieść:
```
source              # ChEMBL | BindingDB | PubChem | patent | publikacja | supplementary
sourceRecordId      # activity_id / BindingDB Reactant_set_id / AID+SID / numer patentu+tabela
assayId             # STABILNY identyfikator assayu. BEZ TEGO WIERSZ JEST BEZUŻYTECZNY DO REPLIKACJI.
assayDescription
assayFormat         # cAMP | arrestin | reporter | internalization
target, species, uniprot, chemblTargetId
standardType, standardRelation, standardValue, standardUnits
canonicalSmiles (lub sekwencja+modyfikacje)
compoundId          # ChEMBL ID / CAS / nazwa nadana w publikacji
documentRef         # DOI lub PMID lub numer patentu
rawByteHash         # sha256 pobranego pliku źródłowego
retrievedAt
```
Brak `assayId` → wiersz jest do trenowania, ale **nie liczy się do noise floor**. Rozdziel te dwie liczby w raporcie.

---

## 4. Trzy rzeczy, które mają realnie wypełnić lukę

To jest sedno briefu. Nie "więcej danych" — **te trzy deficyty**.

### DEFICYT 1 — liczebność (odblokowuje gate na osi N)
- Obecnie EC50-only: 118 train / 32 test. Gate wymaga 150 / 40.
- Zmierzona alokacja splitu: pTrain = **0.6082**, pTest = **0.1649**.
- Wiążące jest ramię train: N_new ≥ (150 − 118) / 0.6082 = **52.6** → **≥53 nowe wiersze EC50**.
- Status tej liczby: **PROPOSED**, wyprowadzona z alokacji zmierzonej na obecnym pinie. Alokacja jest deterministyczna, ale zależy od tego, na jakie kubełki djb2 wpadną nowe szkielety. **53 to dolne oszacowanie przy założeniu zachowania alokacji, nie gwarancja.** Realistyczny cel: **80-120 wierszy**, żeby mieć margines na odrzuty.

### DEFICYT 2 — replikacje (odblokowuje pomiar noise floor)
- Definicja repliki w Genesis, jedna i jedyna (`replicateGrouping.mjs`):
  `ta sama canonicalSmiles + ten sam standardType + ≥2 RÓŻNE assayId`
- Obecnie EC50: **4 grupy**. Próg mierzalności: **20**.
- Czyli: potrzeba **≥16 dodatkowych grup**.
- **Najtańsza droga do tych 16 — przeczytaj uważnie.** Zapieczętowany rozkład EC50 to: **189 molekuł, z czego 185 ma dokładnie jeden rekord EC50** (`rejectedSingleRecord: 185`, `rejectedSameAssayOnly: 0`). Te 185 molekuł są **o jeden assay od bycia replikacją**. Znalezienie DRUGIEGO, niezależnego pomiaru EC50 dla molekuły już obecnej w pinie tworzy grupę replikacyjną **bez dodawania nowego związku**. To jest tania i wysoce wartościowa robota: 16 trafień w istniejące 185 wystarczy, żeby noise floor stał się mierzalny.
- `rejectedSameAssayOnly: 0` znaczy, że w pinie nie ma obecnie żadnego przypadku dwóch wierszy z tego samego assayu — nie licz na „odzyskanie” grup przez zmianę interpretacji. Ich tam po prostu nie ma.
- **Dwa wiersze z tego samego `assayId` to JEDEN pomiar, nie replika.** To jest najczęstszy błąd. Ten sam związek zmierzony dwa razy w tym samym eksperymencie nie mówi nic o szumie międzylaboratoryjnym.
- Najlepsze źródła replikacji: związki referencyjne występujące w wielu publikacjach — GLP-1(7-36)amid, eksenatyd, liraglutyd, semaglutyd, danuglipron, orforglipron, tirzepatyd, oraz "compound X" powtarzane jako kontrola w seriach SAR.
- **To jest najwyższy priorytet.** Bez noise floor nie wiemy, czy MAE 1.0425 to słaby model, czy szum danych. Bez tej odpowiedzi kolejna próba D-088 (budżet 1/2, została jedna) jest strzałem w ciemno.

### DEFICYT 3 — nowe szkielety (odblokowuje uczciwy test)
- Pin: 89 unikalnych szkieletów Murcko, top-10 = 57.5% masy, NN-Tanimoto p95 = 1.00, 92% molekuł ma sąsiada ≥0.7.
- To znaczy: zbiór jest **analogowy**. Dodanie 200 kolejnych analogów tych samych rdzeni podniesie N i nie podniesie niczego więcej — model już umie te rdzenie.
- Szukaj związków, których szkielet Murcko **nie występuje** wśród tych 89, i których maksymalne podobieństwo ECFP4 do pinu jest **< 0.7**.
- Kierunki, gdzie takie szkielety realnie są: małocząsteczkowi agoniści GLP-1R (seria danuglipron/orforglipron i ich konkurenci), PAM-y, agoniści niepeptydowi z patentów, chemotypy z przesiewów HTS.
- Raportuj dla każdego wiersza: `murckoScaffold`, `isNewScaffold` (true/false względem 89), `maxTanimotoToPin`.

---

## 5. Niezależność źródeł — po pochodzeniu, nie po domenie

Genesis liczy niezależność źródeł (`sourceIndependence.mjs`). Dwa różne URL-e to nie są dwa źródła.

Odrzuć jako zależne:
- Mirrory ChEMBL (EBI, mirrory instytucjonalne, kopie w agregatorach).
- Rekordy PubChem, których `aid_source.db` wskazuje na ChEMBL — **to jest depozyt ChEMBL, nie niezależny pomiar**. (To już raz zostało ustalone: PubChem GIPR = ChEMBL deposit.)
- BindingDB wiersze z `ChEMBL_ID` wypełnionym z tego samego activity — sprawdź `Curation/DataSource`.
- Ten sam `assayId` pod dwoma nazwami.
- Rekordy z tego samego DOI/PMID — to jedna praca, niezależnie od tego, iloma kanałami przyszła.

**Ograniczenie, które musisz znać:** obecny pin Genesis **nie ma pola PMID**. Deduplikacja po publikacji jest z samego pinu `NOT_MEASURED`. Dlatego `documentRef` w nowych danych jest obowiązkowy — inaczej nie da się sprawdzić nakładania z tym, co już mamy.

Dla każdego wiersza podaj `originProvenance`: łańcuch od pomiaru do pliku, który pobrałeś.

---

## 6. Ograniczenie egress (przeczytaj, zanim zaczniesz)

Z kontenera Genesis następujące hosty zwracają `http=000`:
`bindingdb.org`, endpoint SDF BindingDB, `rest.uniprot.org/P43220`, `surechembl.org`.

Konsekwencje:
- Jeżeli **ty** masz sieć — pobierz i dostarcz **surowe pliki źródłowe** wraz z sha256, nie streszczenia. Genesis parsuje sam, własnymi loaderami, z pinem.
- Jeżeli **ty też nie masz sieci** — napisz `EGRESS_BLOCKED` i **skończ**. Nie rekonstruuj danych z pamięci modelu. Wartość EC50 odtworzona z pamięci LLM jest fabrykacją, nawet jeżeli trafiona.

---

## 7. Format odpowiedzi

Dwa bloki. Nic poza nimi.

**BLOK 1 — raport wykonalności (proza, krótko):**
- Czy masz egress? Do których źródeł?
- Czy potwierdziłeś P43220 ↔ CHEMBL1784? Hash odpowiedzi?
- Ile wierszy EC50 realnie da się zdobyć w każdym z trzech deficytów?
- Co jest niemożliwe i dlaczego.

**BLOK 2 — dane, JSON:**
```json
{
  "status": "DELIVERED | PARTIAL | EGRESS_BLOCKED | NOT_AVAILABLE",
  "targetVerification": {
    "uniprot": "P43220",
    "chemblTargetId": "CHEMBL1784",
    "verified": true,
    "evidence": "…",
    "rawByteHash": "sha256:…"
  },
  "sourceFiles": [
    { "path": "…", "source": "…", "sha256": "…", "retrievedAt": "…", "bytes": 0 }
  ],
  "rows": [
    {
      "canonicalSmiles": "…",
      "sequence": null,
      "modifications": null,
      "compoundId": "…",
      "standardType": "EC50",
      "standardRelation": "=",
      "standardValue": 0.0,
      "standardUnits": "nM",
      "assayId": "…",
      "assayDescription": "…",
      "assayFormat": "cAMP",
      "source": "…",
      "sourceRecordId": "…",
      "documentRef": "…",
      "species": "Homo sapiens",
      "uniprot": "P43220",
      "originProvenance": "…",
      "murckoScaffold": "…",
      "isNewScaffold": true,
      "maxTanimotoToPin": 0.0
    }
  ],
  "counts": {
    "rowsTotal": 0,
    "rowsWithAssayId": 0,
    "rowsNewScaffold": 0,
    "replicateGroupsEC50": 0,
    "rejectedCensored": 0,
    "rejectedNonHuman": 0,
    "rejectedNoStructure": 0,
    "rejectedDependentSource": 0
  },
  "notMeasured": ["…"]
}
```

Każde pole, którego nie masz → `null` albo wpis w `notMeasured`. **Nigdy wartość zmyślona.**

---

## 8. Kryterium sukcesu tego zlecenia

Zlecenie jest wykonane, jeżeli Genesis dostanie dane, które pozwalają:
1. zmierzyć noise floor EC50 (≥20 grup replikacyjnych), **oraz**
2. zbudować homogeniczny zbiór EC50-only przechodzący 150/40 na nowych szkieletach.

Zlecenie **nie jest** wykonane przez:
- zbiór, który przechodzi 150/40 samymi analogami (podnosi N, nie podnosi informacji),
- zbiór bez `assayId` (nie da się zmierzyć szumu),
- zbiór mieszany endpointowo (dziedziczy sprzeczność 1.7618),
- jakąkolwiek propozycję zmiany progu.

**Uczciwe `EGRESS_BLOCKED` jest lepszym wynikiem niż jakikolwiek zbiór, którego proweniencji nie da się odtworzyć.**
Genesis ma prawo skończyć z NO_WINNER. Nie ma prawa skończyć z Winnerem zbudowanym na danych, których nie da się zreplikować.
