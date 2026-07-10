# Architektura Genesis OS

Ten dokument opisuje jak i dlaczego, nie co — lista funkcji jest w
[`README.md`](README.md), historia zmian w [`CHANGELOG.md`](CHANGELOG.md).

## Zasada organizująca: pluginy fizyki, cienka powłoka UI

Każde laboratorium jest niezależnym modułem zgodnym z kontraktem
`LabDefinition` (`packages/frontend/src/core/types.ts`). Rdzeń aplikacji
(`App.tsx`, `LabShell.tsx`, `registry.ts`) nie zna żadnego laboratorium z
nazwy — renderuje wyłącznie to, co zarejestrował `registerLab()` w
`src/labs/index.ts`. Dodanie laboratorium to jeden nowy plik + jedna linia
w manifeście; usunięcie jednego laboratorium nie może wpłynąć na inne
(sprawdzane przez `sims.test.ts`, które iteruje `getLabs()` i uruchamia
każdą symulację 120 kroków).

### Kontrakt `Sim`

```ts
interface Sim {
  init(width: number, height: number): void;
  update(dt: number, params: SimParams): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  getStats?(): Record<string, number>;
  reset?(): void;
  dispose?(): void; // sprzątanie zasobów spoza Canvasu (np. AudioContext), patrz Einstein Lab „Chirp"
}
```

`update()` i `getStats()` są czystym TypeScriptem bez żadnej zależności od
DOM czy Reacta — to jest granica przenośności. Tylko `render()` jest
adapterem specyficznym dla platformy (dziś: Canvas 2D). Port na Unity /
Unreal / natywną aplikację wymaga wymiany wyłącznie warstwy `render()`;
cała logika fizyczna, parametry i statystyki przenoszą się bez zmian.

### Warstwa Narratora — dwa poziomy

1. **Deterministyczny** (`narrator/engine.ts`) — zawsze aktywny, liczy
   realne wielkości fizyczne bezpośrednio z parametrów i statystyk
   symulacji. Zero zależności sieciowej, zero LLM.
2. **LLM opcjonalny** (`narrator/askAI.ts` → backend `/api/ask`) — pytania
   otwarte użytkownika. Model dostaje stan symulacji, który użytkownik i
   tak widzi na ekranie (parametry, statystyki, już policzone bloki
   narracji) ORAZ wyciąg z `knowledge/<lab>.md` dopasowany po `labId` —
   jedyne dozwolone źródło dla twierdzeń wykraczających poza samą
   symulację (`buildKnowledgeIndex`/`knowledgeExcerptFor` w
   `packages/backend/src/lib.mjs`). System prompt wymaga oznaczenia
   każdego takiego twierdzenia jedną z sześciu gwiazdek pewności ze
   skali w `knowledge/README.md` — to wymuszenie promptem, nie
   programowa weryfikacja treści (patrz `knowledge/ai-discovery.md` §
   Ryzyka). Bez klucza `ANTHROPIC_API_KEY` backend odpowiada uczciwym
   `503`, warstwa 1 działa dalej bez zmian.

### Źródła danych i cytowania

