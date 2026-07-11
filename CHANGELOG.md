# Changelog

Format luźno wzorowany na [Keep a Changelog](https://keepachangelog.com/).
Pełne raporty z uzasadnieniami decyzji: `RAPORT-ETAP-0.md` ·
`RAPORT-ETAP-1.md` · `RAPORT-ETAP-2.md` · `RAPORT-AUDYT.md`.

## [Unreleased]

## [1.0.0] - 2026-07-11

Pierwsze wydanie oznaczone jako gotowe produkcyjnie. Wszystko poniżej i we
wcześniejszych wpisach tego dokumentu składa się na tę wersję — 13
laboratoriów, dwuwarstwowy Narrator AI, Discovery Timeline, Quantum
Decision Explorer, pełna dostępność i PWA offline, oraz finalny przebieg
domykający ("release-candidate gap closure"): replay wprowadzenia z
Ustawień, utwardzenie konfiguracji Narratora AI w produkcji, jawniejsze
rozróżnienie realnych wzorów od syntetycznych danych w Particle Lab,
i utwardzenie inicjalizacji Web Audio pod Safari/iOS.

### Poprawiono (Domknięcie luk v1.0 — replay wprowadzenia, wersjonowanie, utwardzenie AI/audio, przejrzystość Particle Lab)
- **Replay wprowadzenia z Ustawień** — nowa sekcja „Wprowadzenie" w
  `SettingsScreen` (przycisk „🔁 Pokaż wprowadzenie ponownie") woła
  dokładnie ten sam `OnboardingOverlay` co pierwsze uruchomienie (`App.tsx`
  przekazuje `onReplayOnboarding` do istniejącego stanu `onboardingOpen` —
  zero duplikacji logiki). Ukończenie/pominięcie powtórki działa tak samo
  jak za pierwszym razem i NIE narusza trwałości `onboarding/v1` — po
  odświeżeniu strony nakładka nie wraca automatycznie.
- **Formalne wersjonowanie 1.0.0** — `package.json` (root, backend,
  frontend — ujednolicone; frontend miał wcześniej rozjazd 0.1.0 vs 0.2.0
  reszty monorepo), fallback wersji w `server.mjs`, `package-lock.json`
  przebudowany (`npm install --package-lock-only`). `CHANGELOG.md`:
  `[Unreleased]` zamknięte jako `[1.0.0] - 2026-07-11`, nowa pusta sekcja
  `[Unreleased]` otwarta nad nią. Historyczne raporty (`RAPORT-AUDYT.md`
  i inne) celowo NIE zmienione — opisują stan w chwili ich powstania.
- **Utwardzenie konfiguracji Narratora AI w produkcji** — komunikat 503
  „brak klucza" (`handleAsk` w `server.mjs`) wcześniej wprost wymieniał
  nazwę zmiennej środowiskowej (`ANTHROPIC_API_KEY`) w odpowiedzi HTTP
  trafiającej do KAŻDEGO klienta. Wydzielony do jednego źródła prawdy —
  `AI_UNAVAILABLE_MESSAGE` w `lib.mjs` — celowo bez nazw zmiennych
  środowiskowych ani innych szczegółów konfiguracji serwera; frontend
  (`narrator/askAI.ts`) teraz odczytuje ten komunikat z odpowiedzi
  backendu zamiast trzymać własną, osobno dryfującą kopię. Dokładny
  wymagany klucz pozostaje udokumentowany dla operatorów w
  `.env.example`/`README.md` „Znane ograniczenia". Błąd górnego poziomu
  (`catch` przy wywołaniu Anthropic SDK) już wcześniej nie ujawniał
  `err.message`/`err.status` klientowi — bez zmian, zweryfikowane.
- **Particle Lab — przejrzystość naukowa** — dwie nieaktualne/mylące
  notatki naprawione: (1) `honestyNote` eksperymentu „Odkryj cząstkę"
  była statycznym tekstem niezależnym od faktycznego stanu źródła danych
  (`core/dataSource.ts` → `isSynthetic`) i obiecywała nieistniejący „plan
  Etapu 2"; zamieniona na `dimuonHonestyNote`, obliczaną z TEGO SAMEGO
  `realMasses`, które steruje `isSynthetic` — jeśli kiedyś pojawią się
  prawdziwe dane CERN Open Data, nota automatycznie się zmieni, bez
  ręcznej synchronizacji dwóch miejsc. (2) Blok narracji „Czego tu jeszcze
  nie ma" w bazowym eksperymencie Detektor twierdził, że histogram masy
  niezmienniczej to niezrealizowany „Etap 1" — mimo że dokładnie ta
  funkcja istnieje od dawna jako sąsiednia zakładka „Odkryj cząstkę".
  Poprawiony, żeby wskazywał na nią zamiast fałszywie sugerować brak.
- **Utwardzenie Web Audio pod Safari/iOS** — `AudioContext` utworzony
  poza wywołaniem zainicjowanym gestem użytkownika startuje w Safari (i
  pod politykami autoplay Chromium) jako `'suspended'` i nigdy się sam nie
  wznawia; `currentTime` stoi w miejscu, dopóki `resume()` się nie
  rozstrzygnie. `core/sound.ts` wcześniej wywoływał `resume()` bez
  czekania na jego rozstrzygnięcie i od razu planował dźwięk względem
  zamrożonego zegara — na strefach z `suspended` dźwięk cicho przepadał.
  `tone()` teraz czeka na rozstrzygnięcie `resume()` przed odczytaniem
  `currentTime` i zaplanowaniem węzłów; przy odmowie wznowienia (brak
  gestu) cicho nic nie robi, bez wyjątku. Nie zweryfikowano na prawdziwym
  urządzeniu Safari/iOS — poprawka wynika z udokumentowanego zachowania
  Web Audio API, nie z testu na realnym sprzęcie.
- 26 nowych/rozszerzonych testów: `askAI.test.ts` (7 — kontrakt HTTP
  klienta AI, w tym „nigdy nie pokazuje ANTHROPIC_API_KEY"),
  `particleInvMass.test.ts` (4 — spójność `honestyNote` ↔ `isSynthetic`,
  brak przestarzałych obietnic), `lib.test.mjs` (+2 —
  `AI_UNAVAILABLE_MESSAGE` nie ujawnia nazwy zmiennej środowiskowej),
  `sound.test.ts` (+3 — kontekst `suspended`: oczekiwanie na `resume()`,
  cicha porażka bez gestu użytkownika, jeden kontekst reużywany między
  wywołaniami). 422 testy frontendowe, 30 backendowe (452 razem).
- Zweryfikowane: typecheck, lint, pełny pakiet testów (frontend+backend),
  build, oraz Playwright — pełny przepływ pierwszego uruchomienia, replay
  wprowadzenia z Ustawień (mobile i desktop), stan „AI niedostępne" w
  prawdziwym UI Narratora (potwierdzone: komunikat nie zawiera
  `ANTHROPIC_API_KEY`), zaktualizowana treść Particle Lab w obu
  zakładkach, oraz pełny zamiatający przebieg 13 laboratoriów + 7 ekranów
  pomocniczych na mobile i desktop — zero błędów konsoli, zero regresji.

### Dodano (Wprowadzenie przy pierwszym uruchomieniu + dźwięk UI + podpowiedź przewijania zakładek)
- `OnboardingOverlay` (`components/OnboardingOverlay.tsx` + `core/onboarding.ts`):
  4-krokowe, interaktywne wprowadzenie — WITAJ (czym jest Genesis OS) →
  DEMO (prawdziwy przeciągalny suwak sterujący wizualizacją na żywo, żeby
  "parametry są interaktywne" było odczuwalne, nie tylko przeczytane) →
  NARRATOR (przykładowy blok narracji w tym samym stylu co prawdziwy
  panel) → START (CTA prowadzące wprost do Discovery Timeline). Pomijalne
  w każdej chwili (przycisk „Pomiń →", widoczny na każdym kroku);
  pominięcie i ukończenie liczą się identycznie — jedna flaga
  `onboarding/v1` w localStorage, pokazywana WYŁĄCZNIE przy pierwszym
  uruchomieniu. Pułapka fokusu (`useFocusTrap`, ten sam mechanizm co
  Szukaj/Skróty), tło współdzieli siatkę i narożniki HUD ze stroną główną
  (spójność wizualna, nie osobny styl).
- `core/sound.ts`: krótkie, syntezowane dźwięki UI (Web Audio API,
  oscylator + obwiednia gain — zero plików audio, zero wagi w bundlu).
  Sześć zdarzeń: wejście do laboratorium, start/pauza symulacji, odkrycie
  (odblokowana odznaka w Dzienniku Odkryć — `discoveryLog.ts`), przejście
  epoki w Discovery Timeline (tylko na faktycznej granicy epoki, nie co
  klatkę; pominięte przy pierwszym renderze), odpowiedź Narratora AI
  (`NarratorPanel.tsx`, tylko przy udanej odpowiedzi). Każdy dźwięk <250ms,
  cicha amplituda (≤0,06) — potwierdzenie, nie muzyka. Jeden globalny
  przełącznik w Ustawieniach → „Dźwięk" (`settings.soundEnabled`,
  domyślnie włączony); brak/zablokowany `AudioContext` (private mode,
  polityka przeglądarki) degraduje się cicho, bez wyjątków i bez
  ponawiania próby przy każdym wywołaniu.
- Delikatny gradient na krawędzi `.exp-tabs` (rząd zakładek eksperymentów)
  podpowiada, że jest więcej zakładek poza widokiem — widoczny WYŁĄCZNIE
  gdy faktycznie jest co przewinąć (`core/useScrollEdges.ts`, pomiar
  `scrollWidth`/`clientWidth` na żywo + `ResizeObserver`), nie jako stała
  ozdoba na labach, gdzie wszystkie zakładki już się mieszczą.
- 12 nowych testów (`onboarding.test.ts`, `sound.test.ts`) — trwałość
  flagi onboardingu (w tym walidacja skorumpowanego magazynu), oraz
  dźwięk: liczba oscylatorów per zdarzenie (fałszywy `AudioContext`),
  pełne wygaszenie przy `soundEnabled=false`, żywy toggle w trakcie
  sesji, i trzy ścieżki brak-audio (brak `AudioContext` na `window`,
  konstruktor rzuca wyjątek — bez ponawiania, `window` w ogóle
  niezdefiniowany) — żadna nie rzuca wyjątku. 408 testów frontendowych
  razem (436 z backendem).
- Zweryfikowane: typecheck, lint, pełny pakiet testów, build, oraz
  wizualnie przez Playwright — cały przepływ pierwszego uruchomienia
  (WITAJ → przeciągnięcie suwaka demo → NARRATOR → START → lądowanie na
  Discovery Timeline), pominięcie + trwałość po odświeżeniu strony,
  podpowiedź przewijania zakładek (Universe Lab, Multiverse Lab — pojawia
  się/znika poprawnie przy przewijaniu), przełącznik dźwięku w
  Ustawieniach, oraz seria realnych interakcji generujących dźwięk
  (start/pauza symulacji, szybkie przeskoki i autoodtwarzanie 1000× w
  Discovery Timeline) — zero błędów konsoli w prawdziwej Chromium, zero
  regresji na 13 laboratoriach i 7 ekranach pomocniczych.

### Poprawiono (Pierwsze 2 minuty — hierarchia ekranu głównego + audyt UX 13 laboratoriów)
- Ekran główny miał dwie równorzędne wizualnie karty CTA (Discovery Timeline
  i Quantum Decision Explorer) — nowy użytkownik musiał wybierać między
  "flagową podróżą naukową" a "narzędziem refleksyjnym nad własnymi
  decyzjami życiowymi", co rozmywało pierwsze wrażenie "czym jest ta
  aplikacja". Discovery Timeline zostaje jedynym, jednoznacznym CTA
  (etykieta „ZACZNIJ TUTAJ", odrobinę większa karta), Quantum Decision
  Explorer zjechał do rzędu nawigacji jako `.qde-nav-btn` — wciąż dostępny
  o jedno kliknięcie dalej, ale nie konkuruje o pierwszą uwagę. Efekt
  uboczny: na desktopie cały pierwszy ekran (podróż przez skale + CTA +
  nawigacja + pasek statusu + siatka 13 laboratoriów) mieści się teraz bez
  przewijania w jednym widoku 1280×900.
- Playwright audyt wszystkich 13 laboratoriów (mobile 390×844 i wybrane
  widoki desktop 1280×900) wykrył i naprawiono 4 konkretne usterki:
  1. Quantum Decision Explorer: etykieta aktywnego węzła rysowana na
     canvasie nakładała się na nagłówek `<h2>` tej samej treści — usunięto
     zbędne powtórzenie (nazwa już jest w nagłówku), etykiety odgałęzień
     dostały clamp do granic canvasu (długie teksty przy skrajnych kątach
     wcześniej wychodziły poza prawą krawędź).
  2. Quantum Lab → Tunelowanie: odczyt „przeszło/odbite %" rysowany w
     górnym prawym rogu canvasu chował się częściowo pod przyciskami
     „Od nowa"/„Pauza" (`.sim-actions`, ta sama pozycja). Przeniesiony do
     dolnego prawego rogu, wyrównany do prawej.
  3. Universe Lab → Ekspansja: chmura galaktyk skalowała się WYŁĄCZNIE
     z `Math.min(w, h)`, a `.sim-stage` ma stałą wysokość (44vh) niezależną
     od szerokości ekranu — na szerokim desktopie dawało to tę samą, małą
     chmurę co na wąskim telefonie, otoczoną ogromnym pustym marginesem.
     Baza skali liczona teraz z szerokości I wysokości osobno
     (`Math.min(w * 0.42, h * 0.85)`), mobile bez zmian, desktop ~2×
     większa, poprawnie wypełniona chmura.
  4. Trzy laboratoria (Atom, Civilization, AI Discovery) miały tagline w
     nagłówku ucinany w środku słowa przez jednoliniowy `text-overflow:
     ellipsis` na wąskich telefonach. `.topbar .tagline` zawija się teraz
     na 2 linie (`-webkit-line-clamp: 2`) zamiast tracić treść.
- Naprawiono `user-scalable=no` w `index.html` (blokował pinch-zoom,
  naruszenie WCAG 1.4.4 mimo istniejącego zaangażowania platformy w
  dostępność) — zastąpione `maximum-scale=5`.
- Zweryfikowane: typecheck, lint, 396 testów frontendowych (424 z
  backendem), build, wizualnie przez Playwright (mobile + desktop, przed/po
  każdej poprawce) — zero regresji, zero nowych błędów konsoli.

### Dodano (Mathematics Lab, 13. laboratorium — bezpieczna piaskownica równań)
- Nowy moduł `core/mathExpr.ts`: parser wyrażeń matematycznych CELOWO
  bez `eval()`/`Function()` — tokenizer → parser rekurencyjnego
  zstępowania → AST → ewaluator z jawną białą listą dozwolonych funkcji
  (`FUNCTIONS`) i stałych (`CONSTANTS`). Wejście użytkownika nigdy nie
  jest wykonywane jako kod. Obsługuje niejawne mnożenie ("2x",
  "2sin(x)", "(x+1)(x-1)") z poprawną kolejnością działań (potęgowanie
  prawostronnie łączne, minus unarny słabszy niż potęgowanie: -2^2=-4).
- Różniczkowanie symboliczne DOKŁADNE: standardowe reguły rachunku
  różniczkowego (suma, iloczyn, iloraz, potęga, łańcuchowa dla funkcji
  elementarnych, różniczkowanie logarytmiczne dla ogólnego f(x)^g(x)).
  Zweryfikowane dwiema niezależnymi metodami przed napisaniem testów:
  (1) przeciw znanym dokładnym pochodnym (x², iloczyn, iloraz, złożenie,
  x^x), (2) niezależną kontrolą różnicy centralnej dla 5 różnych
  wyrażeń w wielu punktach. `differentiateWithSteps` generuje listę
  zastosowanych reguł krok po kroku z opisem słownym.
- Całkowanie NUMERYCZNE (metoda Simpsona, zweryfikowana przeciw
  ∫₀¹x²dx=1/3 i ∫₀^πsin(x)dx=2) i szukanie pierwiastków (próbkowanie +
  bisekcja) — obie metody jawnie oznaczone jako numeryczne, nie
  symboliczne (całkowanie symboliczne w ogólności nie ma rozwiązania w
  postaci zamkniętej — świadomie nie próbowane).
- Drugi tryb: równania różniczkowe dy/dx=f(x,y), pole kierunkowe (siatka
  krótkich odcinków dy/dx) + rozwiązanie RK4 — TA SAMA metoda numeryczna
  co atraktor Lorenza, problem trzech ciał i geodezyjne w reszcie
  Genesis OS. Zweryfikowane przeciw 3 znanym rozwiązaniom analitycznym
  (dy/dx=y→e^x, dy/dx=−y→e^−x, dy/dx=2x→x²) — potwierdzone też na żywo w
  przeglądarce: dy/dx=y, y(0)=1 → y(3)≈20,0855 = e³ dokładnie.
- Zbudowane jako `CustomView` (jak Atom Lab), nie rozszerzenie
  `core/customExperiment.ts` — potrzebne pole tekstowe na dowolne
  wyrażenie, którego istniejący `ParamDef` (slider/toggle/select) nie
  obsługuje. AI Narrator: deterministyczne bloki tłumaczące każdą regułę
  i wynik, plus pełna integracja „Zapytaj AI" (`buildContext`/`askAI`,
  ten sam mechanizm co reszta platformy).
- 41 nowych testów (`mathExpr.test.ts`): bezpieczeństwo parsera (rzuca
  czytelne błędy zamiast wykonywać kod dla nieznanych funkcji/składni),
  kolejność działań, różniczkowanie (10+ przypadków w tym niezależna
  kontrola różnicą centralną), całkowanie, szukanie pierwiastków,
  równania różniczkowe.
- Zweryfikowane: typecheck, lint, 396 testów vitest frontendowych (424 z
  backendem — patrz też wpis Fałdowanie białka niżej, zbudowane w tej
  samej sesji), build, Playwright w prawdziwej Chromium na obu trybach —
  zero błędów konsoli.

### Dodano (Fałdowanie białka — model HP, trzeci eksperyment Biology Lab)
- Nowy moduł `core/proteinFolding.ts`: model HP (Hydrophobic–Polar,
  Dill 1985; Lau & Dill 1989) — sekwencja aminokwasów zredukowana do
  dwóch typów, samounikający spacer na siatce kwadratowej 2D, energia
  kontaktowa = −1 za każdy kontakt H–H nienależący do szkieletu
  łańcucha (dokładny wzór Lau & Dill, nie przybliżenie).
- Symulacja Monte Carlo — algorytm Metropolisa (Metropolis i in. 1953),
  TA SAMA metoda co model Isinga w Chemistry Lab, tu zastosowana do
  przestrzeni konformacyjnej łańcucha zamiast siatki spinów. Dwa typy
  ruchów: koniec łańcucha (rotacja terminalnej reszty) i narożnik
  (przeskok reszty wewnętrznej na drugi róg kwadratu) — oba zachowują
  spójność i samounikanie łańcucha z konstrukcji.
- Fizyka zweryfikowana ręcznie przed napisaniem testów: konformacja
  typu spinki do włosów (hairpin, 6 reszt) ma dokładnie 2 geometryczne
  kontakty (policzone bezpośrednio, nie zgadnięte) — energia zależy od
  tego, ile z nich to faktycznie pary H–H.
- honestyNote jawnie cytuje NP-trudność problemu (Crescenzi i in. 1998,
  "On the complexity of protein folding") — symulacja Monte Carlo może
  utknąć w minimum lokalnym, dokładnie tak jak prawdziwe białka czasem
  błędnie się fałdują (choroby konformacyjne, np. prionowe). Jasno
  odróżnione od AlphaFold (uczenie maszynowe, nie fizyka analityczna) —
  model bada wyłącznie zasadę zapadania hydrofobowego.
- 8 nowych testów (`proteinFolding.test.ts`): energia łańcucha prostego
  = 0, dokładna energia konformacji hairpin dla 3 sekwencji, niezmienniki
  samounikania i spójności zachowane po 5000 krokach MC, zachłanne
  zejście przy T→0 (nigdy nie akceptuje ruchu podnoszącego energię),
  symulacja realnie znajduje energię ujemną w 20000 krokach.
- Zweryfikowane: typecheck, lint, 396 testów vitest frontendowe (424 z
  backendem), build, Playwright w prawdziwej Chromium — przy niskiej
  temperaturze łańcuch widocznie zwija się w zwartą strukturę (E=−4,
  zamiast rozciągniętego łańcucha startowego E=0), zero błędów konsoli.

### Dodano (Teleportacja kwantowa — pełny wektor stanu wielu kubitów, nowy eksperyment, Quantum Lab)
- Nowy moduł `core/quantumState.ts`: pełny wektor stanu 2ⁿ amplitud
  zespolonych (nie przybliżenie), bramki jednokubitowe (dowolna macierz
  2×2) i CNOT działające na dowolnym kubicie n-kubitowego rejestru,
  pomiar rzutowy (reguła Borna + kolaps + renormalizacja). Pierwsze
  rozszerzenie Quantum Lab poza pojedynczą sferę Blocha, która z
  definicji nie może pokazać splątania.
- Zaimplementowany protokół teleportacji kwantowej (Bennett, Brassard,
  Crépeau, Jozsa, Peres, Wootters 1993, PRL 70, 1895; pierwsza
  eksperymentalna realizacja: Bouwmeester i in. 1997, Nature 390, 575)
  na 3 kubitach: Alicja i Bob dzielą parę Bell, Alicja splata swój
  nieznany kubit z połową pary i mierzy oba swoje kubity, przesyła 2
  bity klasyczne, Bob stosuje jedną z 4 korekt (I/X/Z/XZ).
- Mapowanie wyników pomiaru (m₀,m₁) na korektę WYPROWADZONE
  algebraicznie krok po kroku (nie zgadnięte) i zweryfikowane numerycznie
  (`node -e`, ręczna symulacja poza aplikacją) dla dowolnego zespolonego
  stanu wejściowego PRZED napisaniem jakichkolwiek testów: wierność
  (fidelity) odtworzonego stanu wynosi dokładnie 1 w każdej z 4 gałęzi.
- honestyNote i narracja jawnie naprawiają częsty błąd
  popularnonaukowy: to NIE transmisja informacji szybszej niż światło
  (Bob potrzebuje 2 bitów klasycznych, ograniczonych prędkością światła,
  żeby wiedzieć którą korektę zastosować) i NIE kopiowanie materii/
  informacji (oryginalny stan jest NISZCZONY na kubicie Alicji przez
  pomiar — to przeniesienie, nie klonowanie, co byłoby złamaniem
  twierdzenia o zakazie klonowania).
- Nowy eksperyment `quantum-teleport.ts`: wybór jednego z 6 stanów
  startowych (|0⟩,|1⟩,|+⟩,|−⟩,|+i⟩,|−i⟩ — sześć kardynalnych punktów
  sfery Blocha), żywa wizualizacja trzech kubitów, licznik prób,
  histogram częstości czterech korekt (każda ~25%, potwierdzone w
  przeglądarce), i skumulowana średnia wierność (zawsze ~100,000%).
- 12 nowych testów (`quantumState.test.ts`, generator liniowy
  kongruentny z ziarnem dla powtarzalności): unitarność bramek na
  wielu kubitach, dokładna para Bell z H+CNOT, korelacja wyników
  pomiaru pary Bell, fidelity=1 dla stanów |0⟩/|1⟩/|+⟩ i dla dowolnego
  stanu zespolonego (12 różnych ziaren), wszystkie 4 gałęzie korekty
  realnie występują, rozkład czterech wyników pomiaru zbliżony do 25%
  każdy dla stanu symetrycznego.
- Zweryfikowane: typecheck, lint, 346 testów vitest frontendowych (374
  z backendem), build, Playwright w prawdziwej Chromium — żywa
  wizualizacja pokazuje losowe m₀/m₁, poprawną korektę i wierność
  100,000% po wielu próbach, histogram korekt zbliżony do równych
  25%/gałąź, zero błędów konsoli.

### Dodano (Biology Lab — pierwsze laboratorium spoza fizyki: transport błonowy + podwójna helisa DNA 3D)
- Nowe, dwunaste laboratorium (`labs/biology.ts`, zarejestrowane w
  `labs/index.ts` — jedna linia, jak dokumentuje komentarz w tym pliku)
  i nowy plik wiedzy `knowledge/biology.md`, wpisany do
  `LAB_KNOWLEDGE_FILES` w backendzie i `knowledge/README.md`, żeby
  Narrator AI mógł się w nim gruntować dokładnie tak samo jak w
  pozostałych 11 laboratoriach.
- Eksperyment bazowy (2D): transport przez błonę komórkową (model
  płynnej mozaiki, Singer & Nicolson 1972). Trzy jakościowo poprawne
  mechanizmy: dyfuzja prosta (zawsze z gradientem), dyfuzja wspomagana
  (z gradientem, ale NASYCALNA liczbą kanałów), transport aktywny
  (pompa Na⁺/K⁺-ATPaza, jedyny mechanizm PRZECIW gradientowi, kosztem
  ATP). Stechiometria pompy — 3 Na⁺ na zewnątrz : 2 K⁺ do wewnątrz na
  1 ATP — to zmierzony fakt biochemiczny (odkrycie: Jens Skou, Nagroda
  Nobla 1997), nie liczba dobrana dla wygody symulacji.
- Drugi eksperyment (3D, WebGL): podwójna helisa DNA — dokładna
  geometria B-DNA (Watson & Crick 1953; parametry krystalograficzne:
  promień 1,0 nm, wzniesienie 0,34 nm/parę zasad, ~10,5 pary zasad/skręt,
  Wang 1979), dwie nici przesunięte o ~120° (nie 180°) dając realną
  asymetrię rowka większego/mniejszego. Temperatura topnienia liczona
  regułą Wallace'a Tm=2°C(A+T)+4°C(G+C) (Wallace i in. 1979) — nowa
  funkcja `dnaMeltingTempWallace` w `core/physics.ts`. Krzywa
  rozdzielania nici jest logistyczna wokół Tm (kooperatywne przejście —
  koncepcyjny most do modelu Isinga w Chemistry Lab, zbudowanego
  wcześniej w tej samej sesji).
- Pierwsza wersja helisy użyła 32-parowej sekwencji, ale Playwright
  ujawnił dwa problemy naprawione przed zamknięciem zadania: (1)
  centrowanie geometrii było na sztywno przybite do n≈10, więc dłuższe
  sekwencje renderowały się poza środkiem — naprawione przez
  przekazanie rzeczywistej długości do funkcji geometrii; (2) reguła
  Wallace'a ekstrapolowana na 32 zasady dawała nierealistycznie wysoką
  Tm (96°C) — reguła jest udokumentowana tylko dla krótkich
  oligonukleotydów, więc sekwencje skrócono do 20 par zasad (wciąż ~2
  pełne skręty, wystarczające do rozpoznawalnego kształtu helisy).
- 3 nowe testy fizyczne reguły Wallace'a w `physics.test.ts` (dokładna
  wartość dla znanych sekwencji, niewrażliwość na wielkość liter,
  sekwencje bogate w G≡C mają wyższą Tm niż te same długości bogate w
  A=T — silniejsze parowanie G≡C, 3 wiązania wodorowe vs 2).
- Zaktualizowano dwa istniejące testy regresyjne, które na sztywno
  zakładały 11 laboratoriów (`registry.test.ts`, `discoveryLog.test.ts`)
  — teraz poprawnie liczą 12.
- Zweryfikowane: typecheck, lint, 333 testy vitest frontendowe (361 z
  backendem), build, Playwright w prawdziwej Chromium na obu
  eksperymentach — pompa Na⁺/K⁺ mierzalnie tworzy gradient Na⁺/K⁺
  wbrew biernemu przeciekowi, a helisa DNA przy 85°C (powyżej Tm=58°C
  mieszanej sekwencji) widocznie się rozdziela (nici rozchodzą się,
  wiązania wodorowe zanikają) — zero błędów konsoli.

### Dodano (Stabilność układu planetarnego — prawdziwa grawitacja N-ciał, nowy eksperyment, Universe Lab)
- Nowe funkcje w `core/physics.ts`: `G_ASTRO_YEAR` (=4π² dokładnie —
  konsekwencja III prawa Keplera dla Ziemi w jednostkach AU/rok/M_słońca,
  nie przybliżenie), `EARTH_MASSES_PER_SOLAR`, `visVivaSpeed` (równanie
  vis-viva), `orbitalElementsFromState` (elementy oskulacyjne a,e z
  chwilowego wektora stanu, metoda energia+moment pędu).
- Nowy eksperyment `universe-planetstability.ts`: Słońce + Jowisz +
  Saturn + Ziemia + Mars, integracja velocity-Verlet (symplektyczna, ta
  sama metoda co problem trzech ciał), każda planeta startuje w
  peryhelium z dokładną prędkością z vis-viva. To PRAWDZIWA grawitacja
  N-ciał — celowo inne podejście niż "Prawdziwy Układ Słoneczny" (który
  używa niezależnych elips Keplera, dobrych do pokazania pozycji planet,
  złych do pokazania zaburzeń grawitacyjnych między nimi).
- Toggle Jowisz/Saturn usuwa ich grawitację z symulacji; mimośród Ziemi
  i Marsa liczony NA ŻYWO z chwilowego stanu (nie zakładany) pokazuje
  prawdziwy dryf orbitalny. Formuły zweryfikowane numerycznie przed
  implementacją (`node -e`): dokładny round-trip (a,e)→stan→(a,e).
  Playwright potwierdził realny efekt fizyczny: po 12 latach symulacji
  dryf mimośrodu Marsa jest ~15× mniejszy bez gigantów (0,00002) niż z
  nimi (0,00031) — zmierzony, nie deklarowany skutek.
- honestyNote nazywa świadome uproszczenia: 4 planety zamiast 8, start
  w peryhelium (nie prawdziwa efemeryda na konkretną datę) z rozłożonymi
  kątowo kierunkami dla czytelności.
- Narracja cytuje rezonans Jowisz–Saturn ~5:2 (Wielka Nierówność,
  Laplace) i wynik Laskara (1989, Nature 338, 237) o chaotyczności
  wewnętrznego Układu Słonecznego w długim czasie (czas Lapunowa ~5 mln
  lat) — czwarty, niezależny przykład czułości na warunki początkowe w
  Universe Lab, obok problemu trzech ciał, podwójnego wahadła i atraktora
  Lorenza.
- 6 nowych testów fizycznych (`physics.test.ts`): wartość G_ASTRO_YEAR,
  stosunek mas Ziemia/Słońce, prędkość i okres orbity kołowej, dokładny
  round-trip elementów orbitalnych dla orbity Jowisza, elementy orbity
  kołowej (e=0 dokładnie).
- Zweryfikowane: typecheck, lint, 329 testów vitest frontendowych (357 z
  backendem), build, Playwright w prawdziwej Chromium — wyłączenie
  gigantów widocznie usuwa ich orbity z canvasu i mierzalnie zmniejsza
  tempo dryfu mimośrodu pozostałych planet, zero błędów konsoli.

### Dodano (Atraktor Lorenza — trzeci eksperyment chaosu deterministycznego, Universe Lab)
- Nowe funkcje w `core/physics.ts`: `lorenzDerivative`, `stepLorenzRK4`
  (RK4 — ta sama metoda numeryczna co reszta platformy),
  `lorenzChaosThreshold`. Klasyczne równania Lorenza (1963, J. Atmos.
  Sci. 20, 130): dx/dt=σ(y−x), dy/dt=x(ρ−z)−y, dz/dt=xy−βz, σ=10 i
  β=8/3 (oryginalne stałe), suwak ρ steruje przejściem od dwóch
  stabilnych punktów stałych do chaotycznego atraktora.
- Dokładny próg homoklinicznego "wybuchu" chaosu ρ_h=σ(σ+β+3)/(σ−β−1)
  (Sparrow 1982) — dla σ=10, β=8/3 daje ≈24,74; klasyczne ρ=28 Lorenza
  leży tuż powyżej tego progu.
- Fizyka zweryfikowana algebraicznie PRZED implementacją: symetria
  równań f(−x,−y,z)=(−f_x,−f_y,f_z) — jeśli (x,y,z) jest rozwiązaniem,
  (−x,−y,z) też jest, co tłumaczy dwa symetryczne "skrzydła" atraktora
  — potwierdzona numerycznie (`node -e`) przed napisaniem testów.
- Nowy `Sim3D` (`universe-lorenz3d.ts`, Universe Lab): tor renderowany
  jako narastająca linia w WebGL; tryb "dwa niemal identyczne starty"
  (10⁻⁴ jednostki, jak w problemie trzech ciał i podwójnym wahadle)
  koloruje drugą trajektorię na pomarańczowo, żeby rozjazd był widoczny
  gołym okiem. Kamera ustawiona wzdłuż osi dającej klasyczny,
  rozpoznawalny "kształt motyla" (widok z boku dawał nierozróżnialny,
  wąski profil obu skrzydeł nałożonych na siebie — poprawione po
  pierwszym Playwrightowym zrzucie ekranu, nie zostawione).
- honestyNote nazywa wprost: to uproszczony (3 zmienne) model konwekcji
  atmosferycznej, NIE symulacja prawdziwej pogody; błąd numeryczny
  RK4 w układzie chaotycznym rośnie wykładniczo, dokładnie tak jak
  realny błąd pomiaru — cały eksperyment o tym właśnie traktuje.
- 5 nowych testów fizycznych (`physics.test.ts`): wartość i wewnętrzna
  spójność progu chaosu, symetria równań (zweryfikowana wprost),
  zbieganie do początku układu poniżej ρ=1, ograniczoność atraktora
  przy klasycznym ρ=28, wykładniczy rozjazd dwóch trajektorii startujących
  10⁻⁶ jednostki od siebie (efekt motyla).
- Zweryfikowane: typecheck, lint, 322 testy vitest frontendowe (350 z
  backendem), build, Playwright w prawdziwej Chromium — niski suwak ρ
  pokazuje zbieganie do jednego punktu, ρ=28 pokazuje klasyczny kształt
  motyla narastający na żywo, tryb dywergencji pokazuje dwie trajektorie
  rozjeżdżające się po wspólnym starcie — zero błędów konsoli.

### Dodano (Model Isinga 2D — przejście fazowe, nowy eksperyment, Chemistry Lab)
- `core/isingModel.ts` (nowy moduł, w pełni testowalny niezależnie od
  renderingu) + `labs/experiments/chemistry-ising.ts`: siatka spinów
  ±1 42×42 z periodycznymi warunkami brzegowymi, algorytm Metropolisa
  (Metropolis, Rosenbluth, Rosenbluth, Teller, Teller 1953) — jedyny
  nietrywialny model przejścia fazowego z pełnym rozwiązaniem
  analitycznym w 2D (Onsager 1944, Phys. Rev. 65, 117).
- Dokładna temperatura krytyczna `ISING_TC = 2/ln(1+√2) ≈ 2,269` i
  dokładna spontaniczna magnetyzacja poniżej niej (`isingExactMagnetization`,
  wzór Yanga 1952, Phys. Rev. 85, 808) — spójność wewnętrzna
  zweryfikowana ALGEBRAICZNIE przed napisaniem jakiegokolwiek kodu
  symulacji: sinh(2/T_c) = 1 dokładnie, co gwarantuje ciągłe (nie
  skokowe) dojście magnetyzacji do zera dokładnie w T_c — definicja
  przejścia fazowego drugiego rodzaju.
- Symulowana dynamika Metropolisa jest naprawdę wolna głęboko poniżej
  T_c (dyfuzja ścian domen, "critical slowing down" — realne zjawisko,
  nie błąd implementacji, potwierdzone wizualnie w Playwright: losowa
  siatka startowa tworzy duże, powoli zlewające się domeny zamiast
  natychmiast osiągać pełny porządek). Zaadresowane uczciwie zamiast
  ukryte: podniesione tempo prób Metropolisa (~40 zamachów/s), "wybuch"
  relaksacji przy skokowej zmianie temperatury (analogia do hartowania
  próbki), i Narrator, który jawnie nazywa różnicę między bieżącą a
  docelową (Onsagera) magnetyzacją zamiast milczeć o niej.
- 14 nowych testów statystycznych (`isingModel.test.ts`, generator
  liniowy kongruentny z ziarnem dla powtarzalności): wartość i spójność
  T_c, monotoniczność i granice magnetyzacji Onsagera, periodyczne
  warunki brzegowe, porządkowanie w niskiej T / rozpad porządku w
  wysokiej T, energia stanu podstawowego dokładnie −2/spin, wzrost
  energii po termalizacji w wysokiej T.
- Zweryfikowane: typecheck, lint, 317 testów vitest frontendowych (345
  z backendem), build, Playwright w prawdziwej Chromium — niska
  temperatura pokazuje duże kolorowe domeny (fazę uporządkowaną), wysoka
  temperatura czysty szum (fazę nieuporządkowaną), zero błędów konsoli.

### Dodano (Wirująca czarna dziura Kerra 3D — nowy eksperyment, Einstein Lab)
- `labs/experiments/einstein-kerr3d.ts` (nowy `Sim3D`) + nowe funkcje w
  `core/physics.ts`: `stepKerrEquatorialGeodesic`, `kerrEquatorialF`,
  `kerrHorizonRadius`, `kerrErgosphereEquatorRadius`,
  `kerrPhotonOrbitRadius`, `kerrCriticalImpactParameter`. Fotony
  poruszają się w PŁASZCZYŹNIE RÓWNIKOWEJ (θ=π/2, stała Cartera Q=0)
  wirującej czarnej dziury — dokładne równania Boyer–Lindquist (Carter
  1968), zredukowane do postaci Bineta (du/dφ)²=F(u) i całkowane RK4;
  pochodna F'(u) liczona różnicą centralną 4. rzędu zamiast ręcznej
  reguły ilorazu, żeby uniknąć ryzyka błędu algebraicznego w długim
  wyprowadzeniu (świadomy wybór inżynierski, udokumentowany w kodzie).
- Fizyka zweryfikowana niezależnie od trzech stron: (1) przy spinie a=0
  równanie redukuje się do geodezyjnej Schwarzschilda — tor identyczny co
  do 13 cyfry; (2) promienie sferycznych orbit fotonowych prograde/
  retrograde r̂_±=2M[1+cos((2/3)arccos(∓a/M))] (Bardeen 1972; Teo 2003,
  arXiv:0906.4650) odtwarzają znane granice ekstremalne r̂→M i r̂→4M przy
  spinie a→M; (3) krytyczny parametr zderzenia b_±=±3√(Mr̂_±)−a redukuje
  się dokładnie do 3√3·M Schwarzschilda przy a=0, a symulacja przechwytu/
  ucieczki fotonu poprawnie rozstrzyga po obu stronach tej granicy dla
  obu kierunków (prograde i retrograde, ze znakiem).
- Efekt wleczenia układów inercjalnych (frame-dragging, zmierzony przez
  Gravity Probe B, 2011) widoczny WPROST, nie ilustracyjnie: orbita
  fotonowa prograde leży bliżej horyzontu niż retrograde — asymetria,
  której nie ma w statycznej czarnej dziurze Schwarzschilda. Horyzont
  (r+=M+√(M²−a²), kurczy się ze spinem) i ergosfera (r_ergo(θ)=M+
  √(M²−a²cos²θ), prawdziwa oblata powierzchnia, nie sfera) renderowane
  jako dokładne geometrie 3D, nie placeholdery.
- `honestyNote` jawnie nazywa granicę zakresu: geodezyjne POZA równikiem
  (precesja w θ, wymaga pełnych równań Cartera z Q≠0 — całki eliptyczne)
  pozostają w `VISION-BACKLOG.md`; dysk akrecyjny jest poglądowy
  (prawdziwe ISCO Kerra zależne od spinu i kierunku to osobne, bardziej
  złożone obliczenie, celowo pominięte).
- 20 nowych testów fizycznych (`physics.test.ts`): zgodność ze
  Schwarzschildem przy a=0, granice ekstremalne prograde/retrograde,
  monotoniczność horyzontu ze spinem, promień ergosfery na równiku,
  asymetria prograde<retrograde, przechwyt/ucieczka fotonu po obu
  stronach krytycznego b dla obu kierunków, nieujemność F(u) z
  konstrukcji. Zweryfikowane: typecheck, lint, 302 testy vitest
  frontendowe (330 z backendem), build, Playwright w prawdziwej
  Chromium (suwak spinu 0,70→0,95 wyraźnie kurczy horyzont na
  zrzucie ekranu, Narrator pokazuje r_prograde=2,01M/r_retrograde=3,73M
  przy a=0,70 — dokładnie zgodne z testami fizycznymi) — zero błędów
  konsoli.

### Dodano (Diagram obwodu kwantowego — rozszerzenie Sfery Blocha, Quantum Lab)
- `labs/experiments/quantum-bloch.ts` rozszerzony o prawdziwy diagram
  obwodu: sekwencja WSZYSTKICH zastosowanych bramek (do 10 ostatnich)
  renderowana jako linia kubitu z chipami bramek, konwencja identyczna z
  IBM Quantum Composer — to prawdziwa, wykonana sekwencja operacji
  unitarnych, nie ilustracja.
- Czyste funkcje `applyGate`/`applyCircuit` wyekstrahowane i wyeksportowane
  z klasy symulacji — ta sama macierzowa logika co wcześniej, teraz
  bezpośrednio testowalna.
- Narrator tłumaczy NIEPRZEMIENNOŚĆ bramek kwantowych (kolejność X,Z ≠
  Z,X) jako realną własność matematyczną leżącą u podstaw wszystkich
  algorytmów kwantowych, gdy obwód ma ≥2 bramki.
- honestyNote jawnie nazywa ograniczenie: to obwód JEDNOKUBITOWY — CNOT i
  splątanie wymagają reprezentacji stanu, której pojedyncza sfera Blocha
  nie może pokazać, i pozostają w `VISION-BACKLOG.md`.
- 9 nowych testów (`quantumBloch.test.ts`): każda bramka jest unitarna
  (zachowuje normę stanu), H daje dokładnie 50/50, X∘X i H∘H = tożsamość,
  **nieprzemienność potwierdzona wprost** (X,Z na stanie w superpozycji
  daje inny stan niż Z,X), obwód pusty i nieznana bramka są bezpieczne.
  Zweryfikowane: typecheck, lint, 292 testy vitest, build, Playwright
  (kliknięcia bramek na canvasie, diagram obwodu pokazuje poprawną
  sekwencję H→X→Z) — zero błędów konsoli.

### Dodano (Napięcie Hubble'a — nowy eksperyment, Universe Lab)
- `labs/experiments/universe-hubbletension.ts` + nowe funkcje fizyki w
  `core/physics.ts` (`gaussianPdf`, `measurementTensionSigma`): realny,
  aktywny, nierozstrzygnięty spór kosmologiczny — trzy niezależnie
  opublikowane pomiary stałej Hubble'a (SH0ES 73,04±1,04 km/s/Mpc, Riess
  i in. 2022; Planck CMB 67,4±0,5, Planck Collaboration 2020; TRGB
  69,8±1,7, Freedman i in. 2021) wizualizowane jako rozkłady normalne
  obok siebie.
- Rozbieżność SH0ES↔Planck (~4,9σ) liczona standardową metodą fizyki
  doświadczalnej (różnica podzielona przez niepewności złożone w
  kwadraturze) — zgodna z powszechnie cytowaną wartością w literaturze.
  Trzecia metoda (TRGB) ląduje POMIĘDZY dwoma "obozami", pokazując że to
  nie prosty spór dwustronny.
- Suwak "hipotetyczna dodatkowa systematyka" pokazuje na żywo, ile
  "ukrytej" niepewności w pomiarze Plancka wystarczyłoby, by napięcie
  spadło poniżej progu istotności — realna, przeliczana na żywo
  demonstracja tego, dlaczego część kosmologów podejrzewa nieznaną
  systematykę zamiast nowej fizyki.
- Narracja jawnie przedstawia obie hipotezy (systematyka vs nowa fizyka)
  bez faworyzowania żadnej — przykład "nauki w toku", nie zamkniętego faktu.
- 7 nowych testów fizyki (`physics.test.ts`): gaussianPdf osiąga
  maksimum w średniej i całkuje się numerycznie do ~1, napięcie zerowe
  dla identycznych pomiarów, napięcie odtwarza publikowaną wartość ~4,9σ
  dla SH0ES/Planck, dodanie systematyki zawsze zmniejsza napięcie (nigdy
  nie zwiększa), symetria względem zamiany pomiarów. Zweryfikowane:
  typecheck, lint, 283 testy vitest, build, Playwright (trzy krzywe,
  suwak systematyki zmniejszający napięcie z 4,89σ do 1,54σ na żywo,
  przełącznik TRGB) — zero błędów konsoli.

### Dodano (Quantum Decision Explorer — symulacja Monte Carlo odgałęzień)
- Na wyraźną prośbę użytkownika o "najbardziej realistyczny symulator
  alternatywnych scenariuszy... oparty na matematyce, teorii decyzji,
  symulacjach Monte Carlo" — `core/decisionMonteCarlo.ts`: dyskretny
  proces Wienera z dryfem (schemat Eulera–Maruyamy), transformacja
  Boxa–Mullera do generowania N(0,1) — dokładnie ten sam model matematyczny
  co dyfuzja/ruchy Browna w fizyce, tu zastosowany do wizualizacji
  "rozrzutu konsekwencji" ścieżki decyzyjnej.
- `Branch` (core/decisionExplorer.ts) rozszerzony o pole `tone` (-5..+5,
  subiektywna ocena UŻYTKOWNIKA) sterujące dryfem symulacji; `weight`
  decyzji steruje zmiennością. Migracja starego formatu (goły string)
  wbudowana w `sanitizeBranch` — dane sprzed tej zmiany nadal się wczytują
  bez utraty treści.
- Nowy suwak horyzontu czasowego (1/3/5/10/20/50/100 lat): każde
  odgałęzienie renderuje wachlarz ~20 niezależnie zasymulowanych
  trajektorii jako świecące linie rozchodzące się z gwiazdy-decyzji —
  rozrzut wachlarza WIDOCZNIE rośnie jak √czas (zweryfikowane wizualnie w
  przeglądarce), bo tak działa prawdziwa matematyka procesu Wienera, nie
  bo aplikacja "wie" coś o przyszłości.
- Formularz edycji decyzji zyskał strukturalne wiersze odgałęzień (tekst +
  suwak "tonu" na wiersz, do 4 ścieżek) zamiast pojedynczego pola tekstowego.
- Narrator raportuje realny wynik statystyczny z próby Monte Carlo
  (`significantFraction`) z jawnym zastrzeżeniem, że to demonstracja
  własności matematycznej (niepewność rośnie jak √t), nie prognoza
  konkretnej ścieżki — oraz osobny blok "Skąd biorą się te liczby"
  tłumaczący, że dryf/zmienność pochodzą wyłącznie z ocen użytkownika.
- Świadomie NIE zbudowano (z pierwotnej, znacznie szerszej prośby
  użytkownika): generowania "dziesiątek/setek ścieżek" przez AI (brak
  wiarygodnej podstawy), symulacji finansów/zdrowia/relacji jako osobnych
  "przewidywanych" wymiarów (wymagałoby modelu, którego nie mamy), sieci
  Bayesa / Markov Decision Process / Reinforcement Learning (brak dziś
  zdefiniowanego, uczciwego zastosowania), trybu filmowego 4K (osobny
  temat produkcyjny) — wszystkie odnotowane w `VISION-BACKLOG.md`.
- 12 nowych testów (`decisionMonteCarlo.test.ts`): Box–Muller daje N(0,1)
  na dużej próbie (|mean|<0.05, |std−1|<0.05), czysty dryf bez szumu daje
  v(T)=drift·T dokładnie, std(4 lata)/std(1 rok)≈2=√4 (zweryfikowane
  empirycznie na 4000 ścieżkach), zgodność empirycznego std z formułą
  teoretyczną volatility·√T w granicach 10%, znak dryfu zgodny ze znakiem
  tonu, `branchToSimParams` monotoniczne w wadze. Zaktualizowane testy
  migracji w `decisionExplorer.test.ts`. Zweryfikowane: typecheck, lint,
  275 testów vitest, build, Playwright (wachlarz przy horyzoncie 1/10/100
  lat, edycja odgałęzień z suwakiem tonu, dodawanie nowej ścieżki) — zero
  błędów konsoli.

### Dodano (Miareczkowanie kwas–zasada — nowy eksperyment, Chemistry Lab)
- `labs/experiments/chemistry-titration.ts` + nowe funkcje fizyki w
  `core/physics.ts` (`titrationPH`, `equivalenceVolumeMl`): krzywa
  miareczkowania słabego kwasu mocną zasadą (NaOH) liczona DOKŁADNYM
  równaniem bilansu ładunku ([Na⁺]+[H⁺]=[A⁻]+[OH⁻], z uwzględnieniem
  autodysocjacji wody), rozwiązywanym numerycznie bisekcją w skali
  logarytmicznej stężenia [H⁺] — nie tylko przybliżeniem Hendersona–
  Hasselbalcha, które (widoczne na tym samym wykresie) jest dokładne
  TYLKO w punkcie półrównoważnikowym.
- 4 realne słabe kwasy z tabelarycznym Ka (CRC Handbook): octowy, mrówkowy,
  benzoesowy, cyjanowodorowy (świadomie bardzo słaby — pokazuje skrajny
  przypadek). Suwak objętości dodanego NaOH (0–60 mL, jak prawdziwa
  biureta) przesuwa marker po żywo przeliczanej krzywej; punkt
  równoważnikowy i półrównoważnikowy oznaczone na wykresie.
- Narracja naprawia częsty błąd popularnonaukowy: punkt równoważnikowy
  miareczkowania słabego kwasu mocną zasadą jest ZASADOWY (pH>7, hydroliza
  sprzężonej zasady), nie obojętny — "pH=7" jest prawdziwe tylko dla
  mocny kwas + mocna zasada, którego ten eksperyment nie modeluje.
- 7 nowych testów fizyki (`physics.test.ts`): objętość równoważnikowa
  (C_a·V_a=C_b·V_eq), pH=pKa dokładnie w punkcie półrównoważnikowym,
  monotoniczność krzywej, zasadowość punktu równoważnikowego, słabszy
  kwas → bardziej zasadowy punkt równoważnikowy, zgodność ze starym
  przybliżeniem pH≈½(pKa−log₁₀Ca) na starcie. Zweryfikowane: typecheck,
  lint, 261 testów vitest, build, backend (28/28), Playwright w prawdziwej
  przeglądarce (suwak objętości, przełączanie kwasów — wartości na ekranie
  dokładnie zgodne z ręcznie zweryfikowanymi obliczeniami: pH=4,75 w
  półrównoważniku kwasu octowego, pH=10,95 w równoważniku HCN) — zero
  błędów konsoli.

### Dodano (Chirp fali grawitacyjnej — nowy eksperyment z dźwiękiem, Einstein Lab)
- `labs/experiments/einstein-chirp.ts` + nowe funkcje fizyki w
  `core/physics.ts` (`chirpMassSolar`, `timeToMerger`, `chirpFrequency`,
  `iscoFrequency`, `binarySeparationMeters`): formuła kwadrupolowa
  wiodącego rzędu — dokładnie ta metoda, którą LIGO użyło do potwierdzenia
  pierwszej detekcji fal grawitacyjnych, GW150914 (Abbott i in. 2016,
  PRL 116, 061102, Nagroda Nobla 2017).
- Suwaki mas obu czarnych dziur (5-80 M☉, domyślnie 36/29 — masy zbliżone
  do GW150914) sterują żywo liczoną krzywą narastania częstotliwości i
  amplitudy fali ("chirp"), renderowaną jako klasyczny wykres h(t) plus
  mały wizualizator orbitującej pary — separacja orbitalna liczona z
  prawdziwej relacji Keplera, kurczy się dokładnie tak jak w rzeczywistości.
- Model uczciwie kończy się na promieniu ISCO (r=6GM/c²) — połączenie
  pokazane jako błysk, NIE próbuje symulować samego zderzenia ani
  "ringdown" (wymaga pełnej relatywistyki numerycznej).
- **Pierwszy dźwięk w Genesis OS**: opcjonalny toggle 🔊 syntezuje realną,
  żywo liczoną częstotliwość fali (Web Audio API, OscillatorNode) —
  częstotliwości fal z łączących się czarnych dziur gwiazdowej masy leżą
  w PRAWDZIWYM ludzkim zakresie słyszalności, bez potrzeby sztucznego
  przesuwania wysokości. Rozciągnięte w czasie suwakiem spowolnienia
  (prawdziwy inspiral trwa ułamek sekundy), nie pitch-shiftowane.
- Nowy opcjonalny hak `Sim.dispose?()` w `core/types.ts`, wywoływany przy
  odmontowaniu w `core/useSimLoop.ts` — pierwszy Sim (2D) w aplikacji
  trzymający zasób spoza Canvasu (AudioContext) wymagał sprzątania;
  wzorowane na istniejącym `Sim3D.dispose?()`.
- 7 nowych testów fizyki (`physics.test.ts`): masa ćwierkowa dla równych
  mas (relacja dokładna ℳ=m/2^0,2), symetria i mniejszość względem masy
  całkowitej, GW150914-podobny układ w oczekiwanym zakresie (~28 M☉),
  odwracalność chirpFrequency/timeToMerger, monotoniczny wzrost
  częstotliwości, separacja orbitalna przy ISCO = dokładnie 6GM/c²
  (niezależne potwierdzenie zgodności z geodezyjnymi Schwarzschilda),
  cięższy układ = niższa częstotliwość ISCO. Zweryfikowane: typecheck,
  lint, 253 testy vitest, build, Playwright (wykres, orbitujące masy,
  cykl błysk-połączenia-reset, włączenie dźwięku bez wyjątków) — zero
  błędów konsoli.

### Dodano (Podwójne wahadło — nowy eksperyment, Universe Lab)
- `labs/experiments/universe-doublependulum.ts`: drugi eksperyment "chaos
  deterministyczny" w Universe Lab, obok problemu trzech ciał — celowo
  najprostszy fizycznie możliwy układ wykazujący chaos (2 stopnie swobody).
  Dokładne równania Lagrange'a dla dwóch sztywnych prętów bez tarcia,
  integracja RK4 (rząd 4) — CELOWO NIE symplektyczna, w jawnym kontraście
  z integratorem problemu trzech ciał: energia powoli dryfuje w czasie,
  co jest pokazane w odczycie liczbowym na żywo, nie ukryte.
- Suwak kąta startowego (5°–179°) pokazuje na żywo przejście od ruchu
  niemal okresowego (pojedyncze wahadło NIGDY nie jest chaotyczne;
  poniżej ~35° podwójne wahadło zachowuje się podobnie) do w pełni
  chaotycznego (powyżej ~35-40°, klasyczny, nieregularny ślad drugiego
  odważnika widoczny na ekranie).
- Ten sam tryb „dwa niemal identyczne starty" (przesunięcie 10⁻⁶ rad) co
  w problemie trzech ciał — spójny wzorzec UX dla obu eksperymentów chaosu.
- 6 nowych testów (`universeDoublePendulum.test.ts`): energia minimalna w
  spoczynku, zachowanie energii przy małym kącie, ograniczoność ruchu przy
  małym kącie, determinizm RK4, szybszy rozjazd przy dużym kącie niż
  małym (sygnatura chaosu). Zweryfikowane: typecheck, lint, 244 testy
  vitest, build, Playwright (chaotyczny ślad, tryb dywergencji z rosnącym
  odczytem) — zero błędów konsoli.

### Dodano (Geometria molekularna VSEPR — nowy eksperyment 3D, Chemistry Lab)
- `labs/experiments/chemistry-vsepr.ts`: pierwsza scena `Sim3D` (Three.js)
  w Chemistry Lab — model kulki-i-pałeczki, 13 standardowych geometrii
  VSEPR (Gillespie & Nyholm, 1957) od liniowej (AX₂) po kwadratową płaską
  (AX₄E₂), pełne pokrycie klasycznego zbioru z każdego kursu chemii ogólnej.
- Geometrie BEZ wolnych par (liniowa, trygonalna, tetraedryczna, bipiramida
  trygonalna, oktaedryczna): dokładna geometria bryły platońskiej/rozkładu
  na okręgu — zweryfikowane testem (tetraedr 109,47° między każdą parą
  wiązań, oktaedr dokładnie 12 kątów 90° i 3 kąty 180°).
- Dla NH₃ i H₂O — dwóch najczęściej cytowanych podręcznikowych przykładów
  odkształcenia przez wolną parę — kąty wiązań są PRAWDZIWYMI zmierzonymi
  wartościami (106,8° i 104,5°, NIST/CCCBDB), nie idealizacją: nowa funkcja
  `bentCone()` konstruuje geometrię WSTECZ od zadanego rzeczywistego kąta.
  Pozostałe geometrie z wolnymi parami (SF₄, ClF₃, XeF₂, BrF₅, XeF₄) pokazują
  pozycje idealne bryły-rodzica z jawnym zastrzeżeniem w honestyNote, że
  realne kąty odbiegają o kilka stopni — uczciwość zamiast fałszywej
  precyzji.
- Wolne pary renderowane jako półprzezroczyste, "oddychające" (pulsująca
  skala napędzana czasem symulacji) chmury bez atomu na końcu — wizualnie
  odróżnione od par wiążących, ten sam motyw "chmura prawdopodobieństwa"
  co orbitale w Atom Lab.
- 10 nowych testów (`chemistryVsepr.test.ts`): spójność liczby wektorów z
  deklarowaną liczbą domen, wektory jednostkowe, unikalne id, dokładne kąty
  dla tetraedru/oktaedru/NH₃/H₂O/liniowej, `bentCone()` dla dowolnego kąta,
  narracja dla wszystkich 13 kształtów. Zweryfikowane: typecheck, lint,
  237 testów vitest, build, Playwright w prawdziwej przeglądarce (WebGL) —
  oktaedryczny SF₆ i kątowy H₂O (z widocznymi chmurami wolnych par) render
  się poprawnie, zero błędów konsoli.

### Dodano (Trendy okresowe — nowa zakładka, Atom Lab)
- `data/periodicTrends.ts`: promień atomowy (Slater 1964) i pierwsza
  energia jonizacji (NIST Atomic Spectra Database, CRC Handbook) dla
  okresów 1–4 (Z=1–36) — świadomie ograniczony zakres zamiast podawania
  niepewnych wartości dla cięższych pierwiastków.
- Nowa zakładka „Trendy okresowe" w Atom Lab: reużywa DOKŁADNIE tę samą
  siatkę `.ptable` co widok „Powłoki" (118 pierwiastków), ale renderuje ją
  jako mapę cieplną (kolor komórki = wartość, cyjan→bursztyn) zamiast
  listy klikalnych przycisków — jeden wspólny komponent, dwa zastosowania.
  Przełącznik promień/energia jonizacji, klik w komórkę pokazuje realną
  wartość i wyjaśnienie w Narratorze.
- Narracja tłumaczy oba prawdziwe mechanizmy: promień maleje wzdłuż okresu
  (rosnący efektywny ładunek jądra przy tej samej powłoce), rośnie w dół
  grupy (nowa powłoka); energia jonizacji jest niemal lustrzanym odbiciem
  promienia (gazy szlachetne najwyższe, metale alkaliczne najniższe).
- 10 nowych testów (`periodicTrends.test.ts`): spójność Z z `data/elements.ts`,
  zakresy wartości, promień malejący wzdłuż okresu 2, promień rosnący w dół
  grupy 1, energia jonizacji rosnąca wzdłuż okresu (Ne>Li, F>Li), malejąca
  w dół grupy 1 (Li>Na>K), anomalia gazów szlachetnych (najwyższa IE w
  okresie). Zweryfikowane: typecheck, lint, 227 testów vitest, build,
  Playwright (obie właściwości, wybór pierwiastka z mapy) — zero błędów
  konsoli.

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
