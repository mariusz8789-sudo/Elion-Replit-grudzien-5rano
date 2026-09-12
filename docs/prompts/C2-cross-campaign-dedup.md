# PROMPT DLA C2 — cross-campaign dedup w silniku kampanii lekowych (jedyna realna luka z audytu Qwena)

Gałąź: `claude/genesis-autonomous-completion-95bt4e`. **`git fetch` pierwsze.** Przeczytaj
`docs/GENESIS_AUTONOMOUS_DISCOVERY_ENGINE_MASTER_SPEC.md` (pakiet Qwena) i
`docs/DISCOVERY_ENGINE_AUDIT_2026-09-12.md` (realny audyt repo względem tego pakietu) —
w CAŁOŚCI, oba, zanim zaczniesz. To zadanie to jedyny element z audytu, który jest
prawdziwie brakujący (`CZEGO BRAKUJE`/`CO TRZEBA TYLKO ROZSZERZYĆ`) i jednocześnie ma
sens jako osobne, wąskie zadanie.

## Kontekst, który musisz znać — audyt już Cię oszczędza od 90% pracy Qwena

Pakiet Qwena proponuje ogromną nową warstwę: `DiscoveryCore` orchestrator, `HypothesisGenerator`,
`CandidateGenerator`, `ExperimentPlanner`, `StoppingRules`, interfejs `Laboratory`. **Audyt
znalazł, że prawie wszystko z tego JUŻ ISTNIEJE, w pełni działające, autonomiczne, z
własnym demo:**

- Pełny, autonomiczny, wielogeneracyjny silnik kampanii lekowej:
  `packages/backend/src/campaign/orchestrator.mjs::runCampaign` (generate→walidacja RDKit→
  wykonanie→ranking Pareto→adaptacja strategii→stop, ZERO człowieka na rundę), demo:
  `npm run campaign:demo` (`scripts/campaign-demo.mjs`).
- Adaptacyjne reguły stopu: `packages/backend/src/campaign/nextExperiment.mjs::analyzeAndDecide`
  (`STOP_OBJECTIVE_REACHED`/`STOP_NO_IMPROVEMENT`/`STOP_RESOURCE_LIMIT`).
- Generowanie kandydatów + dedup WEWNĄTRZ jednej kampanii:
  `campaign/drugAdapter.mjs::generateProposals`/`generateRecombinationProposals`, dedup przez
  `seenCanonical` (Set) w `orchestrator.mjs`.
- Ranking Pareto: `campaign/pareto.mjs`.
- Wyjaśnialność: `campaign/why.mjs`, `discoveryGraph.mjs`.
- Replay/weryfikacja: `campaign/verify.mjs::verifyScienceRun`.
- Generowanie NOWYCH hipotez (nie tylko wybór z zadeklarowanych): `core/agent/parameterAlternative.ts`,
  `mechanismGeneration.ts`, `structuralAlternative.ts`.
- Dyspozytor "co dalej" łączący frontend z tym silnikiem backendowym JUŻ ISTNIEJE:
  `core/agent/nextAction.ts::makeCampaignNextAction`, zarejestrowany jako `CAMPAIGN_SELECTOR_ID`
  w `NEXT_ACTION_SELECTORS` — **nie buduj tego drugi raz, to była pomyłka pierwszej wersji
  audytu, poprawiona w `docs/DISCOVERY_ENGINE_AUDIT_2026-09-12.md` sekcja B.**

**Jedyna prawdziwa luka**: dedup działa TYLKO wewnątrz jednej kampanii (`seenCanonical` jest
lokalnym `Set`em, tworzonym od nowa w każdym wywołaniu `runCampaign`). Nowa kampania może
ponownie zaproponować i ponownie wykonać cząsteczkę, którą poprzednia kampania już wyczerpała.
`packages/backend/src/campaign/persistence.mjs::listCandidates(db, campaignId, generation)`
jest zawężone do JEDNEGO `campaignId` — nie ma żadnej funkcji odpytującej WSZYSTKIE kampanie.

## Zadanie — dokładnie to, co audyt zaproponował w sekcji E, punkty 1-2

1. **Rozszerz `campaign/persistence.mjs`**: dodaj funkcję (np. `listCandidatesAcrossCampaigns(db, { excludeCampaignId? })`
   albo podobną, nazwij ją sensownie) zwracającą kanoniczne SMILES + fingerprint celu/ograniczeń
   ze WSZYSTKICH zapisanych kampanii, nie tylko jednej. Sprawdź istniejący schemat SQLite
   (`createCampaign`/`addCandidate`) zanim zaprojektujesz zapytanie — reużyj istniejących kolumn,
   nie dodawaj nowej tabeli, jeśli obecna wystarcza.
