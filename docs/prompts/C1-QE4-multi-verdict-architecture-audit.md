# PROMPT DLA C1 — audyt architektury: eksperyment z wieloma niezależnymi werdyktami (Phase 6 po QE4)

Gałąź: `claude/genesis-autonomous-completion-95bt4e`. **`git fetch` pierwsze.** QE4 (C2, commit
`dab127d0`, scalone na `f4818cf4`) jest GREEN i w pełni zweryfikowane — **to zadanie NIE jest
kontynuacją nauki QE4** (liczby, progi, bootstrap, werdykty P1-P4 zostają NIETKNIĘTE), tylko
audytem architektury, który C2 zidentyfikował PRZY OKAZJI wykonania QE4.

**PRIORYTET: to zadanie idzie PRZED B1** (`docs/prompts/C1-B1-ulez-no2-adjudication.md`) — po
zamknięciu tego, co aktualnie masz w toku (CMS Z→μμ / A1, jeśli jeszcze niedomknięte). Decyzja
architektoniczna stąd wpływa na to, jak B1 (adjudykacja DiD z wieloma metrykami/oknami) i
przyszłe QE5-7 będą reprezentowane — lepiej zdecydować raz, niż budować B1 na tymczasowym
kształcie i przepisywać.

## Stan wejściowy QE4 (skrót — PEŁNY raport jest w repo, nie w tym prompcie)

Commit `dab127d0`/scalenie `f4818cf4`: zbiór przypięty i zweryfikowany hashem (29 plików),
prerejestracja zamknięta przed analizą, P1-P4 wykonane, `resultFingerprint: a6578ae8`,
deterministyczny replay MATCH, `repro-demo` 23/23, frontend 472/472 plików / 5233/5234 testów
(1 udokumentowany skip), backend 371/371, tsc/build/eslint czyste. Status naukowy: QE4 to
REPRODUKCJA/REPLIKACJA, NIE odkrycie; P1/P2/P3 = MODEL_DEPENDENT, P4 = niezależne
przeliczenie kontrolne; wszystkie cztery ścieżki dowodowe sklasyfikowane `EMPIRICAL_TEST`;
algebra estymatora osobno `CONSISTENCY_CHECK`, waga 0. Pełne źródło:
`docs/QE4_EVIDENCE.md`/`docs/QE4_PREREGISTRATION.md`.

## LUKA ARCHITEKTONICZNA ZIDENTYFIKOWANA PRZEZ C2

QE4 ma JEDEN zbiór zewnętrzny z N NIEZALEŻNYMI, WSPÓŁRZĘDNYMI werdyktami: P1, P2, P3, P4.
Istniejąca architektura NIE MA czystej, reużywalnej ścieżki dla kształtu:

```
JEDEN EKSPERYMENT
→ WSPÓLNY ZBIÓR/PROWENIENCJA
→ WIELE NIEZALEŻNYCH WERDYKTÓW
→ EVIDENCE
→ FINGERPRINT
→ REPLAY
→ REWIZJA PRZEKONANIA
→ NEXT QUESTION
```

**Zidentyfikowane ograniczenia, do zweryfikowania samodzielnie, nie do przyjęcia na wiarę:**
- `core/biotechData/externalAnchor.ts` (`ExternalAnchor`/`AnchorRunResult`) = JEDNA obserwacja /
  JEDNA predykcja na kotwicę — `EXTERNAL_ANCHORS` to lista NIEZALEŻNYCH kotwic, nie N werdyktów
  NAD JEDNYM wspólnym zbiorem.
- `core/discovery/discoveryCase.ts` (`DiscoveryCaseSpec`/`DiscoveryHypothesis`/
  `DiscoveryConclusion`) — sztywno typowane dwuramienne (`baselineScenario`/`variantScenario`,
  `EpidemicCityParams`, `HospitalCapacityParams`) — semantyka epidemiologiczna dwóch ramion, nie
  ogólny kontener na N werdyktów.
- `scienceMemory.ts` / `SavedExperiment` nie ma czystego szwu na tę architekturę (do
  zweryfikowania: sprawdź faktyczny kształt `SavedExperiment` i miejsca, gdzie QE1-3/P2.3/QE4
  faktycznie się zapisują).
