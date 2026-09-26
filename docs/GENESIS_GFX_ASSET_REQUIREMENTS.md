# Genesis — kontrakt assetów graficznych (pakiet dostawczy D-2)

Etap 1 planu asset-first. Ten dokument jest **zamówieniem**, nie listą życzeń: każda liczba niżej
pochodzi z kodu, który dziś działa (`drugBenchLayer.ts`, `characterRig.ts`, `assetGovernance.ts`,
`graphics/assetPipeline.ts`), a nie z mojej pamięci. Asset, który spełnia ten kontrakt, wchodzi do
sceny bez przebudowy logiki. Asset, który go nie spełnia, zostanie odrzucony przez bramkę licencyjną
albo nie trafi w slot — i wtedy zostaje geometria proceduralna.

## 0. Zasada nadrzędna: nic nie kasujemy

Architektura jest i pozostaje taka:

```
real asset (GLB/HDR/PBR)   → jeśli dostępny i zatwierdzony
fallback proceduralny      → jeśli assetu brak, nie załadował się, albo bramka go odrzuciła
```

Służy do tego `createAssetSlot()` z `core/three/graphics/assetPipeline.ts`: slot startuje z
geometrią proceduralną, a `replace()` podmienia ją na wczytany model **w tej samej transformacie**
i zwalnia starą. Obecne stanowiska, naukowiec i materiały zostają w repo jako ta ścieżka awaryjna.
Żadnej sceny nie budujemy od zera.

Konsekwencja dla dostawcy: **brak assetu nie psuje Genesis**. Zła skala, zły rig albo brak licencji —
psują. Dlatego niżej są dokładne liczby.

## 1. Katalog docelowy i nazwy plików

Wszystko pod `packages/frontend/public/assets/genesis/lab/`. Nazwy **dokładnie takie** — ładowarka
szuka po ścieżce.

```
assets/genesis/lab/
  environment/
    laboratory.hdr
  characters/
    scientist.glb
  equipment/
    admet_analyzer.glb
    compute_rack.glb
    monitor_arm.glb
    sample_rack.glb
    lab_glassware.glb
    gas_cylinder.glb
    laboratory_chair.glb
  materials/
    polished_concrete/{basecolor,roughness,normal,ao}.ktx2
    brushed_steel/{basecolor,roughness,normal,metallic}.ktx2
    white_lacquer/{basecolor,roughness,normal}.ktx2
    frosted_glass/{basecolor,roughness,normal}.ktx2
  LICENSES/
    <id>.md          # jeden plik na asset, treść w §7
    SHA256SUMS.txt
```

`mikroskop` **nie jest** na liście i to jest celowe — patrz §6.

## 2. Zasady wspólne dla każdego modelu

| Reguła | Wartość | Dlaczego |
|---|---|---|
| Format | glTF 2.0 binarny (`.glb`), jeden plik | jedyny format, który ładowarka tej sceny czyta |
| Jednostki | **metry**, 1 unit = 1 m | cała scena jest w metrach (blat 2.6 × 1.05 × 0.93 m) |
| Oś góry | Y-up | konwencja three.js |
| Przód obiektu | +Z | naukowiec obraca się przez `rotation.y`; przód w złą stronę = model tyłem do widza |
| Origin | w punkcie styku z podłożem/blatem, wyśrodkowany w X i Z | sloty pozycjonują po punkcie postawienia, nie po środku bryły |
| Skala w pliku | 1.0 (żadnego `scale` na roocie) | `replace()` kopiuje transformatę slotu; skala w pliku ją mnoży i rozjeżdża |
| Kamery i światła | **usunięte z pliku** | scena ma własne oświetlenie i sondę IBL; światło w GLB liczyłoby się podwójnie |
| Oświetlenie wypalone w teksturze | **zakazane** | mamy PBR + PMREM; wypalony cień z innego setu jest widoczny natychmiast |
| Materiały | `KHR_materials_pbrSpecularGlossiness` **nie**; metallic-roughness **tak** | renderer czyta metallic-roughness |
| Kompresja geometrii | Draco lub meshopt, mile widziana | budżet transferu |
| Tekstury w GLB | KTX2/Basis, maks. 2048 px | `maxTextureResolutionPx` w bramce |
| Nazwy węzłów | ASCII, bez spacji | adapter animacji szuka po nazwie |

