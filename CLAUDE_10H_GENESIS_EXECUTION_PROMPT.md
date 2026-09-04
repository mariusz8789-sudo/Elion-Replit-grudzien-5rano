# Claude — 10-hour Genesis execution brief

## Rola

Działasz jako Principal Engineer / Scientific Systems Engineer dla Genesis. Masz **10 godzin pracy**. Nie budujesz nowego produktu i nie tworzysz równoległej architektury. Twoim zadaniem jest podnieść istniejący Genesis z poziomu działającego Earthquake MVP do wiarygodnego, demonstracyjnego i lepiej zarządzanego **Scientific Discovery OS**.

Pracuj wyłącznie na aktualnym repozytorium Genesis oraz na branchu utworzonym od aktualnego LIVE. Na początku zapisz commit bazowy, branch, `git status`, wynik `git log -5` oraz potwierdź, że przejrzałeś `CLAUDE_10H_GENESIS_EXECUTION_PROMPT.md` i raport `GENESIS EXTREME-EVENT IMPACT ENGINE`.

## Źródło prawdy i obowiązkowy review

Źródłem prawdy są istniejące kontrakty LIVE, a nie przykładowe paczki z załączników. Przed kodowaniem przejrzyj co najmniej:

- `packages/frontend/src/core/hazard/` — contracts, fingerprint, evidence gate, provenance store, replay, module registry, dataset registry;
- `packages/frontend/src/core/experimentFabric/` — `StructuredExperimentRequest`, parser, router, executor, evidence-guided chat;
- `packages/frontend/src/components/ScienceChat.tsx`;
- istniejący Earthquake command center, envelope, `DamageAssessment`, CityWorld mapping, City3D overlay i tests;
- istniejący smoke/E2E harness oraz workflow GitHub Actions;
- raport z brancha `claude/extreme-event-engine-foundation` @ `28ed69`.

Nie kopiuj bezpośrednio kodu z raportu. Raport jest materiałem do review. W szczególności odrzuć jako niekompatybilne lub nieudowodnione elementy, które zakładają nieistniejące typy albo ścieżki, np. `@/core/chat/types`, `@/core/earthquake/types`, `EarthquakeSolver`, `EvidenceRegistry`, `HazardInput` w innym miejscu, `evidenceRequirement` zamiast istniejącego pola oraz mockowe `jest` API w repo opartym o Vitest. Jeżeli odpowiednik już istnieje w LIVE, zachowaj LIVE jako źródło prawdy i nie twórz dubla.

## Cel główny

Doprowadź do stanu, w którym pierwsza osoba może:

> Science Chat → StructuredExperimentRequest → walidacja i capability routing → istniejący Earthquake command center → ImpactResult → DamageAssessment → CityWorld/City3D → Evidence → Replay MATCH/DRIFT/BLOCKED

Ten przepływ ma pozostać naukowo uczciwy. LLM może być wyłącznie parserem/plannerem. Nie może rozwiązywać fizyki, dopisywać danych ani podnosić statusu funkcji, która jest `NOT_MODELED`.

## Twarde ograniczenia

Nie wolno:

1. budować nowego solvera Earthquake ani przepisywać istniejącego Earthquake vertical slice;
2. dodawać Matrix World, Collider, Cascade Engine, nowych hazardów, GIS/live fetch, drugiego City3D, drugiego canvasa/worlda ani zmieniać Epidemic Core;
3. integrować `claude/extreme-event-engine-foundation` do LIVE bez osobnej decyzji — branch pozostaje PARK; dopuszczalny jest wyłącznie review jego dokumentacji i kontraktów;
4. tworzyć nowej równoległej Evidence/Replay/Provenance Registry;
5. wymyślać structural damage, casualties, tsunami, flood extent, wildfire spread, aftershocks, casualties, real-world prediction ani dane geograficzne;
6. dodawać operacyjnych treści dotyczących broni, ataku, materiałów jądrowych, syntezy chemicznej lub inżynierii biologicznej;
7. używać `any` jako sposobu na obejście kontraktu; wyjątek wymaga komentarza i testu;
8. kończyć pracy samą dokumentacją. Musi istnieć działający, przetestowany efekt albo jasno udokumentowany blocker.

