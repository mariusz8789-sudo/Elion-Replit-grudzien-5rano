# MASTER PRIORITY — GENESIS

Ustalone przez Scientific Director (C1) po audycie Priorytetu 1 (Autonomous
Discovery), Priorytetu 4 (Virtual Cell Lab) i Priorytetu 5 (Virtual Human),
2026-09-09. Obowiązuje dla C2 (Graphics Engine) i C3 (World Model /
Scientific Substrate) od tego commita do odwołania.

**Uzasadnienie**: dowód naukowy najpierw, opakowanie (Priorytet 3 —
Product/Funding Readiness) potem. Punkt 5 poniżej (dane z prawdziwego
eksperymentu wracające do Genesis) jest ważniejszy dla wartości projektu niż
kolejne demo/laboratorium 3D — to jest ta kombinacja (mechanistyczny
substrat + udowodniona pętla falsyfikacji + realne zamknięcie eksperymentem),
która faktycznie odróżnia Genesis od FutureHouse/Google Co-Scientist/Sakana
(patrz `GENESIS_NORTH_STAR.md` §7, "Why Priority 5 alone does not
differentiate Genesis, and what does").

## P0 — C3: MECHANISM generation → discoveryOrchestrator → pełny StrategyRun

`mechanismGeneration.ts` istnieje i realnie komponuje dwa zadeklarowane
levery w jeden fork, ale `discoveryOrchestrator.ts`'s PARAMETER path routes
its own generation continuation as a second `StrategyRun`
(`runInquiryWithGeneration`) while MECHANISM still returns its own result
shape and is not routed through this front door at all — stwierdzone
wprost jako dług w commitcie `ccb7555`/`9b5b54e`
("MECHANISM has a generation path, this front door does not route it yet").
Zamknąć tę asymetrię tak samo, jak PARAMETER: drugi `StrategyRun`, nie nowy
kontrakt.

## P0 — C3: domknięcie autonomous research chain

Wynik → nowe pytanie → kolejny eksperyment → kolejny wynik, autonomicznie,
przez kilka kroków — nie tylko jedno wygenerowane pytanie i stop. Reuse
`runInquiryWithGenerationAndRemember` i istniejący Memory → Selection path;
nie budować drugiej pętli.

## P1 — C2: Virtual Cell Lab + prawdziwy demo flow

MVP (`CellLabScreen.tsx`, Control vs Treatment na realnym `cellCycle.ts`)
już wylądował na `main`. Zrobić z tego naprawdę mocny demo-case oparty na
istniejącym solverze — bez nowego silnika.

## P1/P2 — C1+C3: Real Experiment Interface jako rozszerzenie ExperimentFabric

Docelowy przepływ:

```
Hypothesis → Prediction → ExperimentRequest → Real Experiment → Raw Data
  → Derived Data → Evidence → Falsification/Support → Memory → Next Experiment
```

Nie integrować jeszcze konkretnego sprzętu ani laboratorium. Zbudować
kontrakt tak, żeby późniejszy realny wynik dało się wprowadzić bez
przebudowy architektury.

### KLUCZOWE — przy tym samym zadaniu: rozszerzyć proweniencję danych

`packages/frontend/src/core/dataSource.ts`'s obecne `isSynthetic: boolean`
nie wystarcza — nie rozróżnia symulacji Genesis, danych
referencyjnych/literaturowych i przyszłego prawdziwego pomiaru
laboratoryjnego. To osobna oś od `ConfirmationLevel` w `citation.ts` (ta
ocenia, jak dobrze ugruntowana jest NAUKA; ta tutaj — skąd wzięła się
LICZBA).

Docelowy model:

```
SIMULATED         = wynik modelu/solvera Genesis
REFERENCE         = zewnętrzne dane referencyjne/literaturowe
REAL_EXPERIMENTAL = wynik rzeczywistego eksperymentu laboratoryjnego
```

Musi propagować się przez cały łańcuch bez utraty:

```
ExperimentFabric → ExperimentRun → Evidence → StrategyRun → Memory → UI/Replay
```

Nigdy nie oznaczać realnych danych laboratoryjnych jako `SIMULATED` ani nie
mieszać ich z danymi syntetycznymi w jednym nieoznaczonym polu. Lepiej
zrobić to rozszerzenie teraz, przy budowie Real Experiment Interface, niż
później odkryć, że połowa Evidence/Memory/Replay milcząco zakłada tylko
`isSynthetic`.

## P2 — dalej: pierwszy eksperyment na prawdziwych komórkach

Po zbudowaniu Real Experiment Interface i rozszerzonej proweniencji:
pierwszy prawdziwy eksperyment na prawdziwych komórkach, dane wracają do
Genesis przez ten sam kontrakt, oznaczone `REAL_EXPERIMENTAL`.

## Priorytet 3 — Product/Funding Readiness

Pozostaje ważny, ale NIE jest teraz blockerem i nie konkuruje z powyższym.
Wracamy do niego po uzyskaniu mocnego scientific proof/demo — łatwiej będzie
zrobić dużo mocniejszy pitch mając za sobą realne zamknięcie eksperymentem
niż budować opakowanie wcześniej.

## Zasady wykonania (bez zmian względem reszty roadmapy)

- Nie tworzyć równoległych subsystemów. Reuse istniejący Fabric, Discovery,
  Memory, Evidence/Replay — nowy silnik tylko tam, gdzie faktycznie żaden
  mechanizm jeszcze nie istnieje (patrz audyt Priorytetu 5: neuron/synapse
  solver naprawdę nie istnieje nigdzie w `core/worldModel/domains/`).
- Każda zmiana: tests + tsc + eslint + build + odpowiedni live verification,
  potem commit.
- Cyber/GOV pozostaje OFF `main` — bez zmian.
