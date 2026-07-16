# Genesis OS

**Genesis OS** — mobilna platforma do eksploracji fizyki, kosmologii i nauki poprzez
interaktywne symulacje oraz warstwę AI. Od kwarku (10⁻¹⁸ m) do obserwowalnego
Wszechświata (8,8×10²⁶ m).

---

## What Genesis actually is (read this first — 2026-07 audit)

This repository contains **three layers**. Be clear about which one you are evaluating:

1. **Science-education / simulation platform** (the historical core, described below) —
   physics/astronomy/chemistry simulations and a cosmology timeline.
2. **A "cognitive" scientific-reasoning backend** (`packages/backend/src/cognitive`, ~6.5k
   LOC, real + tested) — deterministic orchestration whose real-world scientific *utility*
   is unproven.
3. **A commercial "Grounded Chemistry" product** (Stages 4–7) — the honest, well-tested
   molecule-analysis → comparison → **research-campaign** workflow. **This is the part with
   a defensible commercial and scientific thesis.**

The product's promise is narrow and real: *trustworthy molecule triage an AI cannot
fabricate.* Real RDKit descriptors, a transparent self-explaining ranking, provenance on
every value, and an explicit refusal to predict biology/efficacy/toxicity. Every displayed
value is tagged ✓ Verified / ⚠ Grounded / ⓘ General, and nothing is shown without a tag.

### Product documentation
| Doc | What it covers |
|-----|----------------|
| [SCIENTIFIC_ENGINE.md](SCIENTIFIC_ENGINE.md) | Real RDKit core, developability score, what is never computed |
| [GROUNDING.md](GROUNDING.md) | The anti-hallucination guardrail for AI answers |
| [PROVENANCE.md](PROVENANCE.md) | Per-descriptor provenance + reproducible analysis hash |
| [CAMPAIGNS.md](CAMPAIGNS.md) | Research Campaigns: batch analysis, ranking, decision trace, export |
| [API.md](API.md) | Public `/api/v1` (analyze / render) + tiers |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Build, container, config, production blockers |
| [SECURITY.md](SECURITY.md) | Backend security posture + open blockers |
| [ROADMAP.md](ROADMAP.md) · [COMMERCIALIZATION.md](COMMERCIALIZATION.md) · [GRANTS.md](GRANTS.md) | Product-validation phase, business, funding |
| **[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)** | **The unflinching audit — read before trusting anything** |
| [FUTURE_WORK.md](FUTURE_WORK.md) | Backlog, ordered by anticipated impact (to be re-ranked by real users) |

> **Honesty note:** Genesis is a credible early-stage computational tool with exceptional
> scientific transparency — **not** a validated discovery platform. It computes descriptors
> correctly; it has not yet been shown to improve a real research decision, and it has real
> production/security blockers (KNOWN_LIMITATIONS.md §2). Do not overestimate its readiness.

---

## Obecny stan

- **Quantum Decision Explorer** — galaktyka złożona z decyzji użytkownika:
  każda gwiazda to jedna decyzja życiowa, suwak osi czasu przesuwa aktywną
  gwiazdę i pokazuje jej alternatywne ścieżki jako świecące odgałęzienia.
  Każde odgałęzienie niesie PRAWDZIWĄ symulację Monte Carlo (dyskretny
  proces Wienera z dryfem, `core/decisionMonteCarlo.ts`) — suwak horyzontu
  (1–100 lat) pokazuje na żywo, jak rozrzut wachlarza rośnie jak √czas
  (realna własność matematyczna, zweryfikowana testem statystycznym), z
  kierunkiem/zmiennością sterowanymi wyłącznie własnymi ocenami
  użytkownika ("ton" ścieżki, "waga" decyzji). Jawny, stały baner: to
  narzędzie narracyjne inspirowane wizualnie fizyką i matematyką
  niepewności, NIE model predykcyjny ani przewidywanie przyszłości. 100%
  lokalne dane (localStorage). Trzeci tryb wejścia do Genesis OS — patrz
  `#/decision-explorer`
