# Genesis — pełny spis silników i zdolności

Zmierzone 2026-09-26 w tym środowisku. Nie z pamięci, nie z dokumentacji: każda liczba pochodzi
z uruchomienia rejestru albo narzędzia audytowego, artefakty leżą w `artifacts/`.

**Sprostowanie.** We wcześniejszym raporcie podałem „7 silników". To było zaniżone — policzyłem
jeden rejestr z trzech. Właściciel projektu twierdził, że jest ich około 17, i był bliżej prawdy
niż ja. Rzeczywista liczba zależy od tego, co liczymy, więc poniżej są trzy warstwy osobno,
a nie jedna zmyślona suma.

## Warstwa 1 — silniki naukowe firm trzecich (9 zarejestrowanych, 7 zweryfikowanych)

Rejestr: `packages/backend/src/campaign/toolchain.mjs`.
Audyt: `node scripts/engine-readiness-report.mjs` → `artifacts/engine-readiness-2026-09-26.json`.
Każdy „READY" ma **zdany własny przypadek referencyjny** i wersję zmierzoną w tym kontenerze.

| Silnik | Wersja | Stan | Przypadek referencyjny |
|---|---|---|---|
| RDKit | 2026.03.6 | READY | PASSED |
| PySCF (chemia kwantowa) | 2.14.0 | READY | PASSED |
| OpenMM (dynamika molekularna) | 8.6.1 | READY | PASSED |
| AutoDock Vina + Meeko (dokowanie) | 1.2.7 / 0.8.0 | READY | PASSED |
| Biopython | 1.88 | READY | PASSED |
| ADMET-AI (Chemprop D-MPNN) | 2.0.1 | READY | PASSED |
| ADMET-AI — toksyczność | 2.0.1 | READY | PASSED |
| AiZynthFinder (retrosynteza) | — | BLOCKED_LIBRARY | pliki modelu niedostarczone |
| PyMeep (fotonika) | — | BLOCKED_LIBRARY | wymaga conda-forge |

## Warstwa 2 — własne kernele rozumowania Genesis (11, wszystkie rozwiązują się w runtime)

Rejestr: `kernelRegistry` (`packages/core/src/mythos/KernelProviderRegistry.ts`), podpinane
w `packages/frontend/src/core/agent/cyberReasoningKernel.ts`. **Zweryfikowane: 11/11 rozwiązuje się
przy starcie** (sprawdzone importem w środowisku testowym, nie odczytem kodu). Każdy zapisuje
do własnego EvidenceLedger.

| Kernel | Domena |
|---|---|
| `particle-collision-sim` | fizyka cząstek |
| `collision-batch` | seria zderzeń |
| `micro-blackhole-sim` | mikro czarne dziury (Schwarzschild, Hawking) |
| `crystal-synthesis-sim` | synteza kryształów / materiałoznawstwo |
| `thermodynamic-reaction-sim` | termodynamika reakcji |
| `central-dogma-model` | biologia molekularna (replikacja, naprawa, splicing, fałdowanie, ETC/ATP) |
| `spacetime-photon-model` | propagacja fotonu w zakrzywionej czasoprzestrzeni |
| `environmental-detective` | graf śledztwa środowiskowego |
| `semantic-verify` | zero-trust weryfikacja semantyczna |
| `deadline-monitoring` | terminy ustawowe (CLOCKWORK) |
| `d140-laboratory` | laboratorium kanoniczne |

## Warstwa 3 — zdolności produktowe (27 zarejestrowanych, 21 dostępnych)

Rejestr: `packages/frontend/src/core/capabilities/genesisCapabilityRegistry.ts`.
Artefakt: `artifacts/capability-registry-2026-09-26.json`.

Rozkład: **AVAILABLE 21 · PARTIAL 4 · PROTOTYPE 1 · NOT_IMPLEMENTED 1.**

Dziedziny: chemia, fizyka, CERN, generowanie światów, miasta/epidemiologia, biologia człowieka,
światy zaawansowane, workery obliczeniowe, produkt.