`core/dataSource.ts` to rejestr źródeł danych, świadomie skopiowany z
kształtu `core/registry.ts` (labów) zamiast nowego wzorca — każde źródło
deklaruje `id`, `citation` (skąd, jaki poziom pewności), `isSynthetic` i
`load()`. Dwóch realnych konsumentów dziś: `particle-invmass.ts`
(`particle.dimuon-masses`, syntetyczne dopóki `data/dimuon-real.ts` nie
istnieje) i `universe-solar-system.ts` (`universe.solar-system-elements`,
realne stałe NASA od razu, `isSynthetic: false`) —
`scripts/fetch-real-data.mjs` wie, jak wygenerować dane dla pierwszego z
CERN Open Data, JPL Horizons czy ESA Gaia (wymaga sieci bez blokady na te
hosty, patrz README „Znane ograniczenia").

`core/citation.ts` eksportuje ten sam sześciopoziomowy `ConfirmationLevel`
co baza wiedzy i `NarrationBlock.citation?` — opcjonalne pole źródła,
renderowane przez `NarratorPanel` jako link. Nie każdy blok ma cytowanie
(byłoby to szumem informacyjnym); wpięte tam, gdzie twierdzenie odwołuje
się do konkretnego wyniku eksperymentalnego (masy PDG, testy Bella).

### Stwórz eksperyment — bezpieczne przez konstrukcję

Dostępne jako dodatkowa zakładka na KAŻDYM laboratorium
(`components/CustomExperimentTab.tsx`, dopięte w `LabShell.tsx`).
Świadomie NIE pozwala użytkownikowi pisać ani wykonywać kodu — wybiera się
wyłącznie wartości `lab.params`, tego samego kontraktu `Sim`/`ParamDef` co
reszta platformy. Zero nowej powierzchni ataku, zero sandboxingu do
budowania.

Dwa nowe moduły, oba czyste i przetestowane bez zależności od UI:
- `core/experimentRun.ts` — bufor kołowy nagranych próbek statystyk
  (300 próbek ≈ 5 minut przy kadencji 1/s)
- `core/experimentAnalysis.ts` — deterministyczna analiza przebiegu:
  trend (regresja liniowa najmniejszych kwadratów), wykrywanie płaskich
  przebiegów, skoków między próbkami, korelacji Pearsona między dwiema
  najbardziej dynamicznymi wielkościami. To jest właściwa „warstwa 0" dla
  tego trybu — ta sama filozofia co `narrator/engine.ts`: liczy prawdziwe
  dane, zero LLM, zero halucynacji.

Kluczowa decyzja architektoniczna: wynik analizy ma dokładnie kształt
`NarrationBlock[]`, więc trafia do TEGO SAMEGO `NarratorPanel` i
`askAI()`/backendu z groundingiem w `knowledge/<lab>.md`, którego już
używa reszta platformy. Zero nowego endpointu, zero równoległego systemu
promptów — to jest odpowiedź na wyraźne polecenie „nie twórz równoległych
systemów, wykorzystuj istniejącą architekturę wszędzie, gdzie to możliwe".
Presety parametrów zapisywane lokalnie (`core/customExperiment.ts`),
wzorzec identyczny z `discoveryLog.ts`.

### Sceny 3D (Three.js) — kiedy i jak

Domyślny silnik renderujący zostaje Canvas 2D (patrz „Świadome decyzje
architektoniczne" niżej — ta decyzja się NIE zmieniła dla większości
laboratoriów). Tam, gdzie głębia 3D realnie pomaga zrozumieć fizykę — dziś:
Universe Lab → „Układ Słoneczny 3D" (kamera pokazuje pod kątem, że orbity
leżą blisko jednej płaszczyzny, co samo tłumaczy powstanie z dysku
protoplanetarnego), Multiverse Lab → „Tesserakt (4D)" (obrót hipersześcianu)
i „Multiverse Nexus" (sala portali), Einstein Lab → „Czarna dziura 3D"
(geodezyjne fotonów w losowo zorientowanych płaszczyznach 3D + poświata
bloom) — czwarty niezależny konsument tego samego kontraktu, potwierdzenie
że się generalizuje, nie jednorazowy kod — jest opcjonalny drugi tor
renderowania, ŚWIADOMIE zaprojektowany jako lustro istniejącego kontraktu
`Sim`, nie równoległy system:

```ts
// core/three/types.ts — ten sam cykl życia co Sim, inny adapter renderujący
interface Sim3D {
  init(three, scene, camera, w, h): void;
  update(dt, params): void;       // CZYSTA fizyka — bez GPU, testowalna bez DOM
  syncScene(scene, camera): void; // jedyne miejsce dotykające THREE.Object3D
  getStats?(): Record<string, number>;
  reset?(): void;
  dispose?(): void;               // zwalnia geometrie/materiały/tekstury
}
```

`ExperimentDef.createSim3D?: () => Sim3D` obok istniejącego (teraz
opcjonalnego) `createSim?: () => Sim` — `LabShell.tsx` renderuje
`ExperimentView3D` zamiast `ExperimentView`, gdy `createSim3D` jest obecne;
`Controls`/`HonestyBadge`/`NarratorPanel`/`narrate()` są DOKŁADNIE te same
komponenty co dla 2D (`BelowStage` w `LabShell.tsx`) — różni się wyłącznie
silnik pod canvasem. Fizyka nie jest duplikowana: `universe-solar-system-3d.ts`
woła te same `keplerPosition()`/`PLANETS` co wersja 2D.

