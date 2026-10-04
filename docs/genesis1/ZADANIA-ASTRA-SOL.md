# ZADANIA DLA ASTRY I SOLA — po domknięciu technicznym

**Data:** niedziela 4 października 2026, ok. 03:00 UTC
**Autor:** Claude (wątek GENESIS 1 — CENTRAL COMMAND)
**Kolejność ustalona przez właściciela:**
`CLAUDE TECHNICAL GREEN → ASTRA VISUAL / INDEPENDENT AUDIT → FULL TESTS AGAIN → HUMAN OWNER CHECK → DEPLOY`

Astra nie wchodzi w architekturę. Astra jest **ostatnim inspektorem jakości**, który sprawdza Claude'a i doprowadza wygląd do poziomu premium. Sol dostaje osobny, węższy zakres.

---

## 0. Zasady wspólne — obowiązują oboje

1. **Nie wdrażaj na produkcję.** Deploy wyłącznie po jawnej decyzji właściciela. `railway-production-ready` to kandydat wydania, nie przycisk.
2. **Jedno worktree na jednego agenta.** Nigdy dwóch agentów w jednym katalogu.
3. **Nie dotykaj Run 9** ani niczego pod `docs/evidence/run8*` i `docs/evidence/run9*`. Zamrożone, preregistrowane.
4. **Nie edytuj zamrożonej preregistracji** ani zapieczętowanego artefaktu. Nigdy.
5. **Nie zmieniaj nauki, żeby test przeszedł.** Czerwony test to błąd kodu albo jawna decyzja w `docs/DECISIONS.md`.
6. **Nie hardkoduj liczb ani statusów w UI.** Wszystko z backendu albo `UNKNOWN`.
7. `npx eslint . --ignore-pattern '.claude/**'` — nigdy `npm run lint` (łapie worktrees, 43 tys. fałszywych błędów).
8. Brak force-push. Brak zipów. Gałęzie: `astra/*` dla Astry, `codex/*` dla Sola.
9. **Wolne ID decyzji: od D-177 w górę.** Zajęte do D-176 włącznie (D-170 zdalny worker, D-171 chemia, D-172 praca człowieka, D-173 edukacja, D-174 audyt reuse, D-175 przemianowanie demo, D-176 bramki bezpieczeństwa). Jedna wspólna przestrzeń numerów.
10. **Siedem etykiet epistemicznych** obowiązuje każdy świat, film i wizualizację: `EXPERIMENTALLY_CONFIRMED`, `OBSERVATION_SUPPORTED`, `THEORETICAL_MODEL`, `HYPOTHETICAL`, `SIMULATION`, `EDUCATIONAL_APPROXIMATION`, `CONCEPTUAL_VISUALIZATION`. Reżyseria na poziomie Hollywood, nauka **nigdy** na poziomie Hollywood.

---

## ASTRA — niezależny audyt wizualny, po zielonym technicznie

Wejście: gałąź integracyjna `claude/human-explorer-mobile-tap-nrboog` po moim raporcie „technicznie zielone", albo `main` jeśli do tego czasu zostanie wmergowana.

