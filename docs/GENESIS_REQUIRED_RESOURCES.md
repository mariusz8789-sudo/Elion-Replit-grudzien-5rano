# Genesis — zapotrzebowanie na zasoby

Dokument wymagany przez `docs/GENESIS_EXECUTION_DIRECTIVE.md` §7. Zasada: **braku nie obchodzimy
atrapą.** Każdy brak jest tu wymieniony wraz z klasyfikacją, wpływem, kosztem, trudnością, ryzykiem
licencyjnym i wartością naukową.

Klasyfikacja: **ALREADY HAVE** · **GET NOW** · **GET LATER** · **BLOCKED**
(BLOCKED = nieosiągalne bez decyzji właściciela lub zmiany środowiska, nie „trudne").

Stan mierzony 2026-09-26 w tym kontenerze. Wszystko poniżej sprawdzone realnym wywołaniem lub realnym
żądaniem sieciowym — nie z pamięci.

## 0. Sieć — fakt, z którego wynika połowa braków

Zmierzone w tym środowisku:

| Host | Stan | Konsekwencja |
|---|---|---|
| `raw.githubusercontent.com` | **działa** | jedyna praktyczna droga na dane hostowane w repo GitHub |
| `pypi.org`, `files.pythonhosted.org` | **działa** | silniki z pipa instalowalne |
| `registry.npmjs.org` | **działa** | paczki front-endu |
| `rcsb.org`, `files.wwpdb.org`, `ebi.ac.uk`, `pdbj.org` | **zablokowane** | brak pobierania struktur białek na żądanie |
| `zenodo.org`, `ndownloader.figshare.com` | **zablokowane** | brak wag modeli (m.in. retrosynteza) |
| `huggingface.co` | **zablokowane** | brak modeli z HF |
| `github.com` / `codeload` / `objects.githubusercontent.com` (release assets) | **zablokowane** | brak dużych plików z wydań |
| `polyhaven.com`, `ambientcg.com`, `jsdelivr`, `threejs.org` | **zablokowane** | brak HDRI/PBR z typowych źródeł |

Wniosek: wszystko, czego Genesis potrzebuje jako **danych**, musi albo być zwendorowane w repo, albo
dostarczone przez właściciela, albo hostowane na `raw.githubusercontent.com`.

## 1. Struktury białek i ligandy

| Zasób | Stan | Szczegóły |
|---|---|---|
| PDB **1IEP** łańcuch A + imatinib (STI) | **ALREADY HAVE** | zwendorowane w `packages/backend/src/compute/targets/abl1-1iep/`, sha256 weryfikowane przy każdym przygotowaniu. Zwalidowane: redock krystalicznego ligandu **RMSD 0.584 Å**, wynik ≈ −12,6 kcal/mol, przygotowanie deterministyczne, powtórka MATCH. Koordynaty PDB są w domenie publicznej. |
| **5C1M** (receptor μ-opioidowy, BU72), **8EF5** (fentanyl) | **ALREADY HAVE, zaparkowane** | zwendorowane z sumami kontrolnymi, **niewpięte** w żaden przepływ. Konstytucja §11: wolno ich użyć wyłącznie do przepływu opioidowego, **nigdy do ketaminy**. |
| Cel dla **NMDA / ketaminy** | **BLOCKED** | ketamina działa na receptor NMDA; nie mamy biologicznie właściwej struktury. Dopóki jej nie ma, dokowanie ketaminy ma status **UNRESOLVED** (tak jest raportowane). *Potrzebne:* wskazanie struktury (np. PDB NMDA z miejscem wiązania w kanale) i zgoda na jej zwendorowanie. Wpływ: domyka jeden obiecany wynik. Koszt: 0 zł, samo pobranie. Trudność: niska, o ile ktoś poda plik. Licencja: koordynaty PDB publiczne. Wartość naukowa: wysoka. |
| Kolejne cele białkowe (dowolna nowa kampania) | **GET NOW** (per cel) | RCSB jest zablokowane, więc **każdy** nowy cel wymaga wrzucenia pliku PDB do repo albo na osiągalny host. Dla każdego celu potrzebne: identyfikator PDB, wybór łańcucha, ligand referencyjny do redocku, środek i rozmiar pudełka (albo ligand ko-krystaliczny, z którego je policzymy). |

## 2. Silniki obliczeniowe

| Silnik | Stan | Szczegóły |
|---|---|---|
| RDKit 2026.03.6 | **ALREADY HAVE** | deskryptory, kanonizacja, transformacje SMARTS, BRICS, osadzanie 3D |
| AutoDock Vina 1.2.7 + Meeko 0.8.0 + PDBFixer 1.12.0 | **ALREADY HAVE** | dokowanie do prawdziwego białka, przygotowanie receptora deterministyczne |
| PySCF | **ALREADY HAVE** | RHF/sto-3g single-point; limit 60 atomów w workerze |
| ADMET-AI | **ALREADY HAVE** | estymaty ADMET/toksyczności (MODEL_ESTIMATE) |
| **AiZynthFinder 4.4.1** (retrosynteza, MIT) | **zintegrowany, dane BLOCKED** | pakiet instaluje się i importuje (osobny interpreter — pinuje `rdkit<2024`). **Dane modelu** (`uspto_model.onnx`, `uspto_templates.csv.gz`, `zinc_stock.hdf5`, ≈ 1 GB) są na zenodo/figshare — **zablokowane**. *Potrzebne:* te trzy pliki w katalogu wskazanym przez `GENESIS_RETRO_MODEL_DIR`. Wpływ: **bez nich Genesis nie proponuje żadnej trasy syntezy** i protokół mówi to wprost. Koszt: 0 zł (publikacja autorów), ≈ 1 GB dysku. Trudność: niska — jedna komenda `python -m aizynthfinder.tools.download_public_data <dir>` w środowisku z dostępem do zenodo. Licencja: MIT (kod) + licencje upstream danych; **nie redystrybuujemy w repo**. Wartość naukowa: wysoka — domyka „od kandydata do trasy". |
| OpenMM (dynamika molekularna) | **ALREADY HAVE (do potwierdzenia w tym runtime)** | adapter i requirements istnieją; MD dla stabilności pozy to naturalny następny krok po dokowaniu. Przed użyciem w demo: uruchomić przypadek referencyjny i zaraportować status. |
| PyMeep (elektrodynamika) | **GET LATER** | droga instalacji przez conda; nieistotne dla Fazy 1 |

## 3. Dane referencyjne i benchmarki

| Zasób | Stan | Szczegóły |
|---|---|---|
| Redock krystaliczny jako benchmark dokowania | **ALREADY HAVE** | 1IEP/imatinib, RMSD 0.584 Å — realny dowód poprawności potoku |
| Zmierzone powinowactwa (np. PDBbind, BindingDB) do kalibracji „score → rzeczywistość" | **GET LATER** | *Potrzebne, gdy zaczniemy twierdzić cokolwiek o jakości predykcji.* Wpływ: pozwala pokazać korelację, a nie tylko pojedynczy wynik. Koszt: PDBbind bywa darmowy dla akademii, komercyjnie płatny. Trudność: średnia (rejestracja + licencja). **Ryzyko licencyjne: realne** — część zbiorów zabrania redystrybucji. Wartość naukowa: wysoka. |
| Dane assay / wet-lab dla kandydatów | **BLOCKED (wymaga laboratorium)** | żaden zbiór publiczny nie zastąpi pomiaru dla nowej cząsteczki. Do tego czasu każdy wynik pozostaje obliczeniowy — tak jest oznaczany. |
| Dane ADMET do walidacji zewnętrznej | **GET LATER** | ADMET-AI niesie własne benchmarki TDC; niezależny zbiór testowy byłby mocniejszy |
| CMS Open Data (świat CERN) | **GET LATER / do sprawdzenia** | ścieżka istnieje w repo; osiągalność hosta w tym środowisku wymaga sprawdzenia przed obietnicami |

## 4. Zasoby wizualne (Astra / jakość obrazu)

| Zasób | Stan | Szczegóły |
|---|---|---|
| Model człowieka (CC0, zwendorowany) | **ALREADY HAVE** | użyty w Human Twin, licencja sprawdzona |
| HDRI + tekstury PBR (środowisko, metal, szkło, beton, podłoga) | **GET NOW** | polyhaven/ambientcg **zablokowane**; osiągalne: HDRI i tekstury z repozytorium three.js na `raw.githubusercontent.com`, paczki npm `@pmndrs/assets`, modele Khronos glTF. *Decyzja właściciela potrzebna:* **tylko CC0**, czy dopuszczamy **CC-BY** z zapisaną atrybucją? Wpływ: to jest realna różnica między „demo" a „wygląda jak laboratorium". Koszt: 0 zł. Trudność: niska. Ryzyko licencyjne: niskie przy CC0, przy CC-BY wymaga rejestru atrybucji (mamy `assetGovernance`). Wartość naukowa: 0 — wartość prezentacyjna: wysoka. |
| Anatomia (BodyParts3D/DBCLS, opcja 2) | **GET LATER** | wybrana wcześniej ścieżka dla Human Atlas; po Fazie 1 |

## 5. Moc obliczeniowa

| Zasób | Stan | Szczegóły |
|---|---|---|
| CPU tego kontenera | **ALREADY HAVE** | wystarcza na dokowanie 1 kandydata (dziesiątki sekund), QM do 60 atomów, ADMET |
| GPU | **GET LATER** | potrzebne dla MD w skali i dla większych modeli; dziś nie blokuje Fazy 1 |
| HPC / kolejka wsadowa | **GET LATER** | potrzebne, gdy kampania ma liczyć setki kandydatów, nie 6 |
| QPU | **GET LATER** | konstytucja §9 faza 5; **nie implementujemy portu bez realnej potrzeby** |
| Dysk | **UWAGA** | w tym kontenerze zostało ≈ 4,7 GB. Dane retrosyntezy (≈ 1 GB) mieszczą się, ale zapas jest mały |

## 6. Laboratorium fizyczne

| Zasób | Stan | Szczegóły |
|---|---|---|
| Aparatura, czujniki, robotyka, śledzenie próbek | **BLOCKED (świadomie)** | konstytucja §8: porty projektujemy, **niczego nie podłączamy**. Nie deklarujemy zdolności fizycznych. Kolejność: najpierw odczyt z czujników, potem sterowanie, na końcu robotyka — wyłącznie za bramkami zgody |
| Partner do walidacji mokrej (assay, hERG, Ames) | **GET LATER** | dopóki go nie ma, `PROPOSED VALIDATION PROTOCOL` pozostaje propozycją z krokami `NOT_EXECUTED` / `apparatus: NOT_CONNECTED` |

## 7. Co blokuje **dziś** (skrót dla właściciela)

1. **Pliki modelu AiZynthFinder** → bez nich nie ma trasy syntezy w protokole. Najtańsza rzecz o
   największym efekcie na liście.
2. **Decyzja CC0 vs CC-BY** dla zasobów wizualnych → blokuje poważny skok jakości obrazu laboratorium.
3. **Struktura celu NMDA** → domyka ketaminę (dziś uczciwie UNRESOLVED).
4. Nic z powyższych nie blokuje domknięcia Fazy 1 na 1IEP/imatynibie — to już działa.
