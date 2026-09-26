# Genesis — wykonanie i raport do przeglądu, 22 września 2026

Zmiany są lokalne. **Bez commit, push, merge i deploy.** Zachowano bieżący branch `claude/genesis-c1-visual-integration`, HEAD `d48edeb0ef9b403c253806c935c41d49096a86fa`. Nie usuwano gałęzi. Porządkowanie GitHuba pozostaje poza tym etapem, zgodnie z późniejszym zakazem push/merge.

## Stan zastany i środowisko

- Na początku brak zmian w śledzonych plikach; nieśledzone załączniki użytkownika w `.codex-remote-attachments/` pozostawiono nietknięte. Nie znaleziono częściowo zapisanej implementacji z przerwanego uruchomienia.
- Repo zawierało canonical V6/V6.1/V7, ale nie wszystkie poprawki opisane w przekazanym raporcie Claude'a. Pakiet ZIP potraktowano jako materiał do audytu, bez kopiowania równoległego `core/visualStages/**` do produkcji.
- Początkowe instalowanie zależności zatrzymywało się na błędzie TLS `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. `NODE_USE_SYSTEM_CA=1` pozwoliło użyć zaufanych certyfikatów Windows. Wykonano `npm ci` z istniejącego lockfile, bez aktualizacji wersji.
- Rzeczywisty hostname: `DESKTOP-7UAVGFS`; Windows, Node 25.0.0, npm 11.6.2, Chromium w Microsoft Edge **153.0.4234.48**. Git jest dostępny w instalacji Visual Studio Build Tools, nie w początkowym PATH.
- Uruchomione lokalnie: frontend `http://127.0.0.1:5000`, backend `http://127.0.0.1:8080`. E2E korzystało z rzeczywistego kodu UI, WebGL, loadera i runnerów; bez zastępowania ich makietami. Test błędu loadera celowo wstrzykiwał HTTP 503. Nie uruchamiano zewnętrznego AI.

## Potwierdzona diagnoza człowieka

**Canvas mógł być gotowy, podczas gdy pełny model jeszcze nie był gotowy.** W zarejestrowanym przebiegu BEFORE canvas pojawił się po 12 596 ms, a tier pełnego człowieka po 19 171 ms. Przez około 6,6 sekundy screenshot samego canvasu mógł więc pokazać proceduralny PROXY. Dotychczasowy `visual-e2e-v52-v7.mjs` nie oczekiwał pełnego modelu.

Loader zwracał `null` dla odmowy governance oraz błędów pobrania/dekodowania. UI nie rozróżniało trwającego ładowania od awarii. Audyt znalazł również ryzyko spóźnionego wyniku po dispose/re-init tej samej sceny; kontrola samego `scene !== null` nie identyfikowała właściciela żądania. Nie twierdzimy, że każda historyczna fotografia z PROXY powstała z tego samego powodu: wcześniejsze raporty nie przechowywały wystarczającej telemetrii.

Naprawa:

- Typowany wynik loadera; prezentacja `LOADING | READY | ERROR | BLOCKED` niezależna od `PROXY | LICENSED_CC0_ASSET`; kompatybilny wrapper dla istniejącego odbiorcy w scenie miasta.
- Czasy pobrania, HTTP, liczba bajtów, dekodowanie, wstawienie do sceny i pierwsze rzeczywiste narysowanie mesha GLB. Czas fazy fetch obejmuje także oczekiwanie na wątek przeglądarki, nie jest pomiarem samej przepustowości sieci.
- READY wymaga callbacku `onAfterRender` mesha modelu oraz potwierdzenia ukończenia renderu w dotychczasowej pętli. Sama obecność obiektu w scenie nie wystarcza.
- AbortController, identyfikator generacji i tożsamość sceny/anchor. Nieaktualny wynik jest zwalniany, a nie dołączany do nowej sceny.
- Przy podmianie zachowane: kamera, wybrany narząd, izolacja, przekrój i materiał powierzchni. Widoczny błąd ma przycisk ponowienia.

Główne pliki: `packages/frontend/src/core/three/humanTwinAsset.ts`, `agentLabScene3D.ts`, `biologyLabKit.ts`, `humanTwinMaterials.ts`, `humanTwinCutaway.ts`, `useThreeLoop.ts` oraz `packages/frontend/src/components/ScientificWorldsScreen.tsx`. Ostatnie dwa pliki materiałów/przekroju są ponownie wykorzystywane, bez zmian ich implementacji.