- **Discovery Timeline Engine** — flagowe doświadczenie: jedna, ciągła
  podróż przez 15 epok historii Wszechświata (Wielki Wybuch → daleka
  przyszłość), zero ekranów ładowania (ciągły cross-fade między sąsiednimi
  epokami), pełne sterowanie czasem (pauza/przewijanie/przyspieszanie/skok
  w dowolne miejsce) i niezależna soczewka skali (kwark → obserwowalny
  Wszechświat, ta sama technika co Scale Journey). Drugi, obok siatki
  laboratoriów, tryb wejścia do Genesis OS — patrz `#/timeline`
- **Scale Journey** — płynna podróż przez 45 rzędów wielkości (ekran główny)
- **13 laboratoriów-pluginów**, każde z wieloma eksperymentami i Narratorem AI:
  Universe, Space-Time, Einstein, Quantum, Atom, Nuclear, Particle, Chemistry,
  Multiverse, Civilization, Biology, Mathematics, AI Discovery
- **Narrator AI, dwie warstwy**: deterministyczny silnik liczący realne wielkości
  fizyczne z żywych parametrów symulacji (zawsze aktywny) + opcjonalne pytania
  otwarte przez backend LLM ("Zapytaj AI"), ugruntowane wyłącznie w stanie
  symulacji widocznym na ekranie
- **Etykiety uczciwości naukowej** na każdym module: dokładne wzory / model
  uproszczony / model edukacyjny / hipoteza
- **Mapa nuklidów** (Nuclear Lab): ciągła "dolina stabilności" liczona z
  półempirycznego wzoru na masę (SEMF/Weizsäcker), z nałożonymi ~55 realnie
  zmierzonymi izotopami (NNDC) — dotknij dowolnego (Z,N), by zobaczyć
  przewidywanie modelu albo, jeśli trafisz w kropkę, prawdziwy okres
  półtrwania i tryb rozpadu z cytowaniem źródła
- **Laboratorium cząstek**: masy i szerokości rezonansów prawdziwe (PDG), metoda
  identyczna z tą, którą odkryto J/ψ i Z⁰ (histogram masy niezmienniczej par
  mionów) — ale sam zbiór zderzeń jest dziś syntetyczny, wzorowany na widmach
  CMS. Realne CERN Open Data (CC0) mają udokumentowany punkt podpięcia
  (`src/data/dimuon-real.ts`), ale nie są jeszcze załadowane — patrz
  "Znane ograniczenia" niżej
- **PWA w pełni offline** — service worker, manifest, zweryfikowane działanie
  bez sieci
- **Funkcje lokalne, bez konta i bez backendu**: Ustawienia (redukcja ruchu,
  wysoki kontrast, opt-out z lokalnej statystyki aktywności), paleta poleceń
  (`/`), Dziennik odkryć (10 odznak odblokowanych z realnych progów fizycznych),
  Słowniczek — wszystko w `localStorage`, zero transmisji sieciowej
- **Dostępność**: skip link, pułapka fokusu w nakładkach, `aria-live` w
  Narratorze, granica błędu per-laboratorium
- **Stwórz eksperyment** — na każdym laboratorium: swobodnie dobierz
  parametry, nagraj przebieg, dostań deterministyczną analizę trendu
  (rośnie/maleje/płasko, skoki, korelacje) bez LLM, zapytaj AI o wyniki z
  tym samym groundingiem w bazie wiedzy co reszta platformy. Bezpieczne
  przez konstrukcję — zero wykonywania kodu użytkownika
- **"Co by było, gdyby?"** — katalog dramatycznych pytań fizycznych (np.
  "gdyby zniknęła ciemna energia", "gdyby czarna dziura wirowała"), każde
  to nadpisanie parametrów ISTNIEJĄCEGO eksperymentu, nie nowa symulacja;
  etykieta wiarygodności karty pochodzi na żywo z tego samego systemu
  uczciwości naukowej co reszta platformy
- **Układ Słoneczny w 3D** (Three.js/WebGL, Universe Lab) — ta sama
  dokładna fizyka Keplera co wersja 2D, tylko z kamerą do obracania i
  przybliżania; ładowany leniwie (dynamiczny import), więc laboratoria bez
  scen 3D nie płacą za tę zależność w głównym bundlu
