# Genesis — readiness pierwszego realnego solvera

**Data audytu:** 18 sierpnia 2026
**Decyzja:** **nie aktywować nowego solvera w bieżącym runtime.**

## Wynik

Pasywny probe runtime potwierdził obecność wyłącznie Python 3.12, NumPy i Matplotlib. Nie wykrył SciPy, OpenFOAM (`foamRun`, `simpleFoam`), FEniCSx/DOLFINx, MPI, Gmsh, Docker, CUDA/GPU, RDKit, OpenMM, PySCF, Psi4, QuTiP ani Torch. NumPy nie jest samodzielnym solverem domenowym; napisanie na jego podstawie nowego modelu w tym etapie byłoby nową implementacją, a nie uczciwym podłączeniem istniejącego solvera.

> **Werdykt:** żaden kandydat CFD/FEM/GR/quantum nie przechodzi obecnie bramki runtime → licencja → dane referencyjne → benchmark → izolacja → provenance. Istniejące `ENGINE_NOT_AVAILABLE` i adapter seams są prawidłowym produktem, nie brakującym „mockiem”.

## Matryca kandydatów

| Kandydat | Runtime dzisiaj | Licencja / źródło | Dane referencyjne i benchmark | Decyzja |
|---|---|---|---|---|
| OpenFOAM CFD | Brak `foamRun`, `simpleFoam`, `openfoam`, Docker i GPU. | Fundacja OpenFOAM dystrybuuje OpenFOAM jako GPLv3; udostępnia pakiety Ubuntu. [1] | Brak zatwierdzonego case’u, mesh, warunków brzegowych, referencji i polityki artefaktów. | `ENGINE_NOT_AVAILABLE`; nie instalować ad hoc. |
| FEniCSx / DOLFINx FEM | Brak `dolfinx`, `fenics`, `mpirun`, Gmsh i PETSc/SLEPc. | Projekt FEniCS publikuje instalację przez conda i apt oraz wskazuje składniki FEniCSx. [2] | Brak sformułowania PDE, siatki, testu analitycznego i właściciela walidacji domenowej. | `ENGINE_NOT_AVAILABLE`; nie instalować ad hoc. |
| Einstein Toolkit numerical relativity | Brak toolkit, MPI i repo checkout. | Toolkit ma komponenty open-source, lecz licencje mogą różnić się między komponentami. [3] | Oficjalne wymagania obejmują checkout, kompilatory i zwykle MPI; brak parameter file, referencyjnego solution oraz zasobów HPC. [4] | `ENGINE_NOT_AVAILABLE`; nie pobierać ani nie kompilować w sandboxie. |
| OpenMC / promieniowanie | Brak zatwierdzonego runtime i danych jądrowych. | Wymaga osobnego audytu licencji danych jądrowych oraz procedury bezpieczeństwa. | Brak benchmarku i danych wejściowych. | `ENGINE_NOT_AVAILABLE`. |
| Quantum chemistry / MD / docking | RDKit, OpenMM, PySCF, Psi4 i zależności nie są obecne. | Wymaga auditów licencji pakietów oraz danych referencyjnych. | Brak zbiorów referencyjnych, receptorów/ligandów, parametrów i eksperta. | `ENGINE_NOT_AVAILABLE`. |
| NumPy | Dostępne, CPU. | Biblioteka numeryczna, nie kandydat „gotowego solvera” w tym etapie. | Nowy solver wymagałby własnego modelu i walidacji. | Nie aktywować jako pozorowanej integracji. |

## Co istnieje już w Genesis

`externalAdapters.ts`, Knowledge Registry, Router i Experiment Fabric już oznaczają niedostępne silniki jako `ENGINE_NOT_AVAILABLE` / capability seam. Nie dodano równoległego rejestru ani atrap wykonania. Dostępne lokalnie modele TypeScript oraz `EpidemicCitySimulation` nadal są jedynym źródłem obliczonych wyników w tym runtime.

## Bramka aktywacji przyszłego adaptera

Przed zmianą dowolnego seamu na aktywny solver należy spełnić **wszystkie** warunki:

| Bramka | Wymagany dowód |
|---|---|
| Runtime | Przypięty obraz/wersja, jawny command, dostępność CPU/GPU/MPI i limity zasobów. |
| Licencja | Zweryfikowana licencja solvera, wrappera, danych i artefaktów; decyzja dystrybucyjna. |
| Wejście | Versioned case/PDE/mesh/warunki brzegowe lub dataset z pełnym provenance. |
| Benchmark | Publiczny lub ekspercki referencyjny przypadek, metryka błędu i akceptowalna tolerancja. |
| Izolacja | Sandbox/job boundary, timeout, pamięć/dysk, ograniczenia sieci i obsługa błędów. |
| Artefakty | Deterministyczny manifest wejścia, stdout/stderr, wersja solvera, wynik i units. |
| Fabric | Adapter mapuje wynik wyłącznie do `ExperimentResult` z `resultOrigin = real-engine`; bez drugiego World State. |
| Review | Właściciel domenowy zatwierdza znaczenie benchmarku i ograniczenia modelu. |

## Najmniejszy kolejny krok po uzyskaniu infrastruktury

Najlepszym pierwszym kandydatem komercyjnym jest **OpenFOAM dla jawnie zdefiniowanego, małego case’u przepływu lub wentylacji**, ale tylko po dostarczeniu zgodnego obrazu runtime, jednego licencjonowanego tutorial/reference case, wartości referencyjnych, limitów CPU/memory oraz review inżyniera CFD. Następnie można utworzyć pojedynczy `ExternalExecutionBackend`, test replikacji i Evidence Pack artefaktów.

Do tego czasu Genesis nie może mówić, że „podłączył CFD”; może uczciwie powiedzieć, że ma prawidłowy kontrakt integracyjny i jawnie zablokowany runtime.

## Referencje

[1]: https://openfoam.org/ "OpenFOAM Foundation — GPLv3, zastosowania i pakiety Ubuntu"
[2]: https://fenicsproject.org/download/ "FEniCSx — instalacja i składniki"
[3]: https://einsteintoolkit.org/software-license.html "Einstein Toolkit — zasady licencjonowania"
[4]: https://einsteintoolkit.org/download.html "Einstein Toolkit — release, pobieranie i wymagania"
[5]: /home/ubuntu/genesis_delivery/solver_candidate_probe.json "Genesis — pasywny audit runtime"
