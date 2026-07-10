# Vision Backlog

Duży katalog pomysłów na przyszłość Genesis OS — **NIE lista zadań do
wykonania po kolei**. Zgodnie z zasadą „wielka wizja, mała, zdyscyplinowana
realizacja": ten dokument istnieje, żeby żaden dobry pomysł się nie zgubił,
ale w każdej sesji wdraża się 1–2 pozycje, nie próbuje się wszystkiego
naraz. Priorytet wybiera się na podstawie testu WOW (`Czy użytkownik pokaże
to znajomym? Czy nauczyciel poprowadzi na tym lekcję?`), realizmu
naukowego i tego, ile PRAWDZIWEJ, już istniejącej architektury (`Sim`,
`Sim3D`, `DataSource`, `Citation`, `NarrationBlock`) można ponownie użyć —
nie na podstawie tego, co jest najbardziej efektowne na papierze.

Każda pozycja ma tag pewności naukowej (skala z `knowledge/README.md`) i
orientacyjny koszt/wartość. ✅ = zaimplementowane w Genesis OS. Pozycje bez
✅ to WYŁĄCZNIE pomysły — patrz „Zasada" w `README.md`/`CLAUDE.md`: nie
buduje się atrap.

Legenda pewności: ★★★★★ potwierdzona · ★★★★ potwierdzona (konsensus) ·
★★★ częściowo potwierdzona · ★★ hipoteza · ★ spekulacja · ☆ science fiction.

---

## Flagowe pomysły — najwyższy potencjał, wymagają wielu sesji

Dwie pozycje wyróżnione z reszty listy: nie są "kolejną funkcją do
dorzucenia", tylko wieloetapowymi projektami, które same w sobie mogłyby
stać się rozpoznawalnym elementem Genesis OS. Rozpisane szerzej niż reszta
backlogu celowo — żeby następna sesja, która się za nie weźmie, miała
gotowy plan fazowania, a nie tylko hasło.

### Discovery Timeline Engine — ✅ ZBUDOWANE (Fazy 1+2+3; Faza 4 w backlogu)

Jedna, ciągła podróż przez 15 epok od Wielkiego Wybuchu do dalekiej
przyszłości Wszechświata (`data/timeline.ts`), z niezależną soczewką skali
(kwark → obserwowalny Wszechświat), bez przeładowań ekranu — drugi, obok
siatki kart, tryb wejścia do Genesis OS, pod `#/timeline`. Zbudowane w
całości w jednej sesji, po tym jak wszystkie 9 istniejących laboratoriów
osiągnęło poziom "world-class" (governing rule tej sesji).

Uczciwość naukowa: każda epoka niesie jawny `ConfirmationLevel` (ta sama
6-stopniowa skala co cytowania wszędzie indziej) — rekombinacja/CMB
★★★★★, daleka przyszłość ★★ (hipoteza). Zero nowej taksonomii.

**Co zbudowano** (okazało się szybsze niż pierwotne fazowanie zakładało):
1. ✅ Oś czasu (suwak logarytmiczny + Narrator per epoka, pełne sterowanie:
   pauza/przewijanie/przyspieszanie/skok do dowolnej z 15 epok) —
   `core/logSlider.ts` (wydzielone ze ScaleJourney), `core/timelineMath.ts`
   (cross-fade między sąsiednimi epokami, zero ekranów ładowania).
2. ✅ Most do laboratoriów — `core/scenarioBridge.ts` ROZSZERZONY o
   opcjonalny `experimentId` (trzeci konsument po „Co by było, gdyby?" i
   Multiverse Nexus), trafia teraz w KONKRETNY eksperyment (np. epoka
   „Układ Słoneczny" → zakładka „Prawdziwy Układ Słoneczny", nie bazowa).
3. ✅ Płynny zoom międzyskalowy — okazał się BEZPOŚREDNIO reużywalny z
   istniejącego mechanizmu Scale Journey (`data/scaleMilestones.ts`,
   wydzielone i współdzielone), nie wymagał osobnego systemu LOD/kamery
   jak pierwotnie zakładano. Niezależna oś, zawsze dostępna, punkt
   startowy ustawiany przez charakterystyczną skalę bieżącej epoki.
4. **Backlog (NIE zbudowane)**: sceny 3D dla wybranych epok (dziś: 15
   ręcznie zaprojektowanych scen Canvas 2D w
   `components/discoveryTimelineScenes.ts`) — kolejny konsument `Sim3D`,
   analogicznie do Układu Słonecznego 3D czy Czarnej dziury 3D. Zapisywanie
   /udostępnianie własnej „podróży" przez oś czasu.

