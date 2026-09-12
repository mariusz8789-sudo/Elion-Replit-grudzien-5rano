# PROMPT DLA QWENA — obserwable dla QE4–QE7 (pakiet badawczy, NIE kod)

## Kontekst, który musisz znać zanim zaczniesz

QE1, QE2 i QE3 z `knowledge/quantum.md` przeszły właśnie pełny cykl przez
prawdziwy `StrategyRun` w Genesis (strategia PARAMETER → `inquiryLoop` →
model Fabric `quantum-entanglement-measures`, kod w
`packages/frontend/src/core/quantum/entanglementMeasures.ts` i
`entanglementStateRunner.ts`, dochodzenia w
`packages/frontend/src/core/agent/entanglementInquiry.ts`). To zadziałało,
bo dla każdej z tych trzech hipotez istniała: (a) rodzina stanów o ZAMKNIĘTEJ
formie, (b) liczba, którą Genesis już umie policzyć dokładnie, (c) gałka
preparatyki, przy której pomiar bywa bezużyteczny i taka, przy której
rozstrzyga.

QE4–QE7 tego NIE mają — i nie wolno ich pisać tak, jakby miały. Twoje
zadanie to NIE napisanie kodu. To napisanie PAKIETU BADAWCZEGO — specyfikacji
na tyle konkretnej, żeby ktoś (C1, C2 albo C3) mógł ją przepuścić przez tę
samą procedurę, jaką przeszły QE1–QE3, bez zgadywania.

## Twardy warunek odbioru (dlaczego jest twardy)

QE1 pokazał, jak łatwo zbudować „test", który nie może nie przejść: granica
Tsirelsona 2√2 jest analitycznym sufitem liczonej algebry, więc uruchomienie
kalkulatora i stwierdzenie braku przekroczenia jest TAUTOLOGIĄ, nie dowodem.
To samo dotyczyło nierówności CKW w QE2. Obie rzeczy zostały NAZWANE wprost w
kodzie (`QE1_NOT_MODELLED`, `QE2_NOT_MODELLED` w `entanglementInquiry.ts`) —
inaczej pakiet byłby nieuczciwy.

**Dla każdej z QE4–QE7 musisz jawnie napisać, która część twierdzenia jest
tautologią algebry, którą Genesis by liczył, a która jest naprawdę
falsyfikowalna na tym podłożu.** Pakiet bez tego punktu jest
nieprzyjmowalny i zostanie odesłany.

## Co dla KAŻDEJ z czterech hipotez musi zawierać pakiet

Dla QE4, QE5, QE6, QE7 — każda osobno:

1. **Obserwabla**: konkretna liczba, którą da się policzyć z solverów, które
   Genesis JUŻ MA (`core/quantumState.ts` — pełny wektor stanu 2ⁿ, bramki,
   CNOT, pomiar; `entanglementMeasures.ts` — Schmidt, entropia von Neumanna
   i Rényi, concurrence, negatywność/log-negatywność, PPT, CKW, CCNR), albo
   z JEDNEJ wąsko zdefiniowanej, uzasadnionej dodanej funkcji. NIE wolno
   zakładać nowego podsystemu (np. pełnego stosu QKD, solvera JT gravity,
   symulatora CFT) — jeśli hipoteza tego wymaga, napisz to wprost jako
   BLOCKED i powiedz, czego brakuje, zamiast projektować nowy silnik.
2. **Rodzina stanów/układów o ZAMKNIĘTEJ formie** — coś sprawdzalne
   arytmetycznie (jak Werner, GHZ⊕W, Horodecki 3⊗3 w QE1–QE3), nie losowe
   ani czarnoskrzynkowe.
3. **Gałka preparatyki/sondy**: ustawienie, przy którym pomiar jest
   BEZUŻYTECZNY (jak pełna depolaryzacja w QE1/QE3 czy czysty |W⟩ w QE2) —
   i takie, przy którym rozstrzyga. Obie muszą być POLICZONE, nie zgadnięte
   — pokaż liczby, tak jak w tabelach QE1–QE3 w `MASTER_PRIORITY_GENESIS.md`.
