# Brakująca wiedza — czego szukać w swoich plikach

Stan na 27.09.2026. Każdy dokument poniżej jest przywoływany w repozytorium jako istniejący, ale **nie ma go w żadnej z 106 gałęzi ani w historii commitów** (sprawdzone przeszukaniem wszystkich gałęzi). Powstały w rozmowach z innymi modelami (Qwen, GPT, Gemini, Claude) i nigdy nie zostały zapisane do repo. Nie wolno ich odtwarzać z pamięci modelu: to kontrakty prerejestracji, więc liczy się dokładny, oryginalny tekst.

Jeśli znajdziesz plik (w Pobranych, w czacie, w mailu), wystarczy go przesłać — trafi dosłownie pod podaną ścieżkę.

| Szukana nazwa pliku | Co zawiera (według odwołań) | Kto się na niego powołuje |
|---|---|---|
| `QE4_REAL_DATASET_AND_EXPERIMENT.md` | Kontrakt prerejestracji QE4 (dane Brydges 2019): predykcje P1–P4, tolerancje, dekompozycja tautologii, kryteria falsyfikacji (sekcje 8–13), nagłówek „Scope: research only. No production code...”. Werdykt tamtego etapu: PARTIAL. | `docs/prompts/C2-QE4-brydges-execution.md:9,20,123`, `knowledge/quantum.md:260` |
| `A1_GLP1_SUBSTITUTION_REAL_DATASET_AND_EXPERIMENT.md` | Kontrakt prerejestracji A1: czy liraglutyd jest farmakologicznie uzasadnionym substytutem na receptorze GLP-1; pasmo potencji [0.1, 10], margines skuteczności ±0.4 pp, kryteria falsyfikacji (punkty 5, 8, 10–12). | `docs/prompts/C1-A1-glp1-substitution.md:14,116` |
| `GENESIS_TAUTOLOGY_AND_EMPIRICAL_TEST_GATE.md` | Specyfikacja bramki tautologii: 25 „golden test cases” i reguły C1–C6. Implementacja w repo powstała bez niej (patrz `docs/TAUTOLOGY_GATE_AUDIT.md`). | `docs/GRANT_READINESS_REPORT.md:88,150`, `docs/TAUTOLOGY_GATE_AUDIT.md:10` |
| `QE4_GROUND_STATE_DATASET_SEARCH.md` | Wynik zlecenia dla Qwena: przegląd zbiorów danych stanu podstawowego do QE4 (werdykt BLOCKED/PARTIAL/FOUND, tabela kandydatów). Mogło nigdy nie powstać. | `docs/prompts/QWEN-QE4-ground-state-datasets.md:81` |
| `frontier-science.md` | Planowany plik wiedzy dla „AI Mentora”. Mogło nigdy nie powstać. | `VISION-BACKLOG.md:579` |

## Dane, które istnieją, ale są poza repo

| Co | Stan | Gdzie jest wzmianka |
|---|---|---|
| Pliki modeli AiZynthFinder (retrosynteza): `uspto_model.onnx` (lub `uspto_expansion.onnx`), `uspto_templates.csv.gz` (lub `uspto_unique_templates.csv.gz`), `uspto_filter_model.onnx`, opcjonalnie `uspto_ringbreaker_*`, `zinc_stock.hdf5`, `config.yml` | Blokada pobierania w chmurze (403). Na telefonie widać `uspto_filter_m…` (50,39 MB i 16,79 MB), `uspto_ringbrea…` (zip) i `config.yml` z 26.09 — to wygląda właśnie na te pliki. | `docs/GENESIS_RETRO_MODEL_FILES.md` |
| Surowe pliki NIST dla atomu wodoru (G3) | W CI zapisano tylko sumy SHA-256 | `docs/GENESIS_ATOM_BOHR_G3_READINESS.md` |
| Dane DEFRA AURN (NO₂, ULEZ) | Były tylko artefaktami CI | D-025 w `docs/DECISIONS.md` |
| Wersja wydania ChEMBL i dokładne zapytanie dla GLP-1R/GIPR | Nie zapisane w `*.meta.json` | `docs/A1_GLP1_EXECUTION_HANDOFF.md:51` |
| `genesis_delivery/…` (kolejka wiedzy wideo, audyt solverów) | Ścieżki z czyjegoś komputera (`/home/ubuntu/genesis_delivery/…`) | `docs/GENESIS_SUPPLEMENTAL_KNOWLEDGE_PROVENANCE.md:19`, `docs/GENESIS_RUNTIME_SOLVER_AUDIT.md:5` |