- Ścieżka `EvidenceShowcaseScreen`/`#/evidence` jeszcze nie reprezentuje QE4.
- QE4 dociera do normalnej weryfikacji WYŁĄCZNIE przez
  `core/repro/reproEntry.node.ts` + `scripts/repro-demo.mjs` — czyli obok głównych ścieżek
  Evidence/Provenance, nie przez nie.

**Punkt orientacyjny (nie wniosek — to Twój audyt), gdzie faktycznie żyje sztywny kształt QE4:**
`core/biotechData/qe4BrydgesAnalysis.ts` — `Qe4AnalysisResult` ma pola `p1`/`p2`/`p3`/`p4` NAZWANE
z góry, `Qe4HypothesisResult.id: 'P1'|'P2'|'P3'|'P4'` to zamknięta unia. Dokładnie ten kształt nie
uogólni się na eksperyment z inną liczbą werdyktów (QE5 może mieć dwa, przyszły eksperyment
siedem) bez kopiowania pliku.

## TWOJE ZADANIE

Zaudytuj repozytorium i wyznacz NAJMNIEJSZE REUŻYWALNE ROZWIĄZANIE ARCHITEKTONICZNE.

**NIE** twórz typu wyniku specyficznego dla QE4.
**NIE** wymyślaj nowego UI tylko po to, żeby wyświetlić QE4.
**NIE** modyfikuj obliczeń naukowych.
**NIE** zmieniaj wyników P1–P4, prerejestracji, progów, bootstrapu ani semantyki werdyktów.

### Najpierw odpowiedz

1. Czy istniejący reużywalny kontrakt już rozwiązuje większość tego problemu?
2. Jaka jest minimalna brakująca abstrakcja?
3. Czy może obsłużyć QE4 ORAZ przyszłe QE5/QE6/QE7?
4. Czy może obsłużyć ogólne, przyszłe eksperymenty wielohipotezowe (np. B1's DiD/ITS/
   synthetic-control z wieloma oknami/metrykami — patrz `C1-B1-ulez-no2-adjudication.md`)?
5. Jaka jest najmniejsza wymagana implementacja?
6. Jaki byłby koszt/ryzyko architektoniczne?

### Opcje decyzji

`REUSE` · `EXTEND` · `NEW REUSABLE ABSTRACTION` · `BLOCKED`

**Implementuj DOPIERO po audycie architektury.** Najpierw audyt i jawna decyzja
REUSE/EXTEND/NEW REUSABLE ABSTRACTION/BLOCKED, zapisana i uzasadniona — dopiero potem kod.

### Jeśli implementacja jest uzasadniona

- Zachowaj WSZYSTKIE istniejące wyjścia QE4 DOKŁADNIE takie, jakie są.
- Testy najpierw (prawdziwe czerwone, nie pozorne).
- Deterministyczny fingerprint/replay dla wyniku naukowego musi pozostać IDENTYCZNY
  (`resultFingerprint: a6578ae8` nie może się zmienić).
- Zachowaj semantykę Tautology Gate.
- Zintegruj z Evidence/Provenance TYLKO jeśli istniejąca architektura wspiera to czysto —
  w przeciwnym razie nazwij to jako pozostały brak, nie na siłę.
- Zero hacków specyficznych wyłącznie dla QE4.

## ZASADY TWARDE

1. Dowód = komenda + wyjście + hash commita.
2. `git fetch` przed KAŻDYM pushem — inne sesje pchają równolegle.
3. Zero nowego typu wyniku dla QE4, zero nowego UI, zero zmiany w obliczeniach naukowych —
   patrz sekcja „NIE" wyżej.
4. Jeśli audyt wychodzi `BLOCKED` — zostaw to jako `BLOCKED` z nazwanym powodem, nie
   wymuszaj implementacji, żeby coś dostarczyć.

## NA KONIEC PODAJ

- decyzję architektoniczną (REUSE/EXTEND/NEW REUSABLE ABSTRACTION/BLOCKED) i uzasadnienie,
- minimalny projekt (jeśli implementowany),
- dokładnie zmienione pliki,
- testy,
- stan regresji,
- czy QE4 pozostaje naukowo identyczne (fingerprint/replay bez zmian),
- pozostałe blokery,
- hash commita,
- pełne wyniki bramki jakości.

## STATUS (tylko jeden z czterech)

`GREEN` / `GREEN WITH KNOWN NON-BLOCKER` / `BLOCKED` / `FAIL`