2. **Rozszerz `campaign/orchestrator.mjs`**: obok istniejącego `seenCanonical` (per-run), dodaj
   `seenCanonicalGlobal` wypełniony PRZED pierwszą generacją z (1), zawężony do kampanii z TYM
   SAMYM fingerprintem celu/ograniczeń (`objectiveVector`/`constraintViolations` — sprawdź, jak
   `multiFidelity.mjs`/`why.mjs` już identyfikują "ten sam cel", i reużyj tego, nie wymyślaj
   nowego formatu fingerprintu). Kandydat już wyczerpany przez inną kampanię o TYM SAMYM celu
   jest odrzucany, z realnym powodem w `campaign/why.mjs::whyCandidate` (nie cichym pominięciem).
3. **Udowodnij to realnym demo**: rozszerz `scripts/campaign-demo.mjs` (albo dodaj równoległy,
   sparametryzowany skrypt) tak, żeby uruchomić TĘ SAMĄ kampanię DWA RAZY z tym samym celem —
   drugie uruchomienie musi realnie pominąć kandydatów, których pierwsze już wyczerpało, z
   dowodem w logu (liczba pominiętych, ich SMILES, powód).

## Czego NIE robić — audyt już to sprawdził

- NIE buduj `DiscoveryCore`, `HypothesisGenerator`, `CandidateGenerator`, `ExperimentPlanner`,
  interfejsu `Laboratory` — wszystkie mają już realne odpowiedniki (patrz wyżej i sekcja A
  audytu). `experimentFabric/router.ts` (17 domenIds) i `campaign/toolchain.mjs` JUŻ SĄ tym
  interfejsem domenowym.
- NIE dotykaj `core/agent/nextAction.ts::makeCampaignNextAction` — już istnieje, już
  zarejestrowany, nie potrzebuje szóstego selektora.
- NIE buduj przyczynowości/DiD/policy — to jest zadanie C1 (`docs/prompts/C1-B1-ulez-no2-adjudication.md`),
  osobny plik, osobna gałąź logiki, nie mieszaj.
- Jednolitość słownictwa stopu (`InquiryStopReason` vs `DECISIONS` w `nextExperiment.mjs`) —
  wspomniana w audycie jako drobna luka dokumentacyjna, NIE rób tego w tym zadaniu, chyba że
  zostaniesz o to osobno poproszony — zakres tego promptu to WYŁĄCZNIE cross-campaign dedup.

## TDD i weryfikacja

1. Test na czerwono najpierw: dwie kampanie o tym samym celu, druga MUSI pominąć kandydata
   pierwszej — wzorzec istniejących testów w `packages/backend/src/campaign*.test.mjs` (sprawdź
   `grep -rl "runCampaign\|orchestrator" packages/backend/src/*.test.mjs`).
2. Regresja: istniejące testy kampanii, `campaign/verify.mjs`, `why.mjs` nietknięte w zachowaniu
   dla JEDNEJ kampanii (dedup per-run musi działać dokładnie jak wcześniej).
3. Realne demo z dowodem w logu (nie tylko testy jednostkowe) — `npm run campaign:demo` (albo
   nowy skrypt) uruchomiony DWUKROTNIE, drugi przebieg pokazuje realne pominięcia.

## ZASADY TWARDE

1. Dowód = komenda + wyjście + hash commita.
2. `git fetch` przed KAŻDYM pushem — C1 pracuje równolegle na A1/B1.
3. Zero nowego silnika — to jest rozszerzenie istniejącego `campaign/*`, nie nowy moduł.
4. Nie fabrykuj fingerprintu celu — reużyj to, co `multiFidelity.mjs`/`why.mjs` już liczą dla
   identyfikacji "ten sam cel"; jeśli nic takiego nie istnieje, zgłoś to jako blocker zamiast
   wymyślać nowy schemat.
5. Pełna bramka przed pushem: eslint, tsc, oba suite'y (frontend I backend — to zadanie dotyka
   tylko backendu, ale regresja musi być sprawdzona wszędzie), build, `node scripts/repro-demo.mjs`.

## DONE

- Cross-campaign dedup realnie działający, dowiedziony testem i demo (nie deklaracją).
- `why.mjs::whyCandidate` podaje realny powód odrzucenia dla kandydata pominiętego przez
  cross-campaign dedup.
- Zero regresji w istniejącym per-run dedup ani w żadnym innym teście kampanii.
- `docs/DISCOVERY_ENGINE_AUDIT_2026-09-12.md` zaktualizowany: sekcja B/E, ten punkt przeniesiony
  z „CZEGO BRAKUJE" do zamkniętego, z dowodem.