## 3. Postać — `characters/scientist.glb`

To jest asset o najwyższym priorytecie. Jeden dobry model człowieka daje większy skok niż cała
reszta razem.

| Parametr | Wymaganie |
|---|---|
| Wysokość postaci | **1.74 m** (tyle ma dzisiejszy rig przy stole; ±0.03 m akceptowalne) |
| Poza spoczynkowa | A-pose lub T-pose, stopy na Y=0, twarzą w +Z |
| Budżet | ≤ 40 000 trójkątów (LOD0) |
| Tekstury | 2048 px, metallic-roughness + normal |
| Skinning | **wymagany**, jeden skeleton, maks. 4 wagi na wierzchołek |
| Ubranie | fartuch laboratoryjny albo kombinezon czysty; bez hełmu kosmicznego |
| Twarz | dowolna, byle nie karykatura; nie jest w kadrze z bliska |
| Animacje w pliku | **niepotrzebne** — patrz niżej |

### 3.1. Wymagane kości (bez nich integracja nie ruszy)

Adapter animacji musi znaleźć te węzły. Nazwy mogą być w konwencji Mixamo (`mixamorig:*`) lub
standardowej humanoidalnej — podaję jedno i drugie, wystarczy którakolwiek:

```
hips            | mixamorig:Hips
spine           | mixamorig:Spine
neck            | mixamorig:Neck
head            | mixamorig:Head
shoulder.R/.L   | mixamorig:Right/LeftShoulder
upperarm.R/.L   | mixamorig:Right/LeftArm
forearm.R/.L    | mixamorig:Right/LeftForeArm
hand.R/.L       | mixamorig:Right/LeftHand
thumb/index/middle .R   — palce prawej dłoni, po jednym łańcuchu; jeśli ich nie ma, chwyt
                          będzie sztywną dłonią (dopuszczalne, ale gorsze)
upperleg.R/.L, lowerleg.R/.L, foot.R/.L
```

### 3.2. Punkt chwytu — najważniejsza rzecz w całym pakiecie

Dzisiaj fiolka jest dzieckiem węzła `grip.R`, umieszczonego względem dłoni na
`(0, −H × 0.034, +H × 0.014)`, czyli przy H = 1.74 m: **(0, −0.059 m, +0.024 m)** od środka dłoni.
Test E2E mierzy w wyrenderowanej scenie odległość fiolki od tego punktu i wymaga **≤ 20 mm**.

Dostawca **nie musi** dodawać tego węzła — dodam go sam przy integracji, jako dziecko `hand.R`.
Warunek jest inny i twardy: **`hand.R` musi być prawdziwym węzłem kości z sensownym origin w środku
dłoni**. Model, w którym dłoń jest wtopioną w ramię bryłą bez własnej kości, zrywa chwyt fiolki i
wywala Bramę B. To jest jedyne kryterium, przy którym „ładniejszy model" przegrywa z brzydszym.

Wymiar odniesienia: fiolka to walec **⌀ 36 mm × 85 mm**. Dłoń ma ją obejmować, nie połykać.

### 3.3. Animacje — czego NIE zamawiamy

Nie zamawiamy animacji `reach`, `grip`, `place`. Genesis steruje pozą sam, z kanonicznego stanu
eksperymentu:

```
canonical experiment state  (campaign_events → projectDrugRun → labProcedureOf → benchHandlingOf)
        ↓
scientist controller        REACH → GRIP → CARRY → PLACE → OPERATE
        ↓
animation adapter           (nowy, cienki: mapuje akcję na rotacje kości)
        ↓
skinned GLB
```

