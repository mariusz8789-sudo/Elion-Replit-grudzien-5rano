# PROMPT DLA C1 — A1: GLP-1 substytucja (semaglutyd ↔ liraglutyd), część 2 po CMS Z→μμ

Gałąź: `claude/genesis-autonomous-completion-95bt4e`. **`git fetch` pierwsze — sprawdź, czy
`docs/prompts/C1-R005-cms-zmumu-pinning.md` jest już zamknięte (kotwica CMS w repo); jeśli nie,
zrób to NAJPIERW — jest mniejsze i w 90% gotowe.** To zadanie to KOLEJNY krok po CMS, nie
zamiennik.

## Skąd to się wzięło

Qwen dostarczył pakiet badawczy `DRUG_SUBSTITUTE_REAL_DATASET_AND_EXPERIMENT.md` (research-only,
`STATUS: READY FOR C1 EXECUTION · NOT RUN`) — pytanie: czy podczas niedoboru semaglutydu
liraglutyd jest farmakologicznie uzasadnionym substytutem na receptorze GLP-1 (porównywalna
potencja + porównywalna skuteczność glikemiczna z etykietowych dawek). Zapisz ten dokument
DOSŁOWNIE jako `docs/A1_GLP1_SUBSTITUTION_REAL_DATASET_AND_EXPERIMENT.md`, zanim cokolwiek
policzysz — to jest kontrakt prerejestracji (punkty 5, 8, 10-12 dokumentu: pasmo potencji
[0.1, 10], margines skuteczności ±0.4 pp, kryteria falsyfikacji), musi być zamrożony PRZED
otwarciem jakichkolwiek danych.

## Dlaczego to NIE jest nowy silnik — reużyj dokładnie ten wzorzec

`packages/frontend/src/core/biotechData/chembl.ts` już ma DOKŁADNIE wzorzec, którego potrzebujesz:
JEDEN pinowany rekord aktywności z `https://www.ebi.ac.uk/chembl/api/data/activity/<id>.json`
(REST, nie masowy zrzut FTP/SQLite `ChEMBLdb`, którego sugeruje pakiet Qwena — **NIE pobieraj
całego ChEMBL_37, to gigabajty; użyj pojedynczych zapytań REST o konkretne aktywności/molekuły/
target, dokładnie jak `chembl-activity-189031.json`**), z twardą funkcją `assertPinnedRecord`
sprawdzającą KAŻDE pole tożsamości (molecule ChEMBL ID, target ChEMBL ID, assay ChEMBL ID,
standardType/Value/Units) — odmawia, jeśli cokolwiek się nie zgadza. Twoje zadanie: ten sam
wzorzec, ale dla **≥3 niezależnych aktywności GLP-1R na semaglutyd I ≥3 na liraglutyd**
(preregistracja pkt 8 wymaga ≥3 per lek), więc potrzebujesz N pinowanych plików JSON (np.
`chembl-activity-<id>-semaglutide.json` / `-liraglutide.json`), nie jednego.

**Wyszukaj prawdziwe ChEMBL ID zanim pinniesz** — molecule ChEMBL ID dla semaglutydu i
liraglutydu, target ChEMBL ID receptora GLP-1R, i konkretne activity ID (np. przez
`https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=<X>&target_chembl_id=<Y>&format=json`)
— **nie zgaduj ID z pamięci.** Jeśli `ebi.ac.uk` jest zablokowany z Twojego sandboksa (zmierz,
nie zakładaj — `curl -sS -o /dev/null -w "%{http_code}\n" --max-time 20
https://www.ebi.ac.uk/chembl/api/data/activity/189031.json`, ten sam URL co istniejący pinowany
rekord, do porównania), użyj tego samego obejścia CI-fetch-pin, którego już czterokrotnie użyłeś
(NIST, Kepler, CMS w tym oknie, QE4/Brydges).

## ClinicalTrials.gov — nowe źródło, zmierz dostęp osobno

`https://clinicaltrials.gov/api/v2/studies` (JSON, bez klucza) — Genesis NIE ma jeszcze integracji
z tym źródłem (`grep -rn clinicaltrials packages/` jest puste na commit bazowy tego promptu).
Zmierz dostęp bezpośrednio z sandboksa PIERWSZE; jeśli zablokowane, ta sama technika CI. Potrzebujesz
**≥2 kwalifikujących badań na lek** (T2DM, ≥24 tygodnie, punkt końcowy HbA1c, opublikowane wyniki)
— pinuj surowe odpowiedzi JSON zapytań (z dokładnym URL-em zapytania w metadanych), nie
przepisane ręcznie liczby.

## Implementacja — reużyj `predictionVerification.ts`/`tautologyGate.ts`/`beliefRevision.ts`

