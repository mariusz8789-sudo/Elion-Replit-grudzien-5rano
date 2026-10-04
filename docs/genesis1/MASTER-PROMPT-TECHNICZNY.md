# GENESIS — MASTER PROMPT TECHNICZNY

**Wersja:** 1.0 · **Data:** niedziela 4 października 2026 · **Status:** OBOWIĄZUJĄCY
**Podlega:** MASTER FINAL DIRECTIVE (4 X 2026, 01:39Z). Ten dokument nie dodaje nowych celów — zamienia dyrektywę właściciela w instrukcję wykonawczą dla sztabu inżynierów (bio, backend, frontend, ML, bezpieczeństwo, edukacja).

Czytaj razem z: `docs/genesis1/ONE-BRAIN.md`, `docs/genesis1/RECOVERY-MATRIX.md`, `docs/benchmark/TIME-TO-DISCOVERY.md`, `docs/genesis1/PUBLIC-DEMO-SECURITY.md`, `docs/DECISIONS.md`.

---

## 0. Jak ma działać Claude (i każdy agent) w tym repozytorium

1. **Jeden mózg.** Istnieje jedna kanoniczna pętla naukowa (ResearchRun). Nowa funkcja to nowa *warstwa nad* tą pętlą, nigdy druga pętla, druga baza dowodów, drugi Replay ani drugi silnik wiedzy. Pilnuje tego 40 testów w `packages/backend/src/architecturalInvariants.test.mjs`; jeśli zmiana je psuje, to zmiana jest zła, nie test.
2. **Najpierw szukaj, potem pisz.** Przed implementacją: `grep` po repo, po gałęziach, po `docs/`, po artefaktach. Jeśli coś już jest — rozszerz. Jeśli nie ma — zapisz to jawnie (np. `ORIGINAL_ZOSIA_IMPLEMENTATION_NOT_FOUND`) i dopiero projektuj.
3. **Preregistracja przed wynikiem.** Każdy eksperyment, który może wyjść na naszą korzyść, dostaje zamrożoną prereg (hash, zamknięta przewidywana odpowiedź) **w osobnym commicie, przed napisaniem runnera**. Zamrożonej prereg nie edytuje się nigdy.
4. **Czego nie da się uczciwie wyliczyć, to `UNKNOWN`.** Nigdy 0%, nigdy „brak różnic", nigdy oszacowanie podane jak pomiar. Brak silnika = `BLOCKED_CODE`. Brak danych = `BLOCKED_DATA`. Brak sieci = `BLOCKED_EXTERNAL`. Brak podstawy naukowej = `BLOCKED_SCIENCE`. Licencja = `BLOCKED_BY_LICENSE`.
5. **Nie zmieniaj nauki, żeby test przeszedł.** Czerwony test to albo błąd kodu, albo jawna decyzja naukowa w `docs/DECISIONS.md`. Trzeciej drogi nie ma.
6. **Falsyfikacja jest produktem.** D-144, D-153, D-154/156, D-162, D-164 to zapisane, przegrane zakłady. Taki zapis jest wartością, nie wstydem. Nigdy nie reinterpretuj wyniku po fakcie.
7. **Jeden agent = jedno worktree.** Nigdy kilku agentów w jednym katalogu.
8. **Zero wdrożeń bez decyzji właściciela.** Merge ≠ deploy.
9. **Zakazane w kodzie, UI, raportach i publikacjach:** operacyjne procedury syntezy (ilości, temperatury, czasy, stężenia, kolejność czynności), twierdzenia „AI wynalazła lek", „zwalidowane", „podpisany dowód" (do czasu klucza CSRN), „zero skutków ubocznych", oraz pełna struktura / SMILES / InChI potencjalnie patentowalnego kandydata w materiale publicznym.

---

## 1. Tryby odbiorcy — jedna nauka, różne warstwy

Nie ma „wersji dla dzieci" silnika. Jest **jeden model naukowy** i **wymienna warstwa pedagogiczna**. Technicznie: `AudienceMode` jest parametrem warstwy prezentacji i narracji, nigdy parametrem obliczeń.