Dowody: [baseline](../artifacts/human-twin-review/before.json), [10 ładowań](../artifacts/human-twin-review/browser-loads.json), [błąd/ponowienie i nawigacja podczas ładowania](../artifacts/human-twin-review/browser-recovery.json). **5/5 nowych procesów Chromium z pustym kontekstem i 5/5 ponownych ładowań PASS.** Cache systemu operacyjnego nie był czyszczony. Zimne procesy: 13,2–14,5 s; ponowne: 3,3–3,9 s. Zero błędów JavaScript w zapisanych przebiegach ładowania.

## Pierwszy render i porównanie

[BEFORE — pełny człowiek](../artifacts/human-twin-review/before-body.png) · [AFTER — pełny człowiek](../artifacts/human-twin-review/after-body.png) · [mobile](../artifacts/human-twin-review/human-mobile.png)

Zachowano scenę, komorę, postać, wyposażenie i interakcje. Zmieniono kadrowanie człowieka, frontalny widok podczas pracy w kamerze TWIN, siłę światła/bloom, satynową podłogę i emisję obręczy platformy. Panel Human Explorer jest czytelniejszy i przewijany; rozwinięte dowody nie blokują już własnego przycisku replay pod drugim panelem. Powiększony model mikro znajduje się bliżej człowieka, zamiast znikać za prawym panelem. Mobile ma osobne miejsce na pasek polecenia nad nawigacją; przy otwartym panelu dolna część postaci nadal jest zasłaniana — pozostaje kompromis do dalszego projektu mobilnego.

Obecny GLB ma **83 686 trójkątów, 8 meshy i 7 tekstur**, 17 667 228 bajtów. Jest ubranym modelem zewnętrznym. Nie zawiera oddzielnych anatomicznych kości, mięśni, naczyń czy narządów. Wewnętrzne narządy są modelami proceduralnymi z atlasu, więc samo światło nie zmieni ich w szczegółową anatomię z referencji. W widoku ghost włosy/głowa nadal mają zbyt mocne refleksy. Tkanka, komórka i molekuła pozostają ilustracją modelu, nie obrazem medycznym ani dowodem poprawności naukowej.

## Prawdziwe V6/V7 i pomiar przejścia

Generator `RESEARCH_CAMPUS` tworzy `MATERIALS_LAB` i prawdziwe encje ASSET_SLOT: spektrometr, stolik termiczny i stanowisko compute. Istniejące LAB_BENCH_ROOM otrzymują dodatkowe stanowisko compute przy wystarczającej przestrzeni. Zachowano istniejące identyfikatory pozostałych stanowisk i przejście od drzwi. Pomieszczenia mniejsze niż 4×4 m nie dostają dodatkowych urządzeń zamiast umieszczania ich w kolizji.

Zweryfikowana trasa: `#/temporal-cinematic?place=Vienna&year=2026&view=interior&roomType=MATERIALS_LAB&duration=3`. [Screenshot](../artifacts/human-twin-review/materials-compute-1.5.png) i [raport](../artifacts/human-twin-review/browser-surfaces.json) wiążą realny room ID, trzy sloty i callbacki narysowania ich geometrii. Poprawiono kadr, sufit i materiał podłogi tej istniejącej ścieżki. Sprzęt ma jawny stan **UNBOUND** — nie udajemy działającego spektrometru ani uruchomionego solvera na podstawie monitora 3D.

Pełne **BODY → ORGAN_SYSTEM → ORGAN → TISSUE → CELL → ORGANELLE → MOLECULE** przeszło przez rzeczywisty interfejs. Wybór serca wykonano również raycastem kliknięcia na canvasie. Cztery replaye eksperymentów (tkanka, komórka, organellum, cząsteczka) zwróciły `MATCH`. [Pełna telemetria i przebieg](../artifacts/human-twin-review/browser-macro.json).

Przyczyny problemu tissue → cell:

1. Polecenie głębszego poziomu od nowa planowało wcześniejszą histologię i powrót do stołu anatomicznego. Teraz ponownie wykorzystuje wyłącznie integralne, zapieczętowane sesje pasujące do świata, stacji, seeda, narządu, tkanki i parametrów.
2. Po OBSERVE maszyna przechodziła do REPORTING; kolejny ALIGN przy tej samej stacji nie miał NAVIGATE, który zwykle porządkował stan. Naprawiono przejście przez istniejące zdarzenie REPORT_DONE.
3. Hipoteza 0,05 s/frame nie wyjaśniała sama tej ścieżki: istniejąca scena już przekazywała AgentController czas ścienny ograniczony do 0,2 s. Zachowano te ograniczenia stabilności. Biology nie używa tu TemporalEngine; jego liczba advance wynosi **0 / nie dotyczy**, a nie wymyśloną liczbę.