- **Zredesignowany design system** — spójna, "instrumentowa" estetyka
  (szkło, świecące akcenty kodujące stan, nie ozdoba) w całej aplikacji,
  każde laboratorium zachowuje własny kolor akcentu
- **Tesserakt 4D** (Multiverse Lab) — obrót w płaszczyźnie 4D i rzut do 3D,
  dokładna algebra liniowa (nie spekulacja o fizycznych dodatkowych
  wymiarach — to osobna, jasno odróżniona kwestia)
- **Multiverse Nexus** — 3D sala portali (Three.js), oryginalna metafora
  Genesis OS (nie kopia żadnego filmu/serialu): portale „lokalne" pokazują
  inne stałe fizyczne, portale-tunele NAPRAWDĘ przenoszą do innego
  laboratorium przez ten sam most co "Co by było, gdyby?"
- **Czarna dziura 3D** (Einstein Lab) — dokładna geodezyjna zerowa
  Schwarzschilda w 3D (fotony w losowo zorientowanych płaszczyznach),
  dysk akrecyjny z poświatą (prawdziwy bloom, `UnrealBloomPass`)
- **Chemistry Lab** (nowe laboratorium) — wiązania chemiczne: różnica
  elektroujemności Paulinga (dane tabelaryczne, CRC Handbook) steruje CIĄGŁĄ
  wizualizacją chmury elektronowej od kowalencyjnej po jonową (wzór
  Hanney–Smitha), nie przełącznikiem trzech stanów
- **Problem trzech ciał** (Universe Lab) — integrator symplektyczny
  (velocity-Verlet) z adaptacyjnym krokiem, dwa realne układy startowe
  (ósemka Moore/Chenciner–Montgomery, problem pitagorejski Burrau 1913),
  tryb "dwa niemal identyczne starty" pokazujący na żywo wykładniczy
  rozjazd trajektorii (efekt motyla) — problem, który zapoczątkował
  teorię chaosu (Poincaré 1887)
- **Krzywa rotacji galaktyki** (Universe Lab) — najsilniejszy pojedynczy
  dowód obserwacyjny na ciemną materię (Rubin, Ford & Thonnard 1978, 1980):
  suwak masy halo pokazuje, jak dodanie niewidocznej materii spłaszcza
  krzywą do zgodności z realnymi pomiarami; przełącznik MOND (Milgrom
  1983) pokazuje konkurencyjną hipotezę — ta sama płaska krzywa bez żadnej
  ciemnej materii, tylko zmodyfikowanym prawem grawitacji
- **Trendy okresowe** (Atom Lab) — mapa cieplna promienia atomowego i
  energii jonizacji na siatce 118 pierwiastków (okresy 1–4, dane CRC
  Handbook / NIST / Slater 1964), reużywa tę samą siatkę co widok Powłoki
- **Geometria molekularna VSEPR w 3D** (Chemistry Lab) — model
  kulki-i-pałeczki, 13 standardowych geometrii (Gillespie & Nyholm, 1957);
  dla NH₃/H₂O kąty wiązań są prawdziwymi zmierzonymi wartościami
  (106,8°/104,5°, NIST/CCCBDB), nie idealizacją
- **Podwójne wahadło** (Universe Lab) — drugi eksperyment chaosu
  deterministycznego, obok problemu trzech ciał: dokładne równania
  Lagrange'a, integrator RK4 (celowo nie symplektyczny — dryf energii
  jawnie pokazany), suwak kąta pokazuje przejście od ruchu regularnego
  do chaotycznego na żywo
- **Chirp fali grawitacyjnej z dźwiękiem** (Einstein Lab) — pierwszy
  dźwięk w Genesis OS: formuła kwadrupolowa wiodącego rzędu (ta sama
  metoda co pierwsza detekcja LIGO, GW150914), opcjonalny toggle 🔊
  syntezuje realną, żywo liczoną częstotliwość fali (Web Audio API) —
  częstotliwości z łączących się czarnych dziur leżą w ludzkim zakresie
  słyszalności bez potrzeby przesuwania wysokości dźwięku