```ts
type AudienceMode =
  | 'CHILD'        // klasy 1–5, przewodnik Zosia, nauka przez zabawę
  | 'STUDENT'      // szkoła średnia / studia, lżejszy przewodnik, pełny proces
  | 'LAYPERSON'    // dorosły bez wykształcenia kierunkowego
  | 'TEACHER'      // prowadzi lekcję, nie prowadzi badania
  | 'SCIENTIST'    // pełna pętla ResearchRun, Evidence, Replay, falsyfikacja
  | 'AUDITOR';     // tylko weryfikacja: Evidence, Replay, prowieniencja
```

**Niezmiennik (do pokrycia testem):** `AudienceMode` nie może pojawić się w żadnym module, który liczy, dokuje, przewiduje, pieczętuje Evidence albo wylicza Replay. Tryb wolno czytać wyłącznie warstwie narracji, UI i formatowania liczb. Jeśli wynik zależy od trybu, to jest to błąd produktu — dziecko i naukowiec patrzą na **ten sam wynik**, opisany innym językiem.

Co się zmienia między trybami: język, liczba kroków pokazanych naraz, głębokość wzorów, ilość założeń i błędów pomiarowych na ekranie, obecność głosu przewodnika, długość filmu, rodzaj zadania. Co się **nie** zmienia: wartość liczbowa, etykieta epistemiczna, status BLOCKED, treść Evidence.

Istniejąca baza, na której to się buduje: `packages/frontend/src/core/guide/` — `narrationModel.ts` (poziomy `EXPLORER | SCIENTIST | AUDITOR`, beaty `intro…verdict`, PL/EN, fakty brane z prawdziwego wyniku runu), `guideMachine.ts`, `guideRuntime.ts`, `voiceEngine.ts` (D-119, stan OFF→READY→SPEAKING⇄PAUSED). **To jest kanoniczna warstwa przewodnika. Nowych nie wolno tworzyć** — `GuideLevel` rozszerza się do `AudienceMode`, a nie duplikuje.

---

## 2. Zosia — przewodnik dla dzieci (klasy 1–5)

**Ustalenie faktyczne, podane uczciwie:** przeszukano repo i gałęzie. Ciąg „zosia" występuje w kodzie **w jednym miejscu**: `packages/frontend/src/core/guide/voiceEngine.ts:156`, jako preferencja nazwy polskiego głosu TTS w systemie. **Postaci, scenariusza ani dialogów Zosi w repozytorium nie ma.** Zapis obowiązujący: `ORIGINAL_ZOSIA_IMPLEMENTATION_NOT_FOUND` — przy jednoczesnym stwierdzeniu, że *warstwa przewodnika istnieje i działa* (sekcja 1). Zosia jest więc **personą do zbudowania na istniejącej warstwie**, nie modułem do odtworzenia. Jeśli właściciel wskaże nagranie, film lub gałąź z oryginałem, persona ustępuje oryginałowi.

Wymagania na personę `CHILD` (Zosia):
- Wiek odbiorcy: klasy 1–5. Prosty język, krótkie zdania, bez żargonu, bez wzorów.
- Pętla: **zapytaj → pobaw się → zmień jedną rzecz → zobacz wynik → wyjaśnij dlaczego → spróbuj jeszcze raz.**
- Pokazuje prawdziwy proces naukowy uproszczonym językiem: pytanie → zgadywanie (hipoteza) → sprawdzenie → co nam wyszło → czy to obalone → co dalej.
- **Nigdy nie zastępuje nauczyciela jako autorytetu.** Mówi „sprawdźmy", nie „wiem".
- Nigdy nie przedstawia modelu jako obserwacji. Etykieta epistemiczna jest widoczna także w trybie dziecka, w języku dziecka („to umiemy zmierzyć" / „to na razie tylko nasz pomysł").
- Zero mechanik uzależniających: brak serii, brak presji czasu, brak nagród za częstotliwość wejść.

