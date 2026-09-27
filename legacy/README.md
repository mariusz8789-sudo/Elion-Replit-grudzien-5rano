# legacy/ — kod odzyskany z niescalonych gałęzi

**Status: ARCHIWUM. Nie jest budowany, uruchamiany ani lintowany** (`legacy/**` jest w `ignores` w `eslint.config.mjs`; żaden pakiet ani test go nie importuje).

Po co to jest: 27.09.2026 przegląd wszystkich 106 gałęzi repozytorium pokazał, że część pracy (od Claude, Manusa, Codexa, Astry, Qwena) istniała **tylko** na gałęziach, które nigdy nie weszły do `main` — głównie dlatego, że historia `main` została założona od nowa 25.09 (commit 092e937f) i starsze gałęzie nie mają z nią wspólnego przodka. Zanim ktokolwiek usunie stare gałęzie, ten katalog trzyma ich unikalną treść w `main`.

Zasada kopiowania: przeniesiono tylko pliki, **których ścieżki nie ma na `main`**, bajt w bajt z gałęzi (bez zrzutów ekranu, filmów i modeli 3D). Pliki, które `main` ma w nowszej wersji, zostały na gałęzi. Nic tu nie jest zweryfikowane na nowo — to dokładnie to, co było na gałęzi.

| Katalog | Gałąź źródłowa | Data | Co to jest |
|---|---|---|---|
| `genesis-2026-07/` | `genesis/main` (= `claude/genesis-takeover-audit-kpz019`) | 2026-07-31 | „Stary Genesis”: backend `cognitive/` (ZEFIR Truth Engine, formalKernel, Necropolis, grounding), `corpus/`, `validation/`, `lookingGlass/`, `reasoning/`, `billing/` (Stripe, API_TIERS), pakiet `packages/reasoning` (długowieczność), ekrany produktu komercyjnego, skrypty ZEFIR. Dokumenty tej wersji: `docs/legacy/genesis-2026-07/`. |
| `movex-2026-07/` | `claude/p2p-agent-movex-builder-tu22tm` | 2026-07-19 | **Osobny produkt**, nie Genesis: „Point to Point / MoveX”, marketplace transportowy (60+ tabel, 2 OpenAPI, Stripe escrow, WebRTC, 18 języków). Kandydat do osobnego repozytorium. |
| `temporal-engine-2026-09/` | `claude/temporal-engine-phase-1` | 2026-09-04 | `core/automotive` (audyt kosztorysów szkód — osobny produkt), `core/discovery` (epistemicEngine, sources — pobieranie źródeł, physics), pakiety wiedzy KIMI #3–#6 z DOI/PMID i notami o pochodzeniu, `core/virtualLab`, `core/world`. |
| `manus-product-access-control-2026-09/` | `manus/product-access-control` | 2026-09-03 | 7 plików, których nie ma w `temporal-engine-2026-09/` (reszta identyczna). |
| `manus-visual-p1-world-2026-08/` | `manus/visual-p1-world` | 2026-08-22 | `core/experimentFabric` v0, geometria Virtual CERN, 19 skryptów e2e `scientific-discovery-*`. Sekcja wiedzy Virtual CERN przeniesiona do `knowledge/particle.md`. |
| `codex-handoff/` | 5 gałęzi (np. `claude/genesis-spacetime-universe-integration`) | 2026-09-22 | Źródła paczek Codexa: mega-pack v2 (d141, precisionBay = D-142, astraWorldAuthor, deviceSafety, providerRouter, cyberScientist…), engine-suite-e2e-v1, v6/v6.1/v7, hash-port. Dokumenty: `docs/reference/codex-handoff/`. |
| `c1-visual-snapshot-2026-09-21/` | `claude/genesis-c1-visual-snapshot` (0efeb774, 3444a900) | 2026-09-20/21 | Reszta pracy, której konsolidacja nie zabrała i której nie przeniesiono do produktu: Biomedical Bay (8. pokój), Laboratorium Kanoniczne (7 pokoi), docking/PK w przeglądarce (**odrzucone** — docking tylko przez backend Vina), `urbanTransformation`, skrypty zrzutów. Część samodzielna (DICOM/NIfTI, sieci anatomiczne, chemia, ekran źródeł wiedzy, mosty flagship) **jest już w produkcie**, patrz D-135 – D-137 w `docs/DECISIONS.md`. |

Czego tu nie ma (zostało tylko na gałęziach): zrzuty ekranu `docs/evidence/d135` i `biomedical-bay` (~64 MB), `artifacts/human-visual-ceiling` Astry (~45 MB), pliki, które `main` zmienił w nowszej wersji.