## Plan pracy 10h

### 0:00–1:00 — Baseline i mapa ryzyka

Wykonaj statyczny audit LIVE i raportu Claude’a. Zidentyfikuj maksymalnie trzy realne luki, które blokują demonstrację lub utrzymanie. Sprawdź, czy Science Chat ma już lokalną walidację, parser, router, executor i Earthquake adapter. Sprawdź, czy `scripts/smoke-e2e.mjs` korzysta z poprawnego lokalnego Playwright/Chromium oraz czy uruchomienie wymaga backendu.

Deliverable: `docs/CLAUDE_10H_BASELINE.md` z tabelą `EXISTS / PARTIAL / MISSING / NOT_MODELED`, ścieżkami dowodowymi, komendami baseline i decyzją priorytetową.

### 1:00–3:00 — Runtime validation istniejącego requestu

Jeżeli LIVE nie ma wystarczającej walidacji runtime na granicy LLM/parser → `StructuredExperimentRequest`, dodaj **cienki adapter** korzystający z istniejącego kontraktu. Walidacja ma odrzucać co najmniej: nieznaną domenę/model, brak wymaganych pól, `NaN`, `Infinity`, nieprawidłowy typ, parametry poza istniejącym zakresem oraz `evidenceTracking=false`, jeżeli kontrakt Genesis wymaga evidence.

Nie dodawaj Zod tylko dlatego, że raport go proponuje. Najpierw sprawdź, czy repo ma już walidację i czy nowa zależność jest potrzebna. Jeśli istniejący validator jest wystarczający, dopisz testy zamiast nowej biblioteki.

Wynik walidacji musi być jawny i kompatybilny z obecnymi statusami Genesis: `NOT_MODELED`, `VALIDATION_FAILED`, `MISSING_CAPABILITY` albo istniejącymi odpowiednikami. Nie pokazuj użytkownikowi fałszywego sukcesu.

Deliverable: minimalny kod + testy Vitest dla poprawnego requestu, `NaN`, `Infinity`, złej domeny, brakujących parametrów i wyłączonego evidence.

### 3:00–5:00 — Universal routing bez nowego frameworka

Jeżeli router istniejący w LIVE jest już wystarczający, nie twórz `CapabilityRegistry` drugi raz. Rozszerz istniejący router tylko o brakujące jawne capability metadata. Zarejestruj wyłącznie rzeczywiste możliwości:

| Capability | Status | Dozwolone zachowanie |
|---|---|---|
| Earthquake scenario | EXISTS | użyć obecnego command center i envelope |
| Epidemic | EXISTS / istniejący flow | nie naruszać istniejącego Epidemic Core |
| Relativity / Spacetime | tylko jeśli istniejący model jest faktycznie dostępny | route do istniejącego laba, bez udawania Earthquake |
| Flood, Tsunami, Wildfire, Weather, Radiological, Chemical, Biological, Industrial Explosion | NOT_MODELED | jawnie zablokować |

Nie dodawaj solverów do domen oznaczonych `NOT_MODELED`. Nie dodawaj LLM call, jeśli istniejący parser deterministyczny wystarcza dla obecnego zakresu. W systemie offline musi działać bez klucza i bez live network.

Deliverable: testy capability routing i test, że `Symuluj powódź` kończy się `NOT_MODELED`, a Earthquake trafia do istniejącego adaptera.

### 5:00–7:00 — Earthquake demo UX i wynik

Przejdź rzeczywisty flow w Chromium. Napraw tylko blokady produktu, nie kosmetykę. Użytkownik musi widzieć:

1. plan przed wykonaniem;
2. parametry i ograniczenia;
3. po potwierdzeniu `ImpactResult`, `DamageAssessment`, `SCENARIO`, `Evidence` i `Replay MATCH`;
4. `structuralDamage = NOT_MODELED`;
5. jasny przycisk/przejście do tego samego `#/city3d`;
6. brak blank state i brak cichego błędu.

Jeśli immutable provenance store odrzuca powtórne kliknięcie, zachowaj jego politykę i nadaj kolejnemu runowi unikalne scenario ID bez zmiany fingerprintu naukowego. Nie wyłączaj zabezpieczenia i nie nadpisuj rekordów.

