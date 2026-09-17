# PROMPT DLA QWENA — szukanie realnego zbioru zdolnego domknąć ŚCISŁY test QE4 (pakiet badawczy, NIE kod)

## Kontekst

C2 przeprowadził realne rozpoznanie (`docs/QE4_REAL_DATASET_AND_EXPERIMENT.md` w repo — przeczytaj
go w CAŁOŚCI, to jest punkt startowy, nie powtarzaj tej pracy). Werdykt: zbiór Brydgesa (Zenodo
2527010) jest realny, pobieralny, i wystarcza na wycinek strukturalny (P1–P4, `MIXED_TEST`) — ale
NIE wystarcza na ŚCISŁY test QE4: prawo powierzchni (stan gapowany) albo nachylenie log-CFT (stan
krytyczny) z NIEZALEŻNIE wyznaczoną centralną ładunkiem c. Dane Brydgesa to stany DYNAMICZNE po
quenchu w modelu z oddziaływaniem dalekozasięgowym — nie ma tam kanału niezależnego c ani przerwy
energetycznej stanu podstawowego.

Sekcja 19 dokumentu C2 („Alternative Datasets") już wskazała dwa kandydaty BEZ zlokalizowanego
publicznego archiwum: Kaufman et al. 2016 (1D Bose–Hubbard, entropia splątania stanu podstawowego/
quenchu, punkt c=1 nadciekły) i Islam et al. 2015 (dwukopiowa entropia splątania). **Twoje zadanie:
sprawdzić to twierdzenie ponownie, głębiej, i poszerzyć poszukiwanie na inne grupy/platformy —
nie tylko potwierdzić brak, ale aktywnie poszukać alternatyw, których C2 mógł nie sprawdzić.**

## Co dokładnie musi mieć kandydujący zbiór, żeby domknąć ŚCISŁY test QE4

1. **Stan PODSTAWOWY (albo bardzo blisko niego przez adiabatyczne przygotowanie)**, nie stan
   dynamiczny/po quenchu — inaczej pojęcie „prawo powierzchni" (dla stanu gapowanego) czy
   „nachylenie log-CFT" (dla stanu krytycznego) nie ma ugruntowanego sensu teoretycznego.
2. **Lokalny Hamiltonian 1D** (sąsiedzkie oddziaływanie albo szybko zanikające), NIE
   dalekozasięgowy jak w Brydges — inaczej porównanie do przewidywań CFT/prawa powierzchni jest
   niepewne teoretycznie, nawet gdyby dane były dostępne.
3. **NIEZALEŻNY kanał wyznaczający c (dla przypadku krytycznego) albo przerwę energetyczną (dla
   przypadku gapowanego)** — czyli metoda pomiaru/wyznaczenia INNA niż ta, z której liczona jest
   entropia splątania. Przykład z fizyki teoretycznej: c można wyznaczyć ze skalowania ciepła
   właściwego albo z widma wzbudzeń, NIE z tej samej krzywej entropii, którą test ma sprawdzać —
   inaczej porównanie jest identycznością przez konstrukcję (dokładnie pułapka, którą repo już
   raz uniknęło przy wyborze NASA NSSDCA zamiast NASA Exoplanet Archive dla kotwicy Keplera —
   przeczytaj `docs/DECISIONS.md` D-022 żeby zrozumieć DOKŁADNIE ten wzorzec rozumowania, zanim
   ocenisz kandydatów).
4. **Publicznie pobieralny, z DOI albo stałym identyfikatorem, bez wymogu kluczy/rejestracji** —
   dokładnie jak zbiór Brydgesa.
5. **Surowe dane** (nie tylko wykresy w PDF-ie publikacji) — żeby dało się NIEZALEŻNIE przeliczyć
   entropię, a nie tylko zaufać liczbie z tabeli autorów.

## Gdzie szukać — konkretne tropy, nie ogólne „poszukaj w internecie"

- **Google Scholar / arXiv**: cytowania artykułu Kaufman 2016 (Science 353, 794) i Islam 2015
  (Nature 528, 77) — sprawdź, czy PÓŹNIEJSZA praca tej samej grupy (Greiner lab, Harvard) albo
  grupy pokrewnej opublikowała dane repliki tego eksperymentu z otwartym zbiorem (czasem dane
  pojawiają się przy powtórzeniu/rozszerzeniu eksperymentu, nie przy oryginalnej publikacji).
- **Repozytoria instytucjonalne**: Harvard Dataverse, MPQ (Max Planck) open data, sprawdź strony
  grup Greiner (Harvard), Bloch (MPQ), Schauss — czy mają politykę data-availability z linkiem do
  Zenodo/Figshare/OSF dla eksperymentów sieci optycznych 1D.
- **Programy Rydberg-atom array** (Lukin lab, Harvard/MIT): Bernien et al. 2017 (Nature 551, 579,
  „Probing many-body dynamics on a 51-atom quantum simulator") i prace pokrewne o MBL/entanglement
  w łańcuchach Rydberga — sprawdź czy mają publiczny zbiór surowych danych pomiarowych z
  entropią/korelacjami, i czy dotyczą stanu podstawowego/adiabatycznego przygotowania (nie tylko
  dynamiki po quenchu jak Brydges).
- **Google Quantum AI / IBM Quantum**: oba publikują czasem surowe dane eksperymentów wielociałowych
  (np. „observation of time-crystalline order" Google 2021/2022, prace o MBL na nadprzewodzących
  kubitach) z publicznymi repozytoriami (często GitHub + Zenodo). Sprawdź, czy któryś eksperyment
  dotyczy 1D stanu podstawowego z niezależnym kanałem c/gap.
- **Zenodo/Figshare/OSF wyszukiwanie bezpośrednie**: frazy typu "entanglement entropy ground state
  1D chain dataset", "randomized measurement entanglement DOI", "matrix product state experimental
  verification data" — sprawdź wyniki spoza pierwszej strony, filtruj po typie zbioru (dataset, nie
  publikacja).

## Co zrobić, jeśli NIC nie spełnia wszystkich pięciu warunków (bardzo prawdopodobne)

To jest uczciwy, użyteczny wynik — NIE traktuj braku jako porażki raportu. Zamiast tego:
1. **Ranguj częściowych kandydatów** — który warunek konkretnie zawodzi dla każdego (np. „ma stan
   podstawowy i lokalny Hamiltonian, ale brak niezależnego kanału c" vs „ma niezależny kanał c, ale
   dane niepubliczne — wymaga zapytania do autorów").
2. **Dla najlepszego częściowego kandydata**: napisz DOKŁADNY, konkretny request-for-data — do kogo
   (e-mail/strona grupy), co dokładnie prosić (które pliki, jaki format), i czy to realistyczne w
   rozsądnym czasie (autorzy akademiccy czasem odpowiadają na proste prośby o dane do repliki).
3. **Rozważ SYNTETYCZNĄ alternatywę, ale NAZWIJ JĄ WPROST jako taką**: czy istnieje publicznie
   dostępny wynik DOKŁADNEJ diagonalizacji (exact diagonalization) znanego modelu krytycznego 1D
   (np. XXZ w punkcie krytycznym, gdzie c jest znane ANALITYCZNIE z teorii, nie z pomiaru) — to NIE
   jest eksperyment, ale mogłoby posłużyć jako `CONSISTENCY_CHECK`-owy test implementacji Genesis
   (podobnie jak QE7 w równoległym zadaniu C3), nigdy jako empiryczna kotwica. Zaznacz to
   rozróżnienie wprost, dokładnie tak, jak zrobiłeś to dla algebry w swoim pakiecie QE4-QE7.

## Format odpowiedzi

Jeden dokument Markdown: `docs/QE4_GROUND_STATE_DATASET_SEARCH.md` (nadpisz tylko jeśli plik już
istnieje I jest Twój wcześniejszy szkic — sprawdź `git log -- docs/QE4_GROUND_STATE_DATASET_SEARCH.md`
najpierw). Sekcje: (1) Executive Summary z werdyktem BLOCKED/PARTIAL/FOUND, (2) tabela kandydatów
sprawdzonych z pięcioma warunkami zaznaczonymi TAK/NIE/NIEZNANE dla każdego, (3) najlepszy częściowy
kandydat + konkretny plan pozyskania (request do autorów albo dlaczego to nierealistyczne),
(4) SELF-AUDIT sekcja identyczna w duchu do tej w dokumencie C2 (VERIFIED BY WEB / SOURCE-SUPPORTED
/ MODEL-DEPENDENT / NOT VERIFIED / NOT AVAILABLE / NOT RUN).

Nie pisz kodu. Nie pobieraj niczego. Nie fabrykuj URL-i ani DOI, których nie zweryfikowałeś realnym
wyszukiwaniem — jeśli nie możesz potwierdzić, że coś istnieje, napisz `[NIEZWERYFIKOWANE]`, nie
podawaj linku „na wyczucie".
