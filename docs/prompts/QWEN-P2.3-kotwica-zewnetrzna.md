# PROMPT DLA QWENA — pakiet badawczy pod P2.3 (kotwica w danych zewnętrznych)

To pakiet BADAWCZY, nie kod. Nie pisz implementacji, nie uruchamiaj niczego.
Wynik = jeden dokument Markdown, który następna sesja Claude przepuści przez
realne wykonanie.

## DLACZEGO to jest najważniejsza rzecz w kolejce

Genesis mierzy dziś przede wszystkim WŁASNĄ spójność: solvery, prowieniencja,
falsyfikacja i replay działają, ale obserwacje, wobec których hipotezy są testowane,
pochodzą z tych samych modeli. Zapisane wprost jako ryzyko `R-005` w `docs/RISKS.md`.
Jedna kotwica w realnych, publicznych danych zmienia narrację z „mierzymy swoją
spójność" na „mierzymy rzeczywistość" — i to jest zdanie, które ma stać w pierwszym
akapicie wniosku grantowego.

## CZEGO POTRZEBUJĘ — dokładnie

Jeden eksperyment end-to-end, w którym **obserwacja NIE pochodzi z symulacji Genesis**.
Dla wybranego źródła podaj:

1. **Źródło i dostęp BEZ KLUCZY.** Publiczne, stabilne API/pliki, bez rejestracji i
   bez tokenów (twarde wymaganie: sekret w repo jest zabroniony, a dodawanie nowego
   sekretu hostingu pod jedną kotwicę to zły stosunek kosztu do korzyści).
   Kandydaci do rozważenia — sprawdź, który REALNIE nie wymaga klucza i ma stabilny
   kontrakt: SDO/HEK (zdarzenia słoneczne), NOAA SWPC (indeksy geomagnetyczne, klasy
   flar), USGS (katalog trzęsień), CERN Open Data, NASA Exoplanet Archive.
   Podaj dokładny URL, format odpowiedzi i przykładowy rekord.
2. **Wielkość, którą Genesis JUŻ umie policzyć.** Nie projektuj nowego silnika.
   Musi istnieć model w Experiment Fabric (`packages/frontend/src/core/experimentFabric/router.ts`,
   58 modeli) albo w backendzie, który produkuje liczbę porównywalną z tym, co daje
   źródło. Nazwij model i pole wyjściowe.
3. **Predykcja PRZED danymi.** Co Genesis przewiduje, policzone z modelu, zanim
   obserwacja zostanie wczytana. Podaj wartość albo dokładny przepis na jej policzenie.
4. **Pasmo zgodności i skąd ono się bierze.** Niepewność pomiarowa źródła (nie
   „przyjmijmy ±10%") — z dokumentacji źródła albo z rozrzutu samych danych.
   Pasmo decyduje o falsyfikacji, więc musi mieć uzasadnienie zewnętrzne.
5. **Warunek falsyfikacji.** Jaki odczyt oznacza, że predykcja Genesis jest FAŁSZYWA.
   Jeśli nie potrafisz podać takiego odczytu, ten eksperyment jest bezużyteczny jako
   kotwica — powiedz to i zmień kandydata.
6. **Co to POZOSTAJE tautologią.** Punkt obowiązkowy. Przy QE1 (granica Tsirelsona)
   okazało się, że uruchomienie kalkulatora QM i brak przekroczenia 2√2 to tautologia
   algebry, nie dowód empiryczny. Napisz wprost, która część proponowanego eksperymentu
   jest testem rzeczywistości, a która tylko sprawdzeniem własnej arytmetyki.
7. **Stabilność i cytowalność.** Czy dane są wersjonowane/niezmienne (do przypięcia
   i policzenia SHA-256), czy zmienne w czasie. Genesis potrzebuje odcisku, żeby replay
   dał MATCH — źródło, które cicho zmienia historyczne rekordy, nie nadaje się.
8. **Licencja i warunki użycia.** Jednoznacznie: czy wolno przypiąć próbkę do repo.

## FORMAT
Jeden dokument, sekcje 1–8 dla JEDNEGO rekomendowanego źródła + krótka tabela
odrzuconych kandydatów z powodem odrzucenia (najczęściej: wymaga klucza / brak
stabilnych odcisków / brak wielkości policzalnej przez Genesis / licencja).

Jeden dobrze uzasadniony kandydat jest wart więcej niż pięć opisanych pobieżnie.

## DRUGI, MNIEJSZY DELIVERABLE — P2.2

Dostarcz pełny, NIESTRESZCZONY tekst `SOLAR_MIND_MASTER_REPORT.md` i
`SOLAR_MIND_EXPANSION.md` w formie gotowej do zapisania w `knowledge/`, z nagłówkiem
`RESEARCH ONLY / NOT RUN` i adnotacją statusu przy KAŻDEJ hipotezie H051–H056.
Te raporty nigdy nie weszły do repo i żaden ich wniosek nie został uruchomiony —
dopóki tego nie ma jako danych, H051–H056 nie mogą stać się problemem pętli.
