# PROMPTS — zadania rozdzielone między sesje

Prompty są tu, a nie w czacie, bo czat ginie, a zadanie zostaje. Każdy jest
SAMOWYSTARCZALNY: podaje gałąź, stan wejściowy z hashem commita, zasady twarde
i definicję DONE, więc sesja przyjmująca nie musi rekonstruować kontekstu.

| Plik | Dla | Pakiet | Stan wejściowy |
|---|---|---|---|
| `C2-P1-higiena-testow-i-danych.md` | C2 | P1.1–P1.3 (+ R-001 jako bonus) | P0 zamknięte na `5f88c8f` |
| `C3-P2.1-tautology-gate.md` | C3 | P2.1 — **zaczyna od blokera** | spec nie istnieje w repo |
| `QWEN-P2.3-kotwica-zewnetrzna.md` | Qwen | P2.3 + P2.2 (pakiet badawczy) | R-005 w `RISKS.md` |
| `QWEN-QE4-QE7-obserwable.md` | Qwen | QE4–QE7 (pakiet badawczy) | QE1–QE3 zamknięte na `43a6a8e` |
| `C3-P2.3-kepler-anchor-i-P2.2-solar-ingestion.md` | C3 | druga kotwica (Kepler) + ingestion Solar Mind | Qwen dostarczył pakiet (trafił do C3 przez pomyłkę); P2.3 (PubChem) już DONE na `c181668`/`14312f8` |
| `C1-R005-cms-zmumu-pinning.md` | C1 | R-005 — pierwsza instrumentalna kotwica (CMS Open Data Z→μμ) | P2.3 (obie kotwice + belief revision) DONE na `a822fa0`; model Fabric i worker już istnieją, czekają na dane |
| `C2-QE4-brydges-execution.md` | C2 | wykonanie QE4 na realnym zbiorze Brydgesa (Zenodo 2527010) | własny research `QE4_REAL_DATASET_AND_EXPERIMENT.md` (jeszcze poza repo — krok 0 zadania), CI recon na `773bef0` |
| `C3-QE5-QE6-QE7-implementacja.md` | C3 | implementacja QE5–QE7 wg pakietu Qwena | `QWEN-QE4-QE7-obserwable.md` już w repo; QE1–QE3 zamknięte |
| `QWEN-QE4-ground-state-datasets.md` | Qwen | szukanie zbioru zdolnego domknąć ŚCISŁY test QE4 (pakiet badawczy) | `QE4_REAL_DATASET_AND_EXPERIMENT.md` (C2): ścisły test BLOCKED, wycinek strukturalny READY |
| `C1-A1-glp1-substitution.md` | C1 | A1 — GLP-1 substytucja (semaglutyd↔liraglutyd), część 2 po CMS | pakiet Qwena `DRUG_SUBSTITUTE_REAL_DATASET_AND_EXPERIMENT.md`; reużywa wzorzec `chembl.ts` |
| `C1-B1-ulez-no2-adjudication.md` | C1 | B1 — ULEZ 2023→NO₂, adjudykacja sprzecznych publikacji (Tong vs TfL) | pakiet Qwena `B1_ULEZ_NO2_ADJUDICATION_REAL_DATASET_AND_EXPERIMENT.md`; wymaga NOWEGO reużywalnego modułu `causalInference.ts` (DiD/ITS/synthetic-control) — użytkownik jawnie autoryzował budowę |
| `C1-QE4-multi-verdict-architecture-audit.md` | C1 | audyt architektury: eksperyment z wieloma niezależnymi werdyktami nad jednym zbiorem (Phase 6 po QE4) — **idzie PRZED B1** | QE4 (C2) GREEN na `dab127d0`/`f4818cf4`; luka zidentyfikowana przez C2 przy okazji wykonania QE4 |
| `C2-cross-campaign-dedup.md` | C2 | cross-campaign dedup w silniku kampanii lekowych — jedyna realna luka z audytu pakietu Qwena | `docs/DISCOVERY_ENGINE_AUDIT_2026-09-12.md` + `docs/GENESIS_AUTONOMOUS_DISCOVERY_ENGINE_MASTER_SPEC.md` na `03be47c`; `campaign/orchestrator.mjs` dedupuje tylko WEWNĄTRZ jednego przebiegu |
| `2026-09-12-DZIS-priorytety-F1.md` | C1+C2+C3+Qwen | GO dla P0 z klasyfikacji Discovery Engine — zadania na dziś, jeden dokument, cztery strony | `docs/DISCOVERY_ENGINE_FINAL_CLASSIFICATION_2026-09-12.md` na `75ebdc1` |
| `2026-09-13-PO-SILNIKU-podzial.md` | C1+C2+C3+Qwen | podział prac PO zamknięciu silnika odkryć + werdykt na Atlas i na wizję „automatycznego laboratorium" | silnik generyczny na `166665f`, `repro-demo` 35/35 |
| `QWEN-RESEARCH-DIRECTOR-MISSION.md` | Qwen | rola i pełny mandat Research Directora (źródło Atlasu) | dokument wejściowy od użytkownika, zapisany dosłownie |