W pierwszym pełnym przebiegu cell trwało ok. 7,7 s, w kolejnych 7–9 s zależnie od obciążenia. Raport zapisuje wall time, simulationSeconds, updateCount, surowy frame delta, FPS, state/step i warunek przejścia. Zmierzone próbki po rozgrzaniu oscylowały wokół 60 FPS. Determinizm sprawdzono też runnerami przy krokach 1/60, 0,1 i 0,2 s. Nie zwiększano timeoutów jako naprawy tego błędu.

Canonical atlas otrzymał typowane relacje SYSTEM_HAS_ORGAN, zachowując odrębną poprawną hierarchię przestrzenną organ→region→body. Brakujące źródłowe wartości metadanych mają **UNKNOWN / UNSPECIFIED**, z powodem i provenance. Nie dodano fikcyjnych procentów confidence ani parametrów pomiaru.

## Matrix

Ten sam `LiveMatrixBackground` działa tylko na dashboardzie: zielony kod, bez ludzi, `pointer-events:none`, lżejszy tryb mobile i statyczna klatka reduced-motion. Usunięto montowanie dekoracyjnego 3D backdropu. Znaleziono też starą regułę CSS `display:none!important`, która ukrywała canonical Matrix — ją naprawiono. Stare nieużywane moduły oznaczono w kontroli module reachability jako wycofane z produkcyjnego montowania, bez tworzenia nowego renderera.

[Desktop](../artifacts/human-twin-review/dashboard-desktop.png) · [mobile](../artifacts/human-twin-review/dashboard-mobile.png) · [reduced-motion](../artifacts/human-twin-review/dashboard-reduced.png). Browser sprawdził zielone piksele, zmianę klatek w dwóch trybach i brak zmian w reduced-motion, pointer-events oraz brak Matrixa w laboratoriach.

## Kierunek grafiki i assety

[Manifest strategii zero-budget](GENESIS_VISUAL_ASSET_STRATEGY.md) obejmuje wszystkie wymagane kategorie i kandydatów: źródło, licencję, atrybucję, format/złożoność, zastosowanie, optymalizację i ryzyko provenance. **Nie kupiono ani nie dołączono żadnych nowych zewnętrznych assetów.**

Kolejność największego wpływu:

1. Szczegółowe, osobno wybieralne części anatomii ze sprawdzonym źródłem; rozdzielenie ciała zewnętrznego od modelu narządów. Obecna postać może pozostać trybem zewnętrznym.
2. Spójny układ Human Explorer: więcej przestrzeni na obserwację, szybszy dostęp do poziomów skali, mniejsza ilość tekstu technicznego w podstawowym widoku; dedykowany mobilny panel zwijany.
3. Geometria laboratoriów: obudowy urządzeń, krawędzie/bevel, złącza, przewody, drobna aparatura, odróżnienie przeznaczenia pomieszczeń. Można rozwijać obecne proceduralne kity.
4. Strojenie materiałów i światła per pomieszczenie, kontrola refleksów i kontrastu, lokalne światła robocze. Zachować istniejący PBR/postprocessing i system jakości.
5. Optymalizacja GLB/tekstur i prawdziwe LOD przed podnoszeniem gęstości całych światów. Animacja kamery wymaga też interpolacji; obecna ścieżka uliczna wybiera najbliższą klatkę.

Bez zakupów da się poprawić kompozycję, layout, światło, materiały, proceduralne meble/urządzenia, szkło, oznakowanie i optymalizację. Poly Haven i ambientCG dostarczają kandydatów CC0; BodyParts3D wymaga przypisania wersji archiwum i właściwej atrybucji. NIH należy sprawdzać per wpis: znalezione Cell/Neuron mają CC BY-NC-SA i odpadają z komercyjnej bazy; konkretny Heart ma CC0, ale to nie walidacja medyczna. Historyczne BodyParts3D i aktualne archiwum mają różne warunki — nie przenosić licencji automatycznie między kopiami.

Płatna anatomia z oddzielnymi układami może dać największy przyrost jakości; nie zatwierdzono jednak konkretnego zakupu. Warunki „no AI”, webowa dystrybucja plików, atrybucja i redystrybucja wymagają wyjaśnienia, nie domysłu. Zgodność GLB/FBX, rigging, osobne meshe, tekstury, LOD, clipping/picking i koszt integracji oceniono oddzielnie od ceny sklepowej w manifeście. Obecne renderowanie nie uzasadnia zakupu całych laboratoriów.

## Weryfikacja i ograniczenia