To jest DOKŁADNIE ten sam kształt co kotwice P2.3/QE4: predykcja (mediana stosunku potencji
ChEMBL) kontra obserwacja (różnica skuteczności z badań klinicznych) — ale UWAGA, przeczytaj
uważnie punkt 15 dokumentu Qwena (audyt cyrkularności): **predykcja = stosunek potencji ChEMBL;
TEST = różnica skuteczności CT.gov — te dwie wielkości muszą pozostać rozdzielone, margines
skuteczności (±0.4 pp) pochodzi z KONWENCJI REGULACYJNEJ (non-inferiority), NIGDY z samych
pobranych badań.** Użyj `FalsificationCriterion` + `verifyPredictionAgainstRealExperiment` dla
obu kryteriów (potencja w paśmie [0.1,10]; skuteczność w paśmie ±0.4 pp), `assessTautology`
(wielo-komponentowy, jak w QE4) → oczekiwany `MIXED_TEST` (agregacja liczb = `CONSISTENCY_CHECK`
waga 0; margines-test wobec niezależnych pomiarów = `EMPIRICAL_TEST`). Kontrole negatywne
(punkt 16 dokumentu: semaglutyd vs metformina na GLP-1R — brak potencji spodziewany; semaglutyd
vs insulina glargine HbA1c — duża różnica spodziewana) MUSZĄ być zaimplementowane i realnie
przejść — bez nich test „SUPPORTED" nic nie znaczy (dokładnie lekcja z falsyfikacji w P2.3/QE1-3).

## TDD i weryfikacja

1. Test na czerwono najpierw: `assertPinnedRecord`-owy odmowa przy zmienionym polu tożsamości
   (dokładnie wzorzec z `chembl.test.ts`).
2. Pełny cykl: agregacja potencji (mediana + IQR), agregacja skuteczności (pooled mean + 95% CI),
   test pasma, kontrole negatywne, Tautology Gate, replay.
3. Regresja: `chembl.test.ts`, `substitutionPlanner.test.ts` (INNY moduł, natural-composition —
   nie mylić z tym zadaniem, nie dotykaj go), QE1-3/P2.3 nietknięte.

## ZASADY TWARDE

1. Dowód = komenda + wyjście + hash commita.
2. `git fetch` przed KAŻDYM pushem — inne sesje pchają równolegle.
3. Zero masowego pobierania ChEMBL_37 FTP/SQLite — tylko pojedyncze rekordy REST, wzorem
   `chembl.ts`.
4. `substitutionPlanner.ts`/`substitutionInvestigation.ts` to INNY moduł (natural-product
   substitution, `CandidateDiscoveryReport`) — nie ten sam kształt problemu, nie reużywaj go na
   siłę; nowy, mały moduł dla tego zadania jest uzasadniony.
5. Margines skuteczności ±0.4 pp NIE MOŻE być wyliczony z pobranych badań — musi być
   udokumentowanym marginesem konwencji regulacyjnej, zacytowanym z realnego źródła (np.
   wytyczna FDA/EMA non-inferiority dla leków przeciwcukrzycowych), z URL-em/cytatem, PRZED
   pobraniem CT.gov.
6. Pełna bramka przed pushem: eslint, tsc, oba suite'y, build, `node scripts/repro-demo.mjs`.

## DONE

- `docs/A1_GLP1_SUBSTITUTION_REAL_DATASET_AND_EXPERIMENT.md` w repo.
- ≥3 pinowane, zweryfikowane aktywności ChEMBL GLP-1R per lek (semaglutyd, liraglutyd).
- ≥2 pinowane, zweryfikowane badania CT.gov per lek z opublikowanym wynikiem HbA1c.
- Werdykt potencji + werdykt skuteczności + kontrole negatywne realnie policzone, Tautology Gate
  `MIXED_TEST`, replay MATCH.
- `docs/RISKS.md`/`docs/MASTER_PRIORITY_GENESIS.md` zaktualizowane z realnym dowodem.

---

## B1 (ULEZ/polityka publiczna) — JUŻ NIE ODROCZONE, przypisane w osobnym prompcie

Użytkownik podjął dokładnie tę decyzję, na którą czekała ta sekcja: budować
`causalInference.ts` jako nowy, ogólny, reużywalny moduł (analogiczny do `beliefRevision.ts`/
`tautologyGate.ts`), osobnym zadaniem, nie jako jednorazowy hack wciśnięty pod ULEZ. Pełny
prompt: `docs/prompts/C1-B1-ulez-no2-adjudication.md`, pakiet badawczy Qwena zapisany dosłownie
w `docs/B1_ULEZ_NO2_ADJUDICATION_REAL_DATASET_AND_EXPERIMENT.md`. Zaczynać PO zamknięciu CMS
Z→μμ i tego zadania (A1) — kolejność z `docs/prompts/README.md`.