Kolejność u C1: CMS → A1 → **ten audyt architektury** → B1 → P3 (pakiet grantowy), jeśli nic
pilniejszego nie wypłynie z powyższych torów. Audyt architektury jest wstawiony PRZED B1, bo
decyzja stąd (REUSE/EXTEND/NEW REUSABLE ABSTRACTION) wpływa na to, jak B1 (wiele metryk/okien
DiD) i przyszłe QE5-7 będą reprezentowane.

## Dwa wspólne warunki odbioru dla KAŻDEGO z tych zadań

1. **Dowód albo `NOT VERIFIED`.** Twierdzenie „naprawione/zweryfikowane" bez
   komendy, wyjścia i hasha commita nie jest raportem, jest deklaracją.
2. **Brak wejścia = BLOCKED, nie improwizacja.** Jeśli zadanie odwołuje się do
   pliku/danych, których nie ma (jak spec Tautology Gate), właściwą odpowiedzią
   jest zgłoszenie tego, a nie wymyślenie treści i podpisanie jej jako cudzą.
3. **`git fetch` PRZED czytaniem "co już jest zrobione" w promptcie, nie tylko przed
   pushem.** Kilka sesji pcha na tę samą gałąź równolegle i potrafi domknąć część
   zadania w kilka minut (QE4 Phase 0 zamknięto między napisaniem promptu dla C2 a
   jego zapisaniem w repo) — sekcja "stan wejściowy"/"co już istnieje" w każdym
   promptcie jest prawdziwa na podany hash commita, nie na zawsze.

## Dokumenty wejściowe od użytkownika i Research Directora (poza `prompts/`)

Wklejone w czacie, zapisane dosłownie do repo, bo czat ginie a zadanie zostaje.
**Każdy z nich ma notę redakcyjną C1 na górze: stan repozytorium jest nadrzędny
wobec etykiet statusu w tych dokumentach.**

| Plik | Co to jest | Status |
|---|---|---|
| `docs/GENESIS_ENGINE_MISSION_MANDATE.md` | nadrzędne zadanie „BUILD THE ACTUAL ENGINE, NOT ANOTHER DEMO" (PHASE 1–10, §13 „czego nie uznaję za DONE", §15 model B po obserwacji, zakaz udawania EIG) | PHASE 1–8 zrobione (`54c78c1`, `166665f`); reszta spisana jako otwarta |
| `docs/MASTER_SPEC_DELTA_V3.md` | DELTA v3 — ownership, task board, zakres P0 wg Qwena | task board **stale** po `166665f`; §0 (dedup UNVERIFIED, EIG BLOCKED) nadal obowiązuje |
| `docs/A1_GLP1_EXECUTION_HANDOFF.md` | pełny kontrakt wykonawczy A1 (GLP-1, semaglutyd↔liraglutyd) | READY FOR EXECUTION / NOT RUN; owner C2 |
| `docs/GENESIS_SCIENTIFIC_FRONTIER_ATLAS.md` | Atlas granic nauki (Top 100, moonshoty, rejestr zbiorów danych) | materiał zwiadowczy; werdykt wdrożeniowy w `2026-09-13-PO-SILNIKU-podzial.md` |
| `docs/GENESIS_AUTOMATIC_LABORATORY_VISION.md` | wizja: mikroskop = oczy, silnik = mózg, pamięć, laboratorium = ręce; 6 poziomów „znajdź szczepionkę" + granica bezpieczeństwa medycznego | kierunek; poziomy 1–3 w zasięgu kodu, 4–6 wymagają sprzętu |