4. **Co jest tautologią, a co falsyfikowalne** (patrz wyżej) — bez wyjątku.
5. **Pasmo zgodności i dlaczego akurat takie** — jak `QE1_AGREEMENT_TOLERANCE`
   itd.: pasmo decyduje o wyniku, więc musi być uzasadnione, nie dobrane
   post factum.

## Specyfika czterech hipotez — na co uważać

- **QE4** (prawo powierzchni + log-CFT w symulatorze 1D): Genesis nie ma
  solvera CFT ani symulatora sieci spinowej 1D poza tym, co jest w
  `quantumState.ts` (pełny wektor stanu, więc N kubitów ograniczone do
  małych N). Jeśli obserwabla wymaga N rzędu dziesiątek+ kubitów (żeby
  zobaczyć skalowanie logarytmiczne), powiedz to wprost — to może być
  BLOCKED na tym substracie, nie coś do symulowania na siłę.
- **QE5** (PLOB ogranicza QKD bez repeaterów): PLOB to twierdzenie o
  pojemności kanału kwantowego (Pirandola-Laurenza-Ottaviani-Banchi). Genesis
  nie ma modelu kanału z transmitancją/szumem ani protokołu QKD. Sprawdź, czy
  granicę PLOB da się wyrazić jako funkcję negatywności/log-negatywności już
  policzonej stanów Wernera/izotropowych, które `entanglementMeasures.ts` już
  umie liczyć — jeśli tak, to jest to prawdziwa obserwabla; jeśli wymaga
  osobnego modelu kanału, nazwij to jako brakujący komponent.
- **QE6** (formuła wysp odtwarza krzywą Page'a): wymaga modelu JT gravity
  albo przynajmniej losowego stanu Haara do policzenia krzywej Page'a
  entropii. Genesis ma dokładną arytmetykę macierzy gęstości, ale nie ma
  losowego samplowania Haara ani modelu czarnej dziury/wysp. Sprawdź, czy da
  się to zrobić NA MAŁYCH N (kilka kubitów) jako czysto matematyczna
  demonstracja krzywej Page'a (średnia entropia podukładu losowego stanu
  czystego) — to jest policzalne bez żadnej fizyki czarnych dziur, tylko
  jako fakt o macierzach losowych. Jeśli tak, opisz to jako obserwablę; jeśli
  pakiet chce prawdziwego JT gravity, nazwij to BLOCKED.
- **QE7** (splątanie makro nie łamie monogamii/SSA): SSA (strong
  subadditivity) i monogamia CKW są TWIERDZENIAMI algebry, którą Genesis
  liczy dokładnie — więc żaden run nie może ich sfalsyfikować, dokładnie jak
  CKW w QE2. Jedyna uczciwa treść tej hipotezy na tym substracie to
  WERYFIKACJA IMPLEMENTACJI (czy repo poprawnie liczy SSA na losowych/
  granicznych przypadkach), nie test fizyki. Napisz to wprost.

## Format odpowiedzi

Jeden dokument Markdown, cztery sekcje (QE4/QE5/QE6/QE7), każda z pięcioma
punktami wyżej. Gdzie hipoteza jest w całości albo częściowo BLOCKED na
obecnym substracie Genesis — powiedz to i zatrzymaj się tam, zamiast
projektować nowy silnik. Krótsza, uczciwa odpowiedź „to jest BLOCKED, oto
dlaczego" jest WIĘCEJ warta niż rozbudowana specyfikacja fikcyjnego solvera.

Nie pisz kodu. Nie uruchamiaj niczego. To jest wejście dla następnej sesji
Claude, która przepuści to przez tę samą procedurę co QE1–QE3 i wykona
zweryfikowanie przez rzeczywiste uruchomienie.