- **Miareczkowanie kwas–zasada** (Chemistry Lab) — krzywa liczona
  dokładnym równaniem bilansu ładunku (nie tylko przybliżeniem
  Hendersona–Hasselbalcha), 4 realne słabe kwasy z tabelarycznym Ka;
  punkt równoważnikowy słabego kwasu pokazany jako zasadowy (pH>7),
  naprawiając częsty błąd popularnonaukowy
- **Napięcie Hubble'a** (Universe Lab) — trzy prawdziwe, opublikowane
  pomiary stałej Hubble'a (SH0ES, Planck CMB, TRGB) jako rozkłady
  prawdopodobieństwa obok siebie; suwak pokazuje na żywo, ile hipotetycznej
  "ukrytej" systematyki wystarczyłoby, by rozwiązać ten realny,
  nierozstrzygnięty spór kosmologiczny bez odwoływania się do nowej fizyki
- **Diagram obwodu kwantowego** (Quantum Lab, Sfera Blocha) — dokładne
  macierze unitarne 2×2 (H, X, Y, Z, S, T), sekwencja zastosowanych bramek
  rysowana jako prawdziwy obwód (konwencja IBM Quantum Composer), test
  unitarności dla każdej bramki oraz jawny dowód nieprzemienności (X∘Z ≠
  Z∘X); CNOT i splątanie świadomie pozostają w backlogu (wymagają
  4-wymiarowego wektora stanu, nie pojedynczej sfery Blocha)
- **Wirująca czarna dziura Kerra w 3D** (Einstein Lab) — dokładne
  geodezyjne równikowe (Boyer–Lindquist, Carter 1968), zweryfikowane
  zgodnością ze Schwarzschildem przy zerowym spinie i znanymi granicami
  ekstremalnymi orbit fotonowych (Bardeen 1972; Teo 2003); efekt
  wleczenia układów inercjalnych (frame-dragging, Gravity Probe B 2011)
  widoczny wprost — orbita prograde bliżej horyzontu niż retrograde;
  horyzont i ergosfera renderowane jako dokładne powierzchnie 3D
- **Model Isinga — przejście fazowe** (Chemistry Lab) — jedyny
  nietrywialny model przejścia fazowego z pełnym rozwiązaniem
  analitycznym w 2D (Onsager 1944); dokładna temperatura krytyczna
  T_c=2/ln(1+√2)≈2,269 i dokładna spontaniczna magnetyzacja Onsagera/
  Yanga poniżej T_c, algorytm Metropolisa na siatce 42×42; "critical
  slowing down" głęboko poniżej T_c uczciwie nazwane przez Narratora,
  nie ukryte
- **Atraktor Lorenza** (Universe Lab, 3D) — trzeci eksperyment chaosu
  deterministycznego obok problemu trzech ciał i podwójnego wahadła;
  klasyczne równania Lorenza (1963), dokładny próg homoklinicznego
  wybuchu chaosu ρ_h≈24,74 (Sparrow 1982), tryb "dwa niemal identyczne
  starty" pokazujący efekt motyla w trzeciej, jakościowo innej klasie
  układu chaotycznego
- **Stabilność układu planetarnego** (Universe Lab) — prawdziwa
  grawitacja N-ciał (Słońce+Jowisz+Saturn+Ziemia+Mars, velocity-Verlet,
  G=4π² dokładnie w jednostkach AU/rok/M_słońca), NIE niezależne elipsy
  Keplera; wyłączenie gigantów mierzalnie zmniejsza dryf mimośrodu Marsa
  (~15× po 12 latach symulacji) — namacalny, zmierzony skutek
  grawitacyjnego zaburzenia, nie deklarowany efekt
- **Biology Lab (12. laboratorium)** — transport przez błonę komórkową
  (model płynnej mozaiki, pompa Na⁺/K⁺-ATPaza ze zmierzoną stechiometrią
  3 Na⁺:2 K⁺:1 ATP, Nagroda Nobla 1997), podwójna helisa DNA w 3D
  (dokładna geometria B-DNA Watson-Crick 1953, temperatura topnienia z
  reguły Wallace'a — helisa widocznie się rozdziela powyżej obliczonej
  Tm) i fałdowanie białka modelem HP (Dill 1985; Lau & Dill 1989,
  algorytm Metropolisa jak model Isinga — globalne minimum energii
  udowodnione NP-trudne, Crescenzi i in. 1998)
