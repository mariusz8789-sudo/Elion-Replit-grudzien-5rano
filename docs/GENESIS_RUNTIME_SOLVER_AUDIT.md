# Genesis Runtime Solver Audit

**Data audytu:** 2026-08-18
**Metoda:** istniejący `packages/backend/src/compute/env_probe.py`, uruchomiony bez instalowania pakietów, pobierania modeli lub wykonywania symulacji zastępczej.
**Artefakt surowy:** `genesis_delivery/solver_runtime_audit.json` poza repozytorium.

| Obszar | Stan wykryty przez runtime | Decyzja Genesis |
|---|---|---|
| Wykonywanie procesów | Dostępne | Możliwe dla zatwierdzonych, izolowanych adapterów w przyszłości. |
| GPU / CUDA | Niedostępne | Nie planować GPU-only solverów jako aktywnego runtime. |
| RDKit, OpenMM, PySCF, MDAnalysis, PDBFixer, BioPython, ProLIF, DeepChem, Meeko, Open Babel, xTB, Psi4, Vina, ADMET-AI, Torch, Chemprop | `NOT_INSTALLED` | Nie uruchamiać i nie deklarować jako dostępne. Zachować istniejące seamy. |
| OpenFOAM, FEniCSx, Einstein Toolkit, OpenMC, solver Schrödingera | Nie są obecne jako zatwierdzone runtime w repozytorium | Pozostawić `ENGINE_NOT_AVAILABLE` zgodnie z manifestami External Adapter. |
| Analityczne modele TypeScript oraz `EpidemicCitySimulation` | Dostępne lokalnie i testowane przez Experiment Fabric | Pozostają jedynym źródłem obliczonych wyników w bieżącym etapie. |

> **Werdykt.** W środowisku istnieje bezpieczne wykonanie procesów, ale nie wykryto dodatkowego dojrzałego solvera naukowego, który można uczciwie podłączyć bez instalacji, pobierania danych lub konfiguracji runtime. Genesis nie wprowadza solvera zastępczego. Wszystkie zewnętrzne integracje pozostają jawnie opisanymi seamami.

## Następny poprawny krok

Przed aktywacją któregokolwiek adaptera należy przyjąć zatwierdzony obraz/koszty zasobów, dane wejściowe, izolację jobów, test reprodukowalności i format artefaktów provenance. Do tego czasu `ENGINE_NOT_AVAILABLE` jest wymaganym, poprawnym wynikiem Fabric.