| Kontrola | Wynik |
| --- | --- |
| Loader + lifecycle | 30/30 wraz z istniejącymi testami bramki; rzeczywisty parser GLB na małym fixture i kontrolowane race tests |
| V7 focused | 34/34, canonical runner, semantyka, replay i kroki czasowe |
| V6 generator/geometry | 28/28, rzeczywisty generator, bounds/kolizje/clearance i deterministyczna regeneracja |
| Końcowa regresja 6 plików | 33/33, w tym module reachability, loader, lifecycle, generator i resolver |
| Browser | 10 ładowań, 2 scenariusze recovery, 7 poziomów, raycast serca, 4 MATCH replay, 3 tryby Matrix, wygenerowane materials/compute i ulica — PASS |
| TypeScript / root lint / production build | PASS; build ostrzega o dużych chunkach i mieszanym imporcie Three.js |
| Pełny frontend Vitest | 621/621 plików; 6908 PASS, 1 SKIP, 0 FAIL / 6909; exit 0, 290,22 s; `full-vitest-release-check.json` |
| Core | 46 plików, 465/465 PASS |
| CSRN | 5 plików, 38/38 PASS |
| Backend — jawnie wybrany zestaw lokalny | 711 PASS, 40 FAIL, 75 SKIP / 826; wyłączono 3 całe pliki wywołujące audyt zewnętrzny |
| Duplicate architecture | Przegląd klas i nowych importów: nie dodano drugiego WorldGraph/TemporalEngine/WorldFrameRenderer/manifestu ani produkcyjnego visualStages; nie oznacza to certyfikacji całego monorepo |

Nie sumować częściowych zestawów testów — ich zakresy nakładają się. Wyniki pełne i wszystkie starsze nieudane przebiegi pozostają w `artifacts/human-twin-review/`.

Dokładny jeden pominięty test frontendowy: `packages/frontend/src/__tests__/backendEvidenceExecution.test.ts:638`, **“executes both PySCF H2 basis arms against the real local Fabric and produces a MATCH Evidence Pack”**, warunek `GENESIS_REAL_BACKEND === '1'`. Nie uruchomiono go bez wymaganego środowiska PySCF/Fabric.

Weryfikacja Windows wykryła: brak Git w PATH, POSIX-only ścieżki testów, otwarte SQLite przy błędach oraz CRLF zmieniające bajty hash-pinned plików. Naprawiono ścieżki i zamykanie zasobów, przywrócono sześć konkretnych fixture dokładnie z HEAD i dodano dla nich `-text` w `.gitattributes`. Nie zmieniano pinów hash ani asercji naukowych, żeby wymusić PASS. Backend nadal ma problemy RDKit/Python i dalszych danych custody/CMS: [dokładne nazwy 40 błędów i wyłączone pliki](../artifacts/human-twin-review/broader-verification.json).

[Pełna macierz 50 capability](GENESIS_V6_V7_CAPABILITY_EVIDENCE.md) jest liczona z konkretnych dowodów, z odróżnieniem Node od przeglądarki: **27 PASS / 16 PARTIAL / 7 BLOCKED — 27/50 (54%)**. To wynik przyjętych wymagań odbioru, nie procent ukończenia Genesis ani zgodności grafiki z referencją; jest liczony bardziej rygorystycznie niż wcześniejsze 38/50 Claude'a. **REAL_REPO_V6_V61_V7_100_E2E = false.** Ograniczenia obejmują m.in. brak pełnego LOD/interpolacji kamery, nieudowodniony cały capture→ledger i interakcje wygenerowanej aparatury. Nie tworzy się historii TAA tylko dla zaliczenia pozycji CUT_RESET, gdy renderer jej nie używa.

## Zmienione pliki

Dokładny wykaz zmian i ich SHA-256 jest zapisany w [snapshot źródeł](../artifacts/human-twin-review/source-snapshot.json). Główne grupy: loader/scena/pętla Three; Human Explorer i atlas; generator pomieszczeń i canonical visual resolver; dashboard Matrix i CSS; przeglądarkowe E2E oraz regresje; wąskie poprawki Windows/SQLite; dokumentacja assetów i macierzy. Załączniki użytkownika, plik GLB, lockfile i historia Git pozostały niezmienione.

Nie ma podstaw, by ogłosić pełny odbiór 50/50 ani zgodność wizualną z referencją. Ten etap dostarcza działającą naprawę loadera, pełną ścieżkę UI makro→mikro, prawdziwe materials/compute, Matrix i pierwszy poprawiony render do oceny.

Automatyczna kontrola uprawnień odrzuciła `npm audit --json`, ponieważ wysyła metadane zależności do zewnętrznego rejestru npm. Audyt nie jest zaliczony i nie oznacza „0 podatności”. Końcowy lokalny zestaw backendu jawnie wyklucza `dependencyAudit.test.mjs`, `apiSecurity.test.mjs` i `server.http.test.mjs`; wcześniejszy filtr nazw okazał się niewystarczający i jego log nie jest dowodem prawidłowego wyłączenia audytu. Ponowne wywołanie zewnętrznego audytu wymaga zgody użytkownika.