- **Teleportacja kwantowa** (Quantum Lab) — pełny wektor stanu 3 kubitów
  (nie przybliżenie), protokół Bennetta i in. (1993): wierność
  odtworzonego stanu = dokładnie 100% w każdej z 4 gałęzi pomiaru dla
  dowolnego stanu wejściowego; jawnie naprawiony częsty błąd
  popularnonaukowy — to NIE transmisja szybsza niż światło (potrzeba 2
  bitów klasycznych) i NIE kopiowanie (oryginał niszczony pomiarem)
- **Mathematics Lab (nowe, 13. laboratorium)** — bezpieczna piaskownica
  równań: parser wyrażeń bez `eval()`/`Function()` (tokenizer → AST →
  ewaluator z białą listą funkcji), różniczkowanie symboliczne DOKŁADNE
  (standardowe reguły rachunku różniczkowego, krok po kroku), całkowanie
  numeryczne (metoda Simpsona) i równania różniczkowe (pole kierunkowe +
  RK4 — ta sama metoda co atraktor Lorenza) — jawnie odróżnione
  "dokładne" od "numeryczne" w interfejsie
- **424 testów** (396 vitest frontend + 28 node:test backend)

## Uruchomienie

```bash
npm install
npm run dev        # frontend: http://localhost:5000
npm test           # 424 testów (fizyka + funkcje lokalne + backend)
npm run build      # produkcyjny build do packages/frontend/dist (PWA offline)

# Opcjonalny backend AI ("Zapytaj AI" w laboratoriach):
ANTHROPIC_API_KEY=sk-ant-... npm run dev:backend   # port 8080
```

Wymagania: Node.js ≥ 18. Bez backendu wszystko poza pytaniami otwartymi do AI
liczy się na urządzeniu i działa w pełni offline (PWA).

## Architektura pluginowa

```
packages/frontend/src/
├── core/        # kontrakty (types.ts), rejestr pluginów, pętla symulacji,
│                # ustawienia/analityka/dziennik odkryć/wyszukiwanie (localStorage)
├── labs/        # laboratoria — niezależne moduły; manifest w index.ts
├── narrator/    # warstwa AI (provider lokalny + interfejs LLM)
├── components/  # UI: LabShell, Controls, NarratorPanel, ScaleJourney,
│                # SettingsScreen, DiscoveryLogScreen, GlossaryScreen, SearchOverlay
└── data/        # dane naukowe (118 pierwiastków, słowniczek pojęć)

packages/backend/src/
├── server.mjs   # http.createServer: static + /api/ask + /api/health
└── lib.mjs      # czysta logika (walidacja, rate limit, ścieżki) — testowana
                 # bez uruchamiania serwera (node --test)
```