Przewodnik dla studentów to **osobna persona na tej samej warstwie** — lżejszy, dowcipny, nie dziecięcy, bez infantylizacji; żartuje z trudności materiału, nigdy z nauki. Persona jest danymi (teksty, ton, tempo), nie kodem.

---

## 3. Nauczyciel i naukowiec — rozdzielone technicznie

To nie są dwa motywy jednego ekranu. To **dwie role z osobnymi uprawnieniami, osobnymi trasami i osobnymi danymi**.

| | `TEACHER` | `SCIENTIST` |
|---|---|---|
| Cel | prowadzi lekcję | prowadzi badanie |
| Trasy | `/teacher/**` | `/research/**` |
| Czyta | klasy, uczniowie, postęp, zadania, quizy, replay pracy ucznia | ResearchRun, Evidence, Replay, prereg, kandydaci |
| Tworzy | lekcję, zadanie, quiz, zakres tematu | prereg, run, Evidence Pack, handoff |
| **Czego nie może** | uruchomić kanonicznego ResearchRun, zobaczyć surowych danych innego naukowca, zmienić progu naukowego | zobaczyć danych osobowych ucznia, zobaczyć klasy, przypisać zadania |
| Dane uczniów | tylko własna klasa, minimum danych | **brak dostępu** |

Egzekucja: role w RBAC (`owner > admin > editor > viewer` już istnieje w `store.mjs` — role edukacyjne są **dodatkowe**, additive migration), plus autoryzacja na każdym endpointcie, plus test architektoniczny: żaden moduł `teacher/*` nie importuje modułu `research/*` i odwrotnie. Rozdzielenie, którego nie pilnuje test, nie istnieje.

Prywatność dziecka: konta zarządzane przez szkołę, minimum zbieranych danych, brak profilowania, brak publicznego ujawnienia danych ucznia, eksport i usunięcie na żądanie, przegląd zgodności regionalnej **przed** startem.

---

## 4. Forum naukowe — globalna społeczność

Cel: miejsce, gdzie naukowiec, laik i samouk rozmawiają o nauce i o konkretnych wynikach Genesis.

Niezmienniki:
1. **Post może cytować wynik Genesis tylko przez identyfikator runu i hash Evidence.** Treść naukowa nie jest przepisywana do posta — jest linkowana, więc nie da się rozejść się z dowodem.
2. Każdy cytowany wynik nosi swoją **etykietę epistemiczną** i swój status BLOCKED. Nie da się zacytować wyniku tak, żeby wyglądał mocniej niż jest.
3. **Brama IP** przed publikacją: potencjalnie patentowalna struktura, SMILES, InChI ani pakiet chemiczny nie mogą trafić do posta. Publiczna wersja to: identyfikator kandydata, fingerprint struktury, mechanizm, metodyka, wyniki, dowód Replay.
4. Brama bezpieczeństwa publicznej powierzchni (`packages/backend/src/security/publicSurface.mjs`, D-168) obowiązuje **każdą** treść forum tak samo jak odpowiedź API.
5. Tryb odbiorcy widać przy autorze (naukowiec / nauczyciel / samouk / uczeń) — żeby porada była czytana w kontekście, nie żeby budować hierarchię.
6. Moderacja i ochrona nieletnich: dzieci nie mają dostępu do forum globalnego; mają wyłącznie przestrzeń klasową prowadzoną przez nauczyciela.
7. Zero mechanik uzależniających, zero rankingów popularności jako miary prawdy.

Status: **PROJEKT, nie zaimplementowane.** Nie wchodzi do obecnej rundy przedwdrożeniowej (MASTER FINAL DIRECTIVE: żadnych nowych dużych funkcji przed domknięciem). Wchodzi jako pierwsza pozycja rundy następnej.

---

## 5. Priorytety naukowe: łańcuch DNA i lek przeciwnowotworowy

