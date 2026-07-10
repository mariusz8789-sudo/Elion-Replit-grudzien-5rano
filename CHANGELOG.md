# Changelog

Format luźno wzorowany na [Keep a Changelog](https://keepachangelog.com/).
Pełne raporty z uzasadnieniami decyzji: `RAPORT-ETAP-0.md` ·
`RAPORT-ETAP-1.md` · `RAPORT-ETAP-2.md` · `RAPORT-AUDYT.md`.

## [Unreleased]

### Dodano (Krzywa rotacji galaktyki — nowy eksperyment, Universe Lab)
- `labs/experiments/universe-rotationcurve.ts` + nowe funkcje fizyki w
  `core/physics.ts` (`exponentialDiskMass`, `isothermalHaloMass`,
  `circularVelocity`, `mondAcceleration`, `MOND_A0_ASTRO`): najsilniejszy
  pojedynczy dowód obserwacyjny na ciemną materię (Rubin, Ford & Thonnard
  1978, 1980), zaimplementowany jako dedykowany, interaktywny eksperyment
  zamiast tylko opisu w bazie wiedzy.
- Dwie prawdziwe krzywe na wykresie: prędkość z samej widocznej masy
  (dysk wykładniczy, Freeman 1970 — spada na dużych promieniach, tak jak
  planety w Układzie Słonecznym) vs prędkość z dodanym halo ciemnej materii
  (model pseudo-izotermiczny, Begeman 1989 — spłaszcza się, dokładnie jak
  w realnie zmierzonych galaktykach spiralnych). Suwak steruje masą halo.
- **Ponad pierwotny zakres backlogu**: przełącznik MOND (Milgrom 1983) —
  konkurencyjna hipoteza wobec ciemnej materii. Ta sama płaska krzywa
  osiągana WYŁĄCZNIE modyfikacją prawa grawitacji przy małych
  przyspieszeniach, bez żadnej dodatkowej masy — odtwarza relację
  Tully'ego–Fishera (v∞=(G·M·a0)^¼), jeden z najmocniejszych argumentów za
  MOND. Narracja tłumaczy uczciwie obie strony realnego, nierozstrzygniętego
  sporu kosmologicznego (CDM: konsensus większości, ale cząstki nigdy nie
  wykryte bezpośrednio; MOND: dobrze tłumaczy pojedyncze galaktyki, zawodzi
  na gromadach i CMB).
- Nowa sekcja w `knowledge/universe.md`; zaktualizowana wcześniejsza notatka
  „przyszła funkcja: przełącznik CDM/MOND" — już zbudowana.
- 6 nowych testów fizyki (`physics.test.ts`): monotoniczność masy dysku
  wykładniczego, Keplerowski spadek prędkości bez halo, spłaszczenie z halo
  izotermicznym (M(r)∝r przy r≫rc), granice MOND (g→g_N przy silnym polu,
  g>g_N przy słabym), zbieżność do relacji Tully'ego–Fishera. Zweryfikowane:
  typecheck, lint, 217 testów vitest, build, Playwright (oba tryby, suwak,
  przełącznik MOND) — zero błędów konsoli.

### Dodano (Problem trzech ciał — nowy eksperyment, Universe Lab)
- `labs/experiments/universe-threebody.ts`: grawitacja Newtona w jednostkach
  bezwymiarowych (G=1), integrator velocity-Verlet symplektyczny z
  ADAPTACYJNYM krokiem (maleje przy bliskich przejściach ciał, kryterium
  zbliżone do Aarsetha — bez tego integrator traci energię przy zbliżeniu w
  problemie pitagorejskim, mimo że sam schemat jest symplektyczny dla
  ustalonego kroku).
- Dwa realne, udokumentowane układy startowe: ósemka (figure-eight, Moore
  1993 / dowód istnienia Chenciner–Montgomery 2000) — stabilna, okresowa
  orbita trzech równych mas; problem pitagorejski (Burrau 1913, masy 3:4:5)
  — chaotyczna ewolucja z bliskimi przejściami.
- Tryb „Pokaż drugi, niemal identyczny start" (przesunięcie 10⁻⁶ jednostki):
  druga kopia symulacji renderowana równolegle, z liczbowym odczytem na
  żywo odległości między kopiami — namacalna demonstracja czułości na
  warunki początkowe (efekt motyla), zgodnie z historycznym odkryciem
  Poincarégo (1887) że problem trzech ciał nie ma ogólnego rozwiązania
  analitycznego — to ta praca zapoczątkowała teorię chaosu.
- Nowa sekcja w `knowledge/universe.md`, rozszerzony `narrate()` z osobną
  narracją dla każdego presetu i trybu dywergencji, cytowania (Burrau 1913,
  Chenciner & Montgomery 2000).
- 10 nowych testów (`universeThreeBody.test.ts`): zachowanie energii
  długoterminowo dla obu układów (w tym przez bliskie przejście w problemie
  pitagorejskim), powrót ósemki do startu po jednym okresie T≈6.326,
  wykładniczy wzrost separacji >1000× po mikroskopijnym przesunięciu,
  zbalansowany pęd całkowity, narracja dla wszystkich kombinacji
  preset×dywergencja. Zweryfikowane: typecheck, lint, 210 testów vitest,
  build, Playwright (oba presety, przełączanie, tryb dywergencji z rosnącym
  odczytem separacji) — zero błędów konsoli.

### Dodano (Quantum Decision Explorer — nowy, trzeci tryb wejścia do Genesis OS)
- Galaktyka złożona z decyzji użytkownika: każda gwiazda to jedna decyzja
  życiowa (tytuł, opis, rok, subiektywna waga 1–10, do 4 alternatywnych
  ścieżek), rozłożona w spirali kątem złotym (phyllotaxis — ta sama
  technika co węzły sieci energetycznej w `civilization.ts`). Suwak osi
  czasu przesuwa, która decyzja jest aktywna — jej odgałęzienia
  ("gdyby...") pojawiają się jako świecące, podpisane ścieżki rozchodzące
  się z gwiazdy, a cała struktura galaktyki widocznie się zmienia przy
  każdym przesunięciu.
- **Jawny, stały, niedomykalny baner ostrzegawczy** (nie tylko wzmianka w
  bazie wiedzy) z dokładnie tym tekstem: *"To interaktywna symulacja
  alternatywnych scenariuszy oparta na modelowaniu decyzji i wizualnych
  inspiracjach z fizyki. Nie przewiduje przyszłości ani nie odtwarza
  rzeczywistości."* Zero numerologii, zero języka duchowego/ezoterycznego —
  to była wyraźna korekta użytkownika po przejrzeniu pierwotnej koncepcji
  ("osobisty multiwersum decyzji"), zalogowana i zaimplementowana w tej
  samej sesji.
- 100% lokalne dane (`core/decisionExplorer.ts`, `localStorage` przez
  `core/storage.ts`, ten sam bezpieczny wzorzec co Ustawienia/Dziennik
  odkryć) — zero backendu, zero konta. Przykładowe decyzje przy pierwszym
  uruchomieniu, jawnie do edycji lub usunięcia.
- Formularz dodaj/edytuj/usuń decyzję wbudowany w ekran (bez modali) —
  zapisuje się natychmiast i staje się nową aktywną gwiazdą.
- Nowy plik wiedzy `knowledge/quantum-decision-explorer.md` — jawnie
  instruuje Narratora AI, by NIGDY nie sugerował przewidywania ani analizy
  "co by było" jako wyniku obliczeń, tylko jako własne przemyślenia
  użytkownika. `labId: 'quantum-decision-explorer'` zarejestrowany w
  `LAB_KNOWLEDGE_FILES` backendu.
- Prominentne wejście na ekranie głównym (obok CTA Discovery Timeline).
- 12 nowych testów (`decisionExplorer.test.ts`: sanityzacja i odporność na
  uszkodzony zapis w localStorage, CRUD, sortowanie chronologiczne,
  przycinanie wagi do [1,10], geometria `galaxyPosition` — promień rośnie
  monotonicznie z indeksem, stały krok kąta złotego). 203 testy
  frontendowe razem (231 z 28 backendowymi).
- Pełna weryfikacja: typecheck, lint, 231 testów, build produkcyjny,
  Playwright (dodawanie/edycja/usuwanie decyzji, przewijanie osi czasu z
  potwierdzeniem zmiany aktywnej gwiazdy) — zero błędów konsoli.

### Dodano (Discovery Timeline Engine — nowy, drugi tryb wejścia do Genesis OS)
- Flagowa funkcja sesji: jedna, ciągła podróż przez 15 epok historii
  Wszechświata (Wielki Wybuch → Inflacja → Pierwsze atomy → Pierwsze
  gwiazdy → Pierwsze galaktyki → Droga Mleczna → Układ Słoneczny → Ziemia
  → Pierwsze życie → Eksplozja kambryjska → Dinozaury → Ludzie → Teraz →
  Bliska przyszłość → Daleka przyszłość), bez ekranów ładowania —
  `core/timelineMath.ts::epochBlend` renderuje w każdej klatce CIĄGŁY mix
  dwóch sąsiednich epok (cross-fade sterowany odległością w log-czasie),
  nigdy pusty stan pośredni.
- Pełne sterowanie czasem: pauza, przewijanie (◀1000×/◀10×), przyspieszanie
  (▶10×/▶1000×), skok w dowolne miejsce (15 kafelków epok + suwak
  logarytmiczny). Każda epoka ma jawną etykietę potwierdzenia naukowego
  (`ConfirmationLevel`, core/citation.ts — ta sama 6-stopniowa skala co
  reszta platformy): rekombinacja/CMB i wymieranie dinozaurów są
  ★★★★★ potwierdzone, daleka przyszłość jest jawnie oznaczona jako ★★
  hipoteza — hipotezy nigdy nie udają faktów, dokładnie jak wszędzie
  indziej w Genesis OS.
- Druga, niezależna oś: soczewka skali przestrzennej (kwark →
  obserwowalny Wszechświat), reużywająca DOKŁADNIE tę samą technikę
  renderowania co Scale Journey (promień pierścienia = rozmiar/skala ×
  baza) — kamienie milowe wydzielone do współdzielonego
  `data/scaleMilestones.ts` (Scale Journey i Discovery Timeline czytają
  teraz z jednego miejsca prawdy, zero duplikacji). Każda epoka ustawia
  PUNKT STARTOWY zoomu (jej charakterystyczną skalę — od długości Plancka
  po obserwowalny Wszechświat), ale użytkownik może swobodnie zoomować w
  dowolnym momencie osi czasu — potwierdzone Playwrightem: ręczne
  przesunięcie suwaka skali podczas epoki "Pierwsze atomy" do poziomu
  kwarku działa niezależnie od suwaka czasu.
- 15 odrębnych, ręcznie zaprojektowanych scen Canvas 2D
  (`components/discoveryTimelineScenes.ts`) — błysk Wielkiego Wybuchu,
  rozdymająca się siatka inflacji, mgławica CMB z atomem wodoru, zapalające
  się gwiazdy Populacji III, gromady pierwszych galaktyk, spirala Drogi
  Mlecznej, Układ Słoneczny z orbitującymi planetami, obracająca się
  Ziemia, pulsujące mikroorganizmy, drzewo życia eksplozji kambryjskiej,
  sylwetka zauropoda, ognisko z ludzkimi sylwetkami, "jesteś tutaj" na
  Ziemi, czerwony olbrzym Słońca, gasnące gwiazdy dalekiej przyszłości.
- Most do laboratoriów (`core/scenarioBridge.ts`, ROZSZERZONY o opcjonalny
  `experimentId` — trzeci niezależny konsument po "Co by było, gdyby?" i
  portalach Multiverse Nexus): przycisk "Otwórz w [Lab]" na epokach z
  naturalnym dopasowaniem (Wielki Wybuch/Teraz → Ekspansja, Pierwsze
  gwiazdy/Bliska przyszłość → Życie gwiazdy, Układ Słoneczny/Ziemia →
  Prawdziwy Układ Słoneczny) trafia teraz w KONKRETNY eksperyment, nie
  tylko zakładkę bazową — potwierdzone Playwrightem: kliknięcie z epoki
  "Układ Słoneczny" ląduje dokładnie na zakładce „Prawdziwy Układ
  Słoneczny", z prawdziwą fizyką Keplera. `LabShell.tsx` skonsumuje
  scenariusz raz na całe życie komponentu (nie przy każdym przełączeniu
  zakładki), zachowując 100% kompatybilności wstecznej z istniejącymi
  wywołaniami bez `experimentId`.
- Nowy plik wiedzy `knowledge/discovery-timeline.md` grunduje Narratora AI
  (`labId: 'discovery-timeline'`, zarejestrowany w `LAB_KNOWLEDGE_FILES`
  backendu) — "Zapytaj AI" działa na tym ekranie tak samo jak w każdym
  laboratorium.
- Prominentne wejście na ekranie głównym (duży, wyróżniony przycisk CTA
  nad siatką laboratoriów) — zgodnie z życzeniem, żeby to było
  najbardziej imponujące doświadczenie w Genesis OS, nie ukryta funkcja.
- 19 nowych testów: `core/logSlider.ts` (matematyka suwaka log — 5 testów,
  współdzielona teraz przez ScaleJourney i DiscoveryTimeline),
  `core/timelineMath.ts` (wyszukiwanie epoki, cross-fade, integralność
  15 epok — 14 testów; **znaleziony i naprawiony realny błąd**: warunek
  brzegowy `>=` zamiast `>` w `epochBlend` powodował, że wiek DOKŁADNIE
  równy wiekowi ostatniej epoki fałszywie cofał mix do 0 zamiast dać 1 —
  wykryty przez test monotoniczności, nie przez oglądanie ekranu) +
  2 nowe testy `scenarioBridge.test.ts` dla `experimentId`. 191 testów
  frontendowych razem (219 z 28 backendowymi).
- Pełna weryfikacja: typecheck, lint, 219 testów, build produkcyjny,
  Playwright (skoki między 7 epokami, autoodtwarzanie @1000× przez 3
  epoki, ręczny zoom skali, pełny most do laboratorium z potwierdzeniem
  właściwej zakładki) — zero błędów konsoli w każdym scenariuszu.
- Zgodnie z fazowaniem z VISION-BACKLOG.md: to Fazy 1+2 (oś czasu +
  most do laboratoriów) PLUS działająca soczewka skali (backlog zakładał
  to jako osobną, trudniejszą Fazę 3 — okazała się bezpośrednio
  reużywalna z istniejącego mechanizmu Scale Journey). Sceny 3D dla
  wybranych epok (Faza 4) pozostają w backlogu na przyszłość.

### Dodano (Chemistry Lab — nowe laboratorium, pierwszy eksperyment: Wiązania chemiczne)
- Po dopracowaniu wszystkich 9 istniejących laboratoriów (patrz wpisy
  niżej) i zgodnie z pierwotną listą priorytetów użytkownika (pozycja 6:
  Chemistry Lab), zbudowano nowe laboratorium z jednym w pełni
  wykończonym, dobrze przetestowanym eksperymentem — zamiast wielu
  płytkich, zgodnie z zasadą sesji "jedna naprawdę skończona funkcja >
  wiele powierzchownych".
- **Wiązania chemiczne**: różnica elektroujemności Paulinga Δχ = |χA−χB|
  (dane tabelaryczne CRC Handbook, `data/electronegativity.ts`, ~70
  pierwiastków głównych grup i pierwszych dwóch serii przejściowych)
  steruje CIĄGŁĄ wizualizacją chmury elektronowej — środek i promień
  chmury przesuwają się i kurczą płynnie od kowalencyjnej (wyśrodkowana,
  szeroka) po jonową (ciasna, na jednym atomie, z etykietami ładunku), nie
  przełącznikiem trzech dyskretnych stanów. To ta sama "emergent, not
  decorative" zasada, którą stosowano przy każdym polerowaniu tej sesji.
- Nowa czysta funkcja `core/physics.ts::bondPolarity` (Δχ, klasyfikacja
  typu wiązania, wzór Hanney–Smitha na przybliżony % charakteru jonowego)
  + 7 nowych testów (symetria, monotoniczność, podręcznikowe przykłady
  C–H/H–Cl/Na–Cl) — 170 testów frontendowych razem (198 z backendem).
- Nowy plik wiedzy `knowledge/chemistry.md` (zarejestrowany w
  `LAB_KNOWLEDGE_FILES` backendu) grunduje Narratora AI dla tego
  laboratorium, tak jak dla pozostałych 10.
- Domyślna para Na–Cl (sól kuchenna) — natychmiast rozpoznawalny,
  podręcznikowy przykład wiązania jonowego.
- Zaktualizowano `registry.test.ts`/`discoveryLog.test.ts` (11 laboratoriów
  zamiast 10), README/ARCHITECTURE/VISION-BACKLOG.
- Pełna weryfikacja: typecheck, lint, 198 testów, build produkcyjny,
  Playwright (3 stany wiązania: kowalencyjne niespolaryzowane C–H,
  spolaryzowane H–Cl, jonowe Na–Cl) bez błędów konsoli.
- Biology Lab z pierwotnej listy priorytetów nadal nie istnieje —
  pozostaje w VISION-BACKLOG.md do decyzji.

### Poprawiono (Space-Time Lab i Nuclear Lab dopracowane — dwa laboratoria pominięte w pierwotnej liście priorytetów)
- Odkryto, że pierwotna lista priorytetów użytkownika (Quantum → Einstein
  → Universe → Atom → Particle → Chemistry → Biology → Civilization →
  Multiverse) nie obejmowała dwóch laboratoriów, które faktycznie istnieją
  w rejestrze (`labs/index.ts`): Space-Time Lab (dylatacja czasu, stożki
  świetlne) i Nuclear Lab (rozpad, mapa nuklidów, reakcja łańcuchowa,
  tokamak). Skoro cel to „każde laboratorium na poziomie world-class",
  dopracowano oba tym samym zabiegiem, zamiast pominąć je milcząco.
- Space-Time Lab: gradient tła w obu eksperymentach (Zegary świetlne już
  miały świecące fotony — bez zmian tam), zdarzenia A/B w diagramie
  Minkowskiego dostały poświatę w swoich rzeczywistych kolorach.
- Nuclear Lab: gradient tła we wszystkich 4 eksperymentach; żywe jądra w
  Rozpadzie i krzywa symulacji dostały poświatę; neutrony w Reakcji
  łańcuchowej dostały poświatę; zaznaczony nuklid w Mapie nuklidów dostał
  poświatę. Tokamak (plazma) już miał dobrą poświatę — tylko tło.
- Zero zmian fizyki w żadnym z 6 eksperymentów. Pełna weryfikacja:
  typecheck, lint, 163 testy frontendowe + 28 backendowych (191 razem),
  build produkcyjny, Playwright na wszystkich 6 eksperymentach bez
  błędów konsoli i bez regresji.
- Chemistry Lab i Biology Lab nadal nie istnieją — pozostają w
  VISION-BACKLOG.md do decyzji.

### Poprawiono (Multiverse Lab ukończone — laboratorium 7 z 9 w kolejności dopracowania — WSZYSTKIE ISTNIEJĄCE LABORATORIA DOPRACOWANE)
- Inne stałe (bazowy eksperyment budowy scenariuszy): tło zmienione na
  gradient radialny; planeta w ekosferze (`inHz` — prawdziwy warunek
  geometryczny już sterujący jej kolorem) dostała poświatę. Zero zmian w
  skalowaniach fine-tuningu (t~G⁻², progi diproton/deuter).
  Multiverse Nexus i Tesserakt 4D zweryfikowane ponownie — obie sceny
  WebGL już mają własną, dobrze wykonaną poświatę (sprite'y portali,
  kolorowanie krawędzi wg 4. wymiaru) — bez zmian.
- Pełna weryfikacja przed przejściem dalej: typecheck, lint, 163 testy
  frontendowe + 28 backendowych (191 razem) — wszystkie zielone, build
  produkcyjny bez ostrzeżeń, wizualna weryfikacja Playwrightem wszystkich
  3 eksperymentów bez błędów konsoli.
- **Kamień milowy**: to zamyka pierwotną listę priorytetów użytkownika
  wśród laboratoriów, które faktycznie istnieją (Quantum → Einstein →
  Universe → Atom → Particle → Civilization → Multiverse). Chemistry Lab
  i Biology Lab z tej listy (pozycje 6–7) nigdy nie zostały zbudowane —
  zgodnie z zasadą „nie dodawaj nowych laboratoriów w tej fazie" zostały
  celowo pominięte i czekają w VISION-BACKLOG.md. Kolejny krok wymaga
  decyzji: zbudować Chemistry/Biology Lab jako nowe laboratoria, czy
  przejść do dużych modułów z backlogu (Discovery Timeline, Three-Body,
  Frontier Science Lab) — obie ścieżki wykraczają poza „polerowanie
  istniejących laboratoriów" i wymagają jawnej zgody.

### Poprawiono (Civilization Lab ukończone — laboratorium 6 z 9 w kolejności dopracowania)
- Skala Kardaszewa: tło zmienione na gradient radialny; węzły sieci
  energetycznej Typu 0→I dostały poświatę pulsującą z ich rzeczywistą
  fazą (ta sama wartość `pulse`, która już sterowała przezroczystością),
  gwiazdy "zebrane" w galaktyce Typu III (harvested = i/700 < (K−3)×2 —
  prawdziwy warunek z pętli renderującej, nie ozdoba) dostały poświatę
  odróżniającą je od niezebranych. Rój Dysona (Typ II) zweryfikowany —
  już dobrze wykonany, bez zmian. Zero zmian we wzorze Sagana.
- Kolonizacja: tło zmienione na gradient radialny dla spójności z resztą
  laboratorium; świecące skolonizowane gwiazdy (już wcześniej dobrze
  wykonane) bez zmian. Zero zmian w modelu perkolacyjnym.
- Pełna weryfikacja przed przejściem dalej: typecheck, lint, 163 testy
  frontendowe + 28 backendowych (191 razem) — wszystkie zielone, build
  produkcyjny bez ostrzeżeń, wizualna weryfikacja Playwrightem wszystkich
  3 stanów skali Kardaszewa (Typ 0→I, II, III) i Kolonizacji bez błędów
  konsoli.
- Multiverse Lab (7 z 9, ostatnie z pierwotnej listy priorytetów wśród
  istniejących laboratoriów — celowo na końcu, bo mocniej spekulatywne
  niż reszta) jest następny. Chemistry Lab i Biology Lab z pierwotnej
  listy priorytetów (6 i 7) nadal nie istnieją jako laboratoria —
  zostają w VISION-BACKLOG.md do rozważenia po ukończeniu polerowania
  wszystkich istniejących laboratoriów.

### Poprawiono (Particle Lab ukończone — laboratorium 5 z 9 w kolejności dopracowania)
- Detektor: tło zmienione na gradient radialny; tory cząstek dostały
  poświatę skalowaną PRAWDZIWYM pt toru (wyższy pęd poprzeczny = bardziej
  energetyczna cząstka, jaśniejszy tor — dokładnie ta sama liczba, która
  już sterowała krzywizną toru r = p/qB), punkt zderzenia dostał białą
  poświatę. Zero zmian w fizyce krzywizny ani w losowaniu zdarzeń.
- Odkryj cząstkę (histogram masy niezmienniczej): słupki, które faktycznie
  przekroczyły próg odkrycia piku (ta sama reguła co w narrate()/getStats,
  8 + total×0,002), dostają ciepłą bursztynową poświatę — rezonanse J/ψ,
  ψ(2S), Υ i Z⁰ wizualnie wyłaniają się z szumu w momencie odkrycia, a nie
  wcześniej. Zero zmian w próbkowaniu Breit–Wignera ani w danych PDG.
- Pełna weryfikacja przed przejściem dalej: typecheck, lint, 163 testy
  frontendowe + 28 backendowych (191 razem) — wszystkie zielone, build
  produkcyjny bez ostrzeżeń, wizualna weryfikacja Playwrightem obu
  eksperymentów (w tym pełne odkrycie wszystkich 4 rezonansów) bez błędów
  konsoli.
- Civilization Lab (6 z 9) jest następny w kolejności — Chemistry Lab i
  Biology Lab z pierwotnej listy priorytetów nie istnieją jeszcze jako
  laboratoria, więc zgodnie z zasadą „nie dodawaj nowych laboratoriów w
  tej fazie" pomijamy je na razie i wracamy do nich po ukończeniu
  wszystkich istniejących.

### Poprawiono (Atom Lab ukończone — laboratorium 4 z 9 w kolejności dopracowania)
- Powłoki (model Bohra): tło zmienione na gradient radialny; jądro
  dostało poświatę skalowaną PRAWDZIWYM Z pierwiastka (log₂Z — więcej
  protonów, jaśniejsze jądro; porównaj węgiel Z=6 vs złoto Z=79 na
  zrzutach ekranu), elektrony na wszystkich powłokach dostały spójną
  poświatę. Zero zmian w regule Aufbau ani w danych 118 pierwiastków.
- Orbitale |ψ|²: zweryfikowane ponownie, uznane za już świetnie wykonane
  — gęstość prawdopodobieństwa renderowana jako świecąca chmura to
  bezpośrednio dane z rozwiązania Schrödingera, nie ozdoba. Bez zmian.
- Pełna weryfikacja przed przejściem dalej: typecheck, lint, 163 testy
  frontendowe + 28 backendowych (191 razem) — wszystkie zielone, build
  produkcyjny bez ostrzeżeń, wizualna weryfikacja Playwrightem obu widoków
  (w tym porównanie jasności jądra dla różnych Z) bez błędów konsoli.
- Particle Lab (5 z 9) jest następny w kolejności.

### Poprawiono (Universe Lab ukończone — laboratorium 3 z 9 w kolejności dopracowania)
- Ekspansja (bazowy eksperyment): tło zmienione z płaskiej czerni na
  gradient radialny; galaktyki dostały poświatę skalowaną PRAWDZIWĄ
  jasnością pozorną liczoną z prawa odwrotnych kwadratów (1/d² — ta sama
  odległość d, która już sterowała przesunięciem ku czerwieni) — bliższe
  galaktyki świecą wyraźnie, dalekie/przesunięte gasną bez poświaty. Zero
  zmian w równaniu Friedmanna ani w update().
- Prawdziwy Układ Słoneczny (2D): planety dostały poświatę skalowaną ich
  promieniem `dotR` (pochodzącym z prawdziwego `radiusKm` NASA) — większe
  planety świecą wyraźniej. Zero zmian w rozwiązaniu równania Keplera.
- Układ Słoneczny 3D, Zderzenie galaktyk, Życie gwiazdy: zweryfikowane
  ponownie, uznane za już dobrze wykonane (świecące jądra, gradienty
  supernowej/mgławicy/dysku akrecyjnego, starfield) — bez zmian.
- Pełna weryfikacja przed przejściem dalej: typecheck, lint, 163 testy
  frontendowe + 28 backendowych (191 razem) — wszystkie zielone, build
  produkcyjny bez ostrzeżeń, wizualna weryfikacja Playwrightem wszystkich
  5 eksperymentów bez błędów konsoli i bez regresji.
- Atom Lab (4 z 9) jest następny w kolejności.

### Poprawiono (Einstein Lab ukończone — laboratorium 2 z 9 w kolejności dopracowania)
- Ugięcie światła (Schwarzschild/Kerr/Alcubierre): tło zmienione z płaskiej
  czerni na gradient radialny; ślady fotonów dostały poświatę sterowaną
  PRAWDZIWĄ minimalną odległością każdego śladu od centrum masy
  (`closeness` liczone z rzeczywistych współrzędnych trajektorii, nie
  ozdoba) — im bliżej horyzontu przeleciał foton, tym cieplejszy i
  jaśniejszy jest jego ślad. Pierścień fotonowy dostał dopasowaną poświatę.
  Zero zmian w `update()`, całkowaniu Kerra ani w renderze bańki Alcubierre'a.
- Soczewkowanie: tło zmienione na gradient radialny, soczewka (masa)
  dostała poświatę — bez zmian we wzorach θ±/μ±/krzywej mikrosoczewkowania.
- Czarna dziura 3D: zweryfikowana ponownie po zmianach w pozostałych
  eksperymentach — bez regresji (bloom, dysk akrecyjny, ślady fotonów
  renderują się poprawnie, zero błędów konsoli).
- Pełna weryfikacja przed przejściem dalej: typecheck, lint, 163 testy
  frontendowe + 28 backendowych (191 razem) — wszystkie zielone, build
  produkcyjny bez ostrzeżeń, wizualna weryfikacja Playwrightem wszystkich
  3 eksperymentów (w tym trzech trybów metryki) bez błędów konsoli.
- Universe Lab (3 z 9) jest następny w kolejności.

### Poprawiono (Quantum Lab ukończone — laboratorium 1 z 9 w kolejności dopracowania)
- Tunelowanie: krzywa |ψ|² dostała poświatę (glow), a lokalna FAZA fali
  (atan2(Im,Re) w każdym punkcie siatki — prawdziwa dana z solvera FFT, nie
  ozdoba) koduje kolor punktów wzdłuż obwiedni. Efekt: widać teraz na żywo
  interferencję fali padającej z odbitą jako falującą barwę przed barierą —
  wcześniej ta informacja istniała w symulacji, ale nigdzie się nie
  renderowała. Zero zmian w solverze split-step Fourier.
- Sfera Blocha i Splątanie (CHSH): zweryfikowane, uznane za już dobrze
  wykonane (świecący wektor stanu, pulsujące źródło par, brak zmian).
- Quantum Lab jest pierwszym w kolejności ustalonej wspólnie z użytkownikiem
  (Quantum → Einstein → Universe → Atom → Particle → Civilization →
  Multiverse) — każde kolejne laboratorium dostaje ten sam zabieg: zero
  zmian w silniku fizycznym, poprawa wyłącznie warstwy renderującej, z
  pełną weryfikacją (lint/typecheck/testy/build/Playwright) przed przejściem dalej.

### Poprawiono (dopracowanie istniejącego laboratorium — dwie szczeliny)
- Quantum Lab: ekran detekcyjny renderuje teraz prawdziwie AKUMULOWANĄ
  poświatę trafień (płótno offscreen, additive blending, każde trafienie
  dorysowuje się raz w momencie zajścia) zamiast martwych, statycznych
  kropek 1,6 px odmalowywanych co klatkę. Efekt emerguje wprost z fizyki:
  jasność wzoru interferencyjnego TO dosłownie akumulacja pomiaru, nie
  ozdoba nałożona na wynik. Zero zmian w `prob()`/`sample()`/histogramie —
  czysta poprawa warstwy renderującej, zweryfikowana Playwrightem
  (kontrast: prążki przy interferencji vs dwie plamy przy włączonym
  pomiarze drogi — teraz wyraźnie czytelne, wcześniej ledwo widoczne).
  Dodatkowo: pulsujące źródło, winieta tła, świecące słupki histogramu.

### Dodano (Czarna dziura 3D + bloom) / Naprawiono (błąd znaku w geodezyjnej)
- Einstein Lab: „Czarna dziura 3D" — ta sama dokładna fizyka geodezyjnej
  zerowej Schwarzschilda co wersja 2D (`core/physics.ts`:
  `stepSchwarzschildGeodesic`, teraz współdzielona), rozszerzona na 3D:
  każdy foton dostaje losowo zorientowaną płaszczyznę orbity (fizycznie
  ścisłe — geodezyjne wokół masy sferycznie symetrycznej zawsze leżą w
  jednej płaszczyźnie). Dysk akrecyjny (700 cząstek, jasność koduje
  wzmocnienie Dopplera) z prawdziwym postprocessingiem bloom.
- `core/three/types.ts`/`useThreeLoop.ts`: nowy, opcjonalny
  `Sim3D.setupPostProcessing()` — pierwsza reużywalna infrastruktura
  postprocessingu (`EffectComposer`/`RenderPass`/`UnrealBloomPass`/
  `OutputPass`) dostępna dla KAŻDEJ przyszłej sceny 3D, nie tylko tej jednej.
- **Znaleziony i naprawiony realny błąd fizyczny** w już wdrożonym
  eksperymencie „Geodezyjne + dysk" (2D): krok całkowania RK4 używał
  niespójnego znaku względem kierunku ruchu fotonu (`+dφ` zamiast `-dφ`) —
  w praktyce KAŻDY foton był klasyfikowany jako „uciekł", niezależnie od
  parametru zderzenia b. Wykryty przez napisanie twardego testu progu
  krytycznego b_c (nie przez ręczną obserwację) — dokładnie ten rodzaj
  błędu, przed którym miały chronić testy fizyczne zamiast "nie rzuca
  wyjątku". Naprawiony w jednym miejscu (`stepSchwarzschildGeodesic`),
  współdzielonym teraz przez 2D i 3D.
- 5 nowych testów fizyki (próg b_c, brak siły w nieskończoności, znak siły
  na horyzoncie) — 163 testy frontendowe razem (191 z backendem).

### Dodano (Multiverse Nexus — sala portali 3D)
- Multiverse Lab: „Multiverse Nexus" (`multiverse-nexus.ts`) — oryginalna
  metafora nawigacyjna (świadomie NIE kopiująca żadnego filmu/serialu):
  sześć świecących portali w scenie 3D, klikalnych przez raycasting
  (`THREE.Raycaster`, nowa technika interakcji w `core/three/`). Cztery
  portale „lokalne" (inne stałe fizyczne) podświetlają się i zmieniają
  narrację bez opuszczania laboratorium; dwa portale-tunele NAPRAWDĘ
  przenoszą do Universe Lab z obliczonymi wartościami Ω_Λ — przez
  `core/scenarioBridge.ts`, ten sam most co ekran „Co by było, gdyby?"
  (parametry importowane wprost z `data/whatIfScenarios.ts`, zero
  duplikowania liczb).
- Naprawiony podczas budowy błąd kamery 3D: `OrbitControls` orbituje wokół
  `(0,0,0)`, więc kamera bliska temu punktowi degeneruje się po pierwszym
  `controls.update()` (widok "uciekał" w przypadkowy kierunek) — kamera
  Nexusa (i już wcześniej Układu Słonecznego 3D) zawsze patrzy na środek
  sceny z realnej odległości.
- 5 nowych testów (`multiverseNexus.test.ts`) — portale-tunele wskazują
  realne laby i realne, w zakresie parametry — 158 testów frontendowych.

### Dodano (Vision Backlog + Tesserakt 4D)
- `VISION-BACKLOG.md` — katalog ~60 pomysłów na przyszłość (Quantum Reality,
  wyższe wymiary, nanotechnologia, biologia molekularna, Grand Challenges,
  Creator Platform/Marketplace, Founder Mode, XR), każdy z tagiem pewności
  naukowej i priorytetem — celowo NIE lista zadań: zasada „1–2 pozycje na
  sesję", żeby duża wizja nie rozmyła rozwoju.
- Multiverse Lab: „Tesserakt (4D)" — obrót hipersześcianu w płaszczyźnie 4D
  (`core/physics.ts`: `rotate4D`/`project4Dto3D`/`TESSERACT_VERTICES`/
  `TESSERACT_EDGES`, dokładna algebra liniowa) + rzut perspektywiczny do 3D
  renderowany przez `Sim3D` (drugi konsument tej architektury po Układzie
  Słonecznym 3D — potwierdza, że wzorzec generalizuje się poza jeden lab).
  Kolor krawędzi koduje 4. współrzędną. Jasno odróżnione od spekulacji o
  fizycznych dodatkowych wymiarach (teoria strun) w honestyNote.
- 7 nowych testów fizyki/geometrii (zachowanie normy przy obrocie, znane
  wartości przy 0°/90°, liczba wierzchołków/krawędzi/stopień grafu) — 153
  testy frontendowe razem.

### Dodano (Redesign wizualny + "Co by było, gdyby?" + Układ Słoneczny 3D)
- Design system v2 (`styles.css`): tokeny ruchu (`--ease-out`/`--ease-spring`),
  elewacja/blask kodujący stan (nie ozdoba), szklane panele, przeprojektowane
  karty laboratoriów/suwaki (naprawiony błąd wypełnienia suwaka niezgodnego
  z realną wartością)/przyciski/Narrator, siatka tła i róg-HUD na ekranie
  głównym, pasek statusu misji z WYŁĄCZNIE realnymi danymi (liczba
  laboratoriów, status backendu AI z `/api/health`, postęp z Dziennika Odkryć).
- `core/three/` — `Sim3D` (świadome lustro kontraktu `Sim` dla WebGL) +
  `useThreeLoop.ts` (lustro `useSimLoop.ts`); `three` ładowany dynamicznie,
  osobny leniwy chunk, zero wpływu na główny bundle dla labów bez 3D.
- Universe Lab: „Układ Słoneczny 3D" — ta sama fizyka Keplera co wersja 2D
  (zero duplikacji), kamera do obracania/przybliżania (OrbitControls),
  gwiazdy, poświata Słońca, orbity jako linie 3D.
- „Co by było, gdyby?" — nowy ekran z katalogiem pytań fizycznych
  (`data/whatIfScenarios.ts`), most `core/scenarioBridge.ts` nadpisuje
  parametry ISTNIEJĄCEGO eksperymentu bazowego docelowego laboratorium (zero
  nowej symulacji); etykieta wiarygodności karty czytana na żywo z
  `HonestyLevel` laboratorium, nie duplikowana ręcznie.
- `ExperimentDef.createSim` stało się opcjonalne (obok nowego `createSim3D`)
  — `LabShell.tsx` renderuje odpowiedni widok (2D/3D) na podstawie tego,
  które pole jest obecne; `sims.test.ts` pomija eksperymenty tylko-3D z tego
  samego, udokumentowanego powodu co Atom Lab CustomView (brak WebGL w
  środowisku testowym bez DOM).
- 9 nowych testów (`scenarioBridge.test.ts`, `whatIfScenarios.test.ts`,
  w tym sprawdzenie, że każdy scenariusz wskazuje realne pole parametru
  realnego laboratorium) — 146 testów frontendowych razem.

### Dodano (Genesis Knowledge Engine + laboratoria, od RAPORT-AUDYT-2)
- Genesis Knowledge Base (`knowledge/*.md`): sześciostopniowa skala
  potwierdzenia naukowego, nowe pliki (mechanika klasyczna, elektrodynamika,
  termodynamika, dossier 13 naukowców), Narrator LLM ugruntowany wyłącznie
  w tej bazie (`buildKnowledgeIndex`/`knowledgeExcerptFor` w backendzie).
- `core/dataSource.ts` + `core/citation.ts` — jeden rejestr źródeł danych i
  wspólna skala pewności dla całej platformy (Narrator, DataSource, UI).
- Universe Lab: prawdziwy Układ Słoneczny (dane NASA Planetary Fact Sheet,
  równanie Keplera) jako flagowy eksperyment.
- "Stwórz eksperyment" na każdym laboratorium: własne presety parametrów +
  deterministyczna analiza trendu (bez LLM) w kształcie identycznym z
  resztą Narratora — zero równoległej infrastruktury AI.
- Nuclear Lab: Mapa nuklidów — ciągła "dolina stabilności" z wzoru SEMF
  (`core/physics.ts`) + ~55 realnie zmierzonych izotopów (NNDC,
  `data/nuclides.ts`) jako klikalna nakładka; kierunek rozpadu beta liczony
  z porównania energii wiązania sąsiednich izobarów.
- `core/i18n.ts` — architektura wielojęzyczna (polski kompletny, angielski
  jako świadomie pusty seam, bez „martwego" UI).
- `scripts/fetch-real-data.mjs` — gotowy fetcher JPL Horizons/Gaia/CERN
  (nieuruchomiony end-to-end — sieć sandboxa blokuje te hosty, patrz
  README „Znane ograniczenia").

## Etap Audytu 2 — utwardzanie produkcyjne i funkcje lokalne

Pełny raport z uzasadnieniem każdej zmiany: [`RAPORT-AUDYT-2.md`](RAPORT-AUDYT-2.md).

### Dodano
- Ustawienia (redukcja ruchu, wysoki kontrast, kompaktowy Narrator,
  opt-out z lokalnej analityki) — w pełni lokalne, `localStorage`.
- Paleta poleceń (`/` lub ikona Szukaj) — wyszukiwanie po wszystkich
  laboratoriach i eksperymentach, normalizacja polskich znaków.
- Dziennik odkryć — 10 odznak odblokowywanych z realnych progów
  fizycznych już liczonych przez symulacje (zero nowych obliczeń).
- Słowniczek — 29 pojęć skondensowanych z Genesis Knowledge Base,
  filtrowalny po laboratorium i tekście.
- Globalne skróty klawiszowe (Spacja/R/`/`/`?`/Esc) + nakładka pomocy.
- Dostępność: skip link, pułapka fokusu w nakładkach modalnych,
  `aria-live` w panelu Narratora, granica błędu per-laboratorium (jedna
  awaria symulacji nie zabiera nawigacji).
- Backend: nagłówki bezpieczeństwa na każdej odpowiedzi (CSP,
  X-Frame-Options, Referrer-Policy, Permissions-Policy,
  Strict-Transport-Security).
- Backend: `lib.mjs` — czysta, testowalna logika (walidacja, rate limiter,
  rozwiązywanie ścieżek statycznych) + 21 testów `node:test`.
- 49 nowych testów frontendowych dla nowych modułów lokalnych (86 razem).
- `ARCHITECTURE.md`, `CONTRIBUTING.md`, ten `CHANGELOG.md`.

### Zmieniono
- React/react-dom wydzielone do osobnego chunku (`manualChunks`) dla
  lepszego cache'owania długoterminowego.
- Refaktor DRY: wspólny `HonestyBadge` i pomocnicze funkcje rysowania
  krzywych na canvasie (`canvasHelpers.ts`) zamiast duplikacji w 4+
  plikach symulacji.
- `discovery.tsx` pokazuje żywy status backendu LLM (`GET /api/health`)
  zamiast statycznego tekstu z poprzedniego etapu.

### Naprawiono
- Path traversal na serwerze statycznym: stary check
  `filePath.startsWith(STATIC_DIR)` błędnie przepuszczał katalogi
  siostrzane dzielące prefiks (np. `/app/dist-evil` pasowało do
  `/app/dist`). Naprawione porównaniem do `staticDir + separator`.
- `core/settings.ts` mogło rzucić poza przeglądarką (brak `document`) —
  dodana jawna strażniczka.

## Etap Audytu — gotowość produkcyjna

Pełny audyt kodu, bezpieczeństwa, wydajności i UX bez nowych funkcji
użytkowych. Naprawiona konfiguracja `.replit` (Deploy wskazywał na
nieistniejący `dist/index.js`), dodane CI/CD (GitHub Actions), ESLint +
Prettier, Docker (multi-stage, non-root), `SECURITY.md`, `LICENSE`,
`.env.example`, ErrorBoundary, poprawki SEO/PWA/WCAG. Szczegóły:
`RAPORT-AUDYT.md`.

## Etap 2 — AI, offline, przygotowanie pod dane rzeczywiste

Splątanie kwantowe + gra CHSH (kwantowy vs. ukryte zmienne), PWA w pełni
offline (service worker, manifest), backend AI (proxy Anthropic), testy
fizyki w vitest (`core/physics.ts`). Laboratorium cząstek: masy rezonansów
(PDG) i metoda histogramu masy niezmienniczej są prawdziwe, ale zbiór
zderzeń pozostał syntetyczny — `opendata.cern.ch` był niedostępny z
ówczesnej sieci deweloperskiej (HTTP 403); punkt podpięcia realnych danych
CMS (CC0) istnieje (`data/dimuon-real.ts`), ale nikt jeszcze go nie
wypełnił. Szczegóły: `RAPORT-ETAP-2.md`.

## Etap 1 — rozwój istniejących laboratoriów

Framework wielu eksperymentów na laboratorium (`ExperimentDef`), 9 nowych
symulacji fizycznych, orbitale atomowe, presety multiwersum. Żadnych
nowych laboratoriów — pogłębienie istniejących dziesięciu. Szczegóły:
`RAPORT-ETAP-1.md`.

## Etap 0 — fundament

Architektura pluginowa (`LabDefinition`/`registry.ts`), Scale Journey,
10 laboratoriów z pierwszymi symulacjami, deterministyczny Narrator AI,
etykiety uczciwości naukowej. Szczegóły: `RAPORT-ETAP-0.md`.