`core/three/useThreeLoop.ts` (lustro `useSimLoop.ts`: DPR, resize, rAF,
pauza w tle, wskaźnik) ładuje `three` przez DYNAMICZNY `import('three')` —
Vite tworzy osobny chunk (dziś ~688 kB, gzip ~177 kB), więc laboratoria bez
scen 3D nie płacą ani bajta w głównym bundlu (zmierzone: `dist/assets/index-*.js`
zostaje ~187 kB niezależnie od tego). Chunk trafia do cache Service Workera
dopiero po pierwszym wejściu do takiej sceny (cache-first w `public/sw.js`)
— pierwsza wizyta wymaga sieci, kolejne działają offline jak reszta PWA.
Kamera: `OrbitControls` z `three/examples/jsm` (przeciągnij/scrolluj).

**Postprocessing (bloom) — opcjonalny, per-scena.** `Sim3D.setupPostProcessing?()`
dostaje gotowe klasy (`EffectComposer`/`RenderPass`/`UnrealBloomPass`/`OutputPass`,
ładowane przez `useThreeLoop.ts` razem z `three` dla KAŻDEJ sceny 3D — moduły
są małe, jeden wspólny cykl ładowania jest prostszy niż per-Sim dynamiczny
import) i zwraca cienki `PostProcessor { render(), setSize(), dispose?() }`;
jeśli obecny, pętla renderuje przez niego zamiast gołego `renderer.render()`.
Pierwszy konsument: „Czarna dziura 3D" (Einstein Lab) — poświata dysku
akrecyjnego i horyzontu. WAŻNE zastrzeżenie uczciwości: to prawdziwa technika
postprocessingu (nie ozdoba), ale WebGL w przeglądarce mobilnej nie osiąga
jakości renderingu offline z produkcji filmowej (Interstellar, no.) —
honestyNote każdej sceny z bloomem mówi to wprost, żeby nie sugerować
fałszywego poziomu realizmu.

**Interakcja przez raycasting** (`multiverse-nexus.ts`): `Sim3D.pointer(x,y,type)`
dostaje współrzędne CSS px identycznie jak 2D `Sim.pointer`; sama sima
przechowuje referencję do `camera` zapisaną w `init()` i tworzy
`THREE.Raycaster`, żeby zamienić dotknięcie ekranu na trafienie w konkretny
obiekt sceny (`raycaster.intersectObjects(...)`) — bez tego 3D jest tylko
oglądalne, nie klikalne. Ważna pułapka odkryta przy budowie: `OrbitControls`
orbituje wokół `target` domyślnie `(0,0,0)`, więc `camera.position` musi być
REALNIE oddalone od tego punktu w `init()` — kamera blisko `(0,0,0)`
degeneruje się po pierwszym `controls.update()` i widok "ucieka" w
przypadkowym kierunku (naprawione w obu scenach 3D: kamera zawsze patrzy
na `(0,0,0)` z realnej odległości, nigdy nie stoi w tym punkcie).

### „Co by było, gdyby?" — scenario bridge

`data/whatIfScenarios.ts` to katalog pytań, każde mapowane WYŁĄCZNIE na
`Partial<SimParams>` istniejącego eksperymentu bazowego jednego
laboratorium — zero nowej fizyki, zero nowego silnika symulacji.
`core/scenarioBridge.ts` to jednorazowy, trzymany w pamięci (nie
`localStorage`, to nawigacyjna podpowiedź, nie trwałe ustawienie) most:
`WhatIfScreen.tsx` woła `setPendingScenario(labId, params)` i zmienia
`window.location.hash`; `LabShell.tsx` konsumuje go raz przy montowaniu
eksperymentu bazowego. Etykieta wiarygodności każdej karty (klasa `.honesty`)
jest czytana NA ŻYWO z `HonestyLevel` docelowego laboratorium — nie jest
wpisywana drugi raz ręcznie w danych scenariusza, więc nie może się z nią
rozjechać. `whatIfScenarios.test.ts` sprawdza w czasie budowania, że każdy
klucz parametru i każda wartość select/slider istnieje naprawdę w rejestrze
laboratoriów (żaden scenariusz nie może cicho nadpisać nieistniejącego pola).

Drugi konsument tego samego mostu: „Multiverse Nexus" (`multiverse-nexus.ts`)
woła `setPendingScenario`/zmienia hash bezpośrednio z WNĘTRZA klasy `Sim3D`
(nie z komponentu Reacta) — działa, bo `scenarioBridge.ts` to zwykły moduł
w pamięci, nie kontekst Reacta. Dwa różne wejścia UI (karta na osobnym
ekranie vs portal w scenie 3D), jeden mechanizm nawigacji.

