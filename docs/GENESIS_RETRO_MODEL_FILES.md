# AiZynthFinder — pliki modelu, których Genesis potrzebuje (pakiet dostawczy D-1)

## EXTERNAL_RESOURCE_BLOCKER — 2026-09-26 (ponowiony po zmianie ustawień)

**Ponowna próba po tym, jak właściciel odblokował zenodo i figshare: nadal ODMOWA.**
Dokładny wynik z tej samej minuty:

```
zenodo.org:443                — connect_rejected
ndownloader.figshare.com:443  — connect_rejected
detail: "the egress proxy denied the CONNECT (organization policy)"
```

Sześć prób w odstępach 15 s, wszystkie `000`. Sprawdzone też `https://zenodo.org/record/7797465`.

**Przyczyna, najbardziej prawdopodobna:** polityka sieci jest nakładana na kontener **przy jego
starcie**. Ta sesja wystartowała przed zmianą, więc trzyma starą politykę i jej nie podniesie.
Zmiana zadziała w **nowej sesji** tego środowiska.

**Do sprawdzenia przy okazji:** czy edycja trafiła w to samo środowisko, w którym działa ta sesja,
i czy została zapisana. Jeśli nowa sesja też dostanie 403 — edycja poszła gdzie indziej.

**UWAGA — praca jest w tym kontenerze.** Commity nie są wypchnięte, a kontener jest efemeryczny.
Przed otwarciem nowej sesji trzeba wypchnąć gałąź, inaczej praca przepada.

### Dokładna komenda do wykonania po przywróceniu dostępu

```bash
mkdir -p /opt/genesis/retro-models && cd /opt/genesis/retro-models
python -m aizynthfinder.tools.download_public_data .
mv uspto_unique_templates.csv.gz uspto_templates.csv.gz   # jeśli narzędzie zapisze pod nazwą źródłową
sha256sum * | tee SHA256SUMS.txt
export GENESIS_RETRO_MODEL_DIR=/opt/genesis/retro-models
node -e "import('./packages/backend/src/compute/retroAdapter.mjs').then(m=>m.detect()).then(r=>console.log(JSON.stringify(r,null,1)))"
```

Wymagane nazwy plików i miejsce docelowe — §1 i §3 niżej. Wolnego miejsca: 3,2 GB, komplet ~1 GB.

## EXTERNAL_RESOURCE_BLOCKER — 2026-09-26 (pierwsze ustalenie)

Wyczerpałem legalne drogi z tego środowiska. Wynik, zmierzony:

| Droga | Wynik |
|---|---|
| `zenodo.org` (4 z 5 plików) | **ODMOWA** — gateway odpowiada 403 na CONNECT (polityka sieci) |
| `ndownloader.figshare.com` (stock) | **ODMOWA** — jw. |
| `huggingface.co` | ODMOWA |
| GitHub releases `MolecularAI/aizynthfinder` | brak assetów z modelami — repozytorium zawiera wyłącznie kod |
| PyPI `aizynthfinder` 4.4.1 | osiągalne, ale **paczka ma 131 kB — sam kod**, żadnych modeli |
| PyPI: `aizynthmodels`, `aizynthfinder-models`, `uspto-templates`, `rxnutils` | **nie istnieją** (404) |

Potwierdzenie z samego silnika, nie z mojej pamięci: pobrałem źródło 4.4.1 z PyPI i odczytałem
`aizynthfinder/tools/download_public_data.py`. Jedynymi oficjalnymi adresami są `zenodo.org`
(polityka rozszerzania, szablony, ringbreaker, filtr) i `ndownloader.figshare.com` (stock ZINC).
Innego oficjalnego źródła **nie ma** — więc nie istnieje legalna droga w obrębie tego środowiska.

**Czego potrzebuję od właściciela — jedna czynność:**
w ustawieniach środowiska (menu środowiska chmurowego na pasku tytułu sesji → Edit) zmienić
**Network access**: albo szerszy poziom dostępu, albo dopisać do dozwolonych domen:

```
zenodo.org
ndownloader.figshare.com
```

Poziomy dostępu opisano na https://code.claude.com/docs/en/claude-code-on-the-web

Po odblokowaniu wykonuję bez pytania: pobranie → sha256 → `detect()` → benchmark aspiryny →
retrosynteza finalisty HERO → Evidence → Replay → część B protokołu.

**Alternatywa, jeśli polityki nie chcesz zmieniać:** pliki, które już masz na telefonie, wystarczy
umieścić w dowolnym katalogu maszyny docelowej i wskazać `GENESIS_RETRO_MODEL_DIR` (§3 niżej).
Do repozytorium ich nie wkładamy — mają własne licencje upstream.

Reszta łańcucha HERO **nie czeka na to** i idzie dalej.

Zamówienie właściciela z 2026-09-26. Wszystko poniżej pochodzi **z kodu adaptera**
(`packages/backend/src/compute/retro_worker.py`, stałe `REQUIRED_FILES` / `OPTIONAL_FILES`), nie z
pamięci. Silnik jest już zintegrowany i importuje się poprawnie; brakuje wyłącznie danych modelu,
których **nie wolno trzymać w repozytorium** (własne licencje upstream, ~1 GB).

## 1. Pliki WYMAGANE — bez nich zdolność zgłasza blokadę

