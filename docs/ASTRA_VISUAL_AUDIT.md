# Audyt visual pass Astry (stan: `claude/genesis-total-consolidation` @ 77ed5bbf)

Źródła: `git log` wszystkich gałęzi zdalnych po `git fetch` (2026-09-25), dokumenty Astry, jej screeny before/after z gałęzi, nowe screeny obecnego buildu (Chromium headless, software GL, 1440×900).

## A. Co jest pracą Astry (dowód w git)

Gałęzie `astra/*` (autor commitów: konto właściciela `mariusz8789-sudo`):

| Commit | Gałąź | Pliki produkcyjne | W obecnym kodzie? |
|---|---|---|---|
| `b9a95424` Polish human shell rendering and stabilize visual camera motion | `astra/genesis-investor-visual-polish` | `core/three/agentLabScene3D.ts`, `core/three/graphics/cameraRig.ts`, `core/three/graphics/cinematicCamera.ts`, `core/three/humanTwinMaterials.ts` (+ test, skrypt, `docs/ASTRA_VISUAL_POLISH.md`) | TAK (identyczny patch w `codex/genesis-final-integration`, która jest w tej gałęzi) |
| `4b2406fb`, `cefde6c1` polish investor surfaces | ta sama | `styles-investor-polish.css`, `main.tsx`, `playwright.config.ts` | TAK |
| `7740f886` world-first explorer visual ceiling | `astra/human-explorer-visual-ceiling` | `HumanExplorerHero.css`, `HumanExplorerPanel.tsx`, `ScientificWorldsScreen.tsx`, `core/three/agentLabScene3D.ts` (+ `docs/HUMAN_VISUAL_CEILING_REVIEW.md`, screeny) | TAK — wniesione przez `7c262fa9` „merge world-first explorer with twin fixes” |
| `83d36900` organize retained instruments | ta sama | `HumanExplorerPanel.tsx` (zakładki Odkrywaj / Mikroskop / Przekrój / Badania), `HumanExplorerHero.css`, `core/three/agentLabScene3D.ts`, `core/three/biologyStationKit.ts` (+ `docs/HUMAN_INSTRUMENTS_REVIEW.md`) | TAK (zakładki są w `HumanExplorerPanel.tsx:231`) |

**Nie znaleziono** w żadnej wypchniętej gałęzi visual passu Astry dla głównego laboratorium (świat fizyki), CERN, City, World Director, Molecule Lab ani przejść kinowych. Ostatnia zmiana `core/three` w repo: `90660e64` (24.09 05:46, `codex/genesis-final-integration`). Jeśli taki pass powstał później, nie jest wypchnięty.

Zmiany wizualne w `core/three` na `codex/genesis-final-integration` (`926e6b43` wycentrowany bliźniak w laboratorium fizyki, `a98c694c`, `90660e64` mikroskopia krwi, `3c8105f5` foton, `e9e14981` stanowisko miareczkowania) są z tego samego konta — git nie pozwala ustalić, czy to Astra, czy Codex. Nie przypisuję ich Astrze.

## B. Co Astra zmieniła wizualnie (tylko Human Explorer)

1. Materiał skóry bliźniaka: poprawny Fresnel przed ACES, tryb GHOST mnoży zamiast zastępować przezroczystość — mniej jasnych, twardych krawędzi.
2. Kamera: tłumienie wykładnicze niezależne od FPS, naprawiony podwójny kąt startowy, reduced-motion.
3. Kompozycja „world-first”: od razu kamera TWIN, duży tytuł, ścieżka 01 Ciało → 02 Narząd → 03 Tkanka → 04 Komórka, jeden przycisk główny, instrumenty schowane.
4. Instrumenty w jednym inspektorze z zakładkami; znacznik informacji przy obiekcie; mikroskop z pierścieniem i ceramiczną obudową.
5. Ukryte ruchome pierścienie skanu w widoku TWIN.

