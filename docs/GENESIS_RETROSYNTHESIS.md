# Retrosynteza w Genesis — prawdziwy silnik, uczciwe granice

Retrosynteza jest od teraz **wymaganą zdolnością** Genesis. Ten dokument opisuje, co dokładnie zostało
zintegrowane, co działa, a co jest zablokowane i dlaczego.

## 1. Silnik

**AiZynthFinder** (MolecularAI, licencja MIT) — opublikowany, recenzowany planer retrosyntezy:
przeszukiwanie drzewa metodą Monte Carlo po pojedynczych rozłączeniach proponowanych przez wytrenowaną
politykę szablonową, zakończone, gdy każdy liść jest cząsteczką dostępną w handlu.

> Genheden i in., *AiZynthFinder: a fast, robust and flexible open-source software for retrosynthetic
> planning*, J. Cheminform. 12, 70 (2020).

Genesis **nie dopisuje własnej chemii**: nie ma tu żadnego szablonu, żadnej trasy ani punktacji
napisanej przez nas. `compute/retro_worker.py` uruchamia ten silnik i zwraca to, co silnik oddał.

## 2. Miejsce w kanonicznej strukturze

| Warstwa | Plik | Rola |
|---|---|---|
| Worker | `packages/backend/src/compute/retro_worker.py` | `detect` (wersje + obecność i sha256 plików modelu), `plan` (przeszukiwanie) |
| Adapter | `packages/backend/src/compute/retroAdapter.mjs` | `detect`, `referenceCase`, `planRoute`; zdolność `retrosynthesis-route-search` |
| Rejestr silników | `campaign/toolchain.mjs` → `aizynthfinder` | AVAILABLE **tylko** po zdanym przypadku referencyjnym |
| Manifest zdolności | `compute/capabilities.mjs` → `retrosynthesis` | status żywy, z rejestru |
| Eksperyment | `campaign/retrosynthesis.mjs` | ScienceRun + zdarzenie append-only (Dowody) |
| Powtórka | `campaign/verify.mjs` | ponowne przeszukanie na tych samych modelach, porównanie tras |
| API | `POST /api/projects/:id/campaigns/:cid/retrosynthesis` | uruchomienie (editor+) |
| Protokół końcowy | `campaign/candidateProtocol.mjs` → `synthesis` | trasa albo jawny brak trasy |

Przypadek referencyjny: **kwas acetylosalicylowy**. Planer, który nie rozwiąże aspiryny, nie jest
działającym planerem — rejestr odmawia wtedy statusu AVAILABLE.

## 3. Stan w tym środowisku (2026-09-26, zmierzony)

- Pakiet **instaluje się i importuje**: `aizynthfinder 4.4.1`, `rdkit 2023.9.6`, `rdchiral 1.1.0`,
  `onnxruntime 1.30.0` w osobnym interpreterze (`requirements-retro.txt`).
- **Dane modelu są nieosiągalne**: polityka ekspansji, biblioteka szablonów i stock są publikowane na
  `zenodo.org` i `ndownloader.figshare.com`; oba hosty są zablokowane przez politykę sieci tego
  kontenera (sprawdzone: również `huggingface.co` i pliki wydań GitHuba). Rozmiar ≈ 1 GB, własne
  licencje upstream — Genesis ich nie redystrybuuje.
- Dlatego zdolność raportuje **BLOCKED_BY_RUNTIME: MODEL_FILES_MISSING** i wymienia brakujące pliki
  wraz z ich źródłem. **Żadna trasa nie jest wtedy proponowana** — ani przez model językowy, ani przez
  heurystykę, ani przez „przykładową receptę".

Aktywacja bez zmian w kodzie:

```bash
python -m aizynthfinder.tools.download_public_data /sciezka/do/modeli
export GENESIS_RETRO_PYTHON=/sciezka/do/venv/bin/python
export GENESIS_RETRO_MODEL_DIR=/sciezka/do/modeli
```

Od tego momentu `detect()` zwraca `available: true`, rejestr uruchamia przypadek referencyjny, a
protokół końcowy zaczyna nieść realną trasę.

## 4. Status epistemiczny trasy

`MODEL_ESTIMATE`. Zaproponowana trasa to sekwencja rozłączeń z polityki wytrenowanej na literaturze
reakcyjnej, z materiałami wyjściowymi sprawdzonymi wobec katalogu handlowego. **Nie zawiera** warunków,
stechiometrii, wydajności, obróbki ani oceny bezpieczeństwa i **nie jest** dowodem, że synteza zadziała.
O wykonaniu jakiegokolwiek kroku decyduje wykwalifikowany chemik pod nadzorem instytucjonalnym.

## 5. Powtarzalność

Przeszukiwanie jest ograniczane liczbą iteracji; limit zegarowy dałby wynik zależny od maszyny, więc
silnik raportuje, który limit je zakończył. Tożsamość wyniku (`outputHash`) liczona jest z **tras**, nie
z czasu: te same rozłączenia z tych samych materiałów wyjściowych to ten sam wynik. Powtórka biegu
zatrzymanego zegarem jest raportowana jako `REPLAY_UNSUPPORTED`, nigdy jako dryf.