### A-1. Visual audit (najpierw audyt, potem poprawki)
Przejdź przez realne ekrany i zapisz, co jest poniżej poziomu premium. Nie poprawiaj w trakcie audytu — najpierw lista z nazwami plików i screenami. Ekrany priorytetowe:
- Human Explorer (jeden ciągły przepływ, człowiek w szklanym cylindrze, skale `LAB_WIDE → … → MIKROSKOPIA`, przycisk „Wstecz"),
- ResearchRun / Evidence / Replay,
- Flight Control (nowa sekcja zdalnych workerów),
- Reports, Lab handoff,
- ekrany uwierzytelniania (nowe: pokaż/ukryj hasło, reset hasła).

### A-2. Porównanie z najlepszymi wcześniejszymi screenami
Właściciel potwierdził, że Twoja praca wizualna **nie jest w pełni w main**:
- `astra/genesis-investor-visual-polish` — **1 commit poza main**,
- `astra/human-explorer-visual-ceiling` — **2 commity poza main** (visual ceiling + screeny/QA),
- `claude/investor-demo-visual` — nic unikalnego, całkowicie z tyłu.

Zadanie: przejrzyj te trzy gałęzie, wyciągnij to, co nadal ma wartość, i powiedz wprost, co jest już nieaktualne. „Grafika Maxa" jako osobny finalny artefakt **nie jest dziś potwierdzona jako zintegrowana** — jeśli ją znajdziesz, podaj gałąź i commit; jeśli nie istnieje, napisz to zamiast domyślać się.

### A-3. Poprawki: światło, materiały, kamera, UI
Dopiero po A-1 i A-2. Jedna gałąź, małe commity, każdy z opisem, co zmienia wizualnie. Zakazane: neon, panel administracyjny, lista prostokątów.

### A-4. Mobile / desktop / RTL
Właściciel pracuje **wyłącznie na telefonie**, więc telefon jest pierwszym obywatelem, nie przypadkiem brzegowym. PL / EN / AR z RTL. Brak przewijania w poziomie. Gutter ≥ 16 px.

### A-5. Visual regression
Zbuduj albo odtwórz porównanie screenów, żeby polish nie mógł cicho zepsuć ekranu, którego nie dotykałaś.

### A-6. Final screenshots / video proof
Dowód wizualny do akceptacji właściciela i do materiału pozycjonującego. Kolejność treści zawsze: `TASK → RESULT → EVIDENCE → TECHNICAL DETAILS`. World / Crisis / City to syntetyczne **DEMO** i muszą być tak oznaczone. Zabawki nigdy nie trafiają do materiału inwestorskiego — są osiągalne w „More" jako DEMO/INTERNAL.

### Czego Astra NIE robi w tej rundzie
Architektury, migracji schematu, bramek naukowych, nowych verticali (genomika, YT Brain, Theory Atlas, World Forge). To PHASE 1 i nie wchodzi przed decyzją właściciela.

---

## SOL — weryfikacja i twarde czerwone, nie estetyka

### S-1. Pełne E2E na realnym builcie
`packages/e2e` nie było puszczane w tej rundzie. W szczególności `packages/e2e/src/passwordAuth.e2e.spec.ts` **został napisany i nigdy nie uruchomiony** — wymaga zbudowanej aplikacji i przeglądarki. Uruchom, zgłoś wynik liczbowo.

### S-2. Dowód na własne niezmienniki
`packages/backend/src/architecturalInvariants.test.mjs` ma 47 testów. Twoje zadanie: **spróbuj je obejść**. Wstrzyknij drugą ścieżkę Evidence, drugi zegar etapów, drugie źródło schematu, import demo przez ścieżkę raportu. Każdy test, który nie zrobi się czerwony, jest testem do naprawy — zgłoś go z dokładnym opisem obejścia. Nie zostawiaj wstrzykniętego kodu.

### S-3. Arabski do przeglądu native
Teksty AR w warstwie uwierzytelniania powstały bez przeglądu native speakera. Oznacz to jako `NEEDS_NATIVE_REVIEW` i nie udawaj, że przeszło.

### S-4. Testy klawiatury
Asercje klawiaturowe dla formularzy haseł wymagają `jsdom` + `testing-library`, których konfiguracja CI nie ma (frontend testuje `renderToStaticMarkup`, bez jsdom). Albo dodaj konfigurację, albo zapisz jako lukę z nazwą — nie zostawiaj martwego testu udającego pokrycie.

### S-5. Production smoke — nadal zablokowany zewnętrznie
`production-smoke.yml` nie może działać, bo `genesis-physics.com` wskazuje na stronę parkingową Namecheap (`162.255.119.185`). Potrzebny jest URL `*.up.railway.app` albo zmienna repo `GENESIS_PRODUCTION_URL`. **To może dać tylko właściciel.** Do tego czasu status to `BLOCKED_EXTERNAL`, nigdy „przeszło".

### Czego Sol NIE robi
Nie merguje do `main`, nie synchronizuje `railway-production-ready`, nie wdraża. Zgłasza wyniki i czerwone.

---

## Stan na moment pisania

- `main` = `8ab0ec9d` (PR #84 wmergowany, 42/42 CI zielone).
- Gałąź integracyjna `claude/human-explorer-mobile-tap-nrboog` = 27 commitów przed main.
- Produkcja = `37197555`, **34 commity za main**. Rollback: `37197555`, poprzednia fala `1fedbb58`.
- Schemat bazy: **v19** (v17 pomiar czasu, v18 reset hasła, v19 praca człowieka). Każda kolejna migracja **musi** być v20+ i wyłącznie additive.
- Kandydat na lek: **NIE** (D-164). Bramka zwycięzcy nie umie zwrócić `FINAL WINNER`.
- Run 9: zamrożony, w toku, nietknięty.