Zweryfikowane: typecheck, lint, 219 testów (19 nowych: `logSlider.test.ts`,
`timelineMath.test.ts` — w tym integralność 15 epok, i 2 nowe testy
`scenarioBridge.test.ts` dla `experimentId`), build, Playwright (skoki
między 7 epokami, autoodtwarzanie, ręczny zoom, pełny most do laboratorium
z potwierdzeniem właściwej zakładki) — zero błędów konsoli.

### Frontier Science Lab (nowa kategoria — zagadki i granice wiedzy)

Jedenaste laboratorium (dziś: Universe, Space-Time, Einstein, Quantum, Atom,
Nuclear, Particle, Multiverse, Civilization, AI Discovery), celowo
zaplanowane na PO osiągnięciu przez istniejące laby światowego poziomu
wykonania — nie teraz. Silniejsza koncepcja niż pojedynczy kontrowersyjny
temat: całe laboratorium poświęcone granicy między nauką ugruntowaną,
aktywnymi badaniami, historycznymi zagadkami i inspiracją fikcyjną,
eksplorowane przez dowody i konkurujące hipotezy — NIE przez przekonywanie.

Scenariusze (każdy jako osobny eksperyment w tym labie, ten sam wzorzec co
`ExperimentDef` wszędzie indziej): Eksperyment Filadelfia (legenda i jej
udokumentowane pochodzenie — USS Eldridge, badania Townsenda Browna nad
efektem Biefelda-Browna, brak jakichkolwiek akt marynarki potwierdzających
wydarzenie), Paradoks Fermiego, sygnał WOW!, ciemna materia, ciemna energia
(obie już częściowo pokryte w Universe/Multiverse Lab — tu: pogłębione,
zestawienie konkurencyjnych modeli), mosty Einsteina-Rosena, napęd
Alcubierre'a (oba już wspomniane w Einstein Lab jako hipotezy — tu:
rozwinięte studium przypadku), rój Dysona (już w Civilization Lab —
tu: historia pomysłu Dysona 1960 + przegląd wyników poszukiwań),
Oumuamua, Zdarzenie Tunguskie, kwantowy eksperyment z opóźnionym wyborem
(rozszerzenie Quantum Lab), nierówności Bella (już zaimplementowane jako
CHSH w Quantum Lab — tu: kontekst historyczny/filozoficzny), kot
Schrödingera (eksperyment myślowy, nie symulacja fizyczna), problem trzech
ciał (patrz osobna pozycja niżej — może żyć w obu miejscach: fizyka w
laboratorium fizyki, kontekst "dlaczego to fascynuje ludzi" tutaj),
hipoteza symulacji (jako filozofia, jawnie NIE jako twierdzenie fizyczne).

**Kluczowa decyzja projektowa do rozstrzygnięcia PRZED implementacją:**
użytkownik poprosił o pięć kategorii scenariusza (Established Science /
Active Scientific Research / Theoretical Physics / Historical Mystery /
Fictional Inspiration) — to inna oś niż istniejący sześciostopniowy
`ConfirmationLevel` (core/citation.ts), który mierzy STOPIEŃ potwierdzenia,
nie RODZAJ twierdzenia. Rekomendacja: nie budować równoległej taksonomii.
Dodać jedno nowe, opcjonalne pole `ScenarioKind` obok istniejącego
`ConfirmationLevel` (scenariusz może być jednocześnie np. "Historical
Mystery" I "★★ hipoteza" — te dwie osie się nie wykluczają, opisują różne
rzeczy). Prościej niż wygląda: to dokładnie ten sam wzorzec co dodanie
`HonestyLevel` obok `ConfirmationLevel` wcześniej w projekcie — dwie
uzupełniające się skale, nie konkurencyjne.

Reużywalna architektura (zero nowego systemu): `ExperimentDef.narrate()` z
`citation` na każdym bloku (już wspiera "link do prawdziwej publikacji, gdy
dostępny" — dokładnie to, o co poproszono), `HonestyBadge`/`ConfirmationLevel`
dla wskaźnika pewności, `askAI()` ugruntowany w nowym
`knowledge/frontier-science.md` dla „AI Mentor wyjaśniającego wiele punktów
widzenia" (to już jest dokładnie to, do czego służy warstwa 1 Narratora —
żaden nowy mechanizm AI). Wizualizacja: `Sim` (2D) domyślnie, `Sim3D` tam,
gdzie uzasadnione (np. Oumuamua — prawdziwa, ekscentryczna trajektoria
hiperboliczna, dokładna fizyka orbitalna już mamy w `core/physics.ts`).

Ryzyko do zarządzania: to lab, w którym najłatwiej o utratę wiarygodności
całej platformy, jeśli granica model/hipoteza/legenda się zatrze choćby raz.
Każdy pojedynczy scenariusz wymaga tego samego poziomu researchu co
`knowledge/*.md` dla istniejących labów — nie da się tego zrobić płytko.