Trzeci konsument: Discovery Timeline Engine (`DiscoveryTimeline.tsx`).
Wymagał rozszerzenia mostu: dotychczas `setPendingScenario` trafiało
WYŁĄCZNIE w eksperyment bazowy laboratorium (`exp.id === '__base'` w
`LabShell.tsx`), bo „Co by było, gdyby?" i Multiverse Nexus zawsze celowały
w bazowy widok. Discovery Timeline chce trafiać w KONKRETNY eksperyment
(np. epoka „Układ Słoneczny" → dokładnie zakładka „Prawdziwy Układ
Słoneczny" w Universe Lab, nie bazowa „Ekspansja"). `setPendingScenario`
przyjmuje teraz opcjonalny trzeci argument `experimentId`;
`consumePendingScenario` zwraca `{ params, experimentId? }` zamiast gołych
parametrów. `LabShell.tsx` konsumuje scenariusz RAZ na całe życie
komponentu (przez leniwy inicjalizator `useState`, nie przy każdym
przełączeniu zakładki) i ustawia startowy indeks zakładki na podstawie
`experimentId`, jeśli obecny — w pełni kompatybilne wstecznie z dwoma
istniejącymi wywołującymi, które nigdy nie podają trzeciego argumentu.

### Discovery Timeline Engine — drugi tryb wejścia

Flagowa funkcja: jedna, ciągła podróż przez 15 epok historii Wszechświata
(`data/timeline.ts`), dostępna pod `#/timeline` obok siatki laboratoriów.
Architektura celowo reużywa TRZY już istniejące, przetestowane mechanizmy
zamiast budować nowy system:

1. **Suwak logarytmiczny** (`core/logSlider.ts`) — czysta matematyka
   wydzielona ze Scale Journey (`logSliderValue`/`logSliderPosition`),
   teraz współdzielona przez DWIE niezależne osie tego samego ekranu: czas
   (Wielki Wybuch → daleka przyszłość, ~150 rzędów wielkości w sekundach) i
   skalę przestrzenną (kwark → obserwowalny Wszechświat, kamienie milowe
   wydzielone do `data/scaleMilestones.ts`, współdzielone dosłownie ze
   Scale Journey — jedna aktualizacja rozmiaru trafia do obu miejsc).
2. **Cross-fade bez ekranów ładowania** (`core/timelineMath.ts::epochBlend`)
   — w każdej klatce renderer znajduje DWIE sąsiednie epoki otaczające
   bieżący wiek i miesza je (`ctx.globalAlpha`) proporcjonalnie do
   odległości w log-czasie. Ekran nigdy nie jest pusty ani nie czeka —
   to rozwiązanie UX „bez przeładowań", nie symulacja fizyczna ciągłej
   ewolucji Wszechświata.
3. **Scenario bridge** (patrz wyżej) — trzeci konsument, teraz z obsługą
   `experimentId`.

Nowy element: 15 odrębnych scen Canvas 2D
(`components/discoveryTimelineScenes.ts`), po jednej na epokę, każda
czysta funkcja `(ctx,w,h,t)→rysunek` gdzie `t` to niezależny zegar animacji
(NIE pozycja na osi czasu) — sceny żyją własnym echem niezależnie od tego,
gdzie stoi suwak, więc autoodtwarzanie i ręczne przewijanie wyglądają
identycznie płynnie. Rejestr `EPOCH_SCENES: Record<string, SceneFn>`
mapuje `TimelineEpoch.id` na renderer; test integralności danych
(`timelineMath.test.ts`) pilnuje, że każda epoka w `data/timeline.ts` ma
odpowiadający wpis.

Uczciwość naukowa: każda epoka niesie własny `ConfirmationLevel` (ta sama
6-stopniowa skala co cytowania wszędzie indziej — core/citation.ts), NIE
nowa taksonomia. Rekombinacja/CMB są ★★★★★, daleka przyszłość jest ★★
(hipoteza) — widoczne na żywo jako kolorowa plakietka w panelu epoki.

### Quantum Decision Explorer — narzędzie narracyjne, świadomie POZA skalą naukową

