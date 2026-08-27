# Claude Assignment — Genesis Audit Fixes (isolated lane)

## Rola

Działasz jako **Audit Fix Engineer** dla Genesis Scientific Discovery OS. Manus jest głównym integratorem i źródłem prawdy dla LIVE. Pracuj wyłącznie na świeżym branchu od aktualnego `origin/manus/high-fidelity-epidemic-digital-twin`. Nie merge’uj i nie pushuj do LIVE.

## Cel

Napraw trzy potwierdzone problemy z audytu `claude/audit-lane`, w kolejności priorytetów:

1. P1: Earthquake false promise w generic `ExperimentPilotScreen` / `executeRealModel`.
2. P2: CI whitespace gate odrzucający poprawne markdown hard-breaks, ale nadal chroniący kod.
3. P2: niezamierzone publiczne eksportowanie live-network `importOsmMap`, gdy GIS jest PARKED.

Każdy punkt musi być minimalny, testowalny i niezależny. Nie refaktoruj całej architektury.

## Obowiązkowy review przed zmianą

Sprawdź aktualny LIVE HEAD i porównaj go z raportem. W szczególności zweryfikuj:

- `packages/frontend/src/core/experimentFabric/router.ts`;
- `packages/frontend/src/core/experimentFabric/executor.ts`;
- `packages/frontend/src/core/experimentFabric/evidenceGuidedChat.ts`;
- `packages/frontend/src/components/ExperimentPilotScreen.tsx`;
- `packages/frontend/src/core/experimentFabric/index.ts`;
- `packages/frontend/src/core/experimentFabric/spatialImport.ts`;
- `.github/workflows/ci.yml`;
- istniejące testy boundary/no-network i Earthquake.

Jeśli którykolwiek finding jest już naprawiony na bazowym LIVE, nie twórz duplikatu. Zaktualizuj tylko test lub raport, jeśli jest przestarzały.

## Finding 1 — Earthquake honesty P1

`earthquake-scenario` może mieć capability `REAL_ENGINE`, lecz generic `executeRealModel` nie musi mieć dla niego case’a, ponieważ Science Chat ma specjalny handler. To tworzy ryzyko fałszywej obietnicy w Pilot.

Wybierz najmniejszą poprawną opcję, zachowując działający Science Chat Earthquake vertical slice:

- preferowana opcja: przenieść earthquake special-case do wspólnego `confirmEvidenceGuidedExperiment`, aby każdy caller używał tego samego realnego path;
- jeśli kontrakt wymaga większej zmiany, alternatywnie spraw, by Pilot filtrował modele niewspierane przez generic executor i jawnie pokazywał `NOT_CONNECTED`;
- nie używaj rozwiązania, które sprawia, że model wygląda na `REAL_ENGINE`, ale kończy się błędem lub innym silnikiem;
- nie zmieniaj ImpactResult, DamageAssessment, CityWorld, City3D, Evidence ani Replay semantics;
- structural damage nadal musi być `NOT_MODELED`.

Dodaj standing guard test: każdy router model z capability `REAL_ENGINE`, który trafia do generic executor, musi mieć matching execution case albo jawnie udokumentowany adapter. Test nie może wymuszać obsługi modeli backend-only ani hypothetical.

## Finding 2 — CI whitespace P2

Zmodyfikuj wyłącznie krok whitespace w `.github/workflows/ci.yml`, tak aby markdown hard-break `  ` nie powodował fałszywego failure, ale trailing whitespace w kodzie nadal kończył CI błędem. Użyj precyzyjnego exclude/path filtering, nie wyłączaj całego `git diff --check`.

Dodaj test/shell proof dla obu kierunków:

- markdown z hard-break może przejść;
- `f.ts` lub inny code file z trailing whitespace musi polec.

Nie zmieniaj istniejących dokumentów tylko po to, aby obejść gate.

## Finding 3 — GIS barrel P2

`importOsmMap` wykonuje realny fetch do OpenStreetMap i GIS pozostaje PARKED. Zachowaj funkcję oraz jej provenance guards, ale usuń ją z publicznego `experimentFabric/index.ts` do czasu odparkowania GIS. Pure `normalizeOsmMapXml` i typy mogą pozostać publiczne, jeśli są już używane.

Dodaj boundary test w stylu `earthquakeNoNetworkBoundary.test.ts` lub istniejącego no-network guard:

- żaden moduł core poza `spatialImport.ts` nie może importować ani wywoływać `importOsmMap`;
- barrel nie może wystawiać `importOsmMap`;
- test nie może wykonywać sieci.

## Zakazy

Nie dodawaj nowego solvera, route, renderera, świata, GIS fetch, Earthquake science, structural damage, Matrix, Collider, sliderów czasu, Campaign→Fabric bridge, drugiego Evidence/Replay ani parser-only feature. Nie zmieniaj aktywnego Protocol, WHY, Campaign blocker, visual HUD, chemistry, water ani quantum scope Manus.

Nie ślepo cherry-pickuj zmian z innych branchy. Nie zakładaj, że raport jest prawdą bez sprawdzenia aktualnego base. Nie twórz ZIP-a.

## Definition of Done

Na własnym branchu wykonaj:

1. review diff i opis decyzji dla każdego finding;
2. minimal implementation lub udokumentowany blocker;
3. regression tests i boundary tests;
4. frontend/backend tests zgodnie z dotkniętym kodem;
5. TypeScript;
6. lint;
7. production build;
8. `git diff --check`;
9. Chromium desktop smoke;
10. Chromium mobile smoke;
11. clean working tree;
12. commit i push do własnego brancha;
13. CI green.

## Raport końcowy

Podaj dokładnie:

- branch i base SHA;
- commity i diff stat;
- Finding 1: wybrana opcja i dowód, że Science Chat Earthquake nie uległ regresji;
- Finding 2: dokładny filtr whitespace i dwa testy kierunków;
- Finding 3: dowód, że `importOsmMap` nie jest publicznym eksportem i nie ma nowych network callers;
- testy, TypeScript, lint, build, Chromium i CI;
- pliki, które Manus może bezpiecznie review’ować;
- rzeczy, których nie zmieniono;
- otwarte ograniczenia i następny bezpieczny krok.

To jest jedno zadanie audit-fix. Po zakończeniu nie rozpoczynaj analyseExperimentSeries, Aging, Flood, FEA ani nowych capability. Manus podejmie decyzję po review.