### Trzy Ciała — od wykresu do laboratorium (★★★★★ chaos deterministyczny) — ✅ ZBUDOWANY PIERWSZY KROK

**Status: zbudowany "realistyczny pierwszy krok" opisany niżej** —
`labs/experiments/universe-threebody.ts`, Universe Lab. Integrator
velocity-Verlet symplektyczny z ADAPTACYJNYM krokiem (maleje przy bliskich
przejściach — bez tego stałokrokowy integrator traci energię w problemie
pitagorejskim), dwa realne układy startowe (ósemka Moore/Chenciner–Montgomery,
problem pitagorejski Burrau 1913), tryb "dwa niemal identyczne starty" (10⁻⁶
przesunięcia) pokazujący dywergencję na żywo z liczbowym odczytem odległości.
10 nowych testów (`universeThreeBody.test.ts`): zachowanie energii
długoterminowo dla obu układów (w tym przez bliskie przejście w problemie
pitagorejskim), powrót ósemki do startu po jednym okresie T≈6.326, wykładniczy
wzrost separacji >1000× po mikroskopijnym przesunięciu. Zweryfikowane
Playwrightem: oba presety, przełączanie, tryb dywergencji z rosnącym
odczytem — zero błędów konsoli.

Backlog na przyszłość (NIE zbudowane, patrz punkty niżej): tysiące cząstek
z GPU instancingiem, zapis/udostępnianie własnego układu, AI analizujące
punkty chaosu (rozszerzenie `core/experimentAnalysis.ts`).