Trzeci tryb wejścia (`#/decision-explorer`), architektonicznie inny niż
Discovery Timeline: to NIE model fizyczny, więc świadomie NIE dostaje
`ConfirmationLevel` ani `HonestyLevel` — te skale mierzą stopień
naukowego poparcia twierdzenia, a tu nie ma żadnego twierdzenia
naukowego do ocenienia. Zamiast etykiety wiarygodności: stały,
niedomykalny baner ostrzegawczy w `QuantumDecisionExplorer.tsx`
(`.qde-disclaimer`), widoczny na każdym ekranie tego trybu, nie tylko
przy pierwszym wejściu.

Dane (`core/decisionExplorer.ts`) są w 100% osobiste i lokalne —
`localStorage` przez `core/storage.ts`, dokładnie ten sam bezpieczny
wzorzec walidacji pole-po-polu co `discoveryLog.ts`/`settings.ts`
(uszkodzony zapis nigdy nie wywala ekranu, po prostu degraduje się do
przykładowych danych). Geometria rozkładu gwiazd w spirali
(`galaxyPosition`) używa kąta złotego (phyllotaxis) — jedyny faktycznie
"naukowy" element tego modułu to czysta geometria rozkładu punktów, ta
sama technika co węzły sieci energetycznej w `civilization.ts`, NIE
twierdzenie o naturze decyzji czy rzeczywistości.

`knowledge/quantum-decision-explorer.md` jawnie instruuje warstwę AI
(`askAI()`), by nigdy nie sugerowała przewidywania przyszłości ani
analizy "co by było" jako wyniku obliczeń — to zapisane przez
użytkownika przemyślenia, nie wynik silnika.

## Funkcje lokalne (bez backendu, bez konta)

`src/core/storage.ts` to jedyny punkt dostępu do `localStorage` w całej
aplikacji — bezpieczny wrapper (nigdy nie rzuca, degraduje się do no-op w
trybie prywatnym Safari czy przy wyłączonym storage). Na nim zbudowane są:

| Moduł | Co przechowuje | Kto czyta |
|---|---|---|
| `settings.ts` | redukcja ruchu, wysoki kontrast, kompaktowy Narrator, zgoda na analitykę | `useSettings()` (React), `applyDocumentFlags()` (klasy na `<html>`) |
| `analytics.ts` | liczniki zdarzeń UI (opt-out) | panel „Twoja aktywność" w Ustawieniach |
| `discoveryLog.ts` | odwiedzone (lab, eksperyment), odblokowane odznaki | ekran Dziennika odkryć |
| `search.ts` | (bez trwałości) indeks budowany z `getLabs()` na żądanie | paleta poleceń (`/`) |

Każdy odczyt z localStorage jest walidowany pole po polu (nie ufa całemu
zapisanemu obiektowi) — to jest granica zaufania, bo localStorage jest
edytowalny poza aplikacją (DevTools, stary format z przyszłej wersji).
Zero transmisji sieciowej z żadnego z tych modułów; to świadoma decyzja
architektoniczna, nie luka do wypełnienia.

## Backend

`packages/backend/src/server.mjs` używa gołego modułu `http` (bez
Express) w dwóch rolach: serwer statyczny produkcyjny (SPA fallback,
poprawne typy MIME, immutable cache dla hashowanych assetów) i proxy AI
(`POST /api/ask`, klucz API nigdy nie opuszcza serwera).

Cała logika bez efektów ubocznych sieciowych (walidacja wejścia, rate
limiter, rozwiązywanie ścieżek statycznych, nagłówki bezpieczeństwa) żyje
w `lib.mjs` — testowana przez `node --test` bez uruchamiania portu
(`lib.test.mjs`, 21 testów). `server.mjs` łączy tę logikę z
`http.createServer` i obsługą sygnałów (graceful shutdown).

## Testy

253 testy frontendowe (vitest) + 28 backendowych (`node --test`) = 281.

- **Fizyka i symulacje** (`__tests__/physics.test.ts`, `sims.test.ts`):
  twarde asercje naukowe (złamanie nierówności Bella |S|>2, twierdzenie
  Parsevala dla FFT, odwrócenie porządku czasowego w transformacji
  Lorentza) — nie tylko „nie rzuca wyjątku". Konkretny przykład wartości
  tej dyscypliny: test progu krytycznego b_c dla geodezyjnej Schwarzschilda
  (`stepSchwarzschildGeodesic`) wykrył realny, wcześniej niewidoczny błąd
  znaku w kroku całkowania (`+dphi` zamiast `-dphi`, niespójny z kierunkiem
  ruchu fotonu) — w praktyce KAŻDY foton w „Geodezyjne + dysk" był
  klasyfikowany jako „uciekł" niezależnie od parametru zderzenia. Naprawione
  w obu wersjach (2D i 3D), bo dzielą teraz jedną funkcję fizyki.