Oba podlegają **dokładnie tym samym bramkom**, które dały „NO" przy odchudzaniu (D-164). Żadnych wyjątków dla tematu, który brzmi atrakcyjniej.

### 5.1 Co obowiązuje z góry
- Bramka zwycięzcy (`packages/backend/src/campaign/candidateWinnerGate.mjs`) jest **agnostyczna wobec celu** — test nie przepuszcza reguły, która nazywa receptor albo chorobę. To znaczy, że dla onkologii i dla DNA **nie trzeba jej przepisywać**, tylko wypełnić danymi.
- Cztery możliwe werdykty: `REJECTED_SAFETY_VETO`, `NO_CANDIDATE`, `LEAD_FOR_FURTHER_VALIDATION`, `COMPUTATIONAL_CANDIDATE`. **`FINAL WINNER` nie jest wartością, którą ten kod umie zwrócić.**
- Twarde weto bezpieczeństwa wykonuje się **pierwsze** i zwiera obwód: jedna fatalna właściwość odrzuca kandydata niezależnie od skuteczności.
- Nigdy nie wolno napisać ani zasugerować, że Genesis „wymyśliło lek na raka". Dopuszczalne sformułowanie: *weryfikowalne obliczeniowe odkrywanie leków*; wynik to kandydat obliczeniowy z pakietem dowodowym i przekazaniem do chemika.

### 5.2 Łańcuch DNA — pierwszy etap
Pytanie musi być zamknięte i falsyfikowalne, nie „badaj DNA". Minimalny sensowny pierwszy etap:
1. **Reprezentacja i tożsamość sekwencji:** kanoniczny zapis, hash, prowieniencja źródła (jak dla cząsteczek: bez źródła nie ma tożsamości).
2. **Jeden mierzalny endpoint obliczeniowy** z publicznym zbiorem referencyjnym i zamrożonym podziałem train/test **oddalonym** (tak jak D-162 dla chemii — podział losowy jest bezwartościowy).
3. **Domena stosowalności zmierzona, nie założona.** Jeśli model nie umie ocenić sekwencji oddalonej od zbioru treningowego, to nie umie nominować niczego — i tak trzeba to zapisać.
4. Silniki: co jest zainstalowane, co jest `BLOCKED_CODE`, co `BLOCKED_BY_LICENSE`. Bez zgadywania.

### 5.3 Onkologia — kolejność kosztowa, ta sama co przy odchudzaniu
- **Ścieżka A:** substancje istniejące i repozycjonowanie — najtaniej, jest materiał referencyjny.
- **Ścieżka B:** znane rodziny / mechanizmy z istniejącymi danymi.
- **Ścieżka C:** cząsteczka nowa obliczeniowo — **wyłącznie** gdy A i B zawiodą, i z najostrzejszym rygorem (każde kryterium blokujące).
- Cel małocząsteczkowy wymaga **obronnej struktury i obronnego miejsca wiązania**. Brak struktury w stanie aktywnym z ligandem małocząsteczkowym = `BLOCKED_SCIENCE`, a nie dokowanie „na czymkolwiek". Lekcja z D-154/156/159.
- Bezpieczeństwo w onkologii ma inną skalę tolerancji niż w odchudzaniu — i to musi być **zapisaną decyzją w `docs/DECISIONS.md`**, a nie cichym poluzowaniem progów w konfiguracji.
- `LAB_VALUE_OF_INFORMATION` przed każdym eksperymentem laboratoryjnym. Najtańszy eksperyment o najwyższej wartości decyzyjnej wygrywa z najbardziej efektownym.

### 5.4 Ograniczenie realne, które trzeba powiedzieć wprost
Ten kontener nie ma wyjścia do sieci (ChEMBL, PubChem, ClinicalTrials, RCSB, Crossref — wszystkie odrzucone na proxy). Dopóki to się nie zmieni, **oba priorytety kończą się na `BLOCKED_EXTERNAL`** na pierwszym kroku pozyskania danych. Budowa bramek, reprezentacji i testów ma sens teraz; obietnica wyniku nie ma.