Model dostarcza **szkielet i skórę**. Sterowanie zostaje takie, jakie jest — nowa postać tylko
wykonuje polecenia, nie dostaje własnej logiki. Jeśli plik zawiera klip `idle` (oddech, drobne
przestępowanie), przyjmę go i zmiksuję pod spodem; klip `walk` też się przyda przy przejściach
między stanowiskami (prędkość marszu w scenie: 0.85 m/s). Oba są **opcjonalne**.

## 4. Sprzęt — sloty i wymiary z działającej sceny

Pozycje są lokalne względem korzenia stanowiska `station:st-drug-bench`. Blat jest na **Y = 0.93 m**.
Naukowiec stoi **0.62 m przed blatem** i podchodzi do X podanego w kolumnie „stanowisko".

| Plik | Zastępuje | Slot (x, y, z) | Gabaryt docelowy (szer. × wys. × gł.) | Stanowisko (standX) | Budżet |
|---|---|---|---|---|---|
| `admet_analyzer.glb` | analizator ADMET | (−1.50, 1.05, −0.10) | 0.62 × 0.38 × 0.52 m | −1.34 | ≤ 25 000 tri |
| `compute_rack.glb` | szafa obliczeniowa pod blatem | (0.95, 0.35, −0.30) | 0.34 × 0.70 × 0.44 m | +0.55 | ≤ 20 000 tri |
| `monitor_arm.glb` | monitor na ramieniu | (0.55, 1.14, −0.34) | słupek ⌀ 0.04 × 0.42 m + ekran ok. 24" | +0.55 | ≤ 10 000 tri |
| `sample_rack.glb` | statyw na próbki | (−0.72, 0.93, 0.12) | 0.30 × 0.06 × 0.34 m, gniazda ⌀ 38 mm | −0.72 | ≤ 12 000 tri |
| `lab_glassware.glb` | szkło na blacie | dowolnie na blacie | zlewki/kolby 0.05–0.25 m | — | ≤ 8 000 tri łącznie |
| `gas_cylinder.glb` | butla przy ścianie | pod ścianą | ⌀ 0.23 × 1.40 m | — | ≤ 6 000 tri |
| `laboratory_chair.glb` | krzesło | przy blacie | 0.55 × 0.95 × 0.55 m | — | ≤ 8 000 tri |

Tolerancja gabarytu: ±15%. Model poza tolerancją albo zasłoni punkt pracy, albo będzie wyglądał jak
zabawka obok człowieka o wzroście 1.74 m.

**`sample_rack.glb` ma twardy wymóg**: gniazda o średnicy **≥ 38 mm**, w rzędach, z płaskim dnem.
Fiolka (⌀ 36 mm) musi w nie wchodzić — akcja PLACE wkłada ją tam naprawdę i test to sprawdza.

## 5. Materiały PBR — `materials/`

Cztery zestawy, każdy jako osobne mapy (nie atlas), **2048 px**, bezszwowe (tileable):

| Zestaw | Mapy | Zastosowanie | Skala kafla |
|---|---|---|---|
| `polished_concrete` | basecolor, roughness, normal, ao | podłoga laboratorium i hali CERN | 2 m |
| `brushed_steel` | basecolor, roughness, normal, metallic | blaty, statywy, obudowy, rury | 0.5 m |
| `white_lacquer` | basecolor, roughness, normal | obudowy aparatury, szafki | 1 m |
| `frosted_glass` | basecolor, roughness, normal | szyby, osłony, drzwi | 1 m |

Uwaga do dostawcy: **nie zamawiamy HDRI jako priorytetu**. Scena ma już działające IBL — sondę
pokoju (CubeCamera + PMREM, `captureRoomEnvironment`), która odbija to, co naprawdę stoi dookoła,
a nie obce wnętrze. `laboratory.hdr` jest **opcjonalny**, do porównania; wejdzie tylko jeśli da
lepszy obraz niż sonda. Nie wydawajcie na niego czasu przed materiałami.

## 6. Czego świadomie NIE zamawiamy i dlaczego

Genesis nie może pokazywać sprzętu, którego nie używa. To nie jest estetyka, to jest ta sama zasada,
która trzyma etykiety MODEL / SYMULACJA w całym produkcie.