| Rola | **Nazwa pliku (dokładnie taka)** | Źródło (upstream) | Wersja / wydanie |
|---|---|---|---|
| `expansion_policy_model` | `uspto_model.onnx` | `https://zenodo.org/record/7797465/files/uspto_model.onnx` | Zenodo record **7797465** |
| `expansion_templates` | `uspto_templates.csv.gz` | `https://zenodo.org/record/7341155/files/uspto_unique_templates.csv.gz` | Zenodo record **7341155** |
| `stock` | `zinc_stock.hdf5` | `https://ndownloader.figshare.com/files/23086469` | Figshare file **23086469** |

**Uwaga o nazwach:** adapter szuka plików po nazwie. Plik szablonów u źródła nazywa się
`uspto_unique_templates.csv.gz`, a u nas musi leżeć jako **`uspto_templates.csv.gz`** — przy zapisie
trzeba go przemianować. Plik ze stocku pobiera się z figshare bez nazwy w URL i musi zostać zapisany
jako **`zinc_stock.hdf5`**.

## 2. Pliki OPCJONALNE — rozszerzają wyszukiwanie, nie są konieczne

| Rola | Nazwa pliku | Źródło |
|---|---|---|
| `ringbreaker_policy_model` | `uspto_ringbreaker_model.onnx` | `https://zenodo.org/record/7797465/files/uspto_ringbreaker_model.onnx` |
| `ringbreaker_templates` | `uspto_ringbreaker_templates.csv.gz` | `https://zenodo.org/record/7341155/files/uspto_ringbreaker_unique_templates.csv.gz` |
| `filter_policy_model` | `uspto_filter_model.onnx` | `https://zenodo.org/record/7797465/files/uspto_filter_model.onnx` |

## 3. Katalog docelowy

Wszystkie pliki **płasko w jednym katalogu**, bez podkatalogów:

```
<KATALOG>/uspto_model.onnx
<KATALOG>/uspto_templates.csv.gz
<KATALOG>/zinc_stock.hdf5
<KATALOG>/uspto_ringbreaker_model.onnx          (opcjonalnie)
<KATALOG>/uspto_ringbreaker_templates.csv.gz    (opcjonalnie)
<KATALOG>/uspto_filter_model.onnx               (opcjonalnie)
```

Backend znajduje je przez zmienną środowiskową:

```
export GENESIS_RETRO_MODEL_DIR=<KATALOG>
```

Sugerowana lokalizacja na maszynie docelowej: `/opt/genesis/retro-models` (dowolna inna też zadziała —
liczy się tylko ta zmienna). Katalog **nie może** leżeć w repozytorium.

## 4. Rozmiar — czego NIE wiem i skąd to wziąć

Jedyna liczba, jaką mam z własnego kodu, to komentarz w adapterze: **cały zestaw ~1 GB**. Dokładnych
rozmiarów poszczególnych plików **nie podaję, bo ich nie zmierzyłem** — zenodo i figshare są z tego
środowiska zablokowane, więc każda liczba per plik byłaby zmyślona. Przy pobieraniu proszę zapisać
wynik `ls -l` oraz `sha256sum` każdego pliku i dołączyć do przekazania; Genesis i tak policzy sha256
sam i zapisze je w dowodach.

## 5. Najprostsza droga: niech zrobi to własne narzędzie silnika

Jeśli maszyna dostawcza ma dostęp do sieci i zainstalowany AiZynthFinder, wystarczy:

```
pip install aizynthfinder==4.4.1
python -m aizynthfinder.tools.download_public_data <KATALOG>
```

To pobiera komplet wprost od autorów. Po pobraniu **sprawdzić nazwy** — jeśli narzędzie zapisze
`uspto_unique_templates.csv.gz`, trzeba je przemianować na `uspto_templates.csv.gz` (patrz §1).

## 6. Licencje — do przekazania razem z plikami

Kod AiZynthFinder jest na MIT, ale **dane modelu mają własne licencje upstream** (szablony wyprowadzone
z danych USPTO, stock z ZINC). Proszę dołączyć pliki licencji/warunków ze stron Zenodo i Figshare;
Genesis rejestruje je razem z sumami kontrolnymi i bez tego nie uzna zasobu za dopuszczony.

## 7. Jak sprawdzę, że dostawa jest kompletna (i co wtedy zrobię)

```
GENESIS_RETRO_MODEL_DIR=<KATALOG> GENESIS_RETRO_PYTHON=<python> \
  node -e "import('./packages/backend/src/compute/retroAdapter.mjs').then(m=>m.detect()).then(r=>console.log(JSON.stringify(r,null,1)))"
```

Raport wymienia **każdy plik z osobna**: obecny / brakujący, jego sha256 i adres upstream. Gdy lista
`missing` jest pusta:

1. uruchamiam **przypadek referencyjny** (aspiryna, `CC(=O)Oc1ccccc1C(=O)O`) — dziś jest to jedyny
   przypadek, którego **nie wykonano**, i dlatego stan zdolności to BLOKADA, nie DOWÓD;
2. uruchamiam prawdziwe wyszukiwanie trasy dla finalisty z kampanii;
3. trasa trafia do części **B protokołu końcowego** z identyfikatorem modelu i sumami kontrolnymi —
   dopiero wtedy w protokole pojawia się realna droga syntezy zamiast zdania o jej braku.

Do tego czasu Genesis **nie proponuje żadnej trasy**: pisze wprost, że silnik jej nie wyprodukował.