Jeśli City3D route działa z istniejącego przycisku, ale handoff z Chatu nie działa, napraw handoff. Jeśli problem wynika tylko z brakującego backendu lokalnego, nie udawaj zielonego E2E — uruchom właściwy backend albo oznacz dokładny blocker.

Deliverable: Chromium proof z komendą, screenshot lub zapisany logiem stanów UI oraz test regresyjny pełnego Chat→Earthquake envelope.

### 7:00–8:30 — Evidence/Replay i honesty pass

Przejrzyj, czy raport Claude’a nie wprowadza pojęć sugerujących obliczenia, których nie ma. Dopuszczalne są statyczne `CascadeCandidate` i vocabulary, ale tylko jako disclosure `NOT_MODELED`/`BLOCKED`; nie wolno przedstawiać ich jako symulacji ani Evidence Pack z obliczonego solvera.

Sprawdź, że Evidence/Replay używają istniejącej kanonizacji, fingerprintu, provenance i statusów. Dopisz brakujące testy deterministyczności, mismatch/drift i blocked path, ale nie twórz nowego evidence factory.

Deliverable: krótki review dokumentu oraz testy, które dowodzą, że brak solvera nie daje wyniku.

### 8:30–9:30 — Full quality gate

Uruchom i zapisz pełne wyniki:

- frontend i backend tests;
- TypeScript `--noEmit`;
- lint;
- build;
- `git diff --check`;
- repository-native Chromium smoke/E2E w poprawnie skonfigurowanym środowisku;
- GitHub Actions dla branch/commit.

Jeżeli harness ma błędną ścieżkę globalnego Playwrighta albo Chromium, popraw tylko harness, aby używał lokalnego dependency i wykrywalnego executable. Jeżeli smoke raportuje 500 dlatego, że uruchomiono sam Vite bez backendu, uruchom wymagany backend lub raportuj osobno: `frontend proof green`, `full-stack proof blocked by backend`.

Nie ukrywaj błędów przez filtrowanie ich w harnessie.

### 9:30–10:00 — Handoff

Utwórz `docs/CLAUDE_10H_HANDOFF.md` i podaj:

- branch i commit bazowy;
- finalny commit Claude’a;
- pliki zmienione i powód każdej zmiany;
- wynik każdego quality gate;
- dokładny Chromium route i observed behavior;
- `FULLY_CONNECTED`, `PARTIALLY_CONNECTED`, `NOT_CONNECTED_YET`;
- ograniczenia i rzeczy pozostawione `NOT_MODELED`/`PARK`;
- rollback plan;
- trzy następne kroki, bez rozpoczynania nowego hazardu.

## Definition of Done

Praca jest ukończona tylko wtedy, gdy:

- nie ma duplikatu routera, solvera, evidence registry, replay engine, renderera ani worlda;
- Earthquake Chat flow przechodzi od requestu do widocznego, rzeczywistego wyniku w City3D albo blocker jest odtworzony i jednoznacznie opisany;
- wszystkie brakujące możliwości są oznaczone `NOT_MODELED`, a nie zamaskowane;
- testy obejmują pozytywny Earthquake path i negatywne validation/capability paths;
- pełny quality gate ma zapisane wyniki;
- branch jest clean, commit jest gotowy do review i nie zawiera zmian z brancha PARK;
- handoff pozwala Manusowi podjąć decyzję integracyjną bez czytania całej historii.

## Instrukcja raportowania

Nie odpowiadaj ogólnym „gotowe”. Na końcu zwróć tabelę:

| Obszar | Status | Dowód |
|---|---|---|
| Science Chat request validation |  |  |
| Earthquake routing |  |  |
| Earthquake envelope |  |  |
| City3D handoff |  |  |
| Evidence |  |  |
| Replay |  |  |
| NOT_MODELED fencing |  |  |
| Tests / TypeScript / lint / build |  |  |
| Chromium |  |  |
| CI |  |  |

Jeżeli nie zdążysz, zatrzymaj się w bezpiecznym punkcie, zostaw testy i raport stanu. Nie rozgrzebuj kolejnego modułu tylko po to, żeby wypełnić 10 godzin.