Nowe laboratorium = nowy plik w `src/labs/` + jedna linia `registerLab()` w
`src/labs/index.ts`. Rdzeń aplikacji nie zna żadnego laboratorium z nazwy.
Więcej: [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Granica przenośności** (Unity / Unreal / natywnie): logika fizyki
(`update`, `getStats`, parametry) to czysty TypeScript bez zależności od
DOM/Reacta. Web-specyficzny jest tylko cienki adapter renderujący — Canvas 2D
dla większości laboratoriów, opcjonalnie WebGL (Three.js) przez ten sam
kontrakt (`Sim3D`) tam, gdzie 3D realnie pomaga zrozumieć fizykę (patrz
`ARCHITECTURE.md` „Sceny 3D") — i UI. Komentarz w `src/core/registry.ts`.

## Zasada uczciwości naukowej

Jeżeli czegoś nie da się wiernie zasymulować na telefonie, nie udajemy:
każdy moduł nosi widoczną etykietę poziomu wierności, a hipotezy
(multiwersum, napęd Alcubierre'a, rój Dysona) nigdy nie są przedstawiane
jako fakty.

## Znane ograniczenia

Uczciwość naukowa dotyczy też tego dokumentu, nie tylko UI:

- **Dane w laboratorium cząstek są syntetyczne**, nie realnymi zderzeniami CERN
  Open Data — mimo że masy rezonansów (PDG) i metoda (histogram masy
  niezmienniczej) są prawdziwe. Sieć w środowisku, w którym rozwijana jest ta
  aplikacja, blokuje `opendata.cern.ch`, `ssd.jpl.nasa.gov` i
  `gea.esac.esa.int` na poziomie polityki bramki (403, nie chwilowa awaria —
  zweryfikowane przez `curl "$HTTPS_PROXY/__agentproxy/status"`), więc żadne
  z tych źródeł nigdy nie zostało realnie pobrane z tej sesji. Uruchom z
  sieci bez tej blokady: `node scripts/fetch-real-data.mjs cern` (analogicznie
  `jpl`, `gaia`, `all`) — skrypt zapisuje dane w `packages/frontend/src/data/`,
  a `core/dataSource.ts` (rejestr źródeł danych) i istniejący mechanizm
  podpięcia w `particle-invmass.ts` wykrywają je automatycznie, bez zmian w
  kodzie aplikacji. Skrypt jest napisany, ale nieprzetestowany end-to-end
  z tego samego powodu — dokładne pola API do zweryfikowania przy pierwszym
  uruchomieniu, patrz komentarze „DO ZWERYFIKOWANIA" w jego kodzie.
- **"Zapytaj AI" wymaga `ANTHROPIC_API_KEY`** (patrz `.env.example`) — bez
  klucza backend zwraca uczciwy błąd 503 zamiast fałszywej odpowiedzi.
  Komunikat widoczny dla UŻYTKOWNIKA jest celowo ogólny
  (`packages/backend/src/lib.mjs` → `AI_UNAVAILABLE_MESSAGE`), bez nazwy
  zmiennej środowiskowej ani innych szczegółów konfiguracji serwera —
  reszta platformy, w tym Narrator deterministyczny (warstwa 0), działa
  bez zmian, w pełni offline.
- **Brak kont, bazy danych i płatności** — świadomie poza zakresem; wzorzec
  rozszerzenia opisany w `ARCHITECTURE.md`.

## Dokumentacja

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — kontrakty, granica przenośności, warstwy AI, bezpieczeństwo
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — konwencje projektu, jak dodać laboratorium, wymagania przed commitem
- [`CHANGELOG.md`](CHANGELOG.md) — historia zmian
- [`SECURITY.md`](SECURITY.md) — model zagrożeń
- [`RESEARCH.md`](RESEARCH.md) i [`knowledge/`](knowledge/) — Genesis Knowledge Base (źródła naukowe per laboratorium)
- [`VISION-BACKLOG.md`](VISION-BACKLOG.md) — katalog pomysłów na przyszłość (nie lista zadań — wdraża się 1–2 na raz)
- Raporty etapów: [`RAPORT-ETAP-0.md`](RAPORT-ETAP-0.md) · [`RAPORT-ETAP-1.md`](RAPORT-ETAP-1.md) ·
  [`RAPORT-ETAP-2.md`](RAPORT-ETAP-2.md) · [`RAPORT-AUDYT.md`](RAPORT-AUDYT.md) ·
  [`RAPORT-AUDYT-2.md`](RAPORT-AUDYT-2.md)

Wdrożenie: Replit (Run/Deploy) albo `docker compose up --build`.

### Dokumentacja Genesis OS v1.0

- [`docs/GENESIS_V1_COMPLETION_REPORT.md`](docs/GENESIS_V1_COMPLETION_REPORT.md) — raport zgodności z Definition of Done + gotowość i Top 20 ROI.
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) — pełny opis HTTP API (auth, compute, projekty, kampanie, Truth Engine, Discovery Forge, Necropolis).
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — runbook produkcyjny (Docker/Replit/VPS, zmienne środowiskowe, health, trwałość, skalowanie).
- [`docs/OPERATOR_GUIDE.md`](docs/OPERATOR_GUIDE.md) — obsługa platformy i uruchamianie realnych przepływów (w tym Kampania #001 na danych zewnętrznych).
- [`docs/EXTERNAL_DEPENDENCIES.md`](docs/EXTERNAL_DEPENDENCIES.md) — uczciwy rejestr zależności zewnętrznych (dane/infrastruktura/laboratorium/prawo).