Trzynaście zdolności ma w rejestrze flagę `showInShowcase` — to jest gotowa, wbudowana w kod lista
kandydatów do pokazu, nie moja propozycja.

### Zdolności AVAILABLE z kanonicznym Evidence i Replay

`main-laboratory` · `chemistry-titration` · `physics-black-hole` · `physics-three-body` ·
`cern-cms-open-data` · `world-director` · `sw4` (epidemiologia miejska) · `spacetime` ·
`manifold-5d` · `biology-lung-impact` · `school-health-prevention-lab` · siedem workerów
obliczeniowych (`worker-pyscf`, `worker-openmm`, `worker-vina`, `worker-biopython`,
`worker-admet`, `worker-toxicity`, `worker-pymeep`).

Dwie z nich mają klasę **LIVE_COMPUTATIONAL_EXPERIMENT** (`chemistry-titration`,
`physics-three-body`), jedna **EXTERNAL_REAL_OBSERVATION** (`cern-cms-open-data` — prawdziwe dane
CMS, nie model).

### Stan częściowy, podany wprost

`drug-discovery` (PARTIAL) · `cern-complex` (PARTIAL) · `wormhole` (PARTIAL) ·
`time-machine` (PARTIAL) · `genesis-9d` (PROTOTYPE) · `virtual-animals` (NOT_IMPLEMENTED).

To, że flagowy `drug-discovery` jest PARTIAL, a nie AVAILABLE, jest celowe: retrosynteza jest
zablokowana brakiem plików modelu, więc rejestr nie twierdzi, że łańcuch jest kompletny.

## Jak to podawać na zewnątrz

Uczciwa i mocna wersja to trzy liczby, nie jedna:

> **20 silników** (9 naukowych firm trzecich + 11 własnych kerneli rozumowania Genesis),
> z czego **7 silników naukowych ma zdany przypadek referencyjny z wersją zmierzoną**,
> a **11 kerneli rozwiązuje się w runtime**.
> Na tym stoi **27 zdolności produktowych, z których 21 jest dostępnych**, każda z klasą
> epistemiczną, Evidence i Replay.

Czego nie wolno robić: sumować warstw do jednej efektownej liczby bez powiedzenia, co się liczy.
Recenzent naukowy zapyta „co to znaczy silnik" i wtedy trzeba mieć tę tabelę, a nie slogan.

## Co z tego wybrać do Engine Showcase

Kryterium: prawdziwy silnik + widoczny wynik + Evidence i Replay + zrozumiałe dla laika w 30 sekund.
Rekomendacja na podstawie powyższego, nie na podstawie wrażenia:

1. **Dokowanie molekularne** (Vina + Meeko, `worker-vina`) — REAL_ENGINE_OUTPUT, redock imatinibu
   na 1IEP z RMSD 0,584 Å. Najmocniejsza liczba w całym projekcie.
2. **ADMET / toksyczność** (ADMET-AI) — MODEL_ESTIMATE, pokazuje, że Genesis odrzuca kandydatów.
3. **Chemia kwantowa** (PySCF, `worker-pyscf`) — liczy naprawdę, robi wrażenie na naukowcu.
4. **CMS Open Data** (`cern-cms-open-data`) — EXTERNAL_REAL_OBSERVATION, prawdziwe dane z CERN
   zweryfikowane sumą kontrolną. Jedyna zdolność oparta na realnej obserwacji, nie na modelu.
5. **Miareczkowanie** (`chemistry-titration`) — LIVE_COMPUTATIONAL_EXPERIMENT, najłatwiejsze do
   zrozumienia dla nienaukowca.
6. **Trzy ciała** (`physics-three-body`) — LIVE_COMPUTATIONAL_EXPERIMENT, deterministyczny
   integrator, ładny wizualnie i uczciwy.
7. **Epidemiologia miejska** (`sw4`, SEIR) — scenariusz z Evidence, bezpośrednio czytelny dla
   sektora publicznego.

Każdy segment pokazu musi podać: nazwę silnika, pytanie, realny wynik, klasę epistemiczną,
Evidence/Replay i wizualizację. Bez tego to jest pokaz slajdów, a nie pokaz zdolności.