- **Funkcje lokalne** (`storage`, `settings`, `analytics`, `discoveryLog`,
  `search`, `registry`, `elements`, `glossary`, `dataSource`, `i18n`):
  każdy moduł osobno, włącznie ze ścieżkami degradacji (localStorage
  niedostępny, dane skorumpowane).
- **Backend** (`lib.test.mjs`): sanityzacja wejścia, rate limiting, oba
  wektory path traversal, obecność nagłówków bezpieczeństwa, ładowanie i
  przycinanie wyciągów z bazy wiedzy (z wstrzykniętym fake'owym czytnikiem
  plików — zero realnego dostępu do dysku w testach).

## Przyszły backend — punkty rozszerzenia (projekt, NIE zbudowane)

MVP celowo zostaje bez kont/bazy danych/płatności. Ten rozdział istnieje,
żeby dodanie tych rzeczy było decyzją o TYM, jak je dodać, a nie
przepisywaniem architektury od zera. Nic poniżej nie jest zaimplementowane.

**Dlaczego to w ogóle będzie potrzebne.** Funkcje lokalne (`storage.ts` i
moduły na nim, patrz wyżej) świetnie służą pojedynczemu użytkownikowi na
jednym urządzeniu. Nie obsłużą: postępu ucznia widocznego dla nauczyciela,
tego samego konta na telefonie i komputerze, wspólnego eksperymentu wielu
osób, ani danych do badania skuteczności edukacyjnej w skali większej niż
jedno urządzenie. To jest realny sufit obecnej architektury, nie hipoteza
— i to jest zamierzone: prostota MVP miała priorytet nad tą funkcją.

**Gdzie wpiąć konto/sesję.** `packages/backend/src/server.mjs` już ma
dokładnie ten kształt, w który wpina się REST API bez przepisywania: nowe
trasy obok istniejących `/api/health` i `/api/ask` (np. `/api/session`,
`/api/sync`), ten sam wzorzec `json()`/walidacji co `handleAsk`. Sesja =
nowa, osobna warstwa — NIE zamiennik `storage.ts`. Model docelowy: dane
lokalne zostają lokalnym cache'em/trybem offline (jak dziś), a warstwa
synchronizacji nakłada się na te same moduły (`settings.ts`,
`discoveryLog.ts`) przez ten sam kształt funkcji (`readJSON`/`writeJSON`),
tyle że zapisujące też do backendu, gdy zalogowany. Użytkownik bez konta
= dokładnie dzisiejsze zachowanie, bez regresji.

**Gdzie wpiąć bazę danych.** Backend dziś nie ma stanu poza limiterem
w pamięci (`createRateLimiter`, per-proces — już udokumentowane jako
ograniczenie do adresowania przy autoscale, patrz `SECURITY.md`). Baza
(Postgres/SQLite, do decyzji przy realnej potrzebie) wpinałaby się jako
kolejny moduł importowany przez `server.mjs`, analogicznie do `lib.mjs` —
czysta logika zapytań testowalna bez portu, `server.mjs` tylko łączy z
`http.createServer`. Minimalny schemat do zaprojektowania wtedy, nie
teraz: `users`, `sessions`, `progress` (odpowiednik dzisiejszego
`discovery-log/v1` per-user zamiast per-przeglądarka).

