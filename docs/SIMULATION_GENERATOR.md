# Genesis OS — Generator symulacji sterowany językiem naturalnym

> „Napisałem jedno zdanie i dostałem działającą naukową symulację."

Nowa **warstwa** nad istniejącym Genesis OS. Nie zastępuje 13 laboratoriów ani
stosu badawczego — dodaje wejście w języku naturalnym do tego, co już liczy się
realnie. Zero usuwania; laboratoria zostają jako ręcznie przygotowane moduły.

## Architektura: NL → Model → Silnik → Weryfikacja → Wizualizacja → Wyjaśnienie

| Etap | Realizacja (maksymalny reuse) |
| --- | --- |
| **Natural Language** | `core/generator/resolve.ts` — deterministyczny resolver (offline, testowalny): normalizacja (bez diakrytyków) + dopasowanie aliasów/słów kluczowych do przepisu. Warstwa LLM (`narrator/askAI`) jako *opcjonalne* wzbogacenie fuzzy, nigdy jako jedyne źródło. |
| **Scientific Model** | `core/generator/recipe.ts` — `SimulationRecipe`: przepis wiążący frazę NL z **istniejącym** `ExperimentDef` (przez `labId` + `experimentId`) + presetem parametrów + równaniami, założeniami, inwariantami i etykietą uczciwości. Rejestr pluginów (`registerRecipe`), analogiczny do `registerLab`. |
| **Simulation Engine** | **Istniejący** kontrakt `Sim`/`Sim3D`/`createConsequenceModel` (~60 zarejestrowanych, realnych modeli obliczeniowych). Zero nowego silnika w MVP. |
| **Verification** | Inwarianty per-przepis (zachowanie energii, kontrola wymiarów, monotoniczność) + istniejące testy fizyki. Wynik widoczny w UI jako „sprawdzone / niesprawdzone". |
| **Visualization** | **Istniejące** renderowanie Canvas 2D / Three.js (WebGL) z `LabShell`. |
| **Explanation** | **Istniejące** `narrate` + `HonestyBadge` (`exact`/`simplified`/`educational`/`theoretical`) + `citation`. |

**Punkt reużycia (kluczowy):** `core/scenarioBridge.ts::setPendingScenario(labId, params, experimentId)` — most, którym „Co by było gdyby?"/Timeline już otwierają konkretny eksperyment z presetem. Generator resolwuje zdanie → ustawia most → nawiguje do `#/lab/<labId>` → `LabShell` uruchamia dokładny eksperyment z presetem. Realny silnik, kontrolki w czasie rzeczywistym, etykieta uczciwości i Narrator — wszystko już istnieje.

## Biblioteka demo — audyt pokrycia (co już istnieje)

Ogromna część żądanej listy to **istniejące, realne silniki** (patrz `catalog.ts`):
dylatacja czasu / paradoks bliźniąt (`spacetime.c-slider`, `spacetime.sr-consequence`),
czarna dziura (`blackhole-3d`), soczewkowanie (`lensing`), fale grawitacyjne (`chirp`),
orbita / „zwiększ masę gwiazdy 2×" (`universe.orbital-consequence`),
paradoks Fermiego (`civilization.drake-consequence`), chaos/Lorenz (`lorenz`),
problem trzech ciał (`threebody`), podwójne wahadło (`doublependulum`),
tunelowanie/dwie szczeliny (`tunneling`), ekspansja Wszechświata (`shoes`),
ewolucja gwiazdy (`starlife`), kinetyka reakcji (`chemistry.kinetics-consequence`),
przejście fazowe Ising (`ising`).

**Nowe przepisy do zbudowania (kolejne pluginy, po MVP):** paradoks dziadka,
most Einsteina-Rosena / tunel czasoprzestrzenny, eksperyment Schrödingera,
oraz **modele alternatywne** (np. płaska Ziemia) — jako modele DO TESTOWANIA:
Genesis generuje założenia + przewidywania i porównuje z obserwacjami, **nigdy nie
przedstawia hipotezy jako faktu** (etykieta `theoretical`, dedykowany widok
„przewidywania modelu vs obserwacje").

## System edukacyjny (warstwa nad generatorem)

Powiązany z **rzeczywistym modelem symulacji** — symulacja jest kluczem odpowiedzi.

- **Zadania z symulacji:** obliczeniowe (na parametrach), „co się stanie, jeśli…",
  eksperymentalne (uczeń uruchamia symulację i wyciąga wniosek). Przykład:
  „Zwiększ masę gwiazdy 2×, zapisz okres orbitalny przed i po, wyjaśnij zmianę" —
  system sam liczy oczekiwany wynik przez graf orbitalny (`P² = a³/M`) i porównuje.
- **Auto-ocenianie:** wynik liczbowy (tolerancja względna, ten sam wzorzec co
  `campaign/verify.mjs`), tok rozumowania tam, gdzie możliwe; punkty + informacja
  zwrotna „co dobrze / gdzie błąd".
- **Zestawy o różnym poziomie trudności**, punktacja, kryteria.
- **Wersja ucznia + klucz odpowiedzi nauczyciela**, eksport do PDF.
- **Zapis wyników ucznia + raport dla nauczyciela.**
- **Tryb „Wygeneruj lekcję":** nauczyciel wpisuje temat + czas + poziom → cele,
  wprowadzenie, symulacja, doświadczenie, pytania w trakcie, praca domowa,
  punktacja, klucz, raport.

Fundament backendu już istnieje (projekty, próby, RBAC, konta) — to nadbudowa, nie budowa od zera. **Nie jest to nowy dashboard** — wejście pozostaje jednozdaniowe.

## Plan wdrożenia (fazy generatora)

1. **MVP (ten milestone):** rdzeń (`recipe`/`catalog`/`resolve` + testy) + ekran
   generatora (pole → dopasowanie → „Uruchom") reużywający `scenarioBridge` +
   `LabShell`; ~15 przepisów na istniejące silniki; trasa `#/generate` + CTA na home.
2. Inwarianty weryfikacyjne w UI + wzbogacenie LLM (fuzzy NL) za flagą.
3. Nowe przepisy-pluginy (paradoks dziadka, wormhole, Schrödinger, modele alternatywne).
4. System edukacyjny: zadania powiązane z modelem + auto-ocenianie.
5. Tryb „Wygeneruj lekcję" + eksport PDF (uczeń/nauczyciel).
6. „Utwórz film wyjaśniający" — sekwencja klatek z symulacji (reuse `cameraSequencer`).

Każda faza jest addytywna i za flagą tam, gdzie to potrzebne. Zero regresji na
istniejących 13 laboratoriach i stosie badawczym.