Nie zmieniła: oświetlenia (świadomie zostawione), materiałów sal, stanowisk głównego laboratorium, CERN, City, World Director, Molecule Lab, przejść kinowych, zasobów 3D.

## C. Screeny

Before/after Human Explorer: oryginalne screeny Astry z `artifacts/human-visual-ceiling/{before,after}` (gałąź `astra/human-explorer-visual-ceiling`). Stan obecny: nowe screeny `now-*.png` (lab fizyki, człowiek ciało/narząd, molekuła, CERN, miasto, World Director). Dla scen, których Astra nie zmieniała, before = after (brak commitów).

## D. Co jest naprawdę lepsze

- Human Explorer: czytelność i hierarchia — z „dashboardu z panelami na scenie” w scenę z jednym obiektem (własna ocena Astry 33 → 51/100, zgadzam się z kierunkiem).
- Kamera płynna i stabilna niezależnie od FPS (poprawa techniczna, niewidoczna na pojedynczym screenie).
- Wydajność bez regresji (draw calls ↓ ok. 5–8%, pamięć tekstur bez zmian).

## E. Co nadal wygląda słabo

- **Serce na piedestale to gładka czerwona elipsoida** („jajko”). Astra sama wydała werdykt `ASSET_CEILING_REACHED`. W tej samej scenie jest już prawdziwe serce BodyParts3D (małe, w ciele „ducha”), ale piedestał go nie używa.
- **Molecule Lab**: scena zajmuje tylko górne ~60% ekranu, dolna część pusta (błąd układu); nakładka „GEOMETRIA · RDKIT” zasłania licznik „draw calls”.
- **Laboratorium fizyki**: stanowiska małe i generyczne (stół + monitor), podłoga i sufit z szumem; dobrze wygląda tylko komora z człowiekiem.
- **CERN**: bardzo dużo HUD i aberracji chromatycznej; tytuł „Laboratorium, szyba, tunel” zachodzi na efekty; wrażenie „efektowne, ale chaotyczne”.
- **City 3D**: spójne i czytelne, ale zabawkowe (klocki).
- **World Director**: efektowny tunel, ale panel HUD nachodzi na scenę.
- Mobile: bliźniak na telefonie to uproszczony proxy (Astra to zaznacza).

## F. Czy wystarcza do demo inwestorskiego / grantu

Częściowo. Wystarcza do pokazania **działającego systemu z uczciwymi etykietami** (grant badawczo-edukacyjny). Nie wystarcza jako „premium wizualne” dla inwestora oceniającego wygląd: serce-elipsoida i pusty dół Molecule Lab to pierwsze rzeczy, które widać. Wizualnie najmocniejsze dziś: komora z człowiekiem, miasto, World Director.

## G. Czy przejść do żywych eksperymentów bez kolejnego visual pass

Tak. Żywy eksperyment (plan `docs/GENESIS_LIVE_EXPERIMENT_PLAN.md`) dotyczy laboratorium fizyki i stanowisk, których pass Astry nie zmieniał — nic nie zostanie nadpisane. Kolejny pass „glow/światło” nic nie da (limit zasobów). Warto równolegle zrobić dwie tanie, konkretne poprawki: układ Molecule Lab (plik komponentu, nie `core/three`) oraz użycie istniejącego serca BodyParts3D na piedestale (to `core/three` — do decyzji właściciela/Astry).

## Zgodność architektury

- Jeden renderer: brak nowego `WebGLRenderer`; jedyne `new THREE.Scene` w diffach Astry jest w teście.
- Brak drugiego świata/stanu: zmiany to materiały, kamera, CSS i układ HUD; przyciski ścieżki wołają istniejące komendy kanoniczne (`zoom(target)`), nic nie liczą.
- Sceny nadal podpięte pod stan kanoniczny: poziomy ciało/narząd/tkanka/komórka pochodzą z sesji (`levelOfSession`), a E2E Astry sprawdza przejścia do stanu IDLE na prawdziwym runtime.