---

## 6. „Niech myśli sam" — autonomia w granicach preregistracji

Czego wolno uczyć system: generowania hipotez, projektowania eksperymentu, wyboru następnego kroku, czytania literatury, składania raportu, przygotowania przekazania do laboratorium. Docelowo **AUTOMATION COVERAGE ≥ 90%**.

Czego systemowi **nigdy** nie wolno robić samemu:
- ocenić własnego wyniku jako sukcesu (bramka jest zewnętrzna wobec generatora),
- zmienić zamrożonej preregistracji ani progu,
- nazwać kandydata zwycięzcą,
- opublikować czegokolwiek na zewnątrz,
- zlecić pracy laboratoryjnej,
- wdrożyć się na produkcję.

Mechanizm: **generator proponuje, bramka osądza, i to są dwa osobne moduły z osobnymi testami.** Autonomia bez tego rozdziału to tylko szybsze oszukiwanie samego siebie. Dowód, że to działa, już mamy: D-164 — generator wyprodukował 714 cząsteczek, bramka powiedziała `NO`, a zamrożona przewidywana odpowiedź agenta została zapisana jako **błędna**.

Każdy krok procesu nosi klasę: `AUTOMATED` / `HUMAN_APPROVAL_ONLY` / `HUMAN_REQUIRED` / `EXTERNAL_PHYSICAL_ACTION`, a każdy `HUMAN_REQUIRED` nosi `WHY_HUMAN_REQUIRED`. Bez mocnego uzasadnienia — automatyzuj. Jeśli człowiek robi coś, co Genesis zrobiłoby poprawnie, odtwarzalnie, pod Evidence i bezpiecznie, to jest **błąd produktu**.

---

## 7. Siedem etykiet epistemicznych

Na każdym świecie, filmie, teorii, wizualizacji i wyniku: `EXPERIMENTALLY_CONFIRMED`, `OBSERVATION_SUPPORTED`, `THEORETICAL_MODEL`, `HYPOTHETICAL`, `SIMULATION`, `EDUCATIONAL_APPROXIMATION`, `CONCEPTUAL_VISUALIZATION`.

Reżyseria na poziomie Hollywood — nauka **nigdy** na poziomie Hollywood. Piękna grafika nie udaje dowodu. Uczeń musi w każdej chwili wiedzieć, co **wiemy**, a co **modelujemy**.

---

## 8. Definition of Done dla każdej zmiany

1. `npx eslint . --ignore-pattern '.claude/**'` — 0 błędów (`npm run lint` łapie worktrees, nie używać).
2. `node --test` na dotkniętych plikach + regresja na sąsiednich.
3. `git diff --check` czysty.
4. Nowa zmienna środowiskowa → wpis w `.env.example` (pilnuje `envContract.test.mjs`).
5. Zmiana frontendu → `tsc -b`.
6. Nowy niezmiennik architektoniczny → test w `architecturalInvariants.test.mjs`, pokazany jako czerwony po wstrzyknięciu drugiej ścieżki.
7. Decyzja naukowa → wpis w `docs/DECISIONS.md` z własnym ID (jedna wspólna przestrzeń numerów).
8. Zero liczb i statusów zahardkodowanych w UI — wszystko z backendu albo `UNKNOWN`.
9. Commit po polsku albo po angielsku, zawsze opisowy; brak force-push; brak zipów.
10. PR dopiero po zielonym CI; merge dopiero po pełnym CI; **deploy dopiero po decyzji właściciela.**

---

## 9. Czego ten dokument nie robi

Nie otwiera nowej rundy prac. Obecna runda to **FINAL PRE-DEPLOY CLOSURE** — domknąć to, co jest, przetestować, przygotować kandydata wydania i **zatrzymać się** przed wdrożeniem. Forum, DNA i onkologia są tu opisane jako obowiązujący kierunek i kontrakt techniczny, nie jako zadania do rozpoczęcia dzisiaj.
