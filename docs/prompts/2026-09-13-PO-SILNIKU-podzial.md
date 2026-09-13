# PO ZAMKNIĘCIU SILNIKA (2026-09-13) — co zostało, kto co bierze

Wejście: `166665f`. Silnik odkryć działa i jest w stałej bramce (`repro-demo` 35/35).

## CO JEST ZROBIONE I UDOWODNIONE RUNTIME

| Element | Dowód |
|---|---|
| Kanonizacja dwóch implementacji P0-2 | D-026; odciski 7 rund identyczne przed/po |
| Gramatyka modeli (generowanie, mutacja, rodowód, fingerprint) | `modelSpace.ts`, 21 testów |
| Residual → strukturalna diagnoza → nowy model | `residualStructure.ts`, 10 testów |
| Generyczna autonomiczna kampania | `discoveryCampaign.ts` |
| CASE A (kwantowa, Brydges) | wzrost logarytmiczny, stop, replay |
| CASE B (astronomia, NASA NSSDC) | **III prawo Keplera, nachylenie 1.49987** |
| §15: model B z residuum wygrywa | gramatyka bez LOG → silnik odbudowuje `log(x)` i wygrywa |
| Anty-HARK w każdej rundzie | 3 kampanie, wszystkie rundy nienaruszone |

## CZEGO SILNIK NADAL NIE POTRAFI (uczciwie)

1. **Gramatyka jest zadeklarowana.** „Otwartość" znaczy: poza wyliczenie (przez residuum),
   nie poza gramatykę. Silnik nie wymyśli członu, którego nie ma w słowniku baz.
2. **Planer skoruje tylko rozróżnialność.** Koszt/ryzyko/wykonalność są NIEOBECNE, nie zaślepione —
   na przypiętym zbiorze każda pozostała obserwacja kosztuje tyle samo. EIG pozostaje BLOCKED.
3. **Brak ekranu.** Żaden widok w przeglądarce nie pokazuje kampanii. Wszystko przez `repro-demo`.
4. **Jeden niezależny wymiar.** Modele są `y = f(x)`. Brak wielu zmiennych, brak interakcji.
5. **`PracticalCandidate.proposedProtocol` zawsze null** na obu obecnych domenach — bo obie są
   opisowe, nie interwencyjne. To poprawne, ale nieprzetestowane na domenie interwencyjnej.

## PODZIAŁ PRAC

### C2 — dokończ swoje P0, potem A1
1. **Cross-campaign dedup** (`docs/prompts/C2-cross-campaign-dedup.md`) — wciąż nietknięte,
   zero implementacji w kodzie. Sprawdź najpierw sam grepem, nie wierz dokumentom.
2. **P0-4 truth-schema**: `INFERENCE` i `CONFLICTING_EVIDENCE` nie istnieją nigdzie w repo.
   Rozszerz `core/epistemicReliability.ts` (już zaczęta konsolidacja), NIE twórz szóstego słownika.
3. **A1 (GLP-1)** wg `docs/prompts/C1-A1-glp1-substitution.md` + handoff Qwena. Uwaga: po
   zbudowaniu silnika A1 może iść przez `CampaignLaboratory` jako trzeci adapter — to byłaby
   pierwsza domena INTERWENCYJNA, czyli pierwszy realny test `PracticalCandidate`.
   **Granica medyczna egzekwowana w warstwie wyniku, nie w promptcie.**

### C3 — P0-1 i wielowymiarowość
1. **P0-1: człony skorowania planera** — dołóż do `discoveryCampaign.ts` człony, które da się
   uczciwie policzyć: `Redund` (podobieństwo do już wykonanych), `Fals` (ile żywych modeli dany
   eksperyment mógłby obalić). **EIG NIE.** Nie dokładaj `Cost`/`Risk`, dopóki nie ma domeny,
   gdzie eksperymenty realnie różnią się kosztem.
2. **Wielowymiarowe modele** — `ModelTerm` operuje dziś na jednym `x`. Rozszerz na `x[]`
   z członami interakcyjnymi. To odblokowuje domeny biologiczne (A1, genomika), gdzie nic
   nie zależy od jednej zmiennej.
3. NIE buduj drugiej pętli. `discoveryCampaign.ts` jest kanoniczny.

### Qwen — Atlas: co bierzemy, co odkładamy
Atlas v1.0 przyjęty jako materiał zwiadowczy. **Werdykt wdrożeniowy:**

**BIERZEMY TERAZ (jest na czym pracować, dane publiczne, w zasięgu silnika):**
- §11 Next Question Engine spec — **już zaimplementowane**, dokładnie jak napisałeś:
  bez EIG, na rozróżnialności. Zgodność potwierdzona w kodzie.
- #58 Trojan composition–orbit (Lucy) — realny kandydat na CZWARTY adapter laboratorium,
  jeśli PDS faktycznie wystawi spektra. **Zadanie dla Ciebie: zweryfikuj, czy bundle Lucy
  jest naprawdę publiczny i pobieralny — dziś masz to jako `[UNVERIFIED]`.** Bez tego nie ruszamy.
- #67 hyperoxidation energy ratio — ale to NIE jest zadanie dla silnika, tylko protokół polowy.
  Odkładamy do czasu realnych pomiarów.

**ODKŁADAMY (nie ma czego implementować):**
- Time/causality (T1–T12), dark matter, quantum gravity, Top 100 w większości — to mapy
  otwartych problemów, nie kampanie wykonywalne na przypiętych danych. Wartościowe jako
  kierunek, bezwartościowe jako zadanie na dziś.
- Mikroskop jako „oczy Genesis" — sensowny kierunek, ale wymaga sprzętu. Nie kod.

**TWOJE NASTĘPNE ZADANIE (zamiast szerokości — głębokość na jednym):**
Weź JEDEN problem z Atlasu, który ma **realnie pobieralny publiczny zbiór danych**
i da się go wyrazić jako `y = f(x)` albo `y = f(x₁..xₙ)`, i dostarcz pakiet w formacie
`docs/prompts/`: dokładny URL, licencja, sha256 jeśli znasz, kształt danych, co jest osią X,
co osią Y, jakie modele konkurują, co by je sfalsyfikowało. Jeden taki pakiet jest wart
więcej niż sto problemów bez danych.