**Klasy/kohorty (funkcja edukacyjna z realną wartością komercyjną).**
Naturalne rozszerzenie modelu sesji: `classroom_id` grupujący `users`,
nauczyciel widzi zagregowany (nie per-uczniowski, RODO/COPPA) postęp.
Świadomie NIE projektuane szczegółowo tutaj — wymaga decyzji prawnej o
danych dzieci (patrz `SECURITY.md` „świadome ograniczenia") przed
jakimkolwiek kodem, nie tylko architektury.

**Co NIE zmienia się, gdy to wszystko powstanie:** kontrakt `LabDefinition`
i `Sim`, warstwa 0 Narratora, PWA offline, `core/dataSource.ts`. Backend z
kontem to dodatkowa warstwa nad dzisiejszą aplikacją, nie jej zastąpienie.

## Wizja platformy — kierunek, nie zaimplementowana lista (projekt)

Ambicją Genesis OS jest stać się jedną z najbardziej zaawansowanych
interaktywnych platform naukowych na świecie — to cel, do którego się
dąży, nie stwierdzenie stanu obecnego. Pełny, żywy katalog pomysłów
(Quantum Reality, wyższe wymiary, nanotechnologia, biologia molekularna,
Grand Challenges, Creator Platform/Marketplace, Founder Mode, XR…) jest w
[`VISION-BACKLOG.md`](VISION-BACKLOG.md) — świadomie osobny dokument,
żeby duża lista pomysłów nie zaśmiecała opisu architektury. Zasada tego
samego dokumentu: wdraża się 1–2 pozycje na sesję, nie wszystko naraz.
Poniższe punkty NIE są zbudowane;
każdy dostaje tu miejsce podpięcia w istniejącej architekturze, żeby
przyszła implementacja nie wymagała przepisywania rdzenia — zgodnie z
zasadą „nie twórz atrap, projektuj architekturę pod przyszłość".

- **Więcej scen 3D** — `Sim3D`/`useThreeLoop.ts` (patrz wyżej) jest już
  ogólnym wzorcem, nie kodem jednorazowym dla Universe Lab. Naturalni
  kolejni kandydaci: Einstein Lab (geodezyjne fotonów w 3D — dziś
  `einstein-geodesics.ts` liczy dokładne równanie geodezyjnej Schwarzschilda
  w 2D, widok z góry; 3D + soczewkowanie w stylu Interstellar to zmiana
  WYŁĄCZNIE warstwy `render`/`syncScene`, fizyka już istnieje), Nuclear Lab
  (Mapa nuklidów jako powierzchnia 3D energii wiązania zamiast płaskiej
  mapy ciepła — `semfBindingPerNucleon` już to liczy), Quantum Lab
  (orbitale atomowe jako bryły 3D zamiast przekroju 2D w Atom Lab).
- **Chemistry Lab** — ✅ zbudowane (pierwszy eksperyment: Wiązania chemiczne,
  `labs/chemistry.ts` + `core/physics.ts::bondPolarity` +
  `data/electronegativity.ts` + `knowledge/chemistry.md`). Elektroujemność
  Paulinga (dane tabelaryczne CRC Handbook) steruje CIĄGŁĄ wizualizacją
  chmury elektronowej od kowalencyjnej po jonową, nie przełącznikiem trzech
  stanów — ta sama „emergent, not decorative" zasada co reszta platformy.
  Backlog na przyszłość (NIE zbudowane): geometria molekularna VSEPR jako
  model 3D cząsteczek (kulki-i-pałeczki przez `Sim3D`, analogicznie do
  Układu Słonecznego 3D), krzywe miareczkowania pH, trendy okresowe
  (promień atomowy, energia jonizacji) wykorzystujące istniejący układ
  okresowy z Atom Lab, realne dane geometrii cząsteczek (PubChem/CCCBDB —
  domena publiczna, do zweryfikowania przy realnym dostępie do sieci).
- **AI Professor** — rozszerzenie WARSTWY 1 Narratora (patrz
  `knowledge/ai-discovery.md`), nie nowy system: dziś `askAI()` odpowiada
  na pytanie w kontekście stanu symulacji; „profesor" różniłby się tym, że
  SAM inicjowałby uwagę przy wykryciu ciekawego stanu (np. duży skok w
  `core/experimentAnalysis.ts` — mechanizm detekcji już istnieje w
  „Stwórz eksperyment"). Wymaga decyzji o koszcie (częstsze wywołania LLM)
  przed implementacją, nie tylko kodu.
- **Challenge Mode** — deklaratywne cele nad ISTNIEJĄCYMI statystykami
  symulacji (`Sim.getStats()`), analogicznie do `ACHIEVEMENTS` w
  `core/discoveryLog.ts` (`check: (stats) => boolean`), tylko z
  prowadzeniem użytkownika krok po kroku zamiast biernego odznaczania.
  Zero nowej infrastruktury fizycznej — czysto warstwa UI + treści nad
  tym, co już się liczy.
- **Community (współdzielenie eksperymentów/laboratoriów)** — naturalne
  rozszerzenie `core/customExperiment.ts` (dziś: zapis presetu parametrów
  lokalnie) o publikację do backendu z kontem (patrz „Przyszły backend"
  wyżej: `/api/session`, `/api/sync`). Publikowany obiekt to dokładnie
  `{ labId, params }` — ten sam kształt co dziś w `localStorage`, tylko
  ze zdalnym storage zamiast lokalnego. Ocenianie/ranking eksperymentów i
  „publikowanie własnych światów/laboratoriów" (kod użytkownika) to
  zupełnie inna, znacznie poważniejsza decyzja bezpieczeństwa (sandboxing
  wykonania) — świadomie nierozwiązana tutaj, wymaga osobnej analizy
  zagrożeń zanim padnie jakikolwiek kod.
- **Founder Mode (panel administracyjny)** — osobna rola/trasa w tym
  samym backendzie z kontem (`/api/admin/*`, chronione osobnym
  middleware autoryzacji, nie hasłem w kodzie), dająca: edycję
  `knowledge/*.md` bez redeployu, podgląd `core/analytics.ts` zagregowany
  po wszystkich użytkownikach (dziś: wyłącznie per-przeglądarka), włącznik
  eksperymentów w fazie beta (feature flag nad `registerLab()`/
  `registerExperiment` — dziś rejestr jest statyczny, flaga wymagałaby
  warunku przy rejestracji, nie przebudowy). Wymaga kont i bazy danych
  jako fundamentu — kolejność zależności, nie wybór.

Wspólny mianownik wszystkich punktów: żaden nie wymaga zastąpienia
`LabDefinition`/`Sim`/`Sim3D`/`NarrationBlock`/`ConfirmationLevel` — to są
kontrakty, na których cała reszta ma się opierać przez najbliższe lata, nie
tylko najbliższą sesję.

## Świadome decyzje architektoniczne

- **Canvas 2D jako domyślny silnik, WebGL (Three.js) tylko selektywnie**
  (zmieniona decyzja — pierwotnie było „Canvas 2D, nie WebGL"). Dla
  zdecydowanej większości laboratoriów prostota i przenośność Canvas 2D
  wciąż wygrywają przy tej skali symulacji (setki, nie miliony, obiektów).
  Ale tam, gdzie trzeci wymiar sam tłumaczy fizykę (np. spłaszczenie
  Układu Słonecznego widoczne dopiero pod kątem kamery) — WebGL przez
  opcjonalny `Sim3D` (patrz „Sceny 3D" wyżej), leniwie ładowany, żeby nie
  psuć budżetu wydajności/rozmiaru dla labów, które go nie potrzebują.
  Uzasadnienie zmiany: portowalność „granicy `render()`" pozostaje —
  zamieniamy JEDEN adapter renderujący na DRUGI, nie przepisujemy fizyki.
- **Brak route-based code splitting** — rejestr laboratoriów
  (`labs/index.ts`) jest synchroniczny; od tego zależy zweryfikowane
  działanie offline PWA i `sims.test.ts`. Zamiast tego: bezpieczny
  `manualChunks` (React w osobnym, długo cache'owalnym chunku).
  Rozdzielenie na lazy-loaded route'y jest możliwe później, ale wymaga
  osobnego przeglądu wpływu na cache service workera — świadomy
  kompromis: mniejszy pierwszy bundle kosztem złożoności, dziś priorytet
  ma stabilność offline.
- **Brak Express/frameworka backendowego** — powierzchnia ataku i liczba
  zależności runtime jest dziś ważniejsza niż wygoda routingu przy trzech
  endpointach.
- **Brak jsdom w testach frontendowych** — testy DOM-owe (fokus, klasy na
  `<html>`) używają lekkich ręcznych fake'ów zamiast ciężkiej zależności;
  prawdziwe zachowanie przeglądarki weryfikują smoke-testy Playwright
  (nie w CI — ręcznie przy większych zmianach UI).
- **Sufit realizmu grafiki: stylizowany-realistyczny, nie fotorealistyczny**
  — świadome ograniczenie, nie brak ambicji. WebGL w przeglądarce mobilnej
  przy 60 FPS nie odtworzy jakości renderingu offline z produkcji filmowej
  (godziny na klatkę na farmie renderującej) — żaden framework tego nie
  zmienia. Realne, uczciwe wzmocnienia: bloom (`UnrealBloomPass`, patrz
  „Sceny 3D"), bogatsze pola cząstek, lepsze materiały. Każda scena z
  takim efektem mówi to wprost w `honestyNote`, żeby nie sugerować
  poziomu realizmu, którego platforma nie dostarcza.