Pełny oryginalny opis (rozszerzenie prostego "pokaż orbity trzech ciał" w
pełne, interaktywne laboratorium dynamiki chaotycznej z tysiącami cząstek):
- Tysiące cząstek / świecące trajektorie — wydajnościowo wymaga
  `THREE.Points` z GPU instancingiem, nie osobnych obiektów per cząstka
  (patrz „Performance" niżej).
- Użytkownik komponuje własny układ (masy, prędkości początkowe) —
  reużywa dokładnie wzorca `core/customExperiment.ts` (zapis presetu
  parametrów), nie nowego systemu.
- Zapisywanie i udostępnianie innym — wymaga backendu z kontem (patrz
  `ARCHITECTURE.md` „Przyszły backend"), świadomie odłożone do tego czasu.
- AI analizuje stabilność i wskazuje punkty chaosu — naturalne rozszerzenie
  `core/experimentAnalysis.ts` (już wykrywa skoki/korelacje w przebiegu;
  "wykładniczy rozjazd dwóch niemal identycznych startów" to kolejna,
  policzalna metryka w tym samym module, nie nowy silnik AI).

Realistyczny pierwszy krok (osiągalny w jednej sesji): 2D silnik N-ciał z
integracją symplektyczną (zachowuje energię długoterminowo, w
przeciwieństwie do zwykłego Eulera) + tryb "dwa niemal identyczne starty"
pokazujący dywergencję na żywo — to samo dydaktyczne jądro, bez czekania na
tysiące cząstek czy współdzielenie.

### Quantum Decision Explorer — ✅ ZBUDOWANE (dawniej: "osobisty multiwersum decyzji") — narzędzie narracyjne, NIE fizyka

Pomysł oceniony (przez użytkownika, po przejrzeniu pierwotnej koncepcji):
warstwa wizualna jest bardzo mocna, ale pierwotne sformułowania ("portal do
Akaszy", "świat optymalny, gdyby zawsze słuchał intuicji", liczby 111/444
jako podstawa działania) przedstawiają nauko-podobne twierdzenia bez
pokrycia — dokładnie to, przed czym cała reszta Genesis OS się broni. Jeśli
platforma ma budować wiarygodność na poziomie NASA/uczelni, ten moduł NIE
może brzmieć jak przepowiadanie przyszłości ani ezoteryka.

**Co zostaje (świetne, zachować):**
- Galaktyka zbudowana z decyzji użytkownika — każda gwiazda to jeden ważny
  wybór życiowy, wizualnie spektakularne, naturalny konsument techniki
  cząstek/gwiazd już dopracowanej w tej sesji (universe.ts, civilization.ts)
- Suwak "zmień decyzję → obserwuj, jak zmienia się cała struktura" — świetna
  interakcja, koncepcyjnie bliska suwakowi Discovery Timeline (zmiana jednej
  zmiennej przegenerowuje całą wizualizację na żywo)
- Spersonalizowany film/zwiastun 4K jako element marketingowy — osobny
  temat produkcyjny (rendering offline, nie runtime), do rozważenia niezależnie

**Co się zmienia (wymagane PRZED jakąkolwiek implementacją):**
- Nazwa: "Quantum Decision Explorer" (albo podobna, jawnie neutralna) —
  nie "multiwersum" bez przymiotnika, żeby nie sugerować związku z
  interpretacją wielu światów Everetta (Multiverse Lab już to poprawnie
  odróżnia — ten moduł musi trzymać tę samą granicę)
- Zero numerologii (111, 444 itp.) jako "mechanizmu działania" — to nie ma
  żadnego pokrycia naukowego, w Genesis OS nie ma dla tego miejsca
  jako rzekomej podstawy jakiegokolwiek algorytmu
- Zero języka duchowego/ezoterycznego ("Akasza", "intuicja jako źródło
  optymalnej ścieżki") przedstawianego jako mechanizm, nie metafora
- Obowiązkowy, stały komunikat AI/UI (wzorem `honestyNote` każdego innego
  modułu): *"To interaktywna symulacja alternatywnych scenariuszy oparta na
  modelowaniu decyzji i wizualnych inspiracjach z fizyki. Nie przewiduje
  przyszłości ani nie odtwarza rzeczywistości."* — analogicznie do
  `honesty: 'theoretical'` używanego już w Multiverse/Civilization Lab,
  tylko tu jeszcze wyraźniej: to narzędzie narracyjne/refleksyjne, nie
  model fizyczny nawet w przybliżeniu

**Architektura (reużywalna, zero nowego systemu):**
- Struktura danych "decyzja → gałąź" to ten sam wzorzec co
  `core/customExperiment.ts` (zapis presetu parametrów użytkownika) +
  drzewo/graf, nie nowy silnik
- Wizualizacja gwiazd/galaktyki: `Sim` (Canvas 2D) z technikami już
  sprawdzonymi w tej sesji (starfield, gradient, glow sterowany realnymi
  danymi — tu: "waga" decyzji, nie ozdoba)
- Suwak zmiany decyzji: dokładnie `core/logSlider.ts`-owy wzorzec
  target/current lerp, tylko oś to indeks/waga decyzji, nie skala czy czas
- `HonestyBadge`/nowy jawny disclaimer zamiast `ConfirmationLevel` — to
  jedyny moduł w Genesis OS, który nie twierdzi NIC naukowego, więc
  potrzebuje własnej, jeszcze prostszej etykiety ("narzędzie refleksyjne",
  nie punkt na skali potwierdzenia)

**Status: zbudowane** (`components/QuantumDecisionExplorer.tsx`,
`core/decisionExplorer.ts`, `#/decision-explorer`). Wszystkie punkty z
"co się zmienia" zrealizowane dosłownie: nazwa neutralna, zero numerologii,
zero języka duchowego, stały niedomykalny baner z dokładnie tym tekstem,
jaki użytkownik podał. Architektura zgodna z powyższym planem: dane w
localStorage (`core/storage.ts`), geometria spirali oparta na kącie złotym
(phyllotaxis — ta sama technika co węzły sieci energetycznej w
`civilization.ts`), suwak liniowy po indeksie decyzji z płynnym
podświetleniem aktywnej gwiazdy, `NarratorPanel`/`askAI` ugruntowany w
nowym `knowledge/quantum-decision-explorer.md` (jawnie instruuje AI, by
nigdy nie sugerowało przewidywania). 12 nowych testów
(`decisionExplorer.test.ts`: sanityzacja, CRUD, sortowanie chronologiczne,
geometria `galaxyPosition`). Zweryfikowane Playwrightem: dodawanie,
edycja, usuwanie decyzji i przewijanie osi czasu — struktura galaktyki i
widoczne odgałęzienia zmieniają się na żywo, zero błędów konsoli.

Backlog na przyszłość (NIE zbudowane): spersonalizowany film/zwiastun 4K
(osobny temat produkcyjny, rendering offline).

---

## Quantum Reality

- ✅ Superpozycja i interferencja — Quantum Lab, dwie szczeliny (★★★★★)
- ✅ Splątanie kwantowe + test Bella (CHSH) — Quantum Lab (★★★★★, Nobel 2022)
- ✅ Sfera Blocha (stan kubitu) — Quantum Lab → `quantum-bloch.ts` (★★★★★)
- ✅ Tunelowanie kwantowe — Quantum Lab, silnik FFT równania Schrödingera (★★★★★)
- ✅ Dekoherencja — narracja w double-slit (pomiar niszczy interferencję) (★★★★★)
- **Bramki kwantowe / mini-komputer kwantowy** (★★★★★, model dydaktyczny) —
  wizualny „obwód" (Hadamard, CNOT, Pauli-X/Y/Z) działający na sferze
  Blocha, którą już mamy; naturalne rozszerzenie `quantum-bloch.ts`, nie
  nowy eksperyment od zera. Wysoka wartość edukacyjna (IBM Quantum
  Composer to najbliższy odpowiednik, ale bez Narratora tłumaczącego).
- **Teleportacja kwantowa** (★★★★★, protokół potwierdzony eksperymentalnie
  od 1997) — wymaga symulacji 2-kubitowego stanu splątanego + pomiaru w
  bazie Bella; wyraźnie oznaczyć, że TRANSMITOWANA jest informacja o
  stanie, nie materia (częsty błąd popularnonaukowy do naprawienia).
- **Eksperyment myślowy Schrödingera (kot)** (★★★★★ jako ilustracja
  problemu pomiaru, ☆ jeśli przedstawiony dosłownie) — NIE symulacja
  fizyczna kota, tylko interaktywne wyjaśnienie problemu pomiaru/interpretacji
  kwantowej, powiązane z istniejącym CHSH i dekoherencją.
- **Funkcja falowa 2D/3D w czasie rzeczywistym** (★★★★★) — silnik FFT z
  `quantum-tunneling.ts` już istnieje; rozszerzenie do 2D (cząstka w studni
  potencjału, oscylator harmoniczny) to głównie koszt UI, nie nowej fizyki.

## Multiverse / nawigacja (nowa kategoria, poza pierwotną listą)

- ✅ **Multiverse Nexus** — Multiverse Lab → `multiverse-nexus.ts`, sala
  portali w 3D (oryginalna metafora, nie kopia żadnego filmu/serialu):
  portale „lokalne" (inne stałe fizyczne) i portale-tunele, które NAPRAWDĘ
  przenoszą do innego laboratorium przez `core/scenarioBridge.ts` — ten sam
  most co „Co by było, gdyby?" (dwa wejścia UI, jeden mechanizm).
- **Więcej tuneli w Nexusie** (tani przyrost) — każdy nowy wpis w
  `WHAT_IF_SCENARIOS` może natychmiast stać się kolejnym portalem-tunelem
  bez nowego kodu silnika, tylko nowy obiekt `WormholePortal`.
- **Nexus jako uniwersalny hub startowy** (większa decyzja produktowa) —
  dziś portal-hub istnieje wyłącznie wewnątrz Multiverse Lab; docelowo
  mógłby zastąpić/uzupełnić siatkę kart na ekranie głównym jako
  alternatywny, przestrzenny sposób nawigacji po WSZYSTKICH laboratoriach.
  Świadomie nie robić tego pochopnie — siatka kart jest dziś dostępna i
  szybka (SEO, dostępność, czas ładowania); hub 3D jako JEDYNA nawigacja
  byłby regresją dla części użytkowników.

## Higher Dimensions

- ✅ **Tesserakt 4D** — Multiverse Lab → `multiverse-tesseract.ts`,
  obrót w płaszczyźnie 4D + rzut perspektywiczny (★★★★★ matematyka
  dokładna; jednoznacznie odróżnione od spekulacji fizycznej o
  dodatkowych wymiarach)
- **5-komórka / inne politopy regularne 4D** (★★★★★) — ten sam silnik
  (`rotate4D`/`project4Dto3D`) co tesserakt, inny zestaw wierzchołków/krawędzi.
  Bardzo tani przyrostowo.
- **Przekroje 4D→3D (nie tylko rzut)** (★★★★★) — pokazanie tesseraktu jako
  serii przekrojów 3D w miarę „przesuwania" hiperpłaszczyzny wzdłuż w —
  inna, komplementarna technika wizualizacji do rzutu.
- **11-wymiarowa teoria strun jako KONTEKST, nie symulacja** (★ spekulacja,
  wyraźnie oznaczona) — krótki, uczciwy tekst w Narratorze przy okazji
  tesseraktu: czym różni się matematyczna zabawa z 4D od fizycznej hipotezy
  dodatkowych wymiarów zwiniętych w skali Plancka. Zero nowego kodu.

## Space-Time

- ✅ Dylatacja czasu, paradoks bliźniąt — Space-Time Lab (★★★★★)
- ✅ Soczewkowanie grawitacyjne — Einstein Lab → `einstein-lensing.ts` (★★★★★)
- ✅ Czarna dziura Schwarzschilda: geodezyjne fotonów + dysk akrecyjny —
  Einstein Lab → `einstein-geodesics.ts` (★★★★★, pełne równanie geodezyjnej)
- ✅ Metryka Kerra (wirująca czarna dziura) — Einstein Lab, poglądowo (★★★★)
- ✅ Fale grawitacyjne — opisane w `knowledge/universe.md` (GW150914), brak
  jeszcze dedykowanej symulacji chirp — dobry kandydat na osobny eksperyment
- **Most Einsteina–Rosena (tunel czasoprzestrzenny)** (★★ hipoteza — matematycznie
  dopuszczalne rozwiązanie równań Einsteina, ale wymaga egzotycznej materii
  o ujemnej gęstości energii, nieznanej eksperymentalnie; NIGDY nie
  przedstawiać jako działającą technologię, tylko jako geometrię) —
  naturalne rozszerzenie Einstein Lab, reużywa `Sim3D` z Układu Słonecznego
  3D (osadzenie Fleminga: powierzchnia w 3D reprezentująca zakrzywienie 2D
  przestrzeni — klasyczna, uczciwie oznaczona wizualizacja podręcznikowa).
- **Geodezyjne Kerra w 3D + soczewkowanie w stylu „Interstellar"**
  (★★★★★ fizyka, ★★★★ dokładność renderowania) — rozszerzenie istniejącego
  `einstein-geodesics.ts` na `Sim3D`, ten sam wzorzec co Układ Słoneczny 3D.
  **Rekomendacja: to naturalny kandydat na następną sesję 3D.**
- ✅ **Chirp fali grawitacyjnej (dźwięk + wykres)** — `einstein-chirp.ts`,
  Einstein Lab. Formuła kwadrupolowa wiodącego rzędu (masa ćwierkowa,
  czas do połączenia, granica ISCO), dźwięk syntezowany Web Audio API z
  PRAWDZIWEJ, żywo liczonej częstotliwości fali (nie plik audio GW150914 —
  to zostaje w backlogu jako wzbogacenie). 7 nowych testów fizyki: masa
  ćwierkowa dla równych mas (relacja dokładna ℳ=m/2^0,2), odwracalność
  chirpFrequency/timeToMerger, separacja orbitalna przy ISCO = dokładnie
  6GM/c² (ten sam promień co geodezyjne Schwarzschilda).

## Cosmology

- ✅ Ekspansja Wszechświata (równanie Friedmanna) — Universe Lab (★★★★★)
- ✅ Ciemna energia (Ω_Λ), teraz też jako scenariusz „Co by było, gdyby" (★★★★)
- ✅ Śmierć/życie gwiazd — Universe Lab → `universe-starlife.ts` (★★★★★)
- ✅ Zderzenia galaktyk — Universe Lab → `universe-collision.ts` (★★★★, model N-ciał uproszczony)
- **Wielki Wybuch i inflacja kosmiczna jako oś czasu** (★★★★ model standardowy,
  ★★★ szczegóły inflacji) — interaktywna oś czasu Wszechświata (10⁻⁴³s →
  dziś) z Narratorem tłumaczącym każdą epokę; dane/skale z Planck 2018.
- ✅ **Ciemna materia — krzywa rotacji galaktyki** — `universe-rotationcurve.ts`,
  Universe Lab. Suwak masy halo (model pseudo-izotermiczny, Begeman 1989)
  vs krzywa Newtona z samej widocznej masy (dysk wykładniczy, Freeman 1970).
  BONUS ponad pierwotny zakres: przełącznik MOND (Milgrom 1983) — ta sama
  płaska krzywa bez żadnej ciemnej materii, tylko modyfikacją prawa
  grawitacji przy małych przyspieszeniach (relacja Tully'ego–Fishera,
  v∞=(GMa0)^¼). Obie strony realnego, nierozstrzygniętego sporu
  kosmologicznego pokazane uczciwie w jednym eksperymencie. 6 nowych testów
  fizyki (`physics.test.ts`): monotoniczność masy dysku, spadek Keplerowski
  bez halo, spłaszczenie z halo izotermicznym, granice MOND (słabe/silne
  pole), zbieżność do relacji Tully'ego–Fishera.
- **Napięcie Hubble'a (Hubble tension)** (★★★ spór aktywny, już opisany w
  `knowledge/universe.md`) — brak jeszcze interaktywnej wizualizacji dwóch
  konkurencyjnych pomiarów H₀.

## Nanotechnology

- **Grafen / nanorurki / fulereny 3D** (★★★★★ struktury zmierzone) —
  modele siatki heksagonalnej węgla przez `Sim3D` (analogiczne do
  cząsteczek w sekcji Biologia niżej); realne stałe sieci krystalicznej.
- **Samoorganizacja materiałów** (★★★★ zjawisko potwierdzone, model uproszczony)
  — symulacja cząstek z regułami przyciągania/odpychania układających się
  w strukturę (podobny silnik do `nuclear-chain.ts`, inny zestaw reguł).
- **Właściwości materiału ze struktury** (★★★★★) — np. dlaczego grafen
  przewodzi (struktura pasmowa uproszczona) — bardziej treść Narratora niż
  nowa symulacja.

## Chemistry (nowe laboratorium — pierwszy eksperyment zbudowany)

- ✅ **Wiązania chemiczne** — Chemistry Lab → `labs/chemistry.ts` +
  `core/physics.ts::bondPolarity`. Elektroujemność Paulinga (dane
  tabelaryczne, CRC Handbook) steruje CIĄGŁĄ wizualizacją chmury
  elektronowej od kowalencyjnej po jonową (wzór Hanney–Smitha) — nie
  przełącznikiem trzech stanów. Domyślna para Na–Cl.
- ✅ **Geometria molekularna VSEPR w 3D** — `chemistry-vsepr.ts`, Chemistry
  Lab. Model kulki-i-pałeczki (`Sim3D`), 13 standardowych geometrii AX₂
  do AX₆E₂. Geometrie bez wolnych par: dokładna geometria bryły
  (np. tetraedr 109,47°). NH₃/H₂O: kąty PRAWDZIWE zmierzone (106,8°/104,5°,
  NIST/CCCBDB), geometria dopasowana wstecz do pomiaru. 10 nowych testów:
  spójność liczby wektorów, wektory jednostkowe, dokładne kąty (tetraedr,
  oktaedr 90°/180°, NH₃, H₂O<NH₃), funkcja `bentCone` dla dowolnego kąta.
- **Krzywe miareczkowania kwas–zasada (pH)** (★★★★★ chemia analityczna) —
  ilościowo bogaty temat, dobry materiał na Narratora.
- ✅ **Trendy okresowe** (promień atomowy, energia jonizacji) — zbudowane
  w Atom Lab (`data/periodicTrends.ts`, nowa zakładka „Trendy okresowe"),
  jako mapa cieplna na reużytej siatce `.ptable` — nie osobny wykres.
  Okresy 1–4 (Z=1–36), CRC Handbook / NIST ASD / Slater (1964). 10 nowych
  testów: spójność danych, trend Z_eff wzdłuż okresu 2, trend w dół grupy 1,
  anomalie IE (gazy szlachetne > sąsiedzi).

## Biology & Molecular Science

- **DNA — podwójna helisa 3D** (★★★★★, struktura Watson-Crick 1953) —
  `Sim3D`, parametry rzeczywiste (skok helisy 3,4 nm, 10,5 pary zasad/skręt).
  Bardzo wysoki potencjał WOW dla widzów spoza fizyki (biologia/medycyna).
- **Fałdowanie białka (uproszczone)** (★★★ aktywny obszar badań —
  AlphaFold to real ML, nie fizyka analityczna; NASZ model musiałby być
  jawnie dydaktyczny, np. energetyczny model sieciowy HP, nie prawdziwe
  fałdowanie) — wymaga bardzo starannego oznaczenia granic modelu.
- **Membrana komórkowa i transport** (★★★★, model płynnej mozaiki) —
  cząsteczki przechodzące przez kanały białkowe, dobry temat dla `Sim`
  (cząsteczkowy silnik podobny do `nuclear-chain.ts`).
- **Pochodzenie życia (abiogeneza)** (★★ aktywny obszar badań, wysoka
  niepewność) — NIE symulacja „jak powstało życie" (nikt tego nie wie), ale
  uczciwy przegląd konkurencyjnych hipotez (świat RNA, kominy hydrotermalne,
  panspermia) z jasnym oznaczeniem statusu każdej.

## Mathematics (sandbox równań użytkownika)

- **Edytor równań + AI sprawdzające spójność** (nowa architektura) —
  naturalne rozszerzenie „Stwórz eksperyment" (`core/customExperiment.ts`):
  zamiast tylko suwaków, użytkownik wpisuje wyrażenie matematyczne
  (parser + bezpieczny evaluator, NIE `eval()` — biblioteka typu mathjs
  w trybie sandboxed), aplikacja rysuje wykres/pole wektorowe, AI (przez
  ISTNIEJĄCY `askAI()`) komentuje własności (ciągłość, symetrie,
  osobliwości). Bezpieczne przez konstrukcję jak reszta platformy: parser
  wyrażeń matematycznych, nie interpreter ogólnego kodu.
- **Współpraca wielu użytkowników nad modelem** — wymaga kont/backendu
  (patrz `ARCHITECTURE.md` „Przyszły backend"), świadomie odłożone.

## Grand Challenges

- ✅ **Problem trzech ciał** — patrz sekcja „Flagowe pomysły" wyżej,
  `universe-threebody.ts`. Zbudowany realistyczny pierwszy krok (symplektyczny
  integrator + tryb dywergencji); tysiące cząstek/GPU/zapis nadal w backlogu.
- **Stabilność układów planetarnych** (★★★★★) — rozszerzenie Układu
  Słonecznego (2D i 3D): usuń/dodaj planetę, obserwuj rezonanse orbitalne
  i niestabilności w długim czasie — reużywa `keplerPosition`.
- ✅ **Chaos deterministyczny: podwójne wahadło** — `universe-doublependulum.ts`,
  Universe Lab. Dokładne równania Lagrange'a, integracja RK4 (celowo NIE
  symplektyczna — kontrast uczciwie nazwany wobec problemu trzech ciał).
  Suwak kąta startowego pokazuje przejście z ruchu regularnego (<~35°) do
  chaotycznego; tryb dywergencji (10⁻⁶ rad) jak w problemie trzech ciał.
  6 nowych testów: energia w spoczynku, zachowanie energii przy małym
  kącie, determinizm RK4, szybszy rozjazd przy dużym kącie niż małym.
  Backlog na przyszłość (NIE zbudowane): atraktor Lorenza.
- **Przejścia fazowe i łamanie symetrii** (★★★★★ zjawisko, model Isinga
  ★★★★ dydaktyczny) — siatka spinów zmieniająca stan przy krytycznej
  temperaturze; ten sam silnik cząsteczkowy co reakcja łańcuchowa.
- ✅ (częściowo) Ewolucja Wszechświata — Universe Lab; kosmiczna oś czasu
  (patrz Cosmology wyżej) dopełniłaby to od strony chronologicznej.

## Creator Platform / Marketplace / Founder Mode

Wszystko poniżej wymaga kont i bazy danych — fundamentu opisanego w
`ARCHITECTURE.md` „Przyszły backend — punkty rozszerzenia", którego dziś
świadomie nie ma. Kolejność zależności, nie wybór priorytetów:

- **Publikowanie eksperymentów** — rozszerzenie `core/customExperiment.ts`
  o zdalny zapis (`{ labId, params }`, ten sam kształt co lokalnie).
- **Ocenianie/ranking** — prosta tabela `experiment_ratings` nad tym samym
  modelem danych.
- **Publikowanie własnych laboratoriów/światów** — NAJPOWAŻNIEJSZA pozycja
  na całej liście z punktu widzenia bezpieczeństwa: wymaga wykonywania
  kodu użytkownika (albo bardzo ograniczonego DSL). Świadomie nierozwiązane
  architektonicznie tutaj — wymaga osobnej analizy zagrożeń (sandboxing,
  poziom uprawnień, przegląd przed publikacją) PRZED jakąkolwiek linią kodu.
- **Marketplace z prowizją** — decyzja biznesowa (płatności, podatki,
  regulaminy) w pierwszej kolejności, architektura w drugiej.
- **Founder Mode (panel administracyjny)** — osobna rola nad kontami;
  konkretne funkcje (edycja `knowledge/*.md` bez redeployu, agregowane
  statystyki, feature flagi nad `registerLab()`) już naszkicowane w
  `ARCHITECTURE.md`.

## Premium Experience / Living Universe / Długoterminowo

- ✅ Design system v2, sceny 3D, „Co by było, gdyby?" — patrz `CHANGELOG.md`
- **Subtelna, żywa ambient-animacja tła** (gwiazdy migoczące, mgławice na
  ekranie głównym) — czysto kosmetyczne, ale tanie (rozszerzenie
  `ScaleJourney.tsx`, które już ma starfield); pilnować testu „każdy efekt
  ma pomagać zrozumieć fizykę, nie tylko ładnie wyglądać" — migoczące
  gwiazdy w tle ekranu głównego są OK jako nastrój, nie jako substytut
  prawdziwej treści.
- **VR/AR/XR** (★★★★★ technicznie osiągalne, brak dziś sprzętu do testów)
  — `Sim3D`/Three.js to WŁAŚNIWY fundament (WebXR API rozszerza
  `WebGLRenderer`, nie wymaga nowej architektury symulacji) — ale realna
  implementacja wymaga sprzętu do weryfikacji, nie tylko kodu za biurkiem.
- **AI Agents / AI Professor** — patrz `ARCHITECTURE.md` „Wizja platformy".
- **Wielu użytkowników jednocześnie / wspólne laboratoria** — wymaga
  WebSocket/realtime warstwy nad przyszłym backendem; nie projektować
  szczegółowo, dopóki nie istnieje warstwa kont.
- **Integracje z publicznymi bazami danych naukowych** — `core/dataSource.ts`
  już jest dokładnie tym punktem podpięcia (patrz `scripts/fetch-real-data.mjs`
  dla JPL/Gaia/CERN); rozszerzenie na PubChem/CCCBDB (chemia) czy GWOSC
  (fale grawitacyjne) to ten sam wzorzec, nowe źródła.

---

## Jak korzystać z tego dokumentu

1. Na początku sesji poświęconej nowym funkcjom: przejrzyj tę listę,
   wybierz 1–2 pozycje o najwyższym stosunku (efekt WOW × realizm naukowy
   × ponowne użycie istniejącej architektury) / (koszt implementacji).
2. Zaimplementuj w pełni (kod + testy + Playwright + dokumentacja),
   zamiast zaczynać wiele rzeczy naraz.
3. Oznacz ✅ i przenieś szczegóły do `CHANGELOG.md`/`ARCHITECTURE.md`.
4. Dopisz nowe pomysły tutaj, gdy się pojawią — backlog ma rosnąć wolniej
   niż lista ukończonych funkcji, nie szybciej.