- **Mikroskop** — nie mamy materiału do obserwacji pod mikroskopem. Postawienie mikroskopu w kadrze
  sugerowałoby obserwację optyczną, której nie ma. Wejdzie dopiero, gdy będzie co pod nim położyć.
- **Analizator „fizyczny" z pipetami i próbkami krwi** — ADMET-AI jest modelem obliczeniowym, nie
  przyrządem. Dlatego `admet_analyzer.glb` ma wyglądać jak **stacja obliczeniowa w obudowie
  przyrządowej** (rack 19", panel, wyświetlacz), a nie jak spektrometr masowy.
- **Wirówki, inkubatory, PCR** — nic ich nie napędza.
- **Cokolwiek „sci-fi"**: hologramy w powietrzu, świecące rury, lewitacja. Hologram w tej scenie jest
  dokładnie jeden i jest podpisany jako model obliczeniowy.

## 7. Pakiet licencyjny — bez niego bramka odrzuca asset

W repo działa bramka `evaluatePremiumAssetAcceptance()` (`core/three/assetGovernance.ts`). Ona
**nie zgaduje**: brakujące pole to odrzucenie, nie domniemanie zgody. Dla każdego pliku potrzebuję
pliku `LICENSES/<id>.md` z dokładnie tymi polami:

```
id:                     admet_analyzer
assetClass:             ENVIRONMENT_OR_PROP
license.name:           CC0-1.0 | CC-BY-4.0 | ...
license.url:            <link do treści licencji>
license.requiresAttribution:              true | false
license.permitsCommercialRedistribution:  true | false | UNKNOWN
license.aiRestriction:                    NONE | RESTRICTED | UNKNOWN
provenance.sourceName:  Poly Haven | ambientCG | Quaternius | ...
provenance.sourceUrl:   <link do konkretnej wersji, nie do "latest">
provenance.immutableSource:  true | false
provenance.sha256:      <nazwa pliku> = <64 znaki hex>
performance.polygonCount:        <liczba trójkątów>
performance.textureResolutionPx: <maks. bok tekstury>
performance.hasLod:              true | false
performance.lodLevels:           <liczba>
performance.ktx2Ready / meshoptReady / dracoReady: true | false
performance.realTimeWebSuitable: true | false
autor:                  <imię/nick autora, do atrybucji>
```

Trzy rzeczy, które **natychmiast dyskwalifikują**:

1. `permitsCommercialRedistribution: false` — jawny zakaz. Odrzucone, bez dyskusji.
2. `aiRestriction: RESTRICTED` — licencja zabrania użycia w kontekście AI. Genesis jest produktem AI.
3. Brak sumy SHA-256 albo link do wersji „latest", która może się zmienić pod nami.

`UNKNOWN` w polach licencyjnych **nie jest** równe „wolno". Bramka zwraca wtedy
`LEGAL_REVIEW_REQUIRED` i asset czeka, aż ktoś doczyta licencję. Lepiej odrzucić trzech kandydatów
niż wpuścić jednego, którego trzeba będzie wycinać przed rozmową z inwestorem.

Brak łańcucha LOD daje `OPTIMIZATION_REQUIRED` — to nie jest odrzucenie. Wygeneruję LOD-y przy
integracji, ale trzeba to wiedzieć z góry, a nie odkrywać przy 60 FPS spadającym do 12.

**CC0 jest preferowane.** CC-BY dopuszczalne, ale wtedy atrybucja (autor + link + licencja) musi
trafić do ekranu w produkcie, nie tylko do pliku w repo.

## 8. Brief dla Manusa/Qwena — do skopiowania w całości

> Znajdź kandydatów na assety 3D do laboratorium naukowego w czasie rzeczywistym (WebGL, three.js).
> Dla **każdej** pozycji podaj **3 propozycje**, a dla każdej propozycji: podgląd (screenshot lub
> link), autora, nazwę licencji + link do jej treści, link do **konkretnej wersji** pliku, format,
> liczbę trójkątów, maksymalny rozmiar tekstury, rozmiar pliku, oraz czy licencja pozwala na użycie
> komercyjne i czy nie zawiera ograniczeń dotyczących AI.
>
> Pozycje: (1) postać człowieka w fartuchu laboratoryjnym, **ze skinningiem**, rig humanoidalny z
> osobną kością dłoni, wzrost ok. 1.74 m, ≤ 40k trójkątów; (2) urządzenie laboratoryjne wyglądające
> jak stacja obliczeniowa w obudowie przyrządowej, ok. 0.62 × 0.38 × 0.52 m; (3) szafa serwerowa /
> obliczeniowa pod blat, ok. 0.34 × 0.70 × 0.44 m; (4) monitor na ramieniu z zaciskiem, ekran ok.
> 24"; (5) statyw na probówki z gniazdami ⌀ ≥ 38 mm;
> (6) szkło laboratoryjne (zlewki, kolby); (7) butla gazowa ⌀ 0.23 × 1.40 m; (8) krzesło
> laboratoryjne; (9) cztery bezszwowe zestawy tekstur PBR 2048 px: beton polerowany, stal
> szczotkowana, biały lakier, szkło mrożone — każdy z mapami basecolor / roughness / normal
> (+ ao dla betonu, + metallic dla stali).
>
> Preferowane źródła CC0: Poly Haven, ambientCG, Quaternius, Kenney. CC-BY dopuszczalne z pełną
> atrybucją. **Odrzuć z góry** wszystko, co zabrania użycia komercyjnego lub użycia w AI.
> Nie modyfikuj repozytorium Genesis — to jest zadanie wyszukiwawcze, wynik to lista z linkami.

## 9. Co robię po dostawie (Etapy 3–7)

1. **Bramka.** Każdy asset przez `evaluatePremiumAssetAcceptance()`. Liczę SHA-256 sam i porównuję
   z dostarczoną. Wynik APPROVED / LEGAL_REVIEW_REQUIRED / OPTIMIZATION_REQUIRED / REJECTED trafia
   do raportu — bez ściemy, że „prawie przeszło".
2. **Sloty.** Podmiana przez `createAssetSlot().replace()`, po jednym stanowisku, ze zrzutem
   przed/po. Fallback proceduralny zostaje w kodzie.
3. **Retarget postaci.** Adapter animacji między istniejącym kontrolerem a nowym szkieletem.
   `grip.R` dowieszony do `hand.R`. Fiolka nadal dzieckiem tego węzła.
4. **Materiały.** Podmiana map w istniejących materiałach, bez dotykania sondy IBL.
5. **Regresja przed jakąkolwiek deklaracją.** Pełny E2E live-labu musi przejść:
   `REACH → GRIP → CARRY → PLACE → OPERATE`, tożsamość próbki na każdym kroku, odległość fiolki od
   punktu chwytu ≤ 20 mm w wyrenderowanej scenie, protokół A/B/C zgodny odciskiem z backendem,
   Replay bez zmiany werdyktu. **Jeśli nowa postać zerwie chwyt — Brama C nie przechodzi**, a asset
   wraca do dostawcy albo zostaje fallback.
6. Dopiero wtedy kamery, DOF i film.

## 10. Stan na dziś

| Pozycja | Stan |
|---|---|
| Ścieżka fallbacku (`createAssetSlot`) | ISTNIEJE, działa |
| Ładowarka GLB | ISTNIEJE (`humanTwinAsset.ts`, Human Twin wczytuje się dziś) |
| Bramka licencyjna | ISTNIEJE, testowana |
| IBL (sonda pokoju + PMREM) | ISTNIEJE, działa |
| Adapter animacji dla obcego szkieletu | **NIE ISTNIEJE** — do napisania w Etapie 4 |
| Assety z §1 | **BRAK** — czekam na dostawę |

Do czasu dostawy nie dotykam grafiki proceduralnej. Rdzeń naukowy — RDKit, Vina, ADMET, PySCF,
prerejestracja, Evidence, Replay, Pamięć — pozostaje nietknięty przez cały ten etap.
